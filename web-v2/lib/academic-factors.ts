import {tradingFactorCovariance,validateForecastOptions,horizonLabel,type ForecastOptions} from './forecast-horizon.ts';
import {hybridRisk} from './shrinkage-risk.ts';
import {summarizeCovariance} from './covariance-comparison.ts';
import type {MarketPayload,CovarianceForecastAnalytics} from './analytics.ts';
export type AcademicFactors={source:string;through:string;retrievedAt:string;names:string[];rows:{date:string;values:number[];rf:number}[]};
export function parseFrenchCsv(csv:string,columns:number){
 const rows=new Map<string,number[]>();
 for(const line of csv.split(/\r?\n/)){
  const cells=line.split(',').map(s=>s.trim());if(!/^\d{8}$/.test(cells[0])||cells.length<columns+1)continue;
  if(cells.slice(1,columns+1).some(v=>!v))throw Error('Blank French factor value.');
  const date=`${cells[0].slice(0,4)}-${cells[0].slice(4,6)}-${cells[0].slice(6,8)}`;
  if(!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||rows.has(date))throw Error('Invalid or duplicate French factor date.');
  const values=cells.slice(1,columns+1).map(Number);if(values.some(v=>!Number.isFinite(v)||v===-99.99||v===-999))continue;
  rows.set(date,values.map(v=>v/100));
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
 const n=assets[0]?.length??0;if(n<2||[...assets,...factors].some(x=>x.length!==n||x.some(v=>!Number.isFinite(v))))throw Error('Regression requires finite aligned observations.');
 const center=(x:number[])=>{const m=x.reduce((s,v)=>s+v,0)/x.length;return x.map(v=>v-m)},dot=(a:number[],b:number[])=>a.reduce((s,v,i)=>s+v*b[i],0);
 const Q:number[][]=[],R=factors.map(()=>factors.map(()=>0));
 for(let j=0;j<factors.length;j++){
  let v=center(factors[j]);for(let pass=0;pass<2;pass++)for(let i=0;i<j;i++){const r=dot(Q[i],v);R[i][j]+=r;v=v.map((x,t)=>x-r*Q[i][t]);}
  R[j][j]=Math.sqrt(dot(v,v));if(R[j][j]<1e-10)throw Error('Academic factors are rank deficient.');Q.push(v.map(x=>x/R[j][j]));
 }
 return assets.map(raw=>{const y=center(raw),b=Q.map(q=>dot(q,y));for(let i=b.length-1;i>=0;i--){for(let j=i+1;j<b.length;j++)b[i]-=R[i][j]*b[j];b[i]/=R[i][i];}return b;});
}
export function academicRisk(payload:MarketPayload,base:CovarianceForecastAnalytics,weights:number[],data:AcademicFactors,namedSelection:number[]=data.names.map((_,i)=>i),selected:number[]=[],shrinkageOverride:number|null=null,forecastOptions:ForecastOptions={sessions:1,weighting:'Equal-weight'}){
 validateForecastOptions(forecastOptions);
 if(base.asOf>data.through)throw Error(`French factors end on ${data.through}. Choose that date or earlier.`);
 validateAcademicFactors(data);
 const factorIndex=new Map(data.rows.map((r,i)=>[r.date,i]));
 const rows=data.rows.filter(r=>r.date<=base.asOf).slice(-252),stocks=base.tickers.map(t=>payload.series[t]?.points??[]);
 if(rows.length!==252||rows.at(-1)!.date!==base.asOf)throw Error('Need 252 matching French factor sessions.');
 const assets=stocks.map(points=>{const map=new Map(points.map((p,i)=>[p.date,i]));return rows.map(r=>{const i=map.get(r.date);if(i===undefined||i<1)throw Error('Stock and French factor dates do not align.');
  const previous=points[i-1].date,priorFactor=factorIndex.get(r.date)!-1;
  if(priorFactor<0||data.rows[priorFactor].date!==previous)throw Error('Stock return interval crosses a missing French session.');
  return points[i].close/points[i-1].close-1-r.rf;});});
 if(new Set(namedSelection).size!==namedSelection.length||namedSelection.some(i=>!Number.isInteger(i)||i<0||i>=data.names.length))throw Error('Choose available academic factors.');
 const f=namedSelection.map(k=>rows.map(r=>r.values[k])),betas=timeSeriesExposures(assets,f),fit=hybridRisk(assets,f,selected,shrinkageOverride);
 const factorRows=data.rows.filter(r=>r.date<=base.asOf).slice(-1008);
 const responsive=forecastOptions.weighting==='Responsive'?tradingFactorCovariance(betas,namedSelection.map(k=>factorRows.map(r=>r.values[k])),fit.panels.statistical,fit.panels.specific,fit.residualCovariance,forecastOptions.sessions):null;
 const matrix=(responsive?.covariance??fit.covariance).map(r=>r.map(v=>252*v));
 const specificVolatility=responsive?.specificVolatility??fit.specificVolatility;
 return {forecast:{...base,...summarizeCovariance(matrix,base.tickers,weights),observations:252,forecastSessions:forecastOptions.sessions,horizon:horizonLabel(forecastOptions.sessions),forecastMethod:forecastOptions.weighting==='Responsive'?'Responsive factor risk':'Constant covariance scaling',factorRiskObservations:factorRows.length,expertWeights:[],modelLabel:`Fama–French (${namedSelection.length}) + statistical factors (${selected.length}) · ${forecastOptions.weighting==='Responsive'?'responsive risk':'residual shrinkage'}`,shrinkage:fit.shrinkage},components:fit.components,specificVolatility,
  factors:namedSelection.map((id,k)=>({name:`French: ${data.names[id]}`,group:id===0?'Core':'Style',unit:'time-series beta',asOf:base.asOf,values:betas.map(b=>b[k])}))};
}

/** Reject malformed data instead of silently switching the financial model. */
export function validateAcademicFactors(data:AcademicFactors){
 if(!data||!Array.isArray(data.names)||data.names.length!==6||!Array.isArray(data.rows)||data.rows.length<253)throw Error('Incomplete published factor data.');
 let previous='';
 for(const row of data.rows){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(Date.parse(row.date))||new Date(row.date).toISOString().slice(0,10)!==row.date||row.date<=previous||!Array.isArray(row.values)||row.values.length!==6||[...row.values,row.rf].some(v=>typeof v!=='number'||!Number.isFinite(v)))throw Error('Invalid published factor observations.');
  previous=row.date;
 }
 if(data.through!==previous)throw Error('Published factor end date does not match its observations.');
}
/** Only exact adjacent factor sessions may describe a daily portfolio interval. */
export function alignedAcademicRows(data:AcademicFactors,dates:string[]){
 const index=new Map(data.rows.map((r,i)=>[r.date,i]));
 if(dates.length<2)throw Error('At least two price dates are required.');
 return dates.slice(1).map((date,t)=>{
  const i=index.get(date);
  if(i===undefined||i<1||data.rows[i-1].date!==dates[t])throw Error('Portfolio and published factor return intervals do not align.');
  return data.rows[i];
 });
}
/** One explicit common endpoint; later prices never enter model-based views. */
export function withPublishedFactors(payload:MarketPayload,data:AcademicFactors):MarketPayload{
 validateAcademicFactors(data);
 const dates=new Set(data.rows.map(r=>r.date));
 const benchmark=payload.series.SPY?.points??[];
 const last=benchmark.filter(p=>p.date<=data.through&&dates.has(p.date)).at(-1)?.date;
 if(!last)throw Error('Prices and published factors have no shared history.');
 const series=Object.fromEntries(Object.entries(payload.series).map(([ticker,s])=>[ticker,{...s,points:s.points.filter(p=>p.date<=last)}]));
 const start=series.SPY.points.find(p=>dates.has(p.date))?.date;
 return {...payload,asOf:last,factorStartDate:start,series,academicFactors:data};
}
