import type { MarketPayload } from './analytics.ts';

/** Same close-to-close periods as the portfolio. BIL is an observed USD cash proxy,
 * not a riskless theoretical rate. Missing data never becomes a zero cash return. */
export function historicalSharpe(dates: string[], dailyReturns: number[], payload?: MarketPayload): number | null {
  if (dates.length !== dailyReturns.length + 1 || dailyReturns.length < 2 || dailyReturns.some(r => !Number.isFinite(r))) return null;
  const cash = new Map(payload?.series.BIL?.points.map(p => [p.date, p.close]) ?? []);
  const prices = dates.map(d => cash.get(d));
  if (prices.some(p => p === undefined || !Number.isFinite(p) || p <= 0)) return null;
  const excess = dailyReturns.map((r, i) => r - (prices[i + 1]! / prices[i]! - 1));
  const mean = excess.reduce((a, b) => a + b, 0) / excess.length;
  const variance = excess.reduce((a, b) => a + (b - mean) ** 2, 0) / (excess.length - 1);
  return variance > 1e-20 ? Math.sqrt(252) * mean / Math.sqrt(variance) : null;
}
