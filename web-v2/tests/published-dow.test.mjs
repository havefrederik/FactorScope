import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { inspectDowArchive, dowArchiveCommit } from "../lib/published-dow.ts";

const data = JSON.parse(readFileSync(new URL("../public/data/published-dow.json", import.meta.url), "utf8"));
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

test("archive retains a complete dated budget, original scale and published concentration", () => {
  assert.equal(data.sourceCommit, dowArchiveCommit);
  assert.equal(data.holdingDates.length, 585);
  assert.equal(data.targetDates.length, 525);
  assert.equal(data.holdingDates[0], "2023-12-26");
  assert.equal(data.holdingDates.at(-1), "2026-04-27");
  for (const rows of [data.holdings, data.targets]) for (const row of rows) {
    assert.equal(row.length, data.tickers.length);
    assert.ok(row.every(Number.isFinite));
  }
  for (const row of data.targets) near(row.reduce((a, b) => a + b, 0), 1, 1e-7);
  near(inspectDowArchive(data, 0).nav, 1000000);
  near(inspectDowArchive(data, 584).nav, 1476841.2607220598, 1e-6);
  assert.ok(Math.max(...data.targets.map(row => row[data.tickers.indexOf("NVDA")])) > .5);
  assert.ok(Math.min(...data.holdings.map(row => row[data.tickers.indexOf("USDOLLAR")])) < 0);
});

test("holdings at open remain distinct from the new target instruction", () => {
  const start = inspectDowArchive(data, 0);
  near(start.rows.find(row => row.ticker === "USDOLLAR").weight, 1);
  const apple = start.rows.find(row => row.ticker === "AAPL");
  near(apple.weight, 0);
  near(apple.target, .24810006745725532);
  near(apple.change, apple.target);
});

test("all gaps carry only the last published target, never a future instruction", () => {
  let gaps = 0;
  data.holdingDates.forEach((date, i) => {
    const selected = inspectDowArchive(data, i);
    const expectedDate = data.targetDates.filter(targetDate => targetDate <= date).at(-1);
    assert.equal(selected.targetDate, expectedDate);
    assert.equal(selected.newTarget, expectedDate === date);
    if (!selected.newTarget) gaps++;
    const targetIndex = data.targetDates.indexOf(expectedDate);
    for (const row of selected.rows) near(row.target, data.targets[targetIndex][data.tickers.indexOf(row.ticker)]);
  });
  assert.equal(gaps, 60);
  assert.equal(inspectDowArchive(data, 584).newTarget, true);
});
