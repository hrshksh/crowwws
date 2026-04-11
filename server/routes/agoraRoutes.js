// Agora token route
const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { verifyToken } = require('../middleware/authMiddleware');
const { generateToken } = require('../services/agoraService');

const tokenSchema = z.object({
    channelName: z.string().min(1, 'Channel name is required'),
    uid: z.number().optional().default(0),
});

/**
 * POST /api/agora/token
 * Generate Agora RTC token for a channel (protected)
 */
router.post('/token', verifyToken, (req, res) => {
    try {
        const { channelName, uid } = tokenSchema.parse(req.body);
        const result = generateToken(channelName, uid);
        res.json(result);
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ error: err.errors[0].message });
        }
        console.error('[Agora] Token generation error:', err);
        res.status(500).json({ error: 'Failed to generate token.' });
    }
});

module.exports = router;
