// Moderation service — Perspective API (text)
const axios = require('axios');
const prisma = require('../src/prisma');

const PERSPECTIVE_API_KEY = process.env.PERSPECTIVE_API_KEY;

/**
 * Analyze text for toxicity using Google Perspective API
 * @param {string} text
 * @returns {{ score: number, flagged: boolean }}
 */
async function analyzeText(text) {
    if (!PERSPECTIVE_API_KEY) {
        console.warn('[Moderation] Perspective API key not configured, skipping text analysis');
        return { score: 0, flagged: false };
    }

    try {
        const response = await axios.post(
            `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${PERSPECTIVE_API_KEY}`,
            {
                comment: { text },
                languages: ['en'],
                requestedAttributes: {
                    TOXICITY: {},
                    SEVERE_TOXICITY: {},
                    IDENTITY_ATTACK: {},
                    THREAT: {},
                    SEXUALLY_EXPLICIT: {},
                },
            }
        );

        const toxicityScore =
            response.data.attributeScores.TOXICITY.summaryScore.value;

        return {
            score: toxicityScore,
            flagged: toxicityScore > 0.85,
        };
    } catch (err) {
        console.error('[Moderation] Perspective API error:', err.message);
        return { score: 0, flagged: false };
    }
}

/**
 * Record a moderation flag in the database
 * @param {object} params
 */
async function createFlag({ sessionId, userId, type, confidence }) {
    return prisma.moderationFlag.create({
        data: { sessionId, userId, type, confidence },
    });
}

/**
 * Get warning count for a user from Redis
 * @param {string} userId
 */
async function getWarningCount(userId) {
    const redis = require('../src/redis');
    const count = await redis.get(`warnings:${userId}`);
    return parseInt(count || '0', 10);
}

/**
 * Increment warning count for a user
 * @param {string} userId
 */
async function incrementWarnings(userId) {
    const redis = require('../src/redis');
    const key = `warnings:${userId}`;
    await redis.incr(key);
    await redis.expire(key, 86400); // 24h TTL
    return await getWarningCount(userId);
}

module.exports = {
    analyzeText,
    createFlag,
    getWarningCount,
    incrementWarnings,
};
