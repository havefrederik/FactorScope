import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonHistory, historyWindow } from '../lib/comparison-history.ts';
import { buildCoverageOverview } from '../lib/portfolio-overview.ts';
import { buildExamplePortfolio } from '../lib/example-portfolio.ts';
import { historicalSharpe } from '../lib/historical-sharpe.ts';
import { replayStatistics } from '../lib/comparison-portfolio.ts';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
function fixture(n=90){
 const dates=Array.from({length:n},(_,i)=>new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10));
 const series=Object.fromEntries(['A','B','SPY','BIL'].map((t,j)=>[t,{points:dates.map((date,i)=>({date,close:100*Math.exp(i*(j===3?.0001:.001*(j+1))+(j===3?0:Math.sin(i*(j+1))*.015))}))}]));
 const p={series,asOf:dates.at(-1)};
 const coverage=[{date:dates[0],tickers:['A']},{date:dates[10],tickers:['A','B']},{date:dates.at(-1),tickers:['A','B']}];
 return {p,dates,h:buildCoverageOverview(p,coverage,dates[0],dates.at(-1))};
}
test('unchanged AI comparison reproduces overview returns, Sharpe and dates, including changing coverage',()=>{
 const {p,h,dates}=fixture(); const current={A:.5,B:.5};
 const r=comparisonHistory(p,h,'daily',current,current,dates[0],dates.at(-1),100);
 assert.deepEqual(r.curve,h.analytics.curve); assert.deepEqual(r.dailyReturns,h.analytics.dailyReturns);
 assert.equal(replayStatistics(r.dates,r.dailyReturns,r.totalReturn,p).sharpe,h.sharpe);
 near(r.annualVolatility,h.analytics.annualVolatility); near(r.maxDrawdown,h.analytics.maxDrawdown);
});
test('daily alternative uses dated coverage at the prior close, separate signed budgets and daily rebalancing',()=>{
 const {p,h,dates}=fixture();
 const r=comparisonHistory(p,h,'daily',{A:.5,B:.5},{A:.8,B:.2},dates[0],dates.at(-1),100);
 let wealth=1; const expected=[1];
 for(let i=1;i<dates.length;i++){
  const a=p.series.A.points[i].close/p.series.A.points[i-1].close-1,b=p.series.B.points[i].close/p.series.B.points[i-1].close-1;
  wealth*=1+(i<=10?a:.8*a+.2*b);expected.push(wealth);
 }
 expected.forEach((v,i)=>near(r.curve[i],v));
 const signed=comparisonHistory(p,h,'daily',{A:.5,B:.5},{A:.8,B:-.2},dates[0],dates.at(-1),100);
 const i=20,a=p.series.A.points[i].close/p.series.A.points[i-1].close-1,b=p.series.B.points[i].close/p.series.B.points[i-1].close-1;
 near(signed.dailyReturns[i-1],.8*a-.2*b);
 // Before B is eligible its short sleeve remains in cash; no short-return backfill.
 near(signed.dailyReturns[0],.8*(p.series.A.points[1].close/p.series.A.points[0].close-1));
});
test('cash, missing required prices, new names and insolvency cannot fabricate a history',()=>{
 const {p,h,dates}=fixture();
 const cash=comparisonHistory(p,h,'daily',{A:.5,B:.5},{A:0,B:0},dates[0],dates.at(-1),100);
 assert.ok(cash.curve.every(v=>v===1));
 const bad=structuredClone(p);bad.series.B.points.splice(25,1);
 assert.throws(()=>comparisonHistory(bad,h,'daily',{A:.5,B:.5},{A:.7,B:.3},dates[0],dates.at(-1),100),/Missing price/);
 assert.throws(()=>comparisonHistory(p,h,'daily',{A:.5,B:.5},{A:.5,C:.5},dates[0],dates.at(-1),100),/outside/);
 const collapse=structuredClone(p);collapse.series.A.points[1].close=.01;
 assert.throws(()=>comparisonHistory(collapse,h,'daily',{A:.5,B:.5},{A:2,B:0},dates[0],dates.at(-1),100),/exhausts/);
});
test('date changes slice the same history without resetting positions or borrowing later observations',()=>{
 const {p,h,dates}=fixture();const w={A:.75,B:.25};
 const full=comparisonHistory(p,h,'daily',{A:.5,B:.5},w,dates[0],dates.at(-1),100);
 const slice=comparisonHistory(p,h,'daily',{A:.5,B:.5},w,dates[20],dates[40],100);
 assert.deepEqual(slice,historyWindow(full,dates[20],dates[40],100));
 near(historicalSharpe(slice.dates,slice.dailyReturns,p),replayStatistics(slice.dates,slice.dailyReturns,slice.totalReturn,p).sharpe);
 assert.equal(historyWindow(full,dates[20],dates[20]),null);
});
test('monthly comparison preserves baseline costs and uses alternative turnover at the original monthly dates',()=>{
 const {p,dates}=fixture(100);const h=buildExamplePortfolio(p,['A','B'],dates[0],dates.at(-1),10);
 const last=h.rebalances.at(-1).targets,current=Object.fromEntries(h.tickers.map((t,i)=>[t,last[i]]));
 const same=comparisonHistory(p,h,'monthly',current,current,h.analytics.startDate,h.analytics.endDate,100,10);
 assert.deepEqual(same.curve,h.analytics.curve);
 const proposed={A:current.A*.7,B:current.B*1.3};
 const costed=comparisonHistory(p,h,'monthly',current,proposed,h.analytics.startDate,h.analytics.endDate,100,10);
 const gross=comparisonHistory(p,h,'monthly',current,proposed,h.analytics.startDate,h.analytics.endDate,100,0);
 assert.ok(costed.totalReturn<gross.totalReturn);
 assert.deepEqual(costed.dates,same.dates);
 // No turnover charge on a session that is not a rebalance.
 near(costed.dailyReturns[5],gross.dailyReturns[5]);
});
