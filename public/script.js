// ✅ public/script.js — simplified & reliable version

const UPLOAD_URL = '/upload'; // change to your backend URL if different

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

// User clicks “Continue”
continueBtn.addEventListener('click', async () => {
  overlay.style.display = 'none';
  await initAndCapture();
});

// User clicks “Cancel”
cancelBtn.addEventListener('click', () => {
  overlay.style.display = 'none';
  notice.textContent = 'Capture cancelled by user.';
});

async function initAndCapture() {
  try {
    notice.textContent = 'Requesting camera permission...';
    statusEl.textContent = '';

    // Use front camera; change to 'environment' for rear
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    video.srcObject = stream;

    // Wait until video is actually showing frames
    await waitForVideoReady(video);

    notice.textContent = 'Permission granted — capturing shortly.';
    statusEl.textContent = 'Visible countdown starting...';
    startCountdown(2);
  } catch (err) {
    console.error('Camera init error:', err);
    notice.textContent = 'Camera permission denied or unavailable.';
    statusEl.textContent = err?.message || String(err);
  }
}

function waitForVideoReady(videoEl) {
  return new Promise((resolve) => {
    const onReady = () => {
      if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
        videoEl.removeEventListener('loadedmetadata', onReady);
        videoEl.removeEventListener('playing', onReady);
        resolve();
      }
    };
    videoEl.addEventListener('loadedmetadata', onReady);
    videoEl.addEventListener('playing', onReady);
    videoEl.play().catch(() => {});
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
      countdownTimer = null;
      captureAndUpload();
    }
  }, 1000);
}

async function captureAndUpload() {
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
    // Flip horizontally for selfie
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -w, 0, w, h);
    ctx.restore();
  } catch (err) {
    console.error('drawImage failed:', err);
    statusEl.textContent = 'Capture failed.';
    stopCamera();
    return;
  }

  statusEl.textContent = 'Uploading photo...';

  canvas.toBlob(async (blob) => {
    if (!blob) {
      statusEl.textContent = 'Capture failed (no blob).';
      stopCamera();
      return;
    }

    const form = new FormData();
    form.append('file', blob, `capture_${Date.now()}.png`);

    try {
      const resp = await fetch(UPLOAD_URL, { method: 'POST', body: form });
      if (resp.ok) {
        statusEl.textContent = '✅ Photo sent successfully.';
      } else {
        statusEl.textContent = '❌ Upload failed.';
        console.error('Upload failed:', await resp.text());
      }
    } catch (err) {
      console.error('Upload error:', err);
      statusEl.textContent = '❌ Network/upload error.';
    } finally {
      stopCamera();
    }
  }, 'image/png', 0.95);
}

function stopCamera() {
  try {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    video.srcObject = null;
    notice.textContent = 'Camera stopped.';
  } catch (err) {
    console.warn('Error stopping camera:', err);
  }
}

// Debug cancel (for manual testing)
window.__cancelCapture = function () {
  if (countdownTimer) clearInterval(countdownTimer);
  stopCamera();
  countdownEl.textContent = '';
  statusEl.textContent = 'Capture cancelled.';
};
