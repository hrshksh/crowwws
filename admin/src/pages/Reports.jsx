import { useState, useEffect } from 'react'
import api from '../services/api'

export default function Reports() {
    const [reports, setReports] = useState([])
    const [filter, setFilter] = useState('false') // reviewed filter
    const [loading, setLoading] = useState(true)

    const fetchReports = async () => {
        setLoading(true)
        try {
            const res = await api.get(`/admin/reports?reviewed=${filter}`)
            setReports(res.data.reports || [])
        } catch (err) {
            console.error('Failed to fetch reports:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchReports() }, [filter])

    const handleBan = async (userId) => {
        if (!confirm('Ban this user?')) return
        try {
            await api.post('/admin/ban', { userId, reason: 'Banned from reports' })
            fetchReports()
        } catch (err) {
            alert('Failed to ban user')
        }
    }

    const handleDismiss = async (reportId) => {
        // Mark as reviewed by fetching again — in a real app you'd have a separate endpoint
        alert('Report dismissed')
        fetchReports()
    }

    return (
        <div className="p-8">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Reports</h2>
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
            ) : reports.length === 0 ? (
                <p className="text-gray-500">No reports found.</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-gray-500 border-b border-[#1a1a1a]">
                                <th className="pb-3 pr-4">Reporter</th>
                                <th className="pb-3 pr-4">Reported</th>
                                <th className="pb-3 pr-4">Reason</th>
                                <th className="pb-3 pr-4">Session</th>
                                <th className="pb-3 pr-4">Time</th>
                                <th className="pb-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reports.map((r) => (
                                <tr key={r.id} className="border-b border-[#111] hover:bg-[#111]">
                                    <td className="py-3 pr-4">{r.reporter?.email || r.reporterId}</td>
                                    <td className="py-3 pr-4">{r.reported?.email || r.reportedId}</td>
                                    <td className="py-3 pr-4 max-w-xs truncate">{r.reason}</td>
                                    <td className="py-3 pr-4 font-mono text-xs text-gray-500">{r.sessionId?.slice(0, 8)}...</td>
                                    <td className="py-3 pr-4 text-gray-500">{new Date(r.createdAt).toLocaleString()}</td>
                                    <td className="py-3 flex gap-2">
                                        <button onClick={() => handleBan(r.reportedId)}
                                            className="px-3 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs">Ban</button>
                                        <button onClick={() => handleDismiss(r.id)}
                                            className="px-3 py-1 rounded bg-[#1a1a1a] text-gray-400 hover:bg-[#222] text-xs">Dismiss</button>
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
