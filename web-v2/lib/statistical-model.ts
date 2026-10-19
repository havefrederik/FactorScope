export type StatisticalStock={ticker:string;exposures:number[];specificVariance:number};
export type FactorProfile={positive:{ticker:string;correlation:number}[];negative:{ticker:string;correlation:number}[]};
export type StatisticalSnapshot={asOf:string;variant:string;population:string;donorCount:number;loading:string;dates:string[];observedCovariance:number[][];stockFactorCovariance:number[][];factorVariances:number[];covariance:number[][];stocks:StatisticalStock[];profiles:FactorProfile[]};
export type StatisticalHistory={variant:string;loading:string;basket:string;points:{date:string;nHoldings:number;correlations:number[];risk:number[];volatility:number}[]};
export type AiCoveragePoint={date:string;tickers:string[]};
export type StatisticalBundle={schemaVersion:2;title:string;source:string;dataThrough:string;sourceHash:string;historyDates?:string[];aiCoverage?:AiCoveragePoint[];universeNote:string;aiBasket:string[];snapshots:StatisticalSnapshot[];histories:StatisticalHistory[]};
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const vector=(x:unknown,n:number):x is number[]=>Array.isArray(x)&&x.length===n&&x.every(finite);
const date=(s:unknown):s is string=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s));
const dates=(a:unknown,n?:number):a is string[]=>Array.isArray(a)&&(!n||a.length===n)&&a.every((s,i)=>date(s)&&(!i||s>a[i-1]));
export function parseStatisticalBundle(input:unknown):StatisticalBundle{
 const b=input as StatisticalBundle;
 const fail=()=>{throw new Error('This file is not a valid FactorScope statistical-model export.');};
 if(!b||b.schemaVersion!==2||!date(b.dataThrough)||typeof b.title!=='string'||typeof b.source!=='string'||typeof b.universeNote!=='string'||!Array.isArray(b.aiBasket)||b.aiBasket.length!==35||!b.aiBasket.every(x=>typeof x==='string')||!Array.isArray(b.snapshots)||!b.snapshots.length||b.snapshots.length>500||!Array.isArray(b.histories))fail();
 if(b.historyDates&&(!dates(b.historyDates)||b.historyDates.length>1000||b.historyDates.some(d=>d>b.dataThrough)||!/^([a-f0-9]{64})$/.test(b.sourceHash)))fail();
 const keys=new Set<string>();
 for(const s of b.snapshots){
  if(!s||!date(s.asOf)||s.asOf>b.dataThrough||!['REFERENCE','ONE_YEAR_EQUAL'].includes(s.variant)||s.loading!=='EW63'||!Number.isInteger(s.donorCount)||s.donorCount<21||typeof s.population!=='string'||!dates(s.dates,250)||s.dates.at(-1)!==s.asOf||!Array.isArray(s.covariance)||s.covariance.length!==20||!s.covariance.every(r=>vector(r,20))||!Array.isArray(s.stocks)||s.stocks.length>5000||!s.stocks.length||!Array.isArray(s.profiles)||s.profiles.length!==20)fail();
  const key=s.asOf+s.variant;if(keys.has(key))fail();keys.add(key);
  // Cholesky check rejects asymmetric or invalid risk matrices on import.
  const l=Array.from({length:20},()=>Array(20).fill(0));
  for(let i=0;i<20;i++)for(let j=0;j<=i;j++){
   if(Math.abs(s.covariance[i][j]-s.covariance[j][i])>1e-8*Math.max(1,Math.abs(s.covariance[i][j])))fail();
   let v=s.covariance[i][j];for(let k=0;k<j;k++)v-=l[i][k]*l[j][k];
   if(i===j){if(v<=0)fail();l[i][j]=Math.sqrt(v);}else l[i][j]=v/l[j][j];
  }
  const names=new Set<string>();for(const x of s.stocks){if(!x||typeof x.ticker!=='string'||!x.ticker||names.has(x.ticker)||!vector(x.exposures,20)||!finite(x.specificVariance)||x.specificVariance<=0)fail();names.add(x.ticker);}
  const n=s.stocks.length;
  if(!Array.isArray(s.observedCovariance)||s.observedCovariance.length!==n||!s.observedCovariance.every(r=>vector(r,n))||!Array.isArray(s.stockFactorCovariance)||s.stockFactorCovariance.length!==n||!s.stockFactorCovariance.every(r=>vector(r,20))||!vector(s.factorVariances,20)||s.factorVariances.some(v=>v<=0))fail();
  for(let i=0;i<n;i++){if(s.observedCovariance[i][i]<=0)fail();for(let j=0;j<n;j++)if(Math.abs(s.observedCovariance[i][j]-s.observedCovariance[j][i])>1e-10)fail();for(let k=0;k<20;k++)if(Math.abs(s.stockFactorCovariance[i][k])/Math.sqrt(s.observedCovariance[i][i]*s.factorVariances[k])>1.0000001)fail();}
  for(const p of s.profiles)for(const side of [p?.positive,p?.negative])if(!Array.isArray(side)||side.length>20||side.some(x=>!x||typeof x.ticker!=='string'||!finite(x.correlation)||Math.abs(x.correlation)>1.00000001))fail();
 }
 const historyKeys=new Set<string>();
 for(const h of b.histories){
  if(!h||!['REFERENCE','ONE_YEAR_EQUAL'].includes(h.variant)||h.loading!=='EW63'||!['AVAILABLE_NOT_AI35','AI35','AI32'].includes(h.basket)||!Array.isArray(h.points)||h.points.length>10000||!dates(h.points.map(p=>p.date)))fail();
  const key=h.variant+h.basket;if(historyKeys.has(key))fail();historyKeys.add(key);
  for(const p of h.points)if(!Number.isInteger(p.nHoldings)||p.nHoldings<32||p.nHoldings>35||(h.basket==='AI35'&&p.nHoldings!==35)||(h.basket==='AI32'&&p.nHoldings!==32)||p.date>b.dataThrough||!vector(p.correlations,20)||p.correlations.some(c=>c<0||c>1.00000001)||!vector(p.risk,4)||!finite(p.volatility)||p.volatility<0||Math.abs(p.risk.reduce((a,c)=>a+c,0)-p.volatility*1e4)>1e-5)fail();
 }
 if(b.aiCoverage!==undefined){
  const h=b.histories.find(h=>h.variant==='ONE_YEAR_EQUAL'&&h.basket==='AVAILABLE_NOT_AI35');
  if(!Array.isArray(b.aiCoverage)||!h||b.aiCoverage.length!==h.points.length||!dates(b.aiCoverage.map(p=>p.date)))fail();
  for(const [i,p] of b.aiCoverage.entries())if(!p||p.date!==h!.points[i].date||!Array.isArray(p.tickers)||p.tickers.length!==h!.points[i].nHoldings||new Set(p.tickers).size!==p.tickers.length||p.tickers.some(t=>!b.aiBasket.includes(t)))fail();
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
 const missing=[...weights.keys()].filter(t=>!byName.has(t));if(missing.length)throw new Error(`Model coverage missing: ${missing.join(', ')}. The built-in model does not cover these stocks; missing positions are not removed or reweighted.`);
 const exposure=Array(20).fill(0);let specific=0;
 const indexed=[...weights].map(([ticker,weight])=>({ticker,weight,index:s.stocks.findIndex(x=>x===byName.get(ticker))}));
 const corr=(cov:number,a:number,b:number)=>a>1e-24&&b>1e-24?Math.max(-1,Math.min(1,cov/Math.sqrt(a*b))):null;
 const stocks=indexed.map(({ticker,weight,index})=>{const x=s.stocks[index];x.exposures.forEach((v,k)=>exposure[k]+=weight*v);specific+=weight*weight*x.specificVariance;return {ticker,weight,exposures:x.exposures,correlations:s.factorVariances.map((v,k)=>corr(s.stockFactorCovariance[index][k],s.observedCovariance[index][index],v))};});
 const observedVariance=indexed.reduce((sum,a)=>sum+indexed.reduce((sub,b)=>sub+a.weight*b.weight*s.observedCovariance[a.index][b.index],0),0);
 const correlations=s.factorVariances.map((v,k)=>corr(indexed.reduce((sum,a)=>sum+a.weight*s.stockFactorCovariance[a.index][k],0),observedVariance,v));
 const marginal=s.covariance.map(row=>row.reduce((a,h,k)=>a+h*exposure[k],0));
 const contributions=exposure.map((v,k)=>v*marginal[k]);const variance=specific+contributions.reduce((a,b)=>a+b,0);
 const volatility=Math.sqrt(Math.max(0,variance)*252);
 return {volatility,variance,exposure,commonShare:variance>0?contributions.reduce((a,b)=>a+b,0)/variance:0,specificShare:variance>0?specific/variance:0,contributions:contributions.map(v=>variance>0?v/variance:0),correlations,stocks};
}
