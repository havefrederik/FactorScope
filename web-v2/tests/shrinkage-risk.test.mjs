import test from 'node:test';
import assert from 'node:assert/strict';
import {ledoitWolf,hybridRisk,principalComponents,alternativeRisk} from '../lib/shrinkage-risk.ts';
import {factorDefs} from '../lib/analytics.ts';
const close=(a,b,t=1e-10)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const n=252,t=Array.from({length:n},(_,i)=>i),f=t.map(i=>.01*Math.sin(i*.13)),g=t.map(i=>.02*Math.cos(i*.61));
const x=Array.from({length:6},(_,j)=>t.map((i)=>.003+j*f[i]+(j%2?1:-1)*g[i]+.002*Math.sin(i*(j+1)*.79)));
const covariance=xs=>{const c=xs.map(r=>{const m=r.reduce((a,b)=>a+b,0)/n;return r.map(v=>v-m)});return c.map(a=>c.map(b=>a.reduce((s,v,i)=>s+v*b[i],0)/n))};
test('Jacobi decomposition reconstructs covariance and orthogonal eigenvectors',()=>{
 const c=covariance(x),pcs=principalComponents(c);for(let i=0;i<6;i++)for(let j=0;j<6;j++)close(pcs.reduce((s,p)=>s+p.variance*p.vector[i]*p.vector[j],0),c[i][j]);
 pcs.forEach((p,i)=>pcs.forEach((q,j)=>close(p.vector.reduce((s,v,k)=>s+v*q.vector[k],0),i===j?1:0)));
});
test('hybrid retains unselected risk; all PCs reconstruct the sample; redundant proxies do not double count',()=>{
 const a=hybridRisk(x,[f],[]),b=hybridRisk(x,[f,f.map(v=>2*v)],[]);assert.equal(a.rank,1);assert.equal(b.rank,1);
 a.covariance.forEach((r,i)=>r.forEach((v,j)=>close(v,b.covariance[i][j])));
 const all=hybridRisk(x,[f],a.components.map((_,i)=>i)),sample=covariance(x);
 all.covariance.forEach((r,i)=>r.forEach((v,j)=>close(v,sample[i][j])));
 const one=hybridRisk(x,[f],[0]);for(const result of [a,one,all]){
  const eig=principalComponents(result.covariance);assert.ok(eig.every(e=>e.variance>=0));
  // Trace preservation: no factor selection is allowed to delete risk.
  close(result.covariance.reduce((s,r,i)=>s+r[i],0),sample.reduce((s,r,i)=>s+r[i],0));
 }
 assert.throws(()=>hybridRisk(x,[f],[0,0]));assert.throws(()=>hybridRisk(x,[f],[99]));
});
test('shrinkage handles singular and constant panels, and rejects invalid data',()=>{
 for(const r of [[[1,2,3],[2,4,6]],[[1,1,1],[2,2,2]],[[1,2,3]]]){
  const s=ledoitWolf(r);assert.ok(s.shrinkage>=0&&s.shrinkage<=1);assert.ok(s.covariance.flat().every(Number.isFinite));
 }
 assert.throws(()=>ledoitWolf([[1,NaN]]));assert.throws(()=>ledoitWolf([[1,2],[1]]));
});
test('risk estimation excludes observations after its decision date',()=>{
 const dates=Array.from({length:270},(_,i)=>new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10));
 const symbols=[...new Set(['AAA','BBB',...factorDefs.flatMap(f=>[f.long,...(f.short?[f.short]:[])])])];
 const series=Object.fromEntries(symbols.map((ticker,j)=>{let price=100;return [ticker,{points:dates.map((date,i)=>({date,close:price*=1+.005*Math.sin(i*(j+1)*.21)}))}]}));
 const base={asOf:dates[252],tickers:['AAA','BBB']};const payload={series};
 for(const mode of ['Ledoit–Wolf','ETF proxies + residual PCA']){
  const before=alternativeRisk(payload,base,[.5,.5],mode,[]);
  const future=structuredClone(payload);Object.values(future.series).forEach(s=>s.points.forEach(p=>{if(p.date>base.asOf)p.close*=2}));
  assert.deepEqual(alternativeRisk(future,base,[.5,.5],mode,[]),before);
 }
});

test('scaled-identity estimator agrees with scikit-learn 1.9.1 reference fixture',async()=>{
 const {readFile}=await import('node:fs/promises');const ref=JSON.parse(await readFile(new URL('./fixtures/ledoit-wolf-reference.json',import.meta.url),'utf8'));
 const actual=ledoitWolf(ref.returns);close(actual.shrinkage,ref.shrinkage);
 actual.covariance.forEach((r,i)=>r.forEach((v,j)=>close(v,ref.covariance[i][j])));
});
