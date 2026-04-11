import { useEffect, useState } from 'react'
import { fetchAuthVisual } from '../services/content'

function VisualFallback({ eyebrow = 'Crowwws' }) {
    return (
        <div style={{
            display: 'flex', height: '100%', minHeight: 320, flexDirection: 'column',
            justifyContent: 'flex-end', borderRadius: 22, overflow: 'hidden', position: 'relative',
            background: 'radial-gradient(ellipse at 60% 20%, #1d2340 0%, #0d1120 40%, #060810 100%)',
            padding: 28,
        }}>
            {/* Subtle grid overlay */}
            <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
            }} />
            {/* Glow */}
            <div style={{
                position: 'absolute', top: -60, left: -60, width: 280, height: 280,
                borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)',
                pointerEvents: 'none', filter: 'blur(20px)',
            }} />
            <div style={{
                position: 'absolute', bottom: -40, right: -40, width: 220, height: 220,
                borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)',
                pointerEvents: 'none', filter: 'blur(20px)',
            }} />

            {/* Brand badge */}
            <div style={{ marginBottom: 20, display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 999, padding: '6px 14px 6px 10px', width: 'fit-content' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}>
                    {eyebrow}
                </span>
            </div>

            <h2 style={{ maxWidth: 360, fontSize: '2.1rem', fontWeight: 800, letterSpacing: '-0.05em', lineHeight: 1.05, color: 'rgba(255,255,255,0.94)', marginBottom: 12 }}>
                A bold visual, controlled from the admin panel.
            </h2>
            <p style={{ maxWidth: 340, fontSize: 13.5, lineHeight: 1.7, color: 'rgba(255,255,255,0.48)' }}>
                Upload a new image in admin and it becomes the left-side panel across the landing and auth views.
            </p>
        </div>
    )
}

export default function AuthSplitLayout({
    eyebrow = 'Crowwws',
    imageAlt = 'Crowwws visual',
    rightPane,
}) {
    const [imageUrl, setImageUrl] = useState('')

    useEffect(() => {
        let isMounted = true

        fetchAuthVisual()
            .then((value) => { if (isMounted) setImageUrl(value) })
            .catch(() => { if (isMounted) setImageUrl('') })

        return () => { isMounted = false }
    }, [])

    return (
        <div className="app-shell split-shell">
            <div className="split-frame">
                <section className="split-visual">
                    {imageUrl ? (
                        <div style={{ position: 'relative', height: '100%', minHeight: 320, overflow: 'hidden', borderRadius: 22 }}>
                            <img
                                src={imageUrl}
                                alt={imageAlt}
                                className="split-image"
                            />
                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 50%)' }} />
                        </div>
                    ) : (
                        <VisualFallback eyebrow={eyebrow} />
                    )}
                </section>

                <section className="split-form">
                    <div className="split-surface">
                        {rightPane}
                    </div>
                </section>
            </div>
        </div>
    )
}
