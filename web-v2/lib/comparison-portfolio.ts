import { historicalSharpe } from "./historical-sharpe.ts";
import type { AnalyticsHolding, FactorModelAnalytics, MarketPayload } from "./analytics.ts";

export type ComparisonPreset = "Lower beta" | "Equal weight" | "Current weights" | "Saved baseline";

function cappedWeights(preferences: number[], budget: number, cap: number) {
  const weights = preferences.map(() => 0);
  let remaining = Math.min(Math.max(budget, 0), preferences.length * cap);
  let available = preferences.map((_, index) => index);
  while (available.length && remaining > 1e-12) {
    const denominator = available.reduce((sum, index) => sum + preferences[index], 0);
    const shares = available.map(index => ({ index, value: remaining * (denominator > 0 ? preferences[index] / denominator : 1 / available.length) }));
    const capped = shares.filter(item => item.value > cap);
    if (!capped.length) { shares.forEach(item => { weights[item.index] = item.value; }); break; }
    capped.forEach(item => { weights[item.index] = cap; remaining -= cap; });
    const fixed = new Set(capped.map(item => item.index));
    available = available.filter(index => !fixed.has(index));
  }
  return weights;
}

/** Illustration for comparing fixed allocations, using selected-period beta estimates. */
export function comparisonPresetWeights(holdings: AnalyticsHolding[], betas: Map<string, number>, preset: ComparisonPreset, saved: AnalyticsHolding[] = []) {
  const total = holdings.reduce((sum, item) => sum + item.value, 0);
  const stocks = holdings.filter(item => item.ticker !== "CASH");
  const current = stocks.map(item => total > 0 ? item.value / total : 0);
  if (preset === "Current weights") return Object.fromEntries(stocks.map((item, index) => [item.ticker, current[index]]));
  if (preset === "Saved baseline") {
    const savedTotal = saved.reduce((sum, item) => sum + item.value, 0);
    return Object.fromEntries(stocks.map(item => [item.ticker, savedTotal > 0 ? (saved.find(row => row.ticker === item.ticker)?.value ?? 0) / savedTotal : 0]));
  }
  if (current.some(weight => weight < 0)) return Object.fromEntries(stocks.map((item, index) => [item.ticker, current[index]]));
  if (preset === "Equal weight") {
    const equal = cappedWeights(stocks.map(() => 1), 1, .05);
    return Object.fromEntries(stocks.map((item, index) => [item.ticker, equal[index]]));
  }
  const invested = current.reduce((sum, weight) => sum + weight, 0);
  const beta = stocks.map(item => betas.get(item.ticker) ?? 1);
  const preferences = current.map((weight, index) => weight / (.25 + Math.max(beta[index], 0)) ** 2);
  let weights = cappedWeights(preferences, Math.min(1, .75 * invested), .05);
  const currentBeta = current.reduce((sum, weight, index) => sum + weight * beta[index], 0);
  const newBeta = weights.reduce((sum, weight, index) => sum + weight * beta[index], 0);
  if (currentBeta > 0 && newBeta > .7 * currentBeta) weights = weights.map(weight => weight * .7 * currentBeta / newBeta);
  return Object.fromEntries(stocks.map((item, index) => [item.ticker, weights[index]]));
}

export function comparisonHoldings(holdings: AnalyticsHolding[], weights: Record<string, number>) {
  const total = holdings.reduce((sum, item) => sum + item.value, 0);
  const stocks = holdings.filter(item => item.ticker !== "CASH").map(item => ({ ticker: item.ticker, value: total * (Number.isFinite(weights[item.ticker]) ? weights[item.ticker] : 0) }));
  return [...stocks, { ticker: "CASH", value: total - stocks.reduce((sum, item) => sum + item.value, 0) }];
}

export function replayStatistics(dates: string[], dailyReturns: number[], totalReturn: number, payload?: MarketPayload) {
  const years = (Date.parse(dates.at(-1) ?? "") - Date.parse(dates[0] ?? "")) / (365.25 * 86400000);
  const annualReturn = years > 0 && totalReturn > -1 ? (1 + totalReturn) ** (1 / years) - 1 : null;
  const mean = dailyReturns.reduce((sum, value) => sum + value, 0) / Math.max(dailyReturns.length, 1);
  const variance = dailyReturns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(dailyReturns.length - 1, 1);
  return { annualReturn, sharpe: historicalSharpe(dates, dailyReturns, payload) };
}

export function allocationAttributionEffects(current: FactorModelAnalytics, alternative: FactorModelAnalytics) {
  const before = new Map(current.layers.map(layer => [layer.name, layer]));
  return alternative.layers.map(layer => ({
    name: layer.name,
    currentReturn: before.get(layer.name)?.returnAttribution ?? 0,
    alternativeReturn: layer.returnAttribution,
    returnChange: layer.returnAttribution - (before.get(layer.name)?.returnAttribution ?? 0),
    currentRiskShare: before.get(layer.name)?.riskShare ?? 0,
    alternativeRiskShare: layer.riskShare,
    riskShareChange: layer.riskShare - (before.get(layer.name)?.riskShare ?? 0),
  }));
}
