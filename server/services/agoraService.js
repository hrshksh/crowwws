// Agora RTC token generation service
const { RtcTokenBuilder, RtcRole } = require('agora-access-token');
const { v4: uuidv4 } = require('uuid');

const APP_ID = process.env.AGORA_APP_ID;
const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

/**
 * Generate an Agora RTC token for a channel
 * @param {string} channelName - unique channel name (session UUID)
 * @param {number} uid - numeric user ID (0 for auto-assign)
 * @returns {{ token: string, channelName: string, appId: string, uid: number }}
 */
function generateToken(channelName, uid = 0) {
    if (!APP_ID || !APP_CERTIFICATE) {
        console.warn('[Agora] Missing APP_ID or APP_CERTIFICATE, returning placeholder token');
        return {
            token: 'placeholder-token',
            channelName,
            appId: APP_ID || 'placeholder-app-id',
            uid,
        };
    }

    const role = RtcRole.PUBLISHER;
    const expirationTimeInSeconds = 3600; // 1 hour
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    const token = RtcTokenBuilder.buildTokenWithUid(
        APP_ID,
        APP_CERTIFICATE,
        channelName,
        uid,
        role,
        privilegeExpiredTs
    );

    return {
        token,
        channelName,
        appId: APP_ID,
        uid,
    };
}

/**
 * Generate a unique channel name (UUID)
 */
function generateChannelName() {
    return uuidv4();
}

module.exports = { generateToken, generateChannelName };
