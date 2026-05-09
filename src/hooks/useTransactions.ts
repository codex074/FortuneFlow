import { useState, useCallback, useEffect } from 'react'
import { useDatabase } from './useDatabase'
import * as api from '../lib/api'
import type { Transaction, AssetType, Currency } from '../types'

interface Filters {
  asset_type?: AssetType
  currency?: Currency
  search?: string
}

export function useTransactions(filters?: Filters) {
  const { version, bump } = useDatabase()
  const [transactions, setTransactions] = useState<Transaction[]>([])

  useEffect(() => {
    api.getTransactions(filters).then(setTransactions).catch(console.error)
  }, [version, filters?.asset_type, filters?.currency, filters?.search])

  const add = useCallback(
    async (data: Parameters<typeof api.createTransaction>[0]) => {
      await api.createTransaction(data)
      bump()
    },
    [bump]
  )

  const update = useCallback(
    async (id: number, data: Parameters<typeof api.updateTransaction>[1]) => {
      await api.updateTransaction(id, data)
      bump()
    },
    [bump]
  )

  const remove = useCallback(
    async (id: number) => {
      await api.deleteTransaction(id)
      bump()
    },
    [bump]
  )

  return { transactions, add, update, remove }
}

export function useRecentTransactions(limit = 10) {
  const { version } = useDatabase()
  const [transactions, setTransactions] = useState<Transaction[]>([])

  useEffect(() => {
    api.getRecentTransactions(limit).then(setTransactions).catch(console.error)
  }, [version, limit])

  return transactions
}
