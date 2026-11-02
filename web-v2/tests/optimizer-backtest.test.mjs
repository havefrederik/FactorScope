import test from 'node:test';import assert from 'node:assert/strict';
import {backtestOptimizer} from '../lib/optimizer-backtest.ts';
const dates=['2026-01-29','2026-01-30','2026-02-02','2026-02-03','2026-02-04'];
const payload={asOf:dates.at(-1),series:Object.fromEntries(['SPY','BIL','A','B'].map(t=>[t,{points:dates.map((date,i)=>({date,close:t==='A'?[100,110,121,133.1,146.41][i]:100}))}]))};
const policy={interval:'Monthly',trigger:'Interval',drift:.02,volatility:.3,costBps:0,costGate:false,riskAversion:3,horizon:21,borrowRate:0,financingRate:0};
const input=(date,current)=>({covariance:[[.01,0],[0,.09]],current,objective:'Minimum volatility',longOnly:true,net:1,gross:1,positionCap:1,turnoverCap:null,changeCap:null,locked:[],exposures:[]});
test('dated decisions execute at next close; monthly and once schedules differ',async()=>{
 const seen=[];const r=await backtestOptimizer(payload,['A','B'],dates[0],dates.at(-1),[.5,.5],policy,(d,w)=>{seen.push(d);return input(d,w)});
 assert.deepEqual(seen,[dates[0],dates[2]]);assert.equal(r.events[0].decisionDate,dates[0]);assert.equal(r.events[0].executionDate,dates[1]);assert.ok(Math.abs(r.curve[1]-1.05)<1e-10);
 const once=await backtestOptimizer(payload,['A','B'],dates[0],dates.at(-1),[.5,.5],{...policy,interval:'Once'},input);assert.equal(once.decisions,1);
});
test('future price changes cannot change preceding trades',async()=>{
 const changed=structuredClone(payload);changed.series.A.points.at(-1).close=500;
 const a=await backtestOptimizer(payload,['A','B'],dates[0],dates.at(-1),[.5,.5],policy,input),b=await backtestOptimizer(changed,['A','B'],dates[0],dates.at(-1),[.5,.5],policy,input);
 assert.deepEqual(a.events,b.events);assert.deepEqual(a.curve.slice(0,-1),b.curve.slice(0,-1));
});
test('execution costs reduce wealth and risk-only cost gate can reject a trade',async()=>{
 const a=await backtestOptimizer(payload,['A','B'],dates[0],dates.at(-1),[.5,.5],policy,input);
 const b=await backtestOptimizer(payload,['A','B'],dates[0],dates.at(-1),[.5,.5],{...policy,costBps:100},input);assert.ok(b.curve.at(-1)<a.curve.at(-1));assert.ok(b.totalCosts>0);
 const c=await backtestOptimizer(payload,['A','B'],dates[0],dates.at(-1),[.5,.5],{...policy,costBps:1000,costGate:true},input);assert.ok(c.events.every(e=>e.status==='Skipped: cost gate'));assert.equal(c.totalCosts,0);
});
test('weight-drift and volatility rules can trigger outside the interval',async()=>{
 for(const trigger of ['Weight drift','Volatility ceiling']){const r=await backtestOptimizer(payload,['A','B'],dates[0],dates.at(-1),[.5,.5],{...policy,interval:'Quarterly',trigger,drift:.001,volatility:.001},input);assert.equal(r.decisions,trigger==='Weight drift'?2:4);}
});
test('minimum holding time blocks interval and threshold trades until execution spacing is met',async()=>{
 for(const trigger of ['Interval','Volatility ceiling','Interval or threshold']){
  const r=await backtestOptimizer(payload,['A','B'],dates[0],dates.at(-1),[.5,.5],{...policy,interval:'Daily',trigger,volatility:0,minHoldingSessions:3},input);
  const trades=r.events.filter(e=>e.status==='Traded');assert.equal(trades.length,2);assert.equal(trades[0].executionDate,dates[1]);assert.equal(trades[1].executionDate,dates[4]);assert.equal(r.holdingChecksSkipped,2);
 }
});
test('custom interval is measured in sessions, unaffected by weekend and month changes',async()=>{
 const seen=[];await backtestOptimizer(payload,['A','B'],dates[0],dates.at(-1),[.5,.5],{...policy,interval:'Every N sessions',intervalSessions:3},(d,w)=>{seen.push(d);return input(d,w)});assert.deepEqual(seen,[dates[0],dates[3]]);
});
test('a rejected trade does not start a holding lock and invalid session counts fail',async()=>{
 const r=await backtestOptimizer(payload,['A','B'],dates[0],dates.at(-1),[.5,.5],{...policy,interval:'Daily',costGate:true,costBps:1000,minHoldingSessions:21},input);assert.equal(r.decisions,4);assert.equal(r.holdingChecksSkipped,0);
 for(const minHoldingSessions of [-1,1.5,NaN])await assert.rejects(()=>backtestOptimizer(payload,['A','B'],dates[0],dates.at(-1),[.5,.5],{...policy,minHoldingSessions},input),/whole trading-session/);
});
