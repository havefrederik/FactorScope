import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("objective summary reports relative improvements for risk assumptions and expected Sharpe only for supplied forecasts", async () => {
  const directory = await mkdtemp(new URL("../.return-risk-render-", import.meta.url));
  try {
    const source = (await readFile(new URL("../app/return-risk-comparison.tsx", import.meta.url), "utf8"))
      .replace('from "@/lib/optimizer-returns"', 'from "../lib/optimizer-returns.ts"');
    await writeFile(`${directory}/summary.mjs`, ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText);
    const { default: Summary } = await import(`${directory}/summary.mjs`);
    const props = { returns: [1,1], current: [.5,.5], proposed: [.8,.2], currentVol: .355, proposedVol: .261, asOf: "2026-09-30" };
    const render = patch => renderToStaticMarkup(React.createElement(Summary, {...props, ...patch}));
    for (const assumption of ["Proportional to idiosyncratic volatility", "Proportional to total volatility"]) {
      const html = render({ assumption });
      assert.match(html, /36\.0% higher/); assert.match(html, /26\.5% lower/); assert.match(html, /Unchanged/);
      assert.match(html, /No absolute return forecast is implied/);
      assert.doesNotMatch(html, /Expected Sharpe|current = 100|conditional Sharpe|index/i);
    }
    const manual = render({ assumption: "My return forecasts", returns: [.06,.06], currentVol: .2, proposedVol: .15 });
    assert.match(manual, /Expected Sharpe/); assert.match(manual, /0\.300/); assert.match(manual, /0\.400/);
    assert.match(manual, /6\.00%/); assert.match(manual, /before costs/); assert.doesNotMatch(manual, /higher|index/i);
    const zero = render({ assumption: "Proportional to total volatility", currentVol: 0 });
    assert.match(zero, /Unavailable/); assert.match(zero, /nonzero risk/); assert.doesNotMatch(zero, /NaN|Infinity/);
    const zeroManual = render({ assumption: "My return forecasts", proposedVol: 0 });
    assert.match(zeroManual, /unavailable.*zero forecast volatility/); assert.doesNotMatch(zeroManual, /NaN|Infinity/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
