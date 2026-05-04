import { spawn } from 'node:child_process'
import http from 'node:http'
import electronPath from 'electron'

const host = '127.0.0.1'
const port = process.env.PORT || '5173'
const rendererUrl = `http://${host}:${port}`

const vite = spawn('npm', ['run', 'dev:web', '--', '--host', host], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, PORT: port },
})

function waitForRenderer(url, attempts = 120) {
  return new Promise((resolve, reject) => {
    const tryConnect = (remaining) => {
      const request = http.get(url, (response) => {
        response.resume()
        resolve()
      })

      request.on('error', () => {
        if (remaining <= 0) {
          reject(new Error(`Renderer did not start at ${url}`))
          return
        }
        setTimeout(() => tryConnect(remaining - 1), 500)
      })
    }

    tryConnect(attempts)
  })
}

try {
  await waitForRenderer(rendererUrl)
} catch (error) {
  console.error(error)
  vite.kill()
  process.exit(1)
}

const electron = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RENDERER_URL: rendererUrl },
})

electron.on('exit', (code) => {
  vite.kill()
  process.exit(code ?? 0)
})

process.on('SIGINT', () => {
  electron.kill()
  vite.kill()
  process.exit(0)
})
