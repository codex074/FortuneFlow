const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('fortuneflow', {
  platform: process.platform,
})
