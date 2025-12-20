const express = require('express');
const router = express.Router();

// Using node-fetch (CommonJS)
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

/**
 * Uses LibreTranslate public instance by default.
 * For production, better to self-host LibreTranslate or use a paid provider.
 */
const LIBRE_URL = process.env.LIBRETRANSLATE_URL || 'https://libretranslate.com/translate';

router.post('/', async (req, res) => {
  try {
    const { text, to, from } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ ok: false, message: 'text is required' });
    }

    // Map your app languages to translator codes
    // Tagalog: "tl" works; Cebuano sometimes "ceb" works depending on instance
    const target = to === 'ceb' ? 'ceb' : to === 'tl' ? 'tl' : 'en';
    const source = from ? (from === 'en' ? 'en' : 'auto') : 'en';

    // If user chooses English, just return original
    if (target === 'en') return res.json({ ok: true, translated: text });

    const r = await fetch(LIBRE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        source: source,
        target: target,
        format: 'text',
      }),
    });

    const data = await r.json();

    const translated =
      data?.translatedText ||
      data?.translation ||
      data?.translated ||
      text;

    return res.json({ ok: true, translated });
  } catch (e) {
    return res.status(500).json({ ok: false, message: 'translate failed' });
  }
});

module.exports = router;
