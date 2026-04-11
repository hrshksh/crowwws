// API utility with axios and JWT interceptor
import axios from 'axios'

const api = axios.create({
    baseURL: `${import.meta.env.VITE_API_ORIGIN || 'http://127.0.0.1:5000'}/api`,
    headers: { 'Content-Type': 'application/json' },
})

// Attach JWT to every request
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

// Handle 401 responses
api.interceptors.response.use(
    (res) => res,
    (err) => {
        if (err.response?.status === 401) {
            localStorage.removeItem('token')
            // Don't redirect if already on auth pages
            if (!['/login', '/register', '/verify'].includes(window.location.pathname)) {
                window.location.href = '/login'
            }
        }
        return Promise.reject(err)
    }
)

export default api
