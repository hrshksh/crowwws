// Admin authentication routes (separate from user auth)
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { z } = require('zod');

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});

/**
 * POST /api/admin/auth/login
 * Authenticate admin with hardcoded credentials from env
 */
router.post('/login', (req, res) => {
    try {
        const { email, password } = loginSchema.parse(req.body);

        if (email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD) {
            return res.status(401).json({ error: 'Invalid admin credentials.' });
        }

        const token = jwt.sign(
            { isAdmin: true, email },
            process.env.JWT_ADMIN_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ token });
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ error: err.errors[0].message });
        }
        console.error('[Admin Auth] Login error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

module.exports = router;
