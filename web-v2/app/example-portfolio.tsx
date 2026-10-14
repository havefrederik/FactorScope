"use client";
import { useMemo, type ReactNode } from "react";
import { buildPortfolioDecomposition, type MarketPayload, type PortfolioAnalytics, type SecurityDecomposition } from "@/lib/analytics";
import type { ExamplePortfolioResult } from "@/lib/example-portfolio";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n);
const pct=(n:number)=>`${(100*n).toFixed(2)}%`;
export default function ExamplePortfolio({payload,example,firstMonth,setFirstMonth,cost,setCost,selectedDate,setSelectedDate,onSelectTicker,renderPerformance,renderDecomposition}:{payload:MarketPayload;example:ExamplePortfolioResult;firstMonth:string;setFirstMonth:(value:string)=>void;cost:number;setCost:(value:number)=>void;selectedDate:string;setSelectedDate:(value:string)=>void;onSelectTicker:(ticker:string)=>void;renderPerformance:(analytics:PortfolioAnalytics)=>ReactNode;renderDecomposition:(decomposition:SecurityDecomposition)=>ReactNode}){
  const end=payload.asOf??"";
  const decomposition=useMemo(()=>example?buildPortfolioDecomposition(payload,example.analytics):null,[payload,example]);
  const index=Math.max(0,selectedDate?example.days.findIndex(day=>day.date===selectedDate):example.days.length-1);
  const day=example.days[index],rebalance=example.rebalances[day.rebalance];
  const rows=example.tickers.map((ticker,i)=>({ticker,value:day.values[i],target:rebalance?.targets[i]??0,score:rebalance?.scores[i]??null})).filter(row=>row.value!==0||row.target!==0).sort((a,b)=>b.value-a.value);
  function download(){
    if(!example)return;
    const lines=["date,ticker,value_usd,weight,target_weight,rebalance_month,portfolio_type"];
    for(const d of example.days){const reb=example.rebalances[d.rebalance];example.tickers.forEach((ticker,j)=>{if(d.values[j]||reb?.targets[j])lines.push([d.date,ticker,d.values[j],d.values[j]/d.nav,reb?.targets[j]??0,reb?.month??"","illustrative portfolio"].join(","));});lines.push([d.date,"CASH",d.cash,d.cash/d.nav,1-(reb?.targets.reduce((a,b)=>a+b,0)??0),reb?.month??"","illustrative portfolio"].join(","));}
    const url=URL.createObjectURL(new Blob([lines.join("\n")],{type:"text/csv"}));const a=document.createElement("a");a.href=url;a.download="us-equity-portfolio-daily-holdings.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <div className="published-dow example-portfolio">
    <header className="example-summary-head">
      <h1>Portfolio overview</h1>
      <div className="example-controls"><label>Start<input aria-label="Example first month" type="month" value={firstMonth} max={end.slice(0,7)} onChange={e=>e.target.value&&setFirstMonth(e.target.value)}/></label><label>Costs (bps)<input aria-label="Example execution cost" type="number" min="0" max="100" value={cost} onChange={e=>setCost(Math.min(100,Math.max(0,Number(e.target.value))))}/></label><button onClick={download} aria-label="Download daily holdings CSV">Holdings CSV ↓</button></div>
      <span className="example-period">{example.analytics.startDate} — {example.analytics.endDate}</span>
    </header>
    <div className="archive-metrics example-metrics"><article><span>TOTAL RETURN</span><strong>{pct(example.analytics.totalReturn)}</strong><small>Estimated costs {money(example.totalCosts)}</small></article><article><span>ANNUALIZED RETURN</span><strong>{example.annualReturn===null?"—":pct(example.annualReturn)}</strong><small>CAGR</small></article><article><span>SHARPE RATIO</span><strong>{example.sharpe?.toFixed(2)??"—"}</strong><small>Annualized · 0% risk-free rate</small></article><article><span>MARKET BETA</span><strong>{example.analytics.beta.toFixed(2)}</strong><small>Volatility {pct(example.analytics.annualVolatility)} · drawdown {pct(example.analytics.maxDrawdown)}</small></article></div>
    <div className="portfolio-overview-grid">
    <div className="portfolio-chart-stack">
    <section className="panel overview-decomposition example-chart"><header className="panel-title"><h3>Factor and idiosyncratic return</h3><span>Attribution of the changing portfolio</span></header>{decomposition?renderDecomposition(decomposition):<p className="archive-table-note">Factor history is incomplete for this period. Choose a more recent starting month.</p>}</section>
    <section className="panel example-chart"><header className="panel-title"><h3>Performance</h3><span>US Equity Portfolio and S&amp;P 500</span></header>{renderPerformance(example.analytics)}</section>
    </div>
    <section className="panel archive-holdings example-holdings"><div className="archive-date-panel"><div className="archive-date-heading"><div><h2>Holdings on {day.date}</h2><p id="example-weight-help">Weight on date includes price drift. At rebalance is the monthly starting allocation.</p></div><label>Holdings date<select aria-label="Example holdings date" value={day.date} onChange={e=>setSelectedDate(e.target.value)}>{example.days.map(d=><option key={d.date}>{d.date}</option>)}</select></label></div><input className="archive-date-slider" type="range" min="0" max={example.days.length-1} value={index} onChange={e=>setSelectedDate(example.days[Number(e.target.value)].date)} aria-label="Example portfolio history date" aria-valuetext={day.date}/><div className="archive-date-summary"><span>Portfolio value <b>{money(day.nav)}</b></span><span>Cash <b>{pct(day.cash/day.nav)}</b></span><span>Rebalance month <b>{rebalance?.month??"Initial cash"}</b></span></div></div><div className="archive-table-scroll"><table aria-describedby="example-weight-help"><thead><tr><th scope="col">Security</th><th scope="col">Value</th><th scope="col" title={`Position value divided by portfolio value on ${day.date}`}>Weight on date</th><th scope="col" title="Allocation set at the monthly rebalance, before subsequent price changes">At rebalance</th></tr></thead><tbody>{rows.map(row=><tr key={row.ticker}><th><button className="example-stock-link" aria-label={`Analyze ${row.ticker} security`} onClick={()=>onSelectTicker(row.ticker)}>{row.ticker}<span>Analyze →</span></button></th><td>{money(row.value)}</td><td>{pct(row.value/day.nav)}</td><td>{pct(row.target)}</td></tr>)}<tr><th>Cash</th><td>{money(day.cash)}</td><td>{pct(day.cash/day.nav)}</td><td>{pct(1-(rebalance?.targets.reduce((a,b)=>a+b,0)??0))}</td></tr></tbody></table></div></section>
    </div>
  </div>;
}
