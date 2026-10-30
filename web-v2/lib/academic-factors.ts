import {hybridRisk} from './shrinkage-risk.ts';
import {summarizeCovariance} from './covariance-comparison.ts';
import type {MarketPayload,CovarianceForecastAnalytics} from './analytics.ts';
export type AcademicFactors={source:string;through:string;retrievedAt:string;names:string[];rows:{date:string;values:number[];rf:number}[]};
export function parseFrenchCsv(csv:string,columns:number){
 const rows=new Map<string,number[]>();
 for(const line of csv.split(/\r?\n/)){
  const cells=line.split(',').map(s=>s.trim());if(!/^\d{8}$/.test(cells[0])||cells.length<columns+1)continue;
  const values=cells.slice(1,columns+1).map(Number);if(values.some(v=>!Number.isFinite(v)||v===-99.99||v===-999))continue;
  rows.set(`${cells[0].slice(0,4)}-${cells[0].slice(4,6)}-${cells[0].slice(6,8)}`,values.map(v=>v/100));
 }
 if(rows.size<253)throw Error('Incomplete French factor history.');return rows;
}
export function combineFrench(five:string,momentum:string):AcademicFactors{
 const f=parseFrenchCsv(five,6),m=parseFrenchCsv(momentum,1);
 const dates=[...f.keys()].filter(d=>m.has(d)).sort();if(dates.length<253)throw Error('French factor dates do not align.');
 return {source:'Kenneth French Data Library · daily FF5 + momentum',through:dates.at(-1)!,retrievedAt:new Date().toISOString(),names:['Market − RF','Size (SMB)','Value (HML)','Profitability (RMW)','Investment (CMA)','Momentum (Mom)'],rows:dates.map(date=>({date,values:[...f.get(date)!.slice(0,5),m.get(date)![0]],rf:f.get(date)![5]}))};
}
/** Multivariate time-series exposures via QR, not company characteristics. */
export function timeSeriesExposures(assets:number[][],factors:number[][]){
 const center=(x:number[])=>{const m=x.reduce((s,v)=>s+v,0)/x.length;return x.map(v=>v-m)},dot=(a:number[],b:number[])=>a.reduce((s,v,i)=>s+v*b[i],0);
 const Q:number[][]=[],R=factors.map(()=>factors.map(()=>0));
 for(let j=0;j<factors.length;j++){
  let v=center(factors[j]);for(let pass=0;pass<2;pass++)for(let i=0;i<j;i++){const r=dot(Q[i],v);R[i][j]+=r;v=v.map((x,t)=>x-r*Q[i][t]);}
  R[j][j]=Math.sqrt(dot(v,v));if(R[j][j]<1e-10)throw Error('Academic factors are rank deficient.');Q.push(v.map(x=>x/R[j][j]));
 }
 return assets.map(raw=>{const y=center(raw),b=Q.map(q=>dot(q,y));for(let i=b.length-1;i>=0;i--){for(let j=i+1;j<b.length;j++)b[i]-=R[i][j]*b[j];b[i]/=R[i][i];}return b;});
}
export function academicRisk(payload:MarketPayload,base:CovarianceForecastAnalytics,weights:number[],data:AcademicFactors){
 if(base.asOf>data.through)throw Error(`French factors end on ${data.through}. Choose that date or earlier.`);
 const rows=data.rows.filter(r=>r.date<=base.asOf).slice(-252),stocks=base.tickers.map(t=>payload.series[t]?.points??[]);
 if(rows.length!==252||rows.at(-1)!.date!==base.asOf)throw Error('Need 252 matching French factor sessions.');
 const assets=stocks.map(points=>{const map=new Map(points.map((p,i)=>[p.date,i]));return rows.map(r=>{const i=map.get(r.date);if(i===undefined||i<1)throw Error('Stock and French factor dates do not align.');
  const previous=points[i-1].date,priorFactor=data.rows.findIndex(v=>v.date===r.date)-1;
  if(priorFactor<0||data.rows[priorFactor].date!==previous)throw Error('Stock return interval crosses a missing French session.');
  return points[i].close/points[i-1].close-1-r.rf;});});
 const f=data.names.map((_,k)=>rows.map(r=>r.values[k])),betas=timeSeriesExposures(assets,f),fit=hybridRisk(assets,f,[]),matrix=fit.covariance.map(r=>r.map(v=>252*v));
 const specificVolatility=assets.map((x,i)=>{const residual=x.map((v,t)=>v-f.reduce((s,q,k)=>s+betas[i][k]*q[t],0)),mean=residual.reduce((s,v)=>s+v,0)/residual.length;return Math.sqrt(252*residual.reduce((s,v)=>s+(v-mean)**2,0)/residual.length)});
 return {forecast:{...base,...summarizeCovariance(matrix,base.tickers,weights),observations:252,expertWeights:[],modelLabel:'Fama–French 5 + momentum · residual Ledoit–Wolf',shrinkage:fit.shrinkage},components:[],specificVolatility,
  factors:data.names.map((name,k)=>({name:`French: ${name}`,group:k===0?'Core':'Style',unit:'time-series beta',asOf:base.asOf,values:betas.map(b=>b[k])}))};
}
