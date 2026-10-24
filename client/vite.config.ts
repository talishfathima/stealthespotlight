import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  // The API server loads the repo-root .env, so the dev proxy must read it too.
  // (process.cwd() is client/ when started via the npm workspace.)
  const rootEnv = loadEnv(mode, path.resolve(__dirname, '..'), '')
  const env = loadEnv(mode, process.cwd(), '')
  const backendPort = Number(rootEnv.PORT ?? env.PORT ?? '3001')
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/api': {
          target: `https://stealthespotlight-sloa.onrender.com:${backendPort}`,
          changeOrigin: true,
        },
        '/socket.io': {
          target: `https://stealthespotlight-sloa.onrender.com:${backendPort}`,
          ws: true,
        },
      },
    },
  }
})
