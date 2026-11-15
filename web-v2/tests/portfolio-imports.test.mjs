import test from "node:test";
import assert from "node:assert/strict";
import { forecastTemplate, pricesTemplate, parseForecastBook, parseHoldingsBundle, forecastsAt, parsePrices, withUploadedPrices } from "../lib/portfolio-imports.ts";
import { backtestOptimizer } from "../lib/optimizer-backtest.ts";
import { buildOptimizerReturns } from "../lib/optimizer-returns.ts";

const header = "ticker,as_of,horizon_sessions,annual_excess_return_pct";
const book = text => parseForecastBook(text, "example.csv", "example");
const dates = ["2026-02-05","2026-02-06","2026-02-09","2026-02-10","2026-02-11","2026-02-12"];
test("templates import and chosen-horizon forecasts have arithmetic annual units", () => {
  assert.equal(book(forecastTemplate).count,4);
  assert.equal(parsePrices(pricesTemplate,"sample").series.AAPL.points.length,2);
  const sample = book("ticker,as_of,horizon_sessions,horizon_excess_return_pct,annual_excess_return_pct\nAAA,2026-02-05,21,0.5,\nAAA,2026-02-05,,,8\nBBB,2026-02-05,,,0");
  assert.deepEqual(forecastsAt(sample,21,["AAA","BBB"],dates[0],dates).values,{AAA:"6"});
  assert.deepEqual(forecastsAt(sample,252,["AAA","BBB"],dates[0],dates).values,{AAA:"8",BBB:"0"});
});
test("revisions are point in time, expire in sessions and match ticker aliases",()=>{
  const data=book(header+"\nBRK-B,2026-02-10,2,4\nbrk.b,2026-02-06,2,-9");
  const read=date=>forecastsAt(data,2,["BRK.B"],date,dates).values;
  assert.deepEqual(read(dates[0]),{});
  assert.deepEqual(read(dates[2]),{"BRK.B":"-9"});
  assert.deepEqual(read(dates[3]),{"BRK.B":"4"});
  assert.deepEqual(read(dates[5]),{});
});
test("invalid dates, duplicate vintages, ambiguous percentages and invalid prices fail atomically",()=>{
  for(const csv of [header+"\nA,2026-02-30,5,1",header+"\nA,2026-02-01,-1,1",header+"\nA,2026-02-01,3.5,1",header+"\nA,2026-02-01,5,4\nA,2026-02-01,5,9",header+",horizon_excess_return_pct\nA,2026-02-01,5,10,2",header+"\nA,2026-02-01,5,NaN"]) assert.throws(()=>book(csv));
  for(const entries of ["AAA,2026-02-01,0","AAA,2026-02-01,1","AAA,2026-02-01,2\nAAA,2026-02-01,3"]) assert.throws(()=>parsePrices("ticker,date,adjusted_close\n"+entries,"prices"));
});
test("prices replace a matched ticker's full series; other histories retain the provider values",()=>{
  const y={points:[{date:dates[1],close:999}]};
  const market={series:{"BRK.B":y,QQQ:y},errors:[{ticker:"BRK.B",message:"offline"},{ticker:"SPY",message:"offline"}],missingHoldings:["BRK.B","SPY"]};
  const local=parsePrices("ticker,date,adjusted_close\nBRK-B,2026-02-09,502\nBRK.B,2026-02-05,501","p");
  const merged=withUploadedPrices(market,local,["BRK.B","QQQ","SPY"]);
  assert.deepEqual(merged.series["BRK.B"].points.map(p=>p.close),[501,502]);assert.equal(merged.series.QQQ,y);
  assert.deepEqual(merged.missingHoldings,["SPY"]);assert.deepEqual(merged.errors,[market.errors[1]]);assert.equal(market.series["BRK.B"],y);
});
test("a forecast first available on an execution date cannot change the preceding optimization or trade",async()=>{
  const tickers=["A","B"];
  const payload={series:Object.fromEntries([...tickers,"SPY","BIL"].map(t=>[t,{points:dates.map((date,i)=>({date,close:t==="A"?100+i:100}))}]))};
  const policy={interval:"Daily",trigger:"Interval",drift:.02,volatility:.3,costBps:5,costGate:false,riskAversion:3,horizon:21,borrowRate:0,financingRate:0};
  async function run(text){const archive=book(text);return backtestOptimizer(payload,tickers,dates[0],dates.at(-1),[.5,.5],policy,(date,current)=>({
    current,expectedReturns:buildOptimizerReturns({tickers,current,mode:"My return forecasts",side:"long",idiosyncraticVolatility:[],overrides:forecastsAt(archive,21,tickers,date,dates).values}),objective:"Maximum Sharpe",returnInputKind:"forecasts",covariance:[[.04,0],[0,.04]],longOnly:true,net:1,gross:1,positionCap:1,turnoverCap:null,changeCap:null,locked:[],exposures:[]}));}
  const original=header+"\nA,"+dates[1]+",21,12";
  const a=await run(original),b=await run(original+"\nB,"+dates[2]+",21,80");
  assert.match(b.events[0].status,/no active/);
  assert.equal(b.events[1].decisionDate,dates[1]);assert.equal(b.events[1].executionDate,dates[2]);
  assert.deepEqual(a.events.slice(0,2),b.events.slice(0,2));assert.deepEqual(a.curve.slice(0,3),b.curve.slice(0,3));
  assert.ok(b.events.some(e=>e.decisionDate===dates[2]&&e.executionDate===dates[3]&&e.weights[1]>.8));
  await assert.rejects(()=>run(header+"\nB,"+dates.at(-1)+",21,80"),/No decision had an active/);
});

test("one holdings file can carry multiple forecast dates without doubling capital",()=>{
  const header="ticker,market_value,as_of,annual_excess_return_pct,horizon_sessions";
  const text=header+"\nA,1000,2026-03-02,8,21\nA,,2026-03-03,-3,21\nCASH,200,,,";
  const imported=parseHoldingsBundle(text,"t","id");
  assert.equal(imported.book.count,2);assert.equal(imported.holdings.reduce((s,h)=>s+h.value,0),1200);
  assert.throws(()=>parseHoldingsBundle(text.replace("A,,","A,1000,"),"t","id"),/only once/);
  assert.throws(()=>parseHoldingsBundle(text.replace("2026-03-03","2026-03-02"),"t","id"),/Duplicate/);
});
