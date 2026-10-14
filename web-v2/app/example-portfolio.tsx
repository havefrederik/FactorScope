"use client";
import { useMemo, useState, type ReactNode } from "react";
import { buildPortfolioDecomposition, type MarketPayload, type PortfolioAnalytics, type SecurityDecomposition } from "@/lib/analytics";
import type { ExamplePortfolioResult } from "@/lib/example-portfolio";
import { buildPortfolioGroups, groupHoldingsSnapshot } from "@/lib/portfolio-groups";
import GroupReturnsChart, { groupColors } from "./group-returns-chart";

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
  const sectorRows=groupHoldingsSnapshot(example,grouped.groups,index);
  function selectGroup(name:string|null){setSelectedGroup(name);setGrouping("Sectors");setChartView("Returns by group");}
  const rows=example.tickers.map((ticker,i)=>({ticker,value:day.values[i],target:rebalance?.targets[i]??0,score:rebalance?.scores[i]??null})).filter(row=>row.value!==0||row.target!==0).sort((a,b)=>b.value-a.value);
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
        <section className="panel archive-holdings example-holdings">
          <div className="archive-date-panel">
            <div className="archive-date-heading">
              <div><h2>Holdings on {day.date}</h2><p id="example-weight-help">Weight on date includes price drift. At rebalance is the monthly starting allocation.</p></div>
              <label>Holdings date<select aria-label="Example holdings date" value={day.date} onChange={e=>setSelectedDate(e.target.value)}>{example.days.map(d=><option key={d.date}>{d.date}</option>)}</select></label>
            </div>
            <input className="archive-date-slider" type="range" min="0" max={example.days.length-1} value={index} onChange={e=>setSelectedDate(example.days[Number(e.target.value)].date)} aria-label="Example portfolio history date" aria-valuetext={day.date}/>
            <div className="archive-date-summary"><span>Portfolio value <b>{money(day.nav)}</b></span><span>Cash <b>{pct(day.cash/day.nav)}</b></span><span>Rebalance month <b>{rebalance?.month??"Initial cash"}</b></span></div>
          </div>
          <div className="holdings-grouping" aria-label="Group portfolio holdings">{(["Stocks","Sectors"] as const).map(mode=><button key={mode} aria-pressed={grouping===mode} className={grouping===mode?"active":""} onClick={()=>{setGrouping(mode);if(mode==="Sectors")setChartView("Returns by group");}}>{mode}</button>)}</div>
          <div className={"archive-table-scroll"+(grouping==="Sectors"?" sector-holdings":"")}>
            <table aria-describedby="example-weight-help">
              <thead><tr><th scope="col">{grouping==="Stocks"?"Security":"Sector"}</th><th scope="col">Value</th><th scope="col" title={`Position value divided by portfolio value on ${day.date}`}>Weight on date</th><th scope="col" title="Allocation set at the monthly rebalance, before subsequent price changes">At rebalance</th></tr></thead>
              <tbody>
                {grouping==="Stocks"?rows.map(row=><tr key={row.ticker}><th><button className="example-stock-link" aria-label={`Analyze ${row.ticker} security`} onClick={()=>onSelectTicker(row.ticker)}>{row.ticker}<span>Analyze →</span></button></th><td>{money(row.value)}</td><td>{pct(row.value/day.nav)}</td><td>{pct(row.target)}</td></tr>):sectorRows.map(row=><tr key={row.name} className={selectedGroup===row.name?"selected-sector":""}><th><button className="sector-holding-link" aria-pressed={selectedGroup===row.name} onClick={()=>selectGroup(selectedGroup===row.name?null:row.name)}><i style={{background:groupColors[grouped.groups.findIndex(group=>group.name===row.name)%groupColors.length]}}/><span>{row.name}<small>{row.count} stocks</small></span></button></th><td>{money(row.value)}</td><td>{pct(row.weight)}</td><td>{pct(row.target)}</td></tr>)}
                <tr><th>Cash</th><td>{money(day.cash)}</td><td>{pct(day.cash/day.nav)}</td><td>{pct(1-(rebalance?.targets.reduce((a,b)=>a+b,0)??0))}</td></tr>
              </tbody>
            </table>
          </div>
          <details className="example-cost-settings"><summary>Transaction costs <span>{cost} bps</span></summary><div><label>Execution cost (bps)<input aria-label="Example execution cost" type="number" min="0" max="100" value={cost} onChange={e=>setCost(Math.min(100,Math.max(0,Number(e.target.value))))}/></label><p>Estimated total: <strong>{money(example.totalCosts)}</strong>. Portfolio performance is shown after these costs; sector return paths are gross.</p></div></details>
        </section>
      </aside>
    </div>
  </div>;
}
