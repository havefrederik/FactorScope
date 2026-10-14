"use client";
import { useMemo, useState, type ReactNode } from "react";
import { buildAnalytics, buildFactorModel, type MarketPayload, type PortfolioAnalytics } from "@/lib/analytics";
import { comparisonHoldings, comparisonPresetWeights, replayStatistics, type ComparisonPreset } from "@/lib/comparison-portfolio";
import FactorExposureChart from "./factor-exposure-chart";

type ComparisonHolding = { ticker: string; value: number; name: string };
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const change = (value: number, percentValue = false) => `${value >= 0 ? "+" : ""}${(value * (percentValue ? 100 : 1)).toFixed(2)}${percentValue ? " pp" : ""}`;

export default function PortfolioComparisonWorkspace({ holdings, savedHoldings, payload, reference, onSelectTicker, renderPerformance }: { holdings: ComparisonHolding[]; savedHoldings: ComparisonHolding[]; payload: MarketPayload; reference: PortfolioAnalytics; onSelectTicker: (ticker: string) => void; renderPerformance: (current: PortfolioAnalytics, alternative: PortfolioAnalytics) => ReactNode }) {
  const [preset, setPreset] = useState<ComparisonPreset>(() => holdings.some(item => item.ticker !== "CASH" && item.value < 0) ? "Current weights" : "Lower beta");
  const [customWeights, setCustomWeights] = useState<Record<string, number> | null>(null);
  const [tab, setTab] = useState<"Performance" | "Factors">("Performance");
  const total = holdings.reduce((sum, item) => sum + item.value, 0);
  const hasShorts = holdings.some(item => item.ticker !== "CASH" && item.value < 0);
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
  const models = useMemo(() => tab === "Factors" && results.current && results.alternative ? { current: buildFactorModel(payload, results.current, total), alternative: buildFactorModel(payload, results.alternative, total) } : null, [tab, payload, results, total]);
  const current = results.current, alternative = results.alternative;
  const statistics = current && alternative ? [replayStatistics(current.dates, current.dailyReturns, current.totalReturn), replayStatistics(alternative.dates, alternative.dailyReturns, alternative.totalReturn)] : null;
  const metrics = current && alternative && statistics ? [
    { label: "Market beta", a: current.beta, b: alternative.beta, percent: false },
    { label: "Annualized volatility", a: current.annualVolatility, b: alternative.annualVolatility, percent: true },
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
    <div className="compare-toolbar"><label>Alternative portfolio<select aria-label="Alternative portfolio preset" value={customWeights ? "Custom weights" : preset} onChange={e => selectPreset(e.target.value as ComparisonPreset)}><option disabled={hasShorts}>Lower beta</option><option disabled={hasShorts}>Equal weight</option><option>Current weights</option><option>Saved baseline</option>{customWeights && <option>Custom weights</option>}</select></label><button onClick={() => selectPreset(hasShorts ? "Current weights" : "Lower beta")}>Reset alternative</button><span>{changedCount} changed stocks · same {money(total)} starting capital</span></div>
    <p className="compare-intro">Edit the alternative weights below; cash absorbs the difference. The current portfolio stays unchanged. Both allocations are replayed over the same dates, with shares held fixed and cash earning 0%.</p>
    {!customWeights && preset === "Lower beta" && <p className="compare-preset-note">The preset tilts toward lower selected-period stock betas, invests at most 75% of the current stock exposure and caps each starting position at 5%. Cash is explicit. This is an allocation comparison, not a point-in-time strategy backtest.</p>}
    {!customWeights && preset === "Equal weight" && <p className="compare-preset-note">Stocks start at equal weights, capped at 5% each. Any unused capital stays in cash.</p>}
    <div className="compare-grid">
      <article className="panel compare-editor"><header className="panel-title"><h3>Allocation changes</h3><span>Current → Alternative</span></header><div className="compare-holdings-scroll"><table><thead><tr><th>Stock</th><th>Current</th><th>Alternative</th><th>Change</th></tr></thead><tbody>{stocks.map(item => { const a = item.value / total, b = weights[item.ticker] ?? 0; return <tr key={item.ticker}><th><button className="lab-stock" aria-label={`Analyze ${item.ticker} security`} onClick={() => onSelectTicker(item.ticker)}>{item.ticker} ↗</button><small>{item.name}</small></th><td>{percent(a)}</td><td><label className="compare-weight-input"><input aria-label={`${item.ticker} alternative weight`} type="number" min={hasShorts ? -100 : 0} max="100" step="0.1" value={Number((b * 100).toFixed(3))} onChange={e => setCustomWeights({ ...weights, [item.ticker]: Math.max(hasShorts ? -1 : 0, Math.min(1, (Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : 0) / 100)) })} /><span>%</span></label></td><td className={b - a < 0 ? "negative" : "positive"}>{change(b - a, true)}</td></tr>; })}<tr className="lab-cash"><th>CASH</th><td>{percent(currentCash / total)}</td><td>{percent(cash / total)}</td><td>{change((cash - currentCash) / total, true)}</td></tr></tbody></table></div><p className="lab-note">Weights are starting allocations. Reducing a stock increases cash; increasing one spends cash. The current portfolio and its saved baseline are preserved.</p></article>
      <div className="compare-analysis">
        <article className="panel compare-summary"><header className="panel-title"><h3>Summary comparison</h3><span>Alternative minus current</span></header>{!valid ? <p className="compare-error" role="alert">Alternative weights exceed the available capital. Reduce one or more positions until cash is nonnegative.</p> : !alternative || !current ? <p className="lab-note">Not enough common price history for this comparison.</p> : <div className="compare-table-scroll"><table><thead><tr><th>Metric</th><th>Current</th><th>Alternative</th><th>Change</th></tr></thead><tbody>{metrics.map(row => <tr key={row.label}><th>{row.label}</th><td>{row.a === null ? "—" : row.percent ? percent(row.a) : row.a.toFixed(2)}</td><td>{row.b === null ? "—" : row.percent ? percent(row.b) : row.b.toFixed(2)}</td><td>{row.a === null || row.b === null ? "—" : change(row.b - row.a, row.percent)}</td></tr>)}</tbody></table></div>}</article>
        {current && alternative && <article className="panel compare-chart"><div className="compare-chart-toolbar"><div className="lab-tabs" role="tablist" aria-label="Portfolio comparison charts">{(["Performance", "Factors"] as const).map(item => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item === "Factors" ? "Factor exposure changes" : item}</button>)}</div><span>{current.startDate} — {current.endDate}</span></div>{tab === "Performance" ? renderPerformance(current, alternative) : models?.current && models?.alternative ? <FactorExposureChart factors={models.current.factors} comparison={models.alternative.factors} /> : <p className="lab-note">Factor history is incomplete for this period.</p>}</article>}
        <p className="lab-note">Returns and risk are historical replay estimates. Sharpe uses a 0% risk-free rate. Transaction and financing costs are excluded here; use Dynamic Strategy for a rebalance simulation with costs.</p>
      </div>
    </div>
  </section>;
}
