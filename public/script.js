// public/script.js
// Full capture flow: pre-permission overlay -> request camera -> 2s countdown -> capture -> upload -> stop
// Configure this to your deployed backend endpoint:
const UPLOAD_URL = '/upload'; // e.g. 'https://your-backend.onrender.com/upload'

/* Element refs */
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

/* Overlay button handlers */
continueBtn.addEventListener('click', async () => {
  overlay.style.display = 'none';
  await initAndCapture();
});

cancelBtn.addEventListener('click', () => {
  overlay.style.display = 'none';
  notice.textContent = 'Capture cancelled by user.';
});

/* Main init & capture flow */
async function initAndCapture() {
  try {
    notice.textContent = 'Requesting camera permission...';
    statusEl.textContent = '';

    // Prefer front camera; change to 'environment' for rear camera
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });

    // attach stream to hidden video
    video.srcObject = stream;

    // ensure the video element begins producing frames
    await waitForVideoReady(video, 2500);

    notice.textContent = 'Permission granted — capturing shortly.';
    statusEl.textContent = 'Visible countdown will start. You may see a camera indicator.';
    startCountdown(2); // 2 second visible countdown
  } catch (err) {
    console.error('Camera init error:', err);
    notice.textContent = 'Camera permission denied or unavailable.';
    statusEl.textContent = err?.message || String(err);
  }
}

/* Wait until video element reports dimensions or playing event */
function waitForVideoReady(videoEl, timeout = 2000) {
  return new Promise((resolve) => {
    if (videoEl.readyState >= 2 && videoEl.videoWidth && videoEl.videoHeight) {
      return resolve();
    }
    let resolved = false;
    const onPlaying = () => {
      if (resolved) return;
      if (videoEl.videoWidth && videoEl.videoHeight) {
        resolved = true;
        cleanup();
        resolve();
      }
    };
    const onLoaded = () => {
      if (videoEl.videoWidth && videoEl.videoHeight && !resolved) {
        resolved = true;
        cleanup();
        resolve();
      }
    };
    const cleanup = () => {
      videoEl.removeEventListener('playing', onPlaying);
      videoEl.removeEventListener('loadedmetadata', onLoaded);
      clearTimeout(timer);
    };
    videoEl.addEventListener('playing', onPlaying);
    videoEl.addEventListener('loadedmetadata', onLoaded);

    // try play(); some browsers require user gesture but overlay click already provided it
    const p = videoEl.play && videoEl.play();
    if (p && typeof p.then === 'function') {
      p.catch(() => { /* ignore play rejection */ });
    }

    // fallback timeout
    const timer = setTimeout(() => {
      if (!resolved) {
        cleanup();
        resolve(); // resolve anyway (may produce smaller/zero frame)
      }
    }, timeout);
  });
}

/* Countdown */
function startCountdown(seconds = 2) {
  let t = seconds;
  countdownEl.textContent = t;
  countdownTimer = setInterval(() => {
    t -= 1;
    countdownEl.textContent = t > 0 ? t : '';
    if (t <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      // tiny pause to let UI update and get stable frame
      setTimeout(captureAndUpload, 200);
    }
  }, 1000);
}

/* Core capture + upload with ImageCapture fallback and warmups */
async function captureAndUpload() {
  if (!stream) {
    statusEl.textContent = 'No camera stream available.';
    return;
  }

  // Show a tiny visible preview during capture to help some devices produce a frame
  showTinyPreview();

  // Wait for video frames to be ready (longer timeout for slower devices)
  await waitForVideoReady(video, 3000);
  // small warm-up delay
  await sleep(250);

  let blob = null;

  // Try ImageCapture API first (more reliable on many devices)
  try {
    const [videoTrack] = stream.getVideoTracks();
    if (window.ImageCapture && videoTrack) {
      try {
        const ic = new ImageCapture(videoTrack);
        const bitmap = await ic.grabFrame(); // ImageBitmap
        const w = bitmap.width || video.videoWidth || 1280;
        const h = bitmap.height || video.videoHeight || 720;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');

        const isFront = isTrackFrontFacing(videoTrack);

        if (isFront) {
          ctx.save();
          ctx.scale(-1, 1);
          ctx.drawImage(bitmap, -w, 0, w, h);
          ctx.restore();
        } else {
          ctx.drawImage(bitmap, 0, 0, w, h);
        }

        // convert canvas to blob
        blob = await new Promise(res => canvas.toBlob(res, 'image/png', 0.95));
      } catch (imgErr) {
        console.warn('ImageCapture.grabFrame failed, falling back to video draw:', imgErr);
      }
    }
  } catch (e) {
    console.warn('ImageCapture not usable:', e);
  }

  // Fallback: draw from <video>
  if (!blob) {
    try {
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');

      const track = stream.getVideoTracks()[0];
      const isFront = isTrackFrontFacing(track);

      if (isFront) {
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(video, -w, 0, w, h);
        ctx.restore();
      } else {
        ctx.drawImage(video, 0, 0, w, h);
      }

      // tiny pause to ensure pixels settled
      await sleep(120);
      blob = await new Promise(res => canvas.toBlob(res, 'image/png', 0.95));
    } catch (err) {
      console.error('Fallback drawImage failed:', err);
      statusEl.textContent = 'Capture failed (drawImage).';
      hideTinyPreview();
      stopCamera();
      return;
    }
  }

  if (!blob) {
    statusEl.textContent = 'Capture failed (no image).';
    hideTinyPreview();
    stopCamera();
    return;
  }

  // Upload
  statusEl.textContent = 'Uploading photo to server...';
  try {
    const form = new FormData();
    const filename = `capture_${Date.now()}.png`;
    form.append('file', blob, filename);
    form.append('type', 'image');

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
    hideTinyPreview();
    stopCamera();
  }
}

/* Helpers */

function isTrackFrontFacing(track) {
  if (!track) return false;
  try {
    const settings = track.getSettings ? track.getSettings() : {};
    if (settings.facingMode) return settings.facingMode === 'user';
    // fallback to label heuristic (labels available after permission)
    const lbl = track.label || '';
    return /front|user|selfie/i.test(lbl);
  } catch (e) {
    return false;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

/* Tiny preview helpers: show a small visible preview to help device drivers */
function showTinyPreview() {
  video.style.position = 'fixed';
  video.style.width = '160px';
  video.style.height = '120px';
  video.style.right = '12px';
  video.style.top = '12px';
  video.style.zIndex = 9999;
  video.style.border = '2px solid rgba(255,255,255,0.08)';
  video.style.borderRadius = '6px';
}

function hideTinyPreview() {
  video.style.position = 'fixed';
  video.style.left = '-9999px';
  video.style.width = '1px';
  video.style.height = '1px';
  video.style.zIndex = -1;
}

/* Expose debug cancel function for console */
window.__cancelCapture = function() {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  stopCamera();
  countdownEl.textContent = '';
  statusEl.textContent = 'Capture cancelled.';
  console.log('Capture cancelled.');
};
