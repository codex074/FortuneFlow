const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('fortuneflow', {
  platform: process.platform,
  requestAssetCatalog: (source, payload) => ipcRenderer.invoke('asset-catalog:request', source, payload),
})
