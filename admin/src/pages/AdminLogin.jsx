import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

export default function AdminLogin() {
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
            const res = await api.post('/admin/auth/login', { email, password })
            localStorage.setItem('admin_token', res.data.token)
            navigate('/')
        } catch (err) {
            setError(err.response?.data?.error || 'Login failed.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center px-4">
            <div className="w-full max-w-sm">
                <h1 className="text-2xl font-bold text-[#00ff88] text-center mb-6">Crowwws Admin Login</h1>
                <form onSubmit={handleSubmit} className="bg-[#111] rounded-xl p-6 border border-[#222] space-y-4">
                    {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3">{error}</div>}
                    <input
                        type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#00ff88]"
                        placeholder="Admin email" required
                    />
                    <input
                        type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#00ff88]"
                        placeholder="Password" required
                    />
                    <button type="submit" disabled={loading}
                        className="w-full bg-[#00ff88] hover:bg-[#00dd77] text-black font-semibold py-3 rounded-lg disabled:opacity-50">
                        {loading ? 'Logging in...' : 'Log in'}
                    </button>
                </form>
            </div>
        </div>
    )
}
