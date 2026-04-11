// Socket.io client instance with JWT auth
import { io } from 'socket.io-client'

let socket = null
const envOrigin = import.meta.env.VITE_API_ORIGIN;
const SOCKET_ORIGIN = envOrigin ? envOrigin : (import.meta.env.PROD ? window.location.origin : 'http://127.0.0.1:5000');

export function connectSocket() {
    const token = localStorage.getItem('token')
    if (!token) return null

    if (socket?.connected) return socket

    socket = io(SOCKET_ORIGIN, {
        auth: { token },
        transports: ['websocket', 'polling'],
    })

    socket.on('connect', () => {
        console.log('[Socket] Connected:', socket.id)
    })

    socket.on('connect_error', (err) => {
        console.error('[Socket] Connection error:', err.message)
    })

    socket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason)
    })

    return socket
}

export function getSocket() {
    return socket
}

export function disconnectSocket() {
    if (socket) {
        socket.disconnect()
        socket = null
    }
}
