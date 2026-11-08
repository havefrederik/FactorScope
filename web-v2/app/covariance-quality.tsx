"use client";

import { useEffect, useRef, useState } from 'react';
import type { CovarianceForecastAnalytics, MarketPayload } from '../lib/analytics';
import { qualityModels, type QualityResult } from '../lib/covariance-quality';
import type { ForecastSessions } from '../lib/forecast-horizon';

const percent = (v: number) => `${(100 * v).toFixed(1)}%`;
const sign = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(3)}`;
const colors = ['#50cce5', '#f0b55b', '#82c76a', '#e483b3', '#a28dff'];
const pairs = ['10 / 21', '21 / 63', '63 / 125', '125 / 250', '250 / 500'];
const cache = new WeakMap<MarketPayload, Map<string, QualityResult>>();

function QualityCharts({ result, correlationOnly }: { result: QualityResult; correlationOnly: boolean }) {
  const [hover, setHover] = useState<number | null>(null), [quarter, setQuarter] = useState<number | null>(null);
  const points = result.points, active = Math.min(hover ?? points.length - 1, points.length - 1), point = points[active];
  const W = 900, H = 240, left = 42, right = 18, top = 16, bottom = 30, width = W - left - right, height = H - top - bottom;
  const x = (i: number, length: number) => left + i / Math.max(1, length - 1) * width;
  const stacks = points.map(p => p.expertWeights.reduce<number[]>((s, w) => [...s, s.at(-1)! + w], [0]));
  const q = result.quarters.map(q => ({ ...q, differences: correlationOnly ? q.correlationDifferences : q.differences })), qIndex = Math.min(quarter ?? q.length - 1, q.length - 1);
  const limit = Math.max(.01, ...q.flatMap(p => qualityModels.map(m => Math.abs(p.differences[m.id])))) * 1.1;
  const y = (v: number) => top + (limit - v) / (2 * limit) * height;
  const inspect = (e: React.PointerEvent<SVGSVGElement>, n: number, set: (v: number) => void) => { const r = e.currentTarget.getBoundingClientRect(); set(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width * W - left) / width * (n - 1))))); };
  return <div className="forecast-quality-charts">
    <article className="panel"><header><h2>{correlationOnly ? 'Correlation loss over time' : 'Forecast loss over time'}</h2><span>Difference from direct LW · lower is better</span></header>
      <div className="quality-chart-legend"><b>{q[qIndex].quarter} · {q[qIndex].count} windows</b>{qualityModels.map(m => <span key={m.id}><i style={{ background: m.color }}/>{m.id === 'ff' ? 'FF + momentum' : m.label} <strong>{sign(q[qIndex].differences[m.id])}</strong></span>)}</div>
      <svg className="quality-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${correlationOnly ? 'Correlation' : 'Forecast'} loss relative to direct Ledoit–Wolf. Use left and right arrows to inspect quarters.`} tabIndex={0} onPointerMove={e => inspect(e, q.length, setQuarter)} onPointerLeave={() => setQuarter(null)} onKeyDown={e => { if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); setQuarter(Math.min(q.length - 1, Math.max(0, qIndex + (e.key === 'ArrowRight' ? 1 : -1)))); } }}>
        <title>{correlationOnly ? 'Quarterly Gaussian loss differences using shared IEWMA volatility forecasts and each model’s correlations.' : 'Quarterly out-of-sample Gaussian loss differences.'} Negative values outperform direct Ledoit–Wolf on this score.</title>
        {[-limit, 0, limit].map(v => <g key={v}><line x1={left} x2={W-right} y1={y(v)} y2={y(v)} className="quality-grid"/><text x={left-6} y={y(v)+4} textAnchor="end">{v.toFixed(2)}</text></g>)}
        {qualityModels.map(m => <g key={m.id}><polyline fill="none" stroke={m.color} strokeWidth="1.4" points={q.map((p,i) => `${x(i,q.length)},${y(p.differences[m.id])}`).join(' ')}/><circle cx={x(qIndex,q.length)} cy={y(q[qIndex].differences[m.id])} r="3" fill={m.color}/></g>)}
        <text x={left} y={H-5}>{q[0].quarter}</text><text x={W-right} y={H-5} textAnchor="end">{q.at(-1)!.quarter}</text>
      </svg>
    </article>
    <article className="panel"><header><h2>How CM-IEWMA adapts</h2><span>Model mixture · {point.asOf}</span></header>
      <div className="quality-chart-legend">{pairs.map((p,i) => <span key={p}><i style={{ background: colors[i] }}/>{p} <strong>{percent(point.expertWeights[i])}</strong></span>)}</div>
      <svg className="quality-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="CM-IEWMA component weights through time. Use left and right arrows to inspect forecast dates." tabIndex={0} onPointerMove={e => inspect(e, points.length, setHover)} onPointerLeave={() => setHover(null)} onKeyDown={e => { if (['ArrowLeft','ArrowRight'].includes(e.key)) { e.preventDefault(); setHover(Math.min(points.length-1,Math.max(0,active+(e.key==='ArrowRight'?1:-1)))); } }}>
        <title>Volatility / correlation half-lives in sessions. Mixture weights are not portfolio allocations.</title>
        {[0,.5,1].map(v => <g key={v}><text x={left-6} y={top+(1-v)*height+4} textAnchor="end">{100*v}%</text></g>)}
        {pairs.map((p,k) => <path key={p} fill={colors[k]} opacity=".8" d={`M ${points.map((_,i) => `${x(i,points.length)},${top+(1-stacks[i][k+1])*height}`).join(' L ')} L ${points.map((_,i) => `${x(i,points.length)},${top+(1-stacks[i][k])*height}`).reverse().join(' L ')} Z`}/>)}
        <line x1={x(active,points.length)} x2={x(active,points.length)} y1={top} y2={H-bottom} stroke="#f4f4f4" strokeWidth="1"/>
        <text x={left} y={H-5}>{points[0].asOf}</text><text x={W-right} y={H-5} textAnchor="end">{points.at(-1)!.asOf}</text>
      </svg><p className="covariance-comparison-note">Volatility / correlation half-lives in sessions · hover to inspect.</p>
    </article>
  </div>;
}

export default function CovarianceQuality({ payload, forecast, sessions }: { payload: MarketPayload; forecast: CovarianceForecastAnalytics; sessions: ForecastSessions }) {
  const [result, setResult] = useState<QualityResult | null>(null), [error, setError] = useState(''), [progress, setProgress] = useState<{ done: number; total: number } | null>(null), [attempt, setAttempt] = useState(0);
  const [comparison, setComparison] = useState<'full' | 'correlation'>('full');
  const correlationOnly = comparison === 'correlation' && forecast.tickers.length > 1;
  const worker = useRef<Worker | null>(null);
  const key = JSON.stringify([forecast.asOf, forecast.tickers, forecast.securities.map(s => s.portfolioWeight), sessions]);
  useEffect(() => {
    setResult(null); setError(''); setProgress(null);
    const saved = cache.get(payload)?.get(key); if (saved) { setResult(saved); return; }
    let instance: Worker;
    try { instance = new Worker(new URL('./covariance-quality.worker.ts', import.meta.url), { type: 'module' }); }
    catch { setError('This browser could not start the forecast calculation. Please retry.'); return; }
    worker.current = instance; setProgress({ done: 0, total: 0 });
    const finish = () => { instance.terminate(); worker.current = null; setProgress(null); };
    instance.onmessage = e => {
      if (e.data.type === 'progress') setProgress({ done: e.data.done, total: e.data.total });
      if (e.data.type === 'result') { const map = cache.get(payload) ?? new Map(); map.set(key,e.data.result); cache.set(payload,map); setResult(e.data.result); finish(); }
      if (e.data.type === 'error') { setError(e.data.error); finish(); }
    };
    instance.onerror = () => { setError('The forecast calculation stopped unexpectedly. Please retry.'); finish(); };
    instance.postMessage({ payload, tickers: forecast.tickers, weights: forecast.securities.map(s => s.portfolioWeight), asOf: forecast.asOf, sessions });
    return () => { instance.terminate(); worker.current = null; };
  }, [payload, key, attempt]); // key includes all inputs used from the forecast.
  return <div className="forecast-quality">
    <article className="panel"><header><div><h2>Historical forecast quality</h2><p>Same {forecast.tickers.length} stocks · {sessions}-session non-overlapping outcomes · selected weights held fixed</p></div></header>
      <div className="quality-comparison-controls"><div className="segmented" aria-label="Forecast quality comparison"><button aria-pressed={!correlationOnly} className={!correlationOnly ? 'on' : ''} onClick={() => setComparison('full')}>Full risk forecast</button><button aria-pressed={correlationOnly} className={correlationOnly ? 'on' : ''} disabled={forecast.tickers.length < 2} onClick={() => setComparison('correlation')}>Correlation only</button></div><span>{forecast.tickers.length < 2 ? 'Correlation comparison needs at least two stocks.' : correlationOnly ? 'Shared volatility: IEWMA · 63-session half-life' : 'Each model’s own volatility and correlations'}</span></div>
      {progress && <div className="quality-status" role="status"><div><strong>{progress.total ? `Evaluating ${progress.done} of ${progress.total} forecasts` : 'Preparing the common history…'}</strong><progress value={progress.done} max={progress.total || 1}/></div><button onClick={() => { worker.current?.terminate(); worker.current = null; setProgress(null); setError('Calculation cancelled. No partial results are shown.'); }}>Cancel</button></div>}
      {error && <div className="quality-status" role="alert"><p>{error}</p><button onClick={() => setAttempt(n => n + 1)}>Retry comparison</button></div>}
      {result && <><div className="quality-period"><span>{result.startDate} — {result.endDate}</span><span>{result.points.length} completed windows</span></div><div className="covariance-table-scroll"><table className="quality-results" aria-label={correlationOnly ? "Correlation quality with shared volatility" : "Full risk forecast quality"}><thead><tr><th scope="col">Model</th><th scope="col">{correlationOnly ? 'Correlation loss vs direct LW' : 'Forecast loss vs direct LW'}<br/><small>Lower is better · LW = 0</small></th><th scope="col">Portfolio risk calibration<br/><small>{correlationOnly ? 'Shared volatility · target 1' : 'Realized / predicted · target 1'}</small></th><th scope="col">Inside ±1.96σ<br/><small>Gaussian reference 95%</small></th></tr></thead><tbody>{qualityModels.map(m => { const s = (correlationOnly ? result.correlationSummaries : result.summaries).find(s => s.id === m.id)!; return <tr key={m.id}><th scope="row"><i style={{background:m.color}}/>{m.label}</th><td>{sign(s.lossVsLw)}</td><td>{s.calibration === null ? (result.points.length < 20 ? 'Too few windows' : 'No portfolio risk') : s.calibration.toFixed(2)}</td><td>{s.coverage === null ? (result.points.length < 20 ? 'Too few windows' : 'No portfolio risk') : percent(s.coverage)}</td></tr>; })}</tbody></table></div><p className="covariance-comparison-note">{correlationOnly && 'All models use the same volatility forecasts; only correlations vary. '}Calibration above 1 means risk was underestimated; below 1 means it was overestimated. {result.points.length < 20 ? 'At least 20 windows are required for calibration.' : 'Small samples remain uncertain.'} This tests risk forecasts, not a trading strategy.</p></>}
    </article>
    {result && <QualityCharts result={result} correlationOnly={correlationOnly}/>}
  </div>;
}
