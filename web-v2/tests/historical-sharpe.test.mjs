import test from 'node:test';
import assert from 'node:assert/strict';
import {historicalSharpe} from '../lib/historical-sharpe.ts';
import {replayStatistics} from '../lib/comparison-portfolio.ts';
import {buildHoldingsOverview} from '../lib/portfolio-overview.ts';
const dates=Array.from({length:45},(_,i)=>new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10));
const prices=[100],cash=[100];for(let i=1;i<dates.length;i++){prices.push(prices.at(-1)*(1+.002+.01*Math.sin(i)));cash.push(cash.at(-1)*(1+.0002+.00002*Math.cos(i)));}
const series=(ticker,values)=>({requested:ticker,symbol:ticker,currency:'USD',exchange:'',instrumentType:'ETF',points:dates.map((date,i)=>({date,close:values[i]}))});
const payload={series:{AAA:series('AAA',prices),SPY:series('SPY',prices),BIL:series('BIL',cash)},errors:[],missingHoldings:[],asOf:dates.at(-1),source:'test',frequency:'Daily',adjusted:true};
test('all historical displays use identical cash-adjusted arithmetic Sharpe',()=>{
 const result=buildHoldingsOverview(payload,[{ticker:'AAA',value:100}],dates[0],dates.at(-1));assert.ok(result);
 const a=result.analytics,returns=a.dailyReturns;
 const excess=returns.map((r,i)=>r-(cash[i+1]/cash[i]-1));const mean=excess.reduce((s,r)=>s+r,0)/excess.length;const sd=Math.sqrt(excess.reduce((s,r)=>s+(r-mean)**2,0)/(excess.length-1));
 assert.ok(Math.abs(result.sharpe-Math.sqrt(252)*mean/sd)<1e-10);
 assert.equal(replayStatistics(a.dates,returns,a.totalReturn,payload).sharpe,result.sharpe);
 assert.notEqual(result.sharpe,Math.sqrt(252)*returns.reduce((a,b)=>a+b,0)/returns.length/sd);
});
test('cash gaps, nonfinite values and zero differential risk never fall back to zero rates',()=>{
 const r=prices.slice(1).map((p,i)=>p/prices[i]-1);
 assert.equal(historicalSharpe(dates,r),null);
 assert.equal(historicalSharpe(dates,r,{...payload,series:{BIL:{points:payload.series.BIL.points.slice(1)}}}),null);
 assert.equal(historicalSharpe(dates,cash.slice(1).map((p,i)=>p/cash[i]-1),payload),null);
 assert.equal(historicalSharpe(dates,[NaN,...r.slice(1)],payload),null);
});
