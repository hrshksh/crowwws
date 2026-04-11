import { useEffect, useState } from 'react'
import api from '../services/api'

export default function Content() {
    const [imageDataUrl, setImageDataUrl] = useState('')
    const [preview, setPreview] = useState('')
    const [status, setStatus] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        const loadVisual = async () => {
            try {
                const res = await api.get('/content/admin/auth-visual')
                const image = res.data.imageDataUrl || ''
                setImageDataUrl(image)
                setPreview(image)
            } catch {
                setStatus('Failed to load current image.')
            } finally {
                setLoading(false)
            }
        }

        loadVisual()
    }, [])

    const handleFileChange = (event) => {
        const file = event.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : ''
            setImageDataUrl(result)
            setPreview(result)
            setStatus('')
        }
        reader.readAsDataURL(file)
    }

    const handleSave = async () => {
        if (!imageDataUrl) {
            setStatus('Choose an image before saving.')
            return
        }

        setSaving(true)
        setStatus('')

        try {
            await api.post('/content/admin/auth-visual', { imageDataUrl })
            setStatus('Image updated successfully.')
        } catch (err) {
            setStatus(err.response?.data?.error || 'Failed to save image.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="p-8">
            <div className="mb-6">
                <h2 className="text-2xl font-bold">Auth Layout Image</h2>
                <p className="mt-2 text-sm text-gray-500">
                    This image appears on the left side of the home, login, and sign-up split layout.
                </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="overflow-hidden rounded-2xl border border-[#1a1a1a] bg-[#111]">
                    <div className="border-b border-[#1a1a1a] px-5 py-4 text-sm text-gray-400">Preview</div>
                    <div className="aspect-[4/3] bg-[#090909] p-4">
                        {preview ? (
                            <img
                                src={preview}
                                alt="Auth visual preview"
                                className="h-full w-full rounded-xl object-cover"
                            />
                        ) : (
                            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-[#2a2a2a] text-sm text-gray-500">
                                {loading ? 'Loading preview...' : 'No image uploaded yet.'}
                            </div>
                        )}
                    </div>
                </div>

                <div className="rounded-2xl border border-[#1a1a1a] bg-[#111] p-6">
                    <label className="mb-3 block text-sm font-medium text-white">Upload image</label>
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="block w-full rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] px-4 py-3 text-sm text-gray-300 file:mr-4 file:rounded-lg file:border-0 file:bg-[#00ff88] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-black"
                    />

                    <div className="mt-6 rounded-xl border border-[#1a1a1a] bg-[#0d0d0d] p-4 text-sm text-gray-400">
                        Use a landscape image with strong focal detail. It will scale responsively across all auth-style pages.
                    </div>

                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="mt-6 w-full rounded-xl bg-[#00ff88] px-4 py-3 font-semibold text-black hover:bg-[#00dd77] disabled:opacity-60"
                    >
                        {saving ? 'Saving...' : 'Save image'}
                    </button>

                    {status && (
                        <p className="mt-4 text-sm text-gray-300">{status}</p>
                    )}
                </div>
            </div>
        </div>
    )
}
