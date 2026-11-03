import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("legacy proxy model remains available; published attribution is labelled distinctly", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const analytics = await readFile(new URL("../lib/analytics.ts", import.meta.url), "utf8");

  assert.match(analytics, /stylePredictors = styleRaw\.map\(\(series\) => residualizeSeries\(series, corePredictors\)\)/);
  assert.match(analytics, /sectorTarget = regressionStage\(target, precedingControls\)\.residuals/);
  assert.match(analytics, /sectorPredictors = sectorRaw\.map\(\(series\) => residualizeSeries\(series, precedingControls\)\)/);
  assert.match(analytics, /idiosyncraticAttribution = total \* analytics\.totalReturn - systematicAttribution/);
  assert.match(page, /Published FF5 \+ momentum · joint exposures/);
  assert.match(page, /Factor overlap diagnostics/);
  assert.match(page, /conditional estimates, not independent causal effects/);
  assert.match(page, /Arithmetically linked · exact reconciliation/);
  assert.match(page, /Difference \{money\(model\.reconciliationDifference\)\}/);
});

test("factor taxonomy broadens only with defensible ETF proxies", async () => {
  const analytics = await readFile(new URL("../lib/analytics.ts", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/market-data/route.ts", import.meta.url), "utf8");

  assert.match(analytics, /Dividend yield/);
  assert.match(analytics, /Communication services/);
  assert.match(analytics, /Consumer discretionary/);
  assert.match(analytics, /Real estate/);
  assert.match(route, /"VYM"/);
  assert.match(route, /"XLC"/);
  assert.match(route, /"XLRE"/);
});
