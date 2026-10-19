export type StatisticalStock={ticker:string;exposures:number[];specificVariance:number;returns:number[]};
export type FactorProfile={positive:{ticker:string;correlation:number}[];negative:{ticker:string;correlation:number}[]};
export type StatisticalSnapshot={asOf:string;variant:string;population:string;donorCount:number;loading:string;dates:string[];factorReturns:number[][];covariance:number[][];stocks:StatisticalStock[];profiles:FactorProfile[]};
export type StatisticalHistory={variant:string;basket:string;points:{date:string;correlations:number[];risk:number[];volatility:number}[]};
export type StatisticalBundle={schemaVersion:1;title:string;source:string;dataThrough:string;sourceHash:string;universeNote:string;aiBasket:string[];snapshots:StatisticalSnapshot[];histories:StatisticalHistory[]};
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const vector=(x:unknown,n:number):x is number[]=>Array.isArray(x)&&x.length===n&&x.every(finite);
const date=(s:unknown):s is string=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s));
const dates=(a:unknown,n?:number):a is string[]=>Array.isArray(a)&&(!n||a.length===n)&&a.every((s,i)=>date(s)&&(!i||s>a[i-1]));
export function parseStatisticalBundle(input:unknown):StatisticalBundle{
 const b=input as StatisticalBundle;
 const fail=()=>{throw new Error('This file is not a valid FactorScope statistical-model export.');};
 if(!b||b.schemaVersion!==1||!date(b.dataThrough)||typeof b.title!=='string'||typeof b.source!=='string'||typeof b.universeNote!=='string'||!Array.isArray(b.aiBasket)||b.aiBasket.length!==35||!b.aiBasket.every(x=>typeof x==='string')||!Array.isArray(b.snapshots)||!b.snapshots.length||b.snapshots.length>500||!Array.isArray(b.histories))fail();
 const keys=new Set<string>();
 for(const s of b.snapshots){
  if(!s||!date(s.asOf)||s.asOf>b.dataThrough||!['REFERENCE','ONE_YEAR_EQUAL'].includes(s.variant)||s.loading!=='EQUAL250'||!Number.isInteger(s.donorCount)||s.donorCount<21||typeof s.population!=='string'||!dates(s.dates,250)||s.dates.at(-1)!==s.asOf||!Array.isArray(s.factorReturns)||s.factorReturns.length!==250||!s.factorReturns.every(r=>vector(r,20))||!Array.isArray(s.covariance)||s.covariance.length!==20||!s.covariance.every(r=>vector(r,20))||!Array.isArray(s.stocks)||s.stocks.length>5000||!s.stocks.length||!Array.isArray(s.profiles)||s.profiles.length!==20)fail();
  const key=s.asOf+s.variant;if(keys.has(key))fail();keys.add(key);
  // Cholesky check rejects asymmetric or invalid risk matrices on import.
  const l=Array.from({length:20},()=>Array(20).fill(0));
  for(let i=0;i<20;i++)for(let j=0;j<=i;j++){
   if(Math.abs(s.covariance[i][j]-s.covariance[j][i])>1e-8*Math.max(1,Math.abs(s.covariance[i][j])))fail();
   let v=s.covariance[i][j];for(let k=0;k<j;k++)v-=l[i][k]*l[j][k];
   if(i===j){if(v<=0)fail();l[i][j]=Math.sqrt(v);}else l[i][j]=v/l[j][j];
  }
  const names=new Set<string>();for(const x of s.stocks){if(!x||typeof x.ticker!=='string'||!x.ticker||names.has(x.ticker)||!vector(x.exposures,20)||!finite(x.specificVariance)||x.specificVariance<=0||!vector(x.returns,250))fail();names.add(x.ticker);}
  for(const p of s.profiles)for(const side of [p?.positive,p?.negative])if(!Array.isArray(side)||side.length>20||side.some(x=>!x||typeof x.ticker!=='string'||!finite(x.correlation)||Math.abs(x.correlation)>1.00000001))fail();
 }
 const historyKeys=new Set<string>();
 for(const h of b.histories){
  if(!h||!['REFERENCE','ONE_YEAR_EQUAL'].includes(h.variant)||!['AI35','AI32'].includes(h.basket)||!Array.isArray(h.points)||h.points.length>10000||!dates(h.points.map(p=>p.date)))fail();
  const key=h.variant+h.basket;if(historyKeys.has(key))fail();historyKeys.add(key);
  for(const p of h.points)if(p.date>b.dataThrough||!vector(p.correlations,20)||p.correlations.some(c=>c<0||c>1.00000001)||!vector(p.risk,4)||!finite(p.volatility)||p.volatility<0||Math.abs(p.risk.reduce((a,c)=>a+c,0)-p.volatility*1e4)>1e-5)fail();
 }
 return b;
}
export function correlation(a:number[],b:number[]):number|null{
 if(a.length!==b.length||a.length<2)return null;
 const ma=a.reduce((x,y)=>x+y,0)/a.length,mb=b.reduce((x,y)=>x+y,0)/b.length;
 let aa=0,bb=0,ab=0;for(let i=0;i<a.length;i++){const x=a[i]-ma,y=b[i]-mb;aa+=x*x;bb+=y*y;ab+=x*y;}
 return aa>1e-24&&bb>1e-24?Math.max(-1,Math.min(1,ab/Math.sqrt(aa*bb))):null;
}
export function analyseStatisticalPortfolio(s:StatisticalSnapshot,holdings:{ticker:string;value:number}[]){
 const total=holdings.reduce((a,h)=>a+h.value,0);
 if(!finite(total)||total<=0||holdings.some(h=>!finite(h.value)))throw new Error('Portfolio net value must be positive.');
 const weights=new Map<string,number>();for(const h of holdings){const name=h.ticker.replace(/-/g,'.');if(name!=='CASH'&&Math.abs(h.value)>1e-12)weights.set(name,(weights.get(name)??0)+h.value/total);}
 const byName=new Map(s.stocks.map(x=>[x.ticker.replace(/-/g,'.'),x]));
 const missing=[...weights.keys()].filter(t=>!byName.has(t));if(missing.length)throw new Error(`Model coverage missing: ${missing.join(', ')}. Import a snapshot covering these stocks; missing positions are not removed or reweighted.`);
 const columns=Array.from({length:20},(_,k)=>s.factorReturns.map(r=>r[k]));
 const exposure=Array(20).fill(0),returns=Array(250).fill(0);let specific=0;
 const stocks=[...weights].map(([ticker,weight])=>{const x=byName.get(ticker)!;x.exposures.forEach((v,k)=>exposure[k]+=weight*v);x.returns.forEach((v,k)=>returns[k]+=weight*v);specific+=weight*weight*x.specificVariance;return {ticker,weight,correlations:columns.map(c=>correlation(x.returns,c))};});
 const marginal=s.covariance.map(row=>row.reduce((a,h,k)=>a+h*exposure[k],0));
 const contributions=exposure.map((v,k)=>v*marginal[k]);const variance=specific+contributions.reduce((a,b)=>a+b,0);
 const volatility=Math.sqrt(Math.max(0,variance)*252);
 return {volatility,variance,commonShare:variance>0?contributions.reduce((a,b)=>a+b,0)/variance:0,specificShare:variance>0?specific/variance:0,contributions:contributions.map(v=>variance>0?v/variance:0),correlations:columns.map(c=>correlation(returns,c)),stocks};
}
