import test from 'node:test';
import assert from 'node:assert/strict';
import {modeledScenario,coveredHistoricalScenario} from '../lib/scenario-analysis.ts';
const holdings=[{ticker:'A',value:100,sector:'Technology'},{ticker:'B',value:-20,sector:'Energy'},{ticker:'CASH',value:20}];
test('shock components and signed position impacts reconcile without arbitrary attribution splits',()=>{
  const r=modeledScenario(holdings,{A:1.5,B:.5},-10,-5);
  assert.equal(r.impact,-19);
  assert.equal(r.factors.reduce((s,f)=>s+f.impact,0),r.impact);
  assert.equal(r.positions.find(p=>p.ticker==='B').impact,1);
  assert.equal(modeledScenario(holdings,{A:1},-10,0),null);
});
test('historical stress requires full event coverage and preserves shorts',()=>{
  const dates=['2024-01-02','2024-01-03','2024-01-04'];
  const points=prices=>prices.map((close,i)=>({date:dates[i],close}));
  const payload={series:{SPY:{points:points([100,90,80])},A:{points:points([100,90,80])},B:{points:points([100,110,120])}}};
  const r=coveredHistoricalScenario(payload,holdings,dates[0],dates[2]);
  assert.equal(r.available,true);assert.equal(r.path.dates.length,3);assert.ok(Math.abs((r.path.curve.at(-1)-1)*100-r.impact)<1e-10);assert.ok(Math.abs(r.impact+24)<1e-10);
  const ipo=structuredClone(payload);ipo.series.A.points.shift();
  const missing=coveredHistoricalScenario(ipo,holdings,dates[0],dates[2]);
  assert.equal(missing.impact,null);assert.deepEqual(missing.missing,['A']);
  assert.equal(coveredHistoricalScenario(payload,holdings,'2023-12-29',dates[2]).available,false);
});
