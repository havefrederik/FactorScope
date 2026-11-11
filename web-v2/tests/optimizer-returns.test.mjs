import test from "node:test";
import assert from "node:assert/strict";
import { buildOptimizerReturns, restoreReturnAssumption, returnAssumptions, relativeSignalIndex } from "../lib/optimizer-returns.ts";
import { optimizePortfolio } from "../lib/portfolio-optimizer.ts";

const input = { tickers: ["AAA", "BBB", "CCC"], current: [.6, -.2, 0], mode: "Proportional to idiosyncratic volatility", side: "both", idiosyncraticVolatility: [.1, .2, .3] };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
test("risk-proportionate preset preserves relative residual risk and explicitly signed views", () => {
  const values = buildOptimizerReturns(input);
  values.forEach((value, i) => close(value, [.5, -1, 1.5][i]));
  close(values.reduce((s, v) => s + Math.abs(v), 0) / 3, 1);
  assert.ok(buildOptimizerReturns({ ...input, side: "short" }).every(v => v < 0));
  assert.ok(buildOptimizerReturns({ ...input, side: "long" }).every(v => v > 0));
});
test("total-volatility assumption uses the selected covariance standard deviations, not variances or residuals", () => {
  const values = buildOptimizerReturns({ ...input, mode: "Proportional to total volatility", covariance: [[.04,.01,0],[.01,.16,0],[0,0,.36]], overrides: { AAA: "99" } });
  values.forEach((value,i) => close(value,[.5,-1,1.5][i]));
  buildOptimizerReturns({ ...input, mode: "Proportional to total volatility", covariance: [[.04,0,0],[0,.04,0],[0,0,.04]], idiosyncraticVolatility: [] }).forEach((v,i)=>close(v,[1,-1,1][i]));
  buildOptimizerReturns({ ...input, mode: "Proportional to total volatility", covariance: [[4,1,0],[1,16,0],[0,0,36]] }).forEach((v,i)=>close(v,values[i]));
});
test("manual mode preserves legacy values and blank-as-zero behavior", () => {
  assert.deepEqual(buildOptimizerReturns({ ...input, mode: "My return forecasts", level: NaN, overrides: { AAA: "7", BBB: "-4" } }), [.07, -.04, 0]);
});
test("unavailable risk and invalid assumptions fail explicitly instead of generating silent forecasts", () => {
  for (const patch of [{ idiosyncraticVolatility: [] }, { idiosyncraticVolatility: [0, 0, 0] }, { mode: "My return forecasts", overrides: { AAA: "invalid" } }]) assert.throws(() => buildOptimizerReturns({ ...input, ...patch }));
});
test("preset feeds Sharpe optimization without individual forecasts, including short-only books", () => {
  for (const shortOnly of [false, true]) {
    const current = shortOnly ? [-.5, -.5] : [.5, .5];
    const expectedReturns = buildOptimizerReturns({ ...input, tickers: ["AAA", "BBB"], current, side: shortOnly ? "short" : "long", idiosyncraticVolatility: [.1, .2] });
    const result = optimizePortfolio({ covariance: [[.04, 0], [0, .16]], current, objective: "Maximum Sharpe", expectedReturns, longOnly: !shortOnly, shortOnly, net: shortOnly ? -1 : 1, gross: 1, positionCap: 1, turnoverCap: null, changeCap: null, locked: [], exposures: [] });
    assert.equal(result.status, "Solved", result.message);
    assert.ok(result.expectedReturn > 0);
    assert.ok(result.audit.every(row => row.passed));
    assert.ok(Math.abs(Math.abs(result.weights[0]) - 2 / 3) < 5e-5);
  }
});

test("saved assumptions migrate without changing meanings or silently replacing retired rules", () => {
  assert.equal(returnAssumptions.length,3);
  for(const mode of returnAssumptions) assert.equal(restoreReturnAssumption(JSON.parse(JSON.stringify(mode))),mode);
  assert.equal(restoreReturnAssumption("Idiosyncratic volatility proportionate"),returnAssumptions[0]);
  assert.equal(restoreReturnAssumption("Manual forecasts"),"My return forecasts");
  assert.throws(()=>restoreReturnAssumption("Equal preferences"),/retired/);
  for(const mode of [null,{},"unrecognized"]) assert.throws(()=>restoreReturnAssumption(mode));
});
test("total-volatility validation fails on missing, misaligned, negative, zero or nonfinite risk", () => {
  for(const covariance of [undefined,[],[[1]],[[1,0,0],[0,-1,0],[0,0,1]],[[0,0,0],[0,0,0],[0,0,0]],[[1,NaN,0],[0,1,0],[0,0,1]]])
    assert.throws(()=>buildOptimizerReturns({...input,mode:"Proportional to total volatility",covariance}));
  assert.throws(()=>buildOptimizerReturns({...input,current:[NaN,0,0]}));
});
test("total-volatility optimization matches the two-asset maximum-diversification solution and common return scaling", () => {
  const covariance=[[.04,.018],[.018,.09]], current=[.5,.5];
  const scores=buildOptimizerReturns({...input,tickers:['A','B'],current,side:'long',mode:'Proportional to total volatility',covariance});
  const config={covariance,current,objective:'Maximum Sharpe',returnInputKind:'preferences',longOnly:true,net:1,gross:1,positionCap:1,turnoverCap:null,changeCap:null,locked:[],exposures:[]};
  const a=optimizePortfolio({...config,expectedReturns:scores}),b=optimizePortfolio({...config,expectedReturns:scores.map(v=>v*3)});
  assert.equal(a.status,'Solved',a.message); assert.equal(b.status,'Solved',b.message);
  // For two assets with rho < 1, maximum diversification gives inverse-vol weights.
  assert.ok(Math.abs(a.weights[0]-.6)<5e-5);
  a.weights.forEach((v,i)=>assert.ok(Math.abs(v-b.weights[i])<5e-5));
  assert.ok(relativeSignalIndex(scores,current,a.weights,a.currentVolatility,a.volatility)>100);
  assert.equal(relativeSignalIndex(scores,[0,0],a.weights,0,a.volatility),null);
});
