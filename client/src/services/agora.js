// Agora RTC client service
import AgoraRTC from 'agora-rtc-sdk-ng'

let client = null
let localAudioTrack = null
let localVideoTrack = null

/**
 * Request camera and microphone permissions and create tracks.
 * Can be called before joining a channel.
 */
export async function initializeLocalTracks() {
    if (!localAudioTrack || !localVideoTrack) {
        ;[localAudioTrack, localVideoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks()
    }
    return { localAudioTrack, localVideoTrack }
}

/**
 * Initialize and join an Agora channel
 */
export async function joinChannel({ appId, token, channelName, uid }) {
    client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
    await client.join(appId, channelName, token, uid)

    // Ensure tracks exist
    await initializeLocalTracks()

    // Publish local tracks
    await client.publish([localAudioTrack, localVideoTrack])

    return { client, localAudioTrack, localVideoTrack }
}

/**
 * Join channel in text-only mode (no video/audio tracks)
 */
export async function joinTextOnly({ appId, token, channelName, uid }) {
    client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
    await client.join(appId, channelName, token, uid)
    return { client }
}

/**
 * Subscribe to a remote user's tracks
 */
export async function subscribeToRemoteUser(user, mediaType) {
    await client.subscribe(user, mediaType)
    return user
}

/**
 * Leave the channel and cleanup all tracks
 */
export async function leaveChannel() {
    if (localAudioTrack) {
        localAudioTrack.stop()
        localAudioTrack.close()
        localAudioTrack = null
    }
    if (localVideoTrack) {
        localVideoTrack.stop()
        localVideoTrack.close()
        localVideoTrack = null
    }
    if (client) {
        await client.leave()
        client = null
    }
}

/**
 * Toggle audio mute
 */
export async function toggleMute() {
    if (localAudioTrack) {
        await localAudioTrack.setEnabled(!localAudioTrack.enabled)
        return !localAudioTrack.enabled
    }
    return false
}

/**
 * Toggle camera
 */
export async function toggleCamera() {
    if (localVideoTrack) {
        await localVideoTrack.setEnabled(!localVideoTrack.enabled)
        return !localVideoTrack.enabled
    }
    return false
}

/**
 * Get the local video track
 */
export function getLocalVideoTrack() {
    return localVideoTrack
}

/**
 * Get the Agora client
 */
export function getClient() {
    return client
}
