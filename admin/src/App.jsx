import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import AdminLogin from './pages/AdminLogin'
import Dashboard from './pages/Dashboard'
import Reports from './pages/Reports'
import Flags from './pages/Flags'
import Users from './pages/Users'
import Analytics from './pages/Analytics'
import Content from './pages/Content'

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('admin_token')
  if (!token) return <Navigate to="/login" replace />
  return children
}

function Sidebar() {
  const location = useLocation()
  const links = [
    { path: '/', label: 'Dashboard', icon: '📊' },
    { path: '/reports', label: 'Reports', icon: '🚩' },
    { path: '/flags', label: 'Flags', icon: '⚠️' },
    { path: '/users', label: 'Users', icon: '👥' },
    { path: '/analytics', label: 'Analytics', icon: '📈' },
    { path: '/content', label: 'Content', icon: 'Img' },
  ]

  return (
    <aside className="w-56 bg-[#111] border-r border-[#1a1a1a] min-h-screen p-4 flex flex-col">
      <h1 className="text-lg font-bold text-[#00ff88] mb-6">Crowwws Admin</h1>
      <nav className="space-y-1 flex-1">
        {links.map(({ path, label, icon }) => (
          <Link
            key={path}
            to={path}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${location.pathname === path
                ? 'bg-[#00ff88]/10 text-[#00ff88]'
                : 'text-gray-400 hover:text-white hover:bg-[#1a1a1a]'
              }`}
          >
            <span>{icon}</span> {label}
          </Link>
        ))}
      </nav>
      <button
        onClick={() => { localStorage.removeItem('admin_token'); window.location.href = '/login' }}
        className="text-sm text-gray-500 hover:text-white mt-4"
      >
        Log out
      </button>
    </aside>
  )
}

export default function App() {
  const token = localStorage.getItem('admin_token')
  const location = useLocation()
  const isLoginPage = location.pathname === '/login'

  return (
    <div className="flex">
      {token && !isLoginPage && <Sidebar />}
      <div className="flex-1">
        <Routes>
          <Route path="/login" element={<AdminLogin />} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          <Route path="/flags" element={<ProtectedRoute><Flags /></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute><Users /></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
          <Route path="/content" element={<ProtectedRoute><Content /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  )
}
