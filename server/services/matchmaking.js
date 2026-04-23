// Matchmaking service — keyword-based queue with Redis
const redis = require('../src/redis');
const GENERAL_QUEUE_PREFIX = 'queue:general:';
const KEYWORD_QUEUE_PREFIX = 'queue:keywords:';
const QUEUE_TTL = 300; // 5 min TTL on queue entries
const FAILED_PAIR_PREFIX = 'failed_pair:';
const FAILED_PAIR_TTL = 60;

function normalizeKeywords(keywords = []) {
    return [...new Set(
        keywords
            .map((keyword) => keyword?.toLowerCase().trim())
            .filter(Boolean)
    )];
}

function normalizeUserData(userId, socketId, keywords, mode) {
    return {
        userId,
        socketId,
        keywords: normalizeKeywords(keywords),
        mode,
        timestamp: Date.now(),
    };
}

function getFailedPairKey(userIdA, userIdB) {
    const [first, second] = [userIdA, userIdB].sort();
    return `${FAILED_PAIR_PREFIX}${first}:${second}`;
}

async function isFailedPair(userIdA, userIdB) {
    const failed = await redis.get(getFailedPairKey(userIdA, userIdB));
    return !!failed;
}

async function addFailedPair(userIdA, userIdB) {
    await redis.set(getFailedPairKey(userIdA, userIdB), '1', 'EX', FAILED_PAIR_TTL);
}

/**
 * Add a user to the matchmaking queue
 * @param {string} userId
 * @param {string} socketId
 * @param {string[]} keywords
 * @param {string} mode - "video" or "text"
 */
async function addToQueue(userId, socketId, keywords, mode) {
    await removeFromQueue(userId);
    const normalizedKeywords = normalizeKeywords(keywords);
    const userData = JSON.stringify(normalizeUserData(userId, socketId, normalizedKeywords, mode));

    // Add to keyword-specific queues
    if (normalizedKeywords.length > 0) {
        for (const keyword of normalizedKeywords) {
            const key = `${KEYWORD_QUEUE_PREFIX}${mode}:${keyword}`;
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
    const normalizedKeywords = normalizeKeywords(keywords);
    if (normalizedKeywords.length === 0) return null;

    for (const keyword of normalizedKeywords) {
        const key = `${KEYWORD_QUEUE_PREFIX}${mode}:${keyword}`;
        const skippedMembers = [];
        
        // Try multiple candidates while preserving skipped users
        for (let i = 0; i < 10; i++) {
            const memberJson = await redis.spop(key);
            if (!memberJson) break; // Queue empty for this keyword

            const member = JSON.parse(memberJson);
            if (member.userId !== userId) {
                if (await isFailedPair(userId, member.userId)) {
                    skippedMembers.push(memberJson);
                    continue;
                }
                // Match found! Delete matched user from all queues to prevent phantom matching
                await removeFromQueue(member.userId, memberJson);
                if (skippedMembers.length > 0) {
                    await redis.sadd(key, ...skippedMembers);
                }
                return { matchedUser: member, matchType: 'keyword' };
            } else {
                // Was ourselves; put back and stop trying
                skippedMembers.push(memberJson);
                break;
            }
        }

        if (skippedMembers.length > 0) {
            await redis.sadd(key, ...skippedMembers);
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
    const skippedMembers = [];

    for (let i = 0; i < 10; i++) {
        const memberJson = await redis.spop(generalKey);
        if (!memberJson) break;

        const member = JSON.parse(memberJson);
        if (member.userId !== userId) {
            if (await isFailedPair(userId, member.userId)) {
                skippedMembers.push(memberJson);
                continue;
            }
            await removeFromQueue(member.userId, memberJson);
            if (skippedMembers.length > 0) {
                await redis.sadd(generalKey, ...skippedMembers);
            }
            return { matchedUser: member, matchType: 'random' };
        } else {
            skippedMembers.push(memberJson);
            break;
        }
    }

    if (skippedMembers.length > 0) {
        await redis.sadd(generalKey, ...skippedMembers);
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
            const key = `${KEYWORD_QUEUE_PREFIX}${userData.mode}:${keyword}`;
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
    addFailedPair,
    normalizeKeywords,
};
