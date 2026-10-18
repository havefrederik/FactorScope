import test from "node:test";
import assert from "node:assert/strict";
import { buildOptimizerReturns } from "../lib/optimizer-returns.ts";
import { optimizePortfolio } from "../lib/portfolio-optimizer.ts";

const input = { tickers: ["AAA", "BBB", "CCC"], current: [.6, -.2, 0], mode: "Idiosyncratic volatility proportionate", level: 5, side: "both", idiosyncraticVolatility: [.1, .2, .3] };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
test("risk-proportionate preset preserves relative residual risk and explicitly signed views", () => {
  const values = buildOptimizerReturns(input);
  values.forEach((value, i) => close(value, [.025, -.05, .075][i]));
  close(values.reduce((s, v) => s + Math.abs(v), 0) / 3, .05);
  assert.ok(buildOptimizerReturns({ ...input, side: "short" }).every(v => v < 0));
  assert.ok(buildOptimizerReturns({ ...input, side: "long" }).every(v => v > 0));
});
test("equal-return assumptions and zero overrides are independent of risk availability", () => {
  assert.deepEqual(buildOptimizerReturns({ ...input, mode: "Equal expected returns", idiosyncraticVolatility: [], overrides: { AAA: "0", BBB: "3" } }), [0, .03, .05]);
});
test("manual mode preserves legacy values and blank-as-zero behavior", () => {
  assert.deepEqual(buildOptimizerReturns({ ...input, mode: "Manual forecasts", level: NaN, overrides: { AAA: "7", BBB: "-4" } }), [.07, -.04, 0]);
});
test("unavailable risk and invalid assumptions fail explicitly instead of generating silent forecasts", () => {
  for (const patch of [{ idiosyncraticVolatility: [] }, { idiosyncraticVolatility: [0, 0, 0] }, { level: 0 }, { level: NaN }, { overrides: { AAA: "invalid" } }]) assert.throws(() => buildOptimizerReturns({ ...input, ...patch }));
});
test("preset feeds Sharpe optimization without individual forecasts, including short-only books", () => {
  for (const shortOnly of [false, true]) {
    const current = shortOnly ? [-.5, -.5] : [.5, .5];
    const expectedReturns = buildOptimizerReturns({ ...input, tickers: ["AAA", "BBB"], current, side: shortOnly ? "short" : "long", idiosyncraticVolatility: [.1, .2] });
    const result = optimizePortfolio({ covariance: [[.04, 0], [0, .16]], current, objective: "Maximum Sharpe", expectedReturns, longOnly: !shortOnly, shortOnly, net: shortOnly ? -1 : 1, gross: 1, positionCap: 1, turnoverCap: null, changeCap: null, locked: [], exposures: [] });
    assert.equal(result.status, "Solved", result.message);
    assert.ok(result.expectedReturn > 0);
    assert.ok(result.audit.every(row => row.passed));
    assert.ok(Math.abs(Math.abs(result.weights[0]) - 2 / 3) < 5e-5);
  }
});
