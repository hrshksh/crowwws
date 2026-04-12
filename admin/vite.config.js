export default {
  esbuild: {
    jsx: 'automatic',
  },
  build: {
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
}
