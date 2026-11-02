import type {ReoptimizationPolicy} from './optimizer-backtest.ts';
export type HindsightRun={version:1;id:string;name:string;createdAt:string;comparisonKey:string;modelSignature:string;modelLabel:string;policy:ReoptimizationPolicy;start:string;end:string;sharpe:number|null;baselineSharpe:number|null;totalReturn:number;maxDrawdown:number;volatility:number;trades:number;turnover:number;cost:number;dates:string[];curve:number[]};
export function pathMetrics(curve:number[],returns:number[]){
 let peak=curve[0],maxDrawdown=0;for(const v of curve){peak=Math.max(peak,v);maxDrawdown=Math.min(maxDrawdown,v/peak-1);}
 const mean=returns.reduce((s,x)=>s+x,0)/returns.length;
 return {totalReturn:curve.at(-1)!/curve[0]-1,maxDrawdown,volatility:Math.sqrt(252*returns.reduce((s,x)=>s+(x-mean)**2,0)/Math.max(1,returns.length-1))};
}
export function comparableRuns(runs:HindsightRun[],key:string){return runs.filter(r=>r.comparisonKey===key);}
export function readHindsightRuns(raw:string|null):HindsightRun[]{
 try{const list:unknown=JSON.parse(raw??'[]');if(!Array.isArray(list))return [];return list.filter((r:any)=>r?.version===1&&typeof r.id==='string'&&typeof r.name==='string'&&typeof r.modelSignature==='string'&&typeof r.modelLabel==='string'&&typeof r.comparisonKey==='string'&&typeof r.start==='string'&&typeof r.end==='string'&&r.policy&&typeof r.policy==='object'&&Array.isArray(r.dates)&&Array.isArray(r.curve)&&r.dates.length===r.curve.length&&r.curve.length>2&&r.curve.every((x:unknown)=>typeof x==='number'&&Number.isFinite(x))&&[r.totalReturn,r.maxDrawdown,r.volatility,r.trades,r.turnover,r.cost].every(Number.isFinite)&&(r.sharpe===null||Number.isFinite(r.sharpe))&&(r.baselineSharpe===null||Number.isFinite(r.baselineSharpe))).slice(-12);}catch{return [];}
}
/** Fingerprint changes when any model-input price history changes. */
export function historyFingerprint(series:{date:string;close:number}[][]){let h=2166136261;for(const points of series)for(const p of points){const s=p.date+':'+p.close+';';for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}}return (h>>>0).toString(16);}
