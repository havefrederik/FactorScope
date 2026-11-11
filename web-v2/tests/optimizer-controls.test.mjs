import test from 'node:test';
import assert from 'node:assert/strict';
import { objectiveChoices, objectiveChoice, selectObjective, shortExposureStatus, exposurePresets, matchingExposurePreset, minimumNetTrade } from '../lib/optimizer-controls.ts';
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
test('every explicit objective selects its inputs regardless of the previously selected assumption', () => {
  const mapping = {
    'Maximum diversification': 'Proportional to total volatility',
    'Maximum idiosyncratic return / risk': 'Proportional to idiosyncratic volatility',
    'Maximum expected Sharpe': 'My return forecasts',
  };
  assert.equal(objectiveChoices.length, 5);
  for (const previous of Object.values(mapping)) {
    for (const choice of objectiveChoices) {
      const selected = selectObjective(choice, previous);
      assert.equal(selected.assumption, mapping[choice] ?? previous);
      assert.equal(selected.objective, mapping[choice] ? 'Maximum Sharpe' : choice);
      assert.equal(objectiveChoice(selected.objective, selected.assumption), choice);
    }
  }
});
test('saved solver and return-assumption pairs restore to the matching explicit objective', () => {
  for (const choice of objectiveChoices) {
    const settings = selectObjective(choice, 'Proportional to idiosyncratic volatility');
    const restored = JSON.parse(JSON.stringify(settings));
    assert.equal(objectiveChoice(restored.objective, restored.assumption), choice);
  }
});
test('validation names the actual score type; neither mode silently supplies a forecast', () => {
  const preference=solve({expectedReturns:[0,0]});
  assert.equal(preference.status,'Invalid inputs');
  assert.match(preference.message,/return assumption/); assert.doesNotMatch(preference.message,/Sharpe/);
  const manual=solve({returnInputKind:'forecasts',expectedReturns:[0,0]});
  assert.equal(manual.status,'Invalid inputs'); assert.match(manual.message,/expected excess returns/);
  const supplied=solve({returnInputKind:'forecasts',expectedReturns:[.03,.1],gross:1.6});
  assert.equal(supplied.status,'Solved',supplied.message);
  close(supplied.assumedSharpe,supplied.expectedReturn/supplied.volatility);
});


test('exposure presets enforce the advertised budgets and retain other constraints', () => {
  for (const preset of exposurePresets) {
    const r=solve({...preset,expectedReturns:[1,2],turnoverCap:3,positionCap:.8});
    assert.equal(r.status,'Solved',`${preset.id}: ${r.message}`);
    close(r.weights.reduce((a,b)=>a+b),preset.net);
    assert.ok(r.gross<=preset.gross+2e-5);
    assert.ok(r.weights.every(w=>Math.abs(w)<=.8+2e-5));
    assert.ok(r.audit.every(a=>a.passed));
    if(preset.longOnly)assert.ok(r.weights.every(w=>w>=-2e-5));
    if(preset.id==='neutral')assert.ok(r.weights.some(w=>w<-.01)&&r.weights.some(w=>w>.01));
  }
});
test('preset matching follows actual limits, including saved/restored and custom settings', () => {
  for(const p of exposurePresets) {
    const saved=JSON.parse(JSON.stringify({...p,netRange:false}));
    assert.equal(matchingExposurePreset(saved),p.id);
    assert.equal(matchingExposurePreset({...saved,gross:p.gross+.01}),'custom');
    assert.equal(matchingExposurePreset({...saved,net:p.net+.01}),'custom');
    assert.equal(matchingExposurePreset({...saved,longOnly:!p.longOnly}),'custom');
    assert.equal(matchingExposurePreset({...saved,netRange:true}),'custom');
  }
});
test('net-transition budget gives a necessary lower bound and the solver rejects a smaller budget', () => {
  close(minimumNetTrade([.5,.5],0,0),1);
  close(minimumNetTrade([1.3,-.3],0,0),1);
  close(minimumNetTrade([.5,.5],-.1,.1),.9);
  close(minimumNetTrade([-.2,-.3],0,0),.5);
  close(minimumNetTrade([.5,.5],.9,1.1),0);
  assert.equal(minimumNetTrade([NaN],0,0),null);
  assert.equal(minimumNetTrade([1],1,0),null);
  const neutral=exposurePresets.find(p=>p.id==='neutral');
  const blocked=solve({...neutral,expectedReturns:[1,2],turnoverCap:.3});
  assert.equal(blocked.status,'Infeasible');
  close(blocked.minimumTurnover,1);
  assert.equal(blocked.weights.length,0);
  const allowed=solve({...neutral,expectedReturns:[1,2],turnoverCap:1.2});
  assert.equal(allowed.status,'Solved',allowed.message);
  assert.ok(allowed.turnover<=1.2+2e-5);
});
test('zero-net minimum volatility legitimately chooses cash; the gross preset is only a ceiling', () => {
  const r=solve({...exposurePresets.find(p=>p.id==='neutral'),objective:'Minimum volatility',turnoverCap:1});
  assert.equal(r.status,'Solved',r.message);
  close(r.gross,0); close(r.cash,1);
});
test('zero-net ratios with identical signed scores fail immediately with actionable guidance', () => {
  for(const kind of ['preferences','forecasts']) {
    const r=solve({...exposurePresets.find(p=>p.id==='neutral'),returnInputKind:kind,expectedReturns:[1,1]});
    assert.equal(r.status,'Invalid inputs');
    assert.equal(r.iterations,0);
    assert.match(r.message,/cancel at 0% net/);
  }
  const signed=solve({...exposurePresets.find(p=>p.id==='neutral'),expectedReturns:[-1,1]});
  assert.equal(signed.status,'Solved',signed.message);
});
