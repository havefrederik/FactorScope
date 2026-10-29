import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("uses neutral portfolio language and one shared performance chart", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8") + await readFile(new URL("../app/portfolio-holdings.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(page, /What matters most/i);
  assert.doesNotMatch(page, /\bSpecific\b/);
  assert.match(page, /Portfolio positions/);
  assert.match(page, /Idiosyncratic/);
  assert.match(page, /CUMULATIVE RETURN/);
  assert.match(page, /Factor benchmark \(fitted\)/);
  assert.match(page, /S&P 500 \(market reference\)/);
  assert.match(page, /Current portfolio/);
  assert.match(page, /S&amp;P 500/);
});
