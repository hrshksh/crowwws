import { useState, useEffect } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import api from '../services/api'

export default function Analytics() {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchAnalytics = async () => {
            try {
                const res = await api.get('/admin/analytics')
                setData(res.data)
            } catch (err) {
                console.error('Failed to fetch analytics:', err)
            } finally {
                setLoading(false)
            }
        }
        fetchAnalytics()
    }, [])

    if (loading) return <div className="p-8 text-gray-500">Loading...</div>
    if (!data) return <div className="p-8 text-gray-500">No data available.</div>

    // Build peak hours chart data
    const hoursData = Array.from({ length: 24 }, (_, i) => ({
        hour: `${i}:00`,
        sessions: 0,
    }))

    return (
        <div className="p-8">
            <h2 className="text-2xl font-bold mb-6">Analytics</h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Summary cards */}
                <div className="bg-[#111] rounded-xl p-6 border border-[#1a1a1a]">
                    <p className="text-sm text-gray-500 mb-1">Avg Session Length</p>
                    <p className="text-2xl font-bold text-[#00ff88]">{data.avgSessionLength} min</p>
                </div>
                <div className="bg-[#111] rounded-xl p-6 border border-[#1a1a1a]">
                    <p className="text-sm text-gray-500 mb-1">Peak Hour</p>
                    <p className="text-2xl font-bold text-[#3b82f6]">{data.peakHour}:00</p>
                </div>
            </div>

            {/* DAU Chart */}
            <div className="bg-[#111] rounded-xl p-6 border border-[#1a1a1a] mb-6">
                <h3 className="text-lg font-semibold mb-4">Daily Active Users (Last 30 days)</h3>
                {data.dauByDay && data.dauByDay.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={data.dauByDay}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                            <XAxis dataKey="date" stroke="#666" tick={{ fontSize: 11 }} />
                            <YAxis stroke="#666" tick={{ fontSize: 11 }} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px' }}
                                labelStyle={{ color: '#aaa' }}
                            />
                            <Line type="monotone" dataKey="count" stroke="#00ff88" strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <p className="text-gray-500 text-sm">No data yet.</p>
                )}
            </div>

            {/* Top Keywords */}
            {data.topKeywords && data.topKeywords.length > 0 && (
                <div className="bg-[#111] rounded-xl p-6 border border-[#1a1a1a]">
                    <h3 className="text-lg font-semibold mb-4">Top Keywords This Week</h3>
                    <div className="flex flex-wrap gap-2">
                        {data.topKeywords.map((kw, i) => (
                            <span key={i} className="bg-[#00ff88]/10 text-[#00ff88] px-3 py-1 rounded-full text-sm border border-[#00ff88]/20">
                                {kw.keyword} ({kw.count})
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
