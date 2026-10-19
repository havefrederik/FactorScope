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

import type { AiCoveragePoint } from './statistical-model.ts';

// Membership is the statistical model's dated available basket. Rebalance at
// each close; a model-date membership change affects returns from the NEXT session.
// Missing prices halt the series rather than silently dropping a required stock.
export function buildCoverageOverview(payload:MarketPayload, coverage:AiCoveragePoint[], start:string, end:string):ExamplePortfolioResult|null {
  if(!coverage.length)return null;
  const through=coverage.at(-1)!.date;
  const calendar=(payload.series.SPY?.points??[]).filter(p=>p.date>=start&&p.date>=coverage[0].date&&p.date<=end&&p.date<=through);
  if(calendar.length<2)return null;
  const tickers=[...new Set(coverage.flatMap(p=>p.tickers))];
  const maps=tickers.map(t=>new Map((payload.series[t]?.points??[]).map(p=>[p.date,p.close])));
  const days:ExamplePortfolioResult['days']=[],rebalances:ExamplePortfolioResult['rebalances']=[];
  let nav=1_000_000,values=tickers.map(()=>0),membership=0;
  for(let i=0;i<calendar.length;i++){
    const date=calendar[i].date;
    while(membership+1<coverage.length&&coverage[membership+1].date<=date)membership++;
    const required=new Set(coverage[membership].tickers);
    const targets=tickers.map(t=>required.has(t)?1/required.size:0);
    const returnValues=values.map((value,j)=>{
      if(!value)return 0;
      const before=maps[j].get(calendar[i-1].date),after=maps[j].get(date);
      if(!before||!after||!Number.isFinite(before)||!Number.isFinite(after)||before<=0||after<=0)throw Error(`Missing Yahoo price for ${tickers[j]} on ${date}. The AI basket has not been reweighted.`);
      return value*after/before;
    });
    for(let j=0;j<tickers.length;j++)if(targets[j]&&(!maps[j].get(date)||!Number.isFinite(maps[j].get(date))))throw Error(`Missing Yahoo price for ${tickers[j]} on ${date}. The AI basket has not been reweighted.`);
    if(i)nav=returnValues.reduce((a,b)=>a+b,0);
    values=targets.map(w=>w*nav);
    rebalances.push({date,month:date.slice(0,7),targets,scores:tickers.map(()=>null),eligible:required.size,cost:0,traded:values.reduce((sum,v,j)=>sum+Math.abs(v-returnValues[j]),0)});
    days.push({date,nav,values:[...values],returnValues:i?returnValues:[...values],cash:0,rebalance:i});
  }
  const dates=days.map(d=>d.date),curve=days.map(d=>d.nav/1e6),benchmarkCurve=calendar.map(p=>p.close/calendar[0].close);
  const dailyReturns=curve.slice(1).map((v,i)=>v/curve[i]-1),benchmarkReturns=benchmarkCurve.slice(1).map((v,i)=>v/benchmarkCurve[i]-1);
  const mean=(x:number[])=>x.reduce((a,b)=>a+b,0)/x.length;
  const variance=(x:number[])=>x.reduce((s,v)=>s+(v-mean(x))**2,0)/Math.max(1,x.length-1);
  const avg=mean(dailyReturns),bm=mean(benchmarkReturns),v=variance(dailyReturns);
  const cov=dailyReturns.reduce((s,r,i)=>s+(r-avg)*(benchmarkReturns[i]-bm),0)/Math.max(1,dailyReturns.length-1);
  let peak=1,maxDrawdown=0;curve.forEach(v=>{peak=Math.max(peak,v);maxDrawdown=Math.min(maxDrawdown,v/peak-1)});
  const analytics={dates,curve,benchmarkCurve,dailyReturns,benchmarkReturns,totalReturn:curve.at(-1)!-1,benchmarkReturn:benchmarkCurve.at(-1)!-1,annualVolatility:Math.sqrt(v*252),beta:cov/Math.max(variance(benchmarkReturns),1e-12),maxDrawdown,pnl:nav-1e6,startDate:dates[0],endDate:dates.at(-1)!,positions:[]};
  const years=(Date.parse(analytics.endDate)-Date.parse(analytics.startDate))/(365.25*86400000);
  return {tickers,days,rebalances,analytics,totalCosts:0,annualReturn:years>0?curve.at(-1)!**(1/years)-1:null,sharpe:v>1e-20?avg/Math.sqrt(v)*Math.sqrt(252):null};
}
