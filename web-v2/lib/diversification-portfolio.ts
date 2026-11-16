import type {MarketPayload} from "./analytics.ts";
import type {ExampleDay, ExamplePortfolioResult, ExampleRebalance} from "./example-portfolio.ts";
import {pathAnalytics} from "./comparison-history.ts";
import {historicalSharpe} from "./historical-sharpe.ts";

export const diversificationName = "Maximum Diversification · Portfolio 18";
export const diversificationThrough = "2026-09-30";
export type AccountRow = [date:string, wealth:number, holdings:[number,number][], executed:boolean, feeFraction:number];
export type ResearchAccount = {tickers:string[]; rows:AccountRow[]};

export function researchPortfolio(account:ResearchAccount, payload:MarketPayload, start:string):ExamplePortfolioResult|null {
  const prices = account.tickers.map(t => new Map(payload.series[t]?.points.map(p=>[p.date,p.close])));
  const benchmark = new Map(payload.series.SPY?.points.map(p=>[p.date,p.close]));
  const days: ExampleDay[] = [], rebalances:ExampleRebalance[] = [];
  let totalCosts=0;
  let weights:number[]=[];
  for (const [date,wealth,sparse,executed,fee] of account.rows) {
    if (date>(payload.asOf??"")) break;
    const previous=days.at(-1);
    const nav=wealth*1_000_000;
    const beforeFee=nav/(1-fee);
    const cost=beforeFee-nav;
    const beforeWeights=weights;
    weights=account.tickers.map(()=>0);
    for (const [j,w] of sparse) weights[j]=w;
    const sum=weights.reduce((a,b)=>a+b,0);
    weights=weights.map(w=>w/sum);
    if(executed) rebalances.push({date,month:date.slice(0,7),targets:weights,scores:weights.map(()=>null),eligible:account.tickers.length,cost,traded:cost/.0005});
    if(date<start) continue;
    const values=weights.map(w=>w*nav);
    // Sleeve performance on execution dates belongs to the holdings carried into the close.
    const returnValues=previous && executed ? beforeWeights.map((w,j)=>{
      if(!w) return 0;
      const before=prices[j].get(previous.date), after=prices[j].get(date);
      return before && after ? w*previous.nav*after/before : NaN;
    }) : undefined;
    if(previous) totalCosts+=cost;
    days.push({date,nav,values,returnValues,cash:0,rebalance:rebalances.length-1});
  }
  if(days.length<2 || days.some(d=>!(benchmark.get(d.date)!>0))) return null;
  const dates=days.map(d=>d.date), curve=days.map(d=>d.nav/days[0].nav);
  const analytics=pathAnalytics(dates,curve,dates.map(d=>benchmark.get(d)!/benchmark.get(dates[0])!),days[0].nav);
  const years=(Date.parse(analytics.endDate)-Date.parse(analytics.startDate))/(365.25*86400000);
  return {tickers:account.tickers,days,rebalances,analytics,totalCosts,annualReturn:curve.at(-1)!**(1/years)-1,sharpe:historicalSharpe(dates,analytics.dailyReturns,payload)};
}
