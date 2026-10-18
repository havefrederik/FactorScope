import test from "node:test";
import assert from "node:assert/strict";
import { parseHoldingsCsv } from "../lib/holdings-input.ts";
test("quoted dollar values, short positions, sector metadata and duplicate netting preserve NAV",()=>{
 const h=parseHoldingsCsv('ticker,market_value,sector,name\r\nAAA,"$100,000",Technology,"Example, Inc."\r\nBBB,-50000,Technology,Short\r\nAAA,20000,Technology,Example\r\nCASH,930000,Cash,Collateral');
 assert.equal(h.length,3);assert.equal(h[0].value,120000);assert.equal(h[0].name,"Example, Inc.");assert.equal(h[1].value,-50000);assert.equal(h.reduce((s,x)=>s+x.value,0),1000000);
});
test("net-zero stock books require explicit positive cash/collateral",()=>{
 assert.throws(()=>parseHoldingsCsv("ticker,market_value\nAAA,100\nBBB,-100"),/NAV must be positive/);
 assert.equal(parseHoldingsCsv("ticker,market_value\nAAA,100\nBBB,-100\nCASH,100").reduce((s,h)=>s+h.value,0),100);
});
test("invalid numeric values and conflicting classifications fail without silently dropping positions",()=>{
 for(const text of ['ticker,market_value\nAAA,','ticker,market_value\nAAA,nope','ticker,market_value,sector\nAAA,100,Tech\nAAA,200,Energy','ticker,market_value\nAAA,"100'])assert.throws(()=>parseHoldingsCsv(text));
});
