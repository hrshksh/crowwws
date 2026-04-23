import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'

export default function Dashboard() {
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)

    const fetchStats = useCallback(async () => {
        try {
            const res = await api.get('/admin/stats')
            setStats(res.data)
        } catch (err) {
            console.error('Failed to fetch stats:', err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchStats()
        const interval = setInterval(fetchStats, 30000)
        return () => clearInterval(interval)
    }, [fetchStats])

    if (loading) return <div className="p-8 text-gray-500">Loading...</div>

    const cards = [
        { label: 'Active Users', value: stats?.activeUsers ?? 0, color: '#00ff88' },
        { label: 'Active Sessions', value: stats?.activeSessions ?? 0, color: '#3b82f6' },
        { label: 'Reports Today', value: stats?.reportsToday ?? 0, color: '#f59e0b' },
        { label: 'Flags Today', value: stats?.flagsToday ?? 0, color: '#ef4444' },
    ]

    return (
        <div className="p-8">
            <div className="mb-6 flex items-center justify-between gap-4">
                <h2 className="text-2xl font-bold">Dashboard</h2>
                <Link
                    to="/content"
                    className="rounded-lg bg-[#00ff88] px-4 py-2 text-sm font-semibold text-black hover:bg-[#00dd77]"
                >
                    Manage auth image
                </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {cards.map(({ label, value, color }) => (
                    <div key={label} className="bg-[#111] rounded-xl p-6 border border-[#1a1a1a]">
                        <p className="text-sm text-gray-500 mb-1">{label}</p>
                        <p className="text-3xl font-bold" style={{ color }}>{value}</p>
                    </div>
                ))}
            </div>
            <p className="text-xs text-gray-600 mt-4">Auto-refreshes every 30s</p>
        </div>
    )
}
