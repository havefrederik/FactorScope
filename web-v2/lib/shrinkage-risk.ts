import { factorDefs, type MarketPayload, type CovarianceForecastAnalytics } from './analytics.ts';
import { summarizeCovariance } from './covariance-comparison.ts';
export const riskEstimators = ['SEC fundamentals + residual PCA', 'Fama–French 5 + momentum', 'CM-IEWMA', 'Ledoit–Wolf', 'ETF proxies + residual PCA'] as const;
export type RiskEstimator = typeof riskEstimators[number];
const dot=(a:number[],b:number[])=>a.reduce((s,v,i)=>s+v*b[i],0);
const centered=(x:number[])=>{const m=x.reduce((s,v)=>s+v,0)/x.length;return x.map(v=>v-m)};
const covariance=(x:number[][])=>x.map(a=>x.map(b=>dot(a,b)/a.length));

/** Ledoit–Wolf (2004, JMA), demeaned MLE covariance, scaled-identity target.
 * Input is asset × observation, matching the aligned panel used by the optimizer. */
export function ledoitWolf(series:number[][]) {
  const p=series.length,n=series[0]?.length??0;
  if(!p||n<2||series.some(x=>x.length!==n||x.some(v=>!Number.isFinite(v))))throw Error('Shrinkage requires a finite aligned return panel.');
  const x=series.map(centered),sample=covariance(x),mu=sample.reduce((s,r,i)=>s+r[i],0)/p;
  const delta=sample.reduce((s,r,i)=>s+r.reduce((z,v,j)=>z+(v-(i===j?mu:0))**2,0),0);
  let beta=0;
  for(let t=0;t<n;t++)for(let i=0;i<p;i++)for(let j=0;j<p;j++)beta+=(x[i][t]*x[j][t]-sample[i][j])**2;
  beta/=n*n;
  const shrinkage=delta>1e-30?Math.min(1,Math.max(0,beta/delta)):0;
  return {shrinkage,covariance:sample.map((r,i)=>r.map((v,j)=>(1-shrinkage)*v+(i===j?shrinkage*mu:0)))};
}

/** Symmetric Jacobi eigen-decomposition, descending variance order. */
export function principalComponents(matrix:number[][]){
  const n=matrix.length,a=matrix.map(r=>[...r]),v=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?1:0) as number[]);
  const scale=Math.max(...a.map((r,i)=>Math.abs(r[i])),1e-30);
  for(let sweep=0;sweep<60;sweep++){
    let largest=0;
    for(let p=0;p<n;p++)for(let q=p+1;q<n;q++){
      const off=a[p][q];largest=Math.max(largest,Math.abs(off));if(Math.abs(off)<scale*1e-13)continue;
      const angle=.5*Math.atan2(2*off,a[q][q]-a[p][p]),c=Math.cos(angle),s=Math.sin(angle);
      const pp=a[p][p],qq=a[q][q];
      a[p][p]=c*c*pp-2*s*c*off+s*s*qq;a[q][q]=s*s*pp+2*s*c*off+c*c*qq;a[p][q]=a[q][p]=0;
      for(let k=0;k<n;k++){
        if(k!==p&&k!==q){const kp=a[k][p],kq=a[k][q];a[k][p]=a[p][k]=c*kp-s*kq;a[k][q]=a[q][k]=s*kp+c*kq;}
        const vp=v[k][p],vq=v[k][q];v[k][p]=c*vp-s*vq;v[k][q]=s*vp+c*vq;
      }
    }
    if(largest<scale*1e-12)break;
  }
  return a.map((r,i)=>{let vector=v.map(row=>row[i]);const anchor=vector.reduce((k,x,j)=>Math.abs(x)>Math.abs(vector[k])?j:k,0);if(vector[anchor]<0)vector=vector.map(x=>-x);return {variance:Math.max(0,r[i]),vector}}).sort((a,b)=>b.variance-a.variance);
}

/** Reorthogonalized projection onto observed factor span, including intercept.
 * Redundant proxy columns are omitted, rather than destabilizing an inverse. */
export function hybridRisk(returns:number[][], observedFactors:number[][], selected:number[]){
  const x=returns.map(centered),n=x[0].length,basis:number[][]=[];
  for(const raw of observedFactors){let u=centered(raw);const initial=dot(u,u);
    for(let pass=0;pass<2;pass++)for(const q of basis){const b=dot(u,q);u=u.map((v,i)=>v-b*q[i]);}
    const norm=Math.sqrt(dot(u,u));if(norm>Math.sqrt(initial)*1e-9&&norm>1e-12)basis.push(u.map(v=>v/norm));
  }
  const fitted=x.map(row=>{const co=basis.map(q=>dot(row,q));return row.map((_,t)=>basis.reduce((s,q,j)=>s+co[j]*q[t],0))});
  const residual=x.map((r,i)=>r.map((v,t)=>v-fitted[i][t]));
  const components=principalComponents(covariance(residual)).filter(c=>c.variance>1e-14);
  if(selected.some(i=>!Number.isInteger(i)||i<0||i>=components.length)||new Set(selected).size!==selected.length)throw Error('Choose available residual factors.');
  const common=fitted.map(r=>[...r]);
  for(const k of selected){const c=components[k];const score=Array.from({length:n},(_,t)=>residual.reduce((s,r,i)=>s+c.vector[i]*r[t],0));common.forEach((r,i)=>r.forEach((_,t)=>r[t]+=c.vector[i]*score[t]));}
  const remaining=x.map((r,i)=>r.map((v,t)=>v-common[i][t]));
  const lw=ledoitWolf(remaining),commonCov=covariance(common);
  return {covariance:commonCov.map((r,i)=>r.map((v,j)=>v+lw.covariance[i][j])),shrinkage:lw.shrinkage,rank:basis.length,
    components:components.map((c,k)=>({name:`Residual PC${k+1}`,group:'Residual statistical',values:c.vector.map(v=>100*v*Math.sqrt(c.variance)),unit:'pp per daily 1σ factor move',variance:c.variance}))};
}

export function alternativeRisk(payload:MarketPayload,base:CovarianceForecastAnalytics,weights:number[],mode:RiskEstimator,selected:number[]){
  if(mode==='SEC fundamentals + residual PCA'||mode==='Fama–French 5 + momentum')throw Error('This model requires its dated external data.');
  if(mode==='CM-IEWMA')return {forecast:base,components:[] as ReturnType<typeof hybridRisk>['components']};
  const symbols=[...new Set([...base.tickers,...(mode==='ETF proxies + residual PCA'?factorDefs.flatMap(f=>[f.long,...(f.short?[f.short]:[])]):[])])];
  const maps=new Map(symbols.map(t=>[t,new Map(payload.series[t]?.points.filter(p=>p.date<=base.asOf).map(p=>[p.date,p.close])??[])]));
  const dates=[...maps.get(base.tickers[0])!.keys()].filter(d=>symbols.every(t=>maps.get(t)!.has(d))).sort().slice(-253);
  if(dates.length<253||dates.at(-1)!==base.asOf)throw Error('This risk model requires 252 aligned daily returns through the decision date.');
  const series=new Map(symbols.map(t=>[t,dates.slice(1).map((d,i)=>maps.get(t)!.get(d)!/maps.get(t)!.get(dates[i])!-1)]));
  const assets=base.tickers.map(t=>series.get(t)!);
  const estimate=mode==='Ledoit–Wolf'?{...ledoitWolf(assets),components:[] as ReturnType<typeof hybridRisk>['components']}:hybridRisk(assets,factorDefs.map(f=>series.get(f.long)!.map((v,i)=>v-(f.short?series.get(f.short)![i]:0))),selected);
  const matrix=estimate.covariance.map(r=>r.map(v=>252*v));
  return {forecast:{...base,...summarizeCovariance(matrix,base.tickers,weights),observations:252,expertWeights:[],modelLabel:mode==='Ledoit–Wolf'?'Ledoit–Wolf · scaled identity':`ETF proxies + ${selected.length} residual PCs · residual Ledoit–Wolf`,shrinkage:estimate.shrinkage},components:estimate.components};
}
