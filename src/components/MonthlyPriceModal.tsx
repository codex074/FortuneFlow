import { useCallback, useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import * as api from '../lib/api'
import type { Currency, PriceHistory } from '../types'

interface MonthlyRow {
  price: string
  notes: string
  originalId: number | null
  originalPrice: number | null
  originalNotes: string
  originalDate: string | null
}

interface MonthlyPriceModalProps {
  assetName: string
  currency: Currency
  startMonth: string
  existingHistory: PriceHistory[]
  onClose: () => void
  onSaved: () => void
}

function listMonths(startMonth: string, endMonth: string): string[] {
  const [syRaw, smRaw] = startMonth.split('-').map(Number)
  const [eyRaw, emRaw] = endMonth.split('-').map(Number)
  if (!syRaw || !smRaw || !eyRaw || !emRaw) return []
  let y = syRaw
  let m = smRaw
  const out: string[] = []
  while (y < eyRaw || (y === eyRaw && m <= emRaw)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}

function lastDayOfMonth(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  if (!y || !m) return monthKey
  const day = new Date(y, m, 0).getDate()
  return `${monthKey}-${String(day).padStart(2, '0')}`
}

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  if (!y || !m) return monthKey
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function MonthlyPriceModal({
  assetName,
  currency,
  startMonth,
  existingHistory,
  onClose,
  onSaved,
}: MonthlyPriceModalProps) {
  const months = useMemo(() => listMonths(startMonth, currentMonth()), [startMonth])
  const [inputs, setInputs] = useState<Record<string, MonthlyRow>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const next: Record<string, MonthlyRow> = {}
    for (const m of months) {
      const found = existingHistory.find((p) => p.price_date.startsWith(m))
      next[m] = {
        price: found ? String(found.price) : '',
        notes: found?.notes ?? '',
        originalId: found?.id ?? null,
        originalPrice: found?.price ?? null,
        originalNotes: found?.notes ?? '',
        originalDate: found?.price_date ?? null,
      }
    }
    setInputs(next)
  }, [months, existingHistory])

  const setField = useCallback((month: string, field: 'price' | 'notes', value: string) => {
    setInputs((prev) => {
      const row = prev[month]
      if (!row) return prev
      return { ...prev, [month]: { ...row, [field]: value } }
    })
  }, [])

  const save = useCallback(async () => {
    setSaving(true)
    try {
      const ops: Promise<unknown>[] = []
      for (const month of months) {
        const row = inputs[month]
        if (!row) continue
        const trimmed = row.price.trim()
        const parsed = trimmed === '' ? null : Number(trimmed)
        if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) continue

        const notes = row.notes ?? ''
        const priceChanged = parsed !== row.originalPrice
        const notesChanged = notes !== (row.originalNotes ?? '')

        if (parsed !== null && (priceChanged || notesChanged)) {
          ops.push(api.upsertPriceHistory({
            asset_name: assetName,
            currency,
            price_date: row.originalDate ?? lastDayOfMonth(month),
            price: parsed,
            notes,
          }))
        } else if (parsed === null && row.originalId !== null) {
          ops.push(api.deletePriceHistory(row.originalId))
        }
      }
      if (ops.length > 0) await Promise.all(ops)
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }, [assetName, currency, months, inputs, onSaved, onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Monthly Prices - {assetName}</h2>
          <button className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          <p className="monthly-price-hint">
            Optional - fill in any month you have a price for. Empty rows stay empty; clearing a saved row removes it.
          </p>
          <div className="monthly-price-list">
            <div className="monthly-price-head">
              <span>Month</span>
              <span>Price ({currency})</span>
              <span>Note</span>
            </div>
            {months.map((month) => {
              const row = inputs[month]
              if (!row) return null
              return (
                <div key={month} className="monthly-price-row">
                  <span className="monthly-price-month">{monthLabel(month)}</span>
                  <input
                    className="input input-sm"
                    type="number"
                    step="any"
                    min="0"
                    placeholder="-"
                    value={row.price}
                    onChange={(e) => setField(month, 'price', e.target.value)}
                  />
                  <input
                    className="input input-sm"
                    type="text"
                    placeholder="Optional note"
                    value={row.notes}
                    onChange={(e) => setField(month, 'notes', e.target.value)}
                  />
                </div>
              )
            })}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="button" className="btn" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
