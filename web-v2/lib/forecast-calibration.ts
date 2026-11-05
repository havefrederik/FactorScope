export type RiskCheck = { index: number; sessions: number; weights: number[]; annualVariance: number; excess: boolean };
export type RiskCalibration = { windows: { asOf: string; through: string; predictedVolatility: number; realizedReturn: number; standardizedReturn: number }[]; bias: number | null };
/** Evaluate only complete, non-overlapping windows AFTER the decisions are made.
 * Holdings stay at their decision-date weights for this diagnostic; it is not
 * the traded strategy P&L. Risk is checked on additive arithmetic returns.
 */
export function calibrateRisk(checks: RiskCheck[], dates: string[], returns: number[][], riskFree: (number | undefined)[]): RiskCalibration {
  const windows: RiskCalibration['windows'] = [];
  let lastEnd = -1;
  for (const c of checks) {
    if (!Number.isInteger(c.sessions) || c.sessions < 1 || !Number.isInteger(c.index) || c.index < 0 || c.weights.length !== returns.length || !c.weights.every(Number.isFinite) || !Number.isFinite(c.annualVariance) || c.annualVariance < 0) throw Error('Invalid forecast evaluation inputs.');
    if (c.index < lastEnd || c.index + c.sessions >= dates.length || c.annualVariance <= 1e-20) continue;
    let realizedReturn = 0;
    for (let t = c.index; t < c.index + c.sessions; t++) {
      const rf = c.excess ? riskFree[t] : 0;
      if (rf === undefined || !Number.isFinite(rf) || returns.some(row => !Number.isFinite(row[t]))) throw Error('Forecast evaluation requires complete matching return intervals.');
      realizedReturn += c.weights.reduce((sum, w, i) => sum + w * (returns[i][t] - rf), 0);
    }
    const predictedVolatility = Math.sqrt(c.annualVariance * c.sessions / 252);
    windows.push({ asOf: dates[c.index], through: dates[c.index + c.sessions], predictedVolatility, realizedReturn, standardizedReturn: realizedReturn / predictedVolatility });
    lastEnd = c.index + c.sessions;
  }
  const n = windows.length, mean = n ? windows.reduce((s, w) => s + w.standardizedReturn, 0) / n : 0;
  return { windows, bias: n < 20 ? null : Math.sqrt(windows.reduce((s, w) => s + (w.standardizedReturn - mean) ** 2, 0) / (n - 1)) };
}
