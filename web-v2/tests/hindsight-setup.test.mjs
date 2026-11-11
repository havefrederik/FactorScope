import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

test('Hindsight exposes the shared model, objective and constraints without one-date proposal controls',async()=>{
  const directory=await mkdtemp(new URL('../.hindsight-render-',import.meta.url));
  try{
    const outfile=`${directory}/optimizer.mjs`;
    await build({entryPoints:[fileURLToPath(new URL('../app/portfolio-optimizer.tsx',import.meta.url))],outfile,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',alias:{'@':fileURLToPath(new URL('..',import.meta.url))},logLevel:'silent'});
    const {default:Optimizer}=await import(outfile);
    const dates=Array.from({length:280},(_,i)=>new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10));
    const tickers=['AAA','BBB'];
    const series=Object.fromEntries([...tickers,'SPY'].map((ticker,k)=>{let close=100;return [ticker,{points:dates.map((date,i)=>({date,close:close*=1+.0001+.003*Math.sin(i*.17+k)+.002*Math.cos(i*.11)}))}];}));
    const payload={asOf:dates.at(-1),series};
    const forecast={asOf:payload.asOf,tickers,covarianceMatrix:[[.04,.01],[.01,.05]],portfolioVolatility:.16,observations:252};
    const noop=()=>{};
    const props={payload,forecast,holdings:tickers.map(ticker=>({ticker,name:ticker,value:50})),riskEstimator:'Ledoit–Wolf',onApply:noop,onSelectTicker:noop,onAsOfChange:noop,setRiskEstimator:noop,onOpenHindsight:noop};
    const hindsight=renderToStaticMarkup(React.createElement(Optimizer,{...props,mode:'hindsight'}));
    const optimizer=renderToStaticMarkup(React.createElement(Optimizer,{...props,mode:'optimizer'}));
    for(const label of ['Optimizer covariance estimator','Ledoit–Wolf shrinkage method','Risk forecast horizon','Optimization objective','Portfolio exposure preset','Optimizer gross exposure limit','Optimizer position cap','Optimizer turnover limit','AAA min weight','Lock AAA weight']){
      for(const html of [hindsight,optimizer])assert.equal(html.split(`aria-label="${label}"`).length-1,1,label);
    }
    assert.doesNotMatch(hindsight,/Edit model &amp; constraints|Run optimization|Review allocation &amp; risk|Export proposed trades/);
    assert.match(hindsight,/Run and compare/);
    assert.match(hindsight,/Selected-date preview · rebuilt at each historical decision/);
    assert.match(hindsight,/<option value="Maximum expected Sharpe" disabled="">/);
    assert.doesNotMatch(optimizer,/<option value="Maximum expected Sharpe" disabled="">/);
    assert.match(optimizer,/Run optimization/);
    assert.match(hindsight,/Bounds apply to each proposed allocation/);
    assert.doesNotMatch(hindsight,/<th>Proposed<\/th>|<th>Trade value<\/th>/);
  }finally{await rm(directory,{recursive:true,force:true});}
});
