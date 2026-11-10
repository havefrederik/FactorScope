import test from 'node:test';
import assert from 'node:assert/strict';
import { objectiveChoice, selectObjective, shortExposureStatus } from '../lib/optimizer-controls.ts';
import { optimizePortfolio } from '../lib/portfolio-optimizer.ts';

const base = { current: [.5, .5], longOnly: false, net: 1, gross: 1, positionCap: 2, turnoverCap: null, changeCap: null, locked: [] };
const solve = patch => optimizePortfolio({ ...base, covariance: [[.04, .018], [.018, .01]], objective: 'Maximum Sharpe', returnInputKind: 'preferences', expectedReturns: [1, 1], exposures: [], ...patch });
const close = (a,b) => assert.ok(Math.abs(a-b)<2e-5, `${a} != ${b}`);

test('full net investment and equal gross cap preclude shorts even with both sides allowed', () => {
  const status = shortExposureStatus(base);
  assert.equal(status.blocked, true);
  assert.equal(status.exposureShortCeiling, 0);
  assert.match(status.title, /gross\/net/);
  const r = solve({});
  assert.equal(r.status, 'Solved', r.message);
  assert.ok(r.weights.every(w => w >= -2e-6));
  close(r.weights.reduce((a,b)=>a+b),1);
});
test('raising gross permits an economically useful hedge without forcing a short', () => {
  const status = shortExposureStatus({...base,gross:1.6});
  assert.equal(status.blocked,false);
  close(status.exposureShortCeiling,.3);
  const r=solve({gross:1.6});
  assert.equal(r.status,'Solved',r.message);
  close(r.weights[0],-.3); close(r.weights[1],1.3);
  assert.ok(r.audit.every(a=>a.passed));
  const symmetric=solve({gross:1.6,covariance:[[.04,0],[0,.04]]});
  assert.equal(symmetric.status,'Solved',symmetric.message);
  assert.ok(symmetric.weights.every(w=>w>0));
});
test('net ranges and short-only books have bounded ceilings, not claimed feasible allocations', () => {
  close(shortExposureStatus({...base,net:.6}).exposureShortCeiling,.2);
  close(shortExposureStatus({...base,netMin:-.1,netMax:.1}).exposureShortCeiling,.55);
  close(shortExposureStatus({...base,current:[-.5,-.5],shortOnly:true,net:-1}).exposureShortCeiling,1);
  close(shortExposureStatus({...base,netMin:-2,netMax:.1}).exposureShortCeiling,1);
  assert.equal(shortExposureStatus({...base,longOnly:true,gross:1.6}).blocked,true);
  for(const patch of [{net:1.1},{net:NaN},{netMin:.5,netMax:0},{shortOnly:true},{gross:-1}])
    assert.equal(shortExposureStatus({...base,...patch}).severity,'error');
});
test('locks, nonnegative stock bounds, change limits and trading budget can all block shorts', () => {
  for(const patch of [{locked:[0,1]},{positionBounds:[{min:0,max:null},{min:0,max:null}]},{changeCap:.4},{turnoverCap:.4},{current:[.5,.5,0],locked:[0,1],newNameGrossCap:0}]) {
    const status=shortExposureStatus({...base,gross:1.6,...patch});
    assert.equal(status.blocked,true,JSON.stringify(patch));
    assert.match(status.title,/position or trading/);
  }
  assert.equal(shortExposureStatus({...base,gross:1.6,locked:[0]}).blocked,false);
  assert.equal(shortExposureStatus({...base,current:[1.1,-.1],gross:1.6,turnoverCap:0}).blocked,false);
  assert.equal(shortExposureStatus({...base,gross:1.6,positionBounds:[{min:1,max:0},{min:null,max:null}]}).severity,'error');
});
test('switching objectives distinguishes units and preserves compatible saved configurations', () => {
  for(const assumption of ['Idiosyncratic volatility proportionate','Equal preferences']) {
    assert.equal(objectiveChoice('Maximum Sharpe',assumption),'Maximum preference / risk');
    assert.deepEqual(selectObjective('Maximum preference / risk',assumption),{objective:'Maximum Sharpe',assumption});
    assert.deepEqual(selectObjective('Maximum expected Sharpe',assumption),{objective:'Maximum Sharpe',assumption:'Manual forecasts'});
  }
  assert.equal(objectiveChoice('Maximum Sharpe','Manual forecasts'),'Maximum expected Sharpe');
  assert.equal(selectObjective('Maximum preference / risk','Manual forecasts').assumption,'Idiosyncratic volatility proportionate');
  for(const objective of ['Minimum volatility','Minimum tracking error'])
    assert.equal(objectiveChoice(objective,'Manual forecasts'),objective);
});
test('validation names the actual score type; neither mode silently supplies a forecast', () => {
  const preference=solve({expectedReturns:[0,0]});
  assert.equal(preference.status,'Invalid inputs');
  assert.match(preference.message,/preference/); assert.doesNotMatch(preference.message,/Sharpe/);
  const manual=solve({returnInputKind:'forecasts',expectedReturns:[0,0]});
  assert.equal(manual.status,'Invalid inputs'); assert.match(manual.message,/expected excess returns/);
  const supplied=solve({returnInputKind:'forecasts',expectedReturns:[.03,.1],gross:1.6});
  assert.equal(supplied.status,'Solved',supplied.message);
  close(supplied.assumedSharpe,supplied.expectedReturn/supplied.volatility);
});
