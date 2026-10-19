import {analyseStatisticalPortfolio,type StatisticalBundle} from './statistical-model.ts';
export function statisticalMetadata(bundle:StatisticalBundle){return {title:bundle.title,source:bundle.source,dataThrough:bundle.dataThrough,universeNote:bundle.universeNote,histories:bundle.histories,snapshots:bundle.historyDates?bundle.historyDates.flatMap(asOf=>["ONE_YEAR_EQUAL","REFERENCE"].map(variant=>({asOf,variant}))):bundle.snapshots.map(s=>({asOf:s.asOf,variant:s.variant}))};}
export type StatisticalMetadata=ReturnType<typeof statisticalMetadata>;
export type StatisticalRequest={variant:string;asOf:string;portfolio?:string;holdings?:{ticker:string;value:number}[];view?:string;cursor?:number;datedHoldings?:{asOf:string;holdings:{ticker:string;value:number}[]}[]};
export function statisticalDisplay(bundle:StatisticalBundle,input:StatisticalRequest){
 const snapshot=bundle.snapshots.find(s=>s.variant===input.variant&&s.asOf===input.asOf);
 if(!snapshot)throw new Error('Choose an available model date and specification.');
 const holdings=input.portfolio==='ai'?bundle.aiBasket.filter(t=>snapshot.stocks.some(s=>s.ticker===t)).map(ticker=>({ticker,value:1})):input.holdings;
 if(!Array.isArray(holdings)||!holdings.length||holdings.length>200||holdings.some(h=>!h||typeof h.ticker!=='string'||!/^[A-Z][A-Z0-9.-]{0,14}$/.test(h.ticker)||typeof h.value!=='number'||!Number.isFinite(h.value)))throw new Error('Supply a valid portfolio with up to 200 positions.');
 const r=analyseStatisticalPortfolio(snapshot,holdings);
 const impact=(v:number,k:number)=>v*Math.sqrt(snapshot.covariance[k][k])*10000;
 // Explicit allowlist: only chart values and displayed statistics leave the backend.
 return {asOf:snapshot.asOf,donorCount:snapshot.donorCount,profiles:snapshot.profiles,data:{volatility:r.volatility,commonShare:r.commonShare,specificShare:r.specificShare,contributions:r.contributions,correlations:r.correlations,impactBps:r.exposure.map(impact),stocks:r.stocks.map(s=>({ticker:s.ticker,weight:s.weight,correlations:s.correlations,impactBps:s.exposures.map(impact)}))}};
}
export type StatisticalDisplay=ReturnType<typeof statisticalDisplay>;

export type PortfolioHistoryPoint={date:string;nHoldings:number;correlations:(number|null)[];risk:number[];volatility:number;gapBefore?:boolean};
export type PortfolioHistoryPage={points:PortfolioHistoryPoint[];skipped:{date:string;reason:string}[];nextCursor:number|null};
export function statisticalHistoryPoint(bundle:StatisticalBundle,input:StatisticalRequest):PortfolioHistoryPoint{
 const r=statisticalDisplay(bundle,input).data;
 return {date:input.asOf,nHoldings:r.stocks.length,correlations:r.correlations.map(v=>v===null?null:Math.abs(v)),risk:[r.contributions[0],r.contributions[1],r.contributions.slice(2).reduce((a,b)=>a+b,0),r.specificShare].map(v=>v*r.volatility*10000),volatility:r.volatility};
}
