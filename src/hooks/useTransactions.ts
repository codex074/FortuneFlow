import { useState, useCallback, useEffect } from 'react'
import { useDatabase } from './useDatabase'
import * as Q from '../lib/queries'
import type { Transaction, AssetType, Currency } from '../types'

interface Filters {
  asset_type?: AssetType
  currency?: Currency
  search?: string
}

export function useTransactions(filters?: Filters) {
  const { db, version, persist } = useDatabase()
  const [transactions, setTransactions] = useState<Transaction[]>([])

  useEffect(() => {
    setTransactions(Q.getAllTransactions(db, filters))
  }, [db, version, filters?.asset_type, filters?.currency, filters?.search])

  const add = useCallback(
    (data: Parameters<typeof Q.insertTransaction>[1]) => {
      Q.insertTransaction(db, data)
      persist()
    },
    [db, persist]
  )

  const update = useCallback(
    (id: number, data: Parameters<typeof Q.updateTransaction>[2]) => {
      Q.updateTransaction(db, id, data)
      persist()
    },
    [db, persist]
  )

  const remove = useCallback(
    (id: number) => {
      Q.deleteTransaction(db, id)
      persist()
    },
    [db, persist]
  )

  return { transactions, add, update, remove }
}

export function useRecentTransactions(limit = 10) {
  const { db, version } = useDatabase()
  const [transactions, setTransactions] = useState<Transaction[]>([])

  useEffect(() => {
    setTransactions(Q.getRecentTransactions(db, limit))
  }, [db, version, limit])

  return transactions
}
