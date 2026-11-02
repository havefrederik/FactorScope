// Signed Euler variance contributions. A hedging position can have a negative
// share; shares sum to one, but positive contributors can sum to more than one.
export function riskConcentration(tickers: string[], weights: number[], covariance: number[][]) {
  const gross = weights.reduce((sum, w) => sum + Math.abs(w), 0);
  const squared = weights.reduce((sum, w) => sum + w * w, 0);
  const marginal = covariance.map(row => row.reduce((sum, c, j) => sum + c * weights[j], 0));
  const variance = weights.reduce((sum, w, i) => sum + w * marginal[i], 0);
  const positions = tickers.map((ticker, i) => ({ ticker, weight: weights[i], grossWeight: gross > 0 ? Math.abs(weights[i]) / gross : 0, riskShare: variance > 1e-16 ? weights[i] * marginal[i] / variance : null })).filter(p => Math.abs(p.weight) > 1e-10);
  const ranked = [...positions].sort((a, b) => (b.riskShare ?? 0) - (a.riskShare ?? 0));
  return {
    effectivePositions: squared > 0 ? gross * gross / squared : 0,
    topFiveWeight: [...positions].sort((a, b) => b.grossWeight - a.grossWeight).slice(0, 5).reduce((sum, p) => sum + p.grossWeight, 0),
    topFiveRisk: variance > 1e-16 ? ranked.slice(0, 5).reduce((sum, p) => sum + p.riskShare!, 0) : null,
    positions: ranked,
  };
}
