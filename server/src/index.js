// Main server entry point
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');
const redis = require('./redis');
const prisma = require('./prisma');

// Route imports
const authRoutes = require('../routes/authRoutes');
const adminRoutes = require('../routes/adminRoutes');
const adminAuthRoutes = require('../routes/adminAuthRoutes');
const contentRoutes = require('../routes/contentRoutes');

// Socket handler
const { registerSocketHandlers } = require('../sockets/socketHandler');

const app = express();
const server = http.createServer(app);

// CORS — allow any localhost port in dev
const allowedOrigins = [
    'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175',
    'http://127.0.0.1:5173', 'http://127.0.0.1:5174', 'http://127.0.0.1:5175',
];

if (process.env.FRONTEND_URL) allowedOrigins.push(process.env.FRONTEND_URL);
if (process.env.ADMIN_URL) allowedOrigins.push(process.env.ADMIN_URL);
if (process.env.CORS_ORIGINS) allowedOrigins.push(...process.env.CORS_ORIGINS.split(','));

// Socket.io setup
const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true,
    },
});

// Attach horizontal scaling Redis adapter if REDIS_URL is provided
if (process.env.REDIS_URL || process.env.NODE_ENV === 'production') {
    const pubClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    const subClient = pubClient.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
    console.log('[Socket] Redis Horizontal scaling adapter attached');
}

// Middleware
app.use(cors({
    origin: allowedOrigins,
    credentials: true,
}));
app.use(express.json({ limit: '20mb' }));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/content', contentRoutes);

// Production static serving
if (process.env.NODE_ENV === 'production') {
    const path = require('path');
    
    app.use('/admin', express.static(path.join(__dirname, '../../admin/dist')));
    app.use(express.static(path.join(__dirname, '../../client/dist')));
    
    app.get('/admin/*', (req, res) => {
        res.sendFile(path.join(__dirname, '../../admin/dist/index.html'));
    });
    
    app.get('*', (req, res) => {
        if (!req.path.startsWith('/api/')) {
            res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
        } else {
            res.status(404).json({ error: 'API route not found' });
        }
    });
}

// Register socket handlers
registerSocketHandlers(io);

// Start server
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`[Server] Running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('[Server] Shutting down...');
    await prisma.$disconnect();
    server.close();
    process.exit(0);
});
