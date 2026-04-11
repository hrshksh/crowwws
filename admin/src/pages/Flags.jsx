import { useState, useEffect } from 'react'
import api from '../services/api'

export default function Flags() {
    const [flags, setFlags] = useState([])
    const [filter, setFilter] = useState('false')
    const [loading, setLoading] = useState(true)

    const fetchFlags = async () => {
        setLoading(true)
        try {
            const res = await api.get(`/admin/flags?reviewed=${filter}`)
            setFlags(res.data.flags || [])
        } catch (err) {
            console.error('Failed to fetch flags:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchFlags() }, [filter])

    const handleReview = async (flagId, action) => {
        if (action === 'ban' && !confirm('Ban this user?')) return
        try {
            await api.post(`/admin/flags/${flagId}/review`, { action })
            fetchFlags()
        } catch (err) {
            alert('Failed to review flag')
        }
    }

    return (
        <div className="p-8">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Moderation Flags</h2>
                <select
                    value={filter} onChange={(e) => setFilter(e.target.value)}
                    className="bg-[#111] border border-[#333] rounded-lg px-3 py-2 text-sm text-white"
                >
                    <option value="false">Unreviewed</option>
                    <option value="true">Reviewed</option>
                </select>
            </div>

            {loading ? (
                <p className="text-gray-500">Loading...</p>
            ) : flags.length === 0 ? (
                <p className="text-gray-500">No flags found.</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-gray-500 border-b border-[#1a1a1a]">
                                <th className="pb-3 pr-4">User</th>
                                <th className="pb-3 pr-4">Type</th>
                                <th className="pb-3 pr-4">Confidence</th>
                                <th className="pb-3 pr-4">Session</th>
                                <th className="pb-3 pr-4">Time</th>
                                <th className="pb-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {flags.map((f) => (
                                <tr key={f.id} className="border-b border-[#111] hover:bg-[#111]">
                                    <td className="py-3 pr-4">{f.user?.email || f.userId}</td>
                                    <td className="py-3 pr-4">
                                        <span className={`px-2 py-0.5 rounded text-xs ${f.type === 'video' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                            {f.type}
                                        </span>
                                    </td>
                                    <td className="py-3 pr-4">
                                        <span className={`font-mono ${f.confidence > 0.9 ? 'text-red-400' : 'text-yellow-400'}`}>
                                            {(f.confidence * 100).toFixed(1)}%
                                        </span>
                                    </td>
                                    <td className="py-3 pr-4 font-mono text-xs text-gray-500">{f.sessionId?.slice(0, 8)}...</td>
                                    <td className="py-3 pr-4 text-gray-500">{new Date(f.createdAt).toLocaleString()}</td>
                                    <td className="py-3 flex gap-2">
                                        {!f.reviewed ? (
                                            <>
                                                <button onClick={() => handleReview(f.id, 'ban')}
                                                    className="px-3 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs">Ban</button>
                                                <button onClick={() => handleReview(f.id, 'dismiss')}
                                                    className="px-3 py-1 rounded bg-[#1a1a1a] text-gray-400 hover:bg-[#222] text-xs">Dismiss</button>
                                            </>
                                        ) : (
                                            <span className="text-xs text-gray-500">{f.action}</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
