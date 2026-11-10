/** Forecast horizons are independent of update frequency and trading rules.
 * Matrices passed to the optimizer remain annualized daily-equivalent covariance.
 */
export const forecastHorizons = [1, 5, 21] as const;
export type ForecastSessions = typeof forecastHorizons[number];
export type ForecastOptions = { sessions: ForecastSessions; weighting: 'Responsive' | 'Equal-weight' };
export const defaultForecastOptions: ForecastOptions = { sessions: 5, weighting: 'Responsive' };
export function validateForecastOptions(options: ForecastOptions) {
  if (!forecastHorizons.includes(options.sessions) || !['Responsive', 'Equal-weight'].includes(options.weighting)) throw Error('Choose a forecast horizon of 1, 5 or 21 sessions and an available weighting method.');
}
export const horizonLabel = (sessions: number) => sessions === 1 ? 'Next session' : `Next ${sessions} sessions`;
export const horizonVolatility = (annualized: number, sessions: number) => annualized * Math.sqrt(sessions / 252);

/** Weighted Bartlett HAC, with an additional finite-horizon Bartlett kernel.
 * sqrt(w_t w_s) preserves PSD: this is X D K D X', where K is the product
 * of two PSD Bartlett kernels. No pairwise renormalization or eigenvalue repair.
 * Returns covariance per session, averaged over the chosen horizon.
 * Newey & West (1987); the finite-horizon taper is our stated extension.
 */
export function weightedHac(series: number[][], halfLife: number, maxLag: number, sessions: number): number[][] {
  const n = series[0]?.length ?? 0;
  if (!series.length) return [];
  if (n < 2 || series.some(row => row.length !== n || row.some(v => !Number.isFinite(v))) || !(halfLife > 0) || !Number.isInteger(maxLag) || maxLag < 0 || !Number.isInteger(sessions) || sessions < 1) throw Error('Risk estimation requires finite aligned observations and valid horizon settings.');
  const raw = Array.from({length: n}, (_, t) => 2 ** (-(n - 1 - t) / halfLife));
  const sum = raw.reduce((a, b) => a + b, 0), weights = raw.map(w => w / sum);
  const x = series.map(row => { const mean = row.reduce((s, v, t) => s + v * weights[t], 0); return row.map((v, t) => (v - mean) * Math.sqrt(weights[t])); });
  const lag = Math.min(maxLag, sessions - 1, n - 1);
  return x.map((a, i) => x.map((b, j) => {
    let value = a.reduce((s, v, t) => s + v * b[t], 0);
    for (let k = 1; k <= lag; k++) {
      const taper = (1 - k / (maxLag + 1)) * (1 - k / sessions);
      for (let t = k; t < n; t++) value += taper * (a[t] * b[t-k] + x[j][t] * x[i][t-k]);
    }
    return value;
  }));
}

/** Fast variances, slower correlations, with separate bounded histories. */
export function responsiveCovariance(series: number[][], sessions: number, maxLag: number) {
  if (!series.length) return [];
  const variance = weightedHac(series.map(row => row.slice(-504)), 20, maxLag, sessions);
  const correlation = weightedHac(series.map(row => row.slice(-1008)), 125, maxLag, sessions);
  const scale = variance.map((row, i) => correlation[i][i] > 1e-25 ? Math.sqrt(Math.max(0, row[i]) / correlation[i][i]) : 0);
  return correlation.map((row, i) => row.map((v, j) => v * scale[i] * scale[j]));
}

/** Independent named/statistical/specific blocks, as an explicit factor-model
 * assumption. Residual LW correlations are retained and calibrated to fast
 * variances; the LW intensity is not claimed optimal for the final EWMA matrix.
 */
export function tradingFactorCovariance(betas: number[][], factorHistory: number[][], statistical: number[][], specific: number[][], residualLw: number[][], sessions: number) {
  const factors = responsiveCovariance(factorHistory, sessions, 3);
  const named = betas.map(a => betas.map(b => a.reduce((sum, ai, i) => sum + ai * b.reduce((s, bj, j) => s + factors[i][j] * bj, 0), 0)));
  const pc = responsiveCovariance(statistical, sessions, 1);
  const specificVariances = specific.map(row => weightedHac([row.slice(-500)], 20, 1, sessions)[0][0]);
  const scale = specificVariances.map((v, i) => residualLw[i][i] > 1e-25 ? Math.sqrt(Math.max(0, v) / residualLw[i][i]) : 0);
  const common = named.map((row,i)=>row.map((v,j)=>v+pc[i][j]));
  const residual = residualLw.map((row,i)=>row.map((v,j)=>v*scale[i]*scale[j]));
  return { covariance: common.map((row,i)=>row.map((v,j)=>v+residual[i][j])), common, residual, factorCovariance: factors, specificVolatility: specificVariances.map(v => Math.sqrt(Math.max(0, v) * 252)) };
}
