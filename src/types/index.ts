export type AssetType = 'stock' | 'crypto' | 'fund' | 'gold' | 'bond' | 'savings' | 'cash'
export type Currency = 'THB' | 'USD'
export type Action = 'buy' | 'sell' | 'dividend' | 'deposit' | 'withdraw'

export interface Transaction {
  id: number
  date: string
  asset_name: string
  asset_type: AssetType
  currency: Currency
  action: Action
  units: number
  price_per_unit: number
  total_cost: number
  fees: number
  notes: string | null
  created_at: string
}

export interface Asset {
  id: number
  name: string
  type: AssetType
  currency: Currency
  current_price: number | null
  last_updated: string | null
}

export interface Holding {
  asset_name: string
  asset_type: AssetType
  currency: Currency
  units: number
  avg_cost: number
  total_invested: number
  current_price: number | null
  current_value: number | null
  unrealized_profit: number | null
  unrealized_profit_pct: number | null
  realized_profit: number
  /** @deprecated use unrealized_profit */
  profit_loss: number | null
  /** @deprecated use unrealized_profit_pct */
  profit_loss_pct: number | null
}

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  stock: 'Stock',
  crypto: 'Crypto',
  fund: 'Fund',
  gold: 'Gold',
  bond: 'Bond',
  savings: 'Savings',
  cash: 'Cash',
}

export const ASSET_TYPE_COLORS: Record<AssetType, string> = {
  stock: '#5645d4',
  crypto: '#dd5b00',
  fund: '#2a9d99',
  gold: '#f5d75e',
  bond: '#7b3ff2',
  savings: '#1aae39',
  cash: '#64748b',
}
