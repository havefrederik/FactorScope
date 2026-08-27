export type PricePoint = { date: string; close: number };
export type SymbolSeries = { requested: string; symbol: string; currency: string; exchange: string; instrumentType: string; points: PricePoint[] };
export type MarketPayload = {
  source: string;
  frequency: string;
  adjusted: boolean;
  asOf: string | null;
  factorStartDate?: string | null;
  series: Record<string, SymbolSeries>;
  errors: { ticker: string; message: string }[];
  missingHoldings: string[];
  error?: string;
};

export type AnalyticsHolding = { ticker: string; value: number };
export type AnalysisWindow = number | { startDate?: string; endDate?: string };
export type PositionAnalytics = {
  ticker: string;
  weight: number;
  return: number;
  volatility: number;
  beta: number;
  riskShare: number;
  annualRisk: number;
  pnl: number;
};
export type PortfolioAnalytics = {
  dates: string[];
  curve: number[];
  benchmarkCurve: number[];
  dailyReturns: number[];
  benchmarkReturns: number[];
  totalReturn: number;
  benchmarkReturn: number;
  annualVolatility: number;
  beta: number;
  maxDrawdown: number;
  pnl: number;
  startDate: string;
  endDate: string;
  positions: PositionAnalytics[];
};

export type StrategyRebalanceFrequency = "Weekly" | "Monthly";
export type CovarianceModel = "CM-IEWMA" | "Rolling 126-day";
export type StrategyBacktestConfig = {
  frequency: StrategyRebalanceFrequency;
  targetVolatility: number;
  targetBeta: number;
  maxPosition: number;
  startDate?: string;
  endDate?: string;
  lookback?: number;
  transactionCostBps?: number;
  covarianceModel?: CovarianceModel;
};
export type StrategyExposurePoint = {
  date: string;
  estimatedVolatility: number;
  beta: number;
  investedWeight: number;
};
export type StrategyRebalancePoint = StrategyExposurePoint & {
  turnover: number;
  cost: number;
  largestPosition: string;
  largestWeight: number;
  weights: { ticker: string; weight: number }[];
  covarianceWeights: StrategyExpertWeight[];
};
export type StrategyExpertWeight = { label: string; weight: number };
export type StrategyBacktestAnalytics = {
  dates: string[];
  curve: number[];
  staticCurve: number[];
  benchmarkCurve: number[];
  dailyReturns: number[];
  benchmarkReturns: number[];
  totalReturn: number;
  staticReturn: number;
  benchmarkReturn: number;
  annualVolatility: number;
  beta: number;
  sharpeRatio: number;
  staticSharpeRatio: number;
  benchmarkSharpeRatio: number;
  maxDrawdown: number;
  totalTurnover: number;
  transactionCosts: number;
  averageInvestedWeight: number;
  averageEstimatedVolatility: number;
  averageEstimatedBeta: number;
  startDate: string;
  endDate: string;
  rebalances: StrategyRebalancePoint[];
  exposures: StrategyExposurePoint[];
  finalWeights: { ticker: string; weight: number }[];
  covarianceModel: CovarianceModel;
  covarianceModelLabel: string;
  covarianceExpertWeights: StrategyExpertWeight[];
  volatilityCalibrationGap: number;
  assumptions: {
    lookback: number;
    transactionCostBps: number;
    longOnly: true;
    pointInTime: true;
    covarianceModel: CovarianceModel;
    covarianceCombinationWindow: number;
    covarianceWarmup: number;
  };
};

export type FactorAnalytics = { name: string; group: "Core" | "Style" | "Sector"; exposure: number; riskShare: number; annualRisk: number; returnAttribution: number };
export type FactorLayerAnalytics = { name: "Market" | "Style" | "Sector" | "Idiosyncratic"; riskShare: number; returnAttribution: number };
export type FactorModelAnalytics = {
  factors: FactorAnalytics[];
  layers: FactorLayerAnalytics[];
  rSquared: number;
  systematicReturn: number;
  idiosyncraticReturn: number;
  systematicAttribution: number;
  idiosyncraticAttribution: number;
  reconciliationDifference: number;
  diagnostics: {
    specification: string;
    correlations: FactorCorrelationDiagnostic[];
  };
};
export type FactorCorrelationDiagnostic = { factorA: string; factorB: string; correlation: number; groups: string };
export type SecurityFactorExposure = { name: string; exposure: number };
export type SecurityDecomposition = {
  dates: string[];
  observed: number[];
  systematic: number[];
  factors: { name: string; group: FactorAnalytics["group"]; values: number[] }[];
  market: number[];
  style: number[];
  sector: number[];
  idiosyncratic: number[];
};
export type EventCorrelationAnalytics = {
  averageCorrelation: number;
  pairCount: number;
};
export type RollingCorrelationPoint = { date: string; correlation: number };
export type PairwiseCorrelationDetail = { key: string; tickerA: string; tickerB: string; before: number; event: number; change: number };
export type SecurityDrilldownAnalytics = {
  ticker: string;
  dates: string[];
  curve: number[];
  benchmarkCurve: number[];
  totalReturn: number;
  benchmarkReturn: number;
  annualVolatility: number;
  beta: number;
  maxDrawdown: number;
  correlationWithPortfolio: number;
  rSquared: number;
  systematicReturn: number;
  idiosyncraticReturn: number;
  factorExposures: SecurityFactorExposure[];
  decomposition: SecurityDecomposition;
};

const factorDefs: { name: string; group: FactorAnalytics["group"]; long: string; short?: string }[] = [
  { name: "Market", group: "Core", long: "SPY" },
  { name: "Size", group: "Style", long: "IWM", short: "SPY" },
  { name: "Value", group: "Style", long: "IWD", short: "IWF" },
  { name: "Momentum", group: "Style", long: "MTUM", short: "SPY" },
  { name: "Quality", group: "Style", long: "QUAL", short: "SPY" },
  { name: "Low volatility", group: "Style", long: "USMV", short: "SPY" },
  { name: "Dividend yield", group: "Style", long: "VYM", short: "SPY" },
  { name: "Technology", group: "Sector", long: "XLK", short: "SPY" },
  { name: "Financials", group: "Sector", long: "XLF", short: "SPY" },
  { name: "Energy", group: "Sector", long: "XLE", short: "SPY" },
  { name: "Healthcare", group: "Sector", long: "XLV", short: "SPY" },
  { name: "Communication services", group: "Sector", long: "XLC", short: "SPY" },
  { name: "Consumer discretionary", group: "Sector", long: "XLY", short: "SPY" },
  { name: "Consumer staples", group: "Sector", long: "XLP", short: "SPY" },
  { name: "Industrials", group: "Sector", long: "XLI", short: "SPY" },
  { name: "Materials", group: "Sector", long: "XLB", short: "SPY" },
  { name: "Real estate", group: "Sector", long: "XLRE", short: "SPY" },
  { name: "Utilities", group: "Sector", long: "XLU", short: "SPY" },
];

function mean(values: number[]) { return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1); }
function variance(values: number[]) { const avg = mean(values); return values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / Math.max(values.length - 1, 1); }
function covariance(a: number[], b: number[]) { const n = Math.min(a.length, b.length); const aa = a.slice(-n); const bb = b.slice(-n); const ma = mean(aa); const mb = mean(bb); return aa.reduce((sum, value, i) => sum + (value - ma) * (bb[i] - mb), 0) / Math.max(n - 1, 1); }
function returns(values: number[]) { return values.slice(1).map((value, index) => value / values[index] - 1); }
function correlation(a: number[], b: number[]) { return covariance(a, b) / Math.sqrt(Math.max(variance(a) * variance(b), 1e-24)); }
function maxDrawdown(curve: number[]) { let peak = curve[0] ?? 1; let drawdown = 0; curve.forEach((value) => { peak = Math.max(peak, value); drawdown = Math.min(drawdown, value / peak - 1); }); return drawdown; }

function trimSeries(series: SymbolSeries, startDate: string, endDate?: string) {
  return series.points.filter((point) => point.date >= startDate && (!endDate || point.date <= endDate) && Number.isFinite(point.close));
}

function matrixInverse(matrix: number[][]) {
  const n = matrix.length;
  const augmented = matrix.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => i === j ? 1 : 0)]);
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(augmented[r][i]) > Math.abs(augmented[pivot][i])) pivot = r;
    [augmented[i], augmented[pivot]] = [augmented[pivot], augmented[i]];
    const scale = augmented[i][i];
    if (Math.abs(scale) < 1e-10) return null;
    augmented[i] = augmented[i].map((value) => value / scale);
    for (let r = 0; r < n; r++) if (r !== i) {
      const factor = augmented[r][i];
      augmented[r] = augmented[r].map((value, c) => value - factor * augmented[i][c]);
    }
  }
  return augmented.map((row) => row.slice(n));
}

function regress(y: number[], xs: number[][]) {
  const n = Math.min(y.length, ...xs.map((x) => x.length));
  const yy = y.slice(-n);
  const xx = Array.from({ length: n }, (_, i) => [1, ...xs.map((x) => x.slice(-n)[i])]);
  const k = xx[0]?.length ?? 0;
  const xtx = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => xx.reduce((sum, row) => sum + row[i] * row[j], 0)));
  const xty = Array.from({ length: k }, (_, i) => xx.reduce((sum, row, r) => sum + row[i] * yy[r], 0));
  const inv = matrixInverse(xtx);
  return inv ? inv.map((row) => row.reduce((sum, value, j) => sum + value * xty[j], 0)) : Array(k).fill(0);
}

function regressionStage(target: number[], predictors: number[][]) {
  const coefficients = regress(target, predictors);
  const fitted = target.map((_, row) => coefficients[0] + predictors.reduce((sum, series, column) => sum + (coefficients[column + 1] ?? 0) * series[row], 0));
  const residuals = target.map((value, index) => value - fitted[index]);
  return { target, predictors, coefficients, fitted, residuals };
}

function residualizeSeries(series: number[], controls: number[][]) {
  return controls.length ? regressionStage(series, controls).residuals : [...series];
}

function fitHierarchicalFactorModel(target: number[], factorSeries: number[][]) {
  const indices = (group: FactorAnalytics["group"]) => factorDefs.map((factor, index) => factor.group === group ? index : -1).filter((index) => index >= 0);
  const coreIndices = indices("Core");
  const styleIndices = indices("Style");
  const sectorIndices = indices("Sector");
  const corePredictors = coreIndices.map((index) => factorSeries[index]);
  const styleRaw = styleIndices.map((index) => factorSeries[index]);
  const sectorRaw = sectorIndices.map((index) => factorSeries[index]);

  const coreStage = regressionStage(target, corePredictors);
  const stylePredictors = styleRaw.map((series) => residualizeSeries(series, corePredictors));
  const styleStage = regressionStage(coreStage.residuals, stylePredictors);
  const precedingControls = [...corePredictors, ...styleRaw];
  const sectorTarget = regressionStage(target, precedingControls).residuals;
  const sectorPredictors = sectorRaw.map((series) => residualizeSeries(series, precedingControls));
  const sectorStage = regressionStage(sectorTarget, sectorPredictors);

  const attributionSeries = factorSeries.map(() => [] as number[]);
  coreIndices.forEach((factorIndex, index) => { attributionSeries[factorIndex] = corePredictors[index]; });
  styleIndices.forEach((factorIndex, index) => { attributionSeries[factorIndex] = stylePredictors[index]; });
  sectorIndices.forEach((factorIndex, index) => { attributionSeries[factorIndex] = sectorPredictors[index]; });
  return {
    stages: [coreStage, styleStage, sectorStage],
    stageIndices: [coreIndices, styleIndices, sectorIndices],
    attributionSeries,
    residuals: sectorStage.residuals,
  };
}

function strongestFactorCorrelations(factorSeries: number[][]) {
  const pairs: FactorCorrelationDiagnostic[] = [];
  for (let first = 1; first < factorDefs.length; first++) for (let second = first + 1; second < factorDefs.length; second++) {
    pairs.push({
      factorA: factorDefs[first].name,
      factorB: factorDefs[second].name,
      correlation: correlation(factorSeries[first], factorSeries[second]),
      groups: factorDefs[first].group === factorDefs[second].group ? factorDefs[first].group : `${factorDefs[first].group} / ${factorDefs[second].group}`,
    });
  }
  return pairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)).slice(0, 6);
}

export function buildAnalytics(payload: MarketPayload, holdings: AnalyticsHolding[], window: AnalysisWindow): PortfolioAnalytics | null {
  const total = holdings.reduce((sum, holding) => sum + holding.value, 0);
  const active = holdings.filter((holding) => holding.ticker !== "CASH" && payload.series[holding.ticker]);
  const benchmark = payload.series.SPY;
  if (!active.length || !benchmark || !payload.asOf) return null;
  const endDate = typeof window === "number" ? payload.asOf : window.endDate || payload.asOf;
  const fallbackStart = new Date(`${endDate}T00:00:00Z`);
  fallbackStart.setUTCFullYear(fallbackStart.getUTCFullYear() - (typeof window === "number" ? window : 3));
  const startDate = typeof window === "number" ? fallbackStart.toISOString().slice(0, 10) : window.startDate || fallbackStart.toISOString().slice(0, 10);

  const maps = new Map(active.map((holding) => [holding.ticker, new Map(trimSeries(payload.series[holding.ticker], startDate, endDate).map((point) => [point.date, point.close]))]));
  const benchmarkMap = new Map(trimSeries(benchmark, startDate, endDate).map((point) => [point.date, point.close]));
  const dates = [...benchmarkMap.keys()].filter((date) => active.every((holding) => maps.get(holding.ticker)?.has(date))).sort();
  if (dates.length < 40) return null;

  const priceRows = active.map((holding) => dates.map((date) => maps.get(holding.ticker)!.get(date)!));
  const benchmarkPrices = dates.map((date) => benchmarkMap.get(date)!);
  const weights = active.map((holding) => holding.value / total);
  const activeTickers = new Set(active.map((holding) => holding.ticker));
  const cashWeight = holdings.filter((holding) => holding.ticker === "CASH" || !activeTickers.has(holding.ticker)).reduce((sum, holding) => sum + holding.value / total, 0);
  const curve = dates.map((_, d) => cashWeight + priceRows.reduce((sum, prices, i) => sum + weights[i] * prices[d] / prices[0], 0));
  const benchmarkCurve = benchmarkPrices.map((price) => price / benchmarkPrices[0]);
  const dailyReturns = returns(curve);
  const benchmarkReturns = returns(benchmarkCurve);
  const annualVolatility = Math.sqrt(variance(dailyReturns) * 252);
  const beta = covariance(dailyReturns, benchmarkReturns) / Math.max(variance(benchmarkReturns), 1e-12);
  let peak = curve[0]; let maxDrawdown = 0;
  curve.forEach((value) => { peak = Math.max(peak, value); maxDrawdown = Math.min(maxDrawdown, value / peak - 1); });

  const assetReturns = priceRows.map(returns);
  const covarianceMatrix = assetReturns.map((a) => assetReturns.map((b) => covariance(a, b)));
  const sigmaW = covarianceMatrix.map((row) => row.reduce((sum, value, j) => sum + value * weights[j], 0));
  const portfolioVariance = weights.reduce((sum, weight, i) => sum + weight * sigmaW[i], 0);
  const positions = active.map((holding, i) => {
    const positionReturn = priceRows[i].at(-1)! / priceRows[i][0] - 1;
    const assetBeta = covariance(assetReturns[i], benchmarkReturns) / Math.max(variance(benchmarkReturns), 1e-12);
    const riskShare = portfolioVariance > 0 ? weights[i] * sigmaW[i] / portfolioVariance : 0;
    return { ticker: holding.ticker, weight: weights[i], return: positionReturn, volatility: Math.sqrt(variance(assetReturns[i]) * 252), beta: assetBeta, riskShare, annualRisk: total * annualVolatility * riskShare, pnl: holding.value * positionReturn };
  }).sort((a, b) => b.riskShare - a.riskShare);

  const totalReturn = curve.at(-1)! - 1;
  return { dates, curve, benchmarkCurve, dailyReturns, benchmarkReturns, totalReturn, benchmarkReturn: benchmarkCurve.at(-1)! - 1, annualVolatility, beta, maxDrawdown, pnl: total * totalReturn, startDate: dates[0], endDate: dates.at(-1)!, positions };
}

function projectStrategyWeights(weights: number[], maxPosition: number) {
  const projected = weights.map((weight) => Math.max(0, Math.min(maxPosition, Number.isFinite(weight) ? weight : 0)));
  const total = projected.reduce((sum, weight) => sum + weight, 0);
  return total > 1 ? projected.map((weight) => weight / total) : projected;
}

function strategyPortfolioVolatility(weights: number[], covarianceMatrix: number[][]) {
  const varianceEstimate = weights.reduce((sum, weight, row) => sum + weight * covarianceMatrix[row].reduce((rowSum, value, column) => rowSum + value * weights[column], 0), 0);
  return Math.sqrt(Math.max(varianceEstimate, 0));
}

function annualizedSharpe(dailyReturns: number[]) {
  const dailyVolatility = Math.sqrt(variance(dailyReturns));
  return dailyVolatility > 1e-12 ? mean(dailyReturns) / dailyVolatility * Math.sqrt(252) : 0;
}

const cmIewmaPairs = [[10, 21], [21, 63], [63, 125], [125, 250], [250, 500]] as const;
const cmIewmaWindow = 10;
const cmIewmaWarmup = 500;

type CovarianceExpertSnapshot = { covariance: number[][] };
type PrecisionEvaluation = { factors: number[][][]; realizedReturn: number[] };

function symmetrize(matrix: number[][]) {
  return matrix.map((row, i) => row.map((value, j) => (value + matrix[j][i]) / 2));
}

function safeMatrixInverse(matrix: number[][]) {
  const scale = Math.max(mean(matrix.map((row, index) => Math.abs(row[index]))), 1e-8);
  for (let attempt = 0; attempt < 8; attempt++) {
    const jitter = scale * 10 ** (-10 + attempt);
    const regularized = symmetrize(matrix).map((row, i) => row.map((value, j) => value + (i === j ? jitter : 0)));
    const inverse = matrixInverse(regularized);
    if (inverse) return symmetrize(inverse);
  }
  return matrix.map((_, i) => matrix.map((__, j) => i === j ? 1 / scale : 0));
}

function choleskyLower(matrix: number[][]) {
  const n = matrix.length;
  const lower = Array.from({ length: n }, () => Array(n).fill(0));
  for (let row = 0; row < n; row++) for (let column = 0; column <= row; column++) {
    const preceding = Array.from({ length: column }, (_, index) => lower[row][index] * lower[column][index]).reduce((sum, value) => sum + value, 0);
    if (row === column) lower[row][column] = Math.sqrt(Math.max(matrix[row][row] - preceding, 1e-14));
    else lower[row][column] = (matrix[row][column] - preceding) / Math.max(lower[column][column], 1e-12);
  }
  return lower;
}

function precisionCholesky(covarianceMatrix: number[][]) {
  return choleskyLower(safeMatrixInverse(covarianceMatrix));
}

function multiplyTransposeVector(lower: number[][], vector: number[]) {
  return lower.map((_, column) => lower.reduce((sum, row, index) => sum + row[column] * vector[index], 0));
}

function combineMatrices(matrices: number[][][], weights: number[]) {
  return matrices[0].map((row, i) => row.map((_, j) => matrices.reduce((sum, matrix, index) => sum + weights[index] * matrix[i][j], 0)));
}

function projectSimplex(values: number[]) {
  const sorted = [...values].sort((a, b) => b - a);
  let cumulative = 0;
  let threshold = 0;
  for (let index = 0; index < sorted.length; index++) {
    cumulative += sorted[index];
    const candidate = (cumulative - 1) / (index + 1);
    if (index === sorted.length - 1 || sorted[index + 1] <= candidate) { threshold = candidate; break; }
  }
  const projected = values.map((value) => Math.max(0, value - threshold));
  const total = projected.reduce((sum, value) => sum + value, 0);
  return total > 0 ? projected.map((value) => value / total) : values.map(() => 1 / values.length);
}

function combinationObjective(evaluations: PrecisionEvaluation[], weights: number[]) {
  return evaluations.reduce((total, evaluation) => {
    const combined = combineMatrices(evaluation.factors, weights);
    const transformed = multiplyTransposeVector(combined, evaluation.realizedReturn);
    const logDiagonal = combined.reduce((sum, row, index) => sum + Math.log(Math.max(row[index], 1e-12)), 0);
    return total + logDiagonal - .5 * transformed.reduce((sum, value) => sum + value ** 2, 0);
  }, 0) / Math.max(evaluations.length, 1);
}

function fitCombinationWeights(evaluations: PrecisionEvaluation[]) {
  const expertCount = cmIewmaPairs.length;
  if (!evaluations.length) return Array(expertCount).fill(1 / expertCount);
  let weights = Array(expertCount).fill(1 / expertCount);
  let objective = combinationObjective(evaluations, weights);
  for (let iteration = 0; iteration < 160; iteration++) {
    const gradient = Array(expertCount).fill(0);
    evaluations.forEach((evaluation) => {
      const combined = combineMatrices(evaluation.factors, weights);
      const combinedReturn = multiplyTransposeVector(combined, evaluation.realizedReturn);
      evaluation.factors.forEach((factor, expert) => {
        const factorReturn = multiplyTransposeVector(factor, evaluation.realizedReturn);
        const diagonalGradient = factor.reduce((sum, row, index) => sum + row[index] / Math.max(combined[index][index], 1e-12), 0);
        const quadraticGradient = factorReturn.reduce((sum, value, index) => sum + value * combinedReturn[index], 0);
        gradient[expert] += (diagonalGradient - quadraticGradient) / evaluations.length;
      });
    });
    const centered = gradient.map((value) => value - mean(gradient));
    if (Math.sqrt(centered.reduce((sum, value) => sum + value ** 2, 0)) < 1e-7) break;
    let step = .08 / Math.sqrt(iteration + 1);
    let accepted = false;
    for (let lineSearch = 0; lineSearch < 14; lineSearch++) {
      const candidate = projectSimplex(weights.map((weight, index) => weight + step * centered[index]));
      const candidateObjective = combinationObjective(evaluations, candidate);
      if (candidateObjective >= objective - 1e-10) {
        weights = candidate;
        objective = candidateObjective;
        accepted = true;
        break;
      }
      step *= .5;
    }
    if (!accepted) break;
  }
  return weights;
}

// Browser-safe reimplementation of Johansson et al.'s Apache-2.0 cvxcovariance
// reference method: five IEWMA experts, likelihood combination, and a 10-day window.
function buildIewmaExpertSnapshots(assetReturns: number[][]) {
  const periods = Math.min(...assetReturns.map((series) => series.length));
  const assets = assetReturns.length;
  return cmIewmaPairs.map(([volatilityHalfLife, correlationHalfLife], expertIndex) => {
    const volatilityBeta = Math.exp(-Math.log(2) / volatilityHalfLife);
    const correlationBeta = Math.exp(-Math.log(2) / correlationHalfLife);
    let variances = Array(assets).fill(0);
    let standardizedCovariance = Array.from({ length: assets }, () => Array(assets).fill(0));
    const snapshots: CovarianceExpertSnapshot[] = [];
    for (let period = 0; period < periods; period++) {
      const realized = assetReturns.map((series) => series[period]);
      if (period === 0) variances = realized.map((value) => Math.max(value ** 2, 1e-8));
      else {
        const adjustment = (1 - volatilityBeta) / Math.max(1 - volatilityBeta ** (period + 1), 1e-12);
        variances = variances.map((value, index) => value + adjustment * (realized[index] ** 2 - value));
      }
      const volatility = variances.map((value) => Math.sqrt(Math.max(value, 1e-12)));
      const standardized = realized.map((value, index) => Math.max(-4.2, Math.min(4.2, value / volatility[index])));
      const outer = standardized.map((first) => standardized.map((second) => first * second));
      if (period === 0) standardizedCovariance = outer;
      else {
        const adjustment = (1 - correlationBeta) / Math.max(1 - correlationBeta ** (period + 1), 1e-12);
        standardizedCovariance = standardizedCovariance.map((row, i) => row.map((value, j) => value + adjustment * (outer[i][j] - value)));
      }
      const correlation = standardizedCovariance.map((row, i) => row.map((value, j) => value / Math.sqrt(Math.max(standardizedCovariance[i][i] * standardizedCovariance[j][j], 1e-16))));
      const covarianceMatrix = correlation.map((row, i) => row.map((value, j) => value * volatility[i] * volatility[j]));
      if (expertIndex === 0) covarianceMatrix.forEach((row, index) => { row[index] *= 1.05; });
      snapshots.push({ covariance: covarianceMatrix });
    }
    return snapshots;
  });
}

function createCombinedIewmaPredictor(assetReturns: number[][]) {
  const experts = buildIewmaExpertSnapshots(assetReturns);
  const precisionCache = new Map<string, number[][]>();
  const precisionAt = (expert: number, period: number) => {
    const key = `${expert}:${period}`;
    const cached = precisionCache.get(key);
    if (cached) return cached;
    const precision = precisionCholesky(experts[expert][period].covariance);
    precisionCache.set(key, precision);
    return precision;
  };
  return (lastObservedPeriod: number) => {
    const firstEvaluation = Math.max(1, lastObservedPeriod - cmIewmaWindow + 1);
    const evaluations: PrecisionEvaluation[] = [];
    for (let realizedPeriod = firstEvaluation; realizedPeriod <= lastObservedPeriod; realizedPeriod++) {
      evaluations.push({
        factors: cmIewmaPairs.map((_, expert) => precisionAt(expert, realizedPeriod - 1)),
        realizedReturn: assetReturns.map((series) => series[realizedPeriod]),
      });
    }
    const weights = fitCombinationWeights(evaluations);
    const combinedPrecisionFactor = combineMatrices(cmIewmaPairs.map((_, expert) => precisionAt(expert, lastObservedPeriod)), weights);
    const precision = combinedPrecisionFactor.map((row) => row.map((_, j) => row.reduce((sum, value, index) => sum + value * combinedPrecisionFactor[j][index], 0)));
    const covarianceMatrix = safeMatrixInverse(precision).map((row) => row.map((value) => value * 252));
    return {
      covarianceMatrix,
      weights: weights.map((weight, index) => ({ label: `${cmIewmaPairs[index][0]}/${cmIewmaPairs[index][1]}d`, weight })),
    };
  };
}

function optimizeRiskTarget(previousWeights: number[], covarianceMatrix: number[][], betas: number[], targetVolatility: number, targetBeta: number, maxPosition: number) {
  const riskyTotal = previousWeights.reduce((sum, weight) => sum + weight, 0);
  const normalized = riskyTotal > 0 ? previousWeights.map((weight) => weight / riskyTotal) : previousWeights.map(() => 1 / Math.max(previousWeights.length, 1));
  const fullyInvestedVolatility = strategyPortfolioVolatility(normalized, covarianceMatrix);
  const startingScale = Math.min(1, targetVolatility / Math.max(fullyInvestedVolatility, 1e-6));
  let weights = projectStrategyWeights(normalized.map((weight) => weight * startingScale), maxPosition);

  for (let iteration = 0; iteration < 700; iteration++) {
    const portfolioBeta = weights.reduce((sum, weight, index) => sum + weight * betas[index], 0);
    const sigmaWeights = covarianceMatrix.map((row) => row.reduce((sum, value, column) => sum + value * weights[column], 0));
    const portfolioVolatility = Math.sqrt(Math.max(weights.reduce((sum, weight, index) => sum + weight * sigmaWeights[index], 0), 1e-12));
    const step = .016 / (1 + iteration / 180);
    const gradient = weights.map((weight, index) =>
      6 * (portfolioBeta - targetBeta) * betas[index]
      + 160 * (portfolioVolatility - targetVolatility) * sigmaWeights[index] / portfolioVolatility
      + .38 * (weight - previousWeights[index])
      + .04 * weight,
    );
    weights = projectStrategyWeights(weights.map((weight, index) => weight - step * gradient[index]), maxPosition);
  }
  return weights;
}

function strategyRebalanceBucket(date: string, frequency: StrategyRebalanceFrequency) {
  if (frequency === "Monthly") return date.slice(0, 7);
  const value = new Date(`${date}T00:00:00Z`);
  const dayFromMonday = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - dayFromMonday);
  return value.toISOString().slice(0, 10);
}

export function buildRiskTargetStrategy(payload: MarketPayload, holdings: AnalyticsHolding[], config: StrategyBacktestConfig): StrategyBacktestAnalytics | null {
  const total = holdings.reduce((sum, holding) => sum + holding.value, 0);
  const active = holdings.filter((holding) => holding.ticker !== "CASH" && holding.value > 0 && payload.series[holding.ticker]);
  const benchmark = payload.series.SPY;
  const lookback = Math.max(60, config.lookback ?? 126);
  const transactionCostBps = Math.max(0, config.transactionCostBps ?? 10);
  const covarianceModel = config.covarianceModel ?? "CM-IEWMA";
  const covarianceWarmup = covarianceModel === "CM-IEWMA" ? cmIewmaWarmup : lookback;
  if (!active.length || !benchmark || total <= 0) return null;

  const maps = active.map((holding) => new Map(payload.series[holding.ticker].points.map((point) => [point.date, point.close])));
  const benchmarkMap = new Map(benchmark.points.map((point) => [point.date, point.close]));
  const allDates = [...benchmarkMap.keys()].filter((date) => maps.every((map) => map.has(date))).sort();
  const requestedStart = config.startDate ?? allDates[Math.max(covarianceWarmup, allDates.length - 756)] ?? "";
  const requestedEnd = config.endDate ?? payload.asOf ?? allDates.at(-1) ?? "";
  const startIndex = allDates.findIndex((date, index) => index >= covarianceWarmup && date >= requestedStart);
  const endIndex = allDates.findLastIndex((date) => date <= requestedEnd);
  if (startIndex < covarianceWarmup || endIndex <= startIndex + 20) return null;

  const prices = maps.map((map) => allDates.map((date) => map.get(date)!));
  const benchmarkPrices = allDates.map((date) => benchmarkMap.get(date)!);
  const assetReturns = prices.map(returns);
  const benchmarkDailyReturns = returns(benchmarkPrices);
  const combinedIewmaPredictor = covarianceModel === "CM-IEWMA" ? createCombinedIewmaPredictor(assetReturns) : null;
  const baseWeights = active.map((holding) => Math.max(0, holding.value / total));
  const baseInvestedWeight = Math.min(1, baseWeights.reduce((sum, weight) => sum + weight, 0));
  let currentWeights = projectStrategyWeights(baseWeights, config.maxPosition);
  if (currentWeights.reduce((sum, weight) => sum + weight, 0) > baseInvestedWeight && baseInvestedWeight > 0) {
    const scale = baseInvestedWeight / currentWeights.reduce((sum, weight) => sum + weight, 0);
    currentWeights = currentWeights.map((weight) => weight * scale);
  }

  const dates = allDates.slice(startIndex, endIndex + 1);
  const curve = [1];
  const staticCurve = [1];
  const benchmarkCurve = [1];
  const dailyStrategyReturns: number[] = [];
  const dailyBenchmarkReturns: number[] = [];
  const exposures: StrategyExposurePoint[] = [];
  const rebalances: StrategyRebalancePoint[] = [];
  let totalTurnover = 0;
  let transactionCosts = 0;
  let lastCovariance = active.map(() => active.map(() => 0));
  let lastBetas = active.map(() => 0);
  let lastCovarianceWeights: StrategyExpertWeight[] = [];

  for (let dayIndex = startIndex + 1; dayIndex <= endIndex; dayIndex++) {
    const currentDate = allDates[dayIndex];
    const previousDate = allDates[dayIndex - 1];
    const isRebalance = dayIndex === startIndex + 1 || strategyRebalanceBucket(currentDate, config.frequency) !== strategyRebalanceBucket(previousDate, config.frequency);
    let costRate = 0;

    if (isRebalance) {
      const estimationEnd = dayIndex - 1;
      const estimationStart = Math.max(0, estimationEnd - lookback);
      const estimationReturns = assetReturns.map((series) => series.slice(estimationStart, estimationEnd));
      const marketEstimationReturns = benchmarkDailyReturns.slice(estimationStart, estimationEnd);
      if (combinedIewmaPredictor) {
        const prediction = combinedIewmaPredictor(estimationEnd - 1);
        lastCovariance = prediction.covarianceMatrix;
        lastCovarianceWeights = prediction.weights;
      } else {
        lastCovariance = estimationReturns.map((first) => estimationReturns.map((second) => covariance(first, second) * 252));
        lastCovarianceWeights = [{ label: `${lookback}d window`, weight: 1 }];
      }
      lastBetas = estimationReturns.map((series) => covariance(series, marketEstimationReturns) / Math.max(variance(marketEstimationReturns), 1e-12));
      const targetWeights = optimizeRiskTarget(currentWeights, lastCovariance, lastBetas, config.targetVolatility, config.targetBeta, config.maxPosition);
      const currentCash = 1 - currentWeights.reduce((sum, weight) => sum + weight, 0);
      const targetCash = 1 - targetWeights.reduce((sum, weight) => sum + weight, 0);
      const turnover = .5 * (targetWeights.reduce((sum, weight, index) => sum + Math.abs(weight - currentWeights[index]), 0) + Math.abs(targetCash - currentCash));
      costRate = turnover * transactionCostBps / 10000;
      totalTurnover += turnover;
      transactionCosts += total * curve.at(-1)! * costRate;
      currentWeights = targetWeights;
      const estimatedVolatility = strategyPortfolioVolatility(currentWeights, lastCovariance);
      const beta = currentWeights.reduce((sum, weight, index) => sum + weight * lastBetas[index], 0);
      const largestIndex = currentWeights.reduce((best, weight, index) => weight > currentWeights[best] ? index : best, 0);
      rebalances.push({
        date: currentDate,
        estimatedVolatility,
        beta,
        investedWeight: currentWeights.reduce((sum, weight) => sum + weight, 0),
        turnover,
        cost: total * curve.at(-1)! * costRate,
        largestPosition: active[largestIndex].ticker,
        largestWeight: currentWeights[largestIndex],
        weights: active.map((holding, index) => ({ ticker: holding.ticker, weight: currentWeights[index] })).sort((first, second) => second.weight - first.weight),
        covarianceWeights: lastCovarianceWeights,
      });
    }

    const dayReturns = assetReturns.map((series) => series[dayIndex - 1]);
    const cashWeight = 1 - currentWeights.reduce((sum, weight) => sum + weight, 0);
    const grossReturn = currentWeights.reduce((sum, weight, index) => sum + weight * dayReturns[index], 0);
    const strategyReturn = grossReturn - costRate;
    const marketReturn = benchmarkDailyReturns[dayIndex - 1];
    dailyStrategyReturns.push(strategyReturn);
    dailyBenchmarkReturns.push(marketReturn);
    curve.push(curve.at(-1)! * (1 + strategyReturn));
    benchmarkCurve.push(benchmarkCurve.at(-1)! * (1 + marketReturn));
    staticCurve.push(baseWeights.reduce((sum, weight, index) => sum + weight * prices[index][dayIndex] / prices[index][startIndex], 0) + (1 - baseWeights.reduce((sum, weight) => sum + weight, 0)));

    const estimatedVolatility = strategyPortfolioVolatility(currentWeights, lastCovariance);
    const beta = currentWeights.reduce((sum, weight, index) => sum + weight * lastBetas[index], 0);
    exposures.push({ date: currentDate, estimatedVolatility, beta, investedWeight: 1 - cashWeight });

    const grossWealth = Math.max(1 + grossReturn, 1e-8);
    currentWeights = currentWeights.map((weight, index) => weight * (1 + dayReturns[index]) / grossWealth);
  }

  const annualVolatility = Math.sqrt(variance(dailyStrategyReturns) * 252);
  const realizedBeta = covariance(dailyStrategyReturns, dailyBenchmarkReturns) / Math.max(variance(dailyBenchmarkReturns), 1e-12);
  const staticDailyReturns = returns(staticCurve);
  const finalWeights = active.map((holding, index) => ({ ticker: holding.ticker, weight: currentWeights[index] })).sort((first, second) => second.weight - first.weight);
  const covarianceExpertWeights = (rebalances[0]?.covarianceWeights ?? []).map((expert, expertIndex) => ({
    label: expert.label,
    weight: mean(rebalances.map((rebalance) => rebalance.covarianceWeights[expertIndex]?.weight ?? 0)),
  }));
  const averageEstimatedVolatility = mean(exposures.map((point) => point.estimatedVolatility));
  return {
    dates,
    curve,
    staticCurve,
    benchmarkCurve,
    dailyReturns: dailyStrategyReturns,
    benchmarkReturns: dailyBenchmarkReturns,
    totalReturn: curve.at(-1)! - 1,
    staticReturn: staticCurve.at(-1)! - 1,
    benchmarkReturn: benchmarkCurve.at(-1)! - 1,
    annualVolatility,
    beta: realizedBeta,
    sharpeRatio: annualizedSharpe(dailyStrategyReturns),
    staticSharpeRatio: annualizedSharpe(staticDailyReturns),
    benchmarkSharpeRatio: annualizedSharpe(dailyBenchmarkReturns),
    maxDrawdown: maxDrawdown(curve),
    totalTurnover,
    transactionCosts,
    averageInvestedWeight: mean(exposures.map((point) => point.investedWeight)),
    averageEstimatedVolatility,
    averageEstimatedBeta: mean(exposures.map((point) => point.beta)),
    startDate: dates[0],
    endDate: dates.at(-1)!,
    rebalances,
    exposures,
    finalWeights,
    covarianceModel,
    covarianceModelLabel: covarianceModel === "CM-IEWMA" ? "Combined multiple IEWMA" : "Rolling sample covariance",
    covarianceExpertWeights,
    volatilityCalibrationGap: annualVolatility - averageEstimatedVolatility,
    assumptions: { lookback, transactionCostBps, longOnly: true, pointInTime: true, covarianceModel, covarianceCombinationWindow: covarianceModel === "CM-IEWMA" ? cmIewmaWindow : 0, covarianceWarmup },
  };
}

export function buildFactorModel(payload: MarketPayload, analytics: PortfolioAnalytics, total: number): FactorModelAnalytics | null {
  const dateSet = new Set(analytics.dates);
  const factorSeries = factorDefs.map((factor) => {
    const longMap = new Map(payload.series[factor.long]?.points.filter((point) => dateSet.has(point.date)).map((point) => [point.date, point.close]) ?? []);
    const shortMap = factor.short ? new Map(payload.series[factor.short]?.points.filter((point) => dateSet.has(point.date)).map((point) => [point.date, point.close]) ?? []) : null;
    const longPrices = analytics.dates.map((date) => longMap.get(date)).filter((value): value is number => Number.isFinite(value));
    const longReturns = returns(longPrices);
    if (!shortMap) return longReturns;
    const shortPrices = analytics.dates.map((date) => shortMap.get(date)).filter((value): value is number => Number.isFinite(value));
    const shortReturns = returns(shortPrices);
    const n = Math.min(longReturns.length, shortReturns.length);
    return longReturns.slice(-n).map((value, i) => value - shortReturns.slice(-n)[i]);
  });
  if (factorSeries.some((series) => series.length !== analytics.dailyReturns.length)) return null;

  const fit = fitHierarchicalFactorModel(analytics.dailyReturns, factorSeries);
  const portfolioVariance = Math.max(variance(analytics.dailyReturns), 1e-12);
  const beginningWealth = analytics.curve.slice(0, -1);

  const factors = factorDefs.map((factor, factorIndex) => {
    const stageIndex = fit.stageIndices.findIndex((stage) => stage.includes(factorIndex));
    const predictorIndex = fit.stageIndices[stageIndex].indexOf(factorIndex);
    const exposure = fit.stages[stageIndex].coefficients[predictorIndex + 1] ?? 0;
    const series = fit.attributionSeries[factorIndex];
    const riskShare = exposure * covariance(series, analytics.dailyReturns) / portfolioVariance;
    const linkedReturn = series.reduce((sum, dailyReturn, row) => sum + beginningWealth[row] * exposure * dailyReturn, 0);
    return { name: factor.name, group: factor.group, exposure, riskShare, annualRisk: total * analytics.annualVolatility * riskShare, returnAttribution: total * linkedReturn };
  });

  const systematicAttribution = factors.reduce((sum, factor) => sum + factor.returnAttribution, 0);
  const idiosyncraticAttribution = total * analytics.totalReturn - systematicAttribution;
  const rSquared = Math.max(0, Math.min(1, 1 - variance(fit.residuals) / portfolioVariance));
  const layers: FactorLayerAnalytics[] = [
    { name: "Market", riskShare: factors.filter((factor) => factor.group === "Core").reduce((sum, factor) => sum + factor.riskShare, 0), returnAttribution: factors.filter((factor) => factor.group === "Core").reduce((sum, factor) => sum + factor.returnAttribution, 0) },
    { name: "Style", riskShare: factors.filter((factor) => factor.group === "Style").reduce((sum, factor) => sum + factor.riskShare, 0), returnAttribution: factors.filter((factor) => factor.group === "Style").reduce((sum, factor) => sum + factor.returnAttribution, 0) },
    { name: "Sector", riskShare: factors.filter((factor) => factor.group === "Sector").reduce((sum, factor) => sum + factor.riskShare, 0), returnAttribution: factors.filter((factor) => factor.group === "Sector").reduce((sum, factor) => sum + factor.returnAttribution, 0) },
    { name: "Idiosyncratic", riskShare: 1 - rSquared, returnAttribution: idiosyncraticAttribution },
  ];
  const systematicReturn = systematicAttribution / total;
  const idiosyncraticReturn = idiosyncraticAttribution / total;
  return {
    factors,
    layers,
    rSquared,
    systematicReturn,
    idiosyncraticReturn,
    systematicAttribution,
    idiosyncraticAttribution,
    reconciliationDifference: total * analytics.totalReturn - systematicAttribution - idiosyncraticAttribution,
    diagnostics: {
      specification: "Market first; style proxies residualized to Market; sector proxies residualized to Market and Style. Factors within each block remain jointly estimated.",
      correlations: strongestFactorCorrelations(factorSeries),
    },
  };
}

export function buildFactors(payload: MarketPayload, analytics: PortfolioAnalytics, total: number): FactorAnalytics[] {
  return buildFactorModel(payload, analytics, total)?.factors ?? [];
}

function buildDecomposition(payload: MarketPayload, dates: string[], targetReturns: number[], curve: number[]): SecurityDecomposition | null {
  const requiredSymbols = new Set(factorDefs.flatMap((factor) => [factor.long, factor.short].filter((symbol): symbol is string => Boolean(symbol))));
  const symbolMaps = new Map([...requiredSymbols].map((symbol) => [symbol, new Map(payload.series[symbol]?.points.map((point) => [point.date, point.close]) ?? [])]));
  if (dates.length < 40 || !dates.every((date) => [...requiredSymbols].every((symbol) => symbolMaps.get(symbol)?.has(date)))) return null;
  const factorSeries = factorDefs.map((factor) => {
    const longReturns = returns(dates.map((date) => symbolMaps.get(factor.long)!.get(date)!));
    if (!factor.short) return longReturns;
    const shortReturns = returns(dates.map((date) => symbolMaps.get(factor.short!)!.get(date)!));
    return longReturns.map((value, index) => value - shortReturns[index]);
  });
  const fit = fitHierarchicalFactorModel(targetReturns, factorSeries);
  const exposures = factorDefs.map(() => 0);
  fit.stages.forEach((stage, stageIndex) => stage.predictors.forEach((_, predictorIndex) => {
    exposures[fit.stageIndices[stageIndex][predictorIndex]] = stage.coefficients[predictorIndex + 1] ?? 0;
  }));
  const dailyFactors = factorDefs.map((_, factorIndex) => targetReturns.map((_, row) => exposures[factorIndex] * fit.attributionSeries[factorIndex][row]));
  const dailyMarket = targetReturns.map((_, row) => dailyFactors.filter((_, index) => factorDefs[index].group === "Core").reduce((sum, series) => sum + series[row], 0));
  const dailyStyle = targetReturns.map((_, row) => dailyFactors.filter((_, index) => factorDefs[index].group === "Style").reduce((sum, series) => sum + series[row], 0));
  const dailySector = targetReturns.map((_, row) => dailyFactors.filter((_, index) => factorDefs[index].group === "Sector").reduce((sum, series) => sum + series[row], 0));
  const dailyIdiosyncratic = targetReturns.map((value, row) => value - dailyFactors.reduce((sum, series) => sum + series[row], 0));
  const beginningWealth = curve.slice(0, -1);
  const linkedCumulative = (series: number[]) => {
    let running = 0;
    return series.map((value, row) => running += beginningWealth[row] * value);
  };
  const market = linkedCumulative(dailyMarket);
  const style = linkedCumulative(dailyStyle);
  const sector = linkedCumulative(dailySector);
  const factorContributions = dailyFactors.map(linkedCumulative);
  const idiosyncratic = linkedCumulative(dailyIdiosyncratic);
  const systematic = market.map((value, row) => value + style[row] + sector[row]);
  return {
    dates: dates.slice(1),
    observed: curve.slice(1).map((value) => value - 1),
    systematic,
    factors: factorDefs.map((factor, index) => ({ name: factor.name, group: factor.group, values: factorContributions[index] })),
    market,
    style,
    sector,
    idiosyncratic,
  };
}

export function buildPortfolioDecomposition(payload: MarketPayload, analytics: PortfolioAnalytics) {
  return buildDecomposition(payload, analytics.dates, analytics.dailyReturns, analytics.curve);
}

export function averagePairwiseCorrelation(payload: MarketPayload, holdings: AnalyticsHolding[], startDate: string, endDate: string): EventCorrelationAnalytics {
  const active = holdings.filter((holding) => holding.ticker !== "CASH" && payload.series[holding.ticker]);
  if (active.length < 2) return { averageCorrelation: 0, pairCount: 0 };
  const maps = active.map((holding) => new Map(trimSeries(payload.series[holding.ticker], startDate, endDate).map((point) => [point.date, point.close])));
  const dates = [...maps[0].keys()].filter((date) => maps.every((map) => map.has(date))).sort();
  if (dates.length < 3) return { averageCorrelation: 0, pairCount: 0 };
  const series = maps.map((map) => returns(dates.map((date) => map.get(date)!)));
  const correlations: number[] = [];
  for (let i = 0; i < series.length; i++) for (let j = i + 1; j < series.length; j++) correlations.push(correlation(series[i], series[j]));
  return { averageCorrelation: mean(correlations), pairCount: correlations.length };
}

export function rollingAveragePairwiseCorrelation(payload: MarketPayload, holdings: AnalyticsHolding[], startDate: string, endDate: string, window = 20): RollingCorrelationPoint[] {
  const active = holdings.filter((holding) => holding.ticker !== "CASH" && payload.series[holding.ticker]);
  if (active.length < 2) return [];
  const maps = active.map((holding) => new Map(trimSeries(payload.series[holding.ticker], startDate, endDate).map((point) => [point.date, point.close])));
  const dates = [...maps[0].keys()].filter((date) => maps.every((map) => map.has(date))).sort();
  const assetReturns = maps.map((map) => returns(dates.map((date) => map.get(date)!)));
  if (assetReturns[0]?.length < window) return [];
  return Array.from({ length: assetReturns[0].length - window + 1 }, (_, offset) => {
    const correlations: number[] = [];
    for (let i = 0; i < assetReturns.length; i++) for (let j = i + 1; j < assetReturns.length; j++) correlations.push(correlation(assetReturns[i].slice(offset, offset + window), assetReturns[j].slice(offset, offset + window)));
    return { date: dates[offset + window], correlation: mean(correlations) };
  });
}

function pairReturns(payload: MarketPayload, tickerA: string, tickerB: string, startDate: string, endDate: string) {
  const first = payload.series[tickerA];
  const second = payload.series[tickerB];
  if (!first || !second) return null;
  const firstMap = new Map(trimSeries(first, startDate, endDate).map((point) => [point.date, point.close]));
  const secondMap = new Map(trimSeries(second, startDate, endDate).map((point) => [point.date, point.close]));
  const dates = [...firstMap.keys()].filter((date) => secondMap.has(date)).sort();
  if (dates.length < 3) return null;
  return { dates, first: returns(dates.map((date) => firstMap.get(date)!)), second: returns(dates.map((date) => secondMap.get(date)!)) };
}

export function pairwiseCorrelationAnalysis(payload: MarketPayload, holdings: AnalyticsHolding[], beforeStart: string, beforeEnd: string, eventStart: string, eventEnd: string): PairwiseCorrelationDetail[] {
  const tickers = holdings.filter((holding) => holding.ticker !== "CASH" && payload.series[holding.ticker]).map((holding) => holding.ticker);
  const pairs: PairwiseCorrelationDetail[] = [];
  for (let i = 0; i < tickers.length; i++) for (let j = i + 1; j < tickers.length; j++) {
    const before = pairReturns(payload, tickers[i], tickers[j], beforeStart, beforeEnd);
    const event = pairReturns(payload, tickers[i], tickers[j], eventStart, eventEnd);
    if (!before || !event) continue;
    const beforeCorrelation = correlation(before.first, before.second);
    const eventCorrelation = correlation(event.first, event.second);
    pairs.push({ key: `${tickers[i]}|${tickers[j]}`, tickerA: tickers[i], tickerB: tickers[j], before: beforeCorrelation, event: eventCorrelation, change: eventCorrelation - beforeCorrelation });
  }
  return pairs;
}

export function rollingPairwiseCorrelation(payload: MarketPayload, tickerA: string, tickerB: string, startDate: string, endDate: string, window = 20): RollingCorrelationPoint[] {
  const aligned = pairReturns(payload, tickerA, tickerB, startDate, endDate);
  if (!aligned || aligned.first.length < window) return [];
  return Array.from({ length: aligned.first.length - window + 1 }, (_, offset) => ({
    date: aligned.dates[offset + window],
    correlation: correlation(aligned.first.slice(offset, offset + window), aligned.second.slice(offset, offset + window)),
  }));
}

export function buildSecurityDrilldown(payload: MarketPayload, analytics: PortfolioAnalytics, ticker: string): SecurityDrilldownAnalytics | null {
  const security = payload.series[ticker];
  const benchmark = payload.series.SPY;
  if (!security || !benchmark) return null;

  const securityMap = new Map(security.points.map((point) => [point.date, point.close]));
  const benchmarkMap = new Map(benchmark.points.map((point) => [point.date, point.close]));
  const requiredSymbols = new Set(factorDefs.flatMap((factor) => [factor.long, factor.short].filter((symbol): symbol is string => Boolean(symbol))));
  const symbolMaps = new Map([...requiredSymbols].map((symbol) => [symbol, new Map(payload.series[symbol]?.points.map((point) => [point.date, point.close]) ?? [])]));
  const dates = analytics.dates.filter((date) => securityMap.has(date) && benchmarkMap.has(date) && [...requiredSymbols].every((symbol) => symbolMaps.get(symbol)?.has(date)));
  if (dates.length < 40) return null;

  const prices = dates.map((date) => securityMap.get(date)!);
  const benchmarkPrices = dates.map((date) => benchmarkMap.get(date)!);
  const curve = prices.map((price) => price / prices[0]);
  const benchmarkCurve = benchmarkPrices.map((price) => price / benchmarkPrices[0]);
  const securityReturns = returns(prices);
  const benchmarkReturns = returns(benchmarkPrices);
  const factorSeries = factorDefs.map((factor) => {
    const longReturns = returns(dates.map((date) => symbolMaps.get(factor.long)!.get(date)!));
    if (!factor.short) return longReturns;
    const shortReturns = returns(dates.map((date) => symbolMaps.get(factor.short!)!.get(date)!));
    return longReturns.map((value, index) => value - shortReturns[index]);
  });
  const fit = fitHierarchicalFactorModel(securityReturns, factorSeries);
  const exposures = factorDefs.map(() => 0);
  fit.stages.forEach((stage, stageIndex) => stage.predictors.forEach((_, predictorIndex) => {
    exposures[fit.stageIndices[stageIndex][predictorIndex]] = stage.coefficients[predictorIndex + 1] ?? 0;
  }));
  const dailyFactors = factorDefs.map((_, factorIndex) => securityReturns.map((_, row) => exposures[factorIndex] * fit.attributionSeries[factorIndex][row]));
  const dailyMarket = securityReturns.map((_, row) => dailyFactors.filter((_, index) => factorDefs[index].group === "Core").reduce((sum, series) => sum + series[row], 0));
  const dailyStyle = securityReturns.map((_, row) => dailyFactors.filter((_, index) => factorDefs[index].group === "Style").reduce((sum, series) => sum + series[row], 0));
  const dailySector = securityReturns.map((_, row) => dailyFactors.filter((_, index) => factorDefs[index].group === "Sector").reduce((sum, series) => sum + series[row], 0));
  const dailyIdiosyncratic = securityReturns.map((value, row) => value - dailyFactors.reduce((sum, series) => sum + series[row], 0));
  const beginningWealth = curve.slice(0, -1);
  const linkedCumulative = (series: number[]) => {
    let running = 0;
    return series.map((value, row) => running += beginningWealth[row] * value);
  };
  const market = linkedCumulative(dailyMarket);
  const style = linkedCumulative(dailyStyle);
  const sector = linkedCumulative(dailySector);
  const factorContributions = dailyFactors.map(linkedCumulative);
  const idiosyncratic = linkedCumulative(dailyIdiosyncratic);
  const systematic = market.map((value, row) => value + style[row] + sector[row]);
  const observed = curve.slice(1).map((value) => value - 1);
  const totalReturn = curve.at(-1)! - 1;
  const systematicReturn = systematic.at(-1) ?? 0;
  const portfolioReturns = analytics.dailyReturns.slice(-securityReturns.length);
  const explained = 1 - variance(fit.residuals) / Math.max(variance(securityReturns), 1e-12);

  return {
    ticker,
    dates,
    curve,
    benchmarkCurve,
    totalReturn,
    benchmarkReturn: benchmarkCurve.at(-1)! - 1,
    annualVolatility: Math.sqrt(variance(securityReturns) * 252),
    beta: covariance(securityReturns, benchmarkReturns) / Math.max(variance(benchmarkReturns), 1e-12),
    maxDrawdown: maxDrawdown(curve),
    correlationWithPortfolio: correlation(securityReturns, portfolioReturns),
    rSquared: Math.max(0, Math.min(1, explained)),
    systematicReturn,
    idiosyncraticReturn: totalReturn - systematicReturn,
    factorExposures: factorDefs.map((factor, index) => ({ name: factor.name, exposure: exposures[index] })),
    decomposition: { dates: dates.slice(1), observed, systematic, factors: factorDefs.map((factor, index) => ({ name: factor.name, group: factor.group, values: factorContributions[index] })), market, style, sector, idiosyncratic },
  };
}

export function historicalReplay(payload: MarketPayload, holdings: AnalyticsHolding[], start: string, end: string) {
  const total = holdings.reduce((sum, holding) => sum + holding.value, 0);
  const impacts = holdings.filter((holding) => holding.ticker !== "CASH" && payload.series[holding.ticker]).map((holding) => {
    const points = payload.series[holding.ticker].points.filter((point) => point.date >= start && point.date <= end);
    const realizedReturn = points.length > 1 ? points.at(-1)!.close / points[0].close - 1 : 0;
    return { ticker: holding.ticker, impact: holding.value * realizedReturn, return: realizedReturn };
  }).sort((a, b) => a.impact - b.impact);
  const impact = impacts.reduce((sum, item) => sum + item.impact, 0);
  return { impact, return: impact / total, positions: impacts };
}
