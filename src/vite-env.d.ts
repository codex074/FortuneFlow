/// <reference types="vite/client" />

declare const __FORTUNEFLOW_DESKTOP_API_BASE__: string

interface FortuneFlowBridge {
  platform: string
  requestAssetCatalog?: (source: string, payload?: unknown) => Promise<unknown>
}

interface Window {
  fortuneflow?: FortuneFlowBridge
}
