import type { MarketPayload, PortfolioAnalytics } from "./analytics.ts";

export type ExampleDay = { date: string; nav: number; values: number[]; returnValues?: number[]; cash: number; rebalance: number };
export type ExampleRebalance = { date: string; month: string; targets: number[]; scores: (number | null)[]; eligible: number; cost: number; traded: number };
const mean = (x: number[]) => x.reduce((a,b)=>a+b,0)/x.length;
const variance = (x: number[]) => { const m=mean(x);return x.reduce((s,v)=>s+(v-m)**2,0)/Math.max(1,x.length-1); };

// Deliberately retrospective example: a month's realized Sharpe selects that SAME month's holdings.
// Prices are adjusted closes. Allocation occurs at the preceding session's close.
export function buildExamplePortfolio(payload: MarketPayload, universe: string[], start: string, end: string, costBps=5, selectionShare=.2) {
  const benchmark=payload.series.SPY?.points;
  if(!benchmark?.length||!payload.asOf)return null;
  const tickers=[...new Set(universe)].filter(t=>t!=="CASH"&&t!=="SPY").sort();
  const maps=tickers.map(t=>new Map(payload.series[t]?.points.map(p=>[p.date,p.close])??[]));
  const groups=new Map<string,number[]>();
  benchmark.forEach((p,i)=>{if(!i)return;const month=p.date.slice(0,7);if(!groups.has(month))groups.set(month,[]);groups.get(month)!.push(i);});
  const days:ExampleDay[]=[], rebalances:ExampleRebalance[]=[];
  let values=tickers.map(()=>0),cash=1_000_000,totalCosts=0;
  const rate=Math.max(0,Number.isFinite(costBps)?costBps:0)/10000;
  for(const [month,indexes] of groups){
    const first=indexes[0],last=indexes.at(-1)!;
    if(month>=payload.asOf.slice(0,7)||benchmark[first].date<start||benchmark[last].date>end)continue;
    if(indexes.length<10)continue;
    const prices=maps.map(map=>[first-1,...indexes].map(i=>map.get(benchmark[i].date)));
    const scores=prices.map(row=>{
      if(row.some(p=>p===undefined||!Number.isFinite(p)||p<=0))return null;
      const p=row as number[],r=p.slice(1).map((v,i)=>v/p[i]-1),vol=Math.sqrt(variance(r));
      return vol>1e-10?mean(r)/vol*Math.sqrt(252):null;
    });
    const ranked=scores.map((score,i)=>({score,i})).filter((x):x is {score:number;i:number}=>x.score!==null).sort((a,b)=>b.score-a.score||tickers[a.i].localeCompare(tickers[b.i]));
    // A broad allocation moderates the retrospective selection's unusually high Sharpe.
    // Both sleeves share the same 5% starting-position ceiling and leave missing slots in cash.
    const selection=Math.max(0,Math.min(1,selectionShare));
    const funded=Math.min(1,ranked.length*.05);
    const targets=tickers.map(()=>0);
    ranked.forEach(x=>targets[x.i]=(1-selection)*funded/ranked.length);
    ranked.slice(0,20).forEach(x=>targets[x.i]+=selection*.05);
    if(!days.length)days.push({date:benchmark[first-1].date,nav:1_000_000,values:[...values],cash,rebalance:-1});
    const nav=cash+values.reduce((a,b)=>a+b,0);
    let after=nav;
    for(let k=0;k<20;k++)after=nav-rate*targets.reduce((s,w,j)=>s+Math.abs(w*after-values[j]),0);
    const traded=targets.reduce((s,w,j)=>s+Math.abs(w*after-values[j]),0),cost=nav-after;
    totalCosts+=cost;values=targets.map(w=>w*after);cash=after-values.reduce((a,b)=>a+b,0);
    rebalances.push({date:benchmark[first].date,month,targets,scores,eligible:ranked.length,cost,traded});
    indexes.forEach((index,k)=>{
      values=values.map((value,j)=>value===0?0:value*(prices[j][k+1]!/prices[j][k]!));
      days.push({date:benchmark[index].date,nav:cash+values.reduce((a,b)=>a+b,0),values:[...values],cash,rebalance:rebalances.length-1});
    });
  }
  if(days.length<2)return null;
  const dates=days.map(d=>d.date),curve=days.map(d=>d.nav/1_000_000);
  const spy=new Map(benchmark.map(p=>[p.date,p.close]));
  const benchmarkCurve=dates.map(d=>spy.get(d)!/spy.get(dates[0])!);
  const dailyReturns=curve.slice(1).map((v,i)=>v/curve[i]-1),benchmarkReturns=benchmarkCurve.slice(1).map((v,i)=>v/benchmarkCurve[i]-1);
  const avg=mean(dailyReturns),bm=mean(benchmarkReturns),v=variance(dailyReturns);
  const cov=dailyReturns.reduce((s,r,i)=>s+(r-avg)*(benchmarkReturns[i]-bm),0)/Math.max(1,dailyReturns.length-1);
  let peak=1,maxDrawdown=0;curve.forEach(v=>{peak=Math.max(peak,v);maxDrawdown=Math.min(maxDrawdown,v/peak-1);});
  const analytics:PortfolioAnalytics={dates,curve,benchmarkCurve,dailyReturns,benchmarkReturns,totalReturn:curve.at(-1)!-1,benchmarkReturn:benchmarkCurve.at(-1)!-1,annualVolatility:Math.sqrt(v*252),beta:cov/Math.max(variance(benchmarkReturns),1e-12),maxDrawdown,pnl:days.at(-1)!.nav-1_000_000,startDate:dates[0],endDate:dates.at(-1)!,positions:[]};
  const elapsedYears=(Date.parse(dates.at(-1)!)-Date.parse(dates[0]))/(365.25*86400000);
  const annualReturn=elapsedYears>0?curve.at(-1)!**(1/elapsedYears)-1:null;
  return {tickers,days,rebalances,analytics,totalCosts,annualReturn,sharpe:v>1e-20?avg/Math.sqrt(v)*Math.sqrt(252):null};
}

export type ExamplePortfolioResult = NonNullable<ReturnType<typeof buildExamplePortfolio>>;

export function exampleHoldingsSnapshot(example: ExamplePortfolioResult, asOf?: string) {
  const index=asOf?example.days.findLastIndex(day=>day.date<=asOf):example.days.length-1;
  if(index<0)return null;
  const day=example.days[index];
  return {date:day.date,nav:day.nav,holdings:[...example.tickers.map((ticker,j)=>({ticker,value:day.values[j]})).filter(h=>h.value>1e-8),{ticker:"CASH",value:day.cash}]};
}

// End-of-day holdings for actual model dates only. Do not invent positions before
// the first allocation, bridge a missing session, or carry stale weights beyond history.
export function exampleStatisticalHoldings(example: ExamplePortfolioResult, modelDates: string[]) {
  const byDate=new Map(example.days.filter(day=>day.rebalance>=0).map(day=>[day.date,day]));
  return modelDates.flatMap(asOf=>{
    const day=byDate.get(asOf);if(!day)return [];
    return [{asOf,holdings:[...example.tickers.map((ticker,j)=>({ticker,value:day.values[j]})).filter(h=>Math.abs(h.value)>1e-8),{ticker:'CASH',value:day.cash}]}];
  });
}
