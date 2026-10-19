import {analyseStatisticalPortfolio,type StatisticalBundle} from './statistical-model.ts';
export function statisticalMetadata(bundle:StatisticalBundle){return {title:bundle.title,source:bundle.source,dataThrough:bundle.dataThrough,universeNote:bundle.universeNote,histories:bundle.histories,snapshots:bundle.snapshots.map(s=>({asOf:s.asOf,variant:s.variant}))};}
export type StatisticalMetadata=ReturnType<typeof statisticalMetadata>;
export function statisticalDisplay(bundle:StatisticalBundle,input:{variant:string;asOf:string;portfolio?:string;holdings?:{ticker:string;value:number}[]}){
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
