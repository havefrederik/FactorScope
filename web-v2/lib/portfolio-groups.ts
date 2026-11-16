import type { MarketPayload } from "./analytics.ts";
import type { ExamplePortfolioResult } from "./example-portfolio.ts";

export type PortfolioGrouping = "Stocks" | "Sectors" | "Long / short";
export type ReturnGroup = {
  name: string;
  indexes: number[];
  tickers: string[];
  curve: (number | null)[]; // Compounded wealth within the group, starting at one.
  contribution: (number | null)[]; // Cumulative signed P&L per dollar of starting portfolio NAV.
  held: boolean[]; // Exposure during each return interval. The anchor uses its closing holdings.
  incomplete: boolean;
};

export type HoldingPeriod = {
  ticker: string;
  side: "Long" | "Short";
  firstClose: string;
  exitClose: string | null;
};

export function sectorHoldingPeriods(example: Pick<ExamplePortfolioResult, "tickers" | "days">, indexes: number[]) {
  const periods: HoldingPeriod[] = [];
  for (const index of indexes) {
    let previousSide: HoldingPeriod["side"] | null = null;
    for (const day of example.days) {
      const value = day.values[index];
      const side = value > 0 ? "Long" : value < 0 ? "Short" : null;
      if (side === previousSide) continue;
      if (previousSide) periods[periods.length - 1].exitClose = day.date;
      if (side) periods.push({ticker: example.tickers[index], side, firstClose: day.date, exitClose: null});
      previousSide = side;
    }
  }
  return periods.sort((a,b) => b.firstClose.localeCompare(a.firstClose) || a.ticker.localeCompare(b.ticker));
}

// Time-weighted gross returns of the actual sector sleeves. Recover each session's
// post-rebalance, beginning capital from ending positions and adjusted-price ratios.
// Transfers between sleeves and execution costs are not sector investment returns.
export function buildPortfolioGroups(payload: MarketPayload, example: Pick<ExamplePortfolioResult,"tickers"|"days">, sectors: Record<string,string>, grouping: PortfolioGrouping = "Sectors") {
  const dates=example.days.map(day=>day.date);
  const benchmark=payload.series.SPY?.points??[];
  const previousDate=new Map(benchmark.slice(1).map((point,i)=>[point.date,benchmark[i].date]));
  const prices=example.tickers.map(ticker=>new Map((payload.series[ticker]?.points??[]).map(point=>[point.date,point.close])));
  const bySector=new Map<string,number[]>();
  example.tickers.forEach((ticker,i)=>{const name=grouping==="Stocks"?ticker:sectors[ticker]??"Unclassified";const indexes=bySector.get(name)??[];indexes.push(i);bySector.set(name,indexes);});
  if(grouping==="Long / short") {bySector.clear(); for(const [name,sign] of [["Long",1],["Short",-1]] as const){const indexes=example.tickers.map((_,i)=>i).filter(i=>example.days.some(day=>(day.returnValues??day.values)[i]*sign>0));if(indexes.length)bySector.set(name,indexes);}}
  const startingNav = example.days[0]?.nav;
  function belongs(value: number, name: string) {
    if (value === 0) return false;
    return grouping !== "Long / short" || (name === "Long" ? value > 0 : value < 0);
  }
  const groups: ReturnGroup[] = [...bySector].sort(([a],[b])=>a.localeCompare(b)).map(([name,indexes])=>({
    name, indexes, tickers: indexes.map(i=>example.tickers[i]),
    curve: [1], contribution: [0], held: [indexes.some(i=>belongs(example.days[0]?.values[i] ?? 0, name))],
    incomplete: false
  }));
  for (let d = 1; d < example.days.length; d++) {
    const day = example.days[d], prior = previousDate.get(day.date);
    const returnValues = day.returnValues ?? day.values;
    for (const group of groups) {
      let capital = 0, pnl = 0, held = false;
      for (const i of group.indexes) {
        const endValue = returnValues[i];
        if (!Number.isFinite(endValue)) { group.incomplete = true; break; }
        if (!belongs(endValue, group.name)) continue;
        held = true;
        const before = prior ? prices[i].get(prior) : undefined, after = prices[i].get(day.date);
        if (before === undefined || after === undefined || !Number.isFinite(before) || !Number.isFinite(after) || before <= 0 || after <= 0) {
          group.incomplete = true;
          break;
        }
        const beginValue = endValue * before / after;
        capital += Math.abs(beginValue);
        pnl += endValue - beginValue;
      }
      group.held.push(held);
      group.curve.push(group.incomplete ? null : group.curve[d-1]! * (1 + (capital > 0 ? pnl / capital : 0)));
      group.contribution.push(group.incomplete || !(startingNav > 0) ? null : group.contribution[d-1]! + pnl / startingNav);
    }
  }
  return {dates,groups};
}

export function groupHoldingsSnapshot(example: Pick<ExamplePortfolioResult,"days"|"rebalances">, groups: ReturnGroup[], index: number) {
  const day=example.days[index],targets=example.rebalances[day.rebalance]?.targets??[];
  return groups.map(group=>({name:group.name,count:group.indexes.filter(i=>day.values[i]!==0).length,value:group.indexes.reduce((sum,i)=>sum+day.values[i],0),weight:group.indexes.reduce((sum,i)=>sum+day.values[i],0)/day.nav,target:group.indexes.reduce((sum,i)=>sum+(targets[i]??0),0)})).sort((a,b)=>b.value-a.value);
}
