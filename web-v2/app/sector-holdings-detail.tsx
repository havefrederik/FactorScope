"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ExamplePortfolioResult } from "@/lib/example-portfolio";
import { sectorHoldingPeriods, type ReturnGroup } from "@/lib/portfolio-groups";
import GroupReturnsChart from "./group-returns-chart";

type Props = {
  group: ReturnGroup;
  dates: string[];
  example: ExamplePortfolioResult;
  names: Record<string, string>;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onBack: () => void;
};

export default function SectorHoldingsDetail({group, dates, example, names, selectedDate, onSelectDate, onBack}: Props) {
  const [atClose, setAtClose] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus(); }, []);
  const periods = useMemo(() => sectorHoldingPeriods(example, group.indexes), [example, group.indexes]);
  const rows = atClose ? periods.filter(p => p.firstClose <= selectedDate && (!p.exitClose || selectedDate < p.exitClose)) : periods;
  const showSide = periods.some(p => p.side === "Short");
  function inspectClose(date: string) {
    setAtClose(true);
    onSelectDate(date);
  }

  return <section className="sector-detail" aria-label={`${group.name} holdings detail`}>
    <header className="sector-detail-heading">
      <h2 ref={title} tabIndex={-1}>Return on {group.name} holdings</h2>
      <button type="button" onClick={onBack}>← All contributions</button>
    </header>
    <GroupReturnsChart dates={dates} groups={[group]} measure="within" selectedGroup={group.name}
      selectedDate={selectedDate} onSelectDate={inspectClose} caption="Select a date to see the stocks held at that close."/>
    <div className="sector-period-toolbar">
      <h3>Holding periods</h3>
      <div className="sector-period-filter">
        <button type="button" aria-pressed={!atClose} onClick={()=>setAtClose(false)}>All periods</button>
        <button type="button" aria-pressed={atClose} onClick={()=>setAtClose(true)}>At selected close</button>
        {atClose&&<select aria-label="Sector holdings date" value={selectedDate} onChange={e=>inspectClose(e.target.value)}>{dates.map(date=><option key={date}>{date}</option>)}</select>}
      </div>
    </div>
    {rows.length ? <div className="sector-period-scroll" tabIndex={0} role="region" aria-label={`${group.name} stock holding periods`}>
      <table><thead><tr><th scope="col">Stock</th>{showSide&&<th scope="col">Side</th>}<th scope="col">First close held</th><th scope="col">Exit close</th></tr></thead>
        <tbody>{rows.map(p=><tr key={p.ticker+p.firstClose}>
          <th scope="row">{p.ticker}{names[p.ticker]&&names[p.ticker]!==p.ticker&&<small>{names[p.ticker]}</small>}</th>
          {showSide&&<td>{p.side}</td>}
          <td>{p.firstClose}{p.firstClose===dates[0]&&<small>Held at period start</small>}</td>
          <td>{p.exitClose??"Held at period end"}</td>
        </tr>)}</tbody>
      </table>
    </div> : <p className="sector-period-empty">{atClose?`No ${group.name} stocks held at the ${selectedDate} close.`:"No stocks held at a recorded close in this period."}</p>}
  </section>;
}
