import test from "node:test";
import assert from "node:assert/strict";
import { optimizePortfolio } from "../lib/portfolio-optimizer.ts";
const base={covariance:[[.04,0],[0,.16]],current:[.5,.5],objective:"Minimum volatility",longOnly:true,net:1,gross:1,positionCap:1,turnoverCap:null,changeCap:null,locked:[],exposures:[]};
const close=(a,b,tolerance=5e-5)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
test("minimum variance matches the analytic two-asset optimum",()=>{const r=optimizePortfolio(base);assert.equal(r.status,"Solved",r.message);close(r.weights[0],.8);close(r.weights[1],.2);assert.ok(r.volatility<r.currentVolatility);assert.ok(r.audit.every(item=>item.passed));});
test("position, turnover, change, locks and factor bounds are enforced",()=>{
  for(const config of [{positionCap:.6},{turnoverCap:.2},{changeCap:.1}]){const r=optimizePortfolio({...base,...config});assert.equal(r.status,"Solved",r.message);close(r.weights[0],.6);}
  const locked=optimizePortfolio({...base,locked:[0]});assert.equal(locked.status,"Solved");close(locked.weights[0],.5);
  const factor=optimizePortfolio({...base,exposures:[{name:"Market",values:[2,.5],min:.9,max:1}]});assert.equal(factor.status,"Solved",factor.message);close(factor.weights[0],1/3);
});
test("signed weights obey net and gross limits",()=>{const r=optimizePortfolio({...base,covariance:[[.04,.06],[.06,.16]],longOnly:false,gross:1.2,positionCap:2});assert.equal(r.status,"Solved",r.message);close(r.weights[0],1.1);close(r.weights[1],-.1);close(r.gross,1.2);});
test("maximum Sharpe matches the analytical tangency portfolio",()=>{const r=optimizePortfolio({...base,objective:"Maximum Sharpe",expectedReturns:[.1,.2]});assert.equal(r.status,"Solved",r.message);close(r.weights[0],2/3);close(r.weights[1],1/3);assert.ok(r.assumedSharpe>0);});
test("Sharpe transformation preserves turnover and exposure bounds",()=>{const r=optimizePortfolio({...base,objective:"Maximum Sharpe",expectedReturns:[.1,.2],turnoverCap:.2,exposures:[{name:"Market",values:[1,0],min:0,max:.55}]});assert.equal(r.status,"Solved",r.message);close(r.weights[0],.55);assert.ok(r.turnover<=.2+2e-6);});
test("conflicting and unsupported inputs never return an applicable allocation",()=>{for(const input of [{...base,positionCap:.1},{...base,objective:"Maximum Sharpe",expectedReturns:[0,0]},{...base,locked:[0],positionCap:.4},{...base,exposures:[{name:"Impossible",values:[0,0],min:1,max:2}]}]){const r=optimizePortfolio(input);assert.notEqual(r.status,"Solved");assert.deepEqual(r.weights,[]);}});
test("a diversified 39-asset problem satisfies combined trading and factor constraints",()=>{const n=39;const covariance=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>.002+(i===j?.01+i*.001:0)));for(const objective of ["Minimum volatility","Maximum Sharpe"]){const r=optimizePortfolio({...base,covariance,current:Array(n).fill(1/n),objective,expectedReturns:Array.from({length:n},(_,i)=>.04+i*.002),positionCap:.05,turnoverCap:.3,locked:[0],exposures:[{name:"Market",values:Array.from({length:n},(_,i)=>.5+i*.03),min:.8,max:1.1}]});assert.equal(r.status,"Solved",r.message);assert.ok(r.audit.every(item=>item.passed));assert.ok(r.weights.every(w=>w>=-2e-6&&w<=.05+2e-6));close(r.weights[0],1/n);}});
test("net ranges and individual signed bounds are honored in both original and Sharpe coordinates",()=>{
  for(const objective of ["Minimum volatility","Maximum Sharpe"]){const r=optimizePortfolio({...base,objective,expectedReturns:[.1,.2],netMin:.6,netMax:.8,positionBounds:[{min:.3,max:.4},{min:.3,max:.4}]});assert.equal(r.status,"Solved",r.message);assert.ok(r.weights.every(w=>w>=.3-2e-6&&w<=.4+2e-6));assert.ok(r.weights.reduce((a,b)=>a+b,0)<=.8+2e-6);assert.ok(r.audit.every(a=>a.passed));}
});
test("short-only book and net exposure above NAV remain fully collateral-accounted",()=>{
  const short=optimizePortfolio({...base,longOnly:false,shortOnly:true,net:-1});assert.equal(short.status,"Solved",short.message);close(short.weights[0],-.8);close(short.weights[1],-.2);close(short.cash,2);
  const levered=optimizePortfolio({...base,net:1.5,gross:1.5,positionCap:2});assert.equal(levered.status,"Solved",levered.message);close(levered.cash,-.5);
});
test("tracking-error objective solves the analytic constrained reference projection",()=>{
  const r=optimizePortfolio({...base,objective:"Minimum tracking error",referenceWeights:[.2,.8],positionBounds:[{min:.4,max:null},{min:null,max:null}]});assert.equal(r.status,"Solved",r.message);close(r.weights[0],.4);close(r.weights[1],.6);
  const exact=optimizePortfolio({...base,objective:"Minimum tracking error",referenceWeights:[.2,.8]});assert.equal(exact.status,"Solved",exact.message);close(exact.weights[0],.2);close(exact.weights[1],.8);
});
test("new-name gross budgets count shorts and longs by absolute weight",()=>{
  const r=optimizePortfolio({...base,current:[1,0],newNameGrossCap:.1});assert.equal(r.status,"Solved",r.message);close(r.weights[1],.1);
  const short=optimizePortfolio({...base,current:[1,0],longOnly:false,objective:"Maximum Sharpe",expectedReturns:[.1,-.2],gross:2,positionCap:2,newNameGrossCap:.15});assert.equal(short.status,"Solved",short.message);close(short.weights[1],-.15);assert.ok(short.audit.every(a=>a.passed));
});
test("conflicting individual bounds and net ranges cannot produce applicable weights",()=>{
  for(const config of [{netMin:1,netMax:0},{shortOnly:true},{positionBounds:[{min:.7,max:.4},{min:null,max:null}]},{newNameGrossCap:-1}]){const r=optimizePortfolio({...base,...config});assert.notEqual(r.status,"Solved");assert.deepEqual(r.weights,[]);}
});
