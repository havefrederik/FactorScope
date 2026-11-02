"use client";
import { useId, useState, type ReactNode } from "react";

import type { PortfolioGrouping } from "@/lib/portfolio-groups";

export type PortfolioPosition = { ticker:string; name?:string; sector?:string; value:number };
type HoldingsProps = {
  positions:PortfolioPosition[];
  total:number;
  history?:{dates:string[];selectedDate:string;onSelectDate:(date:string)=>void};
  allocation?:{date:string;weights:Record<string,number>};
  grouping?:PortfolioGrouping;
  onGroupingChange?:(grouping:PortfolioGrouping)=>void;
  selectedGroup?:string|null;
  onSelectGroup?:(group:string|null)=>void;
  groupingOptions?:PortfolioGrouping[];
  groupColors?:Record<string,string>;
  onSelectTicker:(ticker:string)=>void;
  isAnalyzable?:(ticker:string)=>boolean;
  footer?:ReactNode;
};
const money=(value:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(Math.abs(value)<.5?0:value);
const weight=(value:number)=>`${(Math.abs(value)<.00005?0:value*100).toFixed(2)}%`;

export default function PortfolioHoldings({positions,total,history,allocation,grouping:controlledGrouping,onGroupingChange,selectedGroup,onSelectGroup,groupingOptions,groupColors,onSelectTicker,isAnalyzable,footer}:HoldingsProps){
  const helpId=useId();
  const [basis,setBasis]=useState<"AUM"|"Gross">("AUM");
  const [localGrouping,setLocalGrouping]=useState<PortfolioGrouping>("Stocks");
  const grouping=controlledGrouping??localGrouping;
  const stocks=positions.filter(position=>position.ticker!=="CASH");
  const gross=stocks.reduce((s,p)=>s+Math.abs(p.value),0);
  const denominator=basis==="AUM"?total:gross;
  const targetGross=stocks.reduce((s,p)=>s+Math.abs(allocation?.weights[p.ticker]??0),0);
  const showWeight=(value:number)=>denominator>0?weight(value/denominator):"—";
  const showTarget=(value:number)=>basis==="AUM"?weight(value):targetGross>0?weight(value/targetGross):"—";
  const cash=positions.filter(position=>position.ticker==="CASH").reduce((sum,position)=>sum+position.value,0);
  const groupName=(position:PortfolioPosition)=>grouping==="Long / short"?(position.value<0?"Short":"Long"):position.sector??"Unclassified";
  const groups=[...new Set(stocks.map(groupName))].map(name=>{
    const members=stocks.filter(position=>groupName(position)===name);
    return {name,count:members.filter(position=>position.value!==0).length,value:members.reduce((sum,position)=>sum+position.value,0),reference:allocation?members.reduce((sum,position)=>sum+(allocation.weights[position.ticker]??0),0):null};
  }).sort((a,b)=>Math.abs(b.value)-Math.abs(a.value));
  const cashReference=allocation?.weights.CASH??(allocation?1-stocks.reduce((sum,position)=>sum+(allocation.weights[position.ticker]??0),0):null);
  const dateIndex=history?Math.max(0,history.dates.indexOf(history.selectedDate)):0;
  function chooseGrouping(mode:PortfolioGrouping){setLocalGrouping(mode);onGroupingChange?.(mode);}
  return <section className={`panel archive-holdings example-holdings portfolio-holdings-panel ${allocation?"has-allocation-reference":"snapshot-holdings"}`}>
    <div className="archive-date-panel">
      <div className="archive-date-heading">
        <div><h2>Portfolio positions</h2>{history&&<span className="positions-asof">As of {history.selectedDate}</span>}</div>
        {history&&<label>Holdings date<select aria-label="Holdings history date" value={history.selectedDate} onChange={event=>history.onSelectDate(event.target.value)}>{history.dates.map(date=><option key={date}>{date}</option>)}</select></label>}
      </div>
      {history&&<input className="archive-date-slider" type="range" min="0" max={history.dates.length-1} value={dateIndex} onChange={event=>history.onSelectDate(history.dates[Number(event.target.value)])} aria-label="Portfolio history date" aria-valuetext={history.selectedDate}/>}
      <div className="archive-date-summary"><span>Portfolio value <b>{money(total)}</b></span><span>Cash <b>{weight(cash/total)}</b></span>{allocation&&<span>Last allocation <b>{allocation.date}</b></span>}</div>
    </div>
    <div className="holdings-grouping" aria-label="Group portfolio holdings">{(groupingOptions??["Stocks","Sectors",...(stocks.some(p=>p.value<0)?["Long / short" as const]:[])]).map(mode=><button key={mode} aria-pressed={grouping===mode} className={grouping===mode?"active":""} onClick={()=>chooseGrouping(mode)}>{mode}</button>)}</div>
    <div className="holdings-basis"><label>Weights<select aria-label="Holdings weight basis" value={basis} onChange={e=>setBasis(e.target.value as "AUM"|"Gross")}><option value="AUM">% AUM</option><option value="Gross">% Gross</option></select></label></div>
    <div className={`archive-table-scroll ${grouping!=="Stocks"?"sector-holdings":""}`}>
      <table aria-describedby={helpId}>
        <thead><tr><th scope="col">{grouping==="Stocks"?"Security":grouping==="Sectors"?"Sector":"Side"}</th><th scope="col">Value</th><th scope="col" title={basis==="AUM"?"Position value divided by portfolio value":"Signed position value divided by gross stock exposure"}>Weight · {basis}</th>{allocation&&<th scope="col" title={`Recorded allocation weight from ${allocation.date}`}>Allocation weight</th>}</tr></thead>
        <tbody>
          {grouping==="Stocks"?stocks.slice().sort((a,b)=>Math.abs(b.value)-Math.abs(a.value)).map(position=><tr key={position.ticker} className={selectedGroup===position.ticker?"selected-sector":""}><th>{onSelectGroup&&<button className="stock-highlight" aria-label={`Highlight ${position.ticker} returns`} aria-pressed={selectedGroup===position.ticker} onClick={()=>onSelectGroup(selectedGroup===position.ticker?null:position.ticker)} style={{color:groupColors?.[position.ticker]}}>●</button>}<button className="example-stock-link" disabled={isAnalyzable?.(position.ticker)===false} aria-label={`Analyze ${position.ticker} security`} onClick={()=>onSelectTicker(position.ticker)}>{position.ticker}<span>Analyze →</span></button></th><td>{money(position.value)}</td><td>{showWeight(position.value)}</td>{allocation&&<td>{showTarget(allocation.weights[position.ticker]??0)}</td>}</tr>):groups.map(group=><tr key={group.name} className={selectedGroup===group.name?"selected-sector":""}><th>{onSelectGroup?<button className="sector-holding-link" aria-pressed={selectedGroup===group.name} onClick={()=>onSelectGroup(selectedGroup===group.name?null:group.name)}><i style={{background:groupColors?.[group.name]??"#a7aca0"}}/><span>{group.name}<small>{group.count} positions</small></span></button>:<span className="sector-holding-label">{group.name}<small>{group.count} positions</small></span>}</th><td>{money(group.value)}</td><td>{showWeight(group.value)}</td>{allocation&&<td>{showTarget(group.reference??0)}</td>}</tr>)}
          <tr><th>Cash</th><td>{money(cash)}</td><td>{basis==="AUM"?weight(cash/total):"—"}</td>{allocation&&<td>{basis==="AUM"?weight(cashReference??0):"—"}</td>}</tr>
        </tbody>
      </table>
    </div>
    <details className="holdings-definitions"><summary>About these weights</summary><p id={helpId}>AUM weight is position value divided by portfolio value{history?` on ${history.selectedDate}`:" in the supplied allocation"}. Gross weight divides signed stock value by the sum of absolute stock values; cash is excluded.{allocation?" Allocation weights use the corresponding basis at allocation time.":""} Negative weights represent short positions.{allocation?` Allocation weight is the recorded reference from ${allocation.date}; changes in prices can move weights away from that allocation.`:" No holdings history or rebalance weights were supplied for this snapshot."}</p></details>
    {footer}
  </section>;
}
