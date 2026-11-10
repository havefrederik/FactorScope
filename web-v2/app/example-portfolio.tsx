"use client";
import { useMemo, useState, type ReactNode } from "react";
import { buildPortfolioDecomposition, type MarketPayload, type SecurityDecomposition } from "@/lib/analytics";
import type { ExamplePortfolioResult } from "@/lib/example-portfolio";
import { buildPortfolioGroups, type PortfolioGrouping } from "@/lib/portfolio-groups";
import GroupReturnsChart, { groupStyle } from "./group-returns-chart";
import PortfolioHoldings from "./portfolio-holdings";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n);
const pct=(n:number)=>`${(100*n).toFixed(2)}%`;
export default function ExamplePortfolio({riskSummary,payload,example,sectors,firstMonth,setFirstMonth,cost,setCost,selectedDate,setSelectedDate,onSelectTicker,renderDecomposition,portfolioName="US Equity Portfolio",isAI=false}:{riskSummary?:ReactNode;portfolioName?:string;isAI?:boolean;payload:MarketPayload;example:ExamplePortfolioResult;sectors:Record<string,string>;firstMonth:string;setFirstMonth:(value:string)=>void;cost:number;setCost:(value:number)=>void;selectedDate:string;setSelectedDate:(value:string)=>void;onSelectTicker:(ticker:string)=>void;renderDecomposition:(decomposition:SecurityDecomposition)=>ReactNode}){
  const end=payload.asOf??"";
  const decomposition=useMemo(()=>example?buildPortfolioDecomposition(payload,example.analytics):null,[payload,example]);
  const [chartView,setChartView]=useState<"Attribution"|"Returns by group">("Attribution");
  const [grouping,setGrouping]=useState<PortfolioGrouping>("Stocks");
  const grouped=useMemo(()=>buildPortfolioGroups(payload,example,sectors,grouping),[payload,example,sectors,grouping]);
  const [selectedGroup,setSelectedGroup]=useState<string|null>(null);
  const index=Math.max(0,selectedDate?example.days.findLastIndex(day=>day.date<=selectedDate):example.days.length-1);
  const day=example.days[index],rebalance=example.rebalances[day.rebalance];
  function selectGroup(name:string|null){setSelectedGroup(name);setChartView("Returns by group");}
  const positions=[...example.tickers.map((ticker,i)=>({ticker,sector:sectors[ticker]??"Unclassified",value:day.values[i]})).filter(row=>row.value!==0||(rebalance?.targets[example.tickers.indexOf(row.ticker)]??0)!==0),{ticker:"CASH",sector:"Cash",value:day.cash}];
  const allocation=rebalance?{date:rebalance.date,weights:Object.fromEntries(example.tickers.map((ticker,i)=>[ticker,rebalance.targets[i]]))}:undefined;
  return <div className="published-dow example-portfolio">
    <h1 className="sr-only">Portfolio overview</h1>
    <div className="portfolio-overview-grid">
      <div className="portfolio-chart-stack">
        <section className="panel example-chart overview-main-chart">
          <div className="portfolio-chart-tabs" role="tablist" aria-label="Portfolio charts">
            {(["Attribution","Returns by group"] as const).map(tab=><button key={tab} role="tab" aria-selected={chartView===tab} className={chartView===tab?"active":""} onClick={()=>{setChartView(tab);if(tab==="Returns by group"&&chartView!=="Returns by group"){setGrouping("Sectors");setSelectedGroup(null);}}}>{tab}</button>)}
            <details className="example-settings chart-period"><summary aria-label="Choose portfolio period">Period <span>{example.analytics.startDate} — {example.analytics.endDate}</span></summary><div className="example-settings-body"><div className="example-controls"><label>First month<input aria-label="Portfolio first month" type="month" value={firstMonth} max={end.slice(0,7)} onChange={e=>e.target.value&&setFirstMonth(e.target.value)}/></label></div></div></details>
          </div>
          <div className={chartView==="Attribution"?"portfolio-chart-content overview-decomposition":"portfolio-chart-content"} role="tabpanel" aria-label={chartView}>
            {chartView==="Attribution"&&(decomposition?renderDecomposition(decomposition):<p className="archive-table-note">Factor history is incomplete for this period. Choose a more recent starting month.</p>)}
            {chartView==="Returns by group"&&<><div className="holdings-grouping" aria-label="Group chart and holdings">{(["Stocks","Sectors",...(example.days.some(d=>d.values.some(v=>v<0))?["Long / short"]:[])] as PortfolioGrouping[]).map(mode=><button key={mode} className={grouping===mode?"active":""} aria-pressed={grouping===mode} onClick={()=>{setGrouping(mode);setSelectedGroup(null);}}>{mode}</button>)}</div><GroupReturnsChart dates={grouped.dates} groups={grouped.groups} selectedGroup={selectedGroup} onSelectGroup={selectGroup} selectedDate={day.date} onSelectDate={setSelectedDate}/></>}
          </div>
        </section>
      </div>
      <aside className="portfolio-side-stack" aria-label="Portfolio summary and holdings">
        <section className="panel overview-summary" aria-label="Portfolio performance summary">
          <div className="archive-metrics example-metrics">
            <article title={isAI?"Cumulative portfolio return; costs excluded":"Cumulative portfolio return after estimated execution costs"}><span>Total return</span><strong>{pct(example.analytics.totalReturn)}</strong></article>
            <article title="Compound annual growth rate over the displayed period"><span>Annualized return</span><strong>{example.annualReturn===null?"—":pct(example.annualReturn)}</strong></article>
            <article title="Historical Sharpe over published French RF; see About for methodology"><span>Historical Sharpe</span><strong>{example.sharpe?.toFixed(2)??"—"}</strong></article>
            <article title="Historical market beta against the S&P 500"><span>Historical market beta</span><strong>{example.analytics.beta.toFixed(2)}</strong></article>
          </div>
        </section>
        {riskSummary}
        <PortfolioHoldings positions={positions} total={day.nav} history={{dates:example.days.map(day=>day.date),selectedDate:day.date,onSelectDate:setSelectedDate}} allocation={allocation} grouping={grouping} onGroupingChange={mode=>{setGrouping(mode);setSelectedGroup(null);setChartView("Returns by group");}} groupingOptions={(["Stocks","Sectors",...(example.days.some(d=>d.values.some(v=>v<0))?["Long / short"]:[])] as PortfolioGrouping[])} selectedGroup={selectedGroup} onSelectGroup={selectGroup} groupColors={Object.fromEntries(grouped.groups.map((group,i)=>[group.name,groupStyle(group.name).color]))} onSelectTicker={onSelectTicker} footer={isAI?undefined:<details className="example-cost-settings"><summary>Transaction costs <span>{cost} bps</span></summary><div><label>Execution cost (bps)<input aria-label="Example execution cost" type="number" min="0" max="100" value={cost} onChange={e=>setCost(Math.min(100,Math.max(0,Number(e.target.value))))}/></label><p>Estimated total: <strong>{money(example.totalCosts)}</strong>. Portfolio performance is shown after these costs; sector return paths are gross.</p></div></details>}/>
      </aside>
    </div>
  </div>;
}
