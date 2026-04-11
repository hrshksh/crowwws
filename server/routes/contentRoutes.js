const express = require('express');
const { z } = require('zod');
const { verifyAdmin } = require('../middleware/authMiddleware');
const { getAuthVisual, setAuthVisual } = require('../services/contentStore');

const router = express.Router();

const authVisualSchema = z.object({
  imageDataUrl: z
    .string()
    .min(1, 'Image is required')
    .refine((value) => value.startsWith('data:image/'), 'Image must be a valid data URL'),
});

router.get('/auth-visual', (req, res) => {
  res.json({ imageDataUrl: getAuthVisual() });
});

router.get('/admin/auth-visual', verifyAdmin, (req, res) => {
  res.json({ imageDataUrl: getAuthVisual() });
});

router.post('/admin/auth-visual', verifyAdmin, (req, res) => {
  try {
    const { imageDataUrl } = authVisualSchema.parse(req.body);
    const saved = setAuthVisual(imageDataUrl);
    res.json({ message: 'Auth visual updated.', imageDataUrl: saved });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors[0].message });
    }
    console.error('[ContentRoutes] Failed to save auth visual:', err);
    res.status(500).json({ error: 'Failed to save auth visual.' });
  }
});

module.exports = router;
