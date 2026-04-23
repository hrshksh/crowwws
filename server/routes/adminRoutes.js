// Admin API routes — all protected by admin JWT middleware
const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { verifyAdmin } = require('../middleware/authMiddleware');
const {
    getStats,
    getReports,
    reviewReport,
    banUser,
    unbanUser,
    getFlags,
    reviewFlag,
    getUsers,
    getAnalytics,
} = require('../controllers/adminController');

// Apply admin auth to all routes
router.use(verifyAdmin);

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
    try {
        const stats = await getStats();
        res.json(stats);
    } catch (err) {
        console.error('[Admin] Stats error:', err);
        res.status(500).json({ error: 'Failed to fetch stats.' });
    }
});

// GET /api/admin/reports?reviewed=false&page=1&limit=20
router.get('/reports', async (req, res) => {
    try {
        const { reviewed, page, limit } = req.query;
        const data = await getReports(reviewed, parseInt(page) || 1, parseInt(limit) || 20);
        res.json(data);
    } catch (err) {
        console.error('[Admin] Reports error:', err);
        res.status(500).json({ error: 'Failed to fetch reports.' });
    }
});

const reportReviewSchema = z.object({
    outcome: z.enum(['dismissed', 'banned', 'warned']),
});

router.post('/reports/:id/review', async (req, res) => {
    try {
        const { outcome } = reportReviewSchema.parse(req.body);
        const report = await reviewReport(req.params.id, outcome);
        res.json({ message: 'Report reviewed.', report });
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ error: err.errors[0].message });
        }
        console.error('[Admin] Review report error:', err);
        res.status(500).json({ error: 'Failed to review report.' });
    }
});

// POST /api/admin/ban
const banSchema = z.object({
    userId: z.string().uuid(),
    reason: z.string().optional(),
    duration: z.string().optional(),
});

router.post('/ban', async (req, res) => {
    try {
        const { userId, reason, duration } = banSchema.parse(req.body);
        const user = await banUser(userId, reason, duration);
        res.json({ message: 'User banned.', user });
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ error: err.errors[0].message });
        }
        console.error('[Admin] Ban error:', err);
        res.status(500).json({ error: 'Failed to ban user.' });
    }
});

// POST /api/admin/unban
const unbanSchema = z.object({
    userId: z.string().uuid(),
});

router.post('/unban', async (req, res) => {
    try {
        const { userId } = unbanSchema.parse(req.body);
        const user = await unbanUser(userId);
        res.json({ message: 'User unbanned.', user });
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ error: err.errors[0].message });
        }
        console.error('[Admin] Unban error:', err);
        res.status(500).json({ error: 'Failed to unban user.' });
    }
});

// GET /api/admin/flags?reviewed=false&page=1&limit=20
router.get('/flags', async (req, res) => {
    try {
        const { reviewed, page, limit } = req.query;
        const data = await getFlags(reviewed, parseInt(page) || 1, parseInt(limit) || 20);
        res.json(data);
    } catch (err) {
        console.error('[Admin] Flags error:', err);
        res.status(500).json({ error: 'Failed to fetch flags.' });
    }
});

// POST /api/admin/flags/:id/review
const reviewSchema = z.object({
    action: z.enum(['dismiss', 'ban']),
});

router.post('/flags/:id/review', async (req, res) => {
    try {
        const { action } = reviewSchema.parse(req.body);
        const flag = await reviewFlag(req.params.id, action);
        res.json({ message: `Flag ${action}ed.`, flag });
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ error: err.errors[0].message });
        }
        console.error('[Admin] Review flag error:', err);
        res.status(500).json({ error: 'Failed to review flag.' });
    }
});

// GET /api/admin/users?page=1&limit=50&search=email
router.get('/users', async (req, res) => {
    try {
        const { page, limit, search } = req.query;
        const data = await getUsers(parseInt(page) || 1, parseInt(limit) || 50, search);
        res.json(data);
    } catch (err) {
        console.error('[Admin] Users error:', err);
        res.status(500).json({ error: 'Failed to fetch users.' });
    }
});

// GET /api/admin/analytics
router.get('/analytics', async (req, res) => {
    try {
        const data = await getAnalytics();
        res.json(data);
    } catch (err) {
        console.error('[Admin] Analytics error:', err);
        res.status(500).json({ error: 'Failed to fetch analytics.' });
    }
});

module.exports = router;
