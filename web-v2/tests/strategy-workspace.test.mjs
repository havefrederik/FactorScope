import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildRiskTargetSnapshot } from "../lib/analytics.ts";

test("allocation preview changes retain the applied backtest and expose unapplied settings", async () => {
  const directory = await mkdtemp(new URL("../.strategy-render-", import.meta.url));
  try {
    const source = (await readFile(new URL("../app/strategy-workspace.tsx", import.meta.url), "utf8")).replace('from "@/lib/analytics"', 'from "../lib/analytics.ts"');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    await writeFile(`${directory}/workspace.mjs`, compiled);
    const { default: Workspace } = await import(`${directory}/workspace.mjs`);
    const strategy = { totalReturn: .21, startDate: "2024-01-01", endDate: "2025-01-01", sharpeRatio: 1.2, staticSharpeRatio: .8, benchmarkSharpeRatio: .9, annualVolatility: .1, beta: .7, maxDrawdown: -.08, rebalances: [], totalTurnover: .3, transactionCosts: 30, assumptions: { transactionCostBps: 10 } };
    const baseSnapshot = { asOf: "2025-01-01", effective: "Next trading session", currentVolatility: .2, currentBeta: 1.1, estimatedVolatility: .15, beta: .8, currentCashWeight: .4, cashWeight: .5, turnover: .1, bindingConstraints: ["Risk ceiling"], solverStatus: "Solved", weights: [{ ticker: "ABC", currentWeight: .6, targetWeight: .5, change: -.1, riskBudget: 1, riskContribution: 1 }] };
    const applied = { frequency: "Monthly", targetVolatility: .15, targetBeta: .9, maxPosition: .05 };
    const noop = () => {};
    const render = (snapshot, pending) => renderToStaticMarkup(React.createElement(Workspace, { strategy, snapshot, applied, frequency: "Weekly", targetVolatility: .08, targetBeta: .1, maxPosition: .01, hasPendingChanges: pending, isUpdating: false, total: 1000, payload: { series: {} }, startDate: strategy.startDate, endDate: strategy.endDate, setFrequency: noop, setTargetVolatility: noop, setTargetBeta: noop, setMaxPosition: noop, onRunBacktest: noop, onResetDraft: noop, onSelectTicker: noop, renderPerformance: () => React.createElement("div", null, "APPLIED_CHART"), renderExposures: noop }));
    const first = render(baseSnapshot, false);
    const changed = render({ ...baseSnapshot, estimatedVolatility: .08, beta: .1, cashWeight: .9, weights: [{ ...baseSnapshot.weights[0], targetWeight: .1, change: -.5 }] }, true);
    assert.match(first, /Results match applied settings/);
    assert.match(changed, /Unapplied changes/);
    for (const html of [first, changed]) {
      assert.match(html, /Total return<\/span><b>21\.0%/);
      assert.match(html, /Applied settings<\/b><span>Monthly/);
      assert.match(html, /Risk ≤ 15\.0%/);
      assert.match(html, /APPLIED_CHART/);
      assert.match(html, /aria-label="Analyze ABC security"/);
    }
    assert.match(changed, /-50\.00 pp/);
    assert.match(changed, /-\$500/);
    assert.match(changed, /90\.0%/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("current and proposed risk use the same forecast while constraint edits preserve the current baseline", () => {
  const dates = [];
  for (let day = new Date("2025-01-01T00:00:00Z"); dates.length < 150; day.setUTCDate(day.getUTCDate() + 1)) if (day.getUTCDay() % 6) dates.push(day.toISOString().slice(0, 10));
  const series = Object.fromEntries([["SPY", 1], ["AAA", .5], ["BBB", 1.5]].map(([ticker, beta]) => {
    let close = 100;
    return [ticker, { points: dates.map((date, index) => { close *= 1 + beta * (.0002 + .002 * Math.sin(index)); return { date, close }; }) }];
  }));
  const asOf = dates[130];
  const forecast = { tickers: ["AAA", "BBB"], asOf, covarianceMatrix: [[.04, .006], [.006, .09]] };
  const holdings = [{ ticker: "AAA", value: 20 }, { ticker: "BBB", value: 30 }, { ticker: "CASH", value: 50 }];
  const config = { targetVolatility: .25, targetBeta: 1.3, maxPosition: .8 };
  const first = buildRiskTargetSnapshot({ series }, holdings, forecast, config);
  const second = buildRiskTargetSnapshot({ series }, holdings, forecast, { ...config, targetBeta: .1 });
  assert.ok(Math.abs(first.currentVolatility - Math.sqrt(.2 ** 2 * .04 + .3 ** 2 * .09 + 2 * .2 * .3 * .006)) < 1e-12);
  assert.ok(Math.abs(first.currentBeta - .55) < 1e-10);
  assert.equal(first.currentVolatility, second.currentVolatility);
  assert.equal(first.currentBeta, second.currentBeta);
  assert.equal(first.currentCashWeight, second.currentCashWeight);
  assert.ok(second.beta <= .100001);
  assert.ok(second.cashWeight > first.cashWeight);
});
