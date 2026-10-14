"use client";
import { useId, useState, type ReactNode } from "react";

export type PortfolioPosition = { ticker:string; name?:string; sector?:string; value:number };
type HoldingsProps = {
  positions:PortfolioPosition[];
  total:number;
  history?:{dates:string[];selectedDate:string;onSelectDate:(date:string)=>void};
  allocation?:{date:string;weights:Record<string,number>};
  grouping?:"Stocks"|"Sectors";
  onGroupingChange?:(grouping:"Stocks"|"Sectors")=>void;
  selectedGroup?:string|null;
  onSelectGroup?:(group:string|null)=>void;
  groupColors?:Record<string,string>;
  onSelectTicker:(ticker:string)=>void;
  isAnalyzable?:(ticker:string)=>boolean;
  footer?:ReactNode;
};
const money=(value:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(Math.abs(value)<.5?0:value);
const weight=(value:number)=>`${(Math.abs(value)<.00005?0:value*100).toFixed(2)}%`;

export default function PortfolioHoldings({positions,total,history,allocation,grouping:controlledGrouping,onGroupingChange,selectedGroup,onSelectGroup,groupColors,onSelectTicker,isAnalyzable,footer}:HoldingsProps){
  const helpId=useId();
  const [localGrouping,setLocalGrouping]=useState<"Stocks"|"Sectors">("Stocks");
  const grouping=controlledGrouping??localGrouping;
  const stocks=positions.filter(position=>position.ticker!=="CASH");
  const cash=positions.filter(position=>position.ticker==="CASH").reduce((sum,position)=>sum+position.value,0);
  const groups=[...new Set(stocks.map(position=>position.sector??"Unclassified"))].map(name=>{
    const members=stocks.filter(position=>(position.sector??"Unclassified")===name);
    return {name,count:members.filter(position=>position.value!==0).length,value:members.reduce((sum,position)=>sum+position.value,0),reference:allocation?members.reduce((sum,position)=>sum+(allocation.weights[position.ticker]??0),0):null};
  }).sort((a,b)=>Math.abs(b.value)-Math.abs(a.value));
  const cashReference=allocation?.weights.CASH??(allocation?1-stocks.reduce((sum,position)=>sum+(allocation.weights[position.ticker]??0),0):null);
  const dateIndex=history?Math.max(0,history.dates.indexOf(history.selectedDate)):0;
  function chooseGrouping(mode:"Stocks"|"Sectors"){setLocalGrouping(mode);onGroupingChange?.(mode);}
  return <section className={`panel archive-holdings example-holdings portfolio-holdings-panel ${allocation?"has-allocation-reference":"snapshot-holdings"}`}>
    <div className="archive-date-panel">
      <div className="archive-date-heading">
        <div><h2>Portfolio positions</h2>{history&&<span className="positions-asof">As of {history.selectedDate}</span>}</div>
        {history&&<label>Holdings date<select aria-label="Holdings history date" value={history.selectedDate} onChange={event=>history.onSelectDate(event.target.value)}>{history.dates.map(date=><option key={date}>{date}</option>)}</select></label>}
      </div>
      {history&&<input className="archive-date-slider" type="range" min="0" max={history.dates.length-1} value={dateIndex} onChange={event=>history.onSelectDate(history.dates[Number(event.target.value)])} aria-label="Portfolio history date" aria-valuetext={history.selectedDate}/>}
      <div className="archive-date-summary"><span>Portfolio value <b>{money(total)}</b></span><span>Cash <b>{weight(cash/total)}</b></span>{allocation&&<span>Last allocation <b>{allocation.date}</b></span>}</div>
    </div>
    <div className="holdings-grouping" aria-label="Group portfolio holdings">{(["Stocks","Sectors"] as const).map(mode=><button key={mode} aria-pressed={grouping===mode} className={grouping===mode?"active":""} onClick={()=>chooseGrouping(mode)}>{mode}</button>)}</div>
    <div className={`archive-table-scroll ${grouping==="Sectors"?"sector-holdings":""}`}>
      <table aria-describedby={helpId}>
        <thead><tr><th scope="col">{grouping==="Stocks"?"Security":"Sector"}</th><th scope="col">Value</th><th scope="col" title="Position value divided by portfolio value">Weight</th>{allocation&&<th scope="col" title={`Recorded allocation weight from ${allocation.date}`}>Allocation weight</th>}</tr></thead>
        <tbody>
          {grouping==="Stocks"?stocks.slice().sort((a,b)=>Math.abs(b.value)-Math.abs(a.value)).map(position=><tr key={position.ticker}><th><button className="example-stock-link" disabled={isAnalyzable?.(position.ticker)===false} aria-label={`Analyze ${position.ticker} security`} onClick={()=>onSelectTicker(position.ticker)}>{position.ticker}<span>Analyze →</span></button></th><td>{money(position.value)}</td><td>{weight(position.value/total)}</td>{allocation&&<td>{weight(allocation.weights[position.ticker]??0)}</td>}</tr>):groups.map(group=><tr key={group.name} className={selectedGroup===group.name?"selected-sector":""}><th>{onSelectGroup?<button className="sector-holding-link" aria-pressed={selectedGroup===group.name} onClick={()=>onSelectGroup(selectedGroup===group.name?null:group.name)}><i style={{background:groupColors?.[group.name]??"#a7aca0"}}/><span>{group.name}<small>{group.count} positions</small></span></button>:<span className="sector-holding-label">{group.name}<small>{group.count} positions</small></span>}</th><td>{money(group.value)}</td><td>{weight(group.value/total)}</td>{allocation&&<td>{weight(group.reference??0)}</td>}</tr>)}
          <tr><th>Cash</th><td>{money(cash)}</td><td>{weight(cash/total)}</td>{allocation&&<td>{weight(cashReference??0)}</td>}</tr>
        </tbody>
      </table>
    </div>
    <details className="holdings-definitions"><summary>About these weights</summary><p id={helpId}>Weight is position value divided by portfolio value{history?` on ${history.selectedDate}`:" in the supplied allocation"}. Negative weights represent short positions.{allocation?` Allocation weight is the recorded reference from ${allocation.date}; changes in prices can move weights away from that allocation.`:" No holdings history or rebalance weights were supplied for this snapshot."}</p></details>
    {footer}
  </section>;
}
