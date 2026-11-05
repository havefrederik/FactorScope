import test from 'node:test';
import assert from 'node:assert/strict';
import {weightedHac,responsiveCovariance,tradingFactorCovariance,horizonVolatility,validateForecastOptions} from '../lib/forecast-horizon.ts';
import {academicRisk} from '../lib/academic-factors.ts';
import {optimizePortfolio} from '../lib/portfolio-optimizer.ts';
import {calibrateRisk} from '../lib/forecast-calibration.ts';
const close=(a,b,t=1e-10)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);

test('HAC matches independent full time-kernel multiplication and stays positive semidefinite',()=>{
 const x=Array.from({length:4},(_,i)=>Array.from({length:90},(_,t)=>Math.sin(t*.13+i)+Math.cos(t*(i+1)*.41)));
 for(const h of [1,5,21])for(const L of [1,3]){
  const half=20,n=x[0].length,raw=Array.from({length:n},(_,t)=>2**(-(n-1-t)/half)),w=raw.map(v=>v/raw.reduce((a,b)=>a+b,0));
  const z=x.map(row=>{const m=dot(row,w);return row.map((v,t)=>(v-m)*Math.sqrt(w[t]));});
  const actual=weightedHac(x,half,L,h);
  for(let i=0;i<4;i++)for(let j=0;j<4;j++){
   let expected=0;
   for(let t=0;t<n;t++)for(let s=0;s<n;s++){
    const k=Math.abs(t-s),kernel=Math.max(0,1-k/(L+1))*Math.max(0,1-k/h);
    expected+=z[i][t]*z[j][s]*kernel;
   }
   close(actual[i][j],expected);close(actual[i][j],actual[j][i]);
  }
  for(let q=0;q<30;q++){const weights=x.map((_,i)=>Math.sin(q+i*3));assert.ok(dot(weights,actual.map(row=>dot(row,weights)))>=-1e-12);}
 }
 close(weightedHac([[-1,0,1]],Infinity,2,5)[0][0],8/15);
});

test('finite-horizon autocorrelation changes daily-equivalent risk; zero lag is pure scaling',()=>{
 const x=[Array.from({length:252},(_,t)=>.01*Math.sin(t*.1)),Array.from({length:252},(_,t)=>.01*Math.cos(t*2))];
 const one=responsiveCovariance(x,1,3),five=responsiveCovariance(x,5,3);
 assert.ok(five[0][0]>one[0][0]);assert.ok(five[1][1]<one[1][1]);
 assert.deepEqual(weightedHac(x,20,0,1),weightedHac(x,20,0,21));
 close(horizonVolatility(.2,5)/horizonVolatility(.2,1),Math.sqrt(5));
 for(const bad of [0,2,NaN])assert.throws(()=>validateForecastOptions({sessions:bad,weighting:'Responsive'}));
 assert.throws(()=>weightedHac([[1,NaN]],20,3,5));
});

test('constant-covariance horizon scaling does not manufacture different minimum-risk weights',()=>{
 const options={current:[.5,.5],objective:'Minimum volatility',longOnly:true,net:1,gross:1,positionCap:1,turnoverCap:null,changeCap:null,locked:[],exposures:[]};
 const a=optimizePortfolio({...options,covariance:[[.04,.01],[.01,.16]]}),b=optimizePortfolio({...options,covariance:[[.2,.05],[.05,.8]]});
 assert.equal(a.status,'Solved');assert.equal(b.status,'Solved');a.weights.forEach((w,i)=>close(w,b.weights[i],2e-5));
});

test('factor forecast handles zero factors, all-cash weights, singular specific panels and signed portfolios',()=>{
 const n=252,zero=Array(n).fill(0),x=Array.from({length:n},(_,i)=>.01*Math.sin(i*.2));
 const risk=tradingFactorCovariance([[],[]],[],[zero,zero],[x,zero],[[.0001,0],[0,0]],5);
 assert.ok(risk.covariance.flat().every(Number.isFinite));assert.equal(risk.covariance[1][1],0);assert.ok(risk.covariance[0][0]>0);
});

function fixture(){
 const dates=Array.from({length:1100},(_,i)=>new Date(Date.UTC(2020,0,i+1)).toISOString().slice(0,10));
 const rows=dates.map((date,i)=>({date,rf:.0001,values:Array.from({length:6},(_,j)=>.005*Math.sin(i*(j+1)*.23)+.001*Math.cos(i*(j+1)*.37))}));
 const series=Object.fromEntries(Array.from({length:4},(_,j)=>{let price=100;return [`S${j}`,{points:rows.map((r,i)=>({date:r.date,close:price*=1+r.rf+dot(r.values,r.values.map((_,k)=>(j-k)*.3))+.001*Math.cos(i*(j+1)*.41)}))}];}));
 return {payload:{series},data:{source:'test',through:dates.at(-1),names:['M','S','V','P','I','Mom'],rows},base:{asOf:dates[1050],tickers:Object.keys(series)},weights:[.3,.4,.5,-.2]};
}
test('dated responsive factor forecasts exclude future prices and future factor observations',()=>{
 const {payload,data,base,weights}=fixture();
 for(const selected of [[],[0]])for(const sessions of [1,5,21]){
  const options={sessions,weighting:'Responsive'},a=academicRisk(payload,base,weights,data,undefined,selected,null,options);
  const future=structuredClone(payload),factors=structuredClone(data);
  Object.values(future.series).forEach(s=>s.points.forEach(p=>{if(p.date>base.asOf)p.close*=100}));
  factors.rows.forEach(r=>{if(r.date>base.asOf)r.values=r.values.map(v=>v+100)});
  assert.deepEqual(a,academicRisk(future,base,weights,factors,undefined,selected,null,options));
  assert.equal(a.forecast.factorRiskObservations,1008);assert.equal(a.forecast.forecastSessions,sessions);
  for(let q=0;q<30;q++){const w=weights.map((_,i)=>Math.sin(q+i));assert.ok(dot(w,a.forecast.covarianceMatrix.map(row=>dot(row,w)))>=-1e-12);}
 }
 const a=academicRisk(payload,base,weights,data,undefined,[],null,{sessions:1,weighting:'Equal-weight'}),b=academicRisk(payload,base,weights,data,undefined,[],null,{sessions:5,weighting:'Equal-weight'});
 assert.deepEqual(a.forecast.covarianceMatrix,b.forecast.covarianceMatrix);
});

test('forecast validation uses only subsequent, complete, non-overlapping intervals and matching RF',()=>{
 const dates=Array.from({length:13},(_,i)=>String(i)),returns=[Array.from({length:12},(_,i)=>i/100)];
 const checks=Array.from({length:12},(_,index)=>({index,sessions:5,weights:[1],annualVariance:.04,excess:true}));
 const r=calibrateRisk(checks,dates,returns,Array(12).fill(.001));
 assert.deepEqual(r.windows.map(w=>[w.asOf,w.through]),[['0','5'],['5','10']]);assert.equal(r.bias,null);
 close(r.windows[0].realizedReturn,.095);close(r.windows[1].realizedReturn,.345);
 close(r.windows[0].predictedVolatility,Math.sqrt(.04*5/252));
 assert.throws(()=>calibrateRisk(checks,dates,returns,[]),/complete/);
 const z=Array.from({length:21},(_,i)=>(i%2?1:-1)*Math.sqrt(20/21));
 const c=calibrateRisk(z.map((_,index)=>({index,sessions:1,weights:[1],annualVariance:252,excess:false})),Array.from({length:22},(_,i)=>String(i)),[z],[]);
 assert.equal(c.windows.length,21);assert.ok(c.bias>.9&&c.bias<1.1);
});
