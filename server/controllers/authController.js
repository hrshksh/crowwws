// Auth controller — handles registration, OTP verification, login, and profile
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const prisma = require('../src/prisma');
const redis = require('../src/redis');
const { sendOTP } = require('../services/emailService');

// Validation schemas
const registerSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
});

const verifyOtpSchema = z.object({
    email: z.string().email(),
    otp: z.string().length(6, 'OTP must be 6 digits'),
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1, 'Password is required'),
});

const resendOtpSchema = z.object({
    email: z.string().email(),
});

/**
 * POST /api/auth/register
 * Hash password, send OTP, store in Redis with 10 min TTL
 */
async function register(req, res) {
    try {
        const { email, password } = registerSchema.parse(req.body);

        // Check if email is banned
        const banned = await prisma.bannedEmail.findUnique({ where: { email } });
        if (banned) {
            return res.status(403).json({ error: 'This email has been banned.' });
        }

        // Check if user already exists and is verified
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser && existingUser.isVerified) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Store pending registration in Redis (10 min TTL)
        await redis.set(
            `pending:${email}`,
            JSON.stringify({ email, password: hashedPassword }),
            'EX',
            600
        );

        // Generate & store OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        await redis.set(`otp:${email}`, otp, 'EX', 600);

        // Send OTP email
        let emailSent = false;
        try {
            await sendOTP(email, otp);
            emailSent = true;
        } catch (emailErr) {
            console.error('[Auth] Failed to send OTP email:', emailErr.message);
            console.log(`[Auth][DEV] OTP for ${email}: ${otp}`);
        }

        // If email failed, return OTP directly so the user can still verify (dev mode)
        if (emailSent) {
            res.json({ message: 'OTP sent to your email.' });
        } else {
            res.json({ message: 'OTP sent to your email.', devOtp: otp });
        }
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ error: err.errors[0].message });
        }
        console.error('[Auth] Register error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
}

/**
 * POST /api/auth/verify-otp
 * Verify OTP from Redis, create user in DB, return JWT
 */
async function verifyOtp(req, res) {
    try {
        const { email, otp } = verifyOtpSchema.parse(req.body);

        // Get stored OTP
        const storedOtp = await redis.get(`otp:${email}`);
        if (!storedOtp) {
            return res.status(400).json({ error: 'OTP expired. Please request a new one.' });
        }
        if (storedOtp !== otp) {
            return res.status(400).json({ error: 'Invalid OTP.' });
        }

        // Get pending registration data
        const pendingData = await redis.get(`pending:${email}`);
        if (!pendingData) {
            return res.status(400).json({ error: 'Registration expired. Please register again.' });
        }

        const { password: hashedPassword } = JSON.parse(pendingData);

        // Create or update user
        const user = await prisma.user.upsert({
            where: { email },
            update: { isVerified: true, password: hashedPassword },
            create: { email, password: hashedPassword, isVerified: true },
        });

        // Cleanup Redis
        await redis.del(`otp:${email}`, `pending:${email}`);

        // Generate JWT
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({ token, user: { id: user.id, email: user.email } });
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ error: err.errors[0].message });
        }
        console.error('[Auth] Verify OTP error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
}

/**
 * POST /api/auth/login
 * Verify credentials, return JWT
 */
async function login(req, res) {
    try {
        const { email, password } = loginSchema.parse(req.body);

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.isVerified) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        if (user.isBanned) {
            return res.status(403).json({ error: `Account banned: ${user.banReason || 'Policy violation'}` });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({ token, user: { id: user.id, email: user.email } });
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ error: err.errors[0].message });
        }
        console.error('[Auth] Login error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
}

async function resendOtp(req, res) {
    try {
        const { email } = resendOtpSchema.parse(req.body);

        const pendingData = await redis.get(`pending:${email}`);
        if (!pendingData) {
            return res.status(400).json({ error: 'Registration expired. Please register again.' });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        await redis.set(`otp:${email}`, otp, 'EX', 600);
        await redis.expire(`pending:${email}`, 600);

        let emailSent = false;
        try {
            await sendOTP(email, otp);
            emailSent = true;
        } catch (emailErr) {
            console.error('[Auth] Failed to resend OTP email:', emailErr.message);
            console.log(`[Auth][DEV] Resent OTP for ${email}: ${otp}`);
        }

        if (emailSent) {
            res.json({ message: 'OTP resent to your email.' });
        } else {
            res.json({ message: 'OTP resent to your email.', devOtp: otp });
        }
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ error: err.errors[0].message });
        }
        console.error('[Auth] Resend OTP error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
}

/**
 * GET /api/auth/me
 * Return current user profile (protected)
 */
async function getMe(req, res) {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: { id: true, email: true, createdAt: true },
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        res.json(user);
    } catch (err) {
        console.error('[Auth] GetMe error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
}

module.exports = { register, verifyOtp, resendOtp, login, getMe };
