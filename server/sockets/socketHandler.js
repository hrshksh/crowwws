// Socket.io handler — matchmaking, chat, skip, disconnect, report
const jwt = require('jsonwebtoken');
const { addToQueue, findKeywordMatch, findGeneralMatch, removeFromQueue, addFailedPair, normalizeKeywords } = require('../services/matchmaking');
const { createSession, endSession, getSession, setSessionEndReason, flagSession } = require('../services/sessionManager');
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

        const setSessionRouting = async (userId, socketId, sessionData, partner, keywords) => {
            const routingKey = `user:${userId}:session`;
            await redis.hset(routingKey, 'sessionId', sessionData.sessionId);
            await redis.hset(routingKey, 'attemptId', sessionData.attemptId);
            await redis.hset(routingKey, 'partnerId', partner.userId);
            await redis.hset(routingKey, 'partnerSocketId', partner.socketId);
            await redis.hset(routingKey, 'mode', sessionData.mode);
            await redis.hset(routingKey, 'keywords', JSON.stringify(normalizeKeywords(keywords)));
            await redis.expire(routingKey, 7200);
        };

        const clearSessionRouting = async (userId, partnerId = null) => {
            await redis.del(`user:${userId}:session`);
            if (partnerId) {
                await redis.del(`user:${partnerId}:session`);
            }
        };

        const endActiveSession = async (sessionId, reason) => {
            if (!sessionId) return null;
            await setSessionEndReason(sessionId, reason);
            return endSession(sessionId);
        };

        const startMatchSearch = async (keywords = [], mode = 'video', reason = 'search') => {
            const userId = socket.userId;
            const normalizedKeywords = normalizeKeywords(keywords);
            console.log(`[Socket] ${userId} searching for match. Keywords: ${normalizedKeywords.join(', ')} Mode: ${mode}`);

            let match = await findKeywordMatch(userId, normalizedKeywords, mode);

            if (!match) {
                match = await findGeneralMatch(userId, mode);
            }

            if (match) {
                const { matchedUser } = match;
                const sessionData = await createSession(userId, matchedUser.userId, mode);
                const matchedUserQueueData = await redis.get(`user_queue:${matchedUser.userId}`);
                const matchedKeywords = matchedUserQueueData ? JSON.parse(matchedUserQueueData).keywords || [] : matchedUser.keywords || [];

                await setSessionRouting(socket.userId, socket.id, sessionData, { userId: matchedUser.userId, socketId: matchedUser.socketId }, normalizedKeywords);
                await setSessionRouting(matchedUser.userId, matchedUser.socketId, sessionData, { userId, socketId: socket.id }, matchedKeywords);

                await removeFromQueue(userId);
                await removeFromQueue(matchedUser.userId);

                socket.emit('match_found', {
                    sessionId: sessionData.sessionId,
                    attemptId: sessionData.attemptId,
                    mode,
                    role: 'caller'
                });

                io.to(matchedUser.socketId).emit('match_found', {
                    sessionId: sessionData.sessionId,
                    attemptId: sessionData.attemptId,
                    mode,
                    role: 'callee'
                });

                console.log(`[Socket] Matched: ${userId} <-> ${matchedUser.userId} (session: ${sessionData.sessionId})`);
                return;
            }

            await addToQueue(userId, socket.id, normalizedKeywords, mode);
            socket.emit('waiting', { message: 'Looking for a match...', reason });

            if (normalizedKeywords.length > 0) {
                setTimeout(async () => {
                    try {
                        const isStillInQueue = await redis.get(`user_queue:${userId}`);
                        if (!isStillInQueue) return;

                        const session = await redis.hgetall(`user:${userId}:session`);
                        if (session && session.sessionId) return;

                        await removeFromQueue(userId);
                        await startMatchSearch([], mode, reason);
                    } catch (err) {
                        console.error('[Socket] keyword fallback error:', err);
                    }
                }, 10000);
            }
        };

        // Increment and broadcast online count globally
        redis.incr('global_online_count').then((count) => {
            io.emit('online_count', count);
        });

        // ─── FIND MATCH ───
        socket.on('find_match', async ({ keywords = [], mode = 'video' }) => {
            try {
                await startMatchSearch(keywords, mode);
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
