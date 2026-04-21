// Socket.io handler — matchmaking, chat, skip, disconnect, report
const jwt = require('jsonwebtoken');
const { addToQueue, findKeywordMatch, findGeneralMatch, removeFromQueue } = require('../services/matchmaking');
const { createSession, endSession, getSession, flagSession } = require('../services/sessionManager');
const prisma = require('../src/prisma');

const redis = require('../src/redis');

/**
 * Register all Socket.io event handlers
 * @param {import('socket.io').Server} io
 */
function registerSocketHandlers(io) {
    // Authentication middleware — verify JWT from handshake
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) {
            return next(new Error('Authentication required'));
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.userId = decoded.userId;
            socket.userEmail = decoded.email;
            next();
        } catch (err) {
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', (socket) => {
        console.log(`[Socket] User connected: ${socket.userId} (${socket.id})`);

        // Increment and broadcast online count globally
        redis.incr('global_online_count').then((count) => {
            io.emit('online_count', count);
        });

        // ─── FIND MATCH ───
        socket.on('find_match', async ({ keywords = [], mode = 'video' }) => {
            try {
                const userId = socket.userId;
                console.log(`[Socket] ${userId} searching for match. Keywords: ${keywords.join(', ')} Mode: ${mode}`);

                // First try keyword match
                let match = await findKeywordMatch(userId, keywords, mode);

                if (!match) {
                    // Try general queue
                    match = await findGeneralMatch(userId, mode);
                }

                if (match) {
                    // Found a match — pair them
                    const { matchedUser } = match;
                    const sessionData = await createSession(userId, matchedUser.userId, mode);

                    // Globally cache the session routing for both users in Redis
                    const myKey = `user:${userId}:session`;
                    await redis.hset(myKey, 'sessionId', sessionData.sessionId);
                    await redis.hset(myKey, 'partnerId', matchedUser.userId);
                    await redis.hset(myKey, 'partnerSocketId', matchedUser.socketId);
                    await redis.expire(myKey, 7200);

                    const partnerKey = `user:${matchedUser.userId}:session`;
                    await redis.hset(partnerKey, 'sessionId', sessionData.sessionId);
                    await redis.hset(partnerKey, 'partnerId', userId);
                    await redis.hset(partnerKey, 'partnerSocketId', socket.id);
                    await redis.expire(partnerKey, 7200);

                    // Remove both from queue
                    await removeFromQueue(userId);
                    await removeFromQueue(matchedUser.userId);

                    // Emit match_found to both (designate local socket as caller)
                    socket.emit('match_found', {
                        sessionId: sessionData.sessionId,
                        mode,
                        role: 'caller'
                    });

                    io.to(matchedUser.socketId).emit('match_found', {
                        sessionId: sessionData.sessionId,
                        mode,
                        role: 'callee'
                    });

                    console.log(`[Socket] Matched: ${userId} <-> ${matchedUser.userId} (session: ${sessionData.sessionId})`);
                } else {
                    // No match found — add to queue
                    await addToQueue(userId, socket.id, keywords, mode);
                    socket.emit('waiting', { message: 'Looking for a match...' });

                    // Set up 10s fallback timer for keyword users
                    if (keywords.length > 0) {
                        setTimeout(async () => {
                            const isStillInQueue = await redis.get(`user_queue:${userId}`);
                            if (isStillInQueue) {
                                // Still waiting — check if they got matched. If no session key exists:
                                const session = await redis.hgetAll(`user:${userId}:session`);
                                if (!session || !session.sessionId) {
                                    const generalMatch = await findGeneralMatch(userId, mode);
                                    if (generalMatch) {
                                        socket.emit('find_match', { keywords: [], mode });
                                    }
                                }
                            }
                        }, 10000);
                    }
                }
            } catch (err) {
                console.error('[Socket] find_match error:', err);
                socket.emit('error', { message: 'Failed to find match.' });
            }
        });

        // ─── SEND MESSAGE ───
        socket.on('send_message', async ({ text, sessionId }) => {
            try {
                if (!text || !sessionId) return;
                const partnerSocketId = await redis.hget(`user:${socket.userId}:session`, 'partnerSocketId');
                
                // Forward message natively to partner pod
                if (partnerSocketId) {
                    io.to(partnerSocketId).emit('receive_message', {
                        text,
                        timestamp: Date.now(),
                    });
                }
            } catch (err) {
                console.error('[Socket] send_message error:', err);
            }
        });

        // ─── WEBRTC SIGNALING ───
        socket.on('webrtc_offer', async ({ sdp }) => {
            const partnerSocketId = await redis.hget(`user:${socket.userId}:session`, 'partnerSocketId');
            if (partnerSocketId) io.to(partnerSocketId).emit('webrtc_offer', { sdp });
        });

        socket.on('webrtc_answer', async ({ sdp }) => {
            const partnerSocketId = await redis.hget(`user:${socket.userId}:session`, 'partnerSocketId');
            if (partnerSocketId) io.to(partnerSocketId).emit('webrtc_answer', { sdp });
        });

        socket.on('webrtc_ice_candidate', async ({ candidate }) => {
            const partnerSocketId = await redis.hget(`user:${socket.userId}:session`, 'partnerSocketId');
            if (partnerSocketId) io.to(partnerSocketId).emit('webrtc_ice_candidate', { candidate });
        });

        // ─── SKIP ───
        socket.on('skip', async () => {
            try {
                const sessionData = await redis.hgetall(`user:${socket.userId}:session`);
                
                if (sessionData && Object.keys(sessionData).length > 0) {
                    await endSession(sessionData.sessionId);

                    if (sessionData.partnerSocketId) {
                        io.to(sessionData.partnerSocketId).emit('partner_disconnected');
                        await redis.del(`user:${sessionData.partnerId}:session`);
                    }
                    await redis.del(`user:${socket.userId}:session`);
                }

                socket.emit('session_ended');
            } catch (err) {
                console.error('[Socket] skip error:', err);
                socket.emit('error', { message: 'Failed to skip.' });
            }
        });

        // ─── DISCONNECT CHAT ───
        socket.on('disconnect_chat', async () => {
            try {
                const sessionData = await redis.hgetall(`user:${socket.userId}:session`);
                
                if (sessionData && Object.keys(sessionData).length > 0) {
                    await endSession(sessionData.sessionId);

                    if (sessionData.partnerSocketId) {
                        io.to(sessionData.partnerSocketId).emit('partner_disconnected');
                        await redis.del(`user:${sessionData.partnerId}:session`);
                    }
                    await redis.del(`user:${socket.userId}:session`);
                }

                socket.emit('session_ended');
            } catch (err) {
                console.error('[Socket] disconnect_chat error:', err);
            }
        });

        // ─── REPORT USER ───
        socket.on('report_user', async ({ reason, sessionId }) => {
            try {
                const sessionData = await redis.hgetall(`user:${socket.userId}:session`);
                if (!sessionData || !sessionData.partnerId) {
                    return socket.emit('error', { message: 'No active session to report.' });
                }

                // Save report to DB
                await prisma.report.create({
                    data: {
                        reporterId: socket.userId,
                        reportedId: sessionData.partnerId,
                        reason: reason || 'Inappropriate behavior',
                        sessionId: sessionId || sessionData.sessionId || 'unknown',
                    },
                });

                // Flag and end session
                if (sessionData.sessionId) {
                    await flagSession(sessionData.sessionId);
                    await endSession(sessionData.sessionId);
                }

                // End session natively across pods
                if (sessionData.partnerSocketId) {
                    io.to(sessionData.partnerSocketId).emit('session_ended', {
                        reason: 'Session ended by the other user.',
                    });
                    await redis.del(`user:${sessionData.partnerId}:session`);
                }

                await redis.del(`user:${socket.userId}:session`);
                socket.emit('report_submitted', { message: 'Report submitted. Session ended.' });
            } catch (err) {
                console.error('[Socket] report_user error:', err);
                socket.emit('error', { message: 'Failed to submit report.' });
            }
        });

        // ─── STOP SEARCHING ───
        socket.on('stop_search', async () => {
            try {
                await removeFromQueue(socket.userId);
                socket.emit('search_stopped');
            } catch (err) {
                console.error('[Socket] stop_search error:', err);
            }
        });

        // ─── DISCONNECT ───
        socket.on('disconnect', async () => {
            try {
                console.log(`[Socket] User disconnected: ${socket.userId} (${socket.id})`);

                const sessionData = await redis.hgetall(`user:${socket.userId}:session`);
                if (sessionData && Object.keys(sessionData).length > 0) {
                    if (sessionData.sessionId) {
                        await endSession(sessionData.sessionId);
                        if (sessionData.partnerSocketId) {
                            io.to(sessionData.partnerSocketId).emit('partner_disconnected');
                            await redis.del(`user:${sessionData.partnerId}:session`);
                        }
                    }
                }

                await removeFromQueue(socket.userId);
                await redis.del(`user:${socket.userId}:session`);

                // Broadcast updated global online count
                redis.decr('global_online_count').then((count) => {
                    io.emit('online_count', Math.max(0, count));
                });
            } catch (err) {
                console.error('[Socket] disconnect cleanup error:', err);
            }
        });
    });
}

/**
 * Get count of active connected users
 */
async function getActiveUserCount() {
    const count = await redis.get('global_online_count');
    return parseInt(count || '0', 10);
}

module.exports = { registerSocketHandlers, getActiveUserCount };
