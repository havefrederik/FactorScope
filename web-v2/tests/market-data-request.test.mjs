import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { validateMarketTickers, MAX_MARKET_TICKERS } from "../lib/market-data-request.ts";

test("the complete default stock universe passes the endpoint's request validation",()=>{
  const source=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
  const catalog=source.split('const stockCatalog = [')[1].split('] as const;')[0];
  const tickers=[...catalog.matchAll(/\["([^"]+)"/g)].map(match=>match[1]);
  assert.equal(tickers.length,39);
  assert.deepEqual(validateMarketTickers([...tickers,'CASH']),tickers);
});
test("cash and repeated ticker entries do not consume the stock request limit",()=>{
  assert.deepEqual(validateMarketTickers([...Array(100).fill(' aapl '),'CASH','']),['AAPL']);
});
test("invalid and oversized requests fail with specific messages",()=>{
  assert.throws(()=>validateMarketTickers(['bad/ticker']),/Invalid ticker format/);
  assert.throws(()=>validateMarketTickers(['CASH']),/at least one non-cash/);
  assert.equal(validateMarketTickers(Array.from({length:MAX_MARKET_TICKERS},(_,i)=>`STOCK${i}`)).length,MAX_MARKET_TICKERS);
  assert.throws(()=>validateMarketTickers(Array.from({length:MAX_MARKET_TICKERS+1},(_,i)=>`STOCK${i}`)),/60.*Received 61/);
});
