const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('node:path')

const isDev = !app.isPackaged
const devServerUrl = process.env.ELECTRON_RENDERER_URL || 'http://127.0.0.1:5173'

let mainWindow = null

const assetCatalogSources = {
  nasdaqListed: {
    url: 'https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt',
    method: 'GET',
  },
  otherListed: {
    url: 'https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt',
    method: 'GET',
  },
  usTickersTxt: {
    url: 'https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/all/all_tickers.txt',
    method: 'GET',
  },
  usNasdaqFullTickers: {
    url: 'https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nasdaq/nasdaq_full_tickers.json',
    method: 'GET',
  },
  usNyseFullTickers: {
    url: 'https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nyse/nyse_full_tickers.json',
    method: 'GET',
  },
  usAmexFullTickers: {
    url: 'https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/amex/amex_full_tickers.json',
    method: 'GET',
  },
  secFundSearch: {
    url: 'https://api.sec.or.th/FundFactsheet/fund',
    method: 'POST',
  },
  thaiStocksCsv: {
    url: 'https://huggingface.co/datasets/ThunderDrag/Thailand-Stock-Symbols-and-Metadata/resolve/main/thailand.csv',
    method: 'GET',
  },
}

ipcMain.handle('asset-catalog:request', async (_event, sourceKey, payload = {}) => {
  const source = assetCatalogSources[sourceKey]
  if (!source) throw new Error('Unsupported asset catalog source')

  const response = await fetch(source.url, {
    method: source.method,
    headers: {
      Accept: sourceKey === 'secFundSearch' ? 'application/json' : 'text/plain',
      'Content-Type': 'application/json',
    },
    body: source.method === 'POST' ? JSON.stringify(payload) : undefined,
  })

  if (!response.ok) {
    throw new Error(`Asset catalog request failed: ${response.status}`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) return response.json()
  return response.text()
})

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    title: 'FortuneFlow',
    backgroundColor: '#f6f5f4',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    mainWindow.loadURL(devServerUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
