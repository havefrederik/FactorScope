import test from 'node:test';
import assert from 'node:assert/strict';
import {portfolioRiskSummary} from '../lib/portfolio-risk-summary.ts';
import {academicRisk} from '../lib/academic-factors.ts';
import {constructionMeasures} from '../lib/portfolio-construction.ts';
import {optimizePortfolio} from '../lib/portfolio-optimizer.ts';
const close=(a,b,t=1e-10)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const model={asOf:'2026-09-30',tickers:['A','B'],forecastSessions:5,covarianceMatrix:[[.05,.02],[.02,.03]],riskBreakdown:{common:[[.04,.02],[.02,.01]],residual:[[.01,0],[0,.02]]},marketBetas:[1.2,.8]};

test('long/short forecast shares, beta contributions and capital/gross units reconcile',()=>{
 const weights={A:1,B:-1},capital=1e6,a=portfolioRiskSummary(model,weights,capital),b=portfolioRiskSummary(model,weights,capital,'gross');
 close(a.net,0);close(a.gross,2);close(a.beta,.4);close(a.longBeta,1.2);close(a.shortBeta,-.8);close(a.longBeta+a.shortBeta,a.beta);
 close(a.dollarBeta,400000,1e-6);close(a.commonShare,.25);close(a.residualShare,.75);close(a.commonShare+a.residualShare,1);
 close(a.volatility,.2*Math.sqrt(5/252));close(a.dollarRisk,a.volatility*capital);close(b.volatility,a.volatility/2);close(b.beta,a.beta/2);
 close(b.dollarBeta,a.dollarBeta);close(b.dollarRisk,a.dollarRisk);close(b.gross,1);close(b.short,-.5);close(a.effectivePositions,2);
 close(b.commonShare,a.commonShare);close(b.topFiveRisk,a.topFiveRisk);close(b.effectivePositions,a.effectivePositions);
 close(a.contributors.reduce((s,p)=>s+p.riskShare,0),1);
});
test('cash and unavailable factor or beta metadata cannot create false precision',()=>{
 const cash=portfolioRiskSummary(model,{},1e6),gross=portfolioRiskSummary(model,{},1e6,'gross');
 assert.equal(cash.volatility,0);assert.equal(cash.positions,0);assert.equal(cash.effectivePositions,0);assert.equal(cash.commonShare,null);assert.equal(cash.topFiveRisk,null);
 assert.equal(gross.volatility,null);assert.equal(gross.beta,null);assert.equal(gross.dollarRisk,0);
 const direct=portfolioRiskSummary({...model,riskBreakdown:undefined,marketBetas:undefined},{A:1},1e6);
 assert.equal(direct.beta,null);assert.equal(direct.commonShare,null);assert.ok(direct.volatility>0);
});
test('coverage, nonfinite values and inconsistent decomposition are rejected',()=>{
 for(const weights of [{A:NaN},{C:.1}])assert.throws(()=>portfolioRiskSummary(model,weights,1e6));
 assert.throws(()=>portfolioRiskSummary(model,{A:1},0));
 assert.throws(()=>portfolioRiskSummary({...model,marketBetas:[1]},{A:1},1e6));
 assert.throws(()=>portfolioRiskSummary({...model,covarianceMatrix:[[.07,.02],[.02,.03]]},{A:1},1e6),/reconcile/);
 assert.throws(()=>portfolioRiskSummary({...model,covarianceMatrix:[[NaN,0],[0,.01]]},{A:1},1e6));
});
test('hedging variance shares retain negative contributions rather than clipping',()=>{
 const a=portfolioRiskSummary({...model,covarianceMatrix:[[.04,.03],[.03,.04]],riskBreakdown:undefined},{A:1,B:-.2},100);
 assert.ok(a.contributors.find(p=>p.ticker==='B').riskShare<0);close(a.topFiveRisk,1);
});
test('summary before/after matches optimizer and decision-review volatility without changing inputs',()=>{
 const original=structuredClone(model),weights={A:.5,B:.5};
 const solved=optimizePortfolio({covariance:model.covarianceMatrix,current:[.5,.5],objective:'Minimum volatility',longOnly:true,net:1,gross:1,positionCap:1,turnoverCap:null,changeCap:null,locked:[],exposures:[]});
 assert.equal(solved.status,'Solved');
 const after=Object.fromEntries(model.tickers.map((t,i)=>[t,solved.weights[i]])),summary=portfolioRiskSummary(model,after,1e6);
 close(summary.annualVolatility,solved.volatility);close(portfolioRiskSummary(model,weights,1e6).annualVolatility,solved.currentVolatility);
 close(summary.annualVolatility,constructionMeasures({forecast:model,factors:[],expectedReturns:null},after).volatility);assert.deepEqual(model,original);
});

function fixture(){
 const rows=Array.from({length:500},(_,i)=>({date:new Date(Date.UTC(2024,0,i+1)).toISOString().slice(0,10),rf:.0001,values:Array.from({length:6},(_,k)=>.005*Math.sin((i+1)*(k+1)*.27)+.001*Math.cos((i+1)*.39))}));
 const series=Object.fromEntries(Array.from({length:4},(_,a)=>{let price=100;return [`S${a}`,{points:rows.map((r,t)=>({date:r.date,close:price*=1+r.rf+r.values.reduce((s,v,k)=>s+v*(a-k)*.2,0)+.002*Math.sin(t*(a+1)*.41)}))}];}));
 return {payload:{series},base:{asOf:rows.at(-1).date,tickers:Object.keys(series)},data:{source:'test',through:rows.at(-1).date,names:['Market','Size','Value','Profit','Investment','Mom'],rows}};
}
test('factor risk blocks reconcile for selected PCA, horizons, weighting and manual shrinkage',()=>{
 const {payload,base,data}=fixture(),weights={S0:.4,S1:.4,S2:.4,S3:-.2};
 for(const weighting of ['Equal-weight','Responsive'])for(const sessions of [1,5,21])for(const selected of [[],[0]])for(const shrinkage of [null,0,1]){
  const {forecast}=academicRisk(payload,base,Object.values(weights),data,undefined,selected,shrinkage,{sessions,weighting});
  const s=portfolioRiskSummary(forecast,weights,100);close(s.commonShare+s.residualShare,1);assert.ok(s.commonShare>=-1e-10&&s.residualShare>=-1e-10);
  assert.ok(Number.isFinite(s.beta));close(s.beta,s.longBeta+s.shortBeta);
 }
 const omitted=academicRisk(payload,base,Object.values(weights),data,[1,2,3],[],null).forecast;
 assert.equal(portfolioRiskSummary(omitted,weights,100).beta,null);
 const noFactors=academicRisk(payload,base,Object.values(weights),data,[],[],null).forecast;
 close(portfolioRiskSummary(noFactors,weights,100).residualShare,1);
});
test('market-only model beta equals the loading, with correct stock order and no future leakage',()=>{
 const {payload,base,data}=fixture();base.asOf=data.rows[400].date;
 const a=academicRisk(payload,base,[.2,.2,.3,.3],data,[0],[],null);
 a.forecast.marketBetas.forEach((b,i)=>close(b,a.factors[0].values[i]));
 const changed=structuredClone(payload),f=structuredClone(data);
 Object.values(changed.series).forEach(s=>s.points.forEach(p=>{if(p.date>base.asOf)p.close*=3}));f.rows.forEach(r=>{if(r.date>base.asOf)r.values.fill(100)});
 assert.deepEqual(a,academicRisk(changed,base,[.2,.2,.3,.3],f,[0],[],null));
});
