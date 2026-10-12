import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { readFileSync } from "node:fs";

const chartCalls=[];
mock.module("yahoo-finance2",{defaultExport:class {
  async chart(symbol){chartCalls.push(symbol);return {meta:{currency:"USD",instrumentType:"EQUITY",exchangeName:"US"},quotes:[{date:new Date("2025-01-02"),close:100,adjclose:100},{date:new Date("2025-01-03"),close:102,adjclose:102}]};}
}});
const { POST }=await import("../app/api/market-data/route.ts");
const request=tickers=>new Request("https://example.test/api/market-data",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tickers,years:10})});

test("actual endpoint accepts the default 39-stock universe and returns all histories",async()=>{
  const source=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
  const catalog=source.split("const stockCatalog = [")[1].split("] as const;")[0];
  const tickers=[...catalog.matchAll(/\["([^"]+)"/g)].map(m=>m[1]);
  const response=await POST(request([...tickers,"CASH"]));
  assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.missingHoldings.length,0);
  for(const ticker of tickers)assert.equal(body.series[ticker].points.length,2);
  assert.ok(chartCalls.includes("BRK-B"));assert.ok(body.series.SPY);
});
test("oversized requests are rejected before making any provider calls",async()=>{
  const count=chartCalls.length;
  const response=await POST(request(Array.from({length:61},(_,i)=>`STOCK${i}`)));
  assert.equal(response.status,400);assert.match((await response.json()).error,/Received 61/);
  assert.equal(chartCalls.length,count);
});
