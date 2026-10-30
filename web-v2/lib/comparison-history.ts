import type { MarketPayload, PortfolioAnalytics } from './analytics.ts';
import type { ExamplePortfolioResult } from './example-portfolio.ts';

/** Slice an existing return path, never reconstruct its holdings from a later snapshot. */
export function historyWindow(source: PortfolioAnalytics, start: string, end: string, capital = 1): PortfolioAnalytics | null {
  const first = source.dates.findIndex(date => date >= start);
  const last = source.dates.findLastIndex(date => date <= end);
  if (first < 0 || last <= first) return null;
  const curve = source.curve.slice(first, last + 1).map(value => value / source.curve[first]);
  const benchmarkCurve = source.benchmarkCurve.slice(first, last + 1).map(value => value / source.benchmarkCurve[first]);
  const dates = source.dates.slice(first, last + 1);
  return pathAnalytics(dates, curve, benchmarkCurve, capital);
}

function pathAnalytics(dates: string[], curve: number[], benchmarkCurve: number[], capital: number): PortfolioAnalytics {
  const dailyReturns = curve.slice(1).map((value, i) => value / curve[i] - 1);
  const benchmarkReturns = benchmarkCurve.slice(1).map((value, i) => value / benchmarkCurve[i] - 1);
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const covariance = (a: number[], b: number[]) => {
    const ma = mean(a), mb = mean(b);
    return a.reduce((sum, value, i) => sum + (value - ma) * (b[i] - mb), 0) / Math.max(1, a.length - 1);
  };
  let peak = 1, maxDrawdown = 0;
  for (const value of curve) { peak = Math.max(peak, value); maxDrawdown = Math.min(maxDrawdown, value / peak - 1); }
  return { dates, curve, benchmarkCurve, dailyReturns, benchmarkReturns, totalReturn: curve.at(-1)! - 1,
    benchmarkReturn: benchmarkCurve.at(-1)! - 1, annualVolatility: Math.sqrt(Math.max(0, covariance(dailyReturns, dailyReturns)) * 252),
    beta: covariance(dailyReturns, benchmarkReturns) / Math.max(covariance(benchmarkReturns, benchmarkReturns), 1e-12),
    maxDrawdown, pnl: capital * (curve.at(-1)! - 1), startDate: dates[0], endDate: dates.at(-1)!, positions: [] };
}

/** Apply sizing changes to the overview's dated eligibility and rebalance schedule.
 * Daily: absolute target preferences on each date's covered basket.
 * Monthly: proportional tilts to the original monthly allocations; untouched names
 * absent from the selected snapshot retain their historical sizing preference.
 * Long and short sleeves are normalized separately. An empty sleeve stays in cash.
 */
export function comparisonHistory(payload: MarketPayload, history: ExamplePortfolioResult, mode: 'daily' | 'monthly',
  current: Record<string, number>, proposed: Record<string, number>, start: string, end: string, capital: number, costBps = 0) {
  const keys = new Set([...Object.keys(current), ...Object.keys(proposed)]);
  for (const ticker of keys) if (!Number.isFinite(proposed[ticker] ?? 0)) throw Error(`Invalid weight for ${ticker}.`);
  if ([...keys].every(t => Math.abs((proposed[t] ?? 0) - (current[t] ?? 0)) < 1e-12)) return historyWindow(history.analytics, start, end, capital);
  for (const ticker of keys) if (Math.abs(proposed[ticker] ?? 0) > 1e-12 && !history.tickers.includes(ticker)) throw Error(`${ticker} is outside this portfolio’s dated history.`);
  const long = Object.values(proposed).reduce((s, w) => s + Math.max(0, w), 0);
  const short = Object.values(proposed).reduce((s, w) => s + Math.max(0, -w), 0);
  const currentInvested = Object.values(current).reduce((s, w) => s + Math.abs(w), 0);
  const maps = history.tickers.map(t => new Map((payload.series[t]?.points ?? []).map(p => [p.date, p.close])));
  let values = history.tickers.map(() => 0), cash = 1, nav = 1, previousRebalance = -1;
  const curve = [1];
  const rate = mode === 'monthly' ? Math.max(0, costBps) / 10000 : 0;
  for (let i = 1; i < history.days.length && history.days[i].date <= end; i++) {
    const previous = history.days[i - 1], day = history.days[i];
    const rebalanceIndex = mode === 'daily' ? previous.rebalance : day.rebalance;
    if (rebalanceIndex !== previousRebalance && rebalanceIndex >= 0) {
      const base = history.rebalances[rebalanceIndex].targets;
      const scores = base.map((weight, j) => {
        if (!weight) return 0;
        const ticker = history.tickers[j];
        if (mode === 'daily') return proposed[ticker] ?? 0;
        const anchor = current[ticker] ?? 0;
        if (Math.abs(anchor) > 1e-12) return weight * (proposed[ticker] ?? 0) / anchor;
        // Previously selected names absent from today's book remain in their historical months.
        return Math.abs(proposed[ticker] ?? 0) > 1e-12 ? proposed[ticker] : weight;
      });
      const positive = scores.reduce((s, w) => s + Math.max(0, w), 0);
      const negative = scores.reduce((s, w) => s + Math.max(0, -w), 0);
      const budgetScale = mode === 'daily' ? 1 : base.reduce((s, w) => s + Math.abs(w), 0) / Math.max(currentInvested, 1e-12);
      const targets = scores.map(w => w > 0 && positive > 0 ? w / positive * long * budgetScale : w < 0 && negative > 0 ? w / negative * short * budgetScale : 0);
      let after = nav;
      for (let k = 0; k < 30; k++) after = nav - rate * targets.reduce((s, w, j) => s + Math.abs(w * after - values[j]), 0);
      values = targets.map(w => w * after); cash = after - values.reduce((s, v) => s + v, 0);
      previousRebalance = rebalanceIndex;
    }
    values = values.map((value, j) => {
      if (!value) return 0;
      const before = maps[j].get(previous.date), after = maps[j].get(day.date);
      if (!before || !after || !Number.isFinite(before) || !Number.isFinite(after) || before <= 0 || after <= 0) throw Error(`Missing price for ${history.tickers[j]} on ${day.date}.`);
      return value * after / before;
    });
    nav = cash + values.reduce((s, v) => s + v, 0);
    if (!(nav > 0) || !Number.isFinite(nav)) throw Error(`Alternative portfolio exhausts its capital on ${day.date}.`);
    curve.push(nav);
  }
  return historyWindow(pathAnalytics(history.analytics.dates.slice(0, curve.length), curve, history.analytics.benchmarkCurve.slice(0, curve.length), capital), start, end, capital);
}
