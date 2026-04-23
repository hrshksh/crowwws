// Session manager — tracks active chat sessions in Redis and PostgreSQL
const redis = require('../src/redis');
const prisma = require('../src/prisma');
const { v4: uuidv4 } = require('uuid');

const SESSION_TTL = 3600; // 1 hour

/**
 * Create a new chat session
 * @param {string} user1Id
 * @param {string} user2Id
 * @param {string} mode - "video" or "text"
 * @returns {object} session data
 */
async function createSession(user1Id, user2Id, mode = 'video') {
    const sessionId = uuidv4();
    const sessionData = {
        sessionId,
        attemptId: uuidv4(),
        user1Id,
        user2Id,
        mode,
        startTime: Date.now(),
        flagged: false,
        endReason: null,
    };

    // Store in Redis for fast access
    await redis.set(
        `session:${sessionId}`,
        JSON.stringify(sessionData),
        'EX',
        SESSION_TTL
    );

    // Store in PostgreSQL for persistence
    await prisma.session.create({
        data: {
            id: sessionId,
            user1Id,
            user2Id,
            mode,
        },
    });

    return sessionData;
}

/**
 * Get session data from Redis
 * @param {string} sessionId
 */
async function getSession(sessionId) {
    const data = await redis.get(`session:${sessionId}`);
    return data ? JSON.parse(data) : null;
}

/**
 * End a session — cleanup Redis and update DB
 * @param {string} sessionId
 */
async function endSession(sessionId) {
    const sessionData = await getSession(sessionId);

    // Remove from Redis
    await redis.del(`session:${sessionId}`);

    // Update DB
    await prisma.session.update({
        where: { id: sessionId },
        data: { endTime: new Date() },
    }).catch(() => { }); // Ignore if session doesn't exist in DB

    return sessionData;
}

async function setSessionEndReason(sessionId, reason) {
    const data = await getSession(sessionId);
    if (!data) return null;

    data.endReason = reason;
    await redis.set(`session:${sessionId}`, JSON.stringify(data), 'EX', SESSION_TTL);
    return data;
}

/**
 * Flag a session for moderation review
 * @param {string} sessionId
 */
async function flagSession(sessionId) {
    const data = await getSession(sessionId);
    if (data) {
        data.flagged = true;
        await redis.set(`session:${sessionId}`, JSON.stringify(data), 'EX', SESSION_TTL);
    }

    await prisma.session.update({
        where: { id: sessionId },
        data: { flagged: true },
    }).catch(() => { });
}

/**
 * Get count of active sessions (from Redis pipeline)
 */
async function getActiveSessionCount() {
    const keys = await redis.keys('session:*');
    return keys.length;
}

module.exports = {
    createSession,
    getSession,
    endSession,
    setSessionEndReason,
    flagSession,
    getActiveSessionCount,
};
