import test from 'node:test';import assert from 'node:assert/strict';
import {ledoitWolf} from '../lib/shrinkage-risk.ts';
import {fundamentalDisplay,residualShrinkage,parseFundamentalBundle,factorCovariance} from '../lib/fundamental-risk.ts';
import {createFundamentalApi} from '../lib/fundamental-api.ts';
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const n=200,t=128,p=3;
const S=Array.from({length:p},(_,k)=>Array.from({length:t},(_,d)=>Math.sin(2*Math.PI*(k+1)*d/t)));
const A=Array.from({length:n},(_,i)=>[.01*Math.sin(i),.005*Math.cos(i),.003*Math.cos(i*.2)]);
const E=Array.from({length:n},(_,i)=>Array.from({length:t},(_,d)=>dot(A[i],S.map(s=>s[d]))+.002*Math.sin(2*Math.PI*(4+i%11)*d/t)));
const C=E.map(x=>E.map(y=>dot(x,y)/t)),G=S.map((_,k)=>S.map((_,l)=>A.reduce((s,a)=>s+a[k]*a[l],0)));
const b={version:1,kind:'sec-characteristic',asOf:'2026-10-29',universeDate:'2026-10-29',observations:t,referenceCount:n,
 tickers:Array.from({length:n},(_,i)=>`X${i}`),stocks:Array.from({length:n},(_,i)=>({ticker:`X${i}`,name:`Name ${i}`,sector:'Manufacturing',imputed:[]})),factorNames:['Fundamental market','Fundamental: Size'],industryCount:0,industryReference:'Manufacturing',
 exposures:A.map((a,i)=>[1,(i-100)/100]),factorReturns:[S[0].map((v,d)=>.01*v+.01*Math.cos(2*Math.PI*15*d/t)),S[2].map(v=>.002*v)],statLoadings:A,statReturns:S,statVariances:[.5,.5,.5],residualCovariance:C,gram:G,
 residualProjection:S.map((_,k)=>Array.from({length:t},(_,d)=>E.reduce((s,row,i)=>s+row[d]*A[i][k],0))),squaredNorms:Array.from({length:t},(_,d)=>E.reduce((s,row)=>s+row[d]**2,0)),
 covarianceNormSquared:C.flat().reduce((s,v)=>s+v*v,0),loadingCovarianceQuadratic:S.map((_,k)=>A.reduce((s,a,i)=>s+a[k]*C[i].reduce((v,c,j)=>v+c*A[j][k],0),0)),residualTrace:C.reduce((s,r,i)=>s+r[i],0),limitations:[]};
test('broad-universe sufficient statistics reproduce direct residual Ledoit–Wolf for arbitrary selected PCs',()=>{
 for(const selected of [[],[0],[1,2],[0,1,2]]){
  const residual=E.map((row,i)=>row.map((v,d)=>v-selected.reduce((s,k)=>s+A[i][k]*S[k][d],0))),direct=ledoitWolf(residual),stats=residualShrinkage(b,selected);
  close(stats.shrinkage,direct.shrinkage);close(stats.mu,direct.covariance.reduce((s,r,i)=>s+r[i],0)/n);
  const display=fundamentalDisplay(b,['X0','X1','X2'],b.asOf,selected),joint=factorCovariance([...b.factorReturns,...selected.map(k=>S[k])]);
  display.covariance.forEach((row,i)=>row.forEach((v,j)=>{const bi=[...b.exposures[i],...selected.map(k=>A[i][k])],bj=[...b.exposures[j],...selected.map(k=>A[j][k])];close(v,252*(dot(bi,joint.covariance.map(r=>dot(r,bj)))+direct.covariance[i][j]));}));
 }
});
test('current exposures and joint cross terms drive forecasts; portfolio subsetting preserves covariance',()=>{
 const all=fundamentalDisplay(b,['X0','X1','X2'],b.asOf,[0]),part=fundamentalDisplay(b,['X2','X0'],b.asOf,[0]);
 close(part.covariance[0][1],all.covariance[2][0]);close(part.shrinkage,all.shrinkage);
 const changed=structuredClone(b);changed.exposures[0][0]=2;assert.notEqual(fundamentalDisplay(changed,['X0'],b.asOf,[0]).covariance[0][0],all.covariance[0][0]);
 for(const w of [[1,0,0],[1,-1,.2],[.2,.3,.5]])assert.ok(dot(w,all.covariance.map(r=>dot(r,w)))>=-1e-12);
 assert.throws(()=>fundamentalDisplay(b,['MISSING'],b.asOf,[]),/coverage/);assert.throws(()=>fundamentalDisplay(b,['X0'],'2026-10-28',[]),/date/);
 assert.throws(()=>fundamentalDisplay(b,['X0'],b.asOf,[0,0]));assert.throws(()=>parseFundamentalBundle({...b,statVariances:[NaN]}));assert.equal(parseFundamentalBundle(b),b);
});
test('API keeps bundle private, authenticates updates and returns only requested derived results',async()=>{
 let value=JSON.stringify(b);const api=createFundamentalApi(()=>({bucket:{get:async()=>({text:async()=>value}),put:async(_,v)=>{value=v}},adminToken:'test-secret'}));
 const get=await (await api(new Request('https://test/api'))).json();assert.equal(get.referenceCount,n);assert.equal(get.exposures,undefined);assert.equal(get.factorReturns,undefined);
 assert.equal((await api(new Request('https://test/api',{method:'PUT',body:value}))).status,401);
 assert.equal((await api(new Request('https://test/api',{headers:{Origin:'https://bad.example'}}))).status,403);
 const r=await api(new Request('https://test/api',{method:'POST',headers:{Origin:'https://factor-scope.vercel.app'},body:JSON.stringify({tickers:['X0'],asOf:b.asOf,selected:[1]})}));
 assert.equal(r.status,200);const display=await r.json();assert.deepEqual(display.tickers,['X0']);assert.equal(display.factorReturns,undefined);assert.equal(display.residualCovariance,undefined);
});
