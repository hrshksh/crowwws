// Frame capture service — captures local video frame every 30s for moderation
import api from './api'

let captureInterval = null

/**
 * Start periodic frame capture and moderation check
 * @param {HTMLVideoElement} videoElement - local video element
 * @param {string} sessionId - current session ID
 * @param {function} onFlagged - callback when frame is flagged
 */
export function startFrameCapture(videoElement, sessionId, onFlagged) {
    if (captureInterval) {
        clearInterval(captureInterval)
    }

    captureInterval = setInterval(async () => {
        try {
            if (!videoElement || videoElement.readyState < 2) return

            // Capture frame using canvas
            const canvas = document.createElement('canvas')
            canvas.width = videoElement.videoWidth || 320
            canvas.height = videoElement.videoHeight || 240
            const ctx = canvas.getContext('2d')
            ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height)

            // Convert to base64 (strip data URL prefix)
            const base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1]

            // Send to server for moderation
            const res = await api.post('/moderation/check-frame', {
                frame: base64,
                sessionId,
            })

            if (res.data.flagged && onFlagged) {
                onFlagged(res.data)
            }
        } catch (err) {
            console.error('[FrameCapture] Error:', err.message)
        }
    }, 30000) // Every 30 seconds
}

/**
 * Stop frame capture
 */
export function stopFrameCapture() {
    if (captureInterval) {
        clearInterval(captureInterval)
        captureInterval = null
    }
}
