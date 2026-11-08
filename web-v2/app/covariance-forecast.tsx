"use client";

import {forecastHorizons,horizonLabel,horizonVolatility,type ForecastSessions} from "../lib/forecast-horizon";
import { useState } from "react";
import CovarianceQuality from "./covariance-quality";
import type { CovarianceForecastAnalytics, MarketPayload } from "../lib/analytics";
import { compareCovariance } from "../lib/covariance-comparison";

const signed = (value: number, decimals = 2) => `${Math.abs(value) < .5 * 10 ** -decimals || value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(decimals)}`;
const vol = (value: number) => `${(value * 100).toFixed(1)}%`;
const corr = (value: number | null) => value === null ? "—" : value.toFixed(2);

export default function CovarianceForecastPanel({ forecast, payload }: { forecast: CovarianceForecastAnalytics | null; payload: MarketPayload }) {
  const [sessions,setSessions]=useState<ForecastSessions>(5);
  const [referenceId, setReferenceId] = useState("previous");
  const [mode, setMode] = useState<"Correlation" | "Covariance">("Correlation");
  const [view, setView] = useState<"Change" | "Reference" | "Forecast">("Forecast");
  const [section, setSection] = useState<"forecast" | "quality">("forecast");
  const [selected, setSelected] = useState<[number, number]>([0, 1]);
  if (!forecast) return <section className="data-state"><div><strong>Risk and correlation forecast unavailable</strong><p>CM-IEWMA needs more than 500 aligned daily return observations for the priced positions.</p></div></section>;
  const reference = forecast.references.find(item => item.id === referenceId) ?? forecast.references[0];
  const comparison = compareCovariance(reference, forecast);
  const previous = reference.id === "previous";
  const before = mode === "Correlation" ? reference.correlationMatrix : reference.covarianceMatrix;
  const after = mode === "Correlation" ? forecast.correlationMatrix : forecast.covarianceMatrix;
  const delta = mode === "Correlation" ? comparison.correlationDelta : comparison.covarianceDelta;
  const matrix = view === "Change" ? delta : view === "Reference" ? before : after;
  const allValues = (view === "Change" ? delta.flat() : [...before.flat(), ...after.flat()]).filter((value): value is number => value !== null);
  const scale = view !== "Change" && mode === "Correlation" ? 1 : Math.max(...allValues.map(Math.abs), 1e-12);
  const unit = mode === "Correlation" ? "correlation points" : `${sessions}-session %²`;
  const format = (value: number | null, change = false) => value === null ? "—" : change ? signed(value * (mode === "Covariance" ? 10000 * sessions / 252 : 1), mode === "Covariance" ? 1 : 2) : (value * (mode === "Covariance" ? 10000 * sessions / 252 : 1)).toFixed(mode === "Covariance" ? 1 : 2);
  const row = Math.min(selected[0], forecast.tickers.length - 1);
  const column = Math.min(selected[1], forecast.tickers.length - 1);
  const pairs = forecast.tickers.flatMap((ticker, i) => forecast.tickers.slice(i + 1).flatMap((other, j) => {
    const index = i + j + 1;
    const change = comparison.correlationDelta[i][index];
    return change === null ? [] : [{ ticker, other, i, j: index, change }];
  })).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 6);
  const maxVolatility = Math.max(...reference.volatilities, ...forecast.volatilities, .001);
  const averageChange = forecast.averageCorrelation !== null && reference.averageCorrelation !== null ? forecast.averageCorrelation - reference.averageCorrelation : null;
  const drivers = [{ label: "Individual volatility effect", value: comparison.volatilityEffect }, { label: "Correlation effect", value: comparison.correlationEffect }];
  const driverScale = Math.max(...drivers.map(item => Math.abs(item.value ?? 0)), 1e-12);
  const orderedSecurities = forecast.securities.map((item, i) => ({ ...item, index: i, change: item.volatility - reference.volatilities[i] })).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  return <section className="covariance-workspace">
    <div className="forecast-page-toolbar"><div className="segmented" aria-label="Forecast workspace"><button className={section==="forecast"?"on":""} aria-pressed={section==="forecast"} onClick={()=>setSection("forecast")}>Risk forecast</button><button className={section==="quality"?"on":""} aria-pressed={section==="quality"} onClick={()=>setSection("quality")}>Forecast quality</button></div><label>Horizon <select aria-label="Risk forecast horizon" value={sessions} onChange={e=>setSessions(Number(e.target.value) as ForecastSessions)}>{forecastHorizons.map(n=><option key={n} value={n}>{horizonLabel(n)}</option>)}</select></label><a href="#about-models" onClick={e=>{e.preventDefault();window.dispatchEvent(new CustomEvent("factorscope-open-about"));}}>Methodology in About ↗</a></div>
    {section==="quality"?<CovarianceQuality payload={payload} forecast={forecast} sessions={sessions}/>:<div className="covariance-layout covariance-comparison">
    <article className="panel covariance-comparison-summary">
      <div className="covariance-comparison-heading"><div><h2>CM-IEWMA risk forecast</h2><p>Data through {forecast.asOf} · {forecast.tickers.length} securities · selected holdings</p></div><label>COMPARE WITH<select aria-label="Covariance comparison reference" value={reference.id} onChange={event => setReferenceId(event.target.value)}>{[...forecast.references].sort((a,b)=>Number(b.id==="previous")-Number(a.id==="previous")).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></div>
      <div className="covariance-risk-comparison" aria-live="polite">
        <div><span>FORECAST RISK · {sessions} {sessions===1?"SESSION":"SESSIONS"}</span><strong>{vol(horizonVolatility(forecast.portfolioVolatility,sessions))}</strong><small>{vol(forecast.portfolioVolatility)} annualized · one standard deviation</small></div>
        <div><span>{previous ? "PREVIOUS FORECAST" : "HISTORICAL ESTIMATE"}</span><strong>{vol(horizonVolatility(reference.portfolioVolatility,sessions))}</strong><small>{previous ? `Data through ${reference.asOf}` : `${reference.observations} sessions · ${reference.startDate} — ${reference.asOf}`} · same weights</small></div>
        <div><span>{previous ? "FORECAST REVISION" : "DIFFERENCE FROM HISTORICAL ESTIMATE"}</span><strong>{signed(horizonVolatility(comparison.totalChange,sessions) * 100)} pp</strong><small>{reference.portfolioVolatility > 1e-12 ? `${signed(comparison.totalChange / reference.portfolioVolatility * 100, 1)}% relative difference` : "Relative difference unavailable"}</small></div>
      </div>
      <p className="covariance-comparison-note">{sessions===1?"Next-session estimate.":`${sessions}-session projection from daily covariance.`} All risk comparisons below use this horizon.</p>
    </article>

    <article className="panel covariance-drivers"><header><h2>{previous ? "What changed in portfolio risk?" : "Why the estimates differ"}</h2><span>Contributions to {signed(horizonVolatility(comparison.totalChange,sessions) * 100)} pp</span></header><div className="covariance-driver-list">{drivers.map(item => <div key={item.label}><span>{item.label}</span><div className="covariance-driver-track"><i style={{ left: item.value !== null && item.value < 0 ? `${50 - Math.abs(item.value) / driverScale * 50}%` : "50%", width: `${Math.abs(item.value ?? 0) / driverScale * 50}%`, background: (item.value ?? 0) < 0 ? "#829dff" : "#f3b456" }} /></div><strong>{item.value === null ? "—" : `${signed(horizonVolatility(item.value,sessions) * 100)} pp`}</strong></div>)}</div><p className="covariance-comparison-note">Same holdings · effects sum to the risk difference before rounding.</p></article>

    <article className="panel covariance-pair-changes"><header><h2>{previous ? "Largest correlation revisions" : "Largest correlation differences"}</h2><span>Pair average: {corr(reference.averageCorrelation)} → {corr(forecast.averageCorrelation)}{averageChange !== null ? ` (${signed(averageChange,3)})` : ""}</span></header><div>{pairs.length ? pairs.map(pair => <button key={`${pair.ticker}-${pair.other}`} onClick={() => { setSelected([pair.i, pair.j]); setMode("Correlation"); setView("Change"); }}><b>{pair.ticker} / {pair.other}</b><span>{corr(reference.correlationMatrix[pair.i][pair.j])} → {corr(forecast.correlationMatrix[pair.i][pair.j])}</span><strong>{signed(pair.change)}</strong></button>) : <p>No comparable security pairs.</p>}</div><p className="covariance-comparison-note">Select a pair to inspect it in the matrix.</p></article>

    <article className="panel covariance-matrix-panel"><header><h2>CM-IEWMA {mode.toLowerCase()} forecast</h2><span>{forecast.tickers.length} securities · {forecast.observations} aligned returns</span></header><div className="covariance-toolbar"><div className="segmented" aria-label="Matrix measure">{(["Correlation", "Covariance"] as const).map(item => <button key={item} aria-pressed={mode === item} className={mode === item ? "on" : ""} onClick={() => setMode(item)}>{item}</button>)}</div><div className="segmented" aria-label="Matrix view">{(["Forecast", "Reference", "Change"] as const).map(item => <button key={item} aria-pressed={view === item} className={view === item ? "on" : ""} onClick={() => setView(item)}>{item}</button>)}</div></div>
      <div className="covariance-matrix-detail" aria-live="polite"><b>{forecast.tickers[row]} / {forecast.tickers[column]}</b><span>Reference <strong>{format(before[row][column])}</strong></span><span>Forecast <strong>{format(after[row][column])}</strong></span><span>Change <strong>{format(delta[row][column], true)}</strong></span><small>{unit} · select a cell to inspect</small></div>
      <div className="covariance-scale"><span>{format(-scale)} {view === "Change" ? "decrease" : "negative"}</span><i/><span>0</span><i/><span>{format(scale)} {view === "Change" ? "increase" : "positive"}</span></div>
      <div className="covariance-matrix-scroll"><table aria-label={`${mode} ${view.toLowerCase()} matrix`}><thead><tr><th scope="col">SECURITY</th>{forecast.tickers.map(ticker => <th scope="col" key={ticker}>{ticker}</th>)}</tr></thead><tbody>{forecast.tickers.map((ticker, i) => <tr key={ticker}><th scope="row">{ticker}</th>{matrix[i].map((value, j) => { const intensity = Math.min(1, Math.abs(value ?? 0) / scale); return <td key={forecast.tickers[j]}><button aria-pressed={row === i && column === j} aria-label={`${ticker} / ${forecast.tickers[j]}, reference ${format(before[i][j])}, forecast ${format(after[i][j])}, change ${format(delta[i][j], true)} ${unit}`} title={`Reference ${format(before[i][j])} → forecast ${format(after[i][j])}; change ${format(delta[i][j], true)} ${unit}`} style={{ background: value === null || Math.abs(value) < 1e-14 ? "#152027" : `rgba(${value < 0 ? "130,157,255" : "243,180,86"},${.08 + intensity * .48})` }} onClick={() => setSelected([i, j])}>{format(value, view === "Change")}</button></td>; })}</tr>)}</tbody></table></div>
      <p className="covariance-comparison-note">{mode === "Correlation" ? "Correlations are unitless and unchanged by horizon scaling." : `Covariance in ${sessions}-session %².`} {view === "Change" ? "Forecast minus reference." : "Shared colour scale for reference and forecast."}</p>
    </article>

    <article className="panel covariance-volatility-comparison"><header><h2>Security volatility: reference → forecast</h2><span>{sessions}-session risk · sorted by absolute difference</span></header><div className="covariance-bar-legend"><span><i/> Reference</span><span><b/> Forecast</span></div><div className="covariance-table-scroll"><table><thead><tr><th scope="col">SECURITY</th><th scope="col">WEIGHT</th><th scope="col">VOLATILITY COMPARISON</th><th scope="col">REFERENCE</th><th scope="col">FORECAST</th><th scope="col">CHANGE</th><th scope="col">RISK SHARE: REF → FORECAST</th></tr></thead><tbody>{orderedSecurities.map(item => <tr key={item.ticker}><th scope="row">{item.ticker}</th><td>{(item.portfolioWeight * 100).toFixed(1)}%</td><td><div className="covariance-paired-bars" aria-hidden="true"><i style={{ width: `${reference.volatilities[item.index] / maxVolatility * 100}%` }}/><b style={{ width: `${item.volatility / maxVolatility * 100}%` }}/></div></td><td>{vol(horizonVolatility(reference.volatilities[item.index],sessions))}</td><td>{vol(horizonVolatility(item.volatility,sessions))}</td><td>{signed(horizonVolatility(item.change,sessions) * 100)} pp</td><td>{reference.portfolioVolatility > 1e-12 ? `${(reference.securities[item.index].riskShare * 100).toFixed(1)}%` : "—"} → {forecast.portfolioVolatility > 1e-12 ? `${(item.riskShare * 100).toFixed(1)}%` : "—"}</td></tr>)}</tbody></table></div><p className="covariance-comparison-note">A negative risk share indicates a hedging contribution. pp = percentage points.</p></article>

    <article className="panel covariance-experts"><header><h2>Current model mixture</h2><span>Volatility / correlation half-lives</span></header><div className="covariance-expert-list">{forecast.expertWeights.map(expert => <div key={expert.label}><span>{expert.label.replace("d", "")}</span><i><b style={{ width: `${expert.weight * 100}%` }}/></i><strong>{(expert.weight * 100).toFixed(1)}%</strong></div>)}</div><button className="forecast-history-link" onClick={()=>setSection("quality")}>Explore adaptation and forecast quality →</button></article>
    </div>}
  </section>;
}
