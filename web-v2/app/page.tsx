"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { averagePairwiseCorrelation, buildAnalytics, buildFactorModel, buildPortfolioDecomposition, buildRiskTargetStrategy, buildSecurityDrilldown, historicalReplay, pairwiseCorrelationAnalysis, rollingAveragePairwiseCorrelation, rollingPairwiseCorrelation, type FactorAnalytics, type FactorModelAnalytics, type MarketPayload, type PairwiseCorrelationDetail, type PortfolioAnalytics, type RollingCorrelationPoint, type SecurityDrilldownAnalytics, type StrategyBacktestAnalytics, type StrategyRebalanceFrequency } from "@/lib/analytics";

type Holding = { ticker: string; name: string; sector: string; value: number; beta: number; vol: number; risk: number };
type View = "Overview" | "Compare" | "Strategy Analysis" | "Risk Analysis" | "Security Analysis" | "Performance" | "Scenario Lab" | "Methodology" | "Project Brief";
type DemoKey = "equity" | "market-neutral";

const equitySeed: Holding[] = [
  { ticker: "AAPL", name: "Apple", sector: "Technology", value: 150000, beta: 1.14, vol: 24.8, risk: 16.2 },
  { ticker: "MSFT", name: "Microsoft", sector: "Technology", value: 150000, beta: 1.06, vol: 22.1, risk: 14.8 },
  { ticker: "JPM", name: "JPMorgan Chase", sector: "Financials", value: 100000, beta: 1.09, vol: 20.7, risk: 9.8 },
  { ticker: "BRK.B", name: "Berkshire Hathaway", sector: "Financials", value: 100000, beta: 0.87, vol: 15.9, risk: 7.4 },
  { ticker: "JNJ", name: "Johnson & Johnson", sector: "Healthcare", value: 70000, beta: 0.62, vol: 17.2, risk: 5.6 },
  { ticker: "ABBV", name: "AbbVie", sector: "Healthcare", value: 70000, beta: 0.68, vol: 19.3, risk: 5.8 },
  { ticker: "PG", name: "Procter & Gamble", sector: "Consumer Staples", value: 60000, beta: 0.55, vol: 15.4, risk: 4.4 },
  { ticker: "WMT", name: "Walmart", sector: "Consumer Staples", value: 60000, beta: 0.54, vol: 18.1, risk: 4.6 },
  { ticker: "COST", name: "Costco", sector: "Consumer Staples", value: 60000, beta: 0.83, vol: 19.4, risk: 4.8 },
  { ticker: "XOM", name: "Exxon Mobil", sector: "Energy", value: 50000, beta: 0.88, vol: 23.4, risk: 4.9 },
  { ticker: "NEE", name: "NextEra Energy", sector: "Utilities", value: 40000, beta: 0.58, vol: 22.0, risk: 3.7 },
  { ticker: "CAT", name: "Caterpillar", sector: "Industrials", value: 50000, beta: 1.11, vol: 26.3, risk: 5.1 },
  { ticker: "CASH", name: "Cash", sector: "Cash", value: 40000, beta: 0, vol: 0, risk: 0 },
];

const marketNeutralSeed: Holding[] = [
  { ticker: "AAPL", name: "Apple", sector: "Technology", value: 100000, beta: 1.07, vol: 26.9, risk: 5 },
  { ticker: "MSFT", name: "Microsoft", sector: "Technology", value: -100000, beta: 0.97, vol: 24.2, risk: 5 },
  { ticker: "CRM", name: "Salesforce", sector: "Technology", value: 100000, beta: 0.98, vol: 31.5, risk: 5 },
  { ticker: "ORCL", name: "Oracle", sector: "Technology", value: -100000, beta: 1.54, vol: 37.1, risk: 5 },
  { ticker: "GS", name: "Goldman Sachs", sector: "Financials", value: 100000, beta: 1.35, vol: 27.8, risk: 5 },
  { ticker: "JPM", name: "JPMorgan Chase", sector: "Financials", value: -100000, beta: 0.87, vol: 21.5, risk: 5 },
  { ticker: "BAC", name: "Bank of America", sector: "Financials", value: 100000, beta: 0.91, vol: 24.8, risk: 5 },
  { ticker: "BRK.B", name: "Berkshire Hathaway", sector: "Financials", value: -100000, beta: 0.42, vol: 16.0, risk: 5 },
  { ticker: "ABBV", name: "AbbVie", sector: "Healthcare", value: 100000, beta: 0.27, vol: 20.3, risk: 5 },
  { ticker: "PFE", name: "Pfizer", sector: "Healthcare", value: -100000, beta: 0.37, vol: 23.8, risk: 5 },
  { ticker: "UNH", name: "UnitedHealth", sector: "Healthcare", value: 100000, beta: 0.25, vol: 30.2, risk: 5 },
  { ticker: "JNJ", name: "Johnson & Johnson", sector: "Healthcare", value: -100000, beta: 0.01, vol: 17.0, risk: 5 },
  { ticker: "WMT", name: "Walmart", sector: "Consumer Staples", value: 100000, beta: 0.39, vol: 20.0, risk: 5 },
  { ticker: "PG", name: "Procter & Gamble", sector: "Consumer Staples", value: -100000, beta: 0.10, vol: 15.4, risk: 5 },
  { ticker: "XOM", name: "Exxon Mobil", sector: "Energy", value: 100000, beta: 0.21, vol: 22.2, risk: 5 },
  { ticker: "CVX", name: "Chevron", sector: "Energy", value: -100000, beta: 0.34, vol: 21.1, risk: 5 },
  { ticker: "HON", name: "Honeywell", sector: "Industrials", value: 100000, beta: 0.75, vol: 20.4, risk: 5 },
  { ticker: "CAT", name: "Caterpillar", sector: "Industrials", value: -100000, beta: 1.29, vol: 29.5, risk: 5 },
  { ticker: "DUK", name: "Duke Energy", sector: "Utilities", value: 100000, beta: -0.03, vol: 16.9, risk: 5 },
  { ticker: "NEE", name: "NextEra Energy", sector: "Utilities", value: -100000, beta: 0.32, vol: 26.6, risk: 5 },
  { ticker: "CASH", name: "Cash and collateral", sector: "Cash", value: 1000000, beta: 0, vol: 0, risk: 0 },
];

const stockCatalog = [
  ["AAPL","Apple","Technology"],["MSFT","Microsoft","Technology"],["NVDA","NVIDIA","Technology"],["AMZN","Amazon","Consumer"],["GOOGL","Alphabet","Technology"],["META","Meta Platforms","Technology"],["TSLA","Tesla","Consumer"],["AVGO","Broadcom","Technology"],["AMD","Advanced Micro Devices","Technology"],["CRM","Salesforce","Technology"],["ORCL","Oracle","Technology"],["NFLX","Netflix","Communication Services"],["JPM","JPMorgan Chase","Financials"],["BAC","Bank of America","Financials"],["GS","Goldman Sachs","Financials"],["BRK.B","Berkshire Hathaway","Financials"],["XOM","Exxon Mobil","Energy"],["CVX","Chevron","Energy"],["COP","ConocoPhillips","Energy"],["UNH","UnitedHealth","Healthcare"],["LLY","Eli Lilly","Healthcare"],["JNJ","Johnson & Johnson","Healthcare"],["ABBV","AbbVie","Healthcare"],["PFE","Pfizer","Healthcare"],["CAT","Caterpillar","Industrials"],["HON","Honeywell","Industrials"],["GE","GE Aerospace","Industrials"],["BA","Boeing","Industrials"],["COST","Costco","Consumer Staples"],["WMT","Walmart","Consumer Staples"],["HD","Home Depot","Consumer"],["KO","Coca-Cola","Consumer Staples"],["PEP","PepsiCo","Consumer Staples"],["PG","Procter & Gamble","Consumer Staples"],["NEE","NextEra Energy","Utilities"],["DUK","Duke Energy","Utilities"],["SO","Southern Company","Utilities"],["DIS","Walt Disney","Communication Services"],["MCD","McDonald’s","Consumer"],
] as const;

const allocationPalette = ["#25d2c6", "#6d5dfc", "#ec9b56", "#6dbb68", "#e4cf6c", "#6f7d91", "#e06c9f", "#3b82f6", "#a3e635", "#f97316"];

function money(n: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n); }
function pct(n: number) { return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`; }
function signedMoney(n: number) { return `${n >= 0 ? "+" : "−"}${money(Math.abs(n))}`; }

function Icon({ name }: { name: string }) {
  const glyphs: Record<string, string> = { grid: "⊞", compare: "⇄", strategy: "◇", factor: "⌁", position: "≡", security: "◎", performance: "⌁", event: "◫", scenario: "◒", method: "i", brief: "↗", upload: "↑", reset: "↺", plus: "+" };
  return <span className="icon" aria-hidden="true">{glyphs[name] || "•"}</span>;
}

function PerformanceChart({ portfolio, benchmark, tertiary, dates, startDate, endDate, large = false, primaryLabel = "Current portfolio", secondaryLabel = "S&P 500", tertiaryLabel = "Market reference", definition = "Growth of $1 invested at the start of the period. Current dollar allocations are held buy-and-hold; cash earns 0%." }: { portfolio: number[]; benchmark: number[]; tertiary?: number[]; dates?: string[]; startDate: string; endDate: string; large?: boolean; primaryLabel?: string; secondaryLabel?: string; tertiaryLabel?: string; definition?: string }) {
  const length = Math.min(portfolio.length, benchmark.length, tertiary?.length ?? Number.POSITIVE_INFINITY, dates?.length ?? Number.POSITIVE_INFINITY);
  const step = Math.max(1, Math.floor(length / 260));
  const indexes = Array.from({ length }, (_, index) => index).filter((index) => index % step === 0 || index === length - 1);
  const sampledPortfolio = indexes.map((index) => portfolio[index]);
  const sampledBenchmark = indexes.map((index) => benchmark[index]);
  const sampledTertiary = tertiary ? indexes.map((index) => tertiary[index]) : [];
  const rawMin = Math.min(...sampledPortfolio, ...sampledBenchmark, ...sampledTertiary, 1);
  const rawMax = Math.max(...sampledPortfolio, ...sampledBenchmark, ...sampledTertiary, 1);
  const padding = Math.max((rawMax - rawMin) * .08, .02);
  const min = rawMin - padding;
  const max = rawMax + padding;
  const points = (values: number[]) => values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 100},${92 - ((value - min) / Math.max(max - min, .01)) * 84}`).join(" ");
  const portfolioReturn = portfolio.at(-1)! - 1;
  const benchmarkReturn = benchmark.at(-1)! - 1;
  const tertiaryReturn = tertiary?.at(-1) ? tertiary.at(-1)! - 1 : null;
  const yTicks = Array.from({ length: 5 }, (_, index) => min + (max - min) * index / 4);
  const dateTickCount = large ? 9 : 7;
  const dateIndexes = [...new Set(Array.from({ length: Math.min(dateTickCount, length) }, (_, index) => Math.round(index * (length - 1) / Math.max(Math.min(dateTickCount, length) - 1, 1))))];
  const dateAt = (index: number) => dates?.[index] ?? new Date(Date.parse(`${startDate}T00:00:00Z`) + (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) * index / Math.max(length - 1, 1)).toISOString().slice(0, 10);
  const spanDays = Math.max(1, Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000));
  const formatDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", spanDays < 160 ? { month: "short", day: "numeric", timeZone: "UTC" } : { month: "short", year: "2-digit", timeZone: "UTC" });
  return <>
    <div className="performance-legend">
      <span><i className="portfolio-swatch" />{primaryLabel} <b>{pct(portfolioReturn * 100)}</b></span>
      <span><i className="benchmark-swatch" />{secondaryLabel} <b>{pct(benchmarkReturn * 100)}</b></span>
      {tertiary && tertiaryReturn !== null && <span><i className="tertiary-swatch" />{tertiaryLabel} <b>{pct(tertiaryReturn * 100)}</b></span>}
    </div>
    <div className={`line-chart ${large ? "large" : ""}`}>
      <span className="chart-y-title">CUMULATIVE RETURN</span>
      <div className="chart-y-axis">{yTicks.map((tick) => <span key={tick} style={{ bottom: `${((tick - min) / Math.max(max - min, .01)) * 84 + 8}%` }}>{pct((tick - 1) * 100).replace("+", "")}</span>)}</div>
      <svg className="spark" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`Cumulative return: ${primaryLabel} ${pct(portfolioReturn * 100)}, ${secondaryLabel} ${pct(benchmarkReturn * 100)}${tertiaryReturn === null ? "" : `, ${tertiaryLabel} ${pct(tertiaryReturn * 100)}`}`}>
        {yTicks.map(tick => <line key={tick} x1="0" y1={92 - ((tick - min) / Math.max(max - min, .01)) * 84} x2="100" y2={92 - ((tick - min) / Math.max(max - min, .01)) * 84} className="gridline" />)}
        {dateIndexes.map(index => <line key={index} x1={index / Math.max(length - 1, 1) * 100} y1="8" x2={index / Math.max(length - 1, 1) * 100} y2="92" className="chart-date-guide" />)}
        <line x1="0" y1={92 - ((1 - min) / Math.max(max - min, .01)) * 84} x2="100" y2={92 - ((1 - min) / Math.max(max - min, .01)) * 84} className="baseline" />
        {tertiary && <polyline points={points(sampledTertiary)} className="tertiary-line" />}
        <polyline points={points(sampledBenchmark)} className="benchmark-line" />
        <polyline points={points(sampledPortfolio)} className="portfolio-line" />
      </svg>
      <div className="chart-date-axis">{dateIndexes.map((index, tickIndex) => <span key={`${index}-${dateAt(index)}`} className={tickIndex === 0 ? "first" : tickIndex === dateIndexes.length - 1 ? "last" : ""} style={{ left: `${index / Math.max(length - 1, 1) * 100}%` }}>{formatDate(dateAt(index))}</span>)}</div>
    </div>
    <p className="chart-definition">{definition}</p>
  </>;
}

function DecompositionChart({ decomposition }: { decomposition: SecurityDrilldownAnalytics["decomposition"] }) {
  const [displayMode,setDisplayMode]=useState<"stacked"|"cumulative">("stacked");
  const length = decomposition.dates.length;
  const indexes = Array.from({ length }, (_, index) => index);
  const components = [
    ...decomposition.factors.map((factor, index) => ({ key: factor.name, label: factor.name, group: factor.group, values: factor.values, className: `decomp-factor-${index}` })),
    { key: "idiosyncratic", label: "Idiosyncratic", values: decomposition.idiosyncratic, className: "decomp-idio" },
  ];
  const stackedBounds = indexes.flatMap((index) => {
    const values = components.map((component) => component.values[index]);
    return [values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0), values.filter((value) => value < 0).reduce((sum, value) => sum + value, 0), decomposition.observed[index], decomposition.systematic[index]];
  });
  const cumulativeBounds = indexes.flatMap((index) => [decomposition.observed[index], decomposition.systematic[index], decomposition.idiosyncratic[index]]);
  const bounds = displayMode === "stacked" ? stackedBounds : cumulativeBounds;
  const rawMin = Math.min(0, ...bounds);
  const rawMax = Math.max(0, ...bounds);
  const padding = Math.max((rawMax - rawMin) * .1, .01);
  const min = rawMin - padding;
  const max = rawMax + padding;
  const y = (value: number) => 5 + ((max - value) / Math.max(max - min, .01)) * 89;
  const x = (position: number) => 1 + (position / Math.max(indexes.length - 1, 1)) * 96;
  const barWidth = indexes.length > 1 ? 96 / (indexes.length - 1) * .9 : 1;
  const observedPoints = indexes.map((index, position) => `${x(position)},${y(decomposition.observed[index])}`).join(" ");
  const systematicPoints = indexes.map((index, position) => `${x(position)},${y(decomposition.systematic[index])}`).join(" ");
  const idiosyncraticPoints = indexes.map((index, position) => `${x(position)},${y(decomposition.idiosyncratic[index])}`).join(" ");
  const ticks = Array.from({length:5},(_,index)=>max-(max-min)*index/4);
  const spanDays = Math.max(1, Math.round((Date.parse(`${decomposition.dates.at(-1)}T00:00:00Z`) - Date.parse(`${decomposition.dates[0]}T00:00:00Z`)) / 86400000));
  const dateTickCount = spanDays <= 90 ? 7 : spanDays <= 400 ? 8 : spanDays <= 1100 ? 10 : 12;
  const dateTickIndexes = [...new Set(Array.from({length:dateTickCount},(_,index)=>Math.round(index*(length-1)/Math.max(dateTickCount-1,1))))];
  const formatDateTick = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", spanDays <= 120 ? { month: "short", day: "numeric", timeZone: "UTC" } : spanDays <= 550 ? { month: "short", year: "2-digit", timeZone: "UTC" } : { month: "short", year: "numeric", timeZone: "UTC" });
  const observedEnd = decomposition.observed.at(-1) ?? 0;
  const systematicEnd = decomposition.systematic.at(-1) ?? 0;
  const idiosyncraticEnd = decomposition.idiosyncratic.at(-1) ?? 0;
  const rawEndLabels = (displayMode === "stacked" ? [
    { key: "observed", label: "TOTAL", value: observedEnd, rawTop: y(observedEnd), className: "decomp-observed" },
    ...components.map((component) => ({ key: component.key, label: component.label, value: component.values.at(-1) ?? 0, rawTop: y(component.values.at(-1) ?? 0), className: component.className })),
  ] : [
    { key: "observed", label: "OBSERVED", value: observedEnd, rawTop: y(observedEnd), className: "decomp-observed" },
    { key: "systematic", label: "SYSTEMATIC", value: systematicEnd, rawTop: y(systematicEnd), className: "decomp-systematic" },
    { key: "idiosyncratic", label: "IDIOSYNCRATIC", value: idiosyncraticEnd, rawTop: y(idiosyncraticEnd), className: "decomp-idio" },
  ]).sort((a,b)=>a.rawTop-b.rawTop);
  const labelGap = 4.25;
  const endLabels = rawEndLabels.map((label,index) => ({...label,top:index===0?Math.max(5,label.rawTop):Math.max(label.rawTop,5+index*labelGap)}));
  for(let index=1;index<endLabels.length;index++)endLabels[index].top=Math.max(endLabels[index].top,endLabels[index-1].top+labelGap);
  if((endLabels.at(-1)?.top??0)>94){endLabels[endLabels.length-1].top=94;for(let index=endLabels.length-2;index>=0;index--)endLabels[index].top=Math.min(endLabels[index].top,endLabels[index+1].top-labelGap)}
  if((endLabels[0]?.top??5)<5){const shift=5-endLabels[0].top;endLabels.forEach(label=>label.top+=shift)}
  return <>
    <div className="decomposition-toolbar"><button type="button" aria-pressed={displayMode==="stacked"} className={displayMode==="stacked"?"active":""} onClick={()=>setDisplayMode("stacked")}>STACKED</button><button type="button" aria-pressed={displayMode==="cumulative"} className={displayMode==="cumulative"?"active":""} onClick={()=>setDisplayMode("cumulative")}>CUMULATIVE RETURN</button><b>{displayMode==="stacked"?`${length.toLocaleString()} DAILY OBSERVATIONS · EACH BAR = CUMULATIVE THROUGH DATE`:`${length.toLocaleString()} TRADING DAYS · DAILY-LINKED LINES`}</b></div>
    <div className="decomposition-frame">
      <div className="decomposition-legend">
        <strong>{displayMode==="stacked"?"RETURN COMPONENTS":"CUMULATIVE RETURN SERIES"}</strong>
        <span><i className="decomp-observed"/>Observed return<em>Total</em><b>{pct(observedEnd*100)}</b></span>
        {displayMode==="stacked" ? components.map((component) => <span key={component.key}><i className={component.className}/>{component.label}<em>{"group" in component ? component.group : "Residual"}</em><b>{pct((component.values.at(-1) ?? 0)*100)}</b></span>) : <><span><i className="decomp-systematic"/>Systematic fitted<em>Model</em><b>{pct(systematicEnd*100)}</b></span><span><i className="decomp-idio"/>Idiosyncratic contribution<em>Residual</em><b>{pct(idiosyncraticEnd*100)}</b></span></>}
      </div>
      <div className="decomposition-axis">{ticks.map((tick)=><span key={tick} style={{top:`${y(tick)}%`}}>{(tick*100).toFixed(0)}%</span>)}</div>
      <div className="decomposition-end-labels">{endLabels.map((label)=><span key={label.key} className={label.className} style={{top:`${label.top}%`}}><em>{label.label}</em>{pct(label.value*100)}</span>)}</div>
      <div className="decomposition-chart">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={displayMode==="stacked"?"Cumulative factor-level return decomposition with individual market, style, sector and idiosyncratic contributions":"Cumulative observed, systematic fitted and idiosyncratic contribution return lines"}>
          {ticks.map((tick) => <line key={tick} x1="0" x2="100" y1={y(tick)} y2={y(tick)} className="gridline"/>)}
          {dateTickIndexes.map((index)=><line key={index} x1={x(index)} x2={x(index)} y1="5" y2="94" className="decomposition-guide"/>)}
          <line x1="0" x2="100" y1={y(0)} y2={y(0)} className="decomposition-zero"/>
          {displayMode==="stacked" && indexes.flatMap((index, position) => {
            let positiveBase = 0;
            let negativeBase = 0;
            const orderedComponents = components
              .map((component, order) => ({ component, order, value: component.values[index] }))
              .sort((a, b) => {
                if (a.component.key === "idiosyncratic") return 1;
                if (b.component.key === "idiosyncratic") return -1;
                return Math.abs(a.value) - Math.abs(b.value) || a.order - b.order;
              });
            return orderedComponents.map(({ component, value }) => {
              const start = value >= 0 ? positiveBase : negativeBase;
              const end = start + value;
              if (value >= 0) positiveBase = end; else negativeBase = end;
              return <rect key={`${component.key}-${index}`} x={x(position)-barWidth/2} y={Math.min(y(start),y(end))} width={barWidth} height={Math.max(Math.abs(y(start)-y(end)),.1)} className={component.className}><title>{`${decomposition.dates[index]} · ${component.label} cumulative contribution ${pct(value*100)}`}</title></rect>;
            });
          })}
          {endLabels.map((label)=><line key={`leader-${label.key}`} x1="97" x2="100" y1={label.rawTop} y2={label.top} className={`decomposition-leader ${label.className}`}/>) }
          {displayMode==="cumulative" && <><polyline points={systematicPoints} className="decomposition-systematic-line"/><polyline points={idiosyncraticPoints} className="decomposition-idio-line"/></>}
          <polyline points={observedPoints} className="decomposition-observed-line"/>
        </svg>
        <div className="decomposition-date-axis">{dateTickIndexes.map((index,tickIndex)=><span key={decomposition.dates[index]} className={tickIndex===0?"first":tickIndex===dateTickIndexes.length-1?"last":""} style={{left:`${x(index)}%`}}>{formatDateTick(decomposition.dates[index])}</span>)}</div>
      </div>
    </div>
    <p className="chart-definition">{displayMode==="stacked"?"Every vertical bar corresponds to one trading day and shows cumulative contributions through that date. Within each positive and negative stack, factor contributions run from the smallest absolute value near zero to the largest outward; the idiosyncratic contribution is always the outermost layer. A narrow gap separates adjacent sessions.":"Observed return is shown against the cumulative fitted systematic return and cumulative idiosyncratic contribution."} Daily ETF-proxy factor effects are linked using beginning-of-day security wealth; the idiosyncratic component includes the intercept and residual, so the analysis reconciles exactly to the observed adjusted-price return.</p>
  </>;
}

function DrawdownChart({ analytics }: { analytics: PortfolioAnalytics }) {
  const drawdowns = analytics.curve.map((value, index) => value / Math.max(...analytics.curve.slice(0, index + 1)) - 1);
  const step = Math.max(1, Math.floor(drawdowns.length / 260));
  const sampled = drawdowns.filter((_, index) => index % step === 0 || index === drawdowns.length - 1);
  const floor = Math.min(...sampled, -.01);
  const points = sampled.map((value, index) => `${index / Math.max(sampled.length - 1, 1) * 100},${8 + Math.abs(value) / Math.abs(floor) * 78}`).join(" ");
  return <div className="event-drawdown-chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`Portfolio drawdown, worst ${pct(analytics.maxDrawdown * 100)}`}><line x1="0" x2="100" y1="8" y2="8" className="baseline"/><polyline points={points} /></svg><div><span>{analytics.startDate}</span><b>WORST {pct(analytics.maxDrawdown*100)}</b><span>{analytics.endDate}</span></div></div>;
}

function RollingCorrelationChart({ points, eventStart }: { points: RollingCorrelationPoint[]; eventStart: string }) {
  if(!points.length)return <div className="correlation-empty">Not enough aligned history for a 20-trading-day correlation series.</div>;
  const min=-.2;const max=1;const y=(value:number)=>8+(max-value)/(max-min)*78;
  const line=points.map((point,index)=>`${index/Math.max(points.length-1,1)*100},${y(point.correlation)}`).join(" ");
  const eventIndex=Math.max(0,points.findIndex(point=>point.date>=eventStart));
  const eventX=eventIndex/Math.max(points.length-1,1)*100;
  const current=points.at(-1)?.correlation??0;
  return <div className="rolling-correlation-chart"><div className="correlation-chart-value"><span>20D AVERAGE PAIRWISE CORRELATION</span><strong>{current.toFixed(2)}</strong></div><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`Rolling 20-trading-day average pairwise stock correlation, latest ${current.toFixed(2)}`}>{[0,.25,.5,.75,1].map(tick=><line key={tick} x1="0" x2="100" y1={y(tick)} y2={y(tick)} className="gridline"/>)}<line x1={eventX} x2={eventX} y1="8" y2="86" className="correlation-event-marker"/><polyline points={line}/></svg><div className="rolling-correlation-axis"><span>{points[0].date}</span><b style={{left:`${eventX}%`}}>EVENT START</b><span>{points.at(-1)?.date}</span></div></div>;
}

function PairCorrelationChart({ points, eventStart, label }: { points: RollingCorrelationPoint[]; eventStart: string; label: string }) {
  if(!points.length)return <div className="correlation-empty">Not enough aligned history for this pair.</div>;
  const y=(value:number)=>8+(1-value)/2*78;
  const line=points.map((point,index)=>`${index/Math.max(points.length-1,1)*100},${y(point.correlation)}`).join(" ");
  const eventIndex=Math.max(0,points.findIndex(point=>point.date>=eventStart));
  const eventX=eventIndex/Math.max(points.length-1,1)*100;
  const current=points.at(-1)?.correlation??0;
  return <div className="pair-correlation-chart"><div className="pair-chart-value"><span>ROLLING 20D · {label}</span><strong>{current.toFixed(2)}</strong></div><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`Rolling 20-trading-day correlation for ${label}, latest ${current.toFixed(2)}`}>{[-1,-.5,0,.5,1].map(tick=><line key={tick} x1="0" x2="100" y1={y(tick)} y2={y(tick)} className={tick===0?"correlation-zero":"gridline"}/>)}<line x1={eventX} x2={eventX} y1="8" y2="86" className="correlation-event-marker"/><polyline points={line}/></svg><div className="rolling-correlation-axis"><span>{points[0].date}</span><b style={{left:`${eventX}%`}}>EVENT START</b><span>{points.at(-1)?.date}</span></div></div>;
}

function correlationCellColor(value:number){const opacity=.14+Math.abs(value)*.62;return value>=0?`rgba(38,211,199,${opacity})`:`rgba(240,107,120,${opacity})`}

function PairwiseCorrelationExplorer({ pairs, tickers, selectedKey, onSelect, points, eventStart }: { pairs: PairwiseCorrelationDetail[]; tickers: string[]; selectedKey: string; onSelect: (key:string)=>void; points: RollingCorrelationPoint[]; eventStart: string }) {
  if(!pairs.length)return <div className="correlation-empty">Not enough aligned observations to calculate the pairwise matrix.</div>;
  const pairMap=new Map(pairs.map(pair=>[pair.key,pair]));
  const getPair=(a:string,b:string)=>pairMap.get(tickers.indexOf(a)<tickers.indexOf(b)?`${a}|${b}`:`${b}|${a}`);
  const selected=pairs.find(pair=>pair.key===selectedKey)??pairs[0];
  const movers=pairs.slice().sort((a,b)=>Math.abs(b.change)-Math.abs(a.change));
  return <div className="pairwise-explorer">
    <section className="correlation-matrix-wrap"><div className="matrix-heading"><div><strong>EVENT CORRELATION MATRIX</strong><span>Click any cell to inspect the pair</span></div><div className="matrix-scale"><i/>−1 <i/>0 <i/>+1</div></div><div className="correlation-matrix" style={{gridTemplateColumns:`56px repeat(${tickers.length},minmax(42px,1fr))`}}><span/>{tickers.map(ticker=><b key={`column-${ticker}`}>{ticker}</b>)}{tickers.flatMap((row,rowIndex)=><><b key={`row-${row}`}>{row}</b>{tickers.map((column,columnIndex)=>{if(rowIndex===columnIndex)return <span className="matrix-diagonal" key={`${row}-${column}`}>1.00</span>;const pair=getPair(row,column);const active=pair?.key===selected.key;return <button key={`${row}-${column}`} className={active?"selected":""} disabled={!pair} style={pair?{background:correlationCellColor(pair.event)}:undefined} onClick={()=>pair&&onSelect(pair.key)} title={pair?`${row} / ${column}: ${pair.event.toFixed(2)}`:"Unavailable"}>{pair?.event.toFixed(2)??"—"}</button>})}</>)} </div></section>
    <section className="pair-detail"><div className="pair-detail-head"><div><span>SELECTED PAIR</span><strong>{selected.tickerA} / {selected.tickerB}</strong></div><dl><div><dt>BEFORE</dt><dd>{selected.before.toFixed(2)}</dd></div><div><dt>EVENT</dt><dd>{selected.event.toFixed(2)}</dd></div><div><dt>CHANGE</dt><dd className={selected.change>0?"up-correlation":""}>{selected.change>=0?"+":""}{selected.change.toFixed(2)}</dd></div></dl></div><PairCorrelationChart points={points} eventStart={eventStart} label={`${selected.tickerA} / ${selected.tickerB}`}/><p>Correlation describes co-movement, not causation. A sharp increase can reveal diversification breaking down during the selected event.</p></section>
    <section className="pair-movers"><div><strong>LARGEST CORRELATION CHANGES</strong><span>Ranked by absolute before-to-event change</span></div>{movers.map(pair=><button key={pair.key} className={pair.key===selected.key?"selected":""} onClick={()=>onSelect(pair.key)}><b>{pair.tickerA}</b><i>×</i><b>{pair.tickerB}</b><span>{pair.before.toFixed(2)}</span><em>→</em><span>{pair.event.toFixed(2)}</span><strong className={pair.change>0?"up-correlation":""}>{pair.change>=0?"+":""}{pair.change.toFixed(2)}</strong></button>)}</section>
  </div>;
}

function CorrelationAnalysis({ payload, holdings, startDate, endDate }: { payload: MarketPayload; holdings: Holding[]; startDate: string; endDate: string }) {
  const [selectedPairKey,setSelectedPairKey]=useState("");
  const spanDays=Math.max(1,Math.round((Date.parse(`${endDate}T00:00:00Z`)-Date.parse(`${startDate}T00:00:00Z`))/86400000));
  const beforeEndDate=new Date(`${startDate}T00:00:00Z`);beforeEndDate.setUTCDate(beforeEndDate.getUTCDate()-1);
  const beforeStartDate=new Date(beforeEndDate);beforeStartDate.setUTCDate(beforeStartDate.getUTCDate()-spanDays);
  const beforeStart=beforeStartDate.toISOString().slice(0,10);
  const beforeEnd=beforeEndDate.toISOString().slice(0,10);
  const current=averagePairwiseCorrelation(payload,holdings,startDate,endDate);
  const before=averagePairwiseCorrelation(payload,holdings,beforeStart,beforeEnd);
  const rolling=rollingAveragePairwiseCorrelation(payload,holdings,beforeStart,endDate,20);
  const pairs=pairwiseCorrelationAnalysis(payload,holdings,beforeStart,beforeEnd,startDate,endDate);
  const selectedPair=pairs.find(pair=>pair.key===selectedPairKey)??pairs.slice().sort((a,b)=>Math.abs(b.change)-Math.abs(a.change))[0];
  const pairRolling=selectedPair?rollingPairwiseCorrelation(payload,selectedPair.tickerA,selectedPair.tickerB,beforeStart,endDate,20):[];
  const tickers=holdings.filter(holding=>holding.ticker!=="CASH"&&payload.series[holding.ticker]).map(holding=>holding.ticker);
  return <section className="correlation-workspace">
    <section className="metrics correlation-metrics"><Metric label="AVERAGE CORRELATION" value={current.averageCorrelation.toFixed(2)} sub={`${before.averageCorrelation.toFixed(2)} in prior equal-length window`} tone={current.averageCorrelation>before.averageCorrelation?"amber":"cyan"}/><Metric label="CHANGE" value={`${current.averageCorrelation-before.averageCorrelation>=0?"+":""}${(current.averageCorrelation-before.averageCorrelation).toFixed(2)}`} sub="Current period minus prior window"/><Metric label="SECURITY PAIRS" value={current.pairCount.toLocaleString()} sub={`${tickers.length} priced holdings`}/></section>
    <article className="panel correlation-average-panel"><PanelTitle title="Portfolio correlation through time" meta="Rolling 20 trading days · average across every pair"/><RollingCorrelationChart points={rolling} eventStart={startDate}/><p>Use this as the portfolio-level signal. A rising line means the holdings are moving together more closely and realized diversification is weakening.</p></article>
    <article className="panel correlation-summary-panel"><PanelTitle title="Before versus selected period" meta="Equal-length comparison"/><div className="correlation-compare"><div><span>BEFORE</span><strong>{before.averageCorrelation.toFixed(2)}</strong><small>{beforeStart} — {beforeEnd}</small></div><i>→</i><div><span>SELECTED PERIOD</span><strong className={current.averageCorrelation>before.averageCorrelation?"up-correlation":""}>{current.averageCorrelation.toFixed(2)}</strong><small>{startDate} — {endDate}</small></div></div><p>Average pairwise correlation is an equal-weight summary of all available security pairs. Inspect the matrix below to see which relationships caused the change.</p></article>
    <article className="panel correlation-pairwise-panel"><PanelTitle title="Pairwise correlation explorer" meta={`${pairs.length} security pairs · selected-period matrix and rolling detail`}/><PairwiseCorrelationExplorer pairs={pairs} tickers={tickers} selectedKey={selectedPair?.key??""} onSelect={setSelectedPairKey} points={pairRolling} eventStart={startDate}/></article>
  </section>;
}

const eventPresets = [
  { id: "ai", label: "AI leadership volatility · Q1 2025", start: "2025-01-02", end: "2025-04-30" },
  { id: "inflation", label: "2022 inflation selloff", start: "2022-01-03", end: "2022-10-12" },
  { id: "covid", label: "COVID selloff", start: "2020-01-02", end: "2020-04-30" },
  { id: "banks", label: "Regional-bank stress · 2023", start: "2023-02-01", end: "2023-04-28" },
];

function EventAnalysis({ payload, holdings, total, onSelectTicker, onExploreCorrelations }: { payload: MarketPayload; holdings: Holding[]; total: number; onSelectTicker: (ticker: string) => void; onExploreCorrelations: (startDate:string,endDate:string)=>void }) {
  const [presetId,setPresetId]=useState(eventPresets[0].id);
  const [startDate,setStartDate]=useState(eventPresets[0].start);
  const [endDate,setEndDate]=useState(eventPresets[0].end);
  const selectPreset=(id:string)=>{setPresetId(id);const preset=eventPresets.find(item=>item.id===id);if(preset){setStartDate(preset.start);setEndDate(preset.end)}};
  const analytics=useMemo(()=>buildAnalytics(payload,holdings,{startDate,endDate}),[payload,holdings,startDate,endDate]);
  const model=useMemo(()=>analytics?buildFactorModel(payload,analytics,total):null,[payload,analytics,total]);
  const decomposition=useMemo(()=>analytics?buildPortfolioDecomposition(payload,analytics):null,[payload,analytics]);
  if(!analytics||!model||!decomposition)return <section className="event-analysis"><article className="panel event-controls"><PanelTitle title="Historical event" meta="Observed adjusted-price returns"/><EventControls presetId={presetId} selectPreset={selectPreset} startDate={startDate} endDate={endDate} setStartDate={setStartDate} setEndDate={setEndDate} payload={payload}/></article><DataUnavailable /></section>;
  const excess=analytics.totalReturn-analytics.benchmarkReturn;
  const worstDays=analytics.dailyReturns.map((value,index)=>({date:analytics.dates[index+1],value,pnl:total*value})).sort((a,b)=>a.value-b.value).slice(0,5);
  const positions=analytics.positions.slice().sort((a,b)=>Math.abs(b.pnl)-Math.abs(a.pnl));
  const maxPosition=Math.max(...positions.map(position=>Math.abs(position.pnl)),1);
  const spanDays=Math.max(1,Math.round((Date.parse(`${analytics.endDate}T00:00:00Z`)-Date.parse(`${analytics.startDate}T00:00:00Z`))/86400000));
  const beforeEndDate=new Date(`${analytics.startDate}T00:00:00Z`);beforeEndDate.setUTCDate(beforeEndDate.getUTCDate()-1);
  const beforeStartDate=new Date(beforeEndDate);beforeStartDate.setUTCDate(beforeStartDate.getUTCDate()-spanDays);
  const beforeStart=beforeStartDate.toISOString().slice(0,10);
  const beforeEnd=beforeEndDate.toISOString().slice(0,10);
  const beforeCorrelation=averagePairwiseCorrelation(payload,holdings,beforeStart,beforeEnd);
  const eventCorrelation=averagePairwiseCorrelation(payload,holdings,analytics.startDate,analytics.endDate);
  const correlationChange=eventCorrelation.averageCorrelation-beforeCorrelation.averageCorrelation;
  return <section className="event-analysis">
    <article className="panel event-controls"><PanelTitle title="Historical event" meta="Observed adjusted-price returns"/><EventControls presetId={presetId} selectPreset={selectPreset} startDate={startDate} endDate={endDate} setStartDate={setStartDate} setEndDate={setEndDate} payload={payload}/><p>Applies the selected historical window to today’s dollar holdings. This is a fixed-current-portfolio replay, not the portfolio’s actual historical composition.</p></article>
    <section className="metrics event-metrics"><Metric label="PORTFOLIO RETURN" value={pct(analytics.totalReturn*100)} sub={money(analytics.pnl)} tone={analytics.totalReturn<0?"red":"cyan"}/><Metric label="S&P 500 RETURN" value={pct(analytics.benchmarkReturn*100)} sub="Adjusted-price benchmark"/><Metric label="EXCESS RETURN" value={pct(excess*100)} sub="Portfolio minus S&P 500" tone={excess<0?"red":"cyan"}/><Metric label="MAX DRAWDOWN" value={pct(analytics.maxDrawdown*100)} sub={`${analytics.startDate} — ${analytics.endDate}`} tone="red"/><Metric label="REALIZED VOLATILITY" value={pct(analytics.annualVolatility*100).replace("+","")} sub="Annualized during event" tone="amber"/></section>
    <article className="panel event-performance"><PanelTitle title="Portfolio through the event" meta="Observed joint returns · no correlation assumptions"/><PerformanceChart portfolio={analytics.curve} benchmark={analytics.benchmarkCurve} dates={analytics.dates} startDate={analytics.startDate} endDate={analytics.endDate} large /></article>
    <article className="panel event-correlation-summary"><PanelTitle title="Diversification during the event" meta={`${eventCorrelation.pairCount} security pairs`}/><div className="correlation-compare"><div><span>BEFORE</span><strong>{beforeCorrelation.averageCorrelation.toFixed(2)}</strong><small>{beforeStart} — {beforeEnd}</small></div><i>→</i><div><span>EVENT</span><strong className={correlationChange>0?"up-correlation":""}>{eventCorrelation.averageCorrelation.toFixed(2)}</strong><small>{analytics.startDate} — {analytics.endDate}</small></div></div><div className="event-correlation-action"><p>Average pairwise correlation {correlationChange>=0?"increased":"decreased"} by <b>{correlationChange>=0?"+":""}{correlationChange.toFixed(2)}</b>. Open the full matrix to see which security pairs drove the change.</p><button onClick={()=>onExploreCorrelations(analytics.startDate,analytics.endDate)}>Explore these correlations →</button></div></article>
    <article className="panel event-decomposition"><PanelTitle title="Factor and idiosyncratic decomposition" meta="Cumulative through each trading day · exact reconciliation"/><DecompositionChart decomposition={decomposition}/></article>
    <article className="panel event-positions"><PanelTitle title="Portfolio position P&L" meta="All priced positions · sorted by absolute contribution"/>{positions.map(position=><div className="event-position-row" key={position.ticker}><button onClick={()=>onSelectTicker(position.ticker)}>{position.ticker}<span>Analyze →</span></button><div><i className={position.pnl<0?"loss":"gain"} style={{width:`${Math.abs(position.pnl)/maxPosition*100}%`}}/></div><strong className={position.pnl<0?"down":"up"}>{signedMoney(position.pnl)}</strong><em>{pct(position.return*100)}</em></div>)}</article>
    <div className="event-side-stack"><article className="panel"><PanelTitle title="Drawdown path" meta="Decline from prior portfolio peak"/><DrawdownChart analytics={analytics}/></article><article className="panel worst-days"><PanelTitle title="Worst trading days" meta="Current portfolio replay"/>{worstDays.map((day,index)=><div key={day.date}><span>{index+1}</span><b>{day.date}</b><strong>{pct(day.value*100)}</strong><em>{signedMoney(day.pnl)}</em></div>)}</article></div>
  </section>;
}

function EventControls({presetId,selectPreset,startDate,endDate,setStartDate,setEndDate,payload}:{presetId:string;selectPreset:(id:string)=>void;startDate:string;endDate:string;setStartDate:(value:string)=>void;setEndDate:(value:string)=>void;payload:MarketPayload}){
  const minimum=payload.series.SPY?.points[0]?.date??"";const maximum=payload.asOf??payload.series.SPY?.points.at(-1)?.date??"";
  return <div className="event-control-grid"><label><span>EVENT PRESET</span><select value={presetId} onChange={event=>selectPreset(event.target.value)}>{eventPresets.map(preset=><option key={preset.id} value={preset.id}>{preset.label}</option>)}<option value="custom">Custom period</option></select></label><label><span>FROM</span><input type="date" min={minimum} max={endDate||maximum} value={startDate} onChange={event=>{setPresetIdSafe(selectPreset);setStartDate(event.target.value)}}/></label><i>→</i><label><span>TO</span><input type="date" min={startDate||minimum} max={maximum} value={endDate} onChange={event=>{setPresetIdSafe(selectPreset);setEndDate(event.target.value)}}/></label></div>;
}

function setPresetIdSafe(selectPreset:(id:string)=>void){selectPreset("custom")}

function RiskWorkspace({ tab, model, total, holdings, analytics, payload, onSelectTicker }: { tab:"Factors"|"Positions"|"Correlations"; setTab:(tab:"Factors"|"Positions"|"Correlations")=>void; model:FactorModelAnalytics; total:number; holdings:Holding[]; analytics:PortfolioAnalytics; payload:MarketPayload; onSelectTicker:(ticker:string)=>void }) {return <>{tab==="Factors"&&<FactorRisk model={model} total={total}/>} {tab==="Positions"&&<PositionRisk holdings={holdings} total={total} analytics={analytics} onSelectTicker={onSelectTicker}/>} {tab==="Correlations"&&<CorrelationAnalysis payload={payload} holdings={holdings} startDate={analytics.startDate} endDate={analytics.endDate}/>}</>}

function PerformanceWorkspace({ tab, total, analytics, model, payload, holdings, onSelectTicker, onExploreCorrelations }: { tab:"Overview"|"Event Analysis"; setTab:(tab:"Overview"|"Event Analysis")=>void; total:number; analytics:PortfolioAnalytics; model:FactorModelAnalytics; payload:MarketPayload; holdings:Holding[]; onSelectTicker:(ticker:string)=>void; onExploreCorrelations:(startDate:string,endDate:string)=>void }) {return <>{tab==="Overview"?<Performance total={total} analytics={analytics} model={model} onSelectTicker={onSelectTicker}/>:<EventAnalysis payload={payload} holdings={holdings} total={total} onSelectTicker={onSelectTicker} onExploreCorrelations={onExploreCorrelations}/>}</>}

function StrategyExposureChart({ strategy, targetVolatility, targetBeta }: { strategy: StrategyBacktestAnalytics; targetVolatility: number; targetBeta: number }) {
  const points=strategy.exposures;
  if(!points.length)return <div className="correlation-empty">Not enough point-in-time observations.</div>;
  const width=1000;const height=310;const left=55;const right=25;const plotWidth=width-left-right;
  const volatilityValues=points.map(point=>point.estimatedVolatility*100);const betaValues=points.map(point=>point.beta);
  const volatilityMin=Math.min(...volatilityValues,targetVolatility*100)*.88;const volatilityMax=Math.max(...volatilityValues,targetVolatility*100)*1.12;
  const betaMin=Math.min(...betaValues,targetBeta)-.08;const betaMax=Math.max(...betaValues,targetBeta)+.08;
  const x=(index:number)=>left+index/Math.max(points.length-1,1)*plotWidth;
  const scale=(value:number,min:number,max:number,top:number,bottom:number)=>bottom-(value-min)/Math.max(max-min,.001)*(bottom-top);
  const volatilityPath=points.map((point,index)=>`${x(index)},${scale(point.estimatedVolatility*100,volatilityMin,volatilityMax,35,130)}`).join(" ");
  const betaPath=points.map((point,index)=>`${x(index)},${scale(point.beta,betaMin,betaMax,185,280)}`).join(" ");
  const dateIndexes=[...new Set(Array.from({length:7},(_,index)=>Math.round(index*(points.length-1)/6)))];
  return <div className="strategy-exposure-chart"><div className="strategy-chart-legend"><span><i className="risk-line"/>Estimated annual risk</span><span><i className="beta-line"/>Estimated market beta</span><em>Targets shown as dashed lines</em></div><svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Point-in-time estimated volatility and market beta"><line className="strategy-divider" x1={left} y1="155" x2={width-right} y2="155"/><line className="strategy-target risk-target" x1={left} y1={scale(targetVolatility*100,volatilityMin,volatilityMax,35,130)} x2={width-right} y2={scale(targetVolatility*100,volatilityMin,volatilityMax,35,130)}/><line className="strategy-target beta-target" x1={left} y1={scale(targetBeta,betaMin,betaMax,185,280)} x2={width-right} y2={scale(targetBeta,betaMin,betaMax,185,280)}/><polyline className="strategy-risk-path" points={volatilityPath}/><polyline className="strategy-beta-path" points={betaPath}/><text x="8" y="45">RISK</text><text x="8" y="195">BETA</text><text x={width-right} y={scale(targetVolatility*100,volatilityMin,volatilityMax,35,130)-5} textAnchor="end">{(targetVolatility*100).toFixed(0)}% target</text><text x={width-right} y={scale(targetBeta,betaMin,betaMax,185,280)-5} textAnchor="end">{targetBeta.toFixed(2)} target</text>{dateIndexes.map(index=><text className="strategy-date" key={index} x={x(index)} y="306" textAnchor={index===0?"start":index===points.length-1?"end":"middle"}>{new Date(`${points[index].date}T00:00:00Z`).toLocaleDateString("en-US",{month:"short",year:"2-digit",timeZone:"UTC"})}</text>)}</svg></div>;
}

function StrategyAnalysis({ strategy, total, frequency, setFrequency, targetVolatility, setTargetVolatility, targetBeta, setTargetBeta, maxPosition, setMaxPosition }: { strategy:StrategyBacktestAnalytics|null; total:number; frequency:StrategyRebalanceFrequency; setFrequency:(value:StrategyRebalanceFrequency)=>void; targetVolatility:number; setTargetVolatility:(value:number)=>void; targetBeta:number; setTargetBeta:(value:number)=>void; maxPosition:number; setMaxPosition:(value:number)=>void }) {
  if(!strategy)return <DataUnavailable/>;
  const targetRiskGap=strategy.averageEstimatedVolatility-targetVolatility;const targetBetaGap=strategy.averageEstimatedBeta-targetBeta;
  const binding=Math.abs(targetRiskGap)>.018||Math.abs(targetBetaGap)>.12;
  const sharpeVsStatic=strategy.sharpeRatio-strategy.staticSharpeRatio;
  const sharpeVsBenchmark=strategy.sharpeRatio-strategy.benchmarkSharpeRatio;
  const recentRebalances=strategy.rebalances.slice(-10).reverse();
  return <section className="strategy-layout">
    <article className="panel strategy-controls"><PanelTitle title="Risk-targeted mock strategy" meta="CM-IEWMA covariance · point-in-time construction"/><div className="strategy-control-body"><label><span>REBALANCE</span><div className="segmented"><button className={frequency==="Weekly"?"on":""} onClick={()=>setFrequency("Weekly")}>Weekly</button><button className={frequency==="Monthly"?"on":""} onClick={()=>setFrequency("Monthly")}>Monthly</button></div></label><label className="strategy-slider"><span><b>Annual risk target</b><strong>{(targetVolatility*100).toFixed(0)}%</strong></span><input aria-label="Annual risk target" type="range" min="8" max="25" step="1" value={targetVolatility*100} onChange={event=>setTargetVolatility(Number(event.target.value)/100)}/></label><label className="strategy-slider"><span><b>S&amp;P 500 beta target</b><strong>{targetBeta.toFixed(2)}</strong></span><input aria-label="S&amp;P 500 beta target" type="range" min="0.10" max="1.30" step="0.05" value={targetBeta} onChange={event=>setTargetBeta(Number(event.target.value))}/></label><label className="strategy-slider"><span><b>Maximum position</b><strong>{(maxPosition*100).toFixed(0)}%</strong></span><input aria-label="Maximum position" type="range" min="1" max="35" step="1" value={maxPosition*100} onChange={event=>setMaxPosition(Number(event.target.value)/100)}/></label></div><div className="strategy-assumptions"><span><b>5 IEWMA</b> dynamic experts</span><span><b>126 days</b> market beta</span><span><b>10 bps</b> per unit of turnover</span><span><b>Next session</b> implementation</span></div></article>
    <article className={`panel strategy-target-status ${binding?"binding":""}`}><PanelTitle title="Target feasibility" meta="Average ex-ante estimates"/><div className="strategy-target-grid"><div><span>REQUESTED RISK</span><strong>{(targetVolatility*100).toFixed(1)}%</strong><em>Average achieved {(strategy.averageEstimatedVolatility*100).toFixed(1)}%</em></div><div><span>REQUESTED BETA</span><strong>{targetBeta.toFixed(2)}</strong><em>Average achieved {strategy.averageEstimatedBeta.toFixed(2)}</em></div></div><p>{binding?"The requested combination was not always attainable under the long-only, no-leverage and maximum-position constraints. The backtest reports the closest feasible portfolio rather than silently adding leverage.":"The constructed portfolio remained close to both requested risk targets on average. Realized outcomes can still differ from the trailing estimates."}</p></article>
    <section className="metrics strategy-metrics"><Metric label="STRATEGY RETURN" value={pct(strategy.totalReturn*100)} sub={`${money(total*strategy.totalReturn)} after estimated costs`} tone="cyan"/><Metric label="REALIZED VOLATILITY" value={`${(strategy.annualVolatility*100).toFixed(1)}%`} sub={`Target ${(targetVolatility*100).toFixed(0)}%`} tone="amber"/><Metric label="REALIZED BETA" value={strategy.beta.toFixed(2)} sub={`Target ${targetBeta.toFixed(2)}`}/><Metric label="SHARPE RATIO" value={strategy.sharpeRatio.toFixed(2)} sub="Annualized · 0% risk-free rate" tone="cyan"/><Metric label="MAX DRAWDOWN" value={pct(strategy.maxDrawdown*100)} sub={`${strategy.startDate} — ${strategy.endDate}`} tone="red"/><Metric label="TOTAL TURNOVER" value={`${(strategy.totalTurnover*100).toFixed(0)}%`} sub={`${money(strategy.transactionCosts)} estimated cost`}/></section>
    <article className="panel strategy-sharpe"><PanelTitle title="Risk-adjusted performance" meta="Annualized Sharpe · same window · 0% risk-free rate"/><div className="strategy-sharpe-grid"><div className="primary"><span>RISK-TARGETED STRATEGY</span><strong>{strategy.sharpeRatio.toFixed(2)}</strong><em>Net of estimated trading costs</em></div><div><span>STATIC CURRENT PORTFOLIO</span><strong>{strategy.staticSharpeRatio.toFixed(2)}</strong><em className={sharpeVsStatic>=0?"positive":"negative"}>{sharpeVsStatic>=0?"+":""}{sharpeVsStatic.toFixed(2)} strategy difference</em></div><div><span>S&amp;P 500</span><strong>{strategy.benchmarkSharpeRatio.toFixed(2)}</strong><em className={sharpeVsBenchmark>=0?"positive":"negative"}>{sharpeVsBenchmark>=0?"+":""}{sharpeVsBenchmark.toFixed(2)} strategy difference</em></div></div><p>Sharpe measures average daily excess return per unit of daily volatility, annualized over this backtest. Cash is assumed to earn 0%, so treat the comparison as a transparent diagnostic rather than a claim about expected performance.</p></article>
    <article className="panel strategy-performance"><PanelTitle title="Point-in-time strategy backtest" meta={`${frequency.toLowerCase()} rebalancing · net of estimated costs`}/><PerformanceChart portfolio={strategy.curve} benchmark={strategy.staticCurve} tertiary={strategy.benchmarkCurve} dates={strategy.dates} startDate={strategy.startDate} endDate={strategy.endDate} large primaryLabel="Risk-targeted strategy" secondaryLabel="Static current portfolio" tertiaryLabel="S&P 500" definition="Growth of $1 using only information available before each rebalance. Target weights become effective on the following session; positions drift between rebalances. The static comparison applies today’s portfolio weights across the same period."/></article>
    <article className="panel strategy-exposures"><PanelTitle title="Risk exposure through time" meta={`Ex-ante estimates · ${strategy.covarianceModel}`}/><StrategyExposureChart strategy={strategy} targetVolatility={targetVolatility} targetBeta={targetBeta}/><p>Covariance and beta are estimated using information available before the trading session. Exposure changes after each rebalance and then drifts with security returns until the next rebalance; realized risk can differ from the forecast.</p></article>
    <article className="panel strategy-rebalances"><PanelTitle title="Recent rebalance decisions" meta={`${strategy.rebalances.length} total rebalances · open a row for exact weights`}/><div className="strategy-log-head"><span>DATE</span><span>EST. RISK</span><span>BETA</span><span>INVESTED</span><span>TURNOVER</span><span>LARGEST</span></div>{recentRebalances.map(item=><details className="strategy-rebalance-detail" key={item.date}><summary className="strategy-log-row"><b>{item.date}</b><span>{(item.estimatedVolatility*100).toFixed(1)}%</span><span>{item.beta.toFixed(2)}</span><span>{(item.investedWeight*100).toFixed(1)}%</span><span>{(item.turnover*100).toFixed(1)}%</span><strong>{item.largestPosition}<em>{(item.largestWeight*100).toFixed(1)}%</em></strong></summary><div className="rebalance-weight-grid">{item.weights.map(weight=><div key={weight.ticker}><strong>{weight.ticker}</strong><i><b style={{width:`${Math.min(100,weight.weight/Math.max(maxPosition,.01)*100)}%`}}/></i><span>{(weight.weight*100).toFixed(2)}%</span></div>)}<div className="cash"><strong>CASH</strong><span>{Math.max(0,(1-item.investedWeight)*100).toFixed(2)}%</span></div></div></details>)}</article>
    <article className="panel strategy-allocation"><PanelTitle title="Ending strategy allocation" meta={`Actual weights after final market drift · average invested ${(strategy.averageInvestedWeight*100).toFixed(1)}%`}/>{strategy.finalWeights.map(item=><div className="strategy-weight-row" key={item.ticker}><strong>{item.ticker}</strong><div><i style={{width:`${Math.min(100,item.weight/Math.max(maxPosition,.01)*100)}%`}}/></div><span>{(item.weight*100).toFixed(1)}%</span></div>)}<div className="strategy-cash-row"><strong>CASH</strong><span>{Math.max(0,(1-strategy.finalWeights.reduce((sum,item)=>sum+item.weight,0))*100).toFixed(1)}%</span></div><p className="allocation-audit-note">The Sharpe ratio is generated by the full sequence of point-in-time allocations—not this final snapshot. Open any rebalance row to inspect the weights used from that date forward.</p></article>
    <article className="panel strategy-method"><PanelTitle title="What this test does" meta="Transparent standard configuration"/><ol><li><b>Forecast covariance</b><span>Five IEWMA experts are combined from their preceding 10-session predictive likelihood; the fastest expert receives 5% diagonal regularization.</span></li><li><b>Estimate beta</b><span>Market betas use the preceding 126 sessions.</span></li><li><b>Construct</b><span>A long-only portfolio seeks the requested volatility and beta while limiting turnover and concentration; weights apply next session.</span></li><li><b>Account</b><span>Returns are shown after a 10 bps turnover cost. The covariance forecast contains no expected-return signal.</span></li></ol><p className="method-source">CM-IEWMA implementation follows Johansson, Ogut, Pelger, Schmelzer and Boyd, <a href="https://github.com/cvxgrp/cov_pred_finance" target="_blank" rel="noreferrer">A Simple Method for Predicting Covariance Matrices of Financial Returns</a>.</p></article>
  </section>;
}

export default function Home() {
  const [view, setView] = useState<View>("Overview");
  const [demoKey,setDemoKey]=useState<DemoKey>("equity");
  const [holdings, setHoldings] = useState(equitySeed);
  const [baselineHoldings, setBaselineHoldings] = useState(equitySeed);
  const [editing, setEditing] = useState(false);
  const [marketShock, setMarketShock] = useState(-10);
  const [techShock, setTechShock] = useState(-8);
  const [scenarioMode, setScenarioMode] = useState<"Modelled shock" | "Historical replay">("Modelled shock");
  const [analysisStart, setAnalysisStart] = useState("");
  const [analysisEnd, setAnalysisEnd] = useState("");
  const [marketData, setMarketData] = useState<MarketPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [portfolioError,setPortfolioError]=useState<string|null>(null);
  const [portfolioSource,setPortfolioSource]=useState<"demo"|"uploaded">("demo");
  const [portfolioName,setPortfolioName]=useState("US Equity Portfolio");
  const [selectedTicker,setSelectedTicker]=useState<string|null>(null);
  const [addingSecurity,setAddingSecurity]=useState(false);
  const [securitySearch,setSecuritySearch]=useState("");
  const [riskTab,setRiskTab]=useState<"Factors"|"Positions"|"Correlations">("Factors");
  const [performanceTab,setPerformanceTab]=useState<"Overview"|"Event Analysis">("Overview");
  const [strategyFrequency,setStrategyFrequency]=useState<StrategyRebalanceFrequency>("Monthly");
  const [strategyTargetVolatility,setStrategyTargetVolatility]=useState(.15);
  const [strategyTargetBeta,setStrategyTargetBeta]=useState(.90);
  const [strategyMaxPosition,setStrategyMaxPosition]=useState(.20);
  const [executionCostBps,setExecutionCostBps]=useState(5);
  const [shortBorrowRate,setShortBorrowRate]=useState(1);
  const editorRef=useRef<HTMLDivElement|null>(null);

  const total = holdings.reduce((s, h) => s + h.value, 0);
  const baselineTotal = baselineHoldings.reduce((s, h) => s + h.value, 0);
  const invested = holdings.filter(h => h.ticker !== "CASH").reduce((s, h) => s + h.value, 0);
  const longExposure=holdings.filter(h=>h.ticker!=="CASH").reduce((sum,h)=>sum+Math.max(0,h.value),0);
  const shortExposure=holdings.filter(h=>h.ticker!=="CASH").reduce((sum,h)=>sum+Math.max(0,-h.value),0);
  const grossExposure=longExposure+shortExposure;
  const hasShort=shortExposure>.5;
  const analysisWindow = useMemo(() => ({ startDate: analysisStart || undefined, endDate: analysisEnd || undefined }), [analysisStart, analysisEnd]);
  const analytics = useMemo(() => marketData ? buildAnalytics(marketData, holdings, analysisWindow) : null, [marketData, holdings, analysisWindow]);
  const baselineAnalytics = useMemo(() => marketData ? buildAnalytics(marketData, baselineHoldings, analysisWindow) : null, [marketData, baselineHoldings, analysisWindow]);
  const factorModel = useMemo(() => marketData && analytics ? buildFactorModel(marketData, analytics, total) : null, [marketData, analytics, total]);
  const portfolioDecomposition = useMemo(() => marketData && analytics ? buildPortfolioDecomposition(marketData, analytics) : null, [marketData, analytics]);
  const baselineFactorModel = useMemo(() => marketData && baselineAnalytics ? buildFactorModel(marketData, baselineAnalytics, baselineTotal) : null, [marketData, baselineAnalytics, baselineTotal]);
  const strategyAnalytics = useMemo(() => marketData && !hasShort ? buildRiskTargetStrategy(marketData, holdings, { frequency: strategyFrequency, targetVolatility: strategyTargetVolatility, targetBeta: strategyTargetBeta, maxPosition: strategyMaxPosition, startDate: analysisStart || undefined, endDate: analysisEnd || undefined, lookback: 126, transactionCostBps: 10 }) : null, [marketData, holdings, hasShort, strategyFrequency, strategyTargetVolatility, strategyTargetBeta, strategyMaxPosition, analysisStart, analysisEnd]);
  const selectedHolding = useMemo(() => holdings.find((holding) => holding.ticker === selectedTicker) ?? null, [holdings, selectedTicker]);
  const securityAnalytics = useMemo(() => marketData && analytics && selectedTicker ? buildSecurityDrilldown(marketData, analytics, selectedTicker) : null, [marketData, analytics, selectedTicker]);
  const missingHoldings=marketData?.missingHoldings??[];
  const liveBetas = new Map(analytics?.positions.map((position) => [position.ticker, position.beta]) ?? []);
  const scenarioImpact = holdings.reduce((s, h) => {
    const market = h.value * (liveBetas.get(h.ticker) ?? h.beta) * marketShock / 100;
    const technology = h.sector === "Technology" ? h.value * techShock / 100 * 0.62 : 0;
    return s + market + technology;
  }, 0);

  const tickerKey = [...new Set([...holdings, ...baselineHoldings].map((holding) => holding.ticker))].join("|");
  const loadMarketData = useCallback(async () => {
    setLoading(true); setDataError(null);
    try {
      const response = await fetch("/api/market-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tickers: tickerKey.split("|").filter(Boolean), years: 10 }) });
      const payload = await response.json() as MarketPayload;
      if (!response.ok || payload.error) throw new Error(payload.error || "Market data request failed.");
      const availableEnd = payload.asOf || payload.series.SPY?.points.at(-1)?.date || "";
      const availableStart = payload.factorStartDate || payload.series.SPY?.points[0]?.date || "";
      const defaultStartDate = new Date(`${availableEnd}T00:00:00Z`);
      defaultStartDate.setUTCFullYear(defaultStartDate.getUTCFullYear() - 3);
      const defaultStart = defaultStartDate.toISOString().slice(0,10);
      setAnalysisEnd((current) => current && current <= availableEnd ? current : availableEnd);
      setAnalysisStart((current) => current && current >= availableStart ? current : (defaultStart < availableStart ? availableStart : defaultStart));
      setMarketData(payload);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Unable to load Yahoo Finance data.");
    } finally { setLoading(false); }
  }, [tickerKey]);

  // Synchronize the current ticker set with the external market-data service.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadMarketData(); }, [loadMarketData]);
  useEffect(() => {
    if (!selectedTicker || view === "Security Analysis") return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setSelectedTicker(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedTicker, view]);
  useEffect(() => {
    if(!editing)return;
    const frame=requestAnimationFrame(()=>editorRef.current?.scrollIntoView({behavior:"smooth",block:"start"}));
    return()=>cancelAnimationFrame(frame);
  },[editing]);

  function applySecurityValue(items: Holding[], ticker: string, requestedValue: number) {
    if(ticker==="CASH")return items;
    const targetValue=Number.isFinite(requestedValue)?requestedValue:0;
    const currentValue=items.find(item=>item.ticker===ticker)?.value??0;
    const delta=targetValue-currentValue;
    const hasCash=items.some(item=>item.ticker==="CASH");
    const next=items.map(item=>item.ticker===ticker?{...item,value:targetValue}:item.ticker==="CASH"?{...item,value:item.value-delta}:item);
    return hasCash?next:[...next,{ticker:"CASH",name:"Cash (residual)",sector:"Cash",value:-delta,beta:0,vol:0,risk:0}];
  }
  function updateValue(ticker: string, value: number) { setHoldings(items=>applySecurityValue(items,ticker,value)); }
  function updateWeight(ticker: string, percent: number) { setHoldings(items => {
    const portfolioTotal=items.reduce((sum,item)=>sum+item.value,0); if(portfolioTotal<=0)return items;
    const targetWeight=(Number.isFinite(percent)?percent:0)/100;
    return applySecurityValue(items,ticker,portfolioTotal*targetWeight);
  }); }
  function normalizeInvested(){setHoldings(items=>{const portfolioTotal=items.reduce((sum,item)=>sum+item.value,0);const securities=items.filter(item=>item.ticker!=="CASH");const signed=securities.reduce((sum,item)=>sum+item.value,0);const gross=securities.reduce((sum,item)=>sum+Math.abs(item.value),0);const containsShort=securities.some(item=>item.value<0);if(portfolioTotal<=0)return items;if(containsShort){if(gross<=0)return items;const scale=portfolioTotal*2/gross;const scaled=securities.map(item=>({...item,value:item.value*scale}));const net=scaled.reduce((sum,item)=>sum+item.value,0);return [...scaled,{ticker:"CASH",name:"Cash and collateral",sector:"Cash",value:portfolioTotal-net,beta:0,vol:0,risk:0}]}if(signed<=0)return items;const scale=portfolioTotal/signed;return items.map(item=>item.ticker==="CASH"?{...item,value:0}:{...item,value:item.value*scale})})}
  function updateTicker(previous: string, ticker: string) { const next=ticker.toUpperCase().trim(); if(next) setHoldings(items=>items.map(item=>item.ticker===previous?{...item,ticker:next,name:item.name===previous?next:item.name}:item)); }
  function updateName(ticker: string, name: string) { setHoldings(items=>items.map(item=>item.ticker===ticker?{...item,name:name.trim()||ticker}:item)); }
  function remove(ticker: string) { if(ticker==="CASH")return;setHoldings(items=>{const removed=items.find(item=>item.ticker===ticker)?.value??0;const remaining=items.filter(item=>item.ticker!==ticker);return remaining.some(item=>item.ticker==="CASH")?remaining.map(item=>item.ticker==="CASH"?{...item,value:item.value+removed}:item):[...remaining,{ticker:"CASH",name:"Cash (residual)",sector:"Cash",value:removed,beta:0,vol:0,risk:0}]}); }
  function addSecurity(rawTicker:string) {const ticker=rawTicker.trim().toUpperCase();if(!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)){setPortfolioError("Enter a valid US ticker symbol.");return}if(holdings.some(item=>item.ticker===ticker)){setPortfolioError(`${ticker} is already in the portfolio.`);return}const match=stockCatalog.find(item=>item[0]===ticker);const added:Holding={ticker,name:match?.[1]??ticker,sector:match?.[2]??"Unclassified",value:0,beta:1,vol:25,risk:2};setHoldings(items=>[...items.filter(item=>item.ticker!=="CASH"),added,...items.filter(item=>item.ticker==="CASH")]);setAddingSecurity(false);setSecuritySearch("");setPortfolioError(null)}
  function saveBaseline(){setBaselineHoldings(holdings.map(item=>({...item})));}
  function loadDemo(key:DemoKey){const next=key==="market-neutral"?marketNeutralSeed:equitySeed;setDemoKey(key);setHoldings(next.map(item=>({...item})));setBaselineHoldings(next.map(item=>({...item})));setPortfolioSource("demo");setPortfolioName(key==="market-neutral"?"Market-Neutral Stock Selection":"US Equity Portfolio");setPortfolioError(null);setSelectedTicker(null)}
  function resetDemo(){loadDemo(demoKey)}
  function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = () => {
      try{const lines=String(reader.result).trim().split(/\r?\n/).filter(Boolean);const header=lines[0]?.split(",").map(value=>value.trim().toLowerCase());const tickerIndex=header?.indexOf("ticker")??-1;const valueIndex=header?.indexOf("market_value")??-1;if(tickerIndex<0||valueIndex<0)throw new Error("CSV requires ticker and market_value columns.");const parsed=lines.slice(1).map((line,i)=>{const row=line.split(",");const ticker=(row[tickerIndex]||"").trim().toUpperCase();const value=Number((row[valueIndex]||"").replace(/[$\s]/g,""));if(!ticker||!Number.isFinite(value))throw new Error(`Invalid row ${i+2}.`);return {ticker,name:ticker,sector:ticker==="CASH"?"Cash":"Unclassified",value,beta:1,vol:25,risk:Math.max(1,12-i)}});if(!parsed.length)throw new Error("CSV contains no portfolio rows.");const portfolio=parsed.some(item=>item.ticker==="CASH")?parsed:[...parsed,{ticker:"CASH",name:"Cash (residual)",sector:"Cash",value:0,beta:0,vol:0,risk:0}];setHoldings(portfolio);setBaselineHoldings(portfolio.map(item=>({...item})));setEditing(true);setPortfolioSource("uploaded");setPortfolioName(file.name.replace(/\.csv$/i,""));setPortfolioError(null)}catch(error){setPortfolioError(error instanceof Error?error.message:"Unable to read CSV.")}
    }; reader.readAsText(file);
  }

  function openEventCorrelations(startDate:string,endDate:string){setAnalysisStart(startDate);setAnalysisEnd(endDate);setRiskTab("Correlations");setView("Risk Analysis")}
  const availableStartDate = marketData?.factorStartDate ?? marketData?.series.SPY?.points[0]?.date ?? "";
  const availableEndDate = marketData?.asOf ?? marketData?.series.SPY?.points.at(-1)?.date ?? "";
  const viewCopy: Record<View, [string, string]> = {
    "Overview": ["See what is driving the portfolio", "Separate performance associated with market, style and sector factors from the idiosyncratic return that remains."],
    "Compare": ["Portfolio comparison", "Compare the current portfolio with its saved baseline across allocation, risk, factors and historical performance."],
    "Strategy Analysis": ["Strategy analysis", "Test a point-in-time portfolio that rebalances toward explicit risk targets."],
    "Risk Analysis": ["Risk analysis", "Understand factor exposure, position-level risk and changing correlations in one workspace."],
    "Security Analysis": ["Security analysis", "Select a holding to examine its return decomposition, factor loadings and relationship to the current portfolio."],
    "Performance": ["Performance analysis", "Review observed returns, historical events and factor-driven performance attribution."],
    "Scenario Lab": ["Scenario lab", "Stress the portfolio with explicit assumptions or observed historical periods."],
    "Methodology": ["Methodology", "Transparent inputs, explainable models and clearly defined limits."],
    "Project Brief": ["Project brief", "The problem, product decisions and quantitative framework behind FactorScope."],
  };
  const primarySection = view === "Overview" || view === "Performance" ? "Portfolio" : view === "Risk Analysis" || view === "Security Analysis" ? "Risk & Attribution" : view === "Compare" || view === "Strategy Analysis" || view === "Scenario Lab" ? "Strategy Lab" : "About";
  const portfolioTab = view === "Performance" ? performanceTab === "Event Analysis" ? "Events" : "Performance" : "Overview";
  const analysisTab = view === "Security Analysis" ? "Security" : riskTab;
  const strategyTab = view === "Compare" ? "Compare" : view === "Strategy Analysis" ? "Dynamic Strategy" : "Scenarios";
  const aboutTab = view === "Project Brief" ? "Project Brief" : "Methodology";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brandmark">F</span><span>FactorScope</span><em>PORTFOLIO INTELLIGENCE</em></div>
        <div className="top-meta"><span className={`live-dot ${dataError ? "error-dot" : missingHoldings.length ? "warning-dot" : ""}`} /> {loading ? "Loading Yahoo data" : dataError ? "Data connection issue" : missingHoldings.length ? `${missingHoldings.length} ticker${missingHoldings.length>1?"s":""} unavailable` : `Yahoo Finance · through ${marketData?.asOf ?? "latest"}`} <b>•</b> Daily adjusted <div className="avatar">FS</div></div>
      </header>

      <aside className="sidebar">
        <section className="portfolio-card">
          <div className="eyebrow">CURRENT PORTFOLIO</div>
          <label className="portfolio-switcher"><span>DEMO</span><select value={portfolioSource==="demo"?demoKey:"uploaded"} onChange={event=>event.target.value!=="uploaded"&&loadDemo(event.target.value as DemoKey)}><option value="equity">US Equity Portfolio</option><option value="market-neutral">Market-Neutral Stock Selection</option>{portfolioSource==="uploaded"&&<option value="uploaded">Uploaded portfolio</option>}</select></label>
          <div className="portfolio-name"><strong>{portfolioName}</strong></div>
          <div className="demo-badge">{portfolioSource==="demo"?"DEMO PORTFOLIO":"UPLOADED PORTFOLIO"}</div>
          <div className="portfolio-total">{money(total)}</div><div className="muted">{holdings.filter(h => h.ticker !== "CASH").length} positions · USD{hasShort?` · ${(grossExposure/Math.max(total,1)*100).toFixed(0)}% gross`:""}</div>
          <button className="edit-btn" onClick={() => setEditing(current=>!current)}>{editing ? "Close editor" : "Edit portfolio"}</button>
        </section>
        <nav className="primary-navigation" aria-label="Primary navigation">
          <button onClick={()=>setView("Overview")} className={primarySection==="Portfolio"?"active":""}><Icon name="grid"/><span><b>Portfolio</b><small>Overview, performance &amp; events</small></span></button>
          <button onClick={()=>{setView("Risk Analysis");setRiskTab("Factors")}} className={primarySection==="Risk & Attribution"?"active":""}><Icon name="factor"/><span><b>Risk &amp; Attribution</b><small>Factors, positions &amp; correlation</small></span></button>
          <button onClick={()=>setView("Compare")} className={primarySection==="Strategy Lab"?"active":""}><Icon name="strategy"/><span><b>Strategy Lab</b><small>Compare, construct &amp; stress</small></span></button>
          <button onClick={()=>setView("Methodology")} className={primarySection==="About"?"active":""}><Icon name="method"/><span><b>About</b><small>Methodology &amp; project brief</small></span></button>
        </nav>
        <section className="sidebar-actions">
          <label className="upload"><Icon name="upload" /> Upload CSV<input type="file" accept=".csv" onChange={upload} /></label>
          <button onClick={resetDemo}><Icon name="reset" /> Reset demo</button>
        </section>
        <section className="model-card"><div className="eyebrow">MODEL</div><strong>ETF Proxy Factor Model</strong><span>Custom date range · daily</span><span className={dataError ? "model-error" : "healthy"}>{dataError ? "● Data unavailable" : loading ? "● Refreshing" : "● Live data ready"}</span></section>
        <p className="sidebar-note">Prototype market data is supplied by Yahoo Finance. Factor and scenario sensitivities are estimates, not forecasts.</p>
      </aside>

      <section className="workspace">
        {editing && <div className="editor-panel" ref={editorRef}>
          <div className="panel-head"><div><span className="kicker">PORTFOLIO BUILDER</span><h2>Edit positions</h2></div><div className="panel-actions"><button className="secondary-action" onClick={saveBaseline}>Save current as baseline</button><button className="secondary-action" onClick={normalizeInvested}>{hasShort?"Normalize to 200% gross":"Normalize invested to 100%"}</button><button onClick={()=>setAddingSecurity(current=>!current)}><Icon name="plus" /> Add security</button></div></div>
          {addingSecurity&&<div className="security-picker"><label><span>SEARCH BY TICKER OR COMPANY</span><input autoFocus value={securitySearch} onChange={event=>setSecuritySearch(event.target.value)} onKeyDown={event=>{if(event.key==="Enter")addSecurity(securitySearch)}} placeholder="Try META, Broadcom or JPMorgan"/></label><div className="security-picker-results">{stockCatalog.filter(item=>!holdings.some(holding=>holding.ticker===item[0])&&(!securitySearch.trim()||`${item[0]} ${item[1]}`.toLowerCase().includes(securitySearch.trim().toLowerCase()))).slice(0,8).map(item=><button key={item[0]} onClick={()=>addSecurity(item[0])}><strong>{item[0]}</strong><span>{item[1]}</span><em>{item[2]}</em></button>)}{securitySearch.trim()&&!stockCatalog.some(item=>item[0]===securitySearch.trim().toUpperCase())&&<button className="add-custom-security" onClick={()=>addSecurity(securitySearch)}><strong>ADD {securitySearch.trim().toUpperCase()}</strong><span>Use typed Yahoo Finance ticker</span><em>Verify after loading</em></button>}</div></div>}
          <div className="editor-grid"><span>TICKER</span><span>NAME</span><span>MARKET VALUE</span><span>WEIGHT</span><span />
            {holdings.map((h,index) => {const isCash=h.ticker==="CASH";return <div className={`edit-row ${isCash?"cash-row":""}`} key={`${h.ticker}-${index}`}><input className="ticker-input" defaultValue={h.ticker} disabled={isCash} onBlur={e=>updateTicker(h.ticker,e.target.value)}/><input className="name-input" value={isCash?(hasShort?"Cash and collateral":"Cash (residual)"):h.name} disabled={isCash} onChange={e=>updateName(h.ticker,e.target.value)}/><label>$ <input value={Math.round(h.value*100)/100} readOnly={isCash} onChange={e => updateValue(h.ticker, Number(e.target.value))} /></label><label className="weight-field"><input key={`${h.ticker}-${(h.value/Math.max(total,1)).toFixed(6)}`} value={isCash?(h.value/Math.max(total,1)*100).toFixed(2):undefined} defaultValue={isCash?undefined:(h.value / Math.max(total,1) * 100).toFixed(2)} readOnly={isCash} onBlur={e=>updateWeight(h.ticker,Number(e.target.value))} onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur()}} aria-label={`${h.ticker} portfolio weight`}/><span>%</span></label><button aria-label={`Remove ${h.ticker}`} disabled={isCash} onClick={() => remove(h.ticker)}>×</button></div>})}
          </div>{hasShort?<><div className="allocation-summary exposure-summary"><span><b>LONG</b>{(longExposure/Math.max(total,1)*100).toFixed(1)}%</span><span><b>SHORT</b>{(shortExposure/Math.max(total,1)*100).toFixed(1)}%</span><span><b>GROSS</b>{(grossExposure/Math.max(total,1)*100).toFixed(1)}%</span><span><b>NET</b>{(invested/Math.max(total,1)*100).toFixed(1)}%</span><span><b>CASH / COLLATERAL</b>{money(total-invested)}</span></div><div className="cost-assumptions"><label><span>EXECUTION COST</span><input type="number" min="0" step="1" value={executionCostBps} onChange={event=>setExecutionCostBps(Math.max(0,Number(event.target.value)||0))}/><b>bps</b></label><label><span>SHORT BORROW</span><input type="number" min="0" step=".1" value={shortBorrowRate} onChange={event=>setShortBorrowRate(Math.max(0,Number(event.target.value)||0))}/><b>% p.a.</b></label></div></>:<div className="allocation-summary"><span><b>INVESTED</b>{(invested/Math.max(total,1)*100).toFixed(1)}%</span><span className={(total-invested)<0?"leveraged":""}><b>{(total-invested)<0?"BORROWED CASH":"CASH RESIDUAL"}</b>{money(total-invested)} · {((total-invested)/Math.max(total,1)*100).toFixed(1)}%</span></div>}<div className={`editor-foot ${portfolioError?"editor-error":""}`}>{portfolioError??(hasShort?"Positive values are long positions; negative values are shorts. Dollar or weight edits change only that security and cash/collateral. Costs are explicit assumptions, not embedded in Yahoo prices.":"Changing a security’s dollars or weight changes only that position and the cash residual. Other security weights remain untouched. Negative cash represents an over-allocated portfolio; normalize only when you choose to.")}</div>
        </div>}

        <div className={`prototype-note ${dataError ? "prototype-error" : missingHoldings.length ? "prototype-warning" : ""}`}><span>{dataError ? "DATA ISSUE" : missingHoldings.length ? "PARTIAL DATA" : "LIVE DEMO"}</span><p>{dataError ? `${dataError} The interface remains available; retry the connection when ready.` : missingHoldings.length ? `No usable Yahoo history for ${missingHoldings.join(", ")}. Analytics exclude those positions and retain their value in portfolio cash.` : `USD portfolio analytics calculated from Yahoo Finance daily adjusted prices${marketData?.asOf ? ` through ${marketData.asOf}` : ""}.`}</p>{dataError && <button onClick={loadMarketData}>Retry</button>}</div>
        <div className="page-head">
          <div><span className="kicker">{view === "Overview" ? "LIVE PORTFOLIO INTELLIGENCE" : `FACTORSCOPE / ${primarySection.toUpperCase()}`}</span><h1>{viewCopy[view][0]}</h1><p>{viewCopy[view][1]}</p></div>
          {view !== "Project Brief" && !(view === "Performance" && performanceTab === "Event Analysis") && <div className="date-control"><span>ANALYSIS PERIOD</span><label><small>FROM</small><input type="date" aria-label="Analysis start date" min={availableStartDate} max={analysisEnd || availableEndDate} value={analysisStart} disabled={!availableStartDate} onChange={(event)=>setAnalysisStart(event.target.value)} /></label><i>→</i><label><small>TO</small><input type="date" aria-label="Analysis end date" min={analysisStart || availableStartDate} max={availableEndDate} value={analysisEnd} disabled={!availableEndDate} onChange={(event)=>setAnalysisEnd(event.target.value)} /></label></div>}
        </div>

        {primarySection === "Portfolio" && <div className="section-tabs" role="tablist" aria-label="Portfolio views">{(["Overview","Performance","Events"] as const).map(tab=><button key={tab} role="tab" aria-selected={portfolioTab===tab} className={portfolioTab===tab?"active":""} onClick={()=>{if(tab==="Overview")setView("Overview");else{setView("Performance");setPerformanceTab(tab==="Events"?"Event Analysis":"Overview")}}}>{tab}</button>)}</div>}
        {primarySection === "Risk & Attribution" && <div className="section-tabs" role="tablist" aria-label="Risk and attribution views">{(["Factors","Positions","Correlations","Security"] as const).map(tab=><button key={tab} role="tab" aria-selected={analysisTab===tab} className={analysisTab===tab?"active":""} onClick={()=>{if(tab==="Security"){setView("Security Analysis");if(!selectedTicker)setSelectedTicker(holdings.find(item=>item.ticker!=="CASH")?.ticker??null)}else{setView("Risk Analysis");setRiskTab(tab)}}}>{tab}</button>)}</div>}
        {primarySection === "Strategy Lab" && <div className="section-tabs" role="tablist" aria-label="Strategy lab views">{(["Compare","Dynamic Strategy","Scenarios"] as const).map(tab=><button key={tab} role="tab" aria-selected={strategyTab===tab} className={strategyTab===tab?"active":""} onClick={()=>setView(tab==="Compare"?"Compare":tab==="Dynamic Strategy"?"Strategy Analysis":"Scenario Lab")}>{tab}</button>)}</div>}
        {primarySection === "About" && <div className="section-tabs" role="tablist" aria-label="About FactorScope">{(["Methodology","Project Brief"] as const).map(tab=><button key={tab} role="tab" aria-selected={aboutTab===tab} className={aboutTab===tab?"active":""} onClick={()=>setView(tab)}>{tab}</button>)}</div>}

        {loading && !analytics && <DataLoading />}
        {!loading && !analytics && !dataError && <DataUnavailable />}
        {!loading && analytics && (!factorModel || !baselineFactorModel) && (view === "Risk Analysis" || view === "Performance" || view === "Compare") && <FactorModelUnavailable />}
        {view === "Overview" && analytics && <Overview total={total} invested={invested} holdings={holdings} analytics={analytics} decomposition={portfolioDecomposition} onSelectTicker={setSelectedTicker} executionCostBps={executionCostBps} shortBorrowRate={shortBorrowRate} />}
        {view === "Compare" && analytics && baselineAnalytics && factorModel && baselineFactorModel && <PortfolioComparison holdings={holdings} baselineHoldings={baselineHoldings} total={total} baselineTotal={baselineTotal} analytics={analytics} baselineAnalytics={baselineAnalytics} model={factorModel} baselineModel={baselineFactorModel} onSaveBaseline={saveBaseline} />}
        {view === "Strategy Analysis" && marketData && (hasShort?<section className="data-state"><div><strong>Dynamic Strategy is currently long-only</strong><p>Switch to the US Equity Portfolio demo or remove short positions. The market-neutral demo remains fully available in Portfolio, Risk &amp; Attribution, Compare, Performance and Scenarios.</p></div></section>:<StrategyAnalysis strategy={strategyAnalytics} total={total} frequency={strategyFrequency} setFrequency={setStrategyFrequency} targetVolatility={strategyTargetVolatility} setTargetVolatility={setStrategyTargetVolatility} targetBeta={strategyTargetBeta} setTargetBeta={setStrategyTargetBeta} maxPosition={strategyMaxPosition} setMaxPosition={setStrategyMaxPosition} />)}
        {view === "Security Analysis" && analytics && <SecurityAnalysisWorkspace holdings={holdings} selectedTicker={selectedTicker} onSelectTicker={setSelectedTicker} security={securityAnalytics} portfolio={analytics} total={total} />}
        {view === "Risk Analysis" && analytics && factorModel && marketData && <RiskWorkspace tab={riskTab} setTab={setRiskTab} model={factorModel} total={total} holdings={holdings} analytics={analytics} payload={marketData} onSelectTicker={setSelectedTicker} />}
        {view === "Performance" && analytics && factorModel && marketData && <PerformanceWorkspace tab={performanceTab} setTab={setPerformanceTab} total={total} analytics={analytics} model={factorModel} payload={marketData} holdings={holdings} onSelectTicker={setSelectedTicker} onExploreCorrelations={openEventCorrelations} />}
        {view === "Scenario Lab" && analytics && marketData && <ScenarioLab mode={scenarioMode} setMode={setScenarioMode} market={marketShock} setMarket={setMarketShock} tech={techShock} setTech={setTechShock} impact={scenarioImpact} total={total} holdings={holdings} analytics={analytics} payload={marketData} />}
        {view === "Methodology" && <Methodology />}
        {view === "Project Brief" && <ProjectBrief setView={setView} />}
        <footer className="site-footer"><span>FactorScope</span><p>Independent quantitative finance project · Product design, research methodology and front-end engineering</p><b>PROTOTYPE v2</b></footer>
      </section>
      {view !== "Security Analysis" && selectedHolding && securityAnalytics && analytics && <SecurityDrilldown holding={selectedHolding} security={securityAnalytics} portfolio={analytics} total={total} onClose={() => setSelectedTicker(null)} />}
    </main>
  );
}

function PortfolioComparison({ holdings, baselineHoldings, total, baselineTotal, analytics, baselineAnalytics, model, baselineModel, onSaveBaseline }: { holdings: Holding[]; baselineHoldings: Holding[]; total: number; baselineTotal: number; analytics: PortfolioAnalytics; baselineAnalytics: PortfolioAnalytics; model: FactorModelAnalytics; baselineModel: FactorModelAnalytics; onSaveBaseline: () => void }) {
  const currentByTicker = new Map(holdings.map((holding) => [holding.ticker, holding]));
  const baselineByTicker = new Map(baselineHoldings.map((holding) => [holding.ticker, holding]));
  const tickers = [...new Set([...baselineHoldings.map((holding) => holding.ticker), ...holdings.map((holding) => holding.ticker)])];
  const allocationRows = tickers.map((ticker) => {
    const current = currentByTicker.get(ticker);
    const baseline = baselineByTicker.get(ticker);
    const currentValue = current?.value ?? 0;
    const baselineValue = baseline?.value ?? 0;
    return { ticker, name: current?.name ?? baseline?.name ?? ticker, currentValue, baselineValue, valueDelta: currentValue - baselineValue, currentWeight: currentValue / Math.max(total, 1), baselineWeight: baselineValue / Math.max(baselineTotal, 1) };
  }).sort((a, b) => Math.abs(b.currentWeight - b.baselineWeight) - Math.abs(a.currentWeight - a.baselineWeight));
  const changedPositions = allocationRows.filter((row) => Math.abs(row.valueDelta) >= .5 || Math.abs(row.currentWeight - row.baselineWeight) >= .00005).length;

  const baselineDates = new Map(baselineAnalytics.dates.map((date, index) => [date, baselineAnalytics.curve[index]]));
  const currentDates = new Map(analytics.dates.map((date, index) => [date, analytics.curve[index]]));
  const commonDates = analytics.dates.filter((date) => baselineDates.has(date));
  const currentRaw = commonDates.map((date) => currentDates.get(date)!);
  const baselineRaw = commonDates.map((date) => baselineDates.get(date)!);
  const currentStart = currentRaw[0] || 1;
  const baselineStart = baselineRaw[0] || 1;
  const currentCurve = currentRaw.map((value) => value / currentStart);
  const baselineCurve = baselineRaw.map((value) => value / baselineStart);

  const baselineFactors = new Map(baselineModel.factors.map((factor) => [factor.name, factor]));
  const factorRows = model.factors.map((factor) => ({ ...factor, baselineExposure: baselineFactors.get(factor.name)?.exposure ?? 0, delta: factor.exposure - (baselineFactors.get(factor.name)?.exposure ?? 0) }));
  const largestFactorMove = Math.max(...factorRows.map((factor) => Math.abs(factor.delta)), .01);
  const hasFactorChanges=factorRows.some(factor=>Math.abs(factor.delta)>=.005);

  return <section className="comparison-layout">
    <article className="panel comparison-status">
      <div><span className="kicker">SAVED BASELINE</span><h2>{changedPositions ? `${changedPositions} changed position${changedPositions === 1 ? "" : "s"}` : "Current portfolio matches baseline"}</h2><p>The baseline remains fixed while you edit dollar values or weights. Save the current portfolio when you want to move the reference point.</p></div>
      <button onClick={onSaveBaseline}>Save current as baseline</button>
    </article>
    <section className="metrics comparison-metrics">
      <Metric label="PORTFOLIO VALUE" value={money(total)} sub={`Baseline ${money(baselineTotal)} · Δ ${signedMoney(total-baselineTotal)}`} />
      <Metric label="ANNUALIZED VOLATILITY" value={pct(analytics.annualVolatility*100)} sub={`Baseline ${pct(baselineAnalytics.annualVolatility*100)} · Δ ${pct((analytics.annualVolatility-baselineAnalytics.annualVolatility)*100)}`} tone="amber" />
      <Metric label="MARKET BETA" value={analytics.beta.toFixed(2)} sub={`Baseline ${baselineAnalytics.beta.toFixed(2)} · Δ ${(analytics.beta-baselineAnalytics.beta)>=0?"+":""}${(analytics.beta-baselineAnalytics.beta).toFixed(2)}`} />
      <Metric label="MAX DRAWDOWN" value={pct(analytics.maxDrawdown*100)} sub={`Baseline ${pct(baselineAnalytics.maxDrawdown*100)} · Δ ${pct((analytics.maxDrawdown-baselineAnalytics.maxDrawdown)*100)}`} tone="red" />
      <Metric label="MODEL R²" value={`${(model.rSquared*100).toFixed(0)}%`} sub={`Baseline ${(baselineModel.rSquared*100).toFixed(0)}% · Δ ${pct((model.rSquared-baselineModel.rSquared)*100)}`} />
    </section>
    <article className="panel comparison-performance">
      <PanelTitle title="Historical performance comparison" meta="Current portfolio vs. saved baseline" />
      {commonDates.length > 1 && <PerformanceChart portfolio={currentCurve} benchmark={baselineCurve} dates={commonDates} startDate={commonDates[0]} endDate={commonDates.at(-1)!} large primaryLabel="Current portfolio" secondaryLabel="Saved baseline" definition="Growth of $1 over common trading dates. Both portfolios use buy-and-hold current-dollar allocations; cash earns 0%. This is a historical replay, not a forecast." />}
    </article>
    <article className="panel comparison-positions">
      <PanelTitle title="Allocation changes" meta="Whole portfolio · baseline to current" />
      <div className="comparison-head"><span>POSITION</span><span>BASELINE</span><span>CURRENT</span><span>Δ VALUE</span><span>Δ WEIGHT</span></div>
      {allocationRows.map((row) => <div className="comparison-row" key={row.ticker}><div><strong>{row.ticker}</strong><small>{row.name}</small></div><span>{money(row.baselineValue)}<small>{(row.baselineWeight*100).toFixed(1)}%</small></span><span>{money(row.currentValue)}<small>{(row.currentWeight*100).toFixed(1)}%</small></span><strong className={row.valueDelta>0?"delta-positive":row.valueDelta<0?"delta-negative":""}>{signedMoney(row.valueDelta)}</strong><strong className={row.currentWeight>row.baselineWeight?"delta-positive":row.currentWeight<row.baselineWeight?"delta-negative":""}>{pct((row.currentWeight-row.baselineWeight)*100)}</strong></div>)}
    </article>
    <article className="panel comparison-factors">
      <PanelTitle title="Factor exposure changes" meta="Regression sensitivity · baseline to current" />
      {hasFactorChanges?<><div className="comparison-factor-head"><span>FACTOR</span><span>BASELINE</span><span>CURRENT</span><span>CHANGE</span></div>{factorRows.map((factor) => <div className="comparison-factor-row" key={factor.name}><div><strong>{factor.name}</strong><small>{factor.group}</small></div><span>{factor.baselineExposure>=0?"+":""}{factor.baselineExposure.toFixed(2)}</span><span>{factor.exposure>=0?"+":""}{factor.exposure.toFixed(2)}</span><div className="factor-change"><i className={factor.delta<0?"negative":""} style={{width:`${Math.abs(factor.delta)/largestFactorMove*48}%`}}/><strong className={factor.delta>0?"delta-positive":factor.delta<0?"delta-negative":""}>{factor.delta>=0?"+":""}{factor.delta.toFixed(2)}</strong></div></div>)}</>:<div className="comparison-empty"><strong>No factor changes from baseline</strong><p>Edit one or more positions, then return here to see how the portfolio’s modeled exposures changed.</p></div>}
    </article>
  </section>;
}

function Overview({ total, invested, holdings, analytics, decomposition, onSelectTicker, executionCostBps, shortBorrowRate }: { total: number; invested: number; holdings: Holding[]; analytics: PortfolioAnalytics; decomposition: SecurityDrilldownAnalytics["decomposition"] | null; onSelectTicker: (ticker: string) => void; executionCostBps:number; shortBorrowRate:number }) {
  const positionNames = new Map(holdings.map((holding) => [holding.ticker, holding]));
  const positionAnalytics = new Map(analytics.positions.map((position) => [position.ticker, position]));
  const sectors = [...new Set(holdings.map((holding) => holding.sector))].map((sector) => ({ sector, value: holdings.filter((holding) => holding.sector === sector).reduce((sum, holding) => sum + holding.value, 0) })).filter((item) => item.value > 0).sort((a,b) => b.value-a.value);
  const allocationTotal = sectors.reduce((sum, item) => sum + item.value, 0);
  const sectorSlices = sectors.map((item, index) => {
    const weight = item.value / Math.max(allocationTotal, 1);
    const start = sectors.slice(0, index).reduce((sum, preceding) => sum + preceding.value / Math.max(allocationTotal, 1) * 100, 0);
    return { ...item, weight, color: allocationPalette[index % allocationPalette.length], start, end: start + weight * 100 };
  });
  const allocationGradient = sectorSlices.length ? `conic-gradient(${sectorSlices.map((item) => `${item.color} ${item.start}% ${item.end}%`).join(", ")})` : "#1a242b";
  const factorCurve = decomposition && decomposition.systematic.length === analytics.dates.length - 1 ? [1, ...decomposition.systematic.map((value) => 1 + value)] : null;
  const observedReturn = decomposition?.observed.at(-1) ?? analytics.totalReturn;
  const systematicReturn = decomposition?.systematic.at(-1) ?? 0;
  const idiosyncraticReturn = decomposition?.idiosyncratic.at(-1) ?? observedReturn-systematicReturn;
  const longExposure=holdings.filter(h=>h.ticker!=="CASH").reduce((sum,h)=>sum+Math.max(0,h.value),0);
  const shortExposure=holdings.filter(h=>h.ticker!=="CASH").reduce((sum,h)=>sum+Math.max(0,-h.value),0);
  const grossExposure=longExposure+shortExposure;
  const hasShort=shortExposure>.5;
  const estimatedCosts=grossExposure*executionCostBps/10000+shortExposure*shortBorrowRate/100*Math.max(analytics.dailyReturns.length,1)/252;
  const signedSectors=[...new Set(holdings.filter(h=>h.ticker!=="CASH").map(h=>h.sector))].map(sector=>({sector,long:holdings.filter(h=>h.sector===sector).reduce((sum,h)=>sum+Math.max(0,h.value),0),short:holdings.filter(h=>h.sector===sector).reduce((sum,h)=>sum+Math.max(0,-h.value),0)})).sort((a,b)=>(b.long+b.short)-(a.long+a.short));
  return <>
    <section className="metrics">
      <Metric label="PORTFOLIO VALUE" value={money(total)} sub={hasShort?`${(grossExposure/Math.max(total,1)*100).toFixed(0)}% gross · ${(invested/Math.max(total,1)*100).toFixed(0)}% net`:`${money(invested)} invested`} />
      <Metric label="ANNUALIZED VOLATILITY" value={pct(analytics.annualVolatility * 100).replace("+", "")} sub={`${money(total * analytics.annualVolatility)} one-sigma risk`} tone="amber" />
      <Metric label="MARKET BETA" value={analytics.beta.toFixed(2)} sub="vs. S&P 500" />
      <Metric label="MAX DRAWDOWN" value={pct(analytics.maxDrawdown * 100)} sub={`${analytics.startDate} to ${analytics.endDate}`} tone="red" />
      <Metric label={hasShort?"EST. TOTAL COST":"CASH BALANCE"} value={hasShort?money(estimatedCosts):money(total-invested)} sub={hasShort?`${executionCostBps} bps execution + ${shortBorrowRate.toFixed(1)}% borrow p.a.`:`${(((total-invested)/total)*100).toFixed(1)}% of portfolio`} tone="cyan" />
    </section>
    {decomposition && <article className="panel overview-decomposition"><PanelTitle title="Return anatomy" meta="Common factors + idiosyncratic return = observed portfolio return"/><div className="decomposition-answer-strip"><div><span>OBSERVED RETURN</span><strong>{pct(observedReturn*100)}</strong><small>What the portfolio delivered</small></div><div><span>COMMON-FACTOR RETURN</span><strong>{pct(systematicReturn*100)}</strong><small>Market, style and sector effects</small></div><div className="idio-answer"><span>IDIOSYNCRATIC RETURN</span><strong>{pct(idiosyncraticReturn*100)}</strong><small>The remainder beyond common factors</small></div></div><DecompositionChart decomposition={decomposition}/></article>}
    <section className="dashboard-grid">
      <article className="panel performance-panel"><PanelTitle title="Historical replay" meta={`${analytics.startDate} — ${analytics.endDate}`} />
        <PerformanceChart portfolio={analytics.curve} benchmark={factorCurve ?? analytics.benchmarkCurve} tertiary={factorCurve ? analytics.benchmarkCurve : undefined} dates={analytics.dates} startDate={analytics.startDate} endDate={analytics.endDate} secondaryLabel={factorCurve ? "Factor benchmark (fitted)" : "S&P 500"} tertiaryLabel="S&P 500 (market reference)" definition={factorCurve ? "Growth of $1 from current dollar allocations. The fitted factor benchmark is the cumulative return explained in-sample by market, style and sector factors; the gap to the portfolio is idiosyncratic. SPY is retained as an investable market reference, not the sole benchmark." : "Growth of $1 invested at the start of the period. Current dollar allocations are held buy-and-hold; cash earns 0%."} />
      </article>
      <article className="panel allocation-panel"><PanelTitle title={hasShort?"Signed sector exposure":"Allocation"} meta={hasShort?"Long and short market value by sector":"Every sector · current dollars and weight"}/>{hasShort?<div className="signed-allocation"><div className="signed-allocation-head"><span>SECTOR</span><span>SHORT</span><span>LONG</span><span>NET</span></div>{signedSectors.map(item=><div className="signed-sector-row" key={item.sector}><strong>{item.sector}</strong><div className="signed-track short"><i style={{width:`${item.short/Math.max(longExposure,shortExposure,1)*100}%`}}/></div><div className="signed-track long"><i style={{width:`${item.long/Math.max(longExposure,shortExposure,1)*100}%`}}/></div><b>{signedMoney(item.long-item.short)}</b></div>)}</div>:<><div className="donut" style={{ background: allocationGradient }}><div><strong>100%</strong><span>portfolio</span></div></div><div className="allocation-legend">{sectorSlices.map((item)=><div key={item.sector}><i style={{background:item.color}}/><span>{item.sector}</span><b>{(item.weight*100).toFixed(1)}%</b><em>{money(item.value)}</em></div>)}</div></>}</article>
      <article className="panel risk-table overview-positions"><PanelTitle title="Portfolio positions" meta="Whole portfolio · aligned dollar and risk measures" /><div className="overview-position-head"><span>POSITION</span><span>CURRENT VALUE</span><span>WEIGHT</span><span>SHARE OF RISK</span><span>ANNUAL RISK</span><span>ACTION</span></div>{holdings.map((holding) => {const position=positionAnalytics.get(holding.ticker);const weight=holding.value/total;return <div className="overview-position-row" key={holding.ticker}><button className="overview-position-link" disabled={!position} onClick={() => position && onSelectTicker(holding.ticker)}><b>{holding.ticker}</b><small>{positionNames.get(holding.ticker)?.name ?? holding.ticker}</small></button><strong>{money(holding.value)}</strong><span>{pct(weight*100).replace("+","")}</span><div className="riskbar"><i style={{ width: `${Math.max(0,Math.min(100,(position?.riskShare??0)*300))}%` }} /><b>{position ? `${(position.riskShare*100).toFixed(1)}%` : "0.0%"}</b></div><strong>{money(position?.annualRisk??0)}</strong>{position ? <button className="overview-analyze" onClick={() => onSelectTicker(holding.ticker)}>Analyze →</button> : <span className="overview-unpriced">Cash</span>}</div>})}</article>
      <article className="panel insight-panel"><PanelTitle title="Portfolio summary" meta="Descriptive statistics" />{hasShort?<><Insight tone="amber" title="Gross and net exposure" text={`${money(longExposure)} long and ${money(shortExposure)} short produce ${money(grossExposure)} gross exposure and ${money(invested)} net exposure.`}/><Insight tone="red" title="Estimated carrying cost" text={`${money(estimatedCosts)} combines one-way execution and annualized borrow assumptions over the selected replay window.`}/></>:<><Insight tone="amber" title="Invested capital" text={`${money(invested)} is invested across ${analytics.positions.length} priced positions.`} /><Insight tone="red" title="Cash allocation" text={`${money(total-invested)} represents ${(((total-invested)/total)*100).toFixed(1)}% of current portfolio value.`} /></>}<Insight tone="green" title="Analysis window" text={`${analytics.startDate} through ${analytics.endDate}, using daily adjusted prices.`} /></article>
    </section>
  </>;
}

function TickerLink({ holding, onSelect, showSector = false }: { holding: Holding; onSelect: (ticker: string) => void; showSector?: boolean }) {
  return <button className="ticker-link" aria-label={`Analyze ${holding.ticker} security`} onClick={() => onSelect(holding.ticker)}><span><b>{holding.ticker}</b><small>{holding.name}{showSector ? ` · ${holding.sector}` : ""}</small></span><em>Analyze →</em></button>;
}

function SecurityAnalysisContent({ holding, security, portfolio, total }: { holding: Holding; security: SecurityDrilldownAnalytics; portfolio: PortfolioAnalytics; total: number }) {
  const position = portfolio.positions.find((item) => item.ticker === holding.ticker);
  const weight = holding.value / total;
  const maxExposure = Math.max(...security.factorExposures.map((factor) => Math.abs(factor.exposure)), .01);
  const idiosyncraticVariance = 1 - security.rSquared;
  return <>
        <section className="security-metrics">
          <Metric label="CURRENT VALUE" value={money(holding.value)} sub={`${(weight*100).toFixed(1)}% portfolio weight`} />
          <Metric label="PERIOD RETURN" value={pct(security.totalReturn*100)} sub={`${security.dates[0]} to ${security.dates.at(-1)}`} tone={security.totalReturn < 0 ? "red" : "cyan"} />
          <Metric label="DOLLAR P&L" value={money(holding.value*security.totalReturn)} sub="Current-value historical replay" tone={security.totalReturn < 0 ? "red" : "cyan"} />
          <Metric label="ANNUALIZED VOLATILITY" value={pct(security.annualVolatility*100).replace("+","")} sub="Daily adjusted returns" tone="amber" />
          <Metric label="MARKET BETA" value={security.beta.toFixed(2)} sub="vs. S&P 500" />
          <Metric label="MAX DRAWDOWN" value={pct(security.maxDrawdown*100)} sub="Selected analysis period" tone="red" />
        </section>

        <article className="panel security-decomposition"><PanelTitle title={`${holding.ticker} factor decomposition`} meta="Individual factor contributions · exact daily reconciliation" />
          <DecompositionChart decomposition={security.decomposition} />
        </article>

        <section className="drilldown-grid">
          <article className="panel security-performance"><PanelTitle title={`${holding.ticker} historical performance`} meta="Same dates and vertical scale" />
            <PerformanceChart portfolio={security.curve} benchmark={security.benchmarkCurve} dates={security.dates} startDate={security.dates[0]} endDate={security.dates.at(-1)!} primaryLabel={holding.ticker} definition="Growth of $1 invested at the start of the period using corporate-action-adjusted daily prices." />
          </article>
          <article className="panel security-portfolio"><PanelTitle title="Portfolio relationship" meta="Current portfolio" />
            <dl className="relationship-list">
              <div><dt>Portfolio weight</dt><dd>{(weight*100).toFixed(1)}%</dd></div>
              <div><dt>Share of modeled risk</dt><dd>{((position?.riskShare??0)*100).toFixed(1)}%</dd></div>
              <div><dt>Annual risk contribution</dt><dd>{money(position?.annualRisk??0)}</dd></div>
              <div><dt>Return correlation</dt><dd>{security.correlationWithPortfolio.toFixed(2)}</dd></div>
            </dl>
            <p>Risk contribution is covariance-based. A security’s portfolio weight and its share of modeled portfolio risk are different quantities.</p>
          </article>

          <article className="panel security-factors"><PanelTitle title="Factor exposure" meta="Core ETF-proxy regression sensitivity" />
            <div className="security-factor-head"><span>FACTOR</span><span>EXPOSURE</span><span>SENSITIVITY</span></div>
            {security.factorExposures.map((factor) => <div className="security-factor-row" key={factor.name}><strong>{factor.name}</strong><div className="security-factor-track"><i className={factor.exposure < 0 ? "negative" : ""} style={{ width: `${Math.abs(factor.exposure)/maxExposure*48}%` }} /></div><b>{factor.exposure >= 0 ? "+" : ""}{factor.exposure.toFixed(2)}</b></div>)}
          </article>
          <article className="panel security-idio"><PanelTitle title="Systematic and idiosyncratic" meta="In-sample decomposition" />
            <div className="security-split"><div><strong>{(security.rSquared*100).toFixed(0)}%</strong><span>Systematic variance</span></div><div><strong>{(idiosyncraticVariance*100).toFixed(0)}%</strong><span>Idiosyncratic variance</span></div></div>
            <div className="security-splitbar"><i style={{width:`${security.rSquared*100}%`}}/><b style={{width:`${idiosyncraticVariance*100}%`}}/></div>
            <dl className="decomposition-list"><div><dt>Observed return</dt><dd>{pct(security.totalReturn*100)}</dd></div><div><dt>Systematic return</dt><dd>{pct(security.systematicReturn*100)}</dd></div><div><dt>Idiosyncratic remainder</dt><dd>{pct(security.idiosyncraticReturn*100)}</dd></div></dl>
            <p>Systematic return is the cumulative fitted return from the proxy-factor regression. Idiosyncratic return is the arithmetic remainder. Explained variance is an in-sample statistic, not a forecast.</p>
          </article>
        </section>
  </>;
}

function SecurityAnalysisWorkspace({ holdings, selectedTicker, onSelectTicker, security, portfolio, total }: { holdings: Holding[]; selectedTicker: string | null; onSelectTicker: (ticker: string) => void; security: SecurityDrilldownAnalytics | null; portfolio: PortfolioAnalytics; total: number }) {
  const pricedTickers = portfolio.positions.map((position) => position.ticker);
  const holding = holdings.find((item) => item.ticker === selectedTicker) ?? null;
  const position = portfolio.positions.find((item) => item.ticker === selectedTicker);
  return <section className="security-workspace">
    <article className="panel security-selector-panel">
      <div><span className="kicker">SELECT SECURITY</span><h2>Explore a portfolio holding</h2><p>Choose any priced position to inspect observed performance, factor decomposition, loadings and portfolio relevance.</p></div>
      <label><span>PORTFOLIO SECURITY</span><select aria-label="Select security for analysis" value={selectedTicker ?? ""} onChange={(event) => onSelectTicker(event.target.value)}><option value="" disabled>Select a holding</option>{pricedTickers.map((ticker) => { const item = holdings.find((candidate) => candidate.ticker === ticker); return <option key={ticker} value={ticker}>{ticker} · {item?.name ?? ticker}</option>; })}</select></label>
      {holding && <div className="security-selection-summary"><strong>{holding.ticker}</strong><span>{holding.name} · {holding.sector}</span><b>{money(holding.value)} · {((position?.weight ?? holding.value / total) * 100).toFixed(1)}% weight</b></div>}
    </article>
    {holding && security ? <div className="security-analysis-content"><SecurityAnalysisContent holding={holding} security={security} portfolio={portfolio} total={total} /></div> : <div className="data-state"><div><strong>Select a priced portfolio security</strong><p>The analysis workspace uses the same dates and Yahoo Finance adjusted-price data as the portfolio views.</p></div></div>}
  </section>;
}

function SecurityDrilldown({ holding, security, portfolio, total, onClose }: { holding: Holding; security: SecurityDrilldownAnalytics; portfolio: PortfolioAnalytics; total: number; onClose: () => void }) {
  return <div className="drilldown-backdrop" onMouseDown={onClose}>
    <aside className="security-drilldown" role="dialog" aria-modal="true" aria-labelledby="security-drilldown-title" onMouseDown={(event) => event.stopPropagation()}>
      <header className="drilldown-header">
        <div><span className="kicker">SECURITY ANALYSIS</span><div className="security-title"><h2 id="security-drilldown-title">{holding.ticker}</h2><div><strong>{holding.name}</strong><span>{holding.sector} · USD</span></div></div></div>
        <button className="drilldown-close" aria-label="Close security analysis" onClick={onClose}>×</button>
      </header>
      <div className="drilldown-body"><SecurityAnalysisContent holding={holding} security={security} portfolio={portfolio} total={total} /></div>
    </aside>
  </div>;
}

function FactorRisk({ model, total }: { model: FactorModelAnalytics; total: number }) {
  const [group,setGroup]=useState<"All"|FactorAnalytics["group"]>("All");
  const visible=group==="All"?model.factors:model.factors.filter(factor=>factor.group===group);
  const idiosyncraticShare=1-model.rSquared;
  return <>
    <section className="metrics factor-summary">
      <Metric label="EXPLAINED DAILY VARIANCE" value={`${(model.rSquared*100).toFixed(0)}%`} sub="Core-first FWL residualization" tone="cyan" />
      <Metric label="IDIOSYNCRATIC VARIANCE" value={`${(idiosyncraticShare*100).toFixed(0)}%`} sub="Unexplained daily-return variance" />
      <Metric label="SYSTEMATIC RETURN" value={money(model.systematicAttribution)} sub={`${pct(model.systematicReturn*100)} linked contribution`} tone={model.systematicAttribution<0?"red":"cyan"} />
      <Metric label="IDIOSYNCRATIC RETURN" value={money(model.idiosyncraticAttribution)} sub={`${pct(model.idiosyncraticReturn*100)} arithmetic remainder`} tone={model.idiosyncraticAttribution<0?"red":"cyan"} />
      <Metric label="RECONCILIATION" value={money(model.reconciliationDifference)} sub={`Factor + idiosyncratic = ${money(total*(model.systematicReturn+model.idiosyncraticReturn))}`} />
    </section>
    <section className="factor-layout refined-factor-layout">
      <article className="panel factor-table"><PanelTitle title="Factor drill down" meta="Core → market-neutral style → core/style-neutral sector" /><div className="factor-tabs">{(["All","Style","Sector"] as const).map(item=><button key={item} onClick={()=>setGroup(item)} className={group===item?"on":""}>{item}</button>)}</div><div className="factor-head"><span>FACTOR</span><span>CONDITIONAL EXPOSURE</span><span>SHARE OF RISK</span><span>ANNUAL RISK</span><span>LINKED P&amp;L</span></div>{visible.map(factor => <div className="factor-row" key={factor.name}><strong>{factor.name}</strong><div className={`heat ${factor.exposure < 0 ? "neg" : "pos"}`}>{factor.exposure > 0 ? "+" : ""}{factor.exposure.toFixed(2)}</div><span>{(factor.riskShare*100).toFixed(1)}%</span><b>{money(factor.annualRisk)}</b><em className={factor.returnAttribution < 0 ? "down" : "up"}>{money(factor.returnAttribution)}</em></div>)}</article>
      <article className="panel factor-bars"><PanelTitle title="Portfolio factor exposure" meta="Conditional regression sensitivity" />{visible.map(factor => <div className="hbar" key={factor.name}><span>{factor.name}</span><div><i className={factor.exposure < 0 ? "left" : "right"} style={{ width: `${Math.min(48,Math.abs(factor.exposure) * 35)}%` }} /></div><b>{factor.exposure > 0 ? "+" : ""}{factor.exposure.toFixed(2)}</b></div>)}</article>
      <article className="panel model-layers"><PanelTitle title="Risk and return by model layer" meta="Incremental explanation" />{model.layers.map(layer=><div className="layer-row" key={layer.name}><strong>{layer.name}</strong><div><span>RISK</span><i><b style={{width:`${Math.max(0,Math.min(100,layer.riskShare*100))}%`}}/></i><em>{(layer.riskShare*100).toFixed(1)}%</em></div><div><span>RETURN</span><em className={layer.returnAttribution<0?"down":"up"}>{money(layer.returnAttribution)}</em></div></div>)}</article>
      <article className="panel factor-diagnostics"><PanelTitle title="Factor overlap diagnostics" meta="Raw ETF-proxy returns before residualization" /><p>{model.diagnostics.specification}</p><div className="diagnostic-head"><span>PAIR</span><span>GROUP</span><span>CORRELATION</span></div>{model.diagnostics.correlations.map(pair=><div className="diagnostic-row" key={`${pair.factorA}-${pair.factorB}`}><strong>{pair.factorA}<i>×</i>{pair.factorB}</strong><span>{pair.groups}</span><b className={Math.abs(pair.correlation)>=.7?"warning":""}>{pair.correlation.toFixed(2)}</b></div>)}<small>High correlation does not invalidate the total fitted return, but it makes individual within-block attribution more model-dependent. Factor rows are conditional estimates, not independent causal effects.</small></article>
    </section>
  </>;
}

function PositionRisk({ holdings, total, analytics, onSelectTicker }: { holdings: Holding[]; total: number; analytics: PortfolioAnalytics; onSelectTicker: (ticker: string) => void }) { const map=new Map(holdings.map(h=>[h.ticker,h])); return <section className="panel full-table"><PanelTitle title="Position risk" meta="Analyze any security or open the dedicated Security Analysis workspace" /><div className="position-head"><span>#</span><span>POSITION</span><span>MARKET VALUE</span><span>WEIGHT</span><span>VOLATILITY</span><span>BETA</span><span>SHARE OF RISK</span><span>ANNUAL RISK</span></div>{analytics.positions.map((position,i) => {const h=map.get(position.ticker) ?? { ticker: position.ticker, name: position.ticker, sector: "Unclassified", value: position.weight*total, beta: position.beta, vol: position.volatility*100, risk: position.riskShare*100 };return <div className="position-row" key={position.ticker}><span>{i+1}</span><div><TickerLink holding={h} onSelect={onSelectTicker} showSector /></div><strong>{money(h.value)}</strong><span>{(position.weight*100).toFixed(1)}%</span><span>{(position.volatility*100).toFixed(1)}%</span><span>{position.beta.toFixed(2)}</span><div className="riskbar"><i style={{width:`${Math.max(0,Math.min(100,position.riskShare*300))}%`}}/><b>{(position.riskShare*100).toFixed(1)}%</b></div><strong>{money(position.annualRisk)}</strong></div>})}</section>; }

function Performance({ total, analytics, model, onSelectTicker }: { total: number; analytics: PortfolioAnalytics; model: FactorModelAnalytics; onSelectTicker: (ticker: string) => void }) { const maxPnl=Math.max(...analytics.positions.map(p=>Math.abs(p.pnl)),1); const excess=analytics.totalReturn-analytics.benchmarkReturn; const maxLayer=Math.max(...model.layers.map(layer=>Math.abs(layer.returnAttribution)),1); return <section className="performance-layout"><section className="metrics"><Metric label="STARTING VALUE" value={money(total)} sub={analytics.startDate}/><Metric label="ENDING VALUE" value={money(total+analytics.pnl)} sub={`${pct(analytics.totalReturn*100)} portfolio return`} tone="cyan"/><Metric label="TOTAL P&L" value={money(analytics.pnl)} sub="Buy-and-hold historical replay" tone="cyan"/><Metric label="EXCESS RETURN" value={pct(excess*100)} sub={`Portfolio ${pct(analytics.totalReturn*100)} − S&P 500 ${pct(analytics.benchmarkReturn*100)}`} /></section><article className="panel performance-wide"><PanelTitle title="Historical replay" meta="Current holdings · adjusted-price total returns"/><PerformanceChart portfolio={analytics.curve} benchmark={analytics.benchmarkCurve} dates={analytics.dates} startDate={analytics.startDate} endDate={analytics.endDate} large /></article><article className="panel contribution"><PanelTitle title="Position contribution" meta="Analyze any ticker for full detail"/>{analytics.positions.slice().sort((a,b)=>b.pnl-a.pnl).slice(0,8).map(position=><div className="contrib-row" key={position.ticker}><button className="contrib-ticker" aria-label={`Analyze ${position.ticker} security`} onClick={() => onSelectTicker(position.ticker)}>{position.ticker}<span>Analyze →</span></button><div><i className={position.pnl<0?"loss":"gain"} style={{width:`${Math.abs(position.pnl)/maxPnl*100}%`}}/></div><strong className={position.pnl<0?"down":"up"}>{money(position.pnl)}</strong></div>)}</article><article className="panel return-attribution"><PanelTitle title="Factor and idiosyncratic attribution" meta="Arithmetically linked · exact reconciliation"/><div className="attribution-equation">{model.layers.map((layer,index)=><div className="attribution-term" key={layer.name}><span>{layer.name}</span><strong className={layer.returnAttribution<0?"down":"up"}>{money(layer.returnAttribution)}</strong><div className="attribution-track"><i className={layer.returnAttribution<0?"negative":""} style={{width:`${Math.abs(layer.returnAttribution)/maxLayer*48}%`}}/></div>{index<model.layers.length-1&&<em>+</em>}</div>)}<div className="attribution-equals"><em>=</em><span>Observed P&amp;L</span><strong>{money(analytics.pnl)}</strong><small>Difference {money(model.reconciliationDifference)}</small></div></div><p>Each day’s modeled factor return is weighted by beginning-of-day portfolio wealth. The idiosyncratic component includes the intercept and residual required to reconcile exactly to the observed buy-and-hold return.</p></article></section>; }

function ScenarioLab({ mode, setMode, market, setMarket, tech, setTech, impact, total, holdings, analytics, payload }: { mode: string; setMode:(v:"Modelled shock"|"Historical replay")=>void; market:number; setMarket:(n:number)=>void; tech:number; setTech:(n:number)=>void; impact:number; total:number; holdings:Holding[]; analytics:PortfolioAnalytics; payload:MarketPayload }) {
  const periods = [
    { id:"inflation", label:"2022 inflation selloff", start:"2022-01-03", end:"2022-10-12" },
    { id:"covid", label:"COVID selloff", start:"2020-02-19", end:"2020-03-23" },
    { id:"banks", label:"Regional-bank stress", start:"2023-03-08", end:"2023-03-24" },
  ];
  const [periodId,setPeriodId]=useState("inflation");
  const period=periods.find(item=>item.id===periodId)!;
  const replay=historicalReplay(payload,holdings,period.start,period.end);
  const replayAnalytics=buildAnalytics(payload,holdings,{startDate:period.start,endDate:period.end});
  const replayDecomposition=replayAnalytics?buildPortfolioDecomposition(payload,replayAnalytics):null;
  const positionBetas=new Map(analytics.positions.map(position=>[position.ticker,position.beta]));
  const modeled=[...holdings].filter(h=>h.ticker!=="CASH").map(h=>({ ticker:h.ticker,name:h.name,value:h.value,impact:h.value*(positionBetas.get(h.ticker)??h.beta)*market/100+(h.sector==="Technology"?h.value*tech/100*.62:0),return:0 })).sort((a,b)=>a.impact-b.impact);
  const affected=mode==="Historical replay"?replay.positions.map(item=>({...item,name:holdings.find(h=>h.ticker===item.ticker)?.name??item.ticker,value:holdings.find(h=>h.ticker===item.ticker)?.value??1})):modeled;
  const shownImpact=mode==="Historical replay"?replay.impact:impact;
  return <section className="scenario-layout"><article className="panel scenario-controls"><PanelTitle title="Build a scenario" meta="All assumptions are explicit"/><div className="segmented"><button onClick={()=>setMode("Modelled shock")} className={mode==="Modelled shock"?"on":""}>Modelled shock</button><button onClick={()=>setMode("Historical replay")} className={mode==="Historical replay"?"on":""}>Historical replay</button></div>{mode==="Modelled shock"?<><label className="slider-label"><span><b>S&P 500 shock</b><small>5 trading days · historical market beta</small></span><strong>{market.toFixed(1)}%</strong></label><input className="range" type="range" min="-20" max="10" step=".5" value={market} onChange={e=>setMarket(Number(e.target.value))}/><label className="slider-label"><span><b>Technology factor shock</b><small>Applied simultaneously to technology holdings</small></span><strong>{tech.toFixed(1)}%</strong></label><input className="range purple-range" type="range" min="-20" max="10" step=".5" value={tech} onChange={e=>setTech(Number(e.target.value))}/><div className="assumption"><b>Response model</b><span>Observed full-period beta</span></div><div className="assumption"><b>Unspecified factors</b><span>Held constant at 0.0%</span></div></>:<><label className="replay-select">HISTORICAL PERIOD<select value={periodId} onChange={e=>setPeriodId(e.target.value)}>{periods.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label><div className="replay-dates"><span>{period.start}</span><i>→</i><span>{period.end}</span></div><div className="replay-note">Applies each holding’s observed adjusted-price return from the selected period to today’s dollar portfolio. No covariance regime is assumed.</div></>}</article><article className="panel scenario-result"><PanelTitle title={mode==="Modelled shock"?"Estimated impact":"Historical replay result"} meta="Current portfolio"/><div className="impact-number"><span>PORTFOLIO IMPACT</span><strong className={shownImpact>=0?"positive-impact":""}>{money(shownImpact)}</strong><em>{pct(shownImpact/total*100)}</em></div>{mode==="Modelled shock"?<div className="waterfall"><div><i style={{height:`${Math.min(90,Math.abs(market)*5)}%`}}/><span>Market</span><b>{money(impact*.72)}</b></div><div><i className="purple" style={{height:`${Math.min(80,Math.abs(tech)*5)}%`}}/><span>Technology</span><b>{money(impact*.25)}</b></div><div><i className="mutedbar" style={{height:"14%"}}/><span>Other</span><b>{money(impact*.03)}</b></div></div>:<><div className="replay-result"><div><span>OBSERVED WINDOW</span><b>{period.start} — {period.end}</b></div><div><span>POSITIONS WITH DATA</span><b>{replay.positions.length} / {holdings.filter(h=>h.ticker!=="CASH").length}</b></div><div><span>METHOD</span><b>Fixed current signed weights</b></div></div>{replayAnalytics&&<div className="scenario-replay-chart"><PerformanceChart portfolio={replayAnalytics.curve} benchmark={replayAnalytics.benchmarkCurve} dates={replayAnalytics.dates} startDate={replayAnalytics.startDate} endDate={replayAnalytics.endDate} primaryLabel="Portfolio replay" secondaryLabel="S&P 500" definition="Observed adjusted-price paths over the selected event, applied to today’s signed holdings. Cash and collateral earn 0%."/></div>}</>}<p className="disclaimer">{mode==="Modelled shock"?"Estimate based on historical sensitivities and the stated assumptions. This is not a forecast.":"Historical replay of current holdings, not the portfolio’s actual past composition."}</p></article>{mode==="Historical replay"&&replayDecomposition&&<article className="panel scenario-factor-replay"><PanelTitle title="Factor path during the event" meta="Common factors + idiosyncratic return · exact daily reconciliation"/><DecompositionChart decomposition={replayDecomposition}/></article>}<article className="panel affected"><PanelTitle title="Largest affected positions" meta={mode==="Modelled shock"?"Estimated dollar impact":"Observed period impact"}/>{affected.slice(0,5).map(h=><div className="affected-row" key={h.ticker}><div><b>{h.ticker}</b><span>{h.name}</span></div><strong className={h.impact>=0?"up":""}>{money(h.impact)}</strong><em>{pct(h.impact/h.value*100)}</em></div>)}</article></section>; }

function Methodology(){return <section className="method-grid"><article className="panel method-hero"><span className="kicker">WHAT FACTORSCOPE DOES</span><h2>Five questions. One portfolio.</h2><p>FactorScope converts USD positions into clear views of ownership, systematic exposure, position-level risk, historical performance drivers, strategy construction and scenario sensitivity.</p><ol><li><b>01</b> What does the portfolio own?</li><li><b>02</b> What risks is it exposed to?</li><li><b>03</b> What drove performance?</li><li><b>04</b> How would a risk-targeted strategy have behaved?</li><li><b>05</b> What could happen under a defined shock?</li></ol></article><article className="panel"><PanelTitle title="Model framework" meta="Explainable by design"/><div className="method-list"><div><b>Market data</b><span>Yahoo Finance corporate-action-adjusted daily prices, requested server-side</span></div><div><b>Portfolio convention</b><span>Buy-and-hold replay of current dollar allocations, with cash carried at zero return</span></div><div><b>Conditional covariance</b><span>Strategy risk uses the Johansson–Ogut–Pelger–Schmelzer–Boyd CM-IEWMA method: five stock-universe IEWMA experts (10/21, 21/63, 63/125, 125/250 and 250/500-day volatility/correlation half-lives), with 63-observation minimums for both EWMA stages and a trailing 10-session Gaussian-likelihood combination. The fastest expert receives 5% diagonal regularization</span></div><div><b>Dynamic strategy</b><span>Weekly or monthly long-only rebalancing toward explicit volatility and market-beta targets. Market betas use the preceding 126 sessions, target weights become effective the next session, positions drift between rebalances and turnover is charged at 10 bps. Strategy, static-portfolio and benchmark Sharpe ratios use the same window and a 0% risk-free assumption</span></div><div><b>Factor proxies</b><span>Market, six style proxies and eleven US sector proxies constructed from liquid ETFs</span></div><div><b>Exposure model</b><span>Frisch–Waugh–Lovell block residualization: style proxies are neutralized to Market; sectors are neutralized to Market and Style; factors within a block are estimated jointly</span></div><div><b>Factor interpretation</b><span>Individual contributions are conditional on the included factors and selected window. Raw-proxy correlation diagnostics show where attribution is most model-dependent</span></div><div><b>Risk attribution</b><span>Incremental covariance attribution; final R² separates explained from idiosyncratic daily-return variance</span></div><div><b>Return attribution</b><span>Daily factor effects are weighted by beginning-of-day wealth; intercept and residual form the idiosyncratic remainder so P&amp;L reconciles exactly</span></div><div><b>Currency</b><span>All inputs and outputs in US dollars</span></div></div></article><article className="panel limits"><PanelTitle title="Defined limits" meta="What this product is not"/><p>Yahoo Finance is an unofficial prototype data source. ETF proxies are transparent approximations, not Arcana’s proprietary factor library or an institutional security-level risk model. CM-IEWMA is an ex-ante covariance forecast, not an expected-return model; strategy returns remain historical simulations. The strategy test uses today’s investable universe and does not yet model delistings, taxes, bid–ask spreads, market impact or point-in-time fundamentals. No ownership, crowding, short-interest, options-implied, intraday, earnings-estimate, execution or return-forecasting functionality.</p></article></section>}

function ProjectBrief({ setView }:{ setView:(view:View)=>void }) { return <section className="brief-grid">
  <article className="brief-hero panel"><span className="kicker">INDEPENDENT QUANTITATIVE FINANCE PROJECT</span><h2>Does the portfolio deliver something beyond common factors?</h2><p>FactorScope separates performance associated with broad market, style and sector exposures from the idiosyncratic remainder. The goal is not to maximize residual return mechanically, but to test whether a real or mock portfolio produces differentiated, repeatable and risk-adjusted performance after common exposures are controlled.</p><div className="brief-actions"><button onClick={()=>setView("Overview")}>Explore the product</button><button className="secondary" onClick={()=>setView("Methodology")}>Read methodology</button></div></article>
  <article className="panel brief-facts"><PanelTitle title="Project at a glance" meta="Scope and intent"/><dl><div><dt>Investment question</dt><dd>Is performance primarily compensation for common exposures, or is there persistent factor-adjusted differentiation?</dd></div><div><dt>Product decision</dt><dd>Connect ownership, risk, performance, dynamic strategy testing and defined shocks to one editable portfolio or mock book.</dd></div><div><dt>Audience</dt><dd>Fundamental, long-only and long–short investors evaluating US equity portfolios.</dd></div><div><dt>MVP constraint</dt><dd>USD portfolios, daily data and transparent ETF factor proxies.</dd></div></dl></article>
  <article className="panel brief-thesis"><PanelTitle title="Why decomposition matters" meta="Exposure is not the same as differentiated return"/><div><span>COMMON FACTORS</span><strong>Accessible exposures</strong><p>If most performance is explained by known factors, the portfolio’s return and Sharpe will be driven toward the behavior of those common premia.</p></div><div><span>IDIOSYNCRATIC REMAINDER</span><strong>Signal plus noise</strong><p>Residual return is not automatically skill. The relevant evidence is persistence, factor-adjusted Sharpe and out-of-sample consistency.</p></div><div><span>MOCK STRATEGY</span><strong>Test decisions through time</strong><p>Rebalance weekly or monthly toward explicit risk targets, then compare Sharpe, turnover, cash, realized risk and drawdown with the static portfolio and market benchmark without using future data.</p></div></article>
  <article className="panel brief-process"><PanelTitle title="Analytical architecture" meta="From input to decision support"/><div className="process-flow"><div><b>01</b><span>Dollar positions</span><small>Ticker + market value</small></div><i>→</i><div><b>02</b><span>Return model</span><small>Market + factor proxies</small></div><i>→</i><div><b>03</b><span>Risk decomposition</span><small>Systematic + idiosyncratic</small></div><i>→</i><div><b>04</b><span>Decision views</span><small>Attribution + strategy + scenarios</small></div></div></article>
  <article className="panel brief-skills"><PanelTitle title="What this project demonstrates" meta="Research translated into product"/><div><span>QUANTITATIVE RESEARCH</span><p>Conditional covariance forecasting, factor modeling, point-in-time portfolio construction, turnover and historical replay.</p></div><div><span>PRODUCT JUDGMENT</span><p>Clear scope, transparent assumptions and deliberate separation of exposure, risk and return.</p></div><div><span>IMPLEMENTATION</span><p>Responsive interface, editable state, CSV ingestion and interactive strategy and scenario controls.</p></div></article>
</section> }

function DataLoading(){return <section className="data-state"><span className="data-spinner"/><div><strong>Loading adjusted market history</strong><p>Downloading the portfolio, S&amp;P 500 benchmark and factor proxies from Yahoo Finance.</p></div></section>}
function DataUnavailable(){return <section className="data-state"><div><strong>Not enough aligned price history</strong><p>Choose a longer period or remove positions with limited trading history.</p></div></section>}
function FactorModelUnavailable(){return <section className="data-state"><div><strong>Factor history could not be aligned</strong><p>The portfolio view remains available, but all proxy ETFs need matching daily observations before risk and return attribution can be estimated.</p></div></section>}

function Metric({ label, value, sub, tone="" }: { label:string; value:string; sub:string; tone?:string }) { return <article className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{sub}</small></article>; }
function PanelTitle({ title, meta }: { title:string; meta:string }) { return <header className="panel-title"><h3>{title}</h3><span>{meta}</span></header>; }
function Insight({tone,title,text}:{tone:string;title:string;text:string}){return <div className={`insight ${tone}`}><i/><div><strong>{title}</strong><p>{text}</p></div></div>}
