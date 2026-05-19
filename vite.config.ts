import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function normalizeApiBase(value?: string) {
  if (!value) return ''
  const trimmed = value.trim().replace(/\/$/, '')
  if (!trimmed) return ''

  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const desktopApiBase = normalizeApiBase(env.VITE_API_BASE_URL || env.APP_URL)

  return {
    plugins: [react()],
    base: './',
    define: {
      __FORTUNEFLOW_DESKTOP_API_BASE__: JSON.stringify(desktopApiBase),
    },
    server: {
      port: parseInt(process.env['PORT'] || '5173'),
      proxy: {
        '/api': {
          target: 'http://localhost:3002',
          changeOrigin: true,
        },
      },
    },
  }
})
