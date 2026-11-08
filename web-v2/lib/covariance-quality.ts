import { buildIewmaExpertSnapshots, createCombinedIewmaPredictor, type MarketPayload, type CovarianceForecastAnalytics } from './analytics.ts';
import { academicRisk, validateAcademicFactors } from './academic-factors.ts';
import { ledoitWolf } from './shrinkage-risk.ts';
import { forecastHorizons, type ForecastSessions } from './forecast-horizon.ts';

export const qualityModels = [
  { id: 'cm', label: 'CM-IEWMA', color: '#50d9c5' },
  { id: 'ff', label: 'Fama–French + momentum · residual LW', color: '#f0b55b' },
  { id: 'lw', label: 'Direct Ledoit–Wolf', color: '#acb8ce' },
  { id: 'iewma', label: 'IEWMA · 63 / 125 sessions', color: '#b394ff' },
] as const;
export type QualityModelId = typeof qualityModels[number]['id'];
export type QualityInput = { payload: MarketPayload; tickers: string[]; weights: number[]; asOf: string; sessions: ForecastSessions };
export type QualityObservation = { loss: number; predictedRisk: number; realizedReturn: number; standardizedReturn: number | null };
export type QualityPoint = { asOf: string; through: string; expertWeights: number[]; estimates: Record<QualityModelId, QualityObservation> };
export type QualityResult = {
  sessions: number; tickers: string[]; weights: number[]; startDate: string; endDate: string;
  points: QualityPoint[]; summaries: { id: QualityModelId; loss: number; lossVsLw: number; calibration: number | null; coverage: number | null; count: number }[];
  quarters: { quarter: string; count: number; differences: Record<QualityModelId, number> }[];
};

/** Strict Gaussian score. Do not silently repair a failed covariance and score a different model. */
export function gaussianLoss(matrix: number[][], observed: number[]) {
  const n = observed.length;
  if (!n || matrix.length !== n || matrix.some(r => r.length !== n || r.some(v => !Number.isFinite(v))) || observed.some(v => !Number.isFinite(v))) throw Error('Forecast scoring requires finite matching matrices and returns.');
  const l = Array.from({ length: n }, () => Array(n).fill(0));
  let logDet = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    if (Math.abs(matrix[i][j] - matrix[j][i]) > 1e-9 * Math.max(Math.abs(matrix[i][j]), Math.abs(matrix[j][i]), 1e-12)) throw Error('Forecast covariance is not symmetric.');
    let v = matrix[i][j];
    for (let k = 0; k < j; k++) v -= l[i][k] * l[j][k];
    if (i === j) { if (!(v > 0)) throw Error('Forecast covariance is not positive definite.'); l[i][j] = Math.sqrt(v); logDet += Math.log(v); }
    else l[i][j] = v / l[j][j];
  }
  const z: number[] = [];
  for (let i = 0; i < n; i++) z[i] = (observed[i] - z.reduce((s, v, j) => s + l[i][j] * v, 0)) / l[i][i];
  return .5 * (n * Math.log(2 * Math.PI) + logDet + z.reduce((s, v) => s + v * v, 0)) / n;
}

export function scoreForecast(annualMatrix: number[][], observed: number[], weights: number[], sessions: number): QualityObservation {
  const matrix = annualMatrix.map(r => r.map(v => v * sessions / 252));
  const loss = gaussianLoss(matrix, observed);
  const variance = weights.reduce((s, w, i) => s + w * weights.reduce((v, u, j) => v + matrix[i][j] * u, 0), 0);
  const predictedRisk = Math.sqrt(Math.max(0, variance)), realizedReturn = weights.reduce((s, w, i) => s + w * observed[i], 0);
  return { loss, predictedRisk, realizedReturn, standardizedReturn: predictedRisk > 1e-12 ? realizedReturn / predictedRisk : null };
}

/** Exact common calendar, with no carried-forward prices or returns spanning missing sessions. */
export function qualityPanel(input: QualityInput) {
  const { payload, tickers, weights, asOf, sessions } = input;
  if (!forecastHorizons.includes(sessions) || !tickers.length || new Set(tickers).size !== tickers.length || weights.length !== tickers.length || !weights.every(Number.isFinite)) throw Error('Choose a valid horizon and portfolio.');
  if (!payload.academicFactors) throw Error('Published Fama–French data are needed to compare all four models. Reload the portfolio and try again.');
  validateAcademicFactors(payload.academicFactors);
  const end = asOf < payload.academicFactors.through ? asOf : payload.academicFactors.through;
  const maps = tickers.map(t => new Map((payload.series[t]?.points ?? []).filter(p => p.date <= end).map(p => [p.date, p.close])));
  const calendar = payload.academicFactors.rows.map(r => r.date).filter(d => d <= end);
  const first = calendar.findIndex(d => maps.every(m => m.has(d)));
  if (first < 0) throw Error('No shared price and factor history for these holdings.');
  const dates = calendar.slice(first);
  for (const date of dates) if (maps.some(m => !Number.isFinite(m.get(date)) || !(m.get(date)! > 0))) throw Error(`Price coverage is incomplete on ${date}. The comparison cannot bridge missing sessions.`);
  if (dates.length < 501 + sessions) throw Error(`Need 500 warm-up returns and ${sessions} subsequent sessions for every selected stock. This portfolio has ${dates.length - 1} shared returns.`);
  return { dates, returns: maps.map(m => dates.slice(1).map((d, i) => m.get(d)! / m.get(dates[i])! - 1)) };
}

/** Every origin is fitted before its evaluation window. Windows do not overlap.
 * Fixed selected weights/universe are a forecast diagnostic, not a historical holdings strategy.
 * A zero conditional mean is used solely to score covariance (Johansson et al. §4).
 */
export function evaluateCovarianceForecasts(input: QualityInput, progress: (done: number, total: number) => void = () => {}) : QualityResult {
  const { dates, returns } = qualityPanel(input), { tickers, weights, sessions, payload } = input;
  const experts = buildIewmaExpertSnapshots(returns), predict = createCombinedIewmaPredictor(returns, experts);
  const points: QualityPoint[] = [], total = Math.floor((returns[0].length - 500) / sessions);
  progress(0, total);
  for (let origin = 500; origin + sessions < dates.length; origin += sessions) {
    const asOf = dates[origin], cm = predict(origin - 1);
    const ff = academicRisk(payload, { asOf, tickers } as CovarianceForecastAnalytics, weights, payload.academicFactors!, undefined, [], null, { sessions, weighting: 'Responsive' }).forecast;
    const lw = ledoitWolf(returns.map(r => r.slice(origin - 252, origin))).covariance.map(r => r.map(v => v * 252));
    const iewma = experts[2][origin - 1].covariance.map(r => r.map(v => v * 252));
    const observed = returns.map(r => r.slice(origin, origin + sessions).reduce((s, v) => s + v, 0));
    const matrices = { cm: cm.covarianceMatrix, ff: ff.covarianceMatrix, lw, iewma };
    const estimates = Object.fromEntries(qualityModels.map(m => [m.id, scoreForecast(matrices[m.id], observed, weights, sessions)])) as QualityPoint['estimates'];
    points.push({ asOf, through: dates[origin + sessions], expertWeights: cm.weights.map(w => w.weight), estimates });
    progress(points.length, total);
  }
  return summarizeQuality(points, input);
}

export function summarizeQuality(points: QualityPoint[], input: Pick<QualityInput, 'sessions' | 'tickers' | 'weights'>): QualityResult {
  if (!points.length) throw Error('No complete forecast evaluation windows.');
  const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;
  const summaries = qualityModels.map(m => {
    const z = points.map(p => p.estimates[m.id].standardizedReturn).filter((v): v is number => v !== null);
    return { id: m.id, loss: mean(points.map(p => p.estimates[m.id].loss)), lossVsLw: mean(points.map(p => p.estimates[m.id].loss - p.estimates.lw.loss)),
      calibration: z.length >= 20 ? Math.sqrt(mean(z.map(v => v * v))) : null, coverage: z.length >= 20 ? mean(z.map(v => Math.abs(v) <= 1.96 ? 1 : 0)) : null, count: points.length };
  });
  const groups = new Map<string, QualityPoint[]>();
  for (const p of points) { const q = `${p.through.slice(0,4)} Q${Math.ceil(Number(p.through.slice(5,7)) / 3)}`; groups.set(q, [...(groups.get(q) ?? []), p]); }
  const quarters = [...groups].map(([quarter, rows]) => ({ quarter, count: rows.length, differences: Object.fromEntries(qualityModels.map(m => [m.id, mean(rows.map(p => p.estimates[m.id].loss - p.estimates.lw.loss))])) as Record<QualityModelId, number> }));
  return { sessions: input.sessions, tickers: [...input.tickers], weights: [...input.weights], startDate: points[0].asOf, endDate: points.at(-1)!.through, points, summaries, quarters };
}
