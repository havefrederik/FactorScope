import type { MarketPayload } from "./analytics.ts";
export type ScenarioHolding = {ticker:string;value:number;sector?:string;name?:string};
export function modeledScenario(holdings:ScenarioHolding[], betas:Record<string,number>, market:number, technology:number) {
  const stocks=holdings.filter(h=>h.ticker!=="CASH"&&h.value!==0);
  if(stocks.some(h=>!Number.isFinite(betas[h.ticker])))return null;
  const positions=stocks.map(h=>{const marketImpact=h.value*betas[h.ticker]*market/100,sectorImpact=h.sector==="Technology"?h.value*technology/100:0;return {...h,marketImpact,sectorImpact,impact:marketImpact+sectorImpact};}).sort((a,b)=>a.impact-b.impact);
  const factors=[{name:"Market beta",impact:positions.reduce((s,p)=>s+p.marketImpact,0)},{name:"Technology overlay",impact:positions.reduce((s,p)=>s+p.sectorImpact,0)}];
  return {positions,factors,impact:positions.reduce((s,p)=>s+p.impact,0)};
}
// Require the event's full benchmark window and prices at every session. An IPO
// partway through an event cannot silently stand in for a full-event return.
export function coveredHistoricalScenario(payload:MarketPayload,holdings:ScenarioHolding[],start:string,end:string) {
  const all=payload.series.SPY?.points??[];
  const dates=all.filter(p=>p.date>=start&&p.date<=end).map(p=>p.date);
  const stocks=holdings.filter(h=>h.ticker!=="CASH"&&h.value!==0);
  const windowCovered=dates.length>1&&dates[0]===start&&dates.at(-1)===end;
  const missing:string[]=[];
  const positions=stocks.flatMap(h=>{
    const prices=new Map((payload.series[h.ticker]?.points??[]).map(p=>[p.date,p.close]));
    if(!windowCovered||dates.some(d=>!Number.isFinite(prices.get(d))||prices.get(d)!<=0)){missing.push(h.ticker);return [];}
    const change=prices.get(end)!/prices.get(start)!-1;
    return [{...h,impact:h.value*change}];
  }).sort((a,b)=>a.impact-b.impact);
  const total=holdings.reduce((sum,h)=>sum+h.value,0);
  const available=windowCovered&&missing.length===0&&total>0;
  const priceMaps=stocks.map(h=>new Map((payload.series[h.ticker]?.points??[]).map(p=>[p.date,p.close])));
  const curve=available?dates.map(date=>1+stocks.reduce((sum,h,i)=>sum+h.value*(priceMaps[i].get(date)!/priceMaps[i].get(start)!-1),0)/total):[];
  const benchmarkCurve=available?all.filter(p=>p.date>=start&&p.date<=end).map(p=>p.close/all.find(p=>p.date===start)!.close):[];
  return {available,missing,positions,impact:available?positions.reduce((s,p)=>s+p.impact,0):null,path:available?{dates,curve,benchmarkCurve,startDate:start,endDate:end}:null};
}
