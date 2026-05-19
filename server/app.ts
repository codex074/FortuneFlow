import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { initSchema } from './db.js'
import authRoutes from './routes/auth.js'
import transactionRoutes from './routes/transactions.js'
import assetRoutes from './routes/assets.js'
import priceHistoryRoutes from './routes/priceHistory.js'
import tradingRoutes from './routes/trading.js'
import settingsRoutes from './routes/settings.js'
import marketRoutes from './routes/market.js'

const app = express()

app.use(cors())
app.use(express.json())

let schemaReady: Promise<void> | null = null
app.use((_req, _res, next) => {
  if (!schemaReady) {
    schemaReady = initSchema()
  }
  schemaReady.then(() => next()).catch(next)
})

app.use('/api/auth', authRoutes)
app.use('/api/transactions', transactionRoutes)
app.use('/api/assets', assetRoutes)
app.use('/api/price-history', priceHistoryRoutes)
app.use('/api/trading', tradingRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/market', marketRoutes)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

export default app
