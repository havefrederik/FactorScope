"use client";
import { useId, useState } from "react";
import type { FactorAnalytics } from "@/lib/analytics";

export default function FactorExposureChart({ factors, comparison, label = "Current portfolio", comparisonLabel = "Alternative portfolio" }: { factors: FactorAnalytics[]; comparison?: FactorAnalytics[]; label?: string; comparisonLabel?: string }) {
  const [group, setGroup] = useState<"Core & style" | "Sectors" | "All">("Core & style");
  const [precision, setPrecision] = useState(2);
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const detailsId = useId();
  const visible = factors.filter(factor => group === "All" || (group === "Sectors" ? factor.group === "Sector" : factor.group !== "Sector"));
  const other = new Map(comparison?.map(factor => [factor.name, factor.exposure]));
  const selected = visible.find(factor => factor.name === (pinned ?? hovered));
  const signed = (value: number, digits = precision) => `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
  function changeGroup(value: typeof group) { setGroup(value); setHovered(null); setPinned(null); }
  function exportValues() {
    const rows: (string | number)[][] = [["factor", "group", "current_exposure", ...(comparison ? ["alternative_exposure", "change"] : [])], ...factors.map(factor => [factor.name, factor.group, factor.exposure, ...(comparison ? [other.get(factor.name) ?? 0, (other.get(factor.name) ?? 0) - factor.exposure] : [])])];
    const csv = rows.map(row => row.map(value => typeof value === "number" ? String(value) : `"${value.replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a"); link.href = url; link.download = "factor-exposures.csv"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const extent = Math.max(.25, Math.ceil(Math.max(...visible.flatMap(factor => [Math.abs(factor.exposure), Math.abs(other.get(factor.name) ?? 0)]), 0) / .25) * .25);
  const width = 960, left = 160, right = precision === 2 ? 70 : precision === 4 ? 90 : 110, plot = width - left - right, top = 30, rowHeight = comparison ? 36 : 28, height = top + visible.length * rowHeight + 35;
  const x = (value: number) => left + (value + extent) / (2 * extent) * plot;
  const zero = x(0);
  return <article className="panel exposure-plot">
    <header className="panel-title"><h3>Factor exposures</h3><span>Conditional regression sensitivities</span></header>
    <div className="exposure-plot-controls"><div className="lab-tabs" role="tablist" aria-label="Factor exposure groups">{(["Core & style", "Sectors", "All"] as const).map(item => <button key={item} role="tab" aria-selected={group === item} className={group === item ? "active" : ""} onClick={() => changeGroup(item)}>{item}</button>)}</div><span><i className="current-key" />{label}</span>{comparison && <span><i className="alternative-key" />{comparisonLabel}</span>}<label className="exposure-precision">Precision<select aria-label="Exposure label precision" value={precision} onChange={event => setPrecision(Number(event.target.value))}><option value="2">2 decimals</option><option value="4">4 decimals</option><option value="6">6 decimals</option></select></label><button className="exposure-export" onClick={exportValues}>Export values</button></div>
    <div className={`exposure-inspector ${selected ? "inspecting" : ""}`} id={detailsId} role="status" aria-live="polite">
      {selected ? <><div className="exposure-inspector-name"><strong>{selected.name}</strong><small>{selected.group} · {pinned ? "Pinned" : "Hover details"}</small></div><div><span>{label}</span><b>{signed(selected.exposure, 6)}</b></div>{comparison && <><div><span>{comparisonLabel}</span><b className="alternative">{signed(other.get(selected.name) ?? 0, 6)}</b></div><div><span>Change</span><b>{signed((other.get(selected.name) ?? 0) - selected.exposure, 6)}</b></div></>}{pinned && <button aria-label="Clear selected factor" onClick={() => { setPinned(null); setHovered(null); }}>Clear</button>}</> : <p>Hover or focus a factor to inspect six decimal places. Click or tap to keep it selected. Export retains the underlying numerical values.</p>}
    </div>
    <div className="exposure-svg-wrap"><svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`Signed factor exposures, ${group.toLowerCase()}`}>
      {[-extent, -extent / 2, 0, extent / 2, extent].map(tick => <g key={tick}><line className={tick === 0 ? "exposure-zero" : "exposure-grid"} x1={x(tick)} x2={x(tick)} y1={top - 10} y2={height - 30} /><text x={x(tick)} y={height - 10} textAnchor="middle">{tick.toFixed(2)}</text></g>)}
      {visible.map((factor, index) => {
        const y = top + index * rowHeight + rowHeight / 2, alternative = other.get(factor.name) ?? 0;
        const bar = (value: number, offset: number, className: string) => <rect className={className} x={Math.min(zero, x(value))} y={y + offset - 5} width={Math.abs(x(value) - zero)} height="10"><title>{`${factor.name}: ${signed(value, 6)}`}</title></rect>;
        const toggle = () => setPinned(value => value === factor.name ? null : factor.name);
        return <g key={factor.name} className={`exposure-interactive-row ${selected?.name === factor.name ? "selected" : ""}`} role="button" tabIndex={0} aria-label={`${factor.name}: ${label} ${signed(factor.exposure, 6)}${comparison ? `, ${comparisonLabel} ${signed(alternative, 6)}, change ${signed(alternative - factor.exposure, 6)}` : ""}`} aria-pressed={pinned === factor.name} aria-describedby={detailsId} onPointerEnter={() => setHovered(factor.name)} onPointerLeave={() => setHovered(null)} onFocus={() => setHovered(factor.name)} onBlur={() => setHovered(null)} onClick={toggle} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); } if (event.key === "Escape") { setPinned(null); setHovered(null); } }}><rect className="exposure-hit-area" x="0" y={y - rowHeight / 2} width={width} height={rowHeight} /><text className="exposure-factor-name" x={left - 12} y={y + 4} textAnchor="end">{factor.name}</text>{bar(factor.exposure, comparison ? -6 : 0, "exposure-current")}{comparison && bar(alternative, 6, "exposure-alternative")}<text className="exposure-value" x={width - 8} y={y + (comparison ? -3 : 4)} textAnchor="end">{signed(factor.exposure)}</text>{comparison && <text className="exposure-value alternative" x={width - 8} y={y + 13} textAnchor="end">{signed(alternative)}</text>}</g>;
      })}
    </svg></div>
    <p className="lab-note">Bars show signed exposure, not portfolio weights or shares of risk. All visible factors use the same scale. Estimates describe the selected allocation and analysis period.</p>
  </article>;
}
