import { buildAnalytics, buildFactorModel, type CovarianceForecastAnalytics, type MarketPayload } from "./analytics.ts";

export type ConstructionFactor = { name: string; group: string; values: number[]; unit?: string; asOf?: string };
export type ConstructionSnapshot = {
  forecast: CovarianceForecastAnalytics;
  factors: ConstructionFactor[];
  expectedReturns: number[] | null;
  objective: string;
  returnAssumption: string | null;
};

// The model window ends at the decision date, independent of the replay window.
export function buildConstructionFactors(payload: MarketPayload, forecast: CovarianceForecastAnalytics | null) {
  const empty = { factors: [] as ConstructionFactor[], idiosyncraticVolatility: [] as number[] };
  if (!forecast) return empty;
  const dates = (payload.series.SPY?.points ?? []).filter(point => point.date <= forecast.asOf).slice(-253);
  if (dates.length < 41) return empty;
  const models = forecast.tickers.map(ticker => {
    const analytics = buildAnalytics(payload, [{ ticker, value: 1 }], { startDate: dates[0].date, endDate: forecast.asOf });
    const model = analytics ? buildFactorModel(payload, analytics, 1) : null;
    return analytics && model ? { model, idiosyncraticVolatility: analytics.annualVolatility * Math.sqrt(Math.max(0, 1 - model.rSquared)) } : null;
  });
  if (models.some(model => !model)) return empty;
  return {
    factors: models[0]!.model.factors.map(factor => ({ name: factor.name, group: factor.group, values: models.map(item => item!.model.factors.find(f => f.name === factor.name)!.exposure) })),
    idiosyncraticVolatility: models.map(item => item!.idiosyncraticVolatility),
  };
}

export function constructionMeasures(snapshot: ConstructionSnapshot, weights: Record<string, number>) {
  const { forecast } = snapshot;
  if (Object.entries(weights).some(([ticker, weight]) => !Number.isFinite(weight) || Math.abs(weight) > 1e-8 && !forecast.tickers.includes(ticker))) return null;
  const w = forecast.tickers.map(ticker => weights[ticker] ?? 0);
  const dot = (values: number[]) => values.reduce((sum, value, i) => sum + value * w[i], 0);
  const volatility = Math.sqrt(Math.max(0, dot(forecast.covarianceMatrix.map(row => dot(row)))));
  const expectedReturn = snapshot.expectedReturns ? dot(snapshot.expectedReturns) : null;
  return {
    volatility, expectedReturn,
    assumedSharpe: expectedReturn !== null && volatility > 1e-10 ? expectedReturn / volatility : null,
    gross: w.reduce((sum, value) => sum + Math.abs(value), 0), net: w.reduce((sum, value) => sum + value, 0),
    long: w.reduce((sum, value) => sum + Math.max(0, value), 0), short: w.reduce((sum, value) => sum + Math.max(0, -value), 0),
    factors: snapshot.factors.map(factor => ({ ...factor, exposure: dot(factor.values) })),
  };
}
