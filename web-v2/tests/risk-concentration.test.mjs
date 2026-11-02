import test from 'node:test';
import assert from 'node:assert/strict';
import {riskConcentration} from '../lib/risk-concentration.ts';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10);
test('effective count uses gross weights and signed Euler shares reconcile including hedges',()=>{
  const r=riskConcentration(['A','B'],[1,-.2],[[.04,.03],[.03,.04]]);
  close(r.effectivePositions,1.44/1.04);
  close(r.positions.reduce((s,p)=>s+p.riskShare,0),1);
  assert.ok(r.positions.find(p=>p.ticker==='B').riskShare<0);
  close(r.topFiveWeight,1);
  close(riskConcentration(['A','B'],[2,-.4],[[.04,.03],[.03,.04]]).effectivePositions,r.effectivePositions);
});
test('cash has no concentration or fabricated risk shares; equal stocks have correct effective count',()=>{
  const c=riskConcentration(['A'],[0],[[.04]]);
  assert.equal(c.effectivePositions,0);assert.equal(c.topFiveRisk,null);
  close(riskConcentration(['A','B'],[.5,.5],[[.04,0],[0,.04]]).effectivePositions,2);
});
