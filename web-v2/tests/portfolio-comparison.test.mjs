import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("supports direct weight editing and saved-baseline portfolio comparison", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8") + await readFile(new URL("../app/portfolio-comparison.tsx", import.meta.url), "utf8");

  assert.match(page, /function updateWeight/);
  assert.match(page, /function applySecurityValue/);
  assert.match(page, /item\.ticker==="CASH"\?\{\.\.\.item,value:item\.value-delta\}/);
  assert.doesNotMatch(page, /const scale=\(portfolioTotal-targetValue\)\/otherTotal/);
  assert.match(page, /Changing a security’s dollars or weight changes only that position and the cash residual/);
  assert.match(page, /Normalize invested to 100%/);
  assert.match(page, /function normalizeInvested/);
  assert.match(page, /Cash \(residual\)/);
  assert.match(page, /Negative cash represents an over-allocated portfolio/);
  assert.match(page, /scrollIntoView\(\{behavior:"smooth",block:"start"\}\)/);
  assert.match(page, /const stockCatalog/);
  assert.match(page, /SEARCH BY TICKER OR COMPANY/);
  assert.match(page, /Use typed Yahoo Finance ticker/);
  assert.match(page, /function addSecurity/);
  assert.doesNotMatch(page, /`NEW\$\{h\.length\}`/);
  assert.match(page, /aria-label={`\$\{h\.ticker\} portfolio weight`}/);
  assert.match(page, /"Compare": \["Portfolio comparison"/);
  assert.match(page, /Save current as baseline/);
  assert.match(page, /secondaryLabel="Alternative portfolio"/);
  assert.match(page, /Allocation changes/);
  assert.match(page, /Factor exposure changes/);
  assert.match(page, /setBaselineHoldings\(portfolio\.map/);
});

test("static US equity seed is diversified and position capped", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const block = page.match(/const equitySeed: Holding\[\] = \[(.*?)\];/s)?.[1] ?? "";
  const positions = [...block.matchAll(/ticker: "([^"]+)".*?value: (-?\d+)/g)].map((match) => ({ ticker: match[1], value: Number(match[2]) }));
  const total = positions.reduce((sum, position) => sum + position.value, 0);
  const stocks = positions.filter((position) => position.ticker !== "CASH");

  assert.equal(total, 1_000_000);
  assert.equal(stocks.length, 24);
  assert.ok(Math.max(...stocks.map((position) => position.value / total)) <= .05);
  assert.match(page, /const \[strategyMaxPosition,setStrategyMaxPosition\]=useState\(\.05\)/);
});
