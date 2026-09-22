"use client";

import { useEffect, useMemo, useState } from "react";
import { dowArchiveSource, inspectDowArchive, type PublishedDowArchive } from "@/lib/published-dow";

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const percent = (n: number) => `${(n * 100).toFixed(2)}%`;
const colors = ["#25d2c6", "#9c8aff", "#e9ad61", "#81bc82", "#e778a4", "#74ade6", "#748694", "#c9d5da"];

export default function PublishedDowPortfolio() {
  const [data, setData] = useState<PublishedDowArchive | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/published-dow.json", { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error("Archive unavailable");
      return response.json() as Promise<PublishedDowArchive>;
    }).then(archive => { setData(archive); setIndex(archive.holdingDates.length - 1); }).catch(err => { if (err.name !== "AbortError") setError(true); });
    return () => controller.abort();
  }, []);
  const chart = useMemo(() => {
    if (!data) return null;
    const nav = data.holdings.map(row => row.reduce((a, b) => a + b, 0));
    let peak = nav[0], drawdown = 0;
    for (const value of nav) { peak = Math.max(peak, value); drawdown = Math.min(drawdown, value / peak - 1); }
    const low = Math.min(...nav) * .96, high = Math.max(...nav) * 1.04;
    const x = (i: number) => 58 + i / Math.max(nav.length - 1, 1) * 860;
    const y = (v: number) => 215 - (v - low) / (high - low) * 190;
    const path = nav.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
    const ranked = data.tickers.map((ticker, j) => ({ ticker, j, average: data.holdings.reduce((s, row, i) => s + row[j] / nav[i], 0) / nav.length })).filter(item => item.ticker !== "USDOLLAR").sort((a, b) => b.average - a.average).slice(0, 6);
    const cashIndex = data.tickers.indexOf("USDOLLAR");
    const shares = data.holdings.map((row, i) => {
      const top = ranked.map(item => row[item.j] / nav[i]);
      const cash = row[cashIndex] / nav[i];
      return [...top, 1 - cash - top.reduce((a, b) => a + b, 0), cash];
    });
    const areas = Array.from({ length: 8 }, (_, layer) => {
      const lower = shares.map(row => row.slice(0, layer).filter(v => (v >= 0) === (row[layer] >= 0)).reduce((a, b) => a + b, 0));
      const upper = shares.map((row, i) => lower[i] + row[layer]);
      return `${upper.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${(215 - 190 * v).toFixed(2)}`).join(" ")} ${lower.map((v, i) => `L${x(i).toFixed(2)},${(215 - 190 * v).toFixed(2)}`).reverse().join(" ")} Z`;
    });
    return { nav, low, high, x, y, path, drawdown, areas, labels: [...ranked.map(row => row.ticker), "Other stocks", "Cash"] };
  }, [data]);
  if (error) return <section className="data-state"><div><strong>Published archive could not be loaded</strong><p>Refresh the page to retry, or view the <a href={dowArchiveSource} target="_blank" rel="noreferrer">original records</a>.</p></div></section>;
  if (!data || !chart) return <section className="data-state"><span className="data-spinner"/><strong>Loading published holdings</strong></section>;
  const selected = inspectDowArchive(data, index);
  const lastDate = data.holdingDates.at(-1)!;
  const totalReturn = chart.nav.at(-1)! / chart.nav[0] - 1;
  const maxTarget = Math.max(...selected.rows.filter(row => row.ticker !== "USDOLLAR").map(row => row.target));
  return <div className="published-dow">
    <header className="page-head"><div><span className="kicker">PUBLISHED STRATEGY / HOLDINGS ARCHIVE</span><h1>Dow equity strategy</h1><p>Inspect the authors’ changing allocations and recorded paper-portfolio value.</p></div></header>
    <aside className="published-fund-context">
      <div><span>CVXPORTFOLIO</span><strong>Long-only US equities · {data.holdingDates[0]} to {lastDate}</strong><a href={dowArchiveSource} target="_blank" rel="noreferrer">Original records ↗</a></div>
      <p>A later author-published demonstration of the <a href="https://web.stanford.edu/~boyd/papers/cvx_portfolio.html" target="_blank" rel="noreferrer">Boyd et al. convex-trading framework</a>. This is simulated paper trading, not a live fund or the original paper’s numerical portfolio. The allocations below are preserved as published.</p>
      <details><summary>Construction and scope</summary><p>The policy combines historical return estimates, covariance risk relative to a market-volume benchmark and transaction-cost penalties, with long-only and unit-leverage constraints. Risk and cost penalties are selected using historical Sharpe. It has no 5% position cap; concentration is visible in the holdings.</p><p>The archive contains {data.targetDates.length} target snapshots and {data.holdingDates.length} holdings dates. On dates without a new target, the source simulator carries forward the latest instruction. Holdings include simulated costs and cash; FactorScope adds no extra charges. Small negative residual positions and cash balances are retained as recorded.</p><p>Values are marked at market open. The source runner executes after the open and revises recent simulated holdings as prices update, so the record does not establish achievable opening fills. The final target has no subsequent return in this archive.</p><p>We show the source value history and weights together. Factor attribution and covariance tools use a separate close-to-close data convention and are not applied to this archive.</p><p>Source: Enzo Busseti and the Cvxportfolio authors. <a href="/data/cvxportfolio-LICENSE.txt" target="_blank" rel="noreferrer">GPL-3.0 license</a> · <a href="/data/published-dow.json" download>Download the archived observations</a>.</p></details>
    </aside>
    <div className="archive-metrics">
      <article><span>ARCHIVE TOTAL RETURN</span><strong>{totalReturn >= 0 ? "+" : ""}{percent(totalReturn)}</strong><small>Full published period</small></article>
      <article><span>ENDING PAPER VALUE</span><strong>{money(chart.nav.at(-1)!)}</strong><small>{money(chart.nav[0])} starting value</small></article>
      <article><span>MAXIMUM DRAWDOWN</span><strong>{percent(chart.drawdown)}</strong><small>From the recorded value path</small></article>
    </div>
    <section className="panel archive-date-panel">
      <div className="archive-date-heading"><div><h2>Portfolio through time</h2><p>Move the date to update every holding and its target allocation.</p></div><label>Holdings date<select aria-label="Published holdings date" value={index} onChange={event => setIndex(Number(event.target.value))}>{data.holdingDates.map((date, i) => <option key={date} value={i}>{date}</option>)}</select></label></div>
      <input className="archive-date-slider" type="range" min={0} max={data.holdingDates.length - 1} value={index} onChange={event => setIndex(Number(event.target.value))} aria-label="Portfolio history date" aria-valuetext={selected.date}/>
      <div className="archive-date-range"><span>{data.holdingDates[0]}</span><strong>{selected.date}</strong><span>{lastDate}</span></div>
      <div className="archive-date-summary"><span>Value at open <b>{money(selected.nav)}</b></span><span>Return since start <b>{percent(selected.totalReturn)}</b></span><span>Largest target <b>{percent(maxTarget)}</b></span></div>
    </section>
    <section className="panel archive-charts"><header className="panel-title"><h3>Recorded portfolio value</h3><span>USD · source simulation · values at market open</span></header>
      <svg viewBox="0 0 960 255" role="img" aria-label="Published simulated portfolio value through time"><title>Recorded paper portfolio value; selected date {selected.date}, {money(selected.nav)}</title>{[0, .5, 1].map(f => { const v = chart.low + (chart.high - chart.low) * f; return <g key={f}><line x1="58" x2="918" y1={chart.y(v)} y2={chart.y(v)} className="archive-gridline"/><text x="50" y={chart.y(v) + 4} textAnchor="end">{(v / 1e6).toFixed(2)}m</text></g>; })}<path d={chart.path} fill="none" stroke="#25d2c6" strokeWidth="2.5"/><line x1={chart.x(index)} x2={chart.x(index)} y1="25" y2="215" className="archive-marker"/><circle cx={chart.x(index)} cy={chart.y(selected.nav)} r="4" fill="#e8f1f4"/><text x="58" y="243">{data.holdingDates[0]}</text><text x="918" y="243" textAnchor="end">{lastDate}</text></svg>
      <header className="panel-title"><h3>Allocation history</h3><span>Holdings at open · largest average positions</span></header><div className="archive-legend">{chart.labels.map((label, i) => <span key={label}><i style={{ background: colors[i] }}/>{label}</span>)}</div>
      <svg viewBox="0 0 960 255" role="img" aria-label="Stock weights through time"><title>Allocation history of the published portfolio</title>{chart.areas.map((path, i) => <path key={i} d={path} fill={colors[i]} opacity=".85"/>)}{[0, .5, 1].map(v => <text key={v} x="50" y={219 - 190 * v} textAnchor="end">{Math.round(v * 100)}%</text>)}<line x1={chart.x(index)} x2={chart.x(index)} y1="25" y2="215" className="archive-marker"/><text x="58" y="243">{data.holdingDates[0]}</text><text x="918" y="243" textAnchor="end">{lastDate}</text></svg>
    </section>
    <section className="panel archive-holdings"><header className="panel-title"><h3>Positions on {selected.date}</h3><span>{selected.newTarget ? "New target published on this date" : `Latest target carried forward from ${selected.targetDate}`}</span></header><p className="archive-table-note">Holdings are measured before that session’s trade. Target weights are the published allocation instruction; the change column is target minus weight at open.</p><div className="archive-table-scroll"><table><thead><tr><th>Security</th><th>Value at open</th><th>Weight at open</th><th>Target weight</th><th>Change (pp)</th></tr></thead><tbody>{selected.rows.map(row => <tr key={row.ticker}><th scope="row">{row.ticker === "USDOLLAR" ? "Cash" : row.ticker}</th><td>{money(row.dollars)}</td><td>{percent(row.weight)}</td><td><span className="archive-weight-cell"><i style={{ width: `${Math.max(0, row.target) * 100}%` }}/><b>{percent(row.target)}</b></span></td><td>{row.change >= 0 ? "+" : ""}{(row.change * 100).toFixed(2)}</td></tr>)}</tbody></table></div></section>
  </div>;
}
