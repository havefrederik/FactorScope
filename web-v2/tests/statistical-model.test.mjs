import {readFileSync,existsSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStatisticalBundle,analyseStatisticalPortfolio,correlation} from '../lib/statistical-model.ts';
const factorReturns=Array.from({length:250},(_,i)=>Array.from({length:20},(_,k)=>Math.sin((i+1)*(k+1))*.01));
const dates=Array.from({length:250},(_,i)=>new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10));
const snapshot={asOf:dates.at(-1),variant:'ONE_YEAR_EQUAL',population:'test',donorCount:40,loading:'EW63',dates,factorReturns,covariance:Array.from({length:20},(_,i)=>Array.from({length:20},(_,j)=>i===j?.0001:0)),profiles:Array.from({length:20},()=>({positive:[],negative:[]})),stocks:[{ticker:'A',exposures:[1,...Array(19).fill(0)],specificVariance:.00004,returns:factorReturns.map(r=>r[0])},{ticker:'B',exposures:[-1,...Array(19).fill(0)],specificVariance:.00004,returns:factorReturns.map(r=>-r[0])}]};
const cov=(a,b)=>{const ma=a.reduce((s,x)=>s+x,0)/a.length,mb=b.reduce((s,x)=>s+x,0)/b.length;return a.reduce((s,x,i)=>s+(x-ma)*(b[i]-mb),0)/(a.length-1)};
const columns=Array.from({length:20},(_,k)=>factorReturns.map(r=>r[k]));
snapshot.observedCovariance=snapshot.stocks.map(a=>snapshot.stocks.map(b=>cov(a.returns,b.returns)));
snapshot.stockFactorCovariance=snapshot.stocks.map(a=>columns.map(c=>cov(a.returns,c)));
snapshot.factorVariances=columns.map(c=>cov(c,c));
delete snapshot.factorReturns; snapshot.stocks.forEach(s=>delete s.returns);
const fixture=()=>({schemaVersion:2,title:'test',source:'synthetic',sourceHash:'test',dataThrough:dates.at(-1),universeNote:'test',aiBasket:Array.from({length:35},(_,i)=>'T'+i),snapshots:[structuredClone(snapshot)],histories:[]});
test('signed exposures cancel common risk; independent specific risk remains',()=>{const r=analyseStatisticalPortfolio(snapshot,[{ticker:'A',value:50},{ticker:'B',value:50}]);assert.ok(Math.abs(r.variance-.00002)<1e-14);assert.equal(r.specificShare,1);assert.ok(r.contributions.every(v=>v===0));assert.equal(r.correlations[0],null);});
test('cash dilution changes volatility, not return correlation',()=>{const full=analyseStatisticalPortfolio(snapshot,[{ticker:'A',value:100}]);const half=analyseStatisticalPortfolio(snapshot,[{ticker:'A',value:50},{ticker:'CASH',value:50}]);assert.ok(Math.abs(half.volatility/full.volatility-.5)<1e-12);assert.equal(half.correlations[0],1);assert.ok(Math.abs(full.contributions.reduce((a,b)=>a+b,0)+full.specificShare-1)<1e-12);});
test('missing stocks are rejected, never silently reweighted',()=>{assert.throws(()=>analyseStatisticalPortfolio(snapshot,[{ticker:'MISSING',value:100}]),/coverage missing/);});
test('short positions preserve signed correlation and exposures',()=>{const r=analyseStatisticalPortfolio(snapshot,[{ticker:'A',value:-100},{ticker:'CASH',value:200}]);assert.equal(r.correlations[0],-1);assert.ok(r.variance>0);});
test('import validates covariance, dates, numbers and duplicate identities',()=>{assert.doesNotThrow(()=>parseStatisticalBundle(fixture()));for(const mutate of [b=>b.snapshots[0].covariance[0][0]=-1,b=>b.snapshots[0].covariance[0][1]=4,b=>b.snapshots[0].observedCovariance[0][0]=null,b=>b.snapshots[0].stocks.push(b.snapshots[0].stocks[0]),b=>b.snapshots[0].dates[0]='2099-01-01']){const b=fixture();mutate(b);assert.throws(()=>parseStatisticalBundle(b));}});
test('correlation sign is preserved and zero variance is undefined',()=>{assert.equal(correlation([1,2,3],[-1,-2,-3]),-1);assert.equal(correlation([1,1,1],[1,2,3]),null);});
test('all-cash portfolios have zero modeled risk and undefined correlations',()=>{const r=analyseStatisticalPortfolio(snapshot,[{ticker:'CASH',value:100}]);assert.equal(r.volatility,0);assert.equal(r.commonShare,0);assert.equal(r.specificShare,0);assert.ok(r.correlations.every(x=>x===null));});
test('correlated factors can have negative additive risk contributions',()=>{const s=structuredClone(snapshot);s.covariance[0][1]=s.covariance[1][0]=.00009;s.stocks[0].exposures[1]=-.5;const r=analyseStatisticalPortfolio(s,[{ticker:'A',value:100}]);assert.ok(r.contributions[1]<0);assert.ok(Math.abs(r.commonShare+r.specificShare-1)<1e-12);});

test('EW63 result matches the preferred July checkpoint and coverage history',{skip:!existsSync(new URL('../../research-imports/factorscope-statistical-model-ew63.json',import.meta.url))},()=>{
 const b=parseStatisticalBundle(JSON.parse(readFileSync(new URL('../../research-imports/factorscope-statistical-model-ew63.json',import.meta.url),'utf8')));
 const s=b.snapshots.find(s=>s.asOf==='2026-07-10'&&s.variant==='ONE_YEAR_EQUAL');
 const r=analyseStatisticalPortfolio(s,b.aiBasket.map(ticker=>({ticker,value:1})));
 assert.ok(Math.abs(r.contributions[1]-.668506)<1e-6);
 assert.ok(Math.abs(Math.abs(r.correlations[1])-.794275)<1e-6);
 const h=b.histories.find(h=>h.variant==='ONE_YEAR_EQUAL'&&h.basket==='AVAILABLE_NOT_AI35');
 assert.equal(Math.min(...h.points.map(p=>p.nHoldings)),32);assert.equal(Math.max(...h.points.map(p=>p.nHoldings)),35);
 assert.ok(h.points.length>180);assert.ok(Math.abs(h.points.at(-1).risk[1]/(h.points.at(-1).volatility*10000)-r.contributions[1])<1e-10);
 for(const s of b.snapshots){assert.equal(s.loading,'EW63');assert.equal(s.factorReturns,undefined);for(const x of s.stocks)assert.equal(x.returns,undefined);}
});
test('old equal-loading files and inconsistent coverage cannot masquerade as defaults',()=>{
 const b=fixture();b.schemaVersion=1;assert.throws(()=>parseStatisticalBundle(b));
 const c=fixture();c.snapshots[0].loading='EQUAL250';assert.throws(()=>parseStatisticalBundle(c));
 const d=fixture();d.histories=[{variant:'ONE_YEAR_EQUAL',loading:'EW63',basket:'AVAILABLE_NOT_AI35',points:[{date:dates.at(-1),nHoldings:31,correlations:Array(20).fill(0),risk:[0,0,0,0],volatility:0}]}];assert.throws(()=>parseStatisticalBundle(d));
});

test('private API exposes only chart outputs, rejects writes, and never stores visitor portfolios',async()=>{
 const {createStatisticalApi}=await import('../lib/statistical-api.ts');
 let stored=JSON.stringify(fixture()),writes=0;
 const handle=createStatisticalApi(()=>({adminToken:'test-secret',bucket:{get:async()=>({text:async()=>stored}),put:async(_key,value)=>{stored=value;writes++}}}));
 const url='https://example.test/api/statistical-model';
 const denied=await handle(new Request(url,{method:'PUT',body:stored}));assert.equal(denied.status,401);assert.equal(writes,0);
 const metadata=await (await handle(new Request(url))).json();assert.equal(metadata.snapshots[0].covariance,undefined);assert.equal(metadata.snapshots[0].stocks,undefined);
 const response=await handle(new Request(url,{method:'POST',headers:{origin:'https://factor-scope.vercel.app','Content-Type':'application/json'},body:JSON.stringify({variant:'ONE_YEAR_EQUAL',asOf:snapshot.asOf,holdings:[{ticker:'A',value:100}]})}));
 assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://factor-scope.vercel.app');
 const display=await response.json();assert.equal(display.data.correlations[0],1);assert.ok(display.data.impactBps[0]>0);assert.equal(writes,0);
 const serialized=JSON.stringify(display);for(const field of ['covariance','observedCovariance','stockFactorCovariance','factorVariances','specificVariance','factorReturns','exposures'])assert.ok(!serialized.includes('"'+field+'"'));
 const badOrigin=await handle(new Request(url,{headers:{origin:'https://unrelated.example'}}));assert.equal(badOrigin.status,403);
 const accepted=await handle(new Request(url,{method:'PUT',headers:{authorization:'Bearer test-secret'},body:stored}));assert.equal(accepted.status,200);assert.equal(writes,1);
});
