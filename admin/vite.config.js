export default {
  esbuild: {
    jsx: 'automatic',
  },
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
}
