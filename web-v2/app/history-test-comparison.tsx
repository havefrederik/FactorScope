"use client";
import {useState, type ReactNode} from "react";
import {comparableRuns, pathMetrics, type HindsightRun} from "@/lib/hindsight-runs";
import {historyWindow} from "@/lib/comparison-history";
import {historicalSharpe} from "@/lib/historical-sharpe";
import type {MarketPayload, PortfolioAnalytics} from "@/lib/analytics";

type Inputs = {
  runs: HindsightRun[];
  selectedId: string;
  onSelect: (id: string) => void;
  reference: PortfolioAnalytics;
  payload: MarketPayload;
  renderChart: (dates: string[], test: number[], original: number[], testName: string, originalName: string) => ReactNode;
};

export default function HistoryTestComparison({runs, selectedId, onSelect, reference, payload, renderChart}: Inputs) {
  const [against, setAgainst] = useState("");
  const run = runs.find(r => r.id === selectedId) ?? runs.at(-1);
  if (!run) return <section className="panel"><p className="lab-note">Run a historical test in Optimizer to compare its results here.</p></section>;
  const peers = comparableRuns(runs, run.comparisonKey).filter(r => r.id !== run.id && r.sharpeBenchmark === run.sharpeBenchmark);
  const peer = peers.find(r => r.id === against);
  let baseline = run.baselineCurve;
  if (!baseline && run.baselineSharpe != null && !run.portfolioName) {
    const window = historyWindow(reference, run.start, run.end);
    if (window && window.dates.length === run.dates.length && window.dates.every((d,i) => d === run.dates[i])) {
      const sharpe = historicalSharpe(window.dates, window.dailyReturns, payload);
      if (sharpe !== null && Math.abs(sharpe-run.baselineSharpe) < 1e-10) baseline = window.curve;
    }
  }
  const original = peer?.curve ?? baseline;
  const originalName = peer?.name ?? run.portfolioName ?? "Original portfolio";
  const metrics = original && pathMetrics(original, original.slice(1).map((v,i) => v/original[i]-1));
  const rows = [
    {label:"Historical Sharpe", base:peer ? peer.sharpe : run.baselineSharpe, test:run.sharpe, percent:false},
    {label:"Total return", base:metrics?.totalReturn, test:run.totalReturn, percent:true},
    {label:"Annualized volatility", base:metrics?.volatility, test:run.volatility, percent:true},
    {label:"Max drawdown", base:metrics?.maxDrawdown, test:run.maxDrawdown, percent:true}
  ];
  const fmt = (v:number|null|undefined, percent:boolean, diff=false) => v==null ? "—" : (diff && v>0 ? "+" : "") + (v*(percent?100:1)).toFixed(2) + (percent ? (diff ? " pp" : "%") : "");
  return <>
    <section className="panel compare-controls"><header className="panel-title"><h3>Historical strategy test</h3><span>{run.start} — {run.end} · {run.trades} executed rebalances{run.infeasibleDecisions ? ` · held at ${run.infeasibleDecisions} infeasible decisions` : ""}</span></header>
      <div className="optimizer-config-controls"><label>Tested strategy<select value={run.id} onChange={e=>{onSelect(e.target.value);setAgainst("");}}>{runs.slice().reverse().map(r=><option key={r.id} value={r.id}>{r.name} · {r.start} — {r.end}{r.portfolioName ? " · "+r.portfolioName : ""}</option>)}</select></label>
      <label>Compare with<select value={peer?.id??""} onChange={e=>setAgainst(e.target.value)}><option value="">{run.portfolioName??"Original portfolio"}</option>{peers.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label></div>
      <p className="lab-note">{run.modelLabel} · {run.policy.interval} · {run.policy.costBps} bps execution cost</p>
    </section>
    <section className="panel compare-summary"><header className="panel-title"><h3>Realized performance</h3></header><div className="compare-table-scroll"><table><thead><tr><th>Measure</th><th>{originalName}</th><th>{run.name}</th><th>Change</th></tr></thead><tbody>
      {rows.map(row=><tr key={row.label}><th>{row.label}</th><td>{fmt(row.base,row.percent)}</td><td>{fmt(row.test,row.percent)}</td><td>{fmt(row.base!=null && row.test!=null ? row.test-row.base : null,row.percent,true)}</td></tr>)}
    </tbody></table></div></section>
    <section className="panel compare-chart"><header className="panel-title"><h3>Strategy paths</h3><span>{run.start} — {run.end}</span></header>
      {!original&&<p className="lab-note">The original portfolio curve is unavailable for these dates. The chart shows the saved strategy.</p>}
      {renderChart(run.dates,run.curve,original??[],run.name,originalName)}
    </section>
  </>;
}
