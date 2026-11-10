"use client";
import {horizonLabel,horizonVolatility} from "@/lib/forecast-horizon";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { buildAnalytics, type CovarianceForecastAnalytics, type MarketPayload, type PortfolioAnalytics } from "@/lib/analytics";
import { comparisonHoldings, comparisonPresetWeights, replayStatistics, type ComparisonPreset } from "@/lib/comparison-portfolio";
import { buildConstructionFactors, constructionMeasures, type ConstructionSnapshot } from "@/lib/portfolio-construction";
import { comparisonHistory, historyWindow } from "@/lib/comparison-history";
import CompactRiskSummary from './compact-risk-summary';
import type { ExamplePortfolioResult } from "@/lib/example-portfolio";

type ComparisonHolding = { ticker: string; value: number; name: string };
const percent = (value: number) => `${(Math.abs(value)<.0005?0:value * 100).toFixed(1)}%`;
const historicalPercent = (value: number) => `${(Math.abs(value)<.00005?0:value*100).toFixed(2)}%`;
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const change = (value: number, percentValue = false, precision = 2) => {
  const rounded = Number((value * (percentValue ? 100 : 1)).toFixed(precision));
  return `${rounded >= 0 ? "+" : ""}${(rounded === 0 ? 0 : rounded).toFixed(precision)}${percentValue ? " pp" : ""}`;
};

export default function PortfolioComparisonWorkspace({ onAdopt, initialWeights, constructionSnapshot, holdings, savedHoldings, payload, reference, forecast, onSelectTicker, renderPerformance, baselineHistory, historyMode = "daily", historyCostBps = 0, onMethodology }: { baselineHistory?: ExamplePortfolioResult | null; historyMode?: "daily" | "monthly"; historyCostBps?: number; onMethodology?: () => void; onAdopt?:(weights:Record<string,number>)=>void; initialWeights?:Record<string,number>; constructionSnapshot?:ConstructionSnapshot; holdings: ComparisonHolding[]; savedHoldings: ComparisonHolding[]; payload: MarketPayload; reference: PortfolioAnalytics; forecast?: CovarianceForecastAnalytics | null; onSelectTicker: (ticker: string) => void; renderPerformance: (current: PortfolioAnalytics, alternative: PortfolioAnalytics) => ReactNode }) {
  const [detailView, setDetailView] = useState<"Performance" | "Factor changes" | "Concentration">("Performance");
  const [savedComparisons, setSavedComparisons] = useState<{name:string; weights:Record<string,number>; start:string; end:string; borrowing:boolean}[]>([]);
  const [saveName,setSaveName] = useState("");
  const [saveMessage,setSaveMessage] = useState("");
  const storageKey = "factorscope-comparisons-v1:" + holdings.map(h=>h.ticker).sort().join(",");
  useEffect(()=>{try{const items=JSON.parse(localStorage.getItem(storageKey)??"[]");setSavedComparisons(Array.isArray(items)?items.filter(item=>item && typeof item.name==="string" && typeof item.start==="string" && typeof item.end==="string" && item.weights && Object.values(item.weights).every(value=>typeof value==="number"&&Number.isFinite(value))).slice(0,10):[]);}catch{setSavedComparisons([]);}},[storageKey]);
  function persistComparisons(items:typeof savedComparisons){try{localStorage.setItem(storageKey,JSON.stringify(items));setSavedComparisons(items);setSaveMessage("Saved in this browser");}catch{setSaveMessage("Browser storage is unavailable.");}}
  const [replayStart, setReplayStart] = useState(reference.startDate);
  const [replayEnd, setReplayEnd] = useState(reference.endDate);
  const fallbackModel = useMemo(() => constructionSnapshot ? null : buildConstructionFactors(payload, forecast ?? null), [constructionSnapshot, payload, forecast]);
  const snapshot = useMemo<ConstructionSnapshot | null>(() => constructionSnapshot ?? (forecast ? { forecast, factors: fallbackModel?.factors ?? [], expectedReturns: null, objective: "What-if allocation", returnAssumption: null } : null), [constructionSnapshot, forecast, fallbackModel]);
  const proposalAsOf = constructionSnapshot?.forecast.asOf;
  const replayDates = reference.dates;
  const [preset, setPreset] = useState<ComparisonPreset>(() => holdings.some(item => item.ticker !== "CASH" && item.value < 0) ? "Current weights" : "Current weights");
  const [customWeights, setCustomWeights] = useState<Record<string, number> | null>(initialWeights??null);
  const [allowShorts,setAllowShorts]=useState(false),[allowFinancing,setAllowFinancing]=useState(()=>Object.values(initialWeights??{}).reduce((a,b)=>a+b,0)>1+2e-6||holdings.some(h=>h.ticker==="CASH"&&h.value/holdings.reduce((sum,item)=>sum+item.value,0)<-2e-6));
  const total = holdings.reduce((sum, item) => sum + item.value, 0);
  const hasShorts = allowShorts||holdings.some(item => item.ticker !== "CASH" && item.value < 0)||Object.values(initialWeights??{}).some(value=>value< -1e-9);
  const universe = useMemo(() => preset === "Saved baseline" ? [...holdings, ...savedHoldings.filter(item => !holdings.some(current => current.ticker === item.ticker)).map(item => ({ ...item, value: 0 }))] : holdings, [holdings, savedHoldings, preset]);
  const betas = useMemo(() => new Map((reference.positions.length ? reference.positions : buildAnalytics(payload, universe, {startDate:reference.startDate,endDate:reference.endDate})?.positions ?? []).map(item => [item.ticker, item.beta])), [reference, payload, universe]);
  const weights = useMemo(() => customWeights ?? comparisonPresetWeights(universe, betas, preset, savedHoldings), [customWeights, universe, betas, preset, savedHoldings]);
  const alternativeHoldings = useMemo(() => comparisonHoldings(universe, weights), [universe, weights]);
  const cash = alternativeHoldings.find(item => item.ticker === "CASH")?.value ?? 0;
  const valid = total > 0 && (allowFinancing||cash / total >= -2e-6);
  const currentWeights = useMemo(() => Object.fromEntries(universe.filter(h => h.ticker !== "CASH").map(h => [h.ticker, h.value / total])), [universe, total]);
  const results = useMemo(() => {
    const current = historyWindow(reference, replayStart, replayEnd, total);
    if (!current || !valid) return { current, alternative: null, error: "" };
    try {
      const alternative = baselineHistory
        ? comparisonHistory(payload, baselineHistory, historyMode, currentWeights, weights, current.startDate, current.endDate, total, historyCostBps)
        : buildAnalytics(payload, alternativeHoldings, { startDate: current.startDate, endDate: current.endDate });
      if (alternative && (alternative.dates.length !== current.dates.length || alternative.dates.some((date, i) => date !== current.dates[i])))
        return { current, alternative: null, error: "The alternative does not cover every date in the selected portfolio history." };
      return { current, alternative, error: "" };
    } catch (error) { return { current, alternative: null, error: (error as Error).message }; }
  }, [reference, payload, baselineHistory, historyMode, historyCostBps, currentWeights, weights, alternativeHoldings, replayStart, replayEnd, total, valid]);
  const construction = useMemo(() => {
    if (!snapshot || !valid) return null;
    const current = constructionMeasures(snapshot, Object.fromEntries(universe.filter(h => h.ticker !== "CASH").map(h => [h.ticker, h.value / total])));
    const alternative = constructionMeasures(snapshot, weights);
    return current && alternative ? { current, alternative } : null;
  }, [snapshot, valid, universe, weights, total]);
  const relativeBase=construction?.current.signalRisk;
  const riskMetrics = construction ? [
    ...(snapshot?.relativeSignals?[{label:"Preference / forecast risk",a:relativeBase&&relativeBase>1e-12?100:null,b:relativeBase&&relativeBase>1e-12&&construction.alternative.signalRisk!==null?100*construction.alternative.signalRisk/relativeBase:null,percent:false}]:[]),
    ...(snapshot?.expectedReturns ? [
      { label: "Assumed annual excess return", a: construction.current.expectedReturn, b: construction.alternative.expectedReturn, percent: true },
      { label: "Expected Sharpe · manual forecasts", a: construction.current.assumedSharpe, b: construction.alternative.assumedSharpe, percent: false },
    ] : []),
    { label: "Cash / collateral", a: 1 - construction.current.net, b: 1 - construction.alternative.net, percent: true },
  ] : [];
  const current = results.current, alternative = results.alternative;
  const statistics = current && alternative ? [replayStatistics(current.dates, current.dailyReturns, current.totalReturn, payload), replayStatistics(alternative.dates, alternative.dailyReturns, alternative.totalReturn, payload)] : null;
  const metrics = current && alternative && statistics ? [
    { label: "Historical Sharpe", a: statistics[0].sharpe, b: statistics[1].sharpe, percent: false },
    { label: "Total return", a: current.totalReturn, b: alternative.totalReturn, percent: true },
    { label: "Annualized return (CAGR)", a: statistics[0].annualReturn, b: statistics[1].annualReturn, percent: true },
    { label: "Annualized volatility", a: current.annualVolatility, b: alternative.annualVolatility, percent: true },
    { label: "Max drawdown", a: current.maxDrawdown, b: alternative.maxDrawdown, percent: true },
  ] : [];
  function selectPreset(value: ComparisonPreset) { setPreset(value); setCustomWeights(null); }
  const stocks = universe.filter(item => item.ticker !== "CASH");
  const currentCash = holdings.filter(item => item.ticker === "CASH").reduce((sum, item) => sum + item.value, 0);
  const changedCount = stocks.filter(item => Math.abs((weights[item.ticker] ?? 0) - item.value / total) > .00005).length;
  return <section className="compare-workspace">
    <section className="panel compare-controls" aria-label="Comparison controls">
      <div className="compare-period-row">
        <div className="compare-context"><h2>Historical sizing replay</h2><span>{baselineHistory ? "One sizing proposal replayed through history" : "Fixed-share allocation replay"}</span></div>
        <div className="compare-replay-controls"><label>From<input type="date" aria-label="Comparison start date" value={replayStart} min={replayDates[0]} max={replayEnd} onChange={e=>setReplayStart(e.target.value)}/></label><label>To<input type="date" aria-label="Comparison end date" value={replayEnd} min={replayStart} max={replayDates.at(-1)} onChange={e=>setReplayEnd(e.target.value)}/></label><button onClick={()=>{setReplayStart(reference.startDate);setReplayEnd(reference.endDate);}}>Home-page period</button>{proposalAsOf&&<button disabled={!replayDates.some(date=>date>proposalAsOf)} onClick={()=>{setReplayStart(proposalAsOf);setReplayEnd(replayDates.at(-1)??proposalAsOf);}}>Since decision date</button>}</div>
        {onMethodology && <button className="compare-method-link" onClick={onMethodology}>Methodology ↗</button>}
      </div>
      <div className="compare-allocation-row"><div className="compare-toolbar"><label>Alternative portfolio<select aria-label="Alternative portfolio preset" value={customWeights ? "Custom weights" : preset} onChange={e => selectPreset(e.target.value as ComparisonPreset)}><option disabled={hasShorts}>Lower beta</option><option disabled={hasShorts}>Equal weight</option><option>Current weights</option><option>Saved baseline</option>{customWeights && <option>Custom weights</option>}</select></label><button onClick={() => selectPreset("Current weights")}>Reset alternative</button>{initialWeights&&customWeights!==initialWeights&&<button onClick={()=>setCustomWeights(initialWeights)}>Restore optimizer proposal</button>}{onAdopt&&<button disabled={!valid||!construction} onClick={()=>onAdopt(weights)}>Use alternative as portfolio</button>}</div></div>
      <div className="compare-options-row"><div className="compare-position-permissions"><label><input type="checkbox" aria-label="Allow manual short weights" title="Allows negative weights in this comparison. Configure optimizer position sides and exposure limits in Optimizer." checked={hasShorts} disabled={holdings.some(h=>h.value<0&&h.ticker!=="CASH")||Object.values(initialWeights??{}).some(v=>v< -1e-9)||Object.values(customWeights??{}).some(v=>v< -1e-9)} onChange={e=>setAllowShorts(e.target.checked)}/>Allow manual short weights</label><label><input type="checkbox" aria-label="Allow cash borrowing in comparison" checked={allowFinancing} onChange={e=>setAllowFinancing(e.target.checked)}/>Allow cash borrowing</label>{allowFinancing&&<span>Replay excludes financing charges; negative cash is borrowing.</span>}</div><details className="compare-saved"><summary>Saved comparisons</summary><div className="compare-save-controls"><input aria-label="Comparison name" placeholder="Name this comparison" maxLength={60} value={saveName} onChange={e=>setSaveName(e.target.value)}/><button disabled={!saveName.trim()||!valid} onClick={()=>{persistComparisons([{name:saveName.trim(),weights:{...weights},start:replayStart,end:replayEnd,borrowing:allowFinancing},...savedComparisons.filter(item=>item.name!==saveName.trim())].slice(0,10));setSaveName("");}}>Save comparison</button><span role="status">{saveMessage}</span></div>{savedComparisons.map(item=><div className="compare-saved-row" key={item.name}><span>{item.name}</span><button onClick={()=>{setCustomWeights(item.weights);setAllowFinancing(item.borrowing);setAllowShorts(Object.values(item.weights).some(v=>v<0));setReplayStart(item.start<reference.startDate?reference.startDate:item.start>reference.endDate?reference.startDate:item.start);setReplayEnd(item.end>reference.endDate?reference.endDate:item.end<reference.startDate?reference.endDate:item.end);}}>Load</button><button aria-label={`Delete comparison ${item.name}`} onClick={()=>persistComparisons(savedComparisons.filter(row=>row.name!==item.name))}>Delete</button></div>)}</details></div>
    </section>
    <div className="compare-connected">
      <article className="panel compare-editor"><header className="panel-title"><h3>Allocation changes</h3><span>Current → Alternative</span></header><div className="compare-allocation-status"><span>{initialWeights&&customWeights===initialWeights&&proposalAsOf?`Optimizer proposal · ${proposalAsOf} · `:""}{changedCount} changed stocks · same {money(total)} starting capital</span></div><div className="compare-holdings-scroll"><table><thead><tr><th>Stock</th><th>Current</th><th>Alternative</th><th>Change</th></tr></thead><tbody>{stocks.map(item => { const a = item.value / total, b = weights[item.ticker] ?? 0; return <tr key={item.ticker}><th><button className="lab-stock" aria-label={`Analyze ${item.ticker} security`} onClick={() => onSelectTicker(item.ticker)}>{item.ticker} ↗</button><small>{item.name}</small></th><td>{percent(a)}</td><td><label className="compare-weight-input"><input aria-label={`${item.ticker} alternative weight`} type="number" min={hasShorts ? undefined : 0} step="0.1" value={Number((b * 100).toFixed(3))} onChange={e => setCustomWeights({ ...weights, [item.ticker]: Math.max(hasShorts ? -Infinity : 0, (Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : 0) / 100) })} /><span>%</span></label></td><td className={Math.abs(b-a)<.00005?"":b-a<0?"negative":"positive"}>{change(b - a, true)}</td></tr>; })}<tr className="lab-cash"><th>CASH</th><td>{percent(currentCash / total)}</td><td>{percent(cash / total)}</td><td>{change((cash - currentCash) / total, true)}</td></tr></tbody></table></div></article>
    <div className="compare-analysis-main">
    <div className="compare-results-grid">
      <article className="panel compare-summary compare-history-summary"><header className="panel-title"><h3>Historical performance</h3><span>{results.current?.startDate ?? replayStart} — {results.current?.endDate ?? replayEnd}</span></header>
        {!valid ? <p className="compare-error" role="alert">Alternative weights exceed available capital. Reduce positions or allow cash borrowing.</p> : !current || !alternative ? <p className="lab-note" role="status">{results.error || "Not enough shared history for this period."}</p> : <div className="compare-table-scroll"><table><thead><tr><th>Metric</th><th>Current</th><th>Alternative</th><th>Change</th></tr></thead><tbody>{metrics.map(row=><tr key={row.label} className={row.label==="Historical Sharpe"?"compare-sharpe-row":undefined}><th>{row.label}</th><td>{row.a===null?"—":row.percent?historicalPercent(row.a):row.a.toFixed(2)}</td><td>{row.b===null?"—":row.percent?historicalPercent(row.b):row.b.toFixed(2)}</td><td>{row.a===null||row.b===null?"—":change(row.b-row.a,row.percent)}</td></tr>)}</tbody></table></div>}
        {statistics?.some(s=>s.sharpe===null)&&<p className="lab-note">Sharpe is unavailable without complete cash-benchmark history and nonzero excess-return variability.</p>}
      </article>
          <div className="compare-risk-stack"><CompactRiskSummary forecast={snapshot?.forecast??null} weights={currentWeights} alternative={weights} alternativeLabel="Alternative" capital={total} error={!valid?"Alternative weights exceed available capital. Reduce positions or allow cash borrowing.":undefined} onSelectTicker={onSelectTicker} onMethodology={onMethodology}/>          <details className="panel compare-summary risk-summary-extra"><summary>Objective result, cash &amp; trades</summary>{snapshot?.relativeSignals&&<p className="compare-preference-basis">Maximum preference / risk · {snapshot.returnAssumption}. Index, not expected Sharpe.</p>}{!valid?<p className="compare-error" role="alert">Alternative weights exceed available capital. Reduce positions or allow cash borrowing.</p>:!construction?<p className="lab-note">Risk data does not cover every asset in this comparison.</p>:<div className="compare-table-scroll"><table><thead><tr><th>Measure</th><th>Current</th><th>Alternative</th><th>Change</th></tr></thead><tbody>{riskMetrics.map(row=><tr key={row.label}><th>{row.label}{row.label==="Preference / forecast risk"&&<small>Index · current = 100</small>}</th><td>{row.a===null?"—":row.percent?percent(row.a):row.a.toFixed(3)}</td><td>{row.b===null?"—":row.percent?percent(row.b):row.b.toFixed(3)}</td><td>{row.a===null||row.b===null?"—":change(row.b-row.a,row.percent,row.percent?2:3)}</td></tr>)}<tr><th>Traded stock weight</th><td>—</td><td>{percent(stocks.reduce((sum,h)=>sum+Math.abs((weights[h.ticker]??0)-h.value/total),0))}</td><td>{money(stocks.reduce((sum,h)=>sum+Math.abs((weights[h.ticker]??0)-h.value/total),0)*total)}</td></tr></tbody></table></div>}</details></div>
    </div>
    <div className="compare-detail-tabs" role="tablist" aria-label="Comparison detail">{(["Performance","Factor changes","Concentration"] as const).map(tab=><button role="tab" aria-selected={detailView===tab} className={detailView===tab?"active":""} key={tab} onClick={()=>setDetailView(tab)}>{tab}</button>)}</div>
    {detailView==="Performance" && current && alternative && <article className="panel compare-chart"><header className="panel-title"><h3>Historical performance</h3><span>{current.startDate} — {current.endDate}</span></header>{renderPerformance(current, alternative)}</article>}
    <div className="compare-detail-panel">

      <div className="compare-analysis">
          {detailView==="Factor changes"&&construction&&<article className="panel compare-summary"><header className="panel-title"><h3>Factor comparison</h3><span>Portfolio weights × asset loadings</span></header>{construction.current.factors.length?<div className="compare-table-scroll"><table><thead><tr><th>Factor</th><th>Current</th><th>Alternative</th><th>Change</th></tr></thead><tbody>{construction.current.factors.map((factor,i)=>{const after=construction.alternative.factors[i].exposure;return <tr key={factor.name}><th>{factor.name}{factor.unit&&<small>{factor.unit} · {factor.asOf}</small>}</th><td>{factor.exposure.toFixed(3)}</td><td>{after.toFixed(3)}</td><td>{change(after-factor.exposure,false,3)}</td></tr>;})}</tbody></table></div>:<p className="lab-note">Aligned factor history is unavailable for this model date.</p>}</article>}
      </div>
    </div>
    {detailView==="Concentration"&&construction&&<article className="panel compare-summary"><header className="panel-title"><h3>Position risk contributions</h3><span>Signed share of forecast variance</span></header><div className="compare-table-scroll"><table><thead><tr><th>Stock</th><th>Current</th><th>Alternative</th><th>Change</th></tr></thead><tbody>{[...new Set([...construction.current.concentration.positions,...construction.alternative.concentration.positions].map(p=>p.ticker))].sort((a,b)=>(construction.alternative.concentration.positions.find(p=>p.ticker===b)?.riskShare??0)-(construction.alternative.concentration.positions.find(p=>p.ticker===a)?.riskShare??0)).map(ticker=>{const a=construction.current.concentration.positions.find(p=>p.ticker===ticker)?.riskShare??(construction.current.volatility>1e-8?0:null),b=construction.alternative.concentration.positions.find(p=>p.ticker===ticker)?.riskShare??(construction.alternative.volatility>1e-8?0:null);return <tr key={ticker}><th><button className="lab-stock" onClick={()=>onSelectTicker(ticker)}>{ticker} ↗</button></th><td>{a===null?"—":percent(a)}</td><td>{b===null?"—":percent(b)}</td><td>{a===null||b===null?"—":change(b-a,true)}</td></tr>;})}</tbody></table></div></article>}
    </div></div>
  </section>;
}
