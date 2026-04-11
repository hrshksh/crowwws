import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import api from '../services/api'
import AuthSplitLayout from '../components/AuthSplitLayout'

export default function Verify() {
    const location = useLocation()
    const navigate = useNavigate()
    const email = location.state?.email

    const [otp, setOtp] = useState(['', '', '', '', '', ''])
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [resendCooldown, setResendCooldown] = useState(60)
    const inputRefs = useRef([])

    const devOtp = sessionStorage.getItem('devOtp')

    useEffect(() => { if (!email) navigate('/register') }, [email, navigate])

    useEffect(() => {
        let timer
        if (resendCooldown > 0) timer = setTimeout(() => setResendCooldown(c => c - 1), 1000)
        return () => clearTimeout(timer)
    }, [resendCooldown])

    const handleChange = (index, value) => {
        if (isNaN(value)) return
        const newOtp = [...otp]
        newOtp[index] = value
        setOtp(newOtp)
        if (value !== '' && index < 5) inputRefs.current[index + 1].focus()
    }

    const handleKeyDown = (index, e) => {
        if (e.key === 'Backspace' && index > 0 && otp[index] === '') inputRefs.current[index - 1].focus()
    }

    const handlePaste = (e) => {
        e.preventDefault()
        const pastedData = e.clipboardData.getData('text/plain').slice(0, 6).split('')
        const newOtp = [...otp]
        pastedData.forEach((char, i) => { if (!isNaN(char) && i < 6) newOtp[i] = char })
        setOtp(newOtp)
        const focusIndex = Math.min(pastedData.length, 5)
        inputRefs.current[focusIndex].focus()
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        const otpString = otp.join('')
        if (otpString.length !== 6) return setError('Please enter all 6 digits')
        setError('')
        setLoading(true)
        try {
            await api.post('/auth/verify-otp', { email, otp: otpString })
            sessionStorage.removeItem('devOtp')
            alert('Email verified! You can now log in.')
            navigate('/login')
        } catch (err) {
            setError(err.response?.data?.error || 'Verification failed.')
        } finally {
            setLoading(false)
        }
    }

    const handleResend = async () => {
        if (resendCooldown > 0) return
        setError('')
        try {
            const res = await api.post('/auth/resend-otp', { email })
            if (res.data.devOtp) { sessionStorage.setItem('devOtp', res.data.devOtp); window.location.reload() }
            else setResendCooldown(60)
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to resend code')
        }
    }

    const filledCount = otp.filter(d => d).length
    const allFilled = filledCount === 6

    return (
        <AuthSplitLayout
            eyebrow="Email Verification"
            rightPane={
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center' }}>
                    {/* Header */}
                    <div style={{ marginBottom: 32 }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>
                            Verification
                        </div>
                        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, letterSpacing: '-0.05em', color: 'rgba(255,255,255,0.95)', lineHeight: 1.05, marginBottom: 10 }}>
                            Verify email
                        </h1>
                        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', lineHeight: 1.65 }}>
                            We sent a 6-digit code to{' '}
                            <span style={{ fontWeight: 700, color: 'rgba(255,255,255,0.75)' }}>{email}</span>.
                            {' '}Enter it below.
                        </p>
                    </div>

                    {/* Dev OTP */}
                    {devOtp && (
                        <div style={{ marginBottom: 20, padding: '10px 14px', borderRadius: 10, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', fontSize: 13, color: '#a5b4fc', textAlign: 'center' }}>
                            <strong>[Dev]</strong> OTP: <strong style={{ letterSpacing: '0.12em' }}>{devOtp}</strong>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div style={{ marginBottom: 20, padding: '11px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5', fontSize: 13, fontWeight: 500 }}>
                            {error}
                        </div>
                    )}

                    {/* Label */}
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.02em', marginBottom: 14 }}>
                        Verification code
                    </div>

                    {/* OTP boxes */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: 12, justifyContent: 'center' }} onPaste={handlePaste}>
                        {otp.map((digit, index) => (
                            <input
                                key={index}
                                ref={(el) => (inputRefs.current[index] = el)}
                                id={`otp-${index}`}
                                type="text"
                                inputMode="numeric"
                                maxLength={1}
                                value={digit}
                                onChange={(e) => handleChange(index, e.target.value)}
                                onKeyDown={(e) => handleKeyDown(index, e)}
                                style={{
                                    width: 52, height: 58, borderRadius: 12,
                                    border: digit ? '1.5px solid rgba(255,255,255,0.35)' : '1.5px solid rgba(255,255,255,0.1)',
                                    background: digit ? '#2a2a30' : '#222226',
                                    textAlign: 'center',
                                    fontSize: '1.5rem', fontWeight: 800,
                                    color: 'rgba(255,255,255,0.92)',
                                    boxShadow: digit ? '0 0 0 3px rgba(255,255,255,0.06)' : 'none',
                                    outline: 'none', transition: 'all 0.15s ease',
                                    fontFamily: 'Inter, sans-serif', letterSpacing: '-0.02em', cursor: 'text',
                                    caretColor: 'rgba(255,255,255,0.7)',
                                }}
                            />
                        ))}
                    </div>

                    {/* Progress bar */}
                    <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden', marginBottom: 28 }}>
                        <div style={{ height: '100%', width: `${(filledCount / 6) * 100}%`, background: 'rgba(255,255,255,0.6)', borderRadius: 999, transition: 'width 0.2s ease' }} />
                    </div>

                    {/* Submit */}
                    <button
                        id="verify-submit"
                        type="submit"
                        disabled={loading || !allFilled}
                        style={{
                            width: '100%', marginBottom: 20,
                            background: allFilled ? 'linear-gradient(135deg, #fff 0%, #e8e8e8 100%)' : 'rgba(255,255,255,0.08)',
                            color: allFilled ? '#0d0d0d' : 'rgba(255,255,255,0.25)',
                            border: 'none', borderRadius: 9999,
                            fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 14.5,
                            minHeight: 50, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: (loading || !allFilled) ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s ease',
                            boxShadow: allFilled ? '0 8px 24px rgba(0,0,0,0.3)' : 'none',
                        }}
                    >
                        {loading ? 'Verifying…' : 'Verify Email'}
                    </button>

                    {/* Divider */}
                    <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', marginBottom: 20 }} />

                    {/* Resend */}
                    <div style={{ textAlign: 'center' }}>
                        {resendCooldown > 0 ? (
                            <span style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.3)' }}>
                                Resend in{' '}
                                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
                                    {resendCooldown}s
                                </span>
                            </span>
                        ) : (
                            <button
                                type="button"
                                onClick={handleResend}
                                style={{ fontSize: 13.5, fontWeight: 700, color: 'rgba(255,255,255,0.75)', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1.5px solid rgba(255,255,255,0.2)' }}
                            >
                                Resend code
                            </button>
                        )}
                    </div>
                </form>
            }
        />
    )
}
