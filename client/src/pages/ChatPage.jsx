import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { connectSocket, disconnectSocket, getSocket } from '../services/socket'
import {
    initializeLocalStream, toggleMute, toggleCamera,
    createPeerConnection, createOffer, handleReceiveOffer,
    handleReceiveAnswer, handleReceiveCandidate, closePeerConnection, cleanupLocalStream
} from '../services/webrtc'
import AuthSplitLayout from '../components/AuthSplitLayout'

// ─── SVG Icons ───────────────────────────────────────────────────────────────
const IconMic = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
)

const IconMicOff = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="1" y1="1" x2="23" y2="23"/>
        <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
        <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
)

const IconCamera = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="23 7 16 12 23 17 23 7"/>
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
    </svg>
)

const IconCameraOff = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="1" y1="1" x2="23" y2="23"/>
        <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34"/>
        <circle cx="12" cy="12" r="3" style={{display:'none'}}/>
    </svg>
)

const IconFlag = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
        <line x1="4" y1="22" x2="4" y2="15"/>
    </svg>
)

const IconSend = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"/>
        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
)

const IconArrowRight = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="5" y1="12" x2="19" y2="12"/>
        <polyline points="12 5 19 12 12 19"/>
    </svg>
)

// ─── Chat States ──────────────────────────────────────────────────────────────
const STATE = {
    IDLE: 'idle',
    SEARCHING: 'searching',
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    REPORTED: 'reported',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function ChatPage() {
    const navigate = useNavigate()
    const [state, setState] = useState(STATE.IDLE)
    const [keywords, setKeywords] = useState([])
    const [keywordInput, setKeywordInput] = useState('')
    const [messages, setMessages] = useState([])
    const [messageInput, setMessageInput] = useState('')
    const [sessionId, setSessionId] = useState(null)
    const [mode, setMode] = useState('video')
    const [isMuted, setIsMuted] = useState(false)
    const [isCamOff, setIsCamOff] = useState(false)
    const [onlineCount, setOnlineCount] = useState(0)
    const [warning, setWarning] = useState('')

    const localVideoRef = useRef(null)
    const remoteVideoRef = useRef(null)
    const chatEndRef = useRef(null)
    const token = localStorage.getItem('token')

    const cleanup = useCallback(async () => {
        closePeerConnection()
    }, [])

    const handleDisconnect = useCallback(() => {
        const socket = getSocket()
        socket?.emit('disconnect_chat')
        cleanup()
        cleanupLocalStream()
        setState(STATE.DISCONNECTED)
    }, [cleanup])

    // Auto-scroll chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    // Socket connection & event handlers
    useEffect(() => {
        if (!token) return

        const socket = connectSocket()
        if (!socket) return

        socket.on('online_count', (count) => setOnlineCount(count))
        socket.on('waiting', () => setState(STATE.SEARCHING))

        socket.on('match_found', async (data) => {
            setSessionId(data.sessionId)
            setMessages([])
            setState(STATE.CONNECTED)

            if (data.mode === 'video') {
                try {
                    createPeerConnection((remoteStream) => {
                        if (remoteVideoRef.current) {
                            remoteVideoRef.current.srcObject = remoteStream
                        }
                    })

                    const stream = await initializeLocalStream()
                    setTimeout(() => {
                        if (localVideoRef.current) {
                            localVideoRef.current.srcObject = stream
                        }
                        if (data.role === 'caller') {
                            createOffer()
                        }
                    }, 200)
                } catch (err) {
                    console.error('[Chat] WebRTC join error:', err)
                }
            }
        })

        socket.on('webrtc_offer', async ({ sdp }) => await handleReceiveOffer(sdp))
        socket.on('webrtc_answer', async ({ sdp }) => await handleReceiveAnswer(sdp))
        socket.on('webrtc_ice_candidate', async ({ candidate }) => await handleReceiveCandidate(candidate))

        socket.on('receive_message', (data) => {
            setMessages((prev) => [...prev, { from: 'stranger', text: data.text, time: data.timestamp }])
        })

        socket.on('partner_disconnected', () => { setState(STATE.DISCONNECTED); cleanup() })
        socket.on('session_ended', () => { setState(STATE.DISCONNECTED); cleanup() })
        socket.on('report_submitted', () => { setState(STATE.REPORTED); cleanup() })



        socket.on('banned', (data) => {
            alert(data.reason)
            localStorage.removeItem('token')
            navigate('/login')
        })

        socket.on('search_stopped', () => setState(STATE.IDLE))

        return () => {
            socket.off('online_count')
            socket.off('waiting')
            socket.off('match_found')
            socket.off('receive_message')
            socket.off('partner_disconnected')
            socket.off('session_ended')
            socket.off('report_submitted')
            socket.off('moderation_warning')
            socket.off('banned')
            socket.off('search_stopped')
        }
    }, [cleanup, handleDisconnect, token, navigate])

    // ─── Actions ───────────────────────────────────────────────────────────────
    const handleStart = async (chatMode) => {
        if (!token) { navigate('/login'); return }

        if (chatMode === 'video') {
            try {
                await initializeLocalStream()
            } catch {
                setWarning('Please allow camera and microphone permissions to use Video Chat.')
                setTimeout(() => setWarning(''), 5000)
                return
            }
        }

        setMode(chatMode)
        setState(STATE.SEARCHING)
        const socket = getSocket()
        if (socket) socket.emit('find_match', { keywords, mode: chatMode })
    }

    const handleStop = () => {
        const socket = getSocket()
        if (state === STATE.SEARCHING) {
            socket?.emit('stop_search')
        } else {
            socket?.emit('disconnect_chat')
        }
        cleanup()
        cleanupLocalStream()
        setState(STATE.IDLE)
        setMessages([])
        setSessionId(null)
    }

    const handleSkip = () => {
        const socket = getSocket()
        socket?.emit('skip')
        cleanup()
        setState(STATE.SEARCHING)
        setMessages([])
        socket?.emit('find_match', { keywords, mode })
    }

    const handleReport = () => {
        const socket = getSocket()
        socket?.emit('report_user', { reason: 'Inappropriate behavior', sessionId })
        cleanup()
    }

    const handleSendMessage = (e) => {
        e.preventDefault()
        if (!messageInput.trim()) return
        const socket = getSocket()
        socket?.emit('send_message', { text: messageInput.trim(), sessionId })
        setMessages((prev) => [...prev, { from: 'you', text: messageInput.trim(), time: Date.now() }])
        setMessageInput('')
    }

    const handleToggleMute = async () => {
        const muted = await toggleMute()
        setIsMuted(muted)
    }

    const handleToggleCamera = async () => {
        const off = await toggleCamera()
        setIsCamOff(off)
    }

    const handleAddKeyword = (e) => {
        if (e.key === 'Enter' && keywordInput.trim()) {
            e.preventDefault()
            if (keywords.length < 5 && !keywords.includes(keywordInput.trim().toLowerCase())) {
                setKeywords([...keywords, keywordInput.trim().toLowerCase()])
            }
            setKeywordInput('')
        }
    }

    const removeKeyword = (kw) => setKeywords(keywords.filter((k) => k !== kw))

    const handleFindNext = () => {
        setState(STATE.SEARCHING)
        setMessages([])
        const socket = getSocket()
        socket?.emit('find_match', { keywords, mode })
    }

    // ─── IDLE State (split layout) ────────────────────────────────────────────
    if (state === STATE.IDLE) {
        return (
            <AuthSplitLayout
                eyebrow="Crowwws Home"
                rightPane={
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center' }}>
                        {/* Header */}
                        <div style={{ marginBottom: 28 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>
                                    Anonymous Conversations
                                </div>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 999, padding: '5px 11px', flexShrink: 0 }}>
                                    <span className="pulse-dot" style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#22c55e' }} />
                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#86efac' }}>{onlineCount} online</span>
                                </div>
                            </div>
                            <h1 style={{ fontSize: '2.2rem', fontWeight: 800, letterSpacing: '-0.05em', color: 'rgba(255,255,255,0.95)', lineHeight: 1.05, marginBottom: 10 }}>
                                Start chatting
                            </h1>
                            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                                Start with text or video. Add a few interests and we&apos;ll shape the next conversation around them.
                            </p>
                        </div>

                        {warning && (
                            <div style={{ marginBottom: 16, padding: '11px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5', fontSize: 13, fontWeight: 500 }}>
                                {warning}
                            </div>
                        )}

                        {/* Interests section */}
                        <div style={{ marginBottom: 24 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.02em' }}>
                                    Interests <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.2)' }}>(optional, up to 5)</span>
                                </label>
                                {token ? (
                                    <button
                                        onClick={() => { localStorage.removeItem('token'); disconnectSocket(); navigate('/login') }}
                                        style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.35)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                    >
                                        Log out
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => navigate('/login')}
                                        style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.75)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, borderBottom: '1.5px solid rgba(255,255,255,0.2)' }}
                                    >
                                        Log in
                                    </button>
                                )}
                            </div>

                            {keywords.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                                    {keywords.map((kw) => (
                                        <span key={kw} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>
                                            {kw}
                                            <button onClick={() => removeKeyword(kw)} style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 700, fontSize: 13, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>×</button>
                                        </span>
                                    ))}
                                </div>
                            )}

                            {keywords.length < 5 && (
                                <input
                                    id="keyword-input"
                                    type="text"
                                    value={keywordInput}
                                    onChange={(e) => setKeywordInput(e.target.value)}
                                    onKeyDown={handleAddKeyword}
                                    className="min-input"
                                    style={{ width: '100%', fontSize: 14 }}
                                    placeholder="Type a topic and press Enter…"
                                />
                            )}
                        </div>

                        {/* Divider */}
                        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', marginBottom: 24 }} />

                        {/* Action buttons */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <button id="start-video" onClick={() => handleStart('video')} style={{ width: '100%', background: 'linear-gradient(135deg, #fff 0%, #e8e8e8 100%)', color: '#0d0d0d', border: 'none', borderRadius: 9999, fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 14, minHeight: 48, cursor: 'pointer', transition: 'all 0.18s ease', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
                                Video Chat
                            </button>
                            <button id="start-text" onClick={() => handleStart('text')} style={{ width: '100%', background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.75)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9999, fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 14, minHeight: 48, cursor: 'pointer', transition: 'all 0.18s ease' }}>
                                Text Chat
                            </button>
                        </div>
                    </div>
                }
            />
        )
    }

    return (
        <div className="app-shell min-h-screen">
            {/* ── Header ── */}
            <header className="page-grid mx-auto flex w-full max-w-[1400px] items-center justify-between px-4 py-4 md:px-8 md:py-5">
                <div className="flex items-center gap-3">
                    <div className="brand-mark">Crowwws</div>
                    <span className="info-chip" style={{ fontSize: 12, fontWeight: 700 }}>
                        <span className="pulse-dot" style={{ display:'inline-block', width:7, height:7, borderRadius:'50%', background:'#22c55e' }}></span>
                        {onlineCount} online
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    {token ? (
                        <button
                            onClick={() => { localStorage.removeItem('token'); disconnectSocket(); navigate('/login') }}
                            className="btn-ghost px-5 text-sm"
                        >
                            Log out
                        </button>
                    ) : (
                        <button onClick={() => navigate('/login')} className="btn-ghost px-5 text-sm">
                            Log in
                        </button>
                    )}
                </div>
            </header>

            {/* ── Warning banner ── */}
            {warning && (
                <div className="page-grid mx-auto mb-2 w-full max-w-[1400px] px-4 md:px-8">
                    <div style={{ borderRadius: 14, border: '1px solid rgba(220,38,38,0.2)', background: 'rgba(220,38,38,0.08)', padding: '12px 20px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#b91c1c' }}>
                        {warning}
                    </div>
                </div>
            )}

            {/* ── Main ── */}
            <main className="page-grid mx-auto flex w-full max-w-[1400px] flex-1 flex-col items-center justify-center px-4 pb-8 pt-4 md:px-8">

                {/* ─── IDLE (large screen inline) ─── */}
                {state === STATE.IDLE && (
                    <div className="state-transition state-enter-active grid w-full items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
                        <div>
                            <div className="eyebrow mb-4" style={{ color: 'rgba(255,255,255,0.35)' }}>Anonymous Conversations</div>
                            <h2 className="hero-title max-w-2xl" style={{ color: 'rgba(255,255,255,0.95)' }}>
                                Talk to strangers without the interface getting in the way.
                            </h2>
                            <p className="hero-copy mb-12 mt-6 max-w-xl">
                                Choose text or video, add a few interests, and let the app find someone who overlaps with your vibe.
                            </p>
                            <div className="mt-8 flex flex-wrap gap-2">
                                {['Interest-based matching', 'Video or text mode', 'Built-in reporting'].map((t) => (
                                    <div key={t} className="info-chip" style={{ fontSize: 12 }}>{t}</div>
                                ))}
                            </div>
                        </div>

                        <div className="surface-panel" style={{ borderRadius: 28, padding: '28px 28px' }}>
                            <div className="mb-6 flex items-start justify-between gap-4">
                                <div>
                                    <div className="eyebrow mb-2">Get Matched</div>
                                    <h3 style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text)' }}>Shape the conversation</h3>
                                </div>
                                <div style={{ borderRadius: 999, background: 'rgba(0,0,0,0.05)', padding: '6px 14px', fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.01em', border: '1px solid rgba(0,0,0,0.07)', whiteSpace: 'nowrap' }}>
                                    Optional interests
                                </div>
                            </div>

                            <label className="eyebrow mb-4 block text-center">Interests</label>
                            <div className="flex flex-wrap gap-2 justify-center mb-4">
                                {keywords.map((kw) => (
                                    <span key={kw} className="tag-pill text-sm font-semibold">
                                        {kw}
                                        <button onClick={() => removeKeyword(kw)} style={{ color: 'var(--muted)', fontWeight: 700, fontSize: 12 }}>×</button>
                                    </span>
                                ))}
                            </div>
                            {keywords.length < 5 && (
                                <input
                                    id="keyword-input"
                                    type="text"
                                    value={keywordInput}
                                    onChange={(e) => setKeywordInput(e.target.value)}
                                    onKeyDown={handleAddKeyword}
                                    className="min-input w-full text-center text-sm"
                                    placeholder="Add an interest and press Enter"
                                />
                            )}
                            <div className="mt-5 grid gap-3 sm:grid-cols-2">
                                <button id="start-video" onClick={() => handleStart('video')} className="btn-primary w-full">
                                    Start Video Chat
                                </button>
                                <button id="start-text" onClick={() => handleStart('text')} className="btn-secondary w-full">
                                    Start Text Chat
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ─── SEARCHING ─── */}
                {state === STATE.SEARCHING && (
                    <div className="state-card state-transition state-enter-active w-full max-w-xl text-center" style={{ borderRadius: 28, padding: '52px 40px' }}>
                        <div className="eyebrow mb-3">Searching</div>
                        <h2 style={{ marginBottom: 12, fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text)' }}>
                            Finding a stranger…
                        </h2>
                        {keywords.length > 0 && (
                            <p style={{ marginBottom: 32, color: 'var(--muted)', fontSize: 14 }}>
                                Matching on:{' '}
                                <span style={{ fontWeight: 700, color: 'var(--text)' }}>{keywords.join(', ')}</span>
                            </p>
                        )}
                        <div className="mb-10 flex justify-center">
                            {/* Three-dot loader */}
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                {[0, 1, 2].map((i) => (
                                    <span
                                        key={i}
                                        style={{
                                            display: 'inline-block',
                                            width: 10, height: 10,
                                            borderRadius: '50%',
                                            background: 'var(--text)',
                                            opacity: 0.15,
                                            animation: `pulse-dot 1.2s ease-in-out ${i * 0.18}s infinite`,
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                        <button id="stop-search" onClick={handleStop} className="btn-ghost mx-auto px-8 text-sm"
                            style={{ color: 'var(--muted)', border: '1px solid rgba(0,0,0,0.1)', background: 'transparent', backdropFilter: 'none', minHeight: 42 }}>
                            Cancel
                        </button>
                    </div>
                )}

                {/* ─── CONNECTED ─── */}
                {state === STATE.CONNECTED && (
                    <div className="state-transition state-enter-active flex h-full min-h-[80vh] w-full flex-col gap-5 lg:h-[calc(100vh-140px)] lg:min-h-[600px] lg:flex-row">

                        {/* Video area */}
                        {mode === 'video' && (
                            <div className="surface-panel relative min-h-[40vh] flex-1 overflow-hidden sm:min-h-[300px]" style={{ borderRadius: 28 }}>
                                {/* Remote video */}
                                <video
                                    ref={remoteVideoRef}
                                    id="remote-video"
                                    autoPlay
                                    playsInline
                                    className="h-full w-full object-cover"
                                    style={{ background: 'radial-gradient(circle at top, #1a1a2e 0%, #0d0d15 50%, #07070d 100%)' }}
                                />

                                {/* Local video (PiP) */}
                                <video
                                    ref={localVideoRef}
                                    id="local-video"
                                    autoPlay
                                    playsInline
                                    muted
                                    className="object-cover"
                                    style={{ position: 'absolute', bottom: 14, right: 14, width: 100, aspectRatio: '3/4', borderRadius: 16, overflow: 'hidden', border: '1.5px solid rgba(255,255,255,0.18)', background: 'rgba(0,0,0,0.5)', boxShadow: '0 8px 30px rgba(0,0,0,0.4)' }}
                                />

                                {/* Connected badge */}
                                <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', alignItems: 'center', gap: 8, borderRadius: 999, background: 'rgba(0,0,0,0.45)', padding: '6px 14px', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.12)' }}>
                                    <span className="pulse-dot" style={{ display:'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#22c55e' }} />
                                    Connected
                                </div>
                            </div>
                        )}

                        {/* Chat sidebar */}
                        <div className={`${mode === 'video' ? 'w-full flex-1 lg:w-[380px] lg:flex-none' : 'mx-auto w-full max-w-3xl flex-1'} surface-panel flex h-[50vh] flex-col overflow-hidden lg:h-full`} style={{ borderRadius: 28 }}>

                            {/* Controls bar */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', background: 'rgba(255,255,255,0.6)', padding: '12px 16px', gap: 8 }}>
                                {mode === 'video' ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        {/* Mute */}
                                        <button
                                            id="toggle-mute"
                                            onClick={handleToggleMute}
                                            title={isMuted ? 'Unmute' : 'Mute'}
                                            style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                width: 36, height: 36, borderRadius: 999,
                                                border: '1px solid rgba(0,0,0,0.08)',
                                                background: isMuted ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.85)',
                                                color: isMuted ? '#dc2626' : 'var(--muted)',
                                                cursor: 'pointer', transition: 'all 0.15s ease',
                                                boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                                            }}
                                        >
                                            {isMuted ? <IconMicOff /> : <IconMic />}
                                        </button>
                                        {/* Camera */}
                                        <button
                                            id="toggle-camera"
                                            onClick={handleToggleCamera}
                                            title={isCamOff ? 'Camera on' : 'Camera off'}
                                            style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                width: 36, height: 36, borderRadius: 999,
                                                border: '1px solid rgba(0,0,0,0.08)',
                                                background: isCamOff ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.85)',
                                                color: isCamOff ? '#dc2626' : 'var(--muted)',
                                                cursor: 'pointer', transition: 'all 0.15s ease',
                                                boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                                            }}
                                        >
                                            {isCamOff ? <IconCameraOff /> : <IconCamera />}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="eyebrow">Text mode</div>
                                )}

                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {/* Skip */}
                                    <button
                                        id="skip-button"
                                        onClick={handleSkip}
                                        style={{ borderRadius: 999, background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(0,0,0,0.08)', padding: '7px 16px', fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', cursor: 'pointer', transition: 'all 0.15s ease', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}
                                    >
                                        Skip
                                    </button>
                                    {/* Stop */}
                                    <button
                                        id="disconnect-button"
                                        onClick={handleDisconnect}
                                        style={{ borderRadius: 999, background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', padding: '7px 16px', fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#dc2626', cursor: 'pointer', transition: 'all 0.15s ease' }}
                                    >
                                        Stop
                                    </button>
                                    {/* Divider */}
                                    <div style={{ width: 1, height: 20, background: 'var(--line)', margin: '0 2px' }} />
                                    {/* Report */}
                                    <button
                                        id="report-button"
                                        onClick={handleReport}
                                        title="Report"
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 999, border: '1px solid transparent', color: 'var(--muted)', cursor: 'pointer', transition: 'all 0.15s ease', background: 'transparent' }}
                                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(220,38,38,0.07)'; e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = 'rgba(220,38,38,0.15)' }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'transparent' }}
                                    >
                                        <IconFlag />
                                    </button>
                                </div>
                            </div>

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-5" style={{ minHeight: 300, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--subtle)', padding: '4px 0 8px' }}>
                                    You&apos;re chatting with a stranger. Say hi!
                                </div>
                                {messages.map((msg, i) => (
                                    <div
                                        key={i}
                                        style={{ display: 'flex', flexDirection: 'column', alignItems: msg.from === 'you' ? 'flex-end' : 'flex-start' }}
                                    >
                                        <div
                                            className={msg.from === 'you' ? 'chat-bubble-you' : 'chat-bubble-stranger'}
                                            style={{ maxWidth: '84%', padding: '10px 15px', wordBreak: 'break-word' }}
                                        >
                                            {msg.text}
                                        </div>
                                        <span style={{ fontSize: 11, color: 'var(--subtle)', marginTop: 4, padding: '0 4px' }}>
                                            {msg.from === 'you' ? 'You' : 'Stranger'} · {formatTime(msg.time)}
                                        </span>
                                    </div>
                                ))}
                                <div ref={chatEndRef} />
                            </div>

                            {/* Message input */}
                            <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--line)', background: 'rgba(255,255,255,0.6)', padding: '12px 14px' }}>
                                <input
                                    id="message-input"
                                    type="text"
                                    value={messageInput}
                                    onChange={(e) => setMessageInput(e.target.value)}
                                    className="min-input flex-1"
                                    style={{ fontSize: 14 }}
                                    placeholder="Type a message…"
                                    autoComplete="off"
                                />
                                <button
                                    id="send-message"
                                    type="submit"
                                    disabled={!messageInput.trim()}
                                    className="btn-primary"
                                    style={{ minWidth: 48, padding: '0 16px', minHeight: 46, fontSize: 14 }}
                                >
                                    <IconSend />
                                </button>
                            </form>
                        </div>
                    </div>
                )}

                {/* ─── DISCONNECTED ─── */}
                {state === STATE.DISCONNECTED && (
                    <div className="state-card state-transition state-enter-active w-full max-w-md text-center" style={{ borderRadius: 28, padding: '52px 40px' }}>
                        <div className="eyebrow mb-3">Session Ended</div>
                        <h2 style={{ marginBottom: 10, fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text)' }}>
                            Stranger disconnected
                        </h2>
                        <p style={{ marginBottom: 36, color: 'var(--muted)', fontSize: 14, lineHeight: 1.6 }}>The conversation has ended.</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <button id="find-next" onClick={handleFindNext} className="btn-primary w-full">
                                Find Next <IconArrowRight />
                            </button>
                            <button onClick={handleStop} className="btn-secondary w-full">
                                Stop
                            </button>
                        </div>
                    </div>
                )}

                {/* ─── REPORTED ─── */}
                {state === STATE.REPORTED && (
                    <div className="state-card state-transition state-enter-active w-full max-w-md text-center" style={{ borderRadius: 28, padding: '52px 40px' }}>
                        <div className="eyebrow mb-3">Safety</div>
                        <h2 style={{ marginBottom: 10, fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.04em', color: '#dc2626' }}>
                            Report Submitted
                        </h2>
                        <p style={{ marginBottom: 36, color: 'var(--muted)', fontSize: 14, lineHeight: 1.6 }}>
                            Thank you for keeping Crowwws safe. The user has been disconnected.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <button onClick={handleFindNext} className="btn-primary w-full">
                                Find Next <IconArrowRight />
                            </button>
                            <button onClick={handleStop} className="btn-secondary w-full">
                                Take a break
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    )
}
