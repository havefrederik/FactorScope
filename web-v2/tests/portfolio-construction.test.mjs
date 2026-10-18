import test from "node:test";
import assert from "node:assert/strict";
import { buildConstructionFactors, constructionMeasures } from "../lib/portfolio-construction.ts";

const snapshot = {
  forecast: { asOf: "2025-10-01", tickers: ["AAA", "BBB"], covarianceMatrix: [[.04, .01], [.01, .09]] },
  factors: [{ name: "Market", group: "Core", values: [1.2, .6] }, { name: "Quality", group: "Style", values: [-.2, .5] }],
  expectedReturns: [.06, .03], objective: "Maximum Sharpe", returnAssumption: "Manual forecasts",
};
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);

test("dated review compares covariance, assumptions and linear exposures in the same ticker order", () => {
  const before = structuredClone(snapshot);
  const a = constructionMeasures(snapshot, { BBB: .6, AAA: .4 });
  const b = constructionMeasures(snapshot, { AAA: 1.1, BBB: -.1 });
  close(a.volatility, Math.sqrt(.04*.4**2 + .09*.6**2 + 2*.01*.4*.6));
  close(a.expectedReturn, .042);
  close(a.assumedSharpe, .042/a.volatility);
  close(a.factors[0].exposure, .84);
  close(b.net, 1); close(b.gross, 1.2); close(b.long, 1.1); close(b.short, .1);
  close(b.factors[0].exposure, 1.26);
  assert.deepEqual(snapshot, before);
});

test("missing coverage and undefined assumptions cannot become misleading risk or Sharpe values", () => {
  assert.equal(constructionMeasures(snapshot, { AAA: .5, OTHER: .5 }), null);
  assert.equal(constructionMeasures(snapshot, { AAA: NaN }), null);
  const cash = constructionMeasures(snapshot, {});
  assert.equal(cash.volatility, 0); assert.equal(cash.assumedSharpe, null);
  const withoutReturn = constructionMeasures({ ...snapshot, expectedReturns: null }, { AAA: 1 });
  assert.equal(withoutReturn.expectedReturn, null); assert.equal(withoutReturn.assumedSharpe, null);
});

test("prices after the decision date cannot change construction factor loadings or residual volatility", () => {
  const dates = Array.from({ length: 330 }, (_, i) => new Date(Date.UTC(2024, 0, 1+i)).toISOString().slice(0, 10));
  const tickers = ["AAA", "BBB", "SPY", "IWM", "IWD", "IWF", "MTUM", "QUAL", "USMV", "VYM", "IJH", "COWZ", "XLK", "XLF", "XLE", "XLV", "XLC", "XLY", "XLP", "XLI", "XLB", "XLRE", "XLU"];
  const series = Object.fromEntries(tickers.map((ticker, asset) => {
    let price = 100;
    return [ticker, { points: dates.map((date, i) => ({ date, close: price *= 1 + .0001 + .005*Math.sin(i*.4) + .002*Math.sin(i*(.12+asset*.047)) })) }];
  }));
  const payload = { series, asOf: dates.at(-1) };
  const forecast = { ...snapshot.forecast, asOf: dates[275] };
  const original = buildConstructionFactors(payload, forecast);
  assert.ok(original.factors.length > 10);
  assert.ok(original.idiosyncraticVolatility.every(value => value > 0));
  const changed = structuredClone(payload);
  for (const item of Object.values(changed.series)) for (const point of item.points) if (point.date > forecast.asOf) point.close *= 10;
  assert.deepEqual(buildConstructionFactors(changed, forecast), original);
  const truncated = structuredClone(payload);
  for (const item of Object.values(truncated.series)) item.points = item.points.filter(point => point.date <= forecast.asOf);
  assert.deepEqual(buildConstructionFactors(truncated, forecast), original);
});
