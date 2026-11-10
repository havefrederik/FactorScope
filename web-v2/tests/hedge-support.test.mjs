import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultHedgeSettings,sizeHedge,hedgeSnapshot,weightsWithHedge,validateHedges,validationStart} from '../lib/hedge-support.ts';
const settings={...defaultHedgeSettings,candidates:['SPY','IWM'],maxWeight:1,forecast:{sessions:5,weighting:'Responsive'}};
const near=(a,b,tol=1e-10)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
function fixture(n=330){
 const dates=[];for(let d=new Date('2023-01-02');dates.length<n;d.setUTCDate(d.getUTCDate()+1))if(d.getUTCDay()>0&&d.getUTCDay()<6)dates.push(d.toISOString().slice(0,10));
 const rows=dates.map((date,i)=>({date,values:Array.from({length:6},(_,k)=>.004*Math.sin(i*(.07+.113*k)+k)+.002*Math.cos(i*(.17+.049*k))),rf:.0001}));
 const series={};for(const [j,t] of ['A','SPY','IWM'].entries()){let price=100;series[t]={requested:t,symbol:t,currency:'USD',exchange:'NYQ',instrumentType:'ETF',points:dates.map((date,i)=>{if(i)price*=1+rows[i].rf+rows[i].values[0]*(1+j*.2)+rows[i].values[1]*(j-.4)+.001*Math.sin(i*(.79+j*.29));return{date,close:price}})}}
 const payload={series,academicFactors:{source:'fixture',through:dates.at(-1),retrievedAt:'',names:['M','S','V','R','C','Mom'],rows},asOf:dates.at(-1),source:'fixture',frequency:'daily',adjusted:true,errors:[],missingHoldings:[]};
 const history={tickers:['A'],label:'Fixture dated history',days:dates.slice(252).map((date,j)=>{const nav=1000*series.A.points[j+252].close/series.A.points[252].close;return{date,nav,values:[nav],cash:0}})};
 return {dates,payload,history};
}
const fixedModel=(payload,w,date,s)=>{const ranked=s.candidates.map(t=>({ticker:t,weight:-.5,before:.2,after:.1,reduction:.1,correlation:.9,roundTripCost:0,borrowCost:0,atLimit:false}));return{weights:w,forecast:{tickers:['A','IWM','SPY'],covarianceMatrix:[[.04,.015,.015],[.015,.02,.01],[.015,.01,.02]]},ranked,spy:ranked.find(x=>x.ticker==='SPY')??ranked[0]}};
test('bounded single-ETF hedge matches the analytic minimum and reports gross effects without renormalizing the book',()=>{
 const matrix=[[.04,.006],[.006,.01]],h=sizeHedge(matrix,[1,0],1,settings);near(h.weight,-.6);near(h.after,Math.sqrt(.0364));assert.ok(!h.atLimit);
 const capped=sizeHedge(matrix,[1,0],1,{...settings,maxWeight:.25});near(capped.weight,-.25);assert.equal(capped.atLimit,true);assert.ok(capped.after>h.after);
 assert.deepEqual(weightsWithHedge({weights:{A:1,SPY:.1}},{ticker:'SPY',weight:-.3}),{A:1,SPY:-.19999999999999998});
});
test('zero and negative correlation, long permission, cash and invalid inputs are explicit',()=>{
 near(sizeHedge([[.04,0],[0,.01]],[1,0],1,settings).weight,0);
 const matrix=[[.04,-.006],[-.006,.01]];
 near(sizeHedge(matrix,[1,0],1,settings).weight,0);
 near(sizeHedge(matrix,[1,0],1,{...settings,direction:'both'}).weight,.6);
 near(sizeHedge(matrix,[1,0],1,{...settings,direction:'both',allowBorrowing:false}).weight,0);
 assert.throws(()=>sizeHedge(matrix,[1.3,0],1,{...settings,allowBorrowing:false}),/already borrows/);
 for(const maxWeight of [0,-1,NaN,1.1])assert.throws(()=>sizeHedge(matrix,[1,0],1,{...settings,maxWeight}));
 assert.throws(()=>sizeHedge(matrix,[1,0],1,{...settings,candidates:[]}));
 assert.throws(()=>sizeHedge([[NaN]],[1],0,settings));
});
test('joint FF + momentum forecast keeps all held assets and merges an ETF already held',()=>{
 const {payload,dates}=fixture();const s=hedgeSnapshot(payload,{A:.8,SPY:.2},dates[300],settings);
 assert.equal(s.forecast.tickers.filter(t=>t==='SPY').length,1);assert.equal(s.forecast.observations,252);assert.equal(s.forecast.forecastSessions,5);
 assert.ok(s.ranked.every(h=>h.after<=h.before+1e-10));assert.ok(s.forecast.shrinkage>=0&&s.forecast.shrinkage<=1);
 assert.throws(()=>hedgeSnapshot(payload,{MISSING:1},dates[300],settings),/align/);
});
test('future observations cannot change a dated hedge, including candidate selection',()=>{
 const {payload,dates}=fixture();const before=hedgeSnapshot(payload,{A:1},dates[280],settings),future=structuredClone(payload);
 for(const s of Object.values(future.series))for(const p of s.points)if(p.date>dates[280])p.close*=.5;
 for(const r of future.academicFactors.rows)if(r.date>dates[280]){r.values=r.values.map(v=>v*100);r.rf=.01;}
 const after=hedgeSnapshot(future,{A:1},dates[280],settings);assert.deepEqual(after.ranked,before.ranked);assert.deepEqual(after.forecast.covarianceMatrix,before.forecast.covarianceMatrix);
});
test('historical validation rebuilds from dated holdings and executes only at the following close',()=>{
 const {payload,history}=fixture();history.tickers=['A','IWM'];history.days.forEach((d,i)=>{d.values=i<20?[d.nav,0]:[0,d.nav]});
 const seen=[];const model=(p,w,date,s)=>{seen.push({w,date});return fixedModel(p,w,date,s)};
 const result=validateHedges(payload,history,{...settings,executionBps:0,shortBorrow:0,cashSpread:0},history.days[0].date,history.days.at(-1).date,'weekly',undefined,model);
 assert.ok(seen.some(x=>x.w.A===1));assert.ok(seen.some(x=>x.w.IWM===1));
 const d=result.decisions[0];assert.equal(d.decision,result.dates[0]);assert.equal(d.execution,result.dates[1]);near(result.curves[1][1],result.curves[0][1]);
 assert.ok(result.decisions.every(d=>d.execution>d.decision));assert.equal(result.metrics[0].trades,0);assert.ok(result.metrics[1].trades>0);assert.equal(result.metrics[1].sharpe!==null,true);
 assert.equal(result.curves[0].length,result.dates.length);assert.equal(result.curves[1].length,result.dates.length);
});
test('execution, borrow, RF cash and terminal liquidation reconcile independently',()=>{
 const {payload,history}=fixture(282);history.days.forEach(d=>{d.nav=1000;d.values=[1000]});for(const s of Object.values(payload.series))s.points.forEach(p=>p.close=100);
 const s={...settings,candidates:['SPY'],executionBps:5,shortBorrow:.01,cashSpread:.01};
 const r=validateHedges(payload,history,s,history.days[0].date,history.days.at(-1).date,'monthly',undefined,fixedModel);
 let cash=0,short=0,fees=0,borrow=0;const executions=new Map(r.decisions.map(d=>[d.execution,d]));
 for(let i=0;i<r.dates.length;i++){
   if(i){const days=(Date.parse(r.dates[i])-Date.parse(r.dates[i-1]))/86400000;const cost=short*.01*days/365.25;borrow+=cost;cash+=cash*.0001-cost;}
   if(executions.has(r.dates[i])){
     const d=executions.get(r.dates[i]),k=-d.weight,capital=1000+cash-short;
     // Independent piecewise closed-form for post-cost capital, short positions.
     const increasing=k*capital>=short;
     const target=k*(capital+(increasing?1:-1)*.0005*short)/(1+(increasing?1:-1)*.0005*k);
     const fee=Math.abs(target-short)*.0005;cash+=target-short-fee;fees+=fee;short=target;
     near(short/(1000+cash-short),k);
   }
   if(i===r.dates.length-1){cash-=short+short*.0005;fees+=short*.0005;short=0;}
   near(r.curves[1][i],(1000+cash-short)/1000);
 }
 near(r.metrics[1].executionCost,fees/1000);near(r.metrics[1].borrowCost,borrow/1000);assert.deepEqual(r.curves[1],r.curves[2]);
});
test('missing prices, broken portfolio reconciliation and invalid dates never yield a partial accepted run',()=>{
 const {payload,history}=fixture();const bad=structuredClone(payload);bad.series.IWM.points=bad.series.IWM.points.filter(p=>p.date!==history.days[3].date);
 assert.throws(()=>validateHedges(bad,history,settings,history.days[0].date,history.days.at(-1).date,'monthly'),/Incomplete IWM/);
 const broken=structuredClone(history);broken.days[8].cash=1;
 assert.throws(()=>validateHedges(payload,broken,settings,history.days[0].date,history.days.at(-1).date,'monthly'),/reconciled/);
 assert.throws(()=>validateHedges(payload,history,settings,history.days.at(-1).date,history.days[0].date,'monthly'),/valid validation/);
 assert.equal(validationStart(payload,history,settings,history.days[0].date,history.days.at(-1).date),history.days[0].date);
});
test('full rolling FF validation preserves decision causality when later returns are changed',()=>{
 const {payload,history}=fixture(295);const r=validateHedges(payload,history,settings,history.days[0].date,history.days.at(-1).date,'monthly');
 const future=structuredClone(payload),lastDecision=r.decisions[0].decision;
 for(const s of Object.values(future.series))for(const p of s.points)if(p.date>lastDecision)p.close*=1.02;
 const altered=validateHedges(future,history,settings,history.days[0].date,history.days.at(-1).date,'monthly');
 assert.deepEqual(altered.decisions[0],r.decisions[0]);assert.ok(r.quarterly.length>0);
});

test('selling an ETF already held incurs borrow only on the incremental net short',()=>{
 const matrix=[[.04,.02],[.02,.02]];const h=sizeHedge(matrix,[.5,.5],1,{...settings,maxWeight:.25});near(h.weight,-.25);near(h.borrowCost,0);
 assert.throws(()=>hedgeSnapshot(fixture().payload,{A:1,SPY:NaN},'2024-01-01',settings),/finite/);
});

test('all-cash history chooses no hedge and resumes only after a dated allocation',()=>{
 const {payload,history}=fixture(295);
 history.days.forEach((d,i)=>{if(i<8){d.values=[0];d.cash=d.nav;}});
 const cash=hedgeSnapshot(payload,{A:0},history.days[0].date,settings);
 assert.ok(cash.ranked.every(h=>h.weight===0&&h.before===0&&h.after===0&&h.correlation===null));
 const r=validateHedges(payload,history,settings,history.days[0].date,history.days.at(-1).date,'weekly');
 assert.equal(r.decisions[0].weight,0);
 assert.ok(r.decisions.some(d=>d.decision>=history.days[8].date&&d.weight<0));
 r.dates.slice(0,8).forEach((_,i)=>near(r.curves[1][i],r.curves[0][i]));
});
