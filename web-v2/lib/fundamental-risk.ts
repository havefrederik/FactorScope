import {ledoitWolf} from './shrinkage-risk.ts';
export type FundamentalBundle={version:1;kind:'sec-characteristic';asOf:string;universeDate:string;observations:number;referenceCount:number;tickers:string[];stocks:{ticker:string;name:string;sector:string;imputed:string[]}[];factorNames:string[];industryCount:number;industryReference:string;exposures:number[][];factorReturns:number[][];statLoadings:number[][];statReturns:number[][];statVariances:number[];residualCovariance:number[][];gram:number[][];residualProjection:number[][];squaredNorms:number[];covarianceNormSquared:number;loadingCovarianceQuadratic:number[];residualTrace:number;limitations:string[]};
export type FundamentalDisplay={asOf:string;universeDate:string;observations:number;referenceCount:number;modelLabel:string;tickers:string[];covariance:number[][];specificVolatility:number[];factorShrinkage:number;shrinkage:number;factors:{name:string;group:string;unit:string;asOf:string;values:number[]}[];components:{name:string;group:string;unit:string;asOf:string;values:number[]}[];imputed:{ticker:string;characteristics:string[]}[]};
const dot=(a:number[],b:number[])=>a.reduce((s,v,i)=>s+v*b[i],0);
export function parseFundamentalBundle(value:unknown):FundamentalBundle{
 const b=value as FundamentalBundle,n=b?.tickers?.length,k=b?.factorNames?.length,p=b?.statReturns?.length,t=b?.observations;
 const matrix=(x:unknown,r:number,c:number)=>Array.isArray(x)&&x.length===r&&x.every(v=>Array.isArray(v)&&v.length===c&&v.every(Number.isFinite));
 const vector=(x:unknown,c:number)=>Array.isArray(x)&&x.length===c&&x.every(Number.isFinite);
 if(b?.version!==1||b.kind!=='sec-characteristic'||!/^\d{4}-\d{2}-\d{2}$/.test(b.asOf)||b.universeDate>b.asOf||!n||n>800||b.tickers.some(t=>typeof t!=='string'||!/^[A-Z][A-Z0-9.-]{0,11}$/.test(t))||new Set(b.tickers).size!==n||!k||k>50||b.factorNames.some(n=>typeof n!=='string')||!Number.isInteger(b.industryCount)||b.industryCount<0||b.industryCount>=k||!p||p>20||!Number.isInteger(t)||t<100||t>1000||b.referenceCount<200||b.referenceCount>n||!matrix(b.exposures,n,k)||!matrix(b.factorReturns,k,t)||!matrix(b.statLoadings,n,p)||!matrix(b.statReturns,p,t)||!matrix(b.residualCovariance,n,n)||!matrix(b.gram,p,p)||!matrix(b.residualProjection,p,t)||!vector(b.statVariances,p)||!vector(b.squaredNorms,t)||!vector(b.loadingCovarianceQuadratic,p)||![b.covarianceNormSquared,b.residualTrace].every(Number.isFinite)||!Array.isArray(b.stocks)||b.stocks.length!==n||b.stocks.some((s,i)=>s?.ticker!==b.tickers[i]||!Array.isArray(s.imputed)||s.imputed.some(x=>typeof x!=='string'))||b.statVariances.some(v=>v<=0))throw Error('Invalid fundamental model bundle.');
 return b;
}
/** Joint factor shrinkage in standardized return units; retain cross-factor terms. */
export function factorCovariance(series:number[][]){
 const scales=series.map(x=>{const mean=x.reduce((a,b)=>a+b,0)/x.length;return Math.sqrt(x.reduce((s,v)=>s+(v-mean)**2,0)/x.length)});
 if(scales.some(v=>v<1e-12))throw Error('Degenerate factor history.');
 const fitted=ledoitWolf(series.map((x,i)=>x.map(v=>v/scales[i])));
 return {shrinkage:fitted.shrinkage,covariance:fitted.covariance.map((r,i)=>r.map((v,j)=>v*scales[i]*scales[j]))};
}
/** Exact scaled-identity LW coefficient from broad-universe sufficient statistics. */
export function residualShrinkage(b:FundamentalBundle,selected:number[]){
 const n=b.tickers.length,t=b.observations;
 const trace=b.residualTrace-selected.reduce((s,k)=>s+b.statVariances[k]*b.gram[k][k],0);
 let norm=b.covarianceNormSquared-2*selected.reduce((s,k)=>s+b.statVariances[k]*b.loadingCovarianceQuadratic[k],0);
 for(const k of selected)for(const l of selected)norm+=b.statVariances[k]*b.statVariances[l]*b.gram[k][l]**2;
 let fourth=0;
 for(let day=0;day<t;day++){
  let q=b.squaredNorms[day]-2*selected.reduce((s,k)=>s+b.statReturns[k][day]*b.residualProjection[k][day],0);
  for(const k of selected)for(const l of selected)q+=b.statReturns[k][day]*b.statReturns[l][day]*b.gram[k][l];
  fourth+=Math.max(0,q)**2/t;
 }
 const delta=Math.max(0,norm-trace*trace/n),beta=Math.max(0,(fourth-norm)/t);
 return {shrinkage:delta>1e-30?Math.min(1,beta/delta):0,mu:Math.max(0,trace/n)};
}
export function fundamentalDisplay(b:FundamentalBundle,tickers:string[],asOf:string,selected:number[]):FundamentalDisplay{
 if(asOf!==b.asOf)throw Error(`Fundamental forecast available for ${b.asOf}. Choose that model date.`);
 if(!Array.isArray(tickers)||!tickers.length||tickers.length>100||tickers.some(t=>typeof t!=='string'||!/^[A-Z][A-Z0-9.-]{0,11}$/.test(t))||new Set(tickers.map(t=>t.replaceAll('-','.'))).size!==tickers.length)throw Error('Supply up to 100 unique stock tickers.');
 if(!Array.isArray(selected)||new Set(selected).size!==selected.length||selected.some(k=>!Number.isInteger(k)||k<0||k>=b.statReturns.length))throw Error('Choose available residual factors.');
 const indices=tickers.map(t=>b.tickers.findIndex(s=>s.replaceAll('-','.')===t.replaceAll('-','.')));
 if(indices.some(i=>i<0))throw Error(`Fundamental coverage missing: ${tickers.filter((_,i)=>indices[i]<0).join(', ')}.`);
 const joint=factorCovariance([...b.factorReturns,...selected.map(k=>b.statReturns[k])]);
 const B=indices.map(i=>[...b.exposures[i],...selected.map(k=>b.statLoadings[i][k])]);
 const C=B.map(row=>joint.covariance.map(c=>dot(c,row)));
 const shrink=residualShrinkage(b,selected);
 const specific=indices.map((i,a)=>indices.map((j,c)=>{
  const raw=b.residualCovariance[i][j]-selected.reduce((s,k)=>s+b.statVariances[k]*b.statLoadings[i][k]*b.statLoadings[j][k],0);
  return (1-shrink.shrinkage)*raw+(a===c?shrink.shrinkage*shrink.mu:0);
 }));
 return {asOf:b.asOf,universeDate:b.universeDate,observations:b.observations,referenceCount:b.referenceCount,tickers,
  modelLabel:`SEC fundamentals + ${selected.length} residual ${selected.length===1?'PC':'PCs'} · Ledoit–Wolf`,
  covariance:B.map((r,i)=>B.map((_,j)=>252*(dot(r,C[j])+specific[i][j]))),
  specificVolatility:specific.map((r,i)=>Math.sqrt(Math.max(0,252*r[i]))),factorShrinkage:joint.shrinkage,shrinkage:shrink.shrinkage,
  factors:b.factorNames.map((name,k)=>({name,group:k===0?'Core':k<=b.industryCount?'Sector':'Style',unit:k===0?'unit exposure':k<=b.industryCount?'SIC contrast':'characteristic z-score',asOf:b.asOf,values:indices.map(i=>b.exposures[i][k])})),
  components:b.statReturns.map((_,k)=>({name:`Fundamental residual PC${k+1}`,group:'Residual statistical',unit:'pp per daily 1σ factor move',asOf:b.asOf,values:indices.map(i=>100*b.statLoadings[i][k]*Math.sqrt(b.statVariances[k]))})),
  imputed:indices.filter(i=>b.stocks[i].imputed.length).map(i=>({ticker:b.tickers[i],characteristics:b.stocks[i].imputed}))};
}
