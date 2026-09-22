import assert from "node:assert/strict";
import test from "node:test";
import { summarizeCovariance, compareCovariance } from "../lib/covariance-comparison.ts";
import { buildCovarianceForecast, forecastCombinedIewmaCovariance } from "../lib/analytics.ts";

const near = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const matrix = (vols, rho) => [[vols[0] ** 2, vols[0] * vols[1] * rho], [vols[0] * vols[1] * rho, vols[1] ** 2]];
const snapshot = (vols, rho, weights = [.4, .3]) => summarizeCovariance(matrix(vols, rho), ["AAA", "BBB"], weights);

test("unchanged covariance has zero deltas and zero risk-change effects", () => {
  const original = snapshot([.2, .3], .4);
  const comparison = compareCovariance(original, original);
  comparison.covarianceDelta.flat().forEach(value => near(value, 0));
  comparison.correlationDelta.flat().forEach(value => near(value, 0));
  near(comparison.totalChange, 0);
  near(comparison.volatilityEffect, 0);
  near(comparison.correlationEffect, 0);
});

test("volatility-only and correlation-only changes are attributed to the correct driver", () => {
  const reference = snapshot([.2, .3], .4);
  const volatilityChange = compareCovariance(reference, snapshot([.4, .6], .4));
  near(volatilityChange.volatilityEffect, reference.portfolioVolatility);
  near(volatilityChange.correlationEffect, 0);
  const correlationChange = compareCovariance(reference, snapshot([.2, .3], .8));
  near(correlationChange.volatilityEffect, 0);
  near(correlationChange.correlationEffect, correlationChange.totalChange);
  near(correlationChange.correlationDelta[0][1], .4);
  near(correlationChange.correlationDelta[0][0], 0);
});

test("mixed changes reconcile for long-only and signed portfolios without renormalizing cash", () => {
  for (const weights of [[.4, .3], [.8, -.6], [0, 0]]) {
    const before = snapshot([.2, .3], .1, weights);
    const after = snapshot([.25, .22], .7, weights);
    const change = compareCovariance(before, after);
    near(change.volatilityEffect + change.correlationEffect, after.portfolioVolatility - before.portfolioVolatility);
    near(after.portfolioVolatility ** 2, weights[0] ** 2 * .25 ** 2 + weights[1] ** 2 * .22 ** 2 + 2 * weights[0] * weights[1] * .25 * .22 * .7);
    if (weights.some(Boolean)) near(after.securities.reduce((sum, security) => sum + security.riskShare, 0), 1);
  }
  const hedge = compareCovariance(snapshot([.2, .3], .1, [.8, -.6]), snapshot([.2, .3], .7, [.8, -.6]));
  assert.ok(hedge.correlationEffect < 0, "rising correlations reduce this long-short portfolio's risk");
});

test("undefined correlation and single-security portfolios do not invent pair statistics", () => {
  const flat = summarizeCovariance([[0, 0], [0, .04]], ["AAA", "BBB"], [.5, .5]);
  assert.equal(flat.correlationMatrix[0][0], null);
  assert.equal(flat.averageCorrelation, null);
  assert.equal(flat.strongestPair, null);
  const comparison = compareCovariance(flat, snapshot([.1, .2], .2, [.5, .5]));
  assert.equal(comparison.correlationDelta[0][1], null);
  assert.equal(comparison.volatilityEffect, null);
  assert.equal(comparison.correlationEffect, null);
  const single = summarizeCovariance([[.04]], ["AAA"], [.5]);
  near(single.portfolioVolatility, .1);
  assert.equal(single.averageCorrelation, null);
});

test("comparison rejects changed positions or weights", () => {
  assert.throws(() => compareCovariance(snapshot([.2, .3], .4), snapshot([.2, .3], .4, [.5, .5])), /identical/);
});

function fixture() {
  const dates = Array.from({ length: 551 }, (_, i) => new Date(Date.UTC(2022, 0, i + 1)).toISOString().slice(0, 10));
  const series = Object.fromEntries(["AAA", "BBB"].map((ticker, k) => {
    let price = 100;
    return [ticker, { requested: ticker, symbol: ticker, currency: "USD", exchange: "TEST", instrumentType: "EQUITY", points: dates.map((date, i) => {
      if (i) price *= 1 + .009 * Math.sin(i * .173 + k) + .004 * Math.cos(i * .631 - k);
      return { date, close: price };
    }) }];
  }));
  return { dates, payload: { source: "deterministic test fixture", frequency: "daily", adjusted: true, asOf: dates.at(-1), series, errors: [], missingHoldings: [] }, holdings: [{ ticker: "AAA", value: 60 }, { ticker: "BBB", value: -30 }, { ticker: "CASH", value: 70 }] };
}

test("historical windows, units, fixed weights and previous forecast are aligned point in time", () => {
  const { dates, payload, holdings } = fixture();
  const cutoff = dates[530];
  const result = buildCovarianceForecast(payload, holdings, cutoff);
  assert.equal(result.asOf, cutoff);
  assert.equal(result.observations, 530);
  assert.deepEqual(result.tickers, ["AAA", "BBB"]);
  assert.deepEqual(result.securities.map(item => item.portfolioWeight), [.6, -.3]);
  const returns = result.tickers.map(ticker => payload.series[ticker].points.slice(0, 531).slice(1).map((point, i) => point.close / payload.series[ticker].points[i].close - 1));
  const expected = forecastCombinedIewmaCovariance(returns, 529);
  result.covarianceMatrix.forEach((row, i) => row.forEach((value, j) => near(value, expected.covarianceMatrix[i][j] * 252)));
  for (const window of [63, 126, 252]) {
    const historical = result.references.find(item => item.id === `historical-${window}`);
    assert.equal(historical.startDate, dates[531 - window]);
    assert.equal(historical.asOf, cutoff);
    assert.equal(historical.observations, window);
    const recent = returns.map(row => row.slice(-window));
    const means = recent.map(row => row.reduce((sum, value) => sum + value, 0) / window);
    historical.covarianceMatrix.forEach((row, i) => row.forEach((value, j) => near(value, 252 * recent[i].reduce((sum, observation, k) => sum + (observation - means[i]) * (recent[j][k] - means[j]), 0) / (window - 1))));
  }
  const previous = result.references.find(item => item.id === "previous");
  const standalonePrevious = buildCovarianceForecast(payload, holdings, dates[529]);
  assert.equal(previous.asOf, dates[529]);
  assert.deepEqual(previous.covarianceMatrix, standalonePrevious.covarianceMatrix);
  const futureChanged = structuredClone(payload);
  Object.values(futureChanged.series).forEach(series => series.points.forEach(point => { if (point.date > cutoff) point.close *= 100; }));
  assert.deepEqual(buildCovarianceForecast(futureChanged, holdings, cutoff), result, "future prices must not affect either estimate");
});
