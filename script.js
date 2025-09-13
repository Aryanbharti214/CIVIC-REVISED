// Add this line at the top of your script to update the footer date
document.addEventListener('DOMContentLoaded', function() {
    const date = new Date();
    const options = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    document.getElementById('lastUpdated').textContent += date.toLocaleDateString('en-IN', options) + ' (IST)';
    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
    }
});

// --------------------- SUPABASE CONFIG: REPLACE THESE ---------------------
const SUPABASE_URL = 'https://gvdfqcljvkkisnvoubkw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2ZGZxY2xqdmtraXNudm91Ymt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0NzM2ODQsImV4cCI6MjA3MzA0OTY4NH0.accgwK0kOLpq1AD6NqraDNSAyxrLwCoxyxfMBJAacIk';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Caching DOM elements for efficiency ---
const dom = {
    pages: ['page0', 'userLogin', 'adminLogin', 'page3', 'page4'],
    adminError: document.getElementById('adminError'),
    adminId: document.getElementById('adminId'),
    adminPass: document.getElementById('adminPass'),
    issueDesc: document.getElementById('issueDesc'),
    issueCat: document.getElementById('issueCat'),
    locationTxt: document.getElementById('locationTxt'),
    imgUpload: document.getElementById('imgUpload'),
    startCamBtn: document.getElementById('startCamBtn'),
    removeImgBtn: document.getElementById('removeImgBtn'),
    imgVideo: document.getElementById('imgVideo'),
    imgCamControls: document.getElementById('imgCamControls'),
    takePhotoBtn: document.getElementById('takePhotoBtn'),
    stopCamBtn: document.getElementById('stopCamBtn'),
    imgCanvas: document.getElementById('imgCanvas'),
    imgPreview: document.getElementById('imgPreview'),
    vidUpload: document.getElementById('vidUpload'),
    startVidRec: document.getElementById('startVidRec'),
    stopVidRec: document.getElementById('stopVidRec'),
    removeVidBtn: document.getElementById('removeVidBtn'),
    vidPreview: document.getElementById('vidPreview'),
    audUpload: document.getElementById('audUpload'),
    startAudRec: document.getElementById('startAudRec'),
    stopAudRec: document.getElementById('stopAudRec'),
    removeAudBtn: document.getElementById('removeAudBtn'),
    audPreview: document.getElementById('audPreview'),
    submitMsg: document.getElementById('submitMsg'),
    userReports: document.getElementById('userReports'),
    allReports: document.getElementById('allReports'),
    statusChart: document.getElementById('statusChart'),
    sortDialog: document.getElementById('sortDialog'),
    sortBy: document.getElementById('sortBy'),
    sortOrder: document.getElementById('sortOrder'),
};

let reportMap = null;
let marker = null;
let selectedCoords = null;

function initializeReportMap() {
    if (reportMap) {
        reportMap.invalidateSize();
        return;
    }
    
    reportMap = L.map('map-picker').setView([25.5941, 85.1376], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(reportMap);

    marker = L.marker([25.5941, 85.1376], { draggable: true }).addTo(reportMap);
    marker.bindPopup("Drag me to the problem location, or click on the map.").openPopup();

    reportMap.on('click', function(e) {
        selectedCoords = e.latlng;
        marker.setLatLng(selectedCoords);
        marker.getPopup().setContent(`Location selected at: ${selectedCoords.lat.toFixed(4)}, ${selectedCoords.lng.toFixed(4)}`).openOn(reportMap);
    });
    
    marker.on('dragend', function(event){
        selectedCoords = event.target.getLatLng();
        marker.setLatLng(selectedCoords);
        marker.getPopup().setContent(`Location selected at: ${selectedCoords.lat.toFixed(4)}, ${selectedCoords.lng.toFixed(4)}`).openOn(reportMap);
    });
}

// --------------------- Helpers ---------------------
function dataURLtoFile(dataurl, filename) {
    if (!dataurl || typeof dataurl !== 'string' || !dataurl.includes(',')) {
        console.error("Invalid data URL provided.");
        return null;
    }
    
    const arr = dataurl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    
    if (!mimeMatch || mimeMatch.length < 2) {
        console.error("Could not parse MIME type from data URL.");
        return null;
    }
    
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--) u8arr[n] = bstr.charCodeAt(n);
    
    return new File([u8arr], filename, { type: mime });
}

async function uploadFileToBucket(path, file) {
  const { data, error } = await supabaseClient.storage.from('reports').upload(path, file, { upsert: false });
  if (error) throw error;
  return data;
}

async function getSignedUrlForPath(path, expires = 60 * 60) {
  const { data, error } = await supabaseClient.storage.from('reports').createSignedUrl(path, expires);
  if (error) throw error;
  return data?.signedUrl || null;
}

function getPublicUrlForPath(path) {
  const { data } = supabaseClient.storage.from('reports').getPublicUrl(path);
  return data?.publicUrl || null;
}

// --------------------- Navigation ---------------------
function gotoPage(id) {
    dom.pages.forEach(p => {
        document.getElementById(p).classList.add('hidden');
    });
    document.getElementById(id).classList.remove('hidden');

    if (id === 'page3') {
        renderUserReports();
        setTimeout(() => initializeReportMap(), 100);
    }
    if (id === 'page4') {
        sortReports();
        updateCharts();
    }
}

// --------------------- Google Sign-in + Supabase auth exchange ---------------------
let currentUserEmail = null;
let currentUserId = null;

function decodeJwt(token){
    try{
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g,'+').replace(/_/g,'/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c=>'%' + ('00'+c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        return JSON.parse(jsonPayload);
    } catch(e) { return null; }
}

async function handleCredentialResponse(response){
    const payload = decodeJwt(response.credential);
    if(!payload || !payload.email){ alert(translations[currentLang].signInFailedAlert); return; }

    try {
        await supabaseClient.auth.signInWithIdToken({ provider: 'google', token: response.credential }).catch(e=>console.warn(e));
        const { data: sessData } = await supabaseClient.auth.getSession();
        const supUser = sessData?.session?.user;
        currentUserEmail = supUser?.email ?? payload.email;
        currentUserId = supUser?.id ?? null;
        localStorage.setItem('civic_current_user', currentUserEmail);
        if (currentUserId) localStorage.setItem('civic_user_id', currentUserId);
        gotoPage('page3');
    } catch (err) {
        console.error(err);
        alert(translations[currentLang].signInErrorAlert);
    }
}

supabaseClient.auth.onAuthStateChange((event, session) => {
    const user = session?.user ?? null;
    if(user) {
        currentUserEmail = user.email;
        currentUserId = user.id;
        localStorage.setItem('civic_current_user', currentUserEmail);
        localStorage.setItem('civic_user_id', currentUserId);
    } else {
        currentUserEmail = null;
        currentUserId = null;
        localStorage.removeItem('civic_current_user');
        localStorage.removeItem('civic_user_id');
    }
});

// --------------------- Admin Login ---------------------
async function adminLogin(){
    const id = dom.adminId.value.trim();
    const pass = dom.adminPass.value.trim();
    if (id === 'civic01') {
        try {
            const email = 'civic01@yourdomain.com';
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
            if (error) throw error;
            dom.adminError.classList.add('hidden');
            dom.adminId.value = '';
            dom.adminPass.value = '';
            gotoPage('page4');
        } catch (e) {
            console.error(e);
            dom.adminError.classList.remove('hidden');
        }
    } else {
        dom.adminError.classList.remove('hidden');
    }
}

// --------------------- Toggle Password Visibility ---------------------
function togglePasswordVisibility() {
    const passInput = dom.adminPass;
    const toggleBtn = document.querySelector('.password-toggle-btn');
    if (passInput.type === 'password') {
        passInput.type = 'text';
        toggleBtn.textContent = '🙈';
    } else {
        passInput.type = 'password';
        toggleBtn.textContent = '👁';
    }
}

// --------------------- Media Capture ---------------------
let camStream=null, vidRecorder=null, vidChunks=[], audRecorder=null, audChunks=[];

dom.startCamBtn.onclick=async()=>{
    try {
        camStream=await navigator.mediaDevices.getUserMedia({video:true});
        dom.imgVideo.srcObject=camStream;
        dom.imgVideo.classList.remove('hidden');
        dom.imgCamControls.classList.remove('hidden');
    } catch (error) {
        console.error("Error accessing camera:", error);
        alert(translations[currentLang].cameraErrorAlert);
    }
};
dom.takePhotoBtn.onclick=()=>{
    dom.imgCanvas.width=dom.imgVideo.videoWidth; dom.imgCanvas.height=dom.imgVideo.videoHeight;
    dom.imgCanvas.getContext('2d').drawImage(dom.imgVideo,0,0);
    dom.imgPreview.src=dom.imgCanvas.toDataURL('image/png'); dom.imgPreview.classList.remove('hidden');
    dom.removeImgBtn.classList.remove('hidden');
};
dom.stopCamBtn.onclick=()=>{
    if(camStream){camStream.getTracks().forEach(t=>t.stop()); camStream=null;}
    dom.imgVideo.classList.add('hidden'); dom.imgCamControls.classList.add('hidden');
};
dom.removeImgBtn.onclick=()=>{dom.imgPreview.classList.add('hidden'); dom.removeImgBtn.classList.add('hidden');};

dom.startVidRec.onclick=async()=>{
    try {
        const stream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});
        vidRecorder=new MediaRecorder(stream); vidChunks=[];
        vidRecorder.ondataavailable=e=>vidChunks.push(e.data);
        vidRecorder.onstop=()=>{dom.vidPreview.src=URL.createObjectURL(new Blob(vidChunks,{type:'video/webm'})); dom.vidPreview.classList.remove('hidden'); dom.removeVidBtn.classList.remove('hidden');};
        vidRecorder.start();
        dom.stopVidRec.classList.remove('hidden'); dom.startVidRec.classList.add('hidden');
    } catch (error) {
        console.error("Error accessing video recorder:", error);
        alert(translations[currentLang].videoRecorderErrorAlert);
    }
};

dom.stopVidRec.onclick=()=>{ if(vidRecorder){vidRecorder.stop(); vidRecorder=null;} dom.stopVidRec.classList.add('hidden'); dom.startVidRec.classList.remove('hidden'); };
dom.removeVidBtn.onclick=()=>{dom.vidPreview.classList.add('hidden'); dom.removeVidBtn.classList.add('hidden');};

dom.startAudRec.onclick=async()=>{
    try {
        const stream=await navigator.mediaDevices.getUserMedia({audio:true});
        audRecorder=new MediaRecorder(stream); audChunks=[];
        audRecorder.ondataavailable=e=>audChunks.push(e.data);
        audRecorder.onstop=()=>{dom.audPreview.src=URL.createObjectURL(new Blob(audChunks,{type:'audio/webm'})); dom.audPreview.classList.remove('hidden'); dom.removeAudBtn.classList.remove('hidden');};
        audRecorder.start();
        dom.stopAudRec.classList.remove('hidden'); dom.startAudRec.classList.add('hidden');
    } catch (error) {
        console.error("Error accessing audio recorder:", error);
        alert(translations[currentLang].audioRecorderErrorAlert);
    }
};

dom.stopAudRec.onclick=()=>{ if(audRecorder){audRecorder.stop(); audRecorder=null;} dom.stopAudRec.classList.add('hidden'); dom.startAudRec.classList.remove('hidden'); };
dom.removeAudBtn.onclick=()=>{dom.audPreview.classList.add('hidden'); dom.removeAudBtn.classList.add('hidden');};

// --------------------- Submit, Render, and other functions... ---------------------
async function submitReport() {
    const current = localStorage.getItem('civic_current_user') || currentUserEmail;
    const userId = localStorage.getItem('civic_user_id') || currentUserId;

    if (!current) {
        alert(translations[currentLang].signInFirstAlert);
        gotoPage('userLogin');
        return;
    }
    const desc = dom.issueDesc.value.trim();
    const cat = dom.issueCat.value;
    const loc = dom.locationTxt.value.trim();
    if (!desc || !cat || !loc) {
        alert(translations[currentLang].fillRequiredFieldsAlert);
        return;
    }

    let img_path = null;
    let vid_path = null;
    let aud_path = null;
    
    try {
        if (!dom.imgPreview.classList.contains('hidden')) {
            const imgFile = dataURLtoFile(dom.imgPreview.src, `report_${Date.now()}_image.png`);
            img_path = `images/${userId}/${Date.now()}_image.png`;
            await uploadFileToBucket(img_path, imgFile);
        } else if (dom.imgUpload.files.length > 0) {
            img_path = `images/${userId}/${Date.now()}_${dom.imgUpload.files[0].name}`;
            await uploadFileToBucket(img_path, dom.imgUpload.files[0]);
        }
        
        if (!dom.vidPreview.classList.contains('hidden')) {
            const vidBlob = new Blob(vidChunks, {type: 'video/webm'});
            const vidFile = new File([vidBlob], `report_${Date.now()}_video.webm`, {type: 'video/webm'});
            vid_path = `videos/${userId}/${Date.now()}_video.webm`;
            await uploadFileToBucket(vid_path, vidFile);
        } else if (dom.vidUpload.files.length > 0) {
            vid_path = `videos/${userId}/${Date.now()}_${dom.vidUpload.files[0].name}`;
            await uploadFileToBucket(vid_path, dom.vidUpload.files[0]);
        }
        
        if (!dom.audPreview.classList.contains('hidden')) {
            const audBlob = new Blob(audChunks, {type: 'audio/webm'});
            const audFile = new File([audBlob], `report_${Date.now()}_audio.webm`, {type: 'audio/webm'});
            aud_path = `audios/${userId}/${Date.now()}_audio.webm`;
            await uploadFileToBucket(aud_path, audFile);
        } else if (dom.audUpload.files.length > 0) {
            aud_path = `audios/${userId}/${Date.now()}_${dom.audUpload.files[0].name}`;
            await uploadFileToBucket(aud_path, dom.audUpload.files[0]);
        }
    } catch (e) {
        console.error('File upload failed', e);
        alert('File upload failed: ' + (e.message || e));
    }

    try {
        const repId = Date.now();
        const { error } = await supabaseClient.from('reports').insert([{
            id: repId,
            user_email: current,
            desc,
            cat,
            location: loc,
            lat: selectedCoords ? selectedCoords.lat : null,
            lng: selectedCoords ? selectedCoords.lng : null,
            img_url: img_path,
            vid_url: vid_path,
            aud_url: aud_path,
            status: 'Submitted'
        }]);
        if (error) throw error;

        dom.issueDesc.value = '';
        dom.issueCat.value = '';
        dom.locationTxt.value = '';
        selectedCoords = null;
        if (marker) { marker.setLatLng([25.5941, 85.1376]); }
        
        dom.imgPreview.classList.add('hidden');
        dom.vidPreview.classList.add('hidden');
        dom.audPreview.classList.add('hidden');
        dom.removeImgBtn.classList.add('hidden');
        dom.removeVidBtn.classList.add('hidden');
        dom.removeAudBtn.classList.add('hidden');
        dom.submitMsg.classList.remove('hidden');
        setTimeout(() => dom.submitMsg.classList.add('hidden'), 2000);
        renderUserReports();
        updateCharts();
    } catch (e) {
        console.error('DB insert failed', e);
        alert(translations[currentLang].saveReportFailedAlert + (e.message || e));
    }
    // Optimized submitReport snippet with the fix
// ... (rest of the submitReport function)

    try {
        // Handle image upload
        if (!dom.imgPreview.classList.contains('hidden') && dom.imgPreview.src) { // ADDED CHECK: make sure src is not empty
            const imgFile = dataURLtoFile(dom.imgPreview.src, `report_${Date.now()}_image.png`);
            img_path = `images/${userId}/${Date.now()}_image.png`;
            await uploadFileToBucket(img_path, imgFile);
        } else if (dom.imgUpload.files.length > 0) {
            // ... (rest of the image upload logic)
        }
        
        // ... (rest of the file upload logic for video and audio)

    } catch (e) {
        console.error('File upload failed', e);
        alert('File upload failed: ' + (e.message || e));
    }
// ... (rest of the submitReport function)
}

async function renderUserReports(){
    dom.userReports.innerHTML = `<p class="small">${translations[currentLang].loadingMessage}</p>`;
    const current = localStorage.getItem('civic_current_user') || currentUserEmail;
    if(!current){ dom.userReports.innerHTML = `<p class="small">${translations[currentLang].signInToViewReports}</p>`; return; }

    try {
        const { data: rows, error } = await supabaseClient.from('reports').select('*').eq('user_email', current).order('created_at', { ascending: false });
        if(error) throw error;
        dom.userReports.innerHTML = '';
        if (rows.length === 0) {
            dom.userReports.innerHTML = `<p class="small">You have not submitted any reports yet.</p>`;
            return;
        }
        for (const r of rows){
            let mediaHtml = '';
            if(r.img_url){
                let url = null;
                try { url = await getSignedUrlForPath(r.img_url, 3600); } catch(e){ url = getPublicUrlForPath(r.img_url); }
                if(url) mediaHtml += `<div style="margin-top:8px"><img src="${url}" class="preview"></div>`;
            }
            if(r.vid_url){
                let url = null;
                try { url = await getSignedUrlForPath(r.vid_url, 3600); } catch(e){ url = getPublicUrlForPath(r.vid_url); }
                if(url) mediaHtml += `<div style="margin-top:8px"><video src="${url}" controls class="preview"></video></div>`;
            }
            if(r.aud_url){
                let url = null;
                try { url = await getSignedUrlForPath(r.aud_url, 3600); } catch(e){ url = getPublicUrlForPath(r.aud_url); }
                if(url) mediaHtml += `<div style="margin-top:8px"><audio src="${url}" controls class="preview"></audio></div>`;
            }

            const inner = `
                <div class="report">
                    <p><b>${escapeHtml(r.cat)}</b> - ${escapeHtml(r.desc)}</p>
                    <p class="small"> ${escapeHtml(r.location || '')}</p>
                    ${mediaHtml}
                    <p class="small">${translations[currentLang].statusLabel}: <b>${translations[currentLang][`status${r.status.replace(/\s/g, '')}`] || escapeHtml(r.status)}</b></p>
                </div>
            `;
            dom.userReports.innerHTML += inner;
        }
    } catch(e){
        console.error(e);
        dom.userReports.innerHTML = `<p class="small error">${translations[currentLang].failedToLoadReports}</p>`;
    }
}

async function fetchAndRenderReports(sortBy = 'created_at', sortOrder = 'desc') {
    dom.allReports.innerHTML = `<p class="small">${translations[currentLang].loadingMessage}</p>`;
    try {
        const { data: rows, error } = await supabaseClient.from('reports').select('*').order(sortBy, { ascending: sortOrder === 'asc' });
        if (error) throw error;
        dom.allReports.innerHTML = '';
        if (rows.length === 0) {
            dom.allReports.innerHTML = `<p class="small">No reports have been submitted yet.</p>`;
            return;
        }
        for (const r of rows) {
            let mediaHtml = '';
            if (r.img_url) {
                let url = null;
                try { url = await getSignedUrlForPath(r.img_url, 3600); } catch (e) { url = getPublicUrlForPath(r.img_url); }
                if (url) mediaHtml += `<div style="margin-top:8px"><img src="${url}" class="preview"></div>`;
            }
            if (r.vid_url) {
                let url = null;
                try { url = await getSignedUrlForPath(r.vid_url, 3600); } catch (e) { url = getPublicUrlForPath(r.vid_url); }
                if (url) mediaHtml += `<div style="margin-top:8px"><video src="${url}" controls class="preview"></video></div>`;
            }
            if (r.aud_url) {
                let url = null;
                try { url = await getSignedUrlForPath(r.aud_url, 3600); } catch (e) { url = getPublicUrlForPath(r.aud_url); }
                if (url) mediaHtml += `<div style="margin-top:8px"><audio src="${url}" controls class="preview"></audio></div>`;
            }

            const inner = `
                <div class="report">
                    <p><b>${escapeHtml(r.cat)}</b> - ${escapeHtml(r.desc)}</p>
                    <p class="small"> ${escapeHtml(r.location || '')}</p>
                    ${mediaHtml}
                    <p class="small">${translations[currentLang].statusLabel}: <b>${translations[currentLang][`status${r.status.replace(/\s/g, '')}`] || escapeHtml(r.status)}</b></p>
                    <div class="controls" style="margin-top:8px; flex-wrap:wrap;">
                        <button class="btn" style="background-color: #28a745;" onclick="adminUpdate('${r.id}','Accepted')">${translations[currentLang].acceptBtn}</button>
                        <button class="btn" style="background-color: #ffc107; color: #333;" onclick="adminUpdate('${r.id}','In Progress')">${translations[currentLang].inProgressBtn}</button>
                        <button class="btn" style="background-color: #17a2b8;" onclick="adminUpdate('${r.id}','Resolved')">${translations[currentLang].resolvedBtn}</button>
                        <button class="btn btn-danger" onclick="adminDelete('${r.id}','${r.img_url || ''}','${r.vid_url || ''}','${r.aud_url || ''}')">${translations[currentLang].deleteBtn}</button>
                    </div>
                </div>
            `;
            dom.allReports.innerHTML += inner;
        }
    } catch (e) {
        console.error(e);
        dom.allReports.innerHTML = `<p class="small error">${translations[currentLang].failedToLoadReports}</p>`;
    }
}

function sortReports() {
    const sortBy = dom.sortBy.value;
    const sortOrder = dom.sortOrder.value;
    fetchAndRenderReports(sortBy, sortOrder);
}

function toggleSortDialog() {
    dom.sortDialog.classList.toggle('show');
}

async function adminUpdate(reportId,status){
    try {
        const { error } = await supabaseClient.from('reports').update({ status }).eq('id', reportId);
        if (error) throw error;
        sortReports(); 
        updateCharts();
    } catch(e) {
        alert(translations[currentLang].updateFailedAlert + (e.message || e));
    }
}

async function adminDelete(reportId, imgPath, vidPath, audPath){
    if(!confirm(translations[currentLang].deleteConfirmation)) return;
    try {
        const pathsToRemove = [];
        if(imgPath) pathsToRemove.push(imgPath);
        if(vidPath) pathsToRemove.push(vidPath);
        if(audPath) pathsToRemove.push(audPath);
        if(pathsToRemove.length){
            const { error: rmErr } = await supabaseClient.storage.from('reports').remove(pathsToRemove);
            if(rmErr) console.warn('could not remove some files:', rmErr);
        }
        const { error } = await supabaseClient.from('reports').delete().eq('id', reportId);
        if(error) throw error;
        sortReports(); 
        updateCharts();
    } catch(e){
        alert(translations[currentLang].deleteFailedAlert + (e.message||e));
    }
}

let chartObj=null;
async function updateCharts(){
    try {
        const { data: rows, error } = await supabaseClient.from('reports').select('status');
        if(error) throw error;
        const counts={'Submitted':0,'Accepted':0,'In Progress':0,'Resolved':0};
        rows.forEach(r=>{ if(counts[r.status]!==undefined) counts[r.status]++; });
        const ctx=dom.statusChart.getContext('2d');
        const data={labels:Object.keys(counts).map(key => translations[currentLang][`status${key.replace(/\s/g, '')}`]),datasets:[{label:translations[currentLang].reportsCountLabel,data:Object.values(counts),backgroundColor:['#6c757d','#28a745','#ffc107','#17a2b8']}]};
        if(chartObj) chartObj.destroy();
        chartObj=new Chart(ctx,{type:'bar',data:data,options:{responsive:true, plugins:{legend:{display:false}}, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }}});
    } catch(e){ console.error('charts', e); }
}

async function logoutUser(){ 
    await supabaseClient.auth.signOut(); 
    localStorage.removeItem('civic_current_user'); 
    localStorage.removeItem('civic_user_id'); 
    currentUserEmail=null; 
    currentUserId=null; 
    gotoPage('userLogin');
}

function escapeHtml(str){ return (str||'').toString().replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const theme = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
    localStorage.setItem('theme', theme);
}


const translations = {
    en: {
        portalTitle: 'Civic Portal',
        roleQuestion: ' Who are you?',
        roleInstruction: 'Choose role to continue',
        userButton: 'I am a User',
        adminButton: 'I am an Admin',
        userLoginTitle: ' Sign in with Google',
        userLoginInstruction: "After signing in you'll be taken to the user portal",
        backButton: '← Back',
        adminLoginTitle: ' Admin Login',
        adminIdPlaceholder: 'Admin ID',
        adminPassPlaceholder: 'Password',
        loginButton: 'Login',
        cancelButton: 'Cancel',
        adminLoginError: ' Incorrect ID or Password',
        reportIssueTitle: ' Report an Issue',
        issueDescPlaceholder: 'Describe the issue...',
        selectCategoryPlaceholder: 'Select category',
        catElectricity: 'Electricity',
        catWater: 'Water',
        catStreetlight: 'Streetlight',
        catRoad: 'Road',
        catSanitation: 'Sanitation',
        locationLabel: ' Problem location',
        locationPlaceholder: 'Enter location manually',
        imageLabel: ' Image (upload or capture)',
        startCamBtn: 'Start Camera',
        removeImageBtn: 'Remove Image',
        takePhotoBtn: 'Take Photo',
        stopCamBtn: 'Stop Camera',
        videoLabel: ' Video (upload or record)',
        startVidRec: 'Start Recording',
        stopVidRec: 'Stop Recording',
        removeVidBtn: 'Remove Video',
        audioLabel: ' Audio (upload or record)',
        startAudRec: 'Start Recording',
        stopAudRec: 'Stop Recording',
        removeAudBtn: 'Remove Audio',
        submitReportBtn: 'Submit Report',
        logoutBtn: 'Logout',
        reportSuccessMsg: ' Report submitted successfully!',
        myReportsTitle: ' My Reports',
        adminDashboardTitle: ' Admin Dashboard',
        analyticsTitle: ' Analytics',
        backToRoleBtn: 'Back to Role Select',
        loadingMessage: 'Loading...',
        signInToViewReports: 'Sign in to see your reports',
        statusLabel: 'Status',
        acceptBtn: 'Accept',
        inProgressBtn: 'In Progress',
        resolvedBtn: 'Resolved',
        deleteBtn: 'Delete',
        deleteConfirmation: 'Are you sure you want to delete this report?',
        reportsCountLabel: 'Reports Count',
        signInFailedAlert: 'Google sign-in failed.',
        signInErrorAlert: 'Sign-in error',
        cameraErrorAlert: 'Could not access camera. Please check permissions.',
        videoRecorderErrorAlert: 'Could not access camera/microphone. Please check permissions.',
        audioRecorderErrorAlert: 'Could not access microphone. Please check permissions.',
        signInFirstAlert: 'You must be signed in to submit a report.',
        fillRequiredFieldsAlert: 'Please fill in the description, category, and location.',
        imageUploadFailedAlert: 'Image upload failed: ',
        videoUploadFailedAlert: 'Video upload failed: ',
        audioUploadFailedAlert: 'Audio upload failed: ',
        saveReportFailedAlert: 'Could not save report: ',
        failedToLoadReports: 'Failed to load reports.',
        updateFailedAlert: 'Update failed: ',
        deleteFailedAlert: 'Delete failed: ',
        statusSubmitted: 'Submitted',
        statusAccepted: 'Accepted',
        statusInProgress: 'In Progress',
        statusResolved: 'Resolved',
        sortBtn: 'Sort Reports',
        sortByLabel: 'Sort By:',
        sortByDate: 'Date (Newest First)',
        sortByStatus: 'Status',
        sortByCategory: 'Category',
        sortOrderLabel: 'Order:',
        sortDesc: 'Descending',
        sortAsc: 'Ascending'
    },
    hi: {
        portalTitle: 'नागरिक पोर्टल',
        roleQuestion: ' आप कौन हैं?',
        roleInstruction: 'जारी रखने के लिए भूमिका चुनें',
        userButton: 'मैं एक उपयोगकर्ता हूँ',
        adminButton: 'मैं एक प्रशासक हूँ',
        userLoginTitle: ' गूगल से साइन इन करें',
        userLoginInstruction: 'साइन इन करने के बाद आपको उपयोगकर्ता पोर्टल पर ले जाया जाएगा',
        backButton: '← पीछे',
        adminLoginTitle: ' प्रशासक लॉगिन',
        adminIdPlaceholder: 'प्रशासक आईडी',
        adminPassPlaceholder: 'पासवर्ड',
        loginButton: 'लॉगिन',
        cancelButton: 'रद्द करें',
        adminLoginError: ' गलत आईडी या पासवर्ड',
        reportIssueTitle: ' एक समस्या की रिपोर्ट करें',
        issueDescPlaceholder: 'समस्या का वर्णन करें...',
        selectCategoryPlaceholder: 'श्रेणी चुनें',
        catElectricity: 'बिजली',
        catWater: 'पानी',
        catStreetlight: 'स्ट्रीटलाइट',
        catRoad: 'सड़क',
        catSanitation: 'स्वच्छता',
        locationLabel: ' समस्या का स्थान',
        locationPlaceholder: 'मैन्युअल रूप से स्थान दर्ज करें',
        imageLabel: ' छवि (अपलोड या कैप्चर करें)',
        startCamBtn: 'कैमरा शुरू करें',
        removeImageBtn: 'छवि हटाएँ',
        takePhotoBtn: 'फ़ोटो लें',
        stopCamBtn: 'कैमरा बंद करें',
        videoLabel: ' वीडियो (अपलोड या रिकॉर्ड करें)',
        startVidRec: 'रिकॉर्डिंग शुरू करें',
        stopVidRec: 'रिकॉर्डिंग बंद करें',
        removeVidBtn: 'वीडियो हटाएँ',
        audioLabel: ' ऑडियो (अपलोड या रिकॉर्ड करें)',
        startAudRec: 'रिकॉर्डिंग शुरू करें',
        stopAudRec: 'रिकॉर्डिंग बंद करें',
        removeAudBtn: 'ऑडिओ हटाएँ',
        submitReportBtn: 'रिपोर्ट सबमिट करें',
        logoutBtn: 'लॉगआउट',
        reportSuccessMsg: ' रिपोर्ट सफलतापूर्वक सबमिट हो गई!',
        myReportsTitle: ' मेरी रिपोर्टें',
        adminDashboardTitle: ' व्यवस्थापक डैशबोर्ड',
        analyticsTitle: ' विश्लेषण',
        backToRoleBtn: 'भूमिका चयन पर वापस जाएँ',
        loadingMessage: 'लोड हो रहा है...',
        signInToViewReports: 'अपनी रिपोर्ट देखने के लिए साइन इन करें',
        statusLabel: 'स्थिति',
        acceptBtn: 'स्वीकार करें',
        inProgressBtn: 'प्रगति में है',
        resolvedBtn: 'हल हो गया',
        deleteBtn: 'हटाएँ',
        deleteConfirmation: 'क्या आप वाकई इस रिपोर्ट को हटाना चाहते हैं?',
        reportsCountLabel: 'रिपोर्टों की संख्या',
        signInFailedAlert: 'गूगल साइन-इन विफल।',
        signInErrorAlert: 'साइन-इन त्रुटि',
        cameraErrorAlert: 'कैमरा तक नहीं पहुँचा जा सका। कृपया अनुमतियाँ जाँचें।',
        videoRecorderErrorAlert: 'कैमरा/माइक्रोफोन तक नहीं पहुँचा जा सका। कृपया अनुमतियाँ जाँचें।',
        audioRecorderErrorAlert: 'माइक्रोफोन तक नहीं पहुँचा जा सका। कृपया अनुमतियाँ जाँचें।',
        signInFirstAlert: 'रिपोर्ट सबमिट करने के लिए आपको साइन इन करना होगा।',
        fillRequiredFieldsAlert: 'कृपया विवरण, श्रेणी और स्थान भरें।',
        imageUploadFailedAlert: 'छवि अपलोड विफल: ',
        videoUploadFailedAlert: 'वीडियो अपलोड विफल: ',
        audioUploadFailedAlert: 'ऑडिओ अपलोड विफल: ',
        saveReportFailedAlert: 'रिपोर्ट सहेजी नहीं जा सकी: ',
        failedToLoadReports: 'रिपोर्ट लोड करने में विफल रहा।',
        updateFailedAlert: 'अपडेट विफल: ',
        deleteFailedAlert: 'हटाने में विफल: ',
        statusSubmitted: 'प्रस्तुत',
        statusAccepted: 'स्वीकृत',
        statusInProgress: 'प्रगति में',
        statusResolved: 'हल किया गया',
        sortBtn: 'रिपोर्ट्स छाँटें',
        sortByLabel: 'द्वारा छाँटें:',
        sortByDate: 'दिनांक (नवीनतम पहले)',
        sortByStatus: 'स्थिति',
        sortByCategory: 'श्रेणी',
        sortOrderLabel: 'क्रम:',
        sortDesc: 'अवरोही',
        sortAsc: 'आरोही'
    },
    mr: {
        portalTitle: 'नागरिक पोर्टल',
        roleQuestion: ' तुम्ही कोण आहात?',
        roleInstruction: 'पुढे जाण्यासाठी भूमिका निवडा',
        userButton: 'मी वापरकर्ता आहे',
        adminButton: 'मी प्रशासक आहे',
        userLoginTitle: ' Google सह साइन इन करा',
        userLoginInstruction: 'साइन इन केल्यानंतर तुम्हाला वापरकर्ता पोर्टलवर नेले जाईल',
        backButton: '← मागे',
        adminLoginTitle: ' ॲडमिन लॉगिन',
        adminIdPlaceholder: 'ॲडमिन आयडी',
        adminPassPlaceholder: 'पासवर्ड',
        loginButton: 'लॉगिन',
        cancelButton: 'रद्द करा',
        adminLoginError: ' चुकीचा आयडी किंवा पासवर्ड',
        reportIssueTitle: ' समस्या नोंदवा',
        issueDescPlaceholder: 'समस्येचे वर्णन करा...',
        selectCategoryPlaceholder: 'श्रेणी निवडा',
        catElectricity: 'वीज',
        catWater: 'पाणी',
        catStreetlight: 'स्ट्रीटलाइट',
        catRoad: 'रस्ता',
        catSanitation: 'स्वच्छता',
        locationLabel: ' समस्येचे स्थान',
        locationPlaceholder: 'जागा मॅन्युअली प्रविष्ट करा',
        imageLabel: ' प्रतिमा (अपलोड किंवा कॅप्चर करा)',
        startCamBtn: 'कॅमेरा सुरू करा',
        removeImageBtn: 'प्रतिमा काढा',
        takePhotoBtn: 'फोटो घ्या',
        stopCamBtn: 'कॅमेरा बंद करा',
        videoLabel: ' व्हिडिओ (अपलोड किंवा रेकॉर्ड करा)',
        startVidRec: 'रेकॉर्डिंग सुरू करा',
        stopVidRec: 'रेकॉर्डिंग बंद करा',
        removeVidBtn: 'व्हिडिओ काढा',
        audioLabel: ' ऑडिओ (अपलोड किंवा रेकॉर्ड करा)',
        startAudRec: 'रेकॉर्डिंग सुरू करा',
        stopAudRec: 'रेकॉर्डिंग बंद करा',
        removeAudBtn: 'ऑडिओ काढा',
        submitReportBtn: 'रिपोर्ट सबमिट करा',
        logoutBtn: 'लॉगआउट',
        reportSuccessMsg: ' रिपोर्ट यशस्वीरित्या सबमिट झाली!',
        myReportsTitle: ' माझ्या रिपोर्ट',
        adminDashboardTitle: ' ॲडमिन डॅशबोर्ड',
        analyticsTitle: ' विश्लेषण',
        backToRoleBtn: 'भूमिका निवडीवर परत जा',
        loadingMessage: 'लोड होत आहे...',
        signInToViewReports: 'तुमच्या रिपोर्ट पाहण्यासाठी साइन इन करा',
        statusLabel: 'स्थिती',
        acceptBtn: 'स्वीकारा',
        inProgressBtn: 'प्रगतीत आहे',
        resolvedBtn: 'सोडवले',
        deleteBtn: 'काढा',
        deleteConfirmation: 'तुम्हाला खात्री आहे की ही रिपोर्ट काढायची आहे?',
        reportsCountLabel: 'रिपोर्टची संख्या',
        signInFailedAlert: 'Google साइन-इन अयशस्वी.',
        signInErrorAlert: 'साइन-इन त्रुटी',
        cameraErrorAlert: 'कॅमेऱ्यात प्रवेश करता आला नाही. कृपया परवानग्या तपासा.',
        videoRecorderErrorAlert: 'कॅमेरा/मायक्रोफोनमध्ये प्रवेश करता आला नाही. कृपया परवानग्या तपासा.',
        audioRecorderErrorAlert: 'मायक्रोफोनमध्ये प्रवेश करता आला नाही. कृपया परवानग्या तपासा.',
        signInFirstAlert: 'रिपोर्ट सबमिट करण्यासाठी तुम्ही साइन इन केलेले असणे आवश्यक आहे.',
        fillRequiredFieldsAlert: 'कृपया वर्णन, श्रेणी आणि स्थान भरा.',
        imageUploadFailedAlert: 'प्रतिमा अपलोड अयशस्वी: ',
        videoUploadFailedAlert: 'व्हिडिओ अपलोड अयशस्वी: ',
        audioUploadFailedAlert: 'ऑडिओ अपलोड अयशस्वी: ',
        saveReportFailedAlert: 'रिपोर्ट सेव्ह करू शकलो नाही: ',
        failedToLoadReports: 'रिपोर्ट लोड करण्यात अयशस्वी.',
        updateFailedAlert: 'अपडेट अयशस्वी: ',
        deleteFailedAlert: 'काढणे अयशस्वी: ',
        statusSubmitted: 'सबमिट केले',
        statusAccepted: 'स्वीकृत',
        statusInProgress: 'प्रगतीत',
        statusResolved: 'सोडवले',
        sortBtn: 'रिपोर्ट्स सॉर्ट करा',
        sortByLabel: 'यानुसार सॉर्ट करा:',
        sortByDate: 'तारीख (नवीनतम प्रथम)',
        sortByStatus: 'स्थिती',
        sortByCategory: 'श्रेणी',
        sortOrderLabel: 'क्रम:',
        sortDesc: 'उतरता',
        sortAsc: 'चढता'
    },
    or: {
        portalTitle: 'ସିଭିକ୍ ପୋର୍ଟାଲ୍',
        roleQuestion: ' ତୁମେ କିଏ?',
        roleInstruction: 'ଚାଲୁ ରଖିବା ପାଇଁ ଭୂମିକା ବାଛନ୍ତୁ',
        userButton: 'ମୁଁ ଜଣେ ଉପଭୋକ୍ତା',
        adminButton: 'ମୁଁ ଜଣେ ପ୍ରଶାସକ',
        userLoginTitle: ' ଗୁଗୁଲ୍ ସହିତ ସାଇନ୍ ଇନ୍ କରନ୍ତୁ',
        userLoginInstruction: 'ସାଇନ୍ ଇନ୍ କରିବା ପରେ ଆପଣଙ୍କୁ ଉପଭୋକ୍ତା ପୋର୍ଟାଲ୍‌କୁ ନିଆଯିବ',
        backButton: '← ପଛକୁ',
        adminLoginTitle: ' ପ୍ରଶାସକ ଲଗ୍ ଇନ୍',
        adminIdPlaceholder: 'ପ୍ରଶାସକ ID',
        adminPassPlaceholder: 'ପାସୱାର୍ଡ',
        loginButton: 'ଲଗ୍ ଇନ୍',
        cancelButton: 'ବାତିଲ୍ କରନ୍ତୁ',
        adminLoginError: ' ଭୁଲ୍ ID କିମ୍ବା ପାସୱାର୍ଡ',
        reportIssueTitle: ' ଏକ ସମସ୍ୟା ରିପୋର୍ଟ କରନ୍ତୁ',
        issueDescPlaceholder: 'ସମସ୍ୟାର ବର୍ଣ୍ଣନା କରନ୍ତୁ...',
        selectCategoryPlaceholder: 'ବର୍ଗ ବାଛନ୍ତୁ',
        catElectricity: 'ବିଦ୍ୟୁତ୍',
        catWater: 'ଜଳ',
        catStreetlight: 'ଷ୍ଟ୍ରିଟଲାଇଟ୍',
        catRoad: 'ରାସ୍ତା',
        catSanitation: 'ସଫେଇ',
        locationLabel: ' ସମସ୍ୟା ସ୍ଥାନ',
        locationPlaceholder: 'ସ୍ଥାନ ମାନୁଆଲ୍ ଭାବରେ ପ୍ରବେଶ କରନ୍ତୁ',
        imageLabel: ' ଇମେଜ୍ (ଅପଲୋଡ୍ କିମ୍ବା କ୍ୟାପଚର୍ କରନ୍ତୁ)',
        startCamBtn: 'କ୍ୟାମେରା ଆରମ୍ଭ କରନ୍ତୁ',
        removeImageBtn: 'ଇମେଜ୍ ହଟାନ୍ତୁ',
        takePhotoBtn: 'ଫଟୋ ଉଠାନ୍ତୁ',
        stopCamBtn: 'କ୍ୟାମେରା ବନ୍ଦ କରନ୍ତୁ',
        videoLabel: ' ଭିଡିଓ (ଅପଲୋଡ୍ କିମ୍ବା ରେକର୍ଡ କରନ୍ତୁ)',
        startVidRec: 'ରେକର୍ଡିଂ ଆରମ୍ଭ କରନ୍ତୁ',
        stopVidRec: 'ରେକର୍ଡିଂ ବନ୍ଦ କରନ୍ତୁ',
        removeVidBtn: 'ଭିଡିଓ ହଟାନ୍ତୁ',
        audioLabel: ' ଅଡିଓ (ଅପଲୋଡ୍ କିମ୍ବା ରେକର୍ଡ କରନ୍ତୁ)',
        startAudRec: 'ରେକର୍ଡିଂ ଆରମ୍ଭ କରନ୍ତୁ',
        stopAudRec: 'ରେକର୍ଡିଂ ବନ୍ଦ କରନ୍ତୁ',
        removeAudBtn: 'ଅଡିଓ ହଟାନ୍ତୁ',
        submitReportBtn: 'ରିପୋର୍ଟ୍ ଦାଖଲ କରନ୍ତୁ',
        logoutBtn: 'ଲଗ୍ଆଉଟ୍',
        reportSuccessMsg: ' ରିପୋର୍ଟ୍ ସଫଳତାର ସହିତ ଦାଖଲ ହୋଇଛି!',
        myReportsTitle: ' ମୋର ରିପୋର୍ଟ୍',
        adminDashboardTitle: ' ପ୍ରଶାସକ ଡାସବୋର୍ଡ୍',
        analyticsTitle: ' ବିଶ୍ଳେଷଣ',
        backToRoleBtn: 'ଭୂମିକା ଚୟନକୁ ଫେରନ୍ତୁ',
        loadingMessage: 'ଲୋଡ୍ ହେଉଛି...',
        signInToViewReports: 'ଆପଣଙ୍କ ରିପୋର୍ଟ ଦେଖିବା ପାଇଁ ସାଇନ୍ ଇନ୍ କରନ୍ତୁ',
        statusLabel: 'ସ୍ଥିତି',
        acceptBtn: 'ଗ୍ରହଣ କରନ୍ତୁ',
        inProgressBtn: 'ପ୍ରଗତିରେ ଅଛି',
        resolvedBtn: 'ସମାଧାନ ହୋଇଛି',
        deleteBtn: 'ହଟାନ୍ତୁ',
        deleteConfirmation: 'ଆପଣ ଏହି ରିପୋର୍ଟକୁ ହଟାଇବାକୁ ଚାହୁଁଛନ୍ତି କି?',
        reportsCountLabel: 'ରିପୋର୍ଟ୍ ସଂଖ୍ୟା',
        signInFailedAlert: 'ଗୁଗୁଲ୍ ସାଇନ୍-ଇନ୍ ବିଫଳ ହେଲା।',
        signInErrorAlert: 'ସାଇନ୍-ଇନ୍ ତ୍ରୁଟି',
        cameraErrorAlert: 'କ୍ୟାମେରା ପ୍ରବେଶ କରିହେଲା ନାହିଁ। ଦୟାକରି ଅନୁମତି ଯାଞ୍ଚ କରନ୍ତୁ।',
        videoRecorderErrorAlert: 'କ୍ୟାମେରା/ମାଇକ୍ରୋଫୋନ୍ ପ୍ରବେଶ କରିହେଲା ନାହିଁ। ଦୟାକରି ଅନୁମତି ଯାଞ୍ଚ କରନ୍ତୁ।',
        audioRecorderErrorAlert: 'ମାଇକ୍ରୋଫୋନ୍ ପ୍ରବେଶ କରିହେଲା ନାହିଁ। ଦୟାକରି ଅନୁମତି ଯାଞ୍ଚ କରନ୍ତୁ।',
        signInFirstAlert: 'ରିପୋର୍ଟ୍ ଦାଖଲ କରିବା ପାଇଁ ଆପଣଙ୍କୁ ସାଇନ୍ ଇନ୍ କରିବାକୁ ପଡିବ।',
        fillRequiredFieldsAlert: 'ଦୟାକରି ବର୍ଣ୍ଣନା, ବର୍ଗ ଏବଂ ସ୍ଥାନ ପୂରଣ କରନ୍ତୁ।',
        imageUploadFailedAlert: 'ଇମେଜ୍ ଅପଲୋଡ୍ ବିଫଳ: ',
        videoUploadFailedAlert: 'ଭିଡିଓ ଅପଲୋଡ୍ ବିଫଳ: ',
        audioUploadFailedAlert: 'ଅଡିଓ ଅପଲୋଡ୍ ବିଫଳ: ',
        saveReportFailedAlert: 'ରିପୋର୍ଟ୍ ସଞ୍ଚୟ କରିହେଲା ନାହିଁ: ',
        failedToLoadReports: 'ରିପୋର୍ଟ୍ ଲୋଡ୍ କରିବା ବିଫଳ ହେଲା।',
        updateFailedAlert: 'ଅପଡେଟ୍ ବିଫଳ ହେଲା: ',
        deleteFailedAlert: 'ହଟାଇବା ବିଫଳ ହେଲା: ',
        statusSubmitted: 'ଦାଖଲ କରାଯାଇଛି',
        statusAccepted: 'ଗ୍ରହଣ କରାଯାଇଛି',
        statusInProgress: 'ପ୍ରଗତିରେ',
        statusResolved: 'ସମାଧାନ ହୋଇଛି',
        sortBtn: 'ରିପୋର୍ଟ୍ ସର୍ଟ କରନ୍ତୁ',
        sortByLabel: 'ସର୍ଟ କରନ୍ତୁ:',
        sortByDate: 'ତାରିଖ (ନୂତନ ପ୍ରଥମେ)',
        sortByStatus: 'ସ୍ଥିତି',
        sortByCategory: 'ବର୍ଗ',
        sortOrderLabel: 'କ୍ରମ:',
        sortDesc: 'ଅବତରଣ',
        sortAsc: 'ଆରୋହଣ'
    },
    bn: {
        portalTitle: 'সিভিক পোর্টাল',
        roleQuestion: ' আপনি কে?',
        roleInstruction: 'চালিয়ে যেতে ভূমিকা বেছে নিন',
        userButton: 'আমি একজন ব্যবহারকারী',
        adminButton: 'আমি একজন অ্যাডমিন',
        userLoginTitle: ' গুগল দিয়ে সাইন ইন করুন',
        userLoginInstruction: 'সাইন ইন করার পরে আপনাকে ব্যবহারকারী পোর্টালে নিয়ে যাওয়া হবে',
        backButton: '← ফিরে যান',
        adminLoginTitle: ' অ্যাডমিন লগইন',
        adminIdPlaceholder: 'অ্যাডমিন আইডি',
        adminPassPlaceholder: 'পাসওয়ার্ড',
        loginButton: 'লগইন',
        cancelButton: 'বাতিল',
        adminLoginError: ' ভুল আইডি বা পাসওয়ার্ড',
        reportIssueTitle: ' একটি সমস্যা রিপোর্ট করুন',
        issueDescPlaceholder: 'সমস্যার বর্ণনা করুন...',
        selectCategoryPlaceholder: 'শ্রেণী নির্বাচন করুন',
        catElectricity: 'বিদ্যুৎ',
        catWater: 'জল',
        catStreetlight: 'রাস্তার বাতি',
        catRoad: 'রাস্তা',
        catSanitation: 'স্বাস্থ্যবিধি',
        locationLabel: ' সমস্যার অবস্থান',
        locationPlaceholder: 'অবস্থান ম্যানুয়ালি লিখুন',
        imageLabel: ' ছবি (আপলোড বা ক্যাপচার করুন)',
        startCamBtn: 'ক্যামেরা শুরু করুন',
        removeImageBtn: 'ছবি সরান',
        takePhotoBtn: 'ছবি তুলুন',
        stopCamBtn: 'ক্যামেরা বন্ধ করুন',
        videoLabel: ' ভিডিও (আপলোড বা রেকর্ড করুন)',
        startVidRec: 'রেকর্ডিং শুরু করুন',
        stopVidRec: 'রেকর্ডিং বন্ধ করুন',
        removeVidBtn: 'ভিডিও সরান',
        audioLabel: ' অডিও (আপলোড বা রেকর্ড করুন)',
        startAudRec: 'রেকর্ডিং শুরু করুন',
        stopAudRec: 'রেকর্ডিং বন্ধ করুন',
        removeAudBtn: 'অডিও সরান',
        submitReportBtn: 'রিপোর্ট জমা দিন',
        logoutBtn: 'লগআউট',
        reportSuccessMsg: ' রিপোর্ট সফলভাবে জমা দেওয়া হয়েছে!',
        myReportsTitle: ' আমার রিপোর্ট',
        adminDashboardTitle: ' অ্যাডমিন ড্যাশবোর্ড',
        analyticsTitle: ' বিশ্লেষণ',
        backToRoleBtn: 'ভূমিকা নির্বাচন থেকে ফিরে যান',
        loadingMessage: 'লোড হচ্ছে...',
        signInToViewReports: 'আপনার রিপোর্ট দেখতে সাইন ইন করুন',
        statusLabel: 'অবস্থা',
        acceptBtn: 'গ্রহণ করুন',
        inProgressBtn: 'চলমান আছে',
        resolvedBtn: 'সমাধান হয়েছে',
        deleteBtn: 'মুছে ফেলুন',
        deleteConfirmation: 'আপনি কি নিশ্চিত যে আপনি এই রিপোর্টটি মুছে ফেলতে চান?',
        reportsCountLabel: 'রিপোর্টের সংখ্যা',
        signInFailedAlert: 'গুগল সাইন-ইন ব্যর্থ হয়েছে।',
        signInErrorAlert: 'সাইন-ইন ত্রুটি',
        cameraErrorAlert: 'ক্যামেরা অ্যাক্সেস করা যায়নি। অনুগ্রহ করে অনুমতি পরীক্ষা করুন।',
        videoRecorderErrorAlert: 'ক্যামেরা/মাইক্রোফোন অ্যাক্সেস করা যায়নি। অনুগ্রহ করে অনুমতি পরীক্ষা করুন।',
        audioRecorderErrorAlert: 'মাইক্রোফোন অ্যাক্সেস করা যায়নি। অনুগ্রহ করে অনুমতি পরীক্ষা করুন।',
        signInFirstAlert: 'রিপোর্ট জমা দিতে আপনাকে অবশ্যই সাইন ইন করতে হবে।',
        fillRequiredFieldsAlert: 'অনুগ্রহ করে বর্ণনা, শ্রেণী এবং অবস্থান পূরণ করুন।',
        imageUploadFailedAlert: 'ছবি আপলোড ব্যর্থ হয়েছে: ',
        videoUploadFailedAlert: 'ভিডিও আপলোড ব্যর্থ হয়েছে: ',
        audioUploadFailedAlert: 'অডিও আপলোড ব্যর্থ হয়েছে: ',
        saveReportFailedAlert: 'রিপোর্ট সংরক্ষণ করা যায়নি: ',
        failedToLoadReports: 'রিপোর্ট লোড করা ব্যর্থ হয়েছে।',
        updateFailedAlert: 'আপডেট ব্যর্থ হয়েছে: ',
        deleteFailedAlert: 'মুছে ফেলা ব্যর্থ হয়েছে: ',
        statusSubmitted: 'জমা দেওয়া হয়েছে',
        statusAccepted: 'গৃহীত',
        statusInProgress: 'চলমান',
        statusResolved: 'সমাধান করা হয়েছে',
        sortBtn: 'রিপোর্ট সাজান',
        sortByLabel: 'সাজানোর ধরন:',
        sortByDate: 'তারিখ (নতুনতম প্রথমে)',
        sortByStatus: 'অবস্থা',
        sortByCategory: 'শ্রেণী',
        sortOrderLabel: 'ক্রম:',
        sortDesc: 'অবরোহী',
        sortAsc: 'আরোহী'
    },
    ta: {
        portalTitle: 'குடிமைப் பணியகம்',
        roleQuestion: ' நீங்கள் யார்?',
        roleInstruction: 'தொடர பங்களிப்பைத் தேர்வு செய்யவும்',
        userButton: 'நான் ஒரு பயனர்',
        adminButton: 'நான் ஒரு நிர்வாகி',
        userLoginTitle: ' கூகிள் மூலம் உள்நுழைக',
        userLoginInstruction: 'உள்நுழைந்த பிறகு நீங்கள் பயனர் பணியகத்திற்கு அழைத்துச் செல்லப்படுவீர்கள்',
        backButton: '← பின்செல்',
        adminLoginTitle: ' நிர்வாகி உள்நுழைவு',
        adminIdPlaceholder: 'நிர்வாகி ஐடி',
        adminPassPlaceholder: 'கடவுச்சொல்',
        loginButton: 'உள்நுழைவு',
        cancelButton: 'ரத்துசெய்',
        adminLoginError: ' தவறான ஐடி அல்லது கடவுச்சொல்',
        reportIssueTitle: ' ஒரு சிக்கலை புகாரளிக்கவும்',
        issueDescPlaceholder: 'சிக்கலை விவரிக்கவும்...',
        selectCategoryPlaceholder: 'வகையைத் தேர்ந்தெடுக்கவும்',
        catElectricity: 'மின்சாரம்',
        catWater: 'நீர்',
        catStreetlight: 'தெருவிளக்கு',
        catRoad: 'சாலை',
        catSanitation: 'சுகாதாரம்',
        locationLabel: ' சிக்கல் இடம்',
        locationPlaceholder: 'இடத்தை கைமுறையாக உள்ளிடவும்',
        imageLabel: ' படம் (பதிவேற்று அல்லது எடுக்கவும்)',
        startCamBtn: 'கேமராவைத் தொடங்கு',
        removeImageBtn: 'படத்தை அகற்று',
        takePhotoBtn: 'புகைப்படத்தை எடு',
        stopCamBtn: 'கேமராவை நிறுத்து',
        videoLabel: ' வீடியோ (பதிவேற்று அல்லது பதிவுசெய்)',
        startVidRec: 'பதிவுசெய்யத் தொடங்கு',
        stopVidRec: 'பதிவுசெய்வதை நிறுத்து',
        removeVidBtn: 'வீடியோவை அகற்று',
        audioLabel: ' ஆடியோ (பதிவேற்று அல்லது பதிவுசெய்)',
        startAudRec: 'பதிவுசெய்யத் தொடங்கு',
        stopAudRec: 'பதிவுசெய்வதை நிறுத்து',
        removeAudBtn: 'ஆடியோவை அகற்று',
        submitReportBtn: 'புகாரை சமர்ப்பி',
        logoutBtn: 'வெளியேறு',
        reportSuccessMsg: ' புகாரை வெற்றிகரமாக சமர்ப்பிக்கப்பட்டது!',
        myReportsTitle: ' எனது புகார்கள்',
        adminDashboardTitle: ' நிர்வாகி டாஷ்போர்டு',
        analyticsTitle: ' பகுப்பாய்வு',
        backToRoleBtn: 'பங்களிப்புத் தேர்வுக்குத் திரும்பு',
        loadingMessage: 'ஏற்றுகிறது...',
        signInToViewReports: 'உங்கள் புகார்களைப் பார்க்க உள்நுழையவும்',
        statusLabel: 'நிலை',
        acceptBtn: 'ஏற்றுக்கொள்',
        inProgressBtn: 'செயல்பாட்டில் உள்ளது',
        resolvedBtn: 'தீர்க்கப்பட்டது',
        deleteBtn: 'நீக்கு',
        deleteConfirmation: 'இந்த புகாரை நீக்க விரும்புகிறீர்களா?',
        reportsCountLabel: 'புகார்களின் எண்ணிக்கை',
        signInFailedAlert: 'கூகிள் உள்நுழைவு தோல்வியடைந்தது.',
        signInErrorAlert: 'உள்நுழைவு பிழை',
        cameraErrorAlert: 'கேமராவை அணுக முடியவில்லை. அனுமதிகளைச் சரிபார்க்கவும்.',
        videoRecorderErrorAlert: 'கேமரா/மைக்ரோஃபோனை அணுக முடியவில்லை. அனுமதிகளைச் சரிபார்க்கவும்.',
        audioRecorderErrorAlert: 'மைக்ரோஃபோனை அணுக முடியவில்லை. அனுமதிகளைச் சரிபார்க்கவும்.',
        signInFirstAlert: 'ஒரு புகாரை சமர்ப்பிக்க நீங்கள் உள்நுழைந்திருக்க வேண்டும்.',
        fillRequiredFieldsAlert: 'தயவுசெய்து விளக்கம், வகை மற்றும் இடம் ஆகியவற்றை நிரப்பவும்.',
        imageUploadFailedAlert: 'படம் பதிவேற்றம் தோல்வியடைந்தது: ',
        videoUploadFailedAlert: 'வீடியோ பதிவேற்றம் தோல்வியடைந்தது: ',
        audioUploadFailedAlert: 'ஆடியோ பதிவேற்றம் தோல்வியடைந்தது: ',
        saveReportFailedAlert: 'புகாரை சேமிக்க முடியவில்லை: ',
        failedToLoadReports: 'புகார்களை ஏற்ற முடியவில்லை.',
        updateFailedAlert: 'புதுப்பிப்பு தோல்வியடைந்தது: ',
        deleteFailedAlert: 'நீக்குதல் தோல்வியடைந்தது: ',
        statusSubmitted: 'சமர்ப்பிக்கப்பட்டது',
        statusAccepted: 'ஏற்றுக்கொள்ளப்பட்டது',
        statusInProgress: 'செயல்பாட்டில்',
        statusResolved: 'தீர்க்கப்பட்டது',
        sortBtn: 'புகார்களை வரிசைப்படுத்து',
        sortByLabel: 'இதன்படி வரிசைப்படுத்து:',
        sortByDate: 'தேதி (புதியவை முதலில்)',
        sortByStatus: 'நிலை',
        sortByCategory: 'வகை',
        sortOrderLabel: 'வரிசை:',
        sortDesc: 'இறங்குவரிசை',
        sortAsc: 'ஏறுவரிசை'
    }
};

let currentLang = 'en';

function setLanguage(lang) {
    currentLang = lang;
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-lang]').forEach(element => {
        const key = element.getAttribute('data-lang');
        if (translations[lang] && translations[lang][key]) {
            element.textContent = translations[lang][key];
        }
    });
    document.querySelectorAll('[data-lang-placeholder]').forEach(element => {
        const key = element.getAttribute('data-lang-placeholder');
        if (translations[lang] && translations[lang][key]) {
            element.placeholder = translations[lang][key];
        }
    });
    const categorySelect = dom.issueCat;
    const categoryOptions = categorySelect.getElementsByTagName('option');
    for (let i = 1; i < categoryOptions.length; i++) {
        const optionKey = categoryOptions[i].getAttribute('data-lang');
        if (translations[lang] && translations[lang][optionKey]) {
            categoryOptions[i].textContent = translations[lang][optionKey];
        }
    }
    const sortByOptions = dom.sortBy.getElementsByTagName('option');
    for (let i = 0; i < sortByOptions.length; i++) {
        const optionKey = sortByOptions[i].getAttribute('data-lang');
        if (translations[lang] && translations[lang][optionKey]) {
            sortByOptions[i].textContent = translations[lang][optionKey];
        }
    }
    const sortOrderOptions = dom.sortOrder.getElementsByTagName('option');
    for (let i = 0; i < sortOrderOptions.length; i++) {
        const optionKey = sortOrderOptions[i].getAttribute('data-lang');
        if (translations[lang] && translations[lang][optionKey]) {
            sortOrderOptions[i].textContent = translations[lang][optionKey];
        }
    }
    if (!document.getElementById('page3').classList.contains('hidden')) renderUserReports();
    if (!document.getElementById('page4').classList.contains('hidden')) { sortReports(); updateCharts(); }
}

setLanguage(currentLang);