export default {
  esbuild: {
    jsx: 'automatic',
  },
  build: {
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5000',
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,
      },
    },
  },
}
