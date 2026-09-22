// All matrices contain annualized decimal-return covariance; no return forecast.
export type CovarianceSnapshot = {
  covarianceMatrix: number[][];
  correlationMatrix: (number | null)[][];
  volatilities: number[];
  portfolioVolatility: number;
  averageCorrelation: number | null;
  strongestPair: { tickerA: string; tickerB: string; correlation: number } | null;
  diversificationRatio: number;
  securities: { ticker: string; portfolioWeight: number; volatility: number; riskShare: number }[];
};

export type CovarianceReference = CovarianceSnapshot & {
  id: string;
  label: string;
  asOf: string;
  startDate: string | null;
  observations: number;
};

export function summarizeCovariance(covarianceMatrix: number[][], tickers: string[], weights: number[]): CovarianceSnapshot {
  const volatilities = covarianceMatrix.map((row, i) => Math.sqrt(Math.max(0, row[i])));
  const correlationMatrix = covarianceMatrix.map((row, i) => row.map((value, j) => {
    const denominator = volatilities[i] * volatilities[j];
    return denominator > 1e-15 ? Math.max(-1, Math.min(1, value / denominator)) : null;
  }));
  const marginalVariance = covarianceMatrix.map(row => row.reduce((sum, value, j) => sum + value * weights[j], 0));
  const portfolioVariance = Math.max(0, weights.reduce((sum, weight, i) => sum + weight * marginalVariance[i], 0));
  const portfolioVolatility = Math.sqrt(portfolioVariance);
  const pairs: { tickerA: string; tickerB: string; correlation: number }[] = [];
  tickers.forEach((tickerA, i) => tickers.slice(i + 1).forEach((tickerB, offset) => {
    const correlation = correlationMatrix[i][i + offset + 1];
    if (correlation !== null) pairs.push({ tickerA, tickerB, correlation });
  }));
  return {
    covarianceMatrix, correlationMatrix, volatilities, portfolioVolatility,
    averageCorrelation: pairs.length ? pairs.reduce((sum, pair) => sum + pair.correlation, 0) / pairs.length : null,
    strongestPair: pairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))[0] ?? null,
    diversificationRatio: portfolioVolatility > 1e-12 ? weights.reduce((sum, weight, i) => sum + Math.abs(weight) * volatilities[i], 0) / portfolioVolatility : 0,
    securities: tickers.map((ticker, i) => ({ ticker, portfolioWeight: weights[i], volatility: volatilities[i], riskShare: portfolioVariance > 1e-12 ? weights[i] * marginalVariance[i] / portfolioVariance : 0 })),
  };
}

export function compareCovariance(reference: CovarianceSnapshot, forecast: CovarianceSnapshot) {
  if (reference.securities.length !== forecast.securities.length || reference.securities.some((item, i) => item.ticker !== forecast.securities[i].ticker || item.portfolioWeight !== forecast.securities[i].portfolioWeight)) {
    throw new Error("Covariance comparison requires identical security order and portfolio weights.");
  }
  const covarianceDelta = forecast.covarianceMatrix.map((row, i) => row.map((value, j) => value - reference.covarianceMatrix[i][j]));
  const correlationDelta = forecast.correlationMatrix.map((row, i) => row.map((value, j) => {
    const before = reference.correlationMatrix[i][j];
    return value === null || before === null ? null : value - before;
  }));
  // Average the two substitution orders (two-player Shapley decomposition).
  // This reconciles exactly in volatility units and handles signed weights.
  // Undefined correlation makes the mixed counterfactuals unidentified.
  const canDecompose = reference.correlationMatrix.every(row => row.every(value => value !== null)) && forecast.correlationMatrix.every(row => row.every(value => value !== null));
  const weights = forecast.securities.map(item => item.portfolioWeight);
  const risk = (vol: number[], corr: (number | null)[][]) => Math.sqrt(Math.max(0, weights.reduce((sum, wi, i) => sum + wi * vol[i] * weights.reduce((subtotal, wj, j) => subtotal + wj * vol[j] * corr[i][j]!, 0), 0)));
  const totalChange = forecast.portfolioVolatility - reference.portfolioVolatility;
  const volEffect = canDecompose ? .5 * (risk(forecast.volatilities, reference.correlationMatrix) - reference.portfolioVolatility + forecast.portfolioVolatility - risk(reference.volatilities, forecast.correlationMatrix)) : null;
  return { covarianceDelta, correlationDelta, totalChange, volatilityEffect: volEffect, correlationEffect: volEffect === null ? null : totalChange - volEffect };
}
