import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../services/api'
import AuthSplitLayout from '../components/AuthSplitLayout'

const IconEmail = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }}>
        <rect x="2" y="4" width="20" height="16" rx="2"/>
        <polyline points="22,7 12,13 2,7"/>
    </svg>
)

const IconLock = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }}>
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
)

const labelStyle = { display: 'block', fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: 5, letterSpacing: '0.02em' }
const iconWrapStyle = { position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.9)' }

function FormField({ label, id, icon, children }) {
    return (
        <div>
            <label htmlFor={id} style={labelStyle}>{label}</label>
            <div style={{ position: 'relative' }}>
                {icon && <span style={iconWrapStyle}>{icon}</span>}
                {children}
            </div>
        </div>
    )
}

export default function Login() {
    const navigate = useNavigate()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            const res = await api.post('/auth/login', { email, password })
            localStorage.setItem('token', res.data.token)
            navigate('/')
        } catch (err) {
            setError(err.response?.data?.error || 'Login failed.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <AuthSplitLayout
            eyebrow="Crowwws Live"
            rightPane={
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center' }}>
                    {/* Header */}
                    <div style={{ marginBottom: 22 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', marginBottom: 6 }}>
                            Welcome back
                        </div>
                        <h1 style={{ fontSize: '1.9rem', fontWeight: 800, letterSpacing: '-0.05em', color: 'rgba(255,255,255,0.95)', lineHeight: 1.05, marginBottom: 8 }}>
                            Log in
                        </h1>
                        <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.38)', lineHeight: 1.55 }}>
                            Step back into Crowwws and continue the conversation.
                        </p>
                    </div>

                    {/* Error */}
                    {error && (
                        <div style={{ marginBottom: 14, padding: '9px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5', fontSize: 12.5, fontWeight: 500 }}>
                            {error}
                        </div>
                    )}

                    {/* Fields */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                        <FormField label="Email address" id="login-email" icon={<IconEmail />}>
                            <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="auth-input" style={{ paddingLeft: 34 }} placeholder="you@example.com" required />
                        </FormField>
                        <FormField label="Password" id="login-password" icon={<IconLock />}>
                            <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="auth-input" style={{ paddingLeft: 34 }} placeholder="Your password" required />
                        </FormField>
                    </div>

                    {/* Submit */}
                    <button id="login-submit" type="submit" disabled={loading}
                        style={{ width: '100%', marginBottom: 14, background: 'linear-gradient(135deg, #fff 0%, #e8e8e8 100%)', color: '#0d0d0d', border: 'none', borderRadius: 9999, fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 14, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1, transition: 'all 0.18s ease', boxShadow: '0 6px 20px rgba(0,0,0,0.3)' }}
                        onMouseEnter={(e) => { if (!loading) e.currentTarget.style.transform = 'translateY(-1px)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)' }}
                    >
                        {loading ? 'Logging in…' : 'Enter Crowwws'}
                    </button>

                    {/* Divider */}
                    <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 14 }} />

                    {/* Footer */}
                    <p style={{ textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.32)' }}>
                        Don&apos;t have an account?{' '}
                        <Link to="/register" style={{ fontWeight: 700, color: 'rgba(255,255,255,0.8)', textDecoration: 'none', borderBottom: '1.5px solid rgba(255,255,255,0.18)' }}>
                            Create one
                        </Link>
                    </p>
                </form>
            }
        />
    )
}
