import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { comparisonPresetWeights, comparisonHoldings, replayStatistics } from "../lib/comparison-portfolio.ts";
import { buildAnalytics } from "../lib/analytics.ts";

test("lower-beta preset changes stock weights, caps positions and preserves total capital with explicit cash", () => {
  const holdings = Array.from({ length: 40 }, (_, index) => ({ ticker: `S${index}`, value: 25000 }));
  const betas = new Map(holdings.map((item, index) => [item.ticker, .2 + index * .04]));
  const original = structuredClone(holdings);
  const weights = comparisonPresetWeights(holdings, betas, "Lower beta");
  const alternative = comparisonHoldings(holdings, weights);
  assert.deepEqual(holdings, original);
  assert.ok(Object.values(weights).every(weight => weight >= 0 && weight <= .05 + 1e-12));
  assert.ok(Object.values(weights).reduce((sum, value) => sum + value, 0) <= .75 + 1e-12);
  const originalBeta = holdings.reduce((sum, item) => sum + item.value / 1e6 * betas.get(item.ticker), 0);
  const newBeta = Object.entries(weights).reduce((sum, [ticker, weight]) => sum + weight * betas.get(ticker), 0);
  assert.ok(newBeta <= originalBeta * .7 + 1e-12);
  assert.ok(weights.S0 > weights.S39);
  assert.ok(Math.abs(alternative.reduce((sum, item) => sum + item.value, 0) - 1e6) < 1e-7);
  assert.ok(alternative.at(-1).value >= 250000 - 1e-7);
});

test("one weight edit changes only that stock and residual cash; signed weights reconcile too", () => {
  const holdings = [{ ticker: "AAA", value: 40 }, { ticker: "BBB", value: 50 }, { ticker: "CASH", value: 10 }];
  const a = comparisonHoldings(holdings, { AAA: .4, BBB: .5 });
  const b = comparisonHoldings(holdings, { AAA: .3, BBB: .5 });
  assert.equal(b[0].value, a[0].value - 10);
  assert.equal(b[1].value, a[1].value);
  assert.equal(b[2].value, a[2].value + 10);
  const signed = comparisonHoldings(holdings, { AAA: -.2, BBB: .9 });
  assert.equal(signed.reduce((sum, item) => sum + item.value, 0), 100);
  assert.equal(signed.at(-1).value, 30);
  const equal = comparisonPresetWeights(holdings, new Map(), "Equal weight");
  assert.deepEqual(equal, { AAA: .05, BBB: .05 });
  const saved = [{ ticker: "AAA", value: -20 }, { ticker: "BBB", value: 90 }, { ticker: "CASH", value: 30 }];
  assert.deepEqual(comparisonPresetWeights(saved, new Map(), "Saved baseline", saved), { AAA: -.2, BBB: .9 });
});

test("both allocation replays retain identical dates, including zero-stock and all-cash alternatives", () => {
  const dates = [];
  for (let day = new Date("2025-01-01T00:00:00Z"); dates.length < 160; day.setUTCDate(day.getUTCDate() + 1)) if (day.getUTCDay() % 6) dates.push(day.toISOString().slice(0, 10));
  const series = Object.fromEntries([["SPY", 1], ["AAA", 1.4], ["BBB", .4]].map(([ticker, beta]) => { let close = 100; return [ticker, { points: dates.map((date, index) => { close *= 1 + beta * (.0002 + .008 * Math.sin(index * .4)); return { date, close }; }) }]; }));
  const payload = { series, asOf: dates.at(-1) }, window = { startDate: dates[0], endDate: dates.at(-1) };
  const holdings = [{ ticker: "AAA", value: 70 }, { ticker: "BBB", value: 30 }, { ticker: "CASH", value: 0 }];
  const current = buildAnalytics(payload, holdings, window);
  const alternative = buildAnalytics(payload, comparisonHoldings(holdings, { AAA: .1, BBB: 0 }), window);
  const cash = buildAnalytics(payload, comparisonHoldings(holdings, { AAA: 0, BBB: 0 }), window);
  assert.deepEqual(current.dates, alternative.dates);
  assert.deepEqual(current.dates, cash.dates);
  assert.ok(alternative.beta < current.beta);
  assert.equal(cash.totalReturn, 0);
  assert.equal(cash.annualVolatility, 0);
  assert.equal(cash.beta, 0);
  assert.equal(replayStatistics(cash.dates, cash.dailyReturns, cash.totalReturn).sharpe, null);
  const stats = replayStatistics(current.dates, current.dailyReturns, current.totalReturn);
  const years = (Date.parse(current.endDate) - Date.parse(current.startDate)) / (365.25 * 86400000);
  assert.ok(Math.abs((1 + stats.annualReturn) ** years - (1 + current.totalReturn)) < 1e-12);
});

test("exposure plot places positive and negative exposures on opposite sides of a common zero axis", async () => {
  const directory = await mkdtemp(new URL("../.exposure-render-", import.meta.url));
  try {
    const source = await readFile(new URL("../app/factor-exposure-chart.tsx", import.meta.url), "utf8");
    await writeFile(`${directory}/plot.mjs`, ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText);
    const { default: Plot } = await import(`${directory}/plot.mjs`);
    const html = renderToStaticMarkup(React.createElement(Plot, { factors: [{ name: "Market", group: "Core", exposure: .9 }, { name: "Quality", group: "Style", exposure: -.35 }] }));
    const zero = Number(html.match(/class="exposure-zero" x1="([^"]+)"/)[1]);
    const rectangles = [...html.matchAll(/class="exposure-current" x="([^"]+)"[^>]*width="([^"]+)"/g)].map(row => ({ x: Number(row[1]), width: Number(row[2]) }));
    assert.equal(rectangles[0].x, zero);
    assert.ok(rectangles[1].x < zero);
    assert.ok(Math.abs(rectangles[1].x + rectangles[1].width - zero) < 1e-9);
    assert.match(html, /Quality: -0\.350/);
    assert.match(html, /Bars show signed exposure/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
