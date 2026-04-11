// Matchmaking service — keyword-based queue with Redis
const redis = require('../src/redis');
const { v4: uuidv4 } = require('uuid');

const GENERAL_QUEUE_KEY = 'queue:general';
const KEYWORD_QUEUE_PREFIX = 'queue:keywords:';
const QUEUE_TTL = 300; // 5 min TTL on queue entries

/**
 * Add a user to the matchmaking queue
 * @param {string} userId
 * @param {string} socketId
 * @param {string[]} keywords
 * @param {string} mode - "video" or "text"
 */
async function addToQueue(userId, socketId, keywords, mode) {
    const userData = JSON.stringify({ userId, socketId, keywords, mode, timestamp: Date.now() });

    // Add to keyword-specific queues
    if (keywords && keywords.length > 0) {
        for (const keyword of keywords) {
            const key = `${KEYWORD_QUEUE_PREFIX}${keyword.toLowerCase().trim()}`;
            await redis.sadd(key, userData);
            await redis.expire(key, QUEUE_TTL);
        }
    }

    // Always add to general queue as fallback
    await redis.sadd(GENERAL_QUEUE_KEY, userData);
    await redis.expire(GENERAL_QUEUE_KEY, QUEUE_TTL);

    // Store user's queue membership for cleanup
    await redis.set(`user_queue:${userId}`, userData, 'EX', QUEUE_TTL);
}

/**
 * Find a match for the given user based on keyword overlap
 * @param {string} userId
 * @param {string[]} keywords
 * @param {string} mode
 * @returns {{ matchedUser: object, matchType: string } | null}
 */
async function findKeywordMatch(userId, keywords, mode) {
    if (!keywords || keywords.length === 0) return null;

    for (const keyword of keywords) {
        const key = `${KEYWORD_QUEUE_PREFIX}${keyword.toLowerCase().trim()}`;
        const members = await redis.smembers(key);

        for (const memberJson of members) {
            const member = JSON.parse(memberJson);
            // Don't match with self, and ensure same mode
            if (member.userId !== userId && member.mode === mode) {
                return { matchedUser: member, matchType: 'keyword' };
            }
        }
    }

    return null;
}

/**
 * Find any match from the general queue
 * @param {string} userId
 * @param {string} mode
 * @returns {{ matchedUser: object, matchType: string } | null}
 */
async function findGeneralMatch(userId, mode) {
    const members = await redis.smembers(GENERAL_QUEUE_KEY);

    for (const memberJson of members) {
        const member = JSON.parse(memberJson);
        if (member.userId !== userId && member.mode === mode) {
            return { matchedUser: member, matchType: 'random' };
        }
    }

    return null;
}

/**
 * Remove a user from all queues
 * @param {string} userId
 */
async function removeFromQueue(userId) {
    const userDataJson = await redis.get(`user_queue:${userId}`);
    if (!userDataJson) return;

    const userData = JSON.parse(userDataJson);

    // Remove from keyword queues
    if (userData.keywords && userData.keywords.length > 0) {
        for (const keyword of userData.keywords) {
            const key = `${KEYWORD_QUEUE_PREFIX}${keyword.toLowerCase().trim()}`;
            await redis.srem(key, userDataJson);
        }
    }

    // Remove from general queue
    await redis.srem(GENERAL_QUEUE_KEY, userDataJson);

    // Remove user queue tracking key
    await redis.del(`user_queue:${userId}`);
}

/**
 * Get the number of users currently in queue
 */
async function getQueueSize() {
    return await redis.scard(GENERAL_QUEUE_KEY);
}

module.exports = {
    addToQueue,
    findKeywordMatch,
    findGeneralMatch,
    removeFromQueue,
    getQueueSize,
};
