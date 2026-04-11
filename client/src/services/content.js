import api from './api'

export async function fetchAuthVisual() {
    const res = await api.get('/content/auth-visual')
    return res.data.imageDataUrl || ''
}
