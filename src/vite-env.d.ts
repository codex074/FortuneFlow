/// <reference types="vite/client" />

interface FortuneFlowBridge {
  platform: string
  requestAssetCatalog?: (source: string, payload?: unknown) => Promise<unknown>
}

interface Window {
  fortuneflow?: FortuneFlowBridge
}
