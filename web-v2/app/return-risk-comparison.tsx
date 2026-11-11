"use client";
import { compareReturnRisk } from "@/lib/optimizer-returns";

export const relativeChangeLabel = (change: number | null) => {
  if (change === null) return "Unavailable";
  const magnitude = Math.abs(change * 100);
  if (magnitude < .05) return "Unchanged";
  return `${magnitude.toFixed(1)}% ${change > 0 ? "higher" : "lower"}`;
};
const percent = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(2)}%`;
const ratio = (value: number | null) => value === null ? "—" : value.toFixed(3);

export default function ReturnRiskComparison({ assumption, returns, current, proposed, currentVol, proposedVol, asOf, alternativeLabel = "Proposed", onMethodology }: {
  assumption: string; returns: number[]; current: number[]; proposed: number[];
  currentVol: number; proposedVol: number; asOf: string; alternativeLabel?: string; onMethodology?: () => void;
}) {
  const manual = assumption === "My return forecasts";
  const result = compareReturnRisk(returns, current, proposed, currentVol, proposedVol);
  return <article className="panel return-risk-result" aria-label={manual ? "Expected Sharpe comparison" : "Assumed return per unit of risk comparison"}>
    <header className="panel-title"><h3>{manual ? "Expected Sharpe" : "Return per unit of risk"}</h3><span>{asOf} · before costs</span></header>
    <p className="return-risk-assumption">{manual ? "Based on your return forecasts" : `Return assumption: ${assumption.toLowerCase()}`}</p>
    {!result ? <p className="lab-note">Complete return assumptions and risk estimates are required for both allocations.</p> : manual ? <div className="compare-table-scroll"><table>
      <thead><tr><th>Measure</th><th>Current</th><th>{alternativeLabel}</th></tr></thead><tbody>
        <tr className="return-risk-sharpe"><th>Expected Sharpe · annualized</th><td>{ratio(result.currentRatio)}</td><td>{ratio(result.proposedRatio)}</td></tr>
        <tr><th>Expected annual excess return</th><td>{percent(result.currentReturn)}</td><td>{percent(result.proposedReturn)}</td></tr>
        <tr><th>Forecast annual volatility</th><td>{percent(currentVol)}</td><td>{percent(proposedVol)}</td></tr>
      </tbody></table>{(result.currentRatio === null || result.proposedRatio === null) && <p className="lab-note">Expected Sharpe is unavailable for an allocation with zero forecast volatility.</p>}</div> : <>
      <div className="return-risk-headline"><strong>{relativeChangeLabel(result.ratioChange)}</strong><span>{alternativeLabel} vs current allocation</span></div>
      <dl className="return-risk-drivers"><div><dt>Assumed return</dt><dd>{relativeChangeLabel(result.returnChange)}</dd></div><div><dt>Forecast volatility</dt><dd>{relativeChangeLabel(result.riskChange)}</dd></div></dl>
      {result.ratioChange === null && <p className="lab-note">A relative improvement requires a positive current assumed return and nonzero risk for both allocations.</p>}
      <p className="return-risk-note">Relative comparison under this assumption. No absolute return forecast is implied.</p>
    </>}
    <footer><button type="button" onClick={onMethodology ?? (() => window.dispatchEvent(new CustomEvent("factorscope-open-about")))}>Methodology in About ↗</button></footer>
  </article>;
}
