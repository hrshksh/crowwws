// Matchmaking service — keyword-based queue with Redis
const redis = require('../src/redis');
const { v4: uuidv4 } = require('uuid');

const GENERAL_QUEUE_PREFIX = 'queue:general:';
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
            const key = `${KEYWORD_QUEUE_PREFIX}${mode}:${keyword.toLowerCase().trim()}`;
            await redis.sadd(key, userData);
            await redis.expire(key, QUEUE_TTL);
        }
    }

    // Always add to general queue as fallback
    const generalKey = `${GENERAL_QUEUE_PREFIX}${mode}`;
    await redis.sadd(generalKey, userData);
    await redis.expire(generalKey, QUEUE_TTL);

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
        const key = `${KEYWORD_QUEUE_PREFIX}${mode}:${keyword.toLowerCase().trim()}`;
        
        // Try up to 3 times to pop a user (safeguard against self-matching)
        for (let i = 0; i < 3; i++) {
            const memberJson = await redis.spop(key);
            if (!memberJson) break; // Queue empty for this keyword

            const member = JSON.parse(memberJson);
            if (member.userId !== userId) {
                // Match found! Delete matched user from all queues to prevent phantom matching
                await removeFromQueue(member.userId, memberJson);
                return { matchedUser: member, matchType: 'keyword' };
            } else {
                // Was ourselves; put back and stop trying
                await redis.sadd(key, memberJson);
                break;
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
    const generalKey = `${GENERAL_QUEUE_PREFIX}${mode}`;

    for (let i = 0; i < 3; i++) {
        const memberJson = await redis.spop(generalKey);
        if (!memberJson) break;

        const member = JSON.parse(memberJson);
        if (member.userId !== userId) {
            await removeFromQueue(member.userId, memberJson);
            return { matchedUser: member, matchType: 'random' };
        } else {
            await redis.sadd(generalKey, memberJson);
            break;
        }
    }

    return null;
}

/**
 * Remove a user from all queues
 * @param {string} userId
 */
async function removeFromQueue(userId, existingJson = null) {
    const userDataJson = existingJson || await redis.get(`user_queue:${userId}`);
    if (!userDataJson) return;

    const userData = JSON.parse(userDataJson);

    // Remove from keyword queues
    if (userData.keywords && userData.keywords.length > 0) {
        for (const keyword of userData.keywords) {
            const key = `${KEYWORD_QUEUE_PREFIX}${userData.mode}:${keyword.toLowerCase().trim()}`;
            await redis.srem(key, userDataJson);
        }
    }

    // Remove from general queue
    await redis.srem(`${GENERAL_QUEUE_PREFIX}${userData.mode}`, userDataJson);

    // Remove user queue tracking key
    await redis.del(`user_queue:${userId}`);
}

/**
 * Get the number of users currently in queue
 */
async function getQueueSize() {
    const videoSize = await redis.scard(`${GENERAL_QUEUE_PREFIX}video`) || 0;
    const textSize = await redis.scard(`${GENERAL_QUEUE_PREFIX}text`) || 0;
    return videoSize + textSize;
}

module.exports = {
    addToQueue,
    findKeywordMatch,
    findGeneralMatch,
    removeFromQueue,
    getQueueSize,
};
