interface Cashflow {
  amount: number
  date: Date
}

function xnpv(rate: number, flows: Cashflow[]): number {
  const t0 = flows[0]!.date.getTime()
  return flows.reduce((sum, cf) => {
    const years = (cf.date.getTime() - t0) / (365.25 * 24 * 3600 * 1000)
    return sum + cf.amount / Math.pow(1 + rate, years)
  }, 0)
}

function xnpvDeriv(rate: number, flows: Cashflow[]): number {
  const t0 = flows[0]!.date.getTime()
  return flows.reduce((sum, cf) => {
    const years = (cf.date.getTime() - t0) / (365.25 * 24 * 3600 * 1000)
    return sum - years * cf.amount / Math.pow(1 + rate, years + 1)
  }, 0)
}

export function computeXIRR(flows: Cashflow[]): number | null {
  if (flows.length < 2) return null
  const hasPos = flows.some(cf => cf.amount > 0)
  const hasNeg = flows.some(cf => cf.amount < 0)
  if (!hasPos || !hasNeg) return null

  const sorted = [...flows].sort((a, b) => a.date.getTime() - b.date.getTime())

  const tryGuess = (guess: number): number | null => {
    let rate = guess
    for (let i = 0; i < 300; i++) {
      const npv = xnpv(rate, sorted)
      const d = xnpvDeriv(rate, sorted)
      if (Math.abs(d) < 1e-12) break
      const next = rate - npv / d
      if (Math.abs(next - rate) < 1e-8) {
        return Math.abs(xnpv(next, sorted)) < 1 ? next : null
      }
      rate = Math.max(-0.9999, next)
    }
    return null
  }

  return tryGuess(0.1) ?? tryGuess(-0.1) ?? tryGuess(0.5)
}
