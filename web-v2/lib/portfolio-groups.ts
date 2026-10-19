import type { MarketPayload } from "./analytics.ts";
import type { ExamplePortfolioResult } from "./example-portfolio.ts";

export type ReturnGroup = { name: string; indexes: number[]; tickers: string[]; curve: (number|null)[]; incomplete: boolean };

// Time-weighted gross returns of the actual sector sleeves. Recover each session's
// post-rebalance, beginning capital from ending positions and adjusted-price ratios.
// Transfers between sleeves and execution costs are not sector investment returns.
export function buildPortfolioGroups(payload: MarketPayload, example: Pick<ExamplePortfolioResult,"tickers"|"days">, sectors: Record<string,string>) {
  const dates=example.days.map(day=>day.date);
  const benchmark=payload.series.SPY?.points??[];
  const previousDate=new Map(benchmark.slice(1).map((point,i)=>[point.date,benchmark[i].date]));
  const prices=example.tickers.map(ticker=>new Map((payload.series[ticker]?.points??[]).map(point=>[point.date,point.close])));
  const bySector=new Map<string,number[]>();
  example.tickers.forEach((ticker,i)=>{const name=sectors[ticker]??"Unclassified";const indexes=bySector.get(name)??[];indexes.push(i);bySector.set(name,indexes);});
  const groups:ReturnGroup[]=[...bySector].sort(([a],[b])=>a.localeCompare(b)).map(([name,indexes])=>({name,indexes,tickers:indexes.map(i=>example.tickers[i]),curve:[1],incomplete:false}));
  for(let d=1;d<example.days.length;d++){
    const day=example.days[d],prior=previousDate.get(day.date);
    for(const group of groups){
      let capital=0,pnl=0;
      for(const i of group.indexes){
        const endValue=(day.returnValues??day.values)[i];if(endValue===0)continue;
        const before=prior?prices[i].get(prior):undefined,after=prices[i].get(day.date);
        if(before===undefined||after===undefined||!Number.isFinite(before)||!Number.isFinite(after)||before<=0||after<=0){group.incomplete=true;break;}
        const beginValue=endValue*before/after;capital+=beginValue;pnl+=endValue-beginValue;
      }
      // An uninvested sleeve stays flat at the app's 0% cash-return assumption.
      group.curve.push(group.incomplete?null:group.curve[d-1]!*(1+(capital>1e-12?pnl/capital:0)));
    }
  }
  return {dates,groups};
}

export function groupHoldingsSnapshot(example: Pick<ExamplePortfolioResult,"days"|"rebalances">, groups: ReturnGroup[], index: number) {
  const day=example.days[index],targets=example.rebalances[day.rebalance]?.targets??[];
  return groups.map(group=>({name:group.name,count:group.indexes.filter(i=>day.values[i]!==0).length,value:group.indexes.reduce((sum,i)=>sum+day.values[i],0),weight:group.indexes.reduce((sum,i)=>sum+day.values[i],0)/day.nav,target:group.indexes.reduce((sum,i)=>sum+(targets[i]??0),0)})).sort((a,b)=>b.value-a.value);
}
