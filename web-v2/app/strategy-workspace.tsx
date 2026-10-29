"use client";

import { useMemo, useState, type ReactNode } from "react";
import { buildAnalytics, buildFactorModel, type MarketPayload, type RiskTargetSnapshot, type StrategyBacktestAnalytics, type StrategyRebalanceFrequency } from "@/lib/analytics";

export type StrategySettings = { frequency: StrategyRebalanceFrequency; targetVolatility: number; targetBeta: number; maxPosition: number };
export type StrategyWorkspaceProps = {
  strategy: StrategyBacktestAnalytics | null;
  snapshot: RiskTargetSnapshot | null;
  isUpdating: boolean;
  total: number;
  frequency: StrategyRebalanceFrequency;
  setFrequency: (value: StrategyRebalanceFrequency) => void;
  targetVolatility: number;
  setTargetVolatility: (value: number) => void;
  targetBeta: number;
  setTargetBeta: (value: number) => void;
  maxPosition: number;
  setMaxPosition: (value: number) => void;
  applied: StrategySettings;
  hasPendingChanges: boolean;
  onRunBacktest: () => void;
  onResetDraft: () => void;
  onSelectTicker: (ticker: string) => void;
  payload: MarketPayload;
  startDate: string;
  endDate: string;
};

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const delta = (value: number, suffix = "") => `${value >= 0 ? "+" : ""}${value.toFixed(2)}${suffix}`;
const signedPercent = (value: number) => delta(value * 100, " pp");
type ChartTab = "Performance" | "Risk exposures" | "Rebalances" | "Ending holdings";

function ProposalFactors({ payload, snapshot, total, startDate, endDate }: Pick<StrategyWorkspaceProps, "payload" | "total" | "startDate" | "endDate"> & { snapshot: RiskTargetSnapshot }) {
  const models = useMemo(() => {
    const model = (proposed: boolean) => {
      const holdings = snapshot.weights.map(item => ({ ticker: item.ticker, value: total * (proposed ? item.targetWeight : item.currentWeight) }));
      holdings.push({ ticker: "CASH", value: total * (proposed ? snapshot.cashWeight : snapshot.currentCashWeight) });
      const analytics = buildAnalytics(payload, holdings, { startDate, endDate });
      return analytics ? buildFactorModel(payload, analytics, total) : null;
    };
    return { current: model(false), proposed: model(true) };
  }, [payload, snapshot, total, startDate, endDate]);
  if (!models.current || !models.proposed) return <p className="lab-note">Factor history is incomplete for the selected period.</p>;
  const proposed = new Map(models.proposed.factors.map(factor => [factor.name, factor.exposure]));
  return <><p className="lab-note">Regression exposures over {startDate} — {endDate}, using each allocation as a fixed snapshot. These are separate from the next-session covariance forecast.</p><table><thead><tr><th>Factor</th><th>Current</th><th>Proposed</th><th>Change</th></tr></thead><tbody>{models.current.factors.map(factor => {
    const next = proposed.get(factor.name) ?? 0;
    return <tr key={factor.name}><th>{factor.name}<small>{factor.group}</small></th><td>{factor.exposure.toFixed(2)}</td><td>{next.toFixed(2)}</td><td>{delta(next - factor.exposure)}</td></tr>;
  })}</tbody></table></>;
}

export default function StrategyWorkspace(props: StrategyWorkspaceProps & {
  renderPerformance: (strategy: StrategyBacktestAnalytics) => ReactNode;
  renderExposures: (strategy: StrategyBacktestAnalytics, settings: StrategySettings) => ReactNode;
}) {
  const [allocationTab, setAllocationTab] = useState<"Holdings" | "Factors">("Holdings");
  const [chartTab, setChartTab] = useState<ChartTab>("Performance");
  const [sort, setSort] = useState<"change" | "ticker">("change");
  const { strategy, snapshot, applied, total } = props;
  if (!snapshot || !strategy) return <div className="data-state"><div><strong>More history is needed</strong><p>Choose a later allocation date or a longer analysis period.</p></div></div>;
  const rows = [...snapshot.weights].sort((a, b) => sort === "ticker" ? a.ticker.localeCompare(b.ticker) : Math.abs(b.change) - Math.abs(a.change));
  const largestCurrent = Math.max(...snapshot.weights.map(item => item.currentWeight), 0);
  const largestProposed = Math.max(...snapshot.weights.map(item => item.targetWeight), 0);
  const summary = [
    { label: "Forecast annual volatility", current: snapshot.currentVolatility, proposed: snapshot.estimatedVolatility, format: percent, change: signedPercent },
    { label: "Market beta", current: snapshot.currentBeta, proposed: snapshot.beta, format: (n: number) => n.toFixed(2), change: delta },
    { label: "Cash weight", current: snapshot.currentCashWeight, proposed: snapshot.cashWeight, format: percent, change: signedPercent },
    { label: "Largest position", current: largestCurrent, proposed: largestProposed, format: percent, change: signedPercent },
  ];
  const years = (Date.parse(strategy.endDate) - Date.parse(strategy.startDate)) / (365.25 * 86400000);
  const cagr = years > 0 && strategy.totalReturn > -1 ? (1 + strategy.totalReturn) ** (1 / years) - 1 : null;
  return <section className="lab-workspace">
    <div className="lab-construction">
      <aside className="panel lab-settings">
        <header className="panel-title"><h3>Allocation constraints</h3><span>Preview updates immediately</span></header>
        <div className="lab-settings-body">
          <p>Keep the current stock universe. Allocate risk using CM-IEWMA covariance, then scale the stock sleeve to satisfy all ceilings. Cash receives the remainder.</p>
          <label className="lab-setting"><span>Rebalance frequency</span><div className="segmented"><button className={props.frequency === "Weekly" ? "on" : ""} onClick={() => props.setFrequency("Weekly")}>Weekly</button><button className={props.frequency === "Monthly" ? "on" : ""} onClick={() => props.setFrequency("Monthly")}>Monthly</button></div><small>Changes the historical schedule; the latest proposal is unchanged.</small></label>
          <label className="lab-setting"><span>Annual risk ceiling <b>{percent(props.targetVolatility)}</b></span><input aria-label="Annual risk ceiling" type="range" min="8" max="25" step="1" value={props.targetVolatility * 100} onChange={e => props.setTargetVolatility(Number(e.target.value) / 100)} /><small>Limits forecast volatility by scaling stocks and cash.</small></label>
          <label className="lab-setting"><span>S&amp;P 500 beta ceiling <b>{props.targetBeta.toFixed(2)}</b></span><input aria-label="S&amp;P 500 beta ceiling" type="range" min="0.10" max="1.30" step="0.05" value={props.targetBeta} onChange={e => props.setTargetBeta(Number(e.target.value))} /><small>A ceiling, rather than a promise to attain this beta.</small></label>
          <label className="lab-setting"><span>Maximum position <b>{percent(props.maxPosition)}</b></span><input aria-label="Maximum position" type="range" min="1" max="35" step="1" value={props.maxPosition * 100} onChange={e => props.setMaxPosition(Number(e.target.value) / 100)} /><small>If binding, scales every stock down to preserve risk budgets.</small></label>
          <div className="lab-binding"><span>Binding constraint</span><b>{snapshot.bindingConstraints.join(" + ")}</b><small>{snapshot.solverStatus} · long-only · no leverage</small></div>
          <div className="lab-actions"><button className="lab-run" onClick={props.onRunBacktest} disabled={!props.hasPendingChanges || props.isUpdating}>{props.isUpdating ? "Running…" : "Run backtest"}</button><button onClick={props.onResetDraft} disabled={!props.hasPendingChanges || props.isUpdating}>Reset changes</button></div>
          <small className="lab-action-note">The preview uses your changes immediately. Run the backtest to update historical results. This does not change your saved portfolio.</small>
        </div>
      </aside>
      <article className="panel lab-proposal">
        <header className="panel-title"><h3>Current → Proposed</h3><span>As of {snapshot.asOf} · effective next trading session</span></header>
        <div className="lab-comparison-scroll"><table className="lab-summary-table"><thead><tr><th>Risk &amp; allocation</th><th>Current</th><th>Proposed</th><th>Change</th></tr></thead><tbody>{summary.map(row => <tr key={row.label}><th>{row.label}</th><td>{row.format(row.current)}</td><td>{row.format(row.proposed)}</td><td>{row.change(row.proposed - row.current)}</td></tr>)}</tbody></table></div>
        <div className="lab-proposal-toolbar"><div className="lab-tabs" role="tablist" aria-label="Proposed allocation details">{(["Holdings", "Factors"] as const).map(tab => <button key={tab} role="tab" aria-selected={allocationTab === tab} className={allocationTab === tab ? "active" : ""} onClick={() => setAllocationTab(tab)}>{tab}</button>)}</div>{allocationTab === "Holdings" && <label>Sort <select aria-label="Sort proposed holdings" value={sort} onChange={e => setSort(e.target.value as "change" | "ticker")}><option value="change">Largest change</option><option value="ticker">Ticker</option></select></label>}<span>{percent(snapshot.turnover)} one-way turnover</span></div>
        <div className="lab-allocation-scroll" tabIndex={0} aria-label="Scrollable allocation comparison">
          {allocationTab === "Factors" ? <ProposalFactors payload={props.payload} snapshot={snapshot} total={total} startDate={props.startDate} endDate={props.endDate} /> : <table><thead><tr><th>Stock</th><th>Current</th><th>Proposed</th><th>Change</th><th>Trade value</th><th>Risk budget → share</th></tr></thead><tbody>{rows.map(item => <tr key={item.ticker}><th><button className="lab-stock" aria-label={`Analyze ${item.ticker} security`} onClick={() => props.onSelectTicker(item.ticker)}>{item.ticker} ↗</button></th><td>{percent(item.currentWeight)}</td><td>{percent(item.targetWeight)}</td><td className={item.change < 0 ? "negative" : "positive"}>{signedPercent(item.change)}</td><td>{money(item.change * total)}</td><td>{percent(item.riskBudget)} → {percent(item.riskContribution)}</td></tr>)}<tr className="lab-cash"><th>CASH</th><td>{percent(snapshot.currentCashWeight)}</td><td>{percent(snapshot.cashWeight)}</td><td>{signedPercent(snapshot.cashWeight - snapshot.currentCashWeight)}</td><td>{money((snapshot.cashWeight - snapshot.currentCashWeight) * total)}</td><td>—</td></tr></tbody></table>}
        </div>
        <p className="lab-note">Forecast risk and beta use the same information date for both allocations. Trade values are changes in exposure before costs. Risk budgets are the current stock capital proportions; forecast shares are variance contributions.</p>
      </article>
    </div>
    <section className={`panel lab-backtest ${props.hasPendingChanges || props.isUpdating ? "lab-pending" : ""}`}>
      <header className="panel-title"><h3>Historical backtest</h3><span role="status">{props.isUpdating ? "Updating results…" : props.hasPendingChanges ? "Unapplied changes · results show previous settings" : "Results match applied settings"}</span></header>
      <div className="lab-applied-settings"><b>Applied settings</b><span>{applied.frequency}</span><span>Risk ≤ {percent(applied.targetVolatility)}</span><span>Beta ≤ {applied.targetBeta.toFixed(2)}</span><span>Position ≤ {percent(applied.maxPosition)}</span><span>{strategy.assumptions.transactionCostBps} bps turnover cost</span><span>{strategy.startDate} — {strategy.endDate}</span></div>
      <div className="lab-performance-metrics"><div><span>Total return</span><b>{percent(strategy.totalReturn)}</b></div><div><span>Annualized return</span><b>{cagr === null ? "—" : percent(cagr)}</b></div><div><span>Sharpe ratio</span><b>{(strategy.sharpeRatio?.toFixed(2)??"—")}</b></div><div><span>Realized volatility</span><b>{percent(strategy.annualVolatility)}</b></div><div><span>Realized beta</span><b>{strategy.beta.toFixed(2)}</b></div><div><span>Max drawdown</span><b>{percent(strategy.maxDrawdown)}</b></div></div>
      <div className="lab-chart-toolbar"><div className="lab-tabs" role="tablist" aria-label="Backtest analysis">{(["Performance", "Risk exposures", "Rebalances", "Ending holdings"] as ChartTab[]).map(tab => <button key={tab} role="tab" aria-selected={chartTab === tab} className={chartTab === tab ? "active" : ""} onClick={() => setChartTab(tab)}>{tab}</button>)}</div><span>{strategy.rebalances.length} rebalances · {money(strategy.transactionCosts)} costs · {percent(strategy.totalTurnover)} turnover</span></div>
      {chartTab === "Performance" && <>{props.renderPerformance(strategy)}<div className="lab-sharpe-comparison"><b>Sharpe comparison</b><span>Strategy <strong>{(strategy.sharpeRatio?.toFixed(2)??"—")}</strong></span><span>Static holdings <strong>{(strategy.staticSharpeRatio?.toFixed(2)??"—")}</strong></span><span>S&amp;P 500 <strong>{(strategy.benchmarkSharpeRatio?.toFixed(2)??"—")}</strong></span><small>Same dates · BIL cash benchmark · historical allocation sequence</small></div></>}
      {chartTab === "Risk exposures" && <>{props.renderExposures(strategy, applied)}<p className="lab-note">Dashed lines show the applied forecast ceilings. Realized risk can differ. Weights become effective next session and drift until the next rebalance.</p></>}
      {chartTab === "Rebalances" && <div className="lab-history-scroll">{strategy.rebalances.slice().reverse().map(item => <details className="lab-rebalance" key={item.date}><summary><b>{item.date}</b><span>Risk {percent(item.estimatedVolatility)}</span><span>Beta {item.beta.toFixed(2)}</span><span>Cash {percent(1 - item.investedWeight)}</span><span>Turnover {percent(item.turnover)}</span></summary><table><thead><tr><th>Stock</th><th>Target weight</th><th>Risk share</th></tr></thead><tbody>{item.weights.map(weight => <tr key={weight.ticker}><th><button className="lab-stock" onClick={() => props.onSelectTicker(weight.ticker)}>{weight.ticker} ↗</button></th><td>{percent(weight.weight)}</td><td>{percent(weight.riskContribution)}</td></tr>)}<tr><th>CASH</th><td>{percent(1 - item.investedWeight)}</td><td>—</td></tr></tbody></table></details>)}</div>}
      {chartTab === "Ending holdings" && <div className="lab-history-scroll"><p className="lab-note">Actual weights after final market drift on {strategy.endDate}. Historical performance comes from the entire allocation sequence.</p><table><thead><tr><th>Stock</th><th>Ending weight</th></tr></thead><tbody>{strategy.finalWeights.map(item => <tr key={item.ticker}><th><button className="lab-stock" onClick={() => props.onSelectTicker(item.ticker)}>{item.ticker} ↗</button></th><td>{percent(item.weight)}</td></tr>)}<tr><th>CASH</th><td>{percent(Math.max(0, 1 - strategy.finalWeights.reduce((sum, item) => sum + item.weight, 0)))}</td></tr></tbody></table></div>}
      <details className="lab-method"><summary>Allocation method &amp; assumptions</summary><p>CM-IEWMA forecasts covariance using five IEWMA experts. The convex direction minimizes ½x′Σx − Σρᵢ log xᵢ, with risk budgets set by current stock capital proportions. The tightest risk, beta, position or capital ceiling scales every risky position by the same amount; cash receives the remainder. This construction does not use expected returns or maximize Sharpe.</p><p>At each historical rebalance, only preceding information is used. Market betas use the preceding 126 sessions. No leverage or shorts; cash earns 0%. The universe and risk budgets come from the selected holdings snapshot, so this is a separate hypothetical strategy with a fixed universe, rather than a reconstruction of the illustrative portfolio’s monthly selections.</p><p>References: <a href="https://github.com/cvxgrp/cov_pred_finance" target="_blank" rel="noreferrer">Johansson et al., covariance prediction</a>; Johansson, <em>Convex Optimization for Quantitative Finance</em> (2025), chapter 6.</p></details>
    </section>
  </section>;
}
