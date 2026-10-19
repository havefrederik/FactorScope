"use client";
import { useMemo, useState, type ReactNode } from "react";
import { buildPortfolioDecomposition, type MarketPayload, type PortfolioAnalytics, type SecurityDecomposition } from "@/lib/analytics";
import type { ExamplePortfolioResult } from "@/lib/example-portfolio";
import { buildPortfolioGroups } from "@/lib/portfolio-groups";
import GroupReturnsChart, { groupStyle } from "./group-returns-chart";
import PortfolioHoldings from "./portfolio-holdings";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n);
const pct=(n:number)=>`${(100*n).toFixed(2)}%`;
export default function ExamplePortfolio({payload,example,sectors,firstMonth,setFirstMonth,cost,setCost,selectedDate,setSelectedDate,onSelectTicker,renderPerformance,renderDecomposition}:{payload:MarketPayload;example:ExamplePortfolioResult;sectors:Record<string,string>;firstMonth:string;setFirstMonth:(value:string)=>void;cost:number;setCost:(value:number)=>void;selectedDate:string;setSelectedDate:(value:string)=>void;onSelectTicker:(ticker:string)=>void;renderPerformance:(analytics:PortfolioAnalytics)=>ReactNode;renderDecomposition:(decomposition:SecurityDecomposition)=>ReactNode}){
  const end=payload.asOf??"";
  const decomposition=useMemo(()=>example?buildPortfolioDecomposition(payload,example.analytics):null,[payload,example]);
  const grouped=useMemo(()=>buildPortfolioGroups(payload,example,sectors),[payload,example,sectors]);
  const [chartView,setChartView]=useState<"Attribution"|"Returns by group"|"Performance">("Attribution");
  const [grouping,setGrouping]=useState<"Stocks"|"Sectors">("Stocks");
  const [selectedGroup,setSelectedGroup]=useState<string|null>(null);
  const index=Math.max(0,selectedDate?example.days.findIndex(day=>day.date===selectedDate):example.days.length-1);
  const day=example.days[index],rebalance=example.rebalances[day.rebalance];
  function selectGroup(name:string|null){setSelectedGroup(name);setGrouping("Sectors");setChartView("Returns by group");}
  const positions=[...example.tickers.map((ticker,i)=>({ticker,sector:sectors[ticker]??"Unclassified",value:day.values[i]})).filter(row=>row.value!==0||(rebalance?.targets[example.tickers.indexOf(row.ticker)]??0)!==0),{ticker:"CASH",sector:"Cash",value:day.cash}];
  const allocation=rebalance?{date:rebalance.date,weights:Object.fromEntries(example.tickers.map((ticker,i)=>[ticker,rebalance.targets[i]]))}:undefined;
  function download(){
    if(!example)return;
    const lines=["date,ticker,value_usd,weight,target_weight,rebalance_month,portfolio_type"];
    for(const d of example.days){const reb=example.rebalances[d.rebalance];example.tickers.forEach((ticker,j)=>{if(d.values[j]||reb?.targets[j])lines.push([d.date,ticker,d.values[j],d.values[j]/d.nav,reb?.targets[j]??0,reb?.month??"","illustrative portfolio"].join(","));});lines.push([d.date,"CASH",d.cash,d.cash/d.nav,1-(reb?.targets.reduce((a,b)=>a+b,0)??0),reb?.month??"","illustrative portfolio"].join(","));}
    const url=URL.createObjectURL(new Blob([lines.join("\n")],{type:"text/csv"}));const a=document.createElement("a");a.href=url;a.download="us-equity-portfolio-daily-holdings.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <div className="published-dow example-portfolio">
    <header className="example-summary-head">
      <div className="example-title-block"><h1>Portfolio overview</h1><span className="example-period">{example.analytics.startDate} — {example.analytics.endDate}</span></div>
      <div className="example-summary-actions">
        <details className="example-settings"><summary>Period</summary><div className="example-settings-body"><div className="example-controls"><label>First month<input aria-label="Example first month" type="month" value={firstMonth} max={end.slice(0,7)} onChange={e=>e.target.value&&setFirstMonth(e.target.value)}/></label></div></div></details>
        <button className="example-export" onClick={download} aria-label="Download daily holdings CSV">Export holdings ↓</button>
      </div>
    </header>
    <div className="portfolio-overview-grid">
      <div className="portfolio-chart-stack">
        <section className="panel example-chart overview-main-chart">
          <div className="portfolio-chart-tabs" role="tablist" aria-label="Portfolio charts">
            {(["Attribution","Returns by group","Performance"] as const).map(tab=><button key={tab} role="tab" aria-selected={chartView===tab} className={chartView===tab?"active":""} onClick={()=>{setChartView(tab);if(tab==="Returns by group")setGrouping("Sectors");}}>{tab}</button>)}
            <span>{chartView==="Attribution"?"Factor & idiosyncratic return":chartView==="Returns by group"?"Sector baskets · gross returns":"Portfolio vs. S&P 500"}</span>
          </div>
          <div className={chartView==="Attribution"?"portfolio-chart-content overview-decomposition":"portfolio-chart-content"} role="tabpanel" aria-label={chartView}>
            {chartView==="Attribution"&&(decomposition?renderDecomposition(decomposition):<p className="archive-table-note">Factor history is incomplete for this period. Choose a more recent starting month.</p>)}
            {chartView==="Returns by group"&&<GroupReturnsChart dates={grouped.dates} groups={grouped.groups} selectedGroup={selectedGroup} onSelectGroup={selectGroup} selectedDate={day.date} onSelectDate={setSelectedDate}/>}
            {chartView==="Performance"&&renderPerformance(example.analytics)}
          </div>
        </section>
      </div>
      <aside className="portfolio-side-stack" aria-label="Portfolio summary and holdings">
        <section className="panel overview-summary" aria-label="Portfolio performance summary">
          <div className="archive-metrics example-metrics">
            <article title="Cumulative portfolio return after estimated execution costs"><span>Total return</span><strong>{pct(example.analytics.totalReturn)}</strong></article>
            <article title="Compound annual growth rate over the displayed period"><span>Annualized return</span><strong>{example.annualReturn===null?"—":pct(example.annualReturn)}</strong></article>
            <article title="Annualized Sharpe ratio using a 0% risk-free rate"><span>Sharpe ratio</span><strong>{example.sharpe?.toFixed(2)??"—"}</strong></article>
            <article title="Historical market beta against the S&P 500"><span>Market beta</span><strong>{example.analytics.beta.toFixed(2)}</strong></article>
          </div>
        </section>
        <PortfolioHoldings positions={positions} total={day.nav} history={{dates:example.days.map(day=>day.date),selectedDate:day.date,onSelectDate:setSelectedDate}} allocation={allocation} grouping={grouping} onGroupingChange={mode=>{setGrouping(mode);if(mode==="Sectors")setChartView("Returns by group");}} selectedGroup={selectedGroup} onSelectGroup={selectGroup} groupColors={Object.fromEntries(grouped.groups.map((group,i)=>[group.name,groupStyle(group.name).color]))} onSelectTicker={onSelectTicker} footer={<details className="example-cost-settings"><summary>Transaction costs <span>{cost} bps</span></summary><div><label>Execution cost (bps)<input aria-label="Example execution cost" type="number" min="0" max="100" value={cost} onChange={e=>setCost(Math.min(100,Math.max(0,Number(e.target.value))))}/></label><p>Estimated total: <strong>{money(example.totalCosts)}</strong>. Portfolio performance is shown after these costs; sector return paths are gross.</p></div></details>}/>
      </aside>
    </div>
  </div>;
}
