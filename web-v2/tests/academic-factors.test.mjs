import test from 'node:test';import assert from 'node:assert/strict';
import {parseFrenchCsv,combineFrench,timeSeriesExposures,academicRisk} from '../lib/academic-factors.ts';
const dates=Array.from({length:270},(_,i)=>new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10));
const five=dates.map(d=>`${d.replaceAll('-','')},1,2,3,4,5,0.01`).join('\n'),mom=dates.map(d=>`${d.replaceAll('-','')},6`).join('\n');
test('French percentage values, RF and common dates are parsed without interpreting metadata as returns',()=>{
 const data=combineFrench('Daily Factors\n'+five+'\nAnnual Factors,6',mom);assert.equal(data.rows.length,270);assert.deepEqual(data.rows[0].values,[.01,.02,.03,.04,.05,.06]);assert.equal(data.rows[0].rf,.0001);
 assert.equal(combineFrench(five,mom.split('\n').slice(0,-1).join('\n')).through,dates[268]);assert.throws(()=>parseFrenchCsv('20250101,-99.99',1));
});
test('joint time-series regression recovers known loadings with correlated factors and an intercept',()=>{
 const f=dates.map((_,i)=>Math.sin(i*.31)),g=f.map((v,i)=>.5*v+Math.cos(i*.17)),x=f.map((v,i)=>.3+2*v-3*g[i]);const b=timeSeriesExposures([x],[f,g])[0];assert.ok(Math.abs(b[0]-2)<1e-10);assert.ok(Math.abs(b[1]+3)<1e-10);assert.throws(()=>timeSeriesExposures([x],[f,f]));
});
test('academic model rejects stale end dates and mismatched daily return intervals',()=>{
 const data=combineFrench(five,mom);assert.throws(()=>academicRisk({series:{}},{asOf:'2026-10-29',tickers:[]},[],data),/end on/);
 const points=dates.map((date,i)=>({date,close:100+i})).filter((_,i)=>i!==100);assert.throws(()=>academicRisk({series:{AAA:{points}}},{asOf:data.through,tickers:['AAA']},[1],data),/align|missing/);
});
