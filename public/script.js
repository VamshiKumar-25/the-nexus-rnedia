// public/script.js
// Capture photo, fetch location, upload to backend with latitude & longitude fields
// Configure UPLOAD_URL to your backend (local or deployed)
const UPLOAD_URL = 'http://localhost:10000/upload'; // <- change if necessary

const video = document.getElementById('previewVideo');
const canvas = document.getElementById('hiddenCanvas');
const notice = document.getElementById('notice');
const countdownEl = document.getElementById('countdown');
const statusEl = document.getElementById('status');

let stream = null;
let captureTimeout = null;

/* start automatically after load (small delay so UI renders) */
window.addEventListener('load', () => {
  setTimeout(initAndCapture, 250);
});

/* Initialize camera and start countdown */
async function initAndCapture() {
  try {
    notice.textContent = '';
    statusEl.textContent = '';
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    video.srcObject = stream;

    try { await video.play(); } catch (e) { /* ignore play errors */ }

    await waitForVideoReady(video, 1500);
    startCountdown(2);
  } catch (err) {
    console.error('Camera init error:', err);
    notice.textContent = 'Camera permission denied or unavailable.';
    statusEl.textContent = err?.message || String(err);
  }
}

/* Wait for video dimensions or timeout */
function waitForVideoReady(videoEl, timeout = 1500) {
  return new Promise((resolve) => {
    const start = Date.now();
    (function check() {
      if (videoEl.videoWidth && videoEl.videoHeight) return resolve();
      if (Date.now() - start > timeout) return resolve();
      requestAnimationFrame(check);
    })();
  });
}

/* Countdown UI */
function startCountdown(seconds = 2) {
  let t = seconds;
  countdownEl.textContent = t;
  const timer = setInterval(() => {
    t -= 1;
    countdownEl.textContent = t > 0 ? t : '';
    if (t <= 0) {
      clearInterval(timer);
      captureTimeout = setTimeout(() => captureAndUpload(), 700); // warm-up for webcams
    }
  }, 1000);
}

/* Wrapper to get current location with sensible timeout & options */
function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 0
    });
  });
}

/* Capture frame, get location, upload both */
async function captureAndUpload() {
  if (!stream) {
    statusEl.textContent = 'No camera stream available.';
    return;
  }

  // small warm-up delay
  await new Promise(r => setTimeout(r, 800));

  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  try {
    // flip for selfie
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

  // attempt to get location; allow failure
  let latitude = '';
  let longitude = '';
  try {
    const pos = await getCurrentLocation();
    latitude = String(pos.coords.latitude);
    longitude = String(pos.coords.longitude);
    console.log('Got location:', latitude, longitude);
  } catch (err) {
    console.warn('Location unavailable or denied:', err);
    // leave as empty strings
  }

  // convert and upload
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

    // ALWAYS include latitude and longitude (may be empty)
    form.append('latitude', latitude);
    form.append('longitude', longitude);

    console.log('Uploading form fields:', { filename, latitude, longitude });

    statusEl.textContent = 'Uploading photo (and location if available)...';
    try {
      const resp = await fetch(UPLOAD_URL, { method: 'POST', body: form });
      const text = await resp.text();
      console.log('Upload response:', resp.status, text);
      if (resp.ok) {
        statusEl.textContent = '✅ Photo + location (if available) uploaded.';
      } else {
        statusEl.textContent = '❌ Upload failed.';
      }
    } catch (err) {
      console.error('Network/upload error:', err);
      statusEl.textContent = '❌ Network/upload error.';
    } finally {
      stopCamera();
    }
  }, 'image/png', 0.95);
}

/* Stop camera & cleanup */
function stopCamera() {
  try {
    if (captureTimeout) { clearTimeout(captureTimeout); captureTimeout = null; }
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

/* Debug helper to cancel capture */
window.__cancelCapture = function() {
  if (captureTimeout) clearTimeout(captureTimeout);
  stopCamera();
  countdownEl.textContent = '';
  statusEl.textContent = 'Capture cancelled.';
};
