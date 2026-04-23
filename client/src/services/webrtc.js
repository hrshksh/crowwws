import { getSocket } from './socket'

let peerConnection = null
let localStream = null
let currentAttemptId = null
let remoteStreamSeen = false
let connectionSettled = false
let setupTimer = null
let disconnectTimer = null
let mediaFailureCallback = null
let mediaConnectedCallback = null

const SETUP_TIMEOUT_MS = 3000
const DISCONNECT_GRACE_MS = 1500

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' },
    ],
}

let iceCandidateQueue = []

function clearTimers() {
    if (setupTimer) {
        clearTimeout(setupTimer)
        setupTimer = null
    }
    if (disconnectTimer) {
        clearTimeout(disconnectTimer)
        disconnectTimer = null
    }
}

function failMediaConnection(reason) {
    if (!currentAttemptId || connectionSettled) return
    clearTimers()
    connectionSettled = true
    mediaFailureCallback?.(reason, currentAttemptId)
}

function markMediaConnected() {
    if (connectionSettled || !currentAttemptId || !remoteStreamSeen) return
    clearTimers()
    connectionSettled = true
    mediaConnectedCallback?.(currentAttemptId)
}

function maybeMarkConnected() {
    if (!peerConnection || !remoteStreamSeen) return
    if (peerConnection.connectionState === 'connected' || peerConnection.iceConnectionState === 'connected') {
        markMediaConnected()
    }
}

function bindConnectionObservers() {
    if (!peerConnection) return

    peerConnection.onconnectionstatechange = () => {
        switch (peerConnection.connectionState) {
            case 'connected':
                maybeMarkConnected()
                break
            case 'failed':
            case 'closed':
                failMediaConnection(peerConnection.connectionState)
                break
            case 'disconnected':
                if (!disconnectTimer) {
                    disconnectTimer = setTimeout(() => failMediaConnection('disconnected'), DISCONNECT_GRACE_MS)
                }
                break
            default:
                if (disconnectTimer && peerConnection.connectionState !== 'disconnected') {
                    clearTimeout(disconnectTimer)
                    disconnectTimer = null
                }
                break
        }
    }

    peerConnection.oniceconnectionstatechange = () => {
        switch (peerConnection.iceConnectionState) {
            case 'connected':
            case 'completed':
                maybeMarkConnected()
                break
            case 'failed':
            case 'closed':
                failMediaConnection(peerConnection.iceConnectionState)
                break
            case 'disconnected':
                if (!disconnectTimer) {
                    disconnectTimer = setTimeout(() => failMediaConnection('ice_disconnected'), DISCONNECT_GRACE_MS)
                }
                break
            default:
                if (disconnectTimer && peerConnection.iceConnectionState !== 'disconnected') {
                    clearTimeout(disconnectTimer)
                    disconnectTimer = null
                }
                break
        }
    }
}

export async function initializeLocalStream() {
    if (!localStream) {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    }
    return localStream
}

export function getLocalStream() {
    return localStream
}

export async function toggleCamera() {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0]
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled
            return !videoTrack.enabled
        }
    }
    return false
}

export async function toggleMute() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0]
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled
            return !audioTrack.enabled
        }
    }
    return false
}

export function createPeerConnection({
    attemptId,
    onRemoteStream,
    onMediaConnected,
    onMediaFailed,
    setupTimeoutMs = SETUP_TIMEOUT_MS,
}) {
    if (peerConnection) {
        peerConnection.close()
    }

    clearTimers()
    iceCandidateQueue = []
    currentAttemptId = attemptId
    remoteStreamSeen = false
    connectionSettled = false
    mediaFailureCallback = onMediaFailed || null
    mediaConnectedCallback = onMediaConnected || null

    peerConnection = new RTCPeerConnection(configuration)

    if (localStream) {
        localStream.getTracks().forEach((track) => {
            peerConnection.addTrack(track, localStream)
        })
    }

    peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
            remoteStreamSeen = true
            onRemoteStream(event.streams[0])
            maybeMarkConnected()
        }
    }

    peerConnection.onicecandidate = (event) => {
        if (event.candidate && currentAttemptId) {
            const socket = getSocket()
            if (socket) {
                socket.emit('webrtc_ice_candidate', { candidate: event.candidate, attemptId: currentAttemptId })
            }
        }
    }

    bindConnectionObservers()

    setupTimer = setTimeout(() => {
        if (!connectionSettled) {
            failMediaConnection('setup_timeout')
        }
    }, setupTimeoutMs)

    return peerConnection
}

export async function createOffer() {
    if (!peerConnection || !currentAttemptId) return
    try {
        const offer = await peerConnection.createOffer()
        await peerConnection.setLocalDescription(offer)
        const socket = getSocket()
        if (socket) {
            socket.emit('webrtc_offer', { sdp: peerConnection.localDescription, attemptId: currentAttemptId })
        }
    } catch (err) {
        console.error('[WebRTC] Error creating offer:', err)
        failMediaConnection('offer_error')
    }
}

export async function handleReceiveOffer({ sdp, attemptId }) {
    if (!peerConnection || !currentAttemptId || attemptId !== currentAttemptId) return
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp))

        while (iceCandidateQueue.length > 0) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(iceCandidateQueue.shift()))
        }

        const answer = await peerConnection.createAnswer()
        await peerConnection.setLocalDescription(answer)
        const socket = getSocket()
        if (socket) {
            socket.emit('webrtc_answer', { sdp: peerConnection.localDescription, attemptId: currentAttemptId })
        }
    } catch (err) {
        console.error('[WebRTC] Error handling offer:', err)
        failMediaConnection('offer_handle_error')
    }
}

export async function handleReceiveAnswer({ sdp, attemptId }) {
    if (!peerConnection || !currentAttemptId || attemptId !== currentAttemptId) return
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp))

        while (iceCandidateQueue.length > 0) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(iceCandidateQueue.shift()))
        }
    } catch (err) {
        console.error('[WebRTC] Error handling answer:', err)
        failMediaConnection('answer_handle_error')
    }
}

export async function handleReceiveCandidate({ candidate, attemptId }) {
    if (!peerConnection || !currentAttemptId || attemptId !== currentAttemptId) return
    if (!peerConnection.remoteDescription) {
        iceCandidateQueue.push(candidate)
        return
    }
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
    } catch (err) {
        console.error('[WebRTC] Error adding received ice candidate:', err)
    }
}

export function closePeerConnection() {
    clearTimers()
    mediaFailureCallback = null
    mediaConnectedCallback = null
    connectionSettled = false
    remoteStreamSeen = false
    currentAttemptId = null
    iceCandidateQueue = []

    if (peerConnection) {
        peerConnection.close()
        peerConnection = null
    }
}

export function cleanupLocalStream() {
    if (localStream) {
        localStream.getTracks().forEach((track) => track.stop())
        localStream = null
    }
}
