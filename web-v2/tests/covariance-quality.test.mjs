import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCovarianceForecasts, gaussianLoss, scoreForecast, withCommonVolatility, qualityPanel, summarizeQuality, qualityModels } from '../lib/covariance-quality.ts';
import { buildIewmaExpertSnapshots } from '../lib/analytics.ts';
import { ledoitWolf } from '../lib/shrinkage-risk.ts';
import { academicRisk } from '../lib/academic-factors.ts';
const close=(a,b,tol=1e-10)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);

function fixture(n=561){
  let state=51;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32-.5};
  const dates=Array.from({length:n},(_,i)=>new Date(Date.UTC(2021,0,1+i)).toISOString().slice(0,10));
  const rows=dates.map(date=>({date,values:Array.from({length:6},()=>random()*.02),rf:.0001}));
  const series=Object.fromEntries(['A','B','C'].map((t,k)=>{let price=100;return[t,{points:dates.map((date,i)=>({date,close:price*=1+rows[i].values[0]*(k+.5)+random()*.02}))}]}));
  return {payload:{series,asOf:dates.at(-1),academicFactors:{names:['Mkt','SMB','HML','RMW','CMA','Mom'],rows,through:dates.at(-1),source:'test',retrievedAt:''}},tickers:['A','B','C'],weights:[.6,.6,-.2],asOf:dates.at(-1),sessions:5};
}

test('Gaussian covariance loss agrees with independent two-dimensional inverse/determinant formula',()=>{
  const matrix=[[.04,.012],[.012,.09]],r=[.1,-.2],det=.04*.09-.012**2;
  const quadratic=(.09*r[0]**2-2*.012*r[0]*r[1]+.04*r[1]**2)/det;
  close(gaussianLoss(matrix,r),(2*Math.log(2*Math.PI)+Math.log(det)+quadratic)/4);
  assert.throws(()=>gaussianLoss([[1,2],[2,1]],r),/positive definite/);
  assert.throws(()=>gaussianLoss([[1,.1],[.2,1]],r),/symmetric/);
  assert.throws(()=>gaussianLoss([[NaN]], [1]),/finite/);
});

test('Horizon and signed weights use the same covariance units for scoring and portfolio calibration',()=>{
  const c=[[.04,.01],[.01,.09]],r=[.1,-.02],w=[1.2,-.4],h=21;
  const s=scoreForecast(c,r,w,h),v=(1.2**2*.04+(-.4)**2*.09+2*1.2*(-.4)*.01)*h/252;
  close(s.predictedRisk,Math.sqrt(v));close(s.realizedReturn,.128);close(s.standardizedReturn,.128/Math.sqrt(v));
  close(s.loss,gaussianLoss(c.map(row=>row.map(v=>v/12)),r));
  assert.equal(scoreForecast(c,r,[0,0],h).standardizedReturn,null);
});

test('Evaluation windows follow 500 prior returns, never overlap, and drop the incomplete tail',()=>{
  const input=fixture(552),progress=[];
  const r=evaluateCovarianceForecasts(input,(done,total)=>progress.push([done,total]));
  const dates=qualityPanel(input).dates;
  assert.equal(r.points.length,10);assert.equal(r.points[0].asOf,dates[500]);assert.equal(r.points[0].through,dates[505]);
  assert.equal(r.endDate,dates[550]);assert.deepEqual(progress.at(-1),[10,10]);
  for(let i=1;i<r.points.length;i++)assert.equal(r.points[i].asOf,r.points[i-1].through);
  assert.ok(r.summaries.every(s=>s.count===10&&s.calibration===null&&s.coverage===null));
  assert.equal(r.summaries.find(s=>s.id==='lw').lossVsLw,0);
  assert.equal(r.correlationSummaries.find(s=>s.id==='lw').lossVsLw,0);
  assert.ok(r.points.every(p=>Math.abs(p.expertWeights.reduce((a,b)=>a+b,0)-1)<1e-8));
  assert.equal(r.quarters.reduce((s,q)=>s+q.count,0),10);
});

test('Held-out forecasts match standalone model estimates at their actual formation date',()=>{
  const input=fixture(507),panel=qualityPanel(input),r=evaluateCovarianceForecasts(input),p=r.points[0];
  const realized=panel.returns.map(row=>row.slice(500,505).reduce((a,b)=>a+b,0));
  const lw=ledoitWolf(panel.returns.map(row=>row.slice(248,500))).covariance.map(row=>row.map(v=>v*252));
  assert.deepEqual(p.estimates.lw,scoreForecast(lw,realized,input.weights,5));
  const ff=academicRisk(input.payload,{asOf:panel.dates[500],tickers:input.tickers},input.weights,input.payload.academicFactors,undefined,[],null,{sessions:5,weighting:'Responsive'}).forecast;
  assert.deepEqual(p.estimates.ff,scoreForecast(ff.covarianceMatrix,realized,input.weights,5));
  const single=buildIewmaExpertSnapshots(panel.returns)[2][499].covariance;
  const common=single.map((r,i)=>Math.sqrt(r[i]*252));
  assert.deepEqual(p.commonVolatilities,common);
  assert.deepEqual(p.correlationEstimates.ff,scoreForecast(withCommonVolatility(ff.covarianceMatrix,common),realized,input.weights,5));
  for(const k of ['loss','predictedRisk','standardizedReturn'])close(p.correlationEstimates.iewma[k],p.estimates.iewma[k]);
});

test('Appending or changing future stock and factor observations cannot change earlier evaluation results',()=>{
  const input=fixture(531),cutoff=input.payload.academicFactors.rows[515].date;
  const before=evaluateCovarianceForecasts({...input,asOf:cutoff});
  const changed=structuredClone(input);
  for(const series of Object.values(changed.payload.series))for(const p of series.points)if(p.date>cutoff)p.close*=3;
  for(const row of changed.payload.academicFactors.rows)if(row.date>cutoff)row.values=row.values.map(v=>v*50);
  assert.deepEqual(evaluateCovarianceForecasts({...changed,asOf:cutoff}),before);
  const extended=evaluateCovarianceForecasts(changed);
  assert.deepEqual(extended.points.slice(0,before.points.length),before.points);
});

test('Incomplete coverage and malformed histories fail explicitly instead of bridging gaps or dropping a model',()=>{
  const input=fixture();delete input.payload.series.A.points[510];input.payload.series.A.points=input.payload.series.A.points.filter(Boolean);
  assert.throws(()=>qualityPanel(input),/coverage is incomplete/);
  const missing=fixture();delete missing.payload.academicFactors;assert.throws(()=>qualityPanel(missing),/Published Fama/);
  assert.throws(()=>qualityPanel({...fixture(510),sessions:21}),/500 warm-up/);
});

test('Calibration is zero-mean RMS, coverage uses 1.96, and both require twenty windows',()=>{
  const estimates=Object.fromEntries(qualityModels.map(m=>[m.id,{loss:0,predictedRisk:1,realizedReturn:2,standardizedReturn:2}]));
  const points=Array.from({length:20},(_,i)=>({asOf:`2024-01-${String(i+1).padStart(2,'0')}`,through:'2024-02-01',expertWeights:[1,0,0,0,0],estimates,correlationEstimates:estimates,commonVolatilities:[1]}));
  const input={sessions:1,tickers:['A'],weights:[1]};
  const r=summarizeQuality(points,input);assert.equal(r.summaries[0].calibration,2);assert.equal(r.summaries[0].coverage,0);
  assert.equal(summarizeQuality(points.slice(1),input).summaries[0].calibration,null);
  const twentyOne=evaluateCovarianceForecasts({...fixture(548),sessions:21});assert.equal(twentyOne.points.length,2);
});

test('Shared-volatility comparison is invariant to model marginal volatilities at every horizon',()=>{
  const a=[[.04,.03],[.03,.09]],b=[[.16,.018],[.018,.0081]],common=[.3,.4],r=[.02,-.01],w=[.7,.3];
  const saved=structuredClone([a,b,common]);
  const x=withCommonVolatility(a,common),y=withCommonVolatility(b,common);
  close(x[0][0],.09);close(x[1][1],.16);close(x[0][1],.06);
  for(const h of [1,5,21]){
    const sx=scoreForecast(x,r,w,h),sy=scoreForecast(y,r,w,h);
    for(const key of Object.keys(sx))close(sx[key],sy[key]);
    assert.ok(Math.abs(scoreForecast(a,r,w,h).loss-scoreForecast(b,r,w,h).loss)>1e-3);
  }
  assert.deepEqual([a,b,common],saved);
});

test('Paired shared-volatility loss matches the independent correlation likelihood formula',()=>{
  const rho=.65,base=-.2,h=5,annualVol=[.2,.4],observed=[.01,-.03];
  const cov=r=>[[.09,r*.3*.5],[r*.3*.5,.25]];
  const z=observed.map((r,i)=>r/(annualVol[i]*Math.sqrt(h/252)));
  const direct=r=>(Math.log(1-r*r)+(z[0]**2-2*r*z[0]*z[1]+z[1]**2)/(1-r*r))/4;
  const loss=r=>scoreForecast(withCommonVolatility(cov(r),annualVol),observed,[1,-.5],h).loss;
  close(loss(rho)-loss(base),direct(rho)-direct(base));
  assert.ok(loss(rho)>loss(base),'Opposite-signed outcome should penalize high positive correlation in this example');
});

test('Correlation summaries and quarters aggregate their own paired scores, preserving the LW baseline',()=>{
  const input=fixture(625),r=evaluateCovarianceForecasts(input);
  assert.deepEqual(r.correlationSummaries.map(s=>s.count),r.summaries.map(s=>s.count));
  for(const m of qualityModels){
    const mean=r.points.reduce((s,p)=>s+p.correlationEstimates[m.id].loss-p.correlationEstimates.lw.loss,0)/r.points.length;
    close(r.correlationSummaries.find(s=>s.id===m.id).lossVsLw,mean);
    close(r.quarters.reduce((s,q)=>s+q.count*q.correlationDifferences[m.id],0)/r.points.length,mean);
  }
  assert.ok(r.correlationSummaries.every(s=>Number.isFinite(s.calibration)));
  assert.ok(r.correlationSummaries.some((s,i)=>Math.abs(s.lossVsLw-r.summaries[i].lossVsLw)>1e-5));
});

test('Invalid correlation inputs fail rather than introducing implicit repairs or scales',()=>{
  for(const matrix of [[[0,0],[0,1]],[[1]],[[1,NaN],[NaN,1]]])assert.throws(()=>withCommonVolatility(matrix,[.1,.2]),/positive finite/);
  for(const vols of [[0,.2],[-1,.2],[Infinity,.2]])assert.throws(()=>withCommonVolatility([[1,0],[0,1]],vols),/positive finite/);
  assert.throws(()=>scoreForecast(withCommonVolatility([[1,2],[2,1]],[.1,.2]),[.01,.02],[.5,.5],1),/positive definite/);
});
