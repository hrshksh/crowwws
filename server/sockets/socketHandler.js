// Socket.io handler — matchmaking, chat, skip, disconnect, report
const jwt = require('jsonwebtoken');
const { addToQueue, findKeywordMatch, findGeneralMatch, removeFromQueue } = require('../services/matchmaking');
const { createSession, endSession, getSession, flagSession } = require('../services/sessionManager');
const { generateToken, generateChannelName } = require('../services/agoraService');
const { analyzeText, createFlag, incrementWarnings } = require('../services/moderation');
const prisma = require('../src/prisma');

// Track active connections: userId -> { socketId, sessionId, partnerId, partnerSocketId }
const activeUsers = new Map();
// Track socketId -> userId for reverse lookup
const socketToUser = new Map();

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

        // Track connection
        activeUsers.set(socket.userId, { socketId: socket.id, sessionId: null, partnerId: null, partnerSocketId: null });
        socketToUser.set(socket.id, socket.userId);

        // Broadcast online count
        io.emit('online_count', activeUsers.size);

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
                    const channelName = generateChannelName();
                    const sessionData = await createSession(userId, matchedUser.userId, mode);

                    // Generate Agora tokens for both users
                    const token1 = generateToken(channelName, 1);
                    const token2 = generateToken(channelName, 2);

                    // Update tracking for both users
                    activeUsers.set(userId, {
                        socketId: socket.id,
                        sessionId: sessionData.sessionId,
                        partnerId: matchedUser.userId,
                        partnerSocketId: matchedUser.socketId,
                    });
                    activeUsers.set(matchedUser.userId, {
                        socketId: matchedUser.socketId,
                        sessionId: sessionData.sessionId,
                        partnerId: userId,
                        partnerSocketId: socket.id,
                    });

                    // Remove both from queue
                    await removeFromQueue(userId);
                    await removeFromQueue(matchedUser.userId);

                    // Emit match_found to both
                    socket.emit('match_found', {
                        sessionId: sessionData.sessionId,
                        agoraToken: token1.token,
                        channelName,
                        appId: token1.appId,
                        uid: 1,
                        mode,
                    });

                    io.to(matchedUser.socketId).emit('match_found', {
                        sessionId: sessionData.sessionId,
                        agoraToken: token2.token,
                        channelName,
                        appId: token2.appId,
                        uid: 2,
                        mode,
                    });

                    console.log(`[Socket] Matched: ${userId} <-> ${matchedUser.userId} (session: ${sessionData.sessionId})`);
                } else {
                    // No match found — add to queue
                    await addToQueue(userId, socket.id, keywords, mode);
                    socket.emit('waiting', { message: 'Looking for a match...' });

                    // Set up 10s fallback timer for keyword users
                    if (keywords.length > 0) {
                        setTimeout(async () => {
                            const userData = activeUsers.get(userId);
                            if (userData && !userData.sessionId) {
                                // Still waiting — try general match
                                const generalMatch = await findGeneralMatch(userId, mode);
                                if (generalMatch) {
                                    // Trigger match by re-emitting
                                    socket.emit('find_match', { keywords: [], mode });
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

                const userData = activeUsers.get(socket.userId);
                if (!userData || userData.sessionId !== sessionId) return;

                // Moderate text asynchronously
                analyzeText(text).then(async (result) => {
                    if (result.flagged) {
                        await createFlag({
                            sessionId,
                            userId: socket.userId,
                            type: 'text',
                            confidence: result.score,
                        });

                        const warningCount = await incrementWarnings(socket.userId);
                        socket.emit('moderation_warning', {
                            message: 'Your message was flagged for inappropriate content.',
                            warningCount,
                        });

                        if (warningCount >= 3) {
                            // Auto-ban after 3 flags
                            await prisma.user.update({
                                where: { id: socket.userId },
                                data: { isBanned: true, banReason: 'Automated ban: repeated toxic messages' },
                            });
                            socket.emit('banned', { reason: 'Your account has been banned for repeated policy violations.' });
                            socket.disconnect(true);
                            return;
                        }
                    }
                }).catch((err) => console.error('[Socket] Text moderation error:', err));

                // Forward message to partner immediately (don't block on moderation)
                if (userData.partnerSocketId) {
                    io.to(userData.partnerSocketId).emit('receive_message', {
                        text,
                        timestamp: Date.now(),
                    });
                }
            } catch (err) {
                console.error('[Socket] send_message error:', err);
            }
        });

        // ─── SKIP ───
        socket.on('skip', async () => {
            try {
                const userData = activeUsers.get(socket.userId);
                if (!userData) return;

                if (userData.sessionId) {
                    await endSession(userData.sessionId);

                    // Notify partner
                    if (userData.partnerSocketId) {
                        io.to(userData.partnerSocketId).emit('partner_disconnected');
                        // Reset partner's tracking
                        const partnerData = activeUsers.get(userData.partnerId);
                        if (partnerData) {
                            activeUsers.set(userData.partnerId, {
                                socketId: partnerData.socketId,
                                sessionId: null,
                                partnerId: null,
                                partnerSocketId: null,
                            });
                        }
                    }
                }

                // Reset user's tracking
                activeUsers.set(socket.userId, {
                    socketId: socket.id,
                    sessionId: null,
                    partnerId: null,
                    partnerSocketId: null,
                });

                socket.emit('session_ended');
            } catch (err) {
                console.error('[Socket] skip error:', err);
                socket.emit('error', { message: 'Failed to skip.' });
            }
        });

        // ─── DISCONNECT CHAT ───
        socket.on('disconnect_chat', async () => {
            try {
                const userData = activeUsers.get(socket.userId);
                if (!userData) return;

                if (userData.sessionId) {
                    await endSession(userData.sessionId);

                    if (userData.partnerSocketId) {
                        io.to(userData.partnerSocketId).emit('partner_disconnected');
                        const partnerData = activeUsers.get(userData.partnerId);
                        if (partnerData) {
                            activeUsers.set(userData.partnerId, {
                                socketId: partnerData.socketId,
                                sessionId: null,
                                partnerId: null,
                                partnerSocketId: null,
                            });
                        }
                    }
                }

                activeUsers.set(socket.userId, {
                    socketId: socket.id,
                    sessionId: null,
                    partnerId: null,
                    partnerSocketId: null,
                });

                socket.emit('session_ended');
            } catch (err) {
                console.error('[Socket] disconnect_chat error:', err);
            }
        });

        // ─── REPORT USER ───
        socket.on('report_user', async ({ reason, sessionId }) => {
            try {
                const userData = activeUsers.get(socket.userId);
                if (!userData || !userData.partnerId) {
                    return socket.emit('error', { message: 'No active session to report.' });
                }

                // Save report to DB
                await prisma.report.create({
                    data: {
                        reporterId: socket.userId,
                        reportedId: userData.partnerId,
                        reason: reason || 'Inappropriate behavior',
                        sessionId: sessionId || userData.sessionId || 'unknown',
                    },
                });

                // Flag session
                if (userData.sessionId) {
                    await flagSession(userData.sessionId);
                    await endSession(userData.sessionId);
                }

                // End session for both users
                if (userData.partnerSocketId) {
                    io.to(userData.partnerSocketId).emit('session_ended', {
                        reason: 'Session ended by the other user.',
                    });
                    const partnerData = activeUsers.get(userData.partnerId);
                    if (partnerData) {
                        activeUsers.set(userData.partnerId, {
                            socketId: partnerData.socketId,
                            sessionId: null,
                            partnerId: null,
                            partnerSocketId: null,
                        });
                    }
                }

                activeUsers.set(socket.userId, {
                    socketId: socket.id,
                    sessionId: null,
                    partnerId: null,
                    partnerSocketId: null,
                });

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

                const userData = activeUsers.get(socket.userId);
                if (userData) {
                    if (userData.sessionId) {
                        await endSession(userData.sessionId);
                        if (userData.partnerSocketId) {
                            io.to(userData.partnerSocketId).emit('partner_disconnected');
                            const partnerData = activeUsers.get(userData.partnerId);
                            if (partnerData) {
                                activeUsers.set(userData.partnerId, {
                                    socketId: partnerData.socketId,
                                    sessionId: null,
                                    partnerId: null,
                                    partnerSocketId: null,
                                });
                            }
                        }
                    }
                    await removeFromQueue(socket.userId);
                }

                activeUsers.delete(socket.userId);
                socketToUser.delete(socket.id);

                // Broadcast updated online count
                io.emit('online_count', activeUsers.size);
            } catch (err) {
                console.error('[Socket] disconnect cleanup error:', err);
            }
        });
    });
}

/**
 * Get count of active connected users
 */
function getActiveUserCount() {
    return activeUsers.size;
}

module.exports = { registerSocketHandlers, getActiveUserCount };
