"use client";
import { useMemo, useState, type ReactNode } from "react";
import { buildAnalytics, buildFactorModel, type CovarianceForecastAnalytics, type MarketPayload, type PortfolioAnalytics } from "@/lib/analytics";
import { allocationAttributionEffects, comparisonHoldings, comparisonPresetWeights, replayStatistics, type ComparisonPreset } from "@/lib/comparison-portfolio";
import { summarizeCovariance } from "@/lib/covariance-comparison";
import FactorExposureChart from "./factor-exposure-chart";

type ComparisonHolding = { ticker: string; value: number; name: string };
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const change = (value: number, percentValue = false, precision = 2) => `${value >= 0 ? "+" : ""}${(value * (percentValue ? 100 : 1)).toFixed(precision)}${percentValue ? " pp" : ""}`;

export default function PortfolioComparisonWorkspace({ initialWeights, proposalAsOf, holdings, savedHoldings, payload, reference, forecast, onSelectTicker, renderPerformance }: { initialWeights?:Record<string,number>; proposalAsOf?:string; holdings: ComparisonHolding[]; savedHoldings: ComparisonHolding[]; payload: MarketPayload; reference: PortfolioAnalytics; forecast?: CovarianceForecastAnalytics | null; onSelectTicker: (ticker: string) => void; renderPerformance: (current: PortfolioAnalytics, alternative: PortfolioAnalytics) => ReactNode }) {
  const [preset, setPreset] = useState<ComparisonPreset>(() => holdings.some(item => item.ticker !== "CASH" && item.value < 0) ? "Current weights" : "Lower beta");
  const [customWeights, setCustomWeights] = useState<Record<string, number> | null>(initialWeights??null);
  const [tab, setTab] = useState<"Performance" | "Factors">("Performance");
  const total = holdings.reduce((sum, item) => sum + item.value, 0);
  const hasShorts = holdings.some(item => item.ticker !== "CASH" && item.value < 0)||Object.values(initialWeights??{}).some(value=>value< -1e-9);
  const universe = useMemo(() => preset === "Saved baseline" ? [...holdings, ...savedHoldings.filter(item => !holdings.some(current => current.ticker === item.ticker)).map(item => ({ ...item, value: 0 }))] : holdings, [holdings, savedHoldings, preset]);
  const betas = useMemo(() => new Map(reference.positions.map(item => [item.ticker, item.beta])), [reference]);
  const weights = useMemo(() => customWeights ?? comparisonPresetWeights(universe, betas, preset, savedHoldings), [customWeights, universe, betas, preset, savedHoldings]);
  const alternativeHoldings = useMemo(() => comparisonHoldings(universe, weights), [universe, weights]);
  const cash = alternativeHoldings.find(item => item.ticker === "CASH")?.value ?? 0;
  const valid = total > 0 && cash >= -1e-6;
  const results = useMemo(() => {
    const window = { startDate: reference.startDate, endDate: reference.endDate };
    const current = buildAnalytics(payload, universe, window);
    const alternative = valid ? buildAnalytics(payload, alternativeHoldings, window) : null;
    return { current, alternative };
  }, [payload, universe, alternativeHoldings, reference.startDate, reference.endDate, valid]);
  const models = useMemo(() => results.current && results.alternative ? { current: buildFactorModel(payload, results.current, total), alternative: buildFactorModel(payload, results.alternative, total) } : null, [payload, results, total]);
  const forecastRisk = useMemo(() => {
    if (!forecast || !valid) return null;
    const covered = new Set(forecast.tickers);
    if ([...universe, ...alternativeHoldings].some(item => item.ticker !== "CASH" && Math.abs(item.value) > 1e-8 && !covered.has(item.ticker))) return null;
    const snapshot = (items: { ticker: string; value: number }[]) => summarizeCovariance(forecast.covarianceMatrix, forecast.tickers, forecast.tickers.map(ticker => (items.find(item => item.ticker === ticker)?.value ?? 0) / total));
    return { current: snapshot(universe), alternative: snapshot(alternativeHoldings) };
  }, [forecast, valid, universe, alternativeHoldings, total]);
  const current = results.current, alternative = results.alternative;
  const effects = models?.current && models?.alternative ? allocationAttributionEffects(models.current, models.alternative) : [];
  const factorRows = models?.current && models?.alternative ? models.current.factors.map(factor => ({ current: factor, alternative: models.alternative!.factors.find(item => item.name === factor.name) })) : [];
  const statistics = current && alternative ? [replayStatistics(current.dates, current.dailyReturns, current.totalReturn), replayStatistics(alternative.dates, alternative.dailyReturns, alternative.totalReturn)] : null;
  const metrics = current && alternative && statistics ? [
    { label: "Forecast annual volatility", a: forecastRisk?.current.portfolioVolatility ?? null, b: forecastRisk?.alternative.portfolioVolatility ?? null, percent: true },
    { label: "Historical market beta", a: current.beta, b: alternative.beta, percent: false },
    { label: "Historical annualized volatility", a: current.annualVolatility, b: alternative.annualVolatility, percent: true },
    { label: "Common-factor variance share", a: models?.current && current.annualVolatility > 1e-10 ? models.current.rSquared : null, b: models?.alternative && alternative.annualVolatility > 1e-10 ? models.alternative.rSquared : null, percent: true },
    { label: "Idiosyncratic variance share", a: models?.current && current.annualVolatility > 1e-10 ? 1 - models.current.rSquared : null, b: models?.alternative && alternative.annualVolatility > 1e-10 ? 1 - models.alternative.rSquared : null, percent: true },
    { label: "Cash weight", a: holdings.filter(item => item.ticker === "CASH").reduce((sum, item) => sum + item.value, 0) / total, b: cash / total, percent: true },
    { label: "Total return", a: current.totalReturn, b: alternative.totalReturn, percent: true },
    { label: "Annualized return (CAGR)", a: statistics[0].annualReturn, b: statistics[1].annualReturn, percent: true },
    { label: "Sharpe ratio", a: statistics[0].sharpe, b: statistics[1].sharpe, percent: false },
    { label: "Max drawdown", a: current.maxDrawdown, b: alternative.maxDrawdown, percent: true },
  ] : [];
  function selectPreset(value: ComparisonPreset) { setPreset(value); setCustomWeights(null); }
  const stocks = universe.filter(item => item.ticker !== "CASH");
  const currentCash = holdings.filter(item => item.ticker === "CASH").reduce((sum, item) => sum + item.value, 0);
  const changedCount = stocks.filter(item => Math.abs((weights[item.ticker] ?? 0) - item.value / total) > .00005).length;
  return <section className="compare-workspace">
    <div className="compare-toolbar"><label>Alternative portfolio<select aria-label="Alternative portfolio preset" value={customWeights ? "Custom weights" : preset} onChange={e => selectPreset(e.target.value as ComparisonPreset)}><option disabled={hasShorts}>Lower beta</option><option disabled={hasShorts}>Equal weight</option><option>Current weights</option><option>Saved baseline</option>{customWeights && <option>Custom weights</option>}</select></label><button onClick={() => selectPreset(hasShorts ? "Current weights" : "Lower beta")}>Reset alternative</button><span>{initialWeights&&customWeights===initialWeights&&proposalAsOf?`Optimizer proposal · ${proposalAsOf} · `:""}{changedCount} changed stocks · same {money(total)} starting capital</span></div>
    <div className="compare-grid">
      <article className="panel compare-editor"><header className="panel-title"><h3>Allocation changes</h3><span>Current → Alternative</span></header><div className="compare-holdings-scroll"><table><thead><tr><th>Stock</th><th>Current</th><th>Alternative</th><th>Change</th></tr></thead><tbody>{stocks.map(item => { const a = item.value / total, b = weights[item.ticker] ?? 0; return <tr key={item.ticker}><th><button className="lab-stock" aria-label={`Analyze ${item.ticker} security`} onClick={() => onSelectTicker(item.ticker)}>{item.ticker} ↗</button><small>{item.name}</small></th><td>{percent(a)}</td><td><label className="compare-weight-input"><input aria-label={`${item.ticker} alternative weight`} type="number" min={hasShorts ? -100 : 0} max="100" step="0.1" value={Number((b * 100).toFixed(3))} onChange={e => setCustomWeights({ ...weights, [item.ticker]: Math.max(hasShorts ? -1 : 0, Math.min(1, (Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : 0) / 100)) })} /><span>%</span></label></td><td className={b - a < 0 ? "negative" : "positive"}>{change(b - a, true)}</td></tr>; })}<tr className="lab-cash"><th>CASH</th><td>{percent(currentCash / total)}</td><td>{percent(cash / total)}</td><td>{change((cash - currentCash) / total, true)}</td></tr></tbody></table></div></article>
      <div className="compare-analysis">
        <article className="panel compare-summary"><header className="panel-title"><h3>Summary comparison</h3><span>Δ alternative − current{forecastRisk&&forecast?` · forecast as of ${forecast.asOf}`:""}</span></header>{!valid ? <p className="compare-error" role="alert">Alternative weights exceed the available capital. Reduce one or more positions until cash is nonnegative.</p> : !alternative || !current ? <p className="lab-note">Not enough common price history for this comparison.</p> : <div className="compare-table-scroll"><table><thead><tr><th>Metric</th><th>Current</th><th>Alternative</th><th>Change</th></tr></thead><tbody>{metrics.map(row => <tr key={row.label}><th>{row.label}</th><td>{row.a === null ? "—" : row.percent ? percent(row.a) : row.a.toFixed(2)}</td><td>{row.b === null ? "—" : row.percent ? percent(row.b) : row.b.toFixed(2)}</td><td>{row.a === null || row.b === null ? "—" : change(row.b - row.a, row.percent)}</td></tr>)}</tbody></table></div>}</article>
        {current && alternative && <article className="panel compare-chart"><div className="compare-chart-toolbar"><div className="lab-tabs" role="tablist" aria-label="Portfolio comparison charts">{(["Performance", "Factors"] as const).map(item => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item === "Factors" ? "Factor comparison" : item}</button>)}</div><span>{current.startDate} — {current.endDate}</span></div>{tab === "Performance" ? renderPerformance(current, alternative) : models?.current && models?.alternative ? <><FactorExposureChart factors={models.current.factors} comparison={models.alternative.factors} /><div className="compare-table-scroll"><table className="compare-factor-effects"><thead><tr><th rowSpan={2}>Factor</th><th colSpan={3}>Exposure</th><th colSpan={3}>Share of portfolio variance</th></tr><tr><th>Current</th><th>Alternative</th><th>Change</th><th>Current</th><th>Alternative</th><th>Change</th></tr></thead><tbody>{factorRows.map(row=><tr key={row.current.name}><th>{row.current.name}</th><td>{row.current.exposure.toFixed(4)}</td><td>{(row.alternative?.exposure??0).toFixed(4)}</td><td>{change((row.alternative?.exposure??0)-row.current.exposure,false,4)}</td><td>{current.annualVolatility>1e-10?percent(row.current.riskShare):"—"}</td><td>{alternative.annualVolatility>1e-10?percent(row.alternative?.riskShare??0):"—"}</td><td>{current.annualVolatility>1e-10&&alternative.annualVolatility>1e-10?change((row.alternative?.riskShare??0)-row.current.riskShare,true):"—"}</td></tr>)}</tbody></table></div></> : <p className="lab-note">Factor history is incomplete for this period.</p>}</article>}
        {effects.length>0&&current&&alternative&&<article className="panel compare-attribution-effects"><header className="panel-title"><h3>Historical attribution effects</h3><span>Alternative minus current · same starting capital</span></header><div className="compare-table-scroll"><table><thead><tr><th>Return driver</th><th>Current P&amp;L</th><th>Alternative P&amp;L</th><th>Change</th></tr></thead><tbody>{effects.map(row=><tr key={row.name}><th>{row.name}</th><td>{money(row.currentReturn)}</td><td>{money(row.alternativeReturn)}</td><td>{money(row.returnChange)}</td></tr>)}<tr className="compare-effect-total"><th>Total P&amp;L</th><td>{money(current.pnl)}</td><td>{money(alternative.pnl)}</td><td>{money(alternative.pnl-current.pnl)}</td></tr></tbody></table></div></article>}
      </div>
    </div>
  </section>;
}
