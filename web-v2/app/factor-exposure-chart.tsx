"use client";
import { useState } from "react";
import type { FactorAnalytics } from "@/lib/analytics";

export default function FactorExposureChart({ factors, comparison, label = "Current portfolio", comparisonLabel = "Alternative portfolio" }: { factors: FactorAnalytics[]; comparison?: FactorAnalytics[]; label?: string; comparisonLabel?: string }) {
  const [group, setGroup] = useState<"Core & style" | "Sectors" | "All">("Core & style");
  const visible = factors.filter(factor => group === "All" || (group === "Sectors" ? factor.group === "Sector" : factor.group !== "Sector"));
  const other = new Map(comparison?.map(factor => [factor.name, factor.exposure]));
  const extent = Math.max(.25, Math.ceil(Math.max(...visible.flatMap(factor => [Math.abs(factor.exposure), Math.abs(other.get(factor.name) ?? 0)]), 0) / .25) * .25);
  const width = 960, left = 160, right = 70, plot = width - left - right, top = 30, rowHeight = comparison ? 36 : 28, height = top + visible.length * rowHeight + 35;
  const x = (value: number) => left + (value + extent) / (2 * extent) * plot;
  const zero = x(0);
  return <article className="panel exposure-plot">
    <header className="panel-title"><h3>Factor exposures</h3><span>Conditional regression sensitivities</span></header>
    <div className="exposure-plot-controls"><div className="lab-tabs" role="tablist" aria-label="Factor exposure groups">{(["Core & style", "Sectors", "All"] as const).map(item => <button key={item} role="tab" aria-selected={group === item} className={group === item ? "active" : ""} onClick={() => setGroup(item)}>{item}</button>)}</div><span><i className="current-key" />{label}</span>{comparison && <span><i className="alternative-key" />{comparisonLabel}</span>}</div>
    <div className="exposure-svg-wrap"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Signed factor exposures, ${group.toLowerCase()}`}>
      {[-extent, -extent / 2, 0, extent / 2, extent].map(tick => <g key={tick}><line className={tick === 0 ? "exposure-zero" : "exposure-grid"} x1={x(tick)} x2={x(tick)} y1={top - 10} y2={height - 30} /><text x={x(tick)} y={height - 10} textAnchor="middle">{tick.toFixed(2)}</text></g>)}
      {visible.map((factor, index) => {
        const y = top + index * rowHeight + rowHeight / 2, alternative = other.get(factor.name) ?? 0;
        const bar = (value: number, offset: number, className: string) => <rect className={className} x={Math.min(zero, x(value))} y={y + offset - 5} width={Math.abs(x(value) - zero)} height="10"><title>{`${factor.name}: ${value >= 0 ? "+" : ""}${value.toFixed(3)}`}</title></rect>;
        return <g key={factor.name}><text className="exposure-factor-name" x={left - 12} y={y + 4} textAnchor="end">{factor.name}</text>{bar(factor.exposure, comparison ? -6 : 0, "exposure-current")}{comparison && bar(alternative, 6, "exposure-alternative")}<text className="exposure-value" x={width - 8} y={y + (comparison ? -3 : 4)} textAnchor="end">{factor.exposure >= 0 ? "+" : ""}{factor.exposure.toFixed(2)}</text>{comparison && <text className="exposure-value alternative" x={width - 8} y={y + 13} textAnchor="end">{alternative >= 0 ? "+" : ""}{alternative.toFixed(2)}</text>}</g>;
      })}
    </svg></div>
    <p className="lab-note">Bars show signed exposure, not portfolio weights or shares of risk. All visible factors use the same scale. Estimates describe the selected allocation and analysis period.</p>
  </article>;
}
