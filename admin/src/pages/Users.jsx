import { useState, useEffect } from 'react'
import api from '../services/api'

export default function Users() {
    const [users, setUsers] = useState([])
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const limit = 50

    const fetchUsers = async () => {
        setLoading(true)
        try {
            const res = await api.get(`/admin/users?page=${page}&limit=${limit}&search=${search}`)
            setUsers(res.data.users || [])
            setTotal(res.data.total || 0)
        } catch (err) {
            console.error('Failed to fetch users:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchUsers() }, [page, search])

    const handleBan = async (userId) => {
        if (!confirm('Ban this user?')) return
        try {
            await api.post('/admin/ban', { userId, reason: 'Admin action' })
            fetchUsers()
        } catch (err) { alert('Failed to ban') }
    }

    const handleUnban = async (userId) => {
        try {
            await api.post('/admin/unban', { userId })
            fetchUsers()
        } catch (err) { alert('Failed to unban') }
    }

    return (
        <div className="p-8">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Users</h2>
                <input
                    type="text" value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                    className="bg-[#111] border border-[#333] rounded-lg px-4 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#00ff88] w-64"
                    placeholder="Search by email..."
                />
            </div>

            {loading ? (
                <p className="text-gray-500">Loading...</p>
            ) : (
                <>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-gray-500 border-b border-[#1a1a1a]">
                                    <th className="pb-3 pr-4">Email</th>
                                    <th className="pb-3 pr-4">Joined</th>
                                    <th className="pb-3 pr-4">Status</th>
                                    <th className="pb-3 pr-4">Reports Against</th>
                                    <th className="pb-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((u) => (
                                    <tr key={u.id} className="border-b border-[#111] hover:bg-[#111]">
                                        <td className="py-3 pr-4">{u.email}</td>
                                        <td className="py-3 pr-4 text-gray-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                                        <td className="py-3 pr-4">
                                            {u.isBanned ? (
                                                <span className="px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400">Banned</span>
                                            ) : (
                                                <span className="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400">Active</span>
                                            )}
                                        </td>
                                        <td className="py-3 pr-4 text-gray-500">{u.reportsAgainst || 0}</td>
                                        <td className="py-3">
                                            {u.isBanned ? (
                                                <button onClick={() => handleUnban(u.id)}
                                                    className="px-3 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 text-xs">Unban</button>
                                            ) : (
                                                <button onClick={() => handleBan(u.id)}
                                                    className="px-3 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs">Ban</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-between mt-4">
                        <span className="text-sm text-gray-500">{total} total users</span>
                        <div className="flex gap-2">
                            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                                className="px-3 py-1 rounded bg-[#111] text-gray-400 hover:bg-[#1a1a1a] disabled:opacity-30 text-sm">Prev</button>
                            <span className="px-3 py-1 text-sm text-gray-500">Page {page}</span>
                            <button onClick={() => setPage(page + 1)} disabled={users.length < limit}
                                className="px-3 py-1 rounded bg-[#111] text-gray-400 hover:bg-[#1a1a1a] disabled:opacity-30 text-sm">Next</button>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
