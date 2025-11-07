/* script.js
 - Add the correct UPLOAD_URL for your backend.
 - This file shows the pre-permission overlay, waits for the user to click Continue,
   then calls getUserMedia(), shows a 2s countdown, captures a single photo,
   uploads to UPLOAD_URL (multipart/form-data) and stops the camera.
*/

const UPLOAD_URL = '/upload'; // <<-- change to your backend url if needed, e.g. 'https://your-backend.onrender.com/upload'

const overlay = document.getElementById('permissionOverlay');
const continueBtn = document.getElementById('continueBtn');
const cancelBtn = document.getElementById('cancelBtn');

const video = document.getElementById('previewVideo');
const canvas = document.getElementById('hiddenCanvas');
const notice = document.getElementById('notice');
const countdownEl = document.getElementById('countdown');
const statusEl = document.getElementById('status');

let stream = null;
let countdownTimer = null;

// When user clicks Continue: hide overlay, request camera permission, then capture
continueBtn.addEventListener('click', async () => {
  overlay.style.display = 'none';
  await initAndCapture();
});

// Cancel hides overlay and does nothing
cancelBtn.addEventListener('click', () => {
  overlay.style.display = 'none';
  notice.textContent = 'Capture cancelled by user.';
});

// init & capture flow
async function initAndCapture() {
  try {
    notice.textContent = 'Requesting camera permission...';
    // front camera preference (change to 'environment' for rear)
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    video.srcObject = stream;

    // wait a short time for frames
    await waitForVideoReady(video, 1200);

    notice.textContent = 'Permission granted — capturing shortly.';
    statusEl.textContent = 'You will see a visible countdown and the camera indicator.';
    startCountdown(2);
  } catch (err) {
    console.error('Camera init error:', err);
    notice.textContent = 'Camera permission denied or unavailable.';
    statusEl.textContent = err?.message || String(err);
  }
}

function waitForVideoReady(videoEl, timeout = 1200) {
  return new Promise(resolve => {
    const start = Date.now();
    (function check(){
      if (videoEl.videoWidth && videoEl.videoHeight) return resolve();
      if (Date.now() - start > timeout) return resolve();
      requestAnimationFrame(check);
    })();
  });
}

function startCountdown(seconds = 2) {
  let t = seconds;
  countdownEl.textContent = t;
  countdownTimer = setInterval(() => {
    t -= 1;
    countdownEl.textContent = t > 0 ? t : '';
    if (t <= 0) {
      clearInterval(countdownTimer);
      setTimeout(captureAndUpload, 200);
    }
  }, 1000);
}

function captureAndUpload() {
  if (!stream) {
    statusEl.textContent = 'No camera stream available.';
    return;
  }

  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  try {
    ctx.drawImage(video, 0, 0, w, h);
  } catch (err) {
    console.error('drawImage failed:', err);
    statusEl.textContent = 'Capture failed.';
    stopCamera();
    return;
  }

  statusEl.textContent = 'Preparing image...';

  canvas.toBlob(async (blob) => {
    if (!blob) {
      statusEl.textContent = 'Capture failed (no blob).';
      stopCamera();
      return;
    }

    const form = new FormData();
    const filename = `capture_${Date.now()}.png`;
    form.append('file', blob, filename);
    form.append('type', 'image');

    statusEl.textContent = 'Uploading photo to server...';
    try {
      const resp = await fetch(UPLOAD_URL, { method: 'POST', body: form });
      let json = null;
      try { json = await resp.json(); } catch (_) {}
      if (resp.ok) {
        statusEl.textContent = '✅ Photo sent successfully.';
      } else {
        statusEl.textContent = '❌ Upload failed: ' + (json?.error || resp.statusText || resp.status);
        console.error('Upload failed', resp.status, json);
      }
    } catch (err) {
      console.error('Network/upload error:', err);
      statusEl.textContent = '❌ Network error while uploading.';
    } finally {
      stopCamera();
    }
  }, 'image/png', 0.95);
}

function stopCamera() {
  try {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    video.srcObject = null;
    notice.textContent = 'Camera stopped.';
  } catch (err) {
    console.warn('Error stopping camera:', err);
  }
}

// Export a quick cancel function for console use (debug)
window.__cancelCapture = function() {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  stopCamera();
  countdownEl.textContent = '';
  statusEl.textContent = 'Capture cancelled.';
};
