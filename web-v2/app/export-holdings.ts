import type { ExamplePortfolioResult } from '@/lib/example-portfolio';

export function downloadHoldings(history: ExamplePortfolioResult | null | undefined, holdings: {ticker:string;value:number}[], name:string, date:string) {
  const lines=['date,ticker,value_usd,weight,target_weight'];
  if(history) for(const day of history.days){
    const rebalance=history.rebalances[day.rebalance];
    history.tickers.forEach((ticker,i)=>{if(day.values[i]||rebalance?.targets[i])lines.push([day.date,ticker,day.values[i],day.values[i]/day.nav,rebalance?.targets[i]??0].join(','));});
    lines.push([day.date,'CASH',day.cash,day.cash/day.nav,1-(rebalance?.targets.reduce((a,b)=>a+b,0)??0)].join(','));
  } else {
    const nav=holdings.reduce((s,h)=>s+h.value,0);
    holdings.forEach(h=>lines.push([date,h.ticker,h.value,nav?h.value/nav:0,''].join(',')));
  }
  const url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'}));
  const link=document.createElement('a');link.href=url;link.download=`${name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-holdings.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
