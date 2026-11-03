import test from 'node:test';import assert from 'node:assert/strict';
import {withPublishedFactors,alignedAcademicRows,parseFrenchCsv,academicRisk} from '../lib/academic-factors.ts';
import {buildFactorModel,buildPortfolioDecomposition,buildSecurityDrilldown} from '../lib/analytics.ts';
import {historicalSharpe} from '../lib/historical-sharpe.ts';
import {historyWindow} from '../lib/comparison-history.ts';
const dates=Array.from({length:310},(_,i)=>new Date(Date.UTC(2024,0,i+1)).toISOString().slice(0,10));
const rows=dates.map((date,t)=>({date,values:Array.from({length:6},(_,k)=>.004*Math.sin(t*(.13+.07*k))+.001*Math.cos(t*(.053+.023*k))),rf:.00015+.00002*Math.sin(t*.032)}));
const data={source:'test',through:dates.at(-1),retrievedAt:'test',names:['Market − RF','Size (SMB)','Value (HML)','Profitability (RMW)','Investment (CMA)','Momentum (Mom)'],rows};
const beta=[1.4,-.2,.4,.3,-.6,.7];
const r=rows.slice(1).map(row=>.0004+row.rf+row.values.reduce((s,v,k)=>s+beta[k]*v,0));
const curve=[1];r.forEach(v=>curve.push(curve.at(-1)*(1+v)));
const series=points=>({requested:'A',symbol:'A',currency:'USD',exchange:'X',instrumentType:'EQUITY',points});
const points=dates.map((date,i)=>({date,close:100*curve[i]}));
const payload={source:'test',frequency:'daily',adjusted:true,asOf:dates.at(-1),series:{AAA:series(points),SPY:series(points),BIL:series(dates.map(date=>({date,close:100})))},errors:[],missingHoldings:[],academicFactors:data};
const a={dates,curve,dailyReturns:r,annualVolatility:.2,totalReturn:curve.at(-1)-1,benchmarkCurve:curve,benchmarkReturns:r,beta:1,maxDrawdown:0,pnl:0,startDate:dates[0],endDate:dates.at(-1),positions:[]};
const near=(a,b,tol=1e-10)=>assert.ok(Math.abs(a-b)<tol,`${a} differs from ${b}`);
test('published attribution recovers joint betas and separates RF from intercept at every date',()=>{
 const model=buildFactorModel(payload,a,1000),d=buildPortfolioDecomposition(payload,a);assert.ok(model&&d);
 beta.forEach((b,k)=>near(model.factors[k].exposure,b));near(model.factors[6].exposure,1);
 let alpha=0,rf=0;
 dates.slice(1).forEach((_,t)=>{alpha+=curve[t]*.0004;rf+=curve[t]*rows[t+1].rf;near(d.idiosyncratic[t],alpha);near(d.factors[6].values[t],rf);near(d.factors.reduce((s,f)=>s+f.values[t],0)+d.idiosyncratic[t],d.observed[t]);});
 near(model.layers.reduce((s,f)=>s+f.riskShare,0),1);near(model.reconciliationDifference,0);near(model.rSquared,1);
});
test('stock and portfolio attribution agree; missing dates cannot create multi-session returns',()=>{
 const d=buildSecurityDrilldown(payload,a,'AAA');assert.ok(d);beta.forEach((b,k)=>near(d.factorExposures[k].exposure,b));
 near(d.idiosyncraticReturn,buildFactorModel(payload,a,1).idiosyncraticReturn);
 const bad=structuredClone(payload);bad.series.AAA.points.splice(80,1);assert.equal(buildSecurityDrilldown(bad,a,'AAA'),null);
 const broken={...a,dates:dates.filter((_,i)=>i!==80),curve:curve.filter((_,i)=>i!==80),dailyReturns:r.slice(1)};assert.equal(buildPortfolioDecomposition(payload,broken),null);
});
test('one common cutoff excludes future prices without mutating original data',()=>{
 const limited={...data,rows:rows.slice(0,280),through:dates[279]};const cut=withPublishedFactors(payload,limited);
 assert.equal(cut.asOf,dates[279]);assert.equal(cut.series.AAA.points.length,280);assert.equal(payload.series.AAA.points.length,310);
 assert.equal(cut.factorStartDate,dates[0]);assert.equal(cut.academicFactors,limited);
 assert.throws(()=>withPublishedFactors(payload,{...limited,through:dates[278]}),/end date/);
 assert.throws(()=>withPublishedFactors(payload,{...limited,rows:[...limited.rows].reverse()}),/Invalid/);
});
test('Sharpe uses published RF over exact intervals, consistently after comparison slicing',()=>{
 const excess=r.map((v,i)=>v-rows[i+1].rf),mean=excess.reduce((s,v)=>s+v,0)/excess.length,sd=Math.sqrt(excess.reduce((s,v)=>s+(v-mean)**2,0)/(excess.length-1));
 near(historicalSharpe(dates,r,payload),Math.sqrt(252)*mean/sd);
 const sliced=historyWindow(a,dates[20],dates[250]);assert.ok(sliced);near(historicalSharpe(sliced.dates,sliced.dailyReturns,payload),historicalSharpe(dates.slice(20,251),r.slice(20,250),payload));
 const bad={...payload,academicFactors:{...data,rows:rows.filter((_,i)=>i!==80)}};assert.equal(historicalSharpe(dates,r,bad),null);
 assert.throws(()=>alignedAcademicRows(data,[dates[0],dates[2]]),/intervals/);
});
test('malformed French input cannot turn blank cells into zero or overwrite dates',()=>{
 const valid=dates.map(d=>`${d.replaceAll('-','')},1`).join('\n');assert.throws(()=>parseFrenchCsv(valid+'\n20250101,',1),/Blank/);assert.throws(()=>parseFrenchCsv(valid+'\n20240230,1',1),/Invalid/);assert.throws(()=>parseFrenchCsv(valid+'\n20240101,2',1),/duplicate/);
});
test('dated risk model is invariant to future prices and factors; manual zero shrinkage preserves sample risk',()=>{
 const base={asOf:dates[279],tickers:['AAA'],references:[]},result=academicRisk(payload,base,[1],data,undefined,[],0);
 const future=structuredClone(payload),futureData=structuredClone(data);future.series.AAA.points.forEach(p=>{if(p.date>base.asOf)p.close*=5});futureData.rows.forEach(row=>{if(row.date>base.asOf)row.values=row.values.map(v=>v*20)});
 assert.deepEqual(result,academicRisk(future,base,[1],futureData,undefined,[],0));
 const excess=r.slice(27,279).map((v,i)=>v-rows[i+28].rf),m=excess.reduce((s,v)=>s+v,0)/252;
 near(result.forecast.covarianceMatrix[0][0],excess.reduce((s,v)=>s+(v-m)**2,0));
 const none=academicRisk(payload,base,[1],data,[],[],0);near(none.forecast.covarianceMatrix[0][0],result.forecast.covarianceMatrix[0][0]);
});
