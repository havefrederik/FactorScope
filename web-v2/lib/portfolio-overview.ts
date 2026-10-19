import { buildAnalytics, type AnalyticsHolding, type MarketPayload } from './analytics.ts';
import type { ExamplePortfolioResult } from './example-portfolio.ts';

// Adapt the existing buy-and-hold replay to the shared overview. This is a
// hypothetical starting allocation, not a record of the research basket's trades.
export function buildHoldingsOverview(payload: MarketPayload, holdings: AnalyticsHolding[], start: string, end: string): ExamplePortfolioResult | null {
  const analytics=buildAnalytics(payload,holdings,{startDate:start,endDate:end});
  if(!analytics)return null;
  const initial=holdings.reduce((sum,h)=>sum+h.value,0);
  const active=holdings.filter(h=>h.ticker!=='CASH'&&payload.series[h.ticker]);
  const tickers=active.map(h=>h.ticker);
  const cash=initial-active.reduce((sum,h)=>sum+h.value,0);
  const maps=tickers.map(t=>new Map(payload.series[t].points.map(p=>[p.date,p.close])));
  const days=analytics.dates.map(date=>{
    const values=active.map((h,i)=>h.value*maps[i].get(date)!/maps[i].get(analytics.startDate)!);
    return {date,values,cash,nav:cash+values.reduce((a,b)=>a+b,0),rebalance:0};
  });
  const rebalances=[{date:analytics.startDate,month:analytics.startDate.slice(0,7),targets:active.map(h=>h.value/initial),scores:active.map(()=>null),eligible:active.length,cost:0,traded:initial-cash}];
  const years=(Date.parse(analytics.endDate)-Date.parse(analytics.startDate))/(365.25*86400000);
  const avg=analytics.dailyReturns.reduce((a,b)=>a+b,0)/analytics.dailyReturns.length;
  return {tickers,days,rebalances,analytics,totalCosts:0,annualReturn:years>0?(1+analytics.totalReturn)**(1/years)-1:null,sharpe:analytics.annualVolatility>1e-10?avg*252/analytics.annualVolatility:null};
}
