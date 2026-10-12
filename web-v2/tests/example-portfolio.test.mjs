import assert from "node:assert/strict";
import test from "node:test";
import { buildExamplePortfolio, exampleHoldingsSnapshot } from "../lib/example-portfolio.ts";

function fixture(){
  const dates=[];for(let d=new Date('2024-12-31T00:00:00Z');d<=new Date('2025-03-10T00:00:00Z');d.setUTCDate(d.getUTCDate()+1))if(d.getUTCDay()%6)dates.push(d.toISOString().slice(0,10));
  const universe=Array.from({length:22},(_,i)=>`S${String(i).padStart(2,'0')}`);
  const series=Object.fromEntries([...universe,'SPY'].map((ticker,k)=>{let close=100;return[ticker,{requested:ticker,symbol:ticker,currency:'USD',exchange:'US',instrumentType:'EQUITY',points:dates.map((date,i)=>{close*=1+.001+(date.startsWith('2025-02')?22-k:k)*.00015+Math.sin(i*1.7+k)*.001;return{date,close};})}];}));
  return {universe,payload:{series,asOf:dates.at(-1),source:'test',frequency:'daily',adjusted:true,errors:[],missingHoldings:[]}};
}
const near=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
test('annual return compounds back to total return over the exact displayed dates',()=>{
 const {payload,universe}=fixture();const r=buildExamplePortfolio(payload,universe,'2025-01-01','2025-03-10',5);
 const years=(Date.parse(r.analytics.endDate)-Date.parse(r.analytics.startDate))/(365.25*86400000);
 near((1+r.annualReturn)**years,1+r.analytics.totalReturn);
});
test('risk snapshots use the actual dated holdings, retain cash and never select a future record',()=>{
 const {payload,universe}=fixture();const r=buildExamplePortfolio(payload,universe,'2025-01-01','2025-03-10',5);
 for(const date of ['2025-01-15','2025-01-18','2025-02-28']){
  const snapshot=exampleHoldingsSnapshot(r,date);assert.ok(snapshot.date<=date);
  const day=r.days.findLast(d=>d.date<=date);assert.equal(snapshot.date,day.date);
  near(snapshot.holdings.reduce((s,h)=>s+h.value,0),day.nav);
  for(const h of snapshot.holdings)near(h.value,h.ticker==='CASH'?day.cash:day.values[r.tickers.indexOf(h.ticker)]);
 }
 assert.equal(exampleHoldingsSnapshot(r,'2024-01-01'),null);
});
test('same-month ranking picks twenty names, caps starting weights, retains daily holdings and excludes incomplete month',()=>{
 const {payload,universe}=fixture();const result=buildExamplePortfolio(payload,universe,'2025-01-01','2025-03-10',0,1);
 assert.equal(result.rebalances.length,2);assert.equal(result.analytics.endDate,'2025-02-28');
 for(const reb of result.rebalances){assert.equal(reb.targets.filter(Boolean).length,20);assert.ok(reb.targets.every(w=>w===0||w===.05));const chosen=reb.scores.filter((s,j)=>reb.targets[j]>0),omitted=reb.scores.filter((s,j)=>!reb.targets[j]);assert.ok(Math.min(...chosen)>=Math.max(...omitted));}
 for(const d of result.days)near(d.values.reduce((a,b)=>a+b,0)+d.cash,d.nav);
 assert.ok(result.days.some(d=>d.values.some(v=>v/d.nav>.05)),'daily weights drift above starting cap');
 const first=result.days[1],reb=result.rebalances[0];let expected=0;
 result.tickers.forEach((ticker,j)=>{expected+=reb.targets[j]*1e6*payload.series[ticker].points[1].close/payload.series[ticker].points[0].close;});near(first.nav,expected);
});
test('default allocation is diversified, fully budgeted and capped at 5% per stock',()=>{
 const {payload,universe}=fixture();const result=buildExamplePortfolio(payload,universe,'2025-01-01','2025-03-10',0);
 for(const reb of result.rebalances){assert.equal(reb.targets.filter(Boolean).length,22);near(reb.targets.reduce((a,b)=>a+b,0),1);assert.ok(reb.targets.every(w=>w>=0&&w<=.05+1e-12));}
 for(const d of result.days)near(d.values.reduce((a,b)=>a+b,0)+d.cash,d.nav);
});
test('transaction costs reconcile to both sides of trades and lower initial funded holdings',()=>{
 const {payload,universe}=fixture();const r=buildExamplePortfolio(payload,universe,'2025-01-01','2025-03-10',5);
 for(const reb of r.rebalances)near(reb.cost,reb.traded*.0005);
 near(r.rebalances[0].cost,1e6-1e6/1.0005);near(r.totalCosts,r.rebalances.reduce((s,r)=>s+r.cost,0));
 assert.ok(r.analytics.totalReturn<buildExamplePortfolio(payload,universe,'2025-01-01','2025-03-10',0).analytics.totalReturn);
});
test('missing monthly observations exclude securities and unused 5% slots remain cash',()=>{
 const {payload,universe}=fixture();for(const ticker of universe.slice(0,5))payload.series[ticker].points=payload.series[ticker].points.filter(p=>p.date!=='2025-01-15');
 const r=buildExamplePortfolio(payload,universe,'2025-01-01','2025-03-10',0);
 assert.equal(r.rebalances[0].eligible,17);near(r.days[1].cash,150000);
 const original=r.rebalances[0].targets;for(const ticker of universe)payload.series[ticker].points.filter(p=>p.date.startsWith('2025-02')).forEach(p=>p.close*=2);
 assert.deepEqual(buildExamplePortfolio(payload,universe,'2025-01-01','2025-03-10',0).rebalances[0].targets,original);
});
