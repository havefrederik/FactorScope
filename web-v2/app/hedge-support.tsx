"use client";
import {useEffect,useMemo,useRef,useState} from 'react';
import type {AnalyticsHolding,MarketPayload} from '@/lib/analytics';
import type {ExamplePortfolioResult} from '@/lib/example-portfolio';
import {buildHoldingsOverview} from '@/lib/portfolio-overview';
import {defaultHedgeSettings,hedgeEtfs,validationStart,weightsWithHedge,type HedgeSettings,type HedgeSnapshot,type HedgeValidation,type HedgeHistory} from '@/lib/hedge-support';
import type {ForecastSessions} from '@/lib/forecast-horizon';
import CompactRiskSummary from './compact-risk-summary';
const pct=(v:number)=>`${(v*100).toFixed(2)}%`;
const number=(v:number|null)=>v===null?'—':v.toFixed(2);
function download(name:string,text:string,type='text/csv'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function HedgeChart({result}:{result:HedgeValidation}){
  const [hover,setHover]=useState<number|null>(null),[mode,setMode]=useState<'drawdown'|'return'>('drawdown');
  const colors=['#c8c3b5','#58ccdc','#ebad67'];
  const curves=result.curves.map(c=>{let peak=1;return c.map(v=>{peak=Math.max(peak,v);return mode==='drawdown'?v/peak-1:v-1})});
  const active=hover??result.dates.length-1,lo=Math.min(0,...curves.flat()),hi=Math.max(.001,...curves.flat()),span=Math.max(.01,hi-lo);
  const x=(i:number)=>50+850*i/(result.dates.length-1),y=(v:number)=>20+200*(hi-v)/span;
  return <div className="hedge-history-chart"><div className="hedge-chart-controls"><div><button aria-pressed={mode==='drawdown'} onClick={()=>setMode('drawdown')}>Drawdown</button><button aria-pressed={mode==='return'} onClick={()=>setMode('return')}>Cumulative return</button></div><time>{result.dates[active]}</time></div><div className="hedge-chart-legend">{result.metrics.map((m,k)=><span key={m.label}><i style={{background:colors[k]}}/>{m.label} <strong>{pct(curves[k][active])}</strong></span>)}</div>
    <svg viewBox="0 0 920 250" tabIndex={0} role="img" aria-label="Historical hedge comparison. Use left and right arrows to inspect dates." onPointerMove={e=>{const r=e.currentTarget.getBoundingClientRect();setHover(Math.max(0,Math.min(result.dates.length-1,Math.round(((e.clientX-r.left)/r.width*920-50)/850*(result.dates.length-1)))));}} onPointerLeave={()=>setHover(null)} onKeyDown={e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();setHover(Math.max(0,Math.min(result.dates.length-1,active+(e.key==='ArrowLeft'?-1:1))))}}}>
      <title>{mode==='drawdown'?'Drawdown from each strategy’s running peak':'Growth of equal starting capital'}, after simulated hedge costs. Underlying portfolio history is unchanged.</title>
      {[lo,(lo+hi)/2,hi].map(v=><g key={v}><line x1="50" x2="900" y1={y(v)} y2={y(v)} stroke="#303638"/><text x="44" y={y(v)+4} textAnchor="end">{(v*100).toFixed(0)}%</text></g>)}
      {curves.map((c,k)=><polyline key={k} fill="none" stroke={colors[k]} strokeWidth="1.4" points={c.map((v,i)=>`${x(i)},${y(v)}`).join(' ')}/>)}
      <line x1={x(active)} x2={x(active)} y1="20" y2="220" stroke="#70767a"/>{curves.map((c,k)=><circle key={k} cx={x(active)} cy={y(c[active])} r="3" fill={colors[k]}/>)}
      <text x="50" y="244">{result.start}</text><text x="900" y="244" textAnchor="end">{result.end}</text>
    </svg></div>;
}
export default function HedgeSupport({payload,holdings,history,asOf,onMethodology}:{payload:MarketPayload;holdings:AnalyticsHolding[];history:ExamplePortfolioResult|null;asOf:string;onMethodology:()=>void}){
  const [settings,setSettings]=useState<HedgeSettings>(()=>({...defaultHedgeSettings,candidates:[...defaultHedgeSettings.candidates]}));
  const [snapshot,setSnapshot]=useState<HedgeSnapshot|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState('SPY');
  const [result,setResult]=useState<HedgeValidation|null>(null),[validationError,setValidationError]=useState(''),[progress,setProgress]=useState(''),[running,setRunning]=useState(false),[frequency,setFrequency]=useState<'monthly'|'weekly'>('monthly');
  const capital=holdings.reduce((s,h)=>s+h.value,0),weights=useMemo(()=>Object.fromEntries(holdings.filter(h=>h.ticker!=='CASH').map(h=>[h.ticker,h.value/capital])),[holdings,capital]);
  const basis=useMemo<{history:HedgeHistory|null;error:string}>(()=>{
    try{const h=history??buildHoldingsOverview(payload,holdings,payload.series.SPY?.points[0]?.date??'',asOf);return {history:h?{tickers:h.tickers,days:h.days.filter(d=>d.date<=asOf),label:history?'Dated portfolio history':'Selected allocation · buy-and-hold replay'}:null,error:''}}catch(e){return {history:null,error:(e as Error).message}}
  },[payload,holdings,history,asOf]);
  const first=basis.history?.days[0]?.date??'',last=basis.history?.days.at(-1)?.date??asOf;
  const [start,setStart]=useState(first),[end,setEnd]=useState(last);
  const worker=useRef<Worker|null>(null);
  useEffect(()=>{setStart(first);setEnd(last)},[first,last]);
  useEffect(()=>{setSnapshot(null);setError('');setBusy(true);const w=new Worker(new URL('./hedge-support.worker.ts',import.meta.url),{type:'module'});w.onmessage=({data})=>{if(data.kind==='result'){setSnapshot(data.result);setSelected(data.result.ranked[0].ticker)}else setError(data.message);setBusy(false);w.terminate()};w.onerror=()=>{setError('Hedge analysis could not start. Reload the page and try again.');setBusy(false);w.terminate()};w.postMessage({kind:'snapshot',payload,weights,asOf,settings});return()=>w.terminate()},[payload,weights,asOf,settings]);
  useEffect(()=>{worker.current?.terminate();worker.current=null;setRunning(false);setResult(null);setValidationError('');setProgress('');return()=>worker.current?.terminate()},[payload,basis,settings,start,end,frequency]);
  const update=<K extends keyof HedgeSettings>(key:K,value:HedgeSettings[K])=>setSettings(s=>({...s,[key]:value}));
  const chosen=snapshot?.ranked.find(h=>h.ticker===selected)??snapshot?.ranked[0];
  const ready=basis.history?validationStart(payload,basis.history,settings,start,end):null;
  function run(){
    if(!basis.history)return;setResult(null);setValidationError('');setProgress('Estimating dated hedges…');setRunning(true);
    const w=new Worker(new URL('./hedge-support.worker.ts',import.meta.url),{type:'module'});worker.current=w;
    w.onmessage=({data})=>{if(data.kind==='progress'){setProgress(`${data.done} / ${data.total} decisions checked`);return}if(data.kind==='result')setResult(data.result);else setValidationError(data.message);setRunning(false);setProgress('');w.terminate();worker.current=null};
    w.onerror=()=>{setValidationError('Validation could not finish. No partial comparison has been accepted.');setRunning(false);setProgress('');w.terminate();worker.current=null};
    w.postMessage({kind:'validation',payload,history:basis.history,settings,start,end,frequency});
  }
  return <div className="hedge-support">
    <section className="panel hedge-controls"><header><div><h2>Hedge Support</h2><span>One ETF overlay · existing portfolio stays in place</span></div><button className="hedge-method" onClick={onMethodology}>Methodology ↗</button></header>
      <div className="hedge-control-grid">
        <label>Maximum hedge · % capital<input aria-label="Maximum hedge percent" type="number" min="1" max="100" step="1" value={settings.maxWeight*100} onChange={e=>update('maxWeight',Number(e.target.value)/100)}/></label>
        <label>Direction<select value={settings.direction} onChange={e=>update('direction',e.target.value as HedgeSettings['direction'])}><option value="short">Sell / short ETFs</option><option value="both">Long or short ETFs</option></select></label>
        <label>Risk horizon<select value={settings.forecast.sessions} onChange={e=>update('forecast',{...settings.forecast,sessions:Number(e.target.value) as ForecastSessions})}>{[1,5,21].map(n=><option value={n} key={n}>{n===1?'Next session':`Next ${n} sessions`}</option>)}</select></label>
        <label>Execution cost · bps<input type="number" min="0" max="100" step="1" value={settings.executionBps} onChange={e=>update('executionBps',Number(e.target.value))}/></label>
        <label>ETF borrow · %/year<input type="number" min="0" max="100" step=".1" value={settings.shortBorrow*100} onChange={e=>update('shortBorrow',Number(e.target.value)/100)}/></label>
        <label>Cash spread over RF · %/year<input type="number" min="0" max="100" step=".1" value={settings.cashSpread*100} onChange={e=>update('cashSpread',Number(e.target.value)/100)}/></label>
      </div>
      <details className="hedge-universe"><summary>ETF universe · {settings.candidates.length} selected</summary><div>{hedgeEtfs.map(([ticker,name])=><label key={ticker}><input type="checkbox" checked={settings.candidates.includes(ticker)} onChange={e=>update('candidates',e.target.checked?[...settings.candidates,ticker]:settings.candidates.filter(t=>t!==ticker))}/><strong>{ticker}</strong> {name}</label>)}</div></details>
    </section>
    <div role="status" className={error?'notice error':'hedge-status'}>{busy?'Estimating the joint stock and ETF risk model…':error||`${asOf} · Fama–French 5 + momentum · automatic residual LW · responsive risk`}</div>
    {snapshot&&chosen&&<div className="hedge-results"><section className="panel hedge-ranking"><header><h3>ETF comparisons</h3><span>Ranked by forecast risk reduction</span></header><div className="table-scroll"><table><thead><tr><th>ETF</th><th>Overlay</th><th>Correlation</th><th>Risk after</th><th>Reduction</th></tr></thead><tbody>{snapshot.ranked.map(h=><tr className={h.ticker===chosen.ticker?'selected':''} key={h.ticker}><td><button aria-pressed={h.ticker===chosen.ticker} onClick={()=>setSelected(h.ticker)}>{h.ticker}<small>{hedgeEtfs.find(([t])=>t===h.ticker)?.[1]}</small></button></td><td>{h.weight===0?'No hedge':`${h.weight<0?'Sell':'Buy'} ${pct(Math.abs(h.weight))}`}{h.atLimit&&<small>Size limit reached</small>}</td><td>{number(h.correlation)}</td><td>{pct(h.after*Math.sqrt(settings.forecast.sessions/252))}</td><td>{(h.reduction*Math.sqrt(settings.forecast.sessions/252)*100).toFixed(2)} pp</td></tr>)}</tbody></table></div></section>
      <div className="hedge-selected"><section className="panel hedge-proposal"><header><h3>{chosen.weight===0?'No risk-reducing overlay':`${chosen.weight<0?'Sell / short':'Buy'} ${chosen.ticker} · ${pct(Math.abs(chosen.weight))}`}</h3><button disabled={!chosen.weight} onClick={()=>download(`hedge-${asOf}-${chosen.ticker}.csv`,`as_of,ticker,overlay_weight,notional_usd,execution_bps,annual_etf_borrow,annual_cash_spread,risk_horizon_sessions\n${asOf},${chosen.ticker},${chosen.weight},${chosen.weight*capital},${settings.executionBps},${settings.shortBorrow},${settings.cashSpread},${settings.forecast.sessions}\n`)}>Export hedge ↓</button></header><div className="hedge-proposal-facts"><span>Overlay notional<strong>{new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Math.abs(chosen.weight)*capital)}</strong></span><span>Open + close cost<strong>{(chosen.roundTripCost*10000).toFixed(1)} bps capital</strong></span><span>Borrow · {settings.forecast.sessions} sessions<strong>{(chosen.borrowCost*10000).toFixed(1)} bps capital</strong></span></div><p>Hedge size targets lower forecast volatility, not higher returns. Financing and realized outcomes are included in the historical check below.</p></section>
      <CompactRiskSummary forecast={snapshot.forecast} weights={snapshot.weights} alternative={weightsWithHedge(snapshot,chosen)} alternativeLabel={`With ${chosen.ticker}`} capital={capital} onMethodology={onMethodology}/></div>
    </div>}
    <section className="panel hedge-validation"><header><div><h2>Historical validation</h2><span>Re-select and resize at each decision · compare with unhedged and SPY-only</span></div>{result&&<button onClick={()=>download('hedge-validation.json',JSON.stringify(result,null,2),'application/json')}>Export validation ↓</button>}</header>
      <div className="hedge-validation-controls"><label>From<input type="date" value={start} min={first} max={end} onChange={e=>setStart(e.target.value)}/></label><label>To<input type="date" value={end} min={start} max={last} onChange={e=>setEnd(e.target.value)}/></label><label>Rebalance opportunities<select value={frequency} onChange={e=>setFrequency(e.target.value as 'monthly'|'weekly')}><option value="monthly">Monthly</option><option value="weekly">Weekly</option></select></label><button disabled={busy||!!error||!ready||running} onClick={run}>{running?'Validating…':'Run historical check'}</button>{running&&<button onClick={()=>{worker.current?.terminate();worker.current=null;setRunning(false);setProgress('Validation cancelled.')}}>Cancel</button>}</div>
      <p className="hedge-validation-basis">{basis.error||basis.history?.label||'Portfolio history is unavailable.'}{ready&&` · first eligible decision ${ready}`}{!ready&&basis.history&&' · no estimation window in this period'}. Same settings and costs as above.</p>
      <div role="status" className={validationError?'notice error':'hedge-status'}>{validationError||progress}</div>
      {result&&<><div className="hedge-validation-caption">{result.start} — {result.end} · {result.decisions.length} decisions · net of overlay trading and financing costs</div><div className="table-scroll"><table><thead><tr><th>Realized result</th>{result.metrics.map(m=><th key={m.label}>{m.label}</th>)}</tr></thead><tbody>
        <tr className="hedge-emphasis"><th>Annualized volatility</th>{result.metrics.map(m=><td key={m.label}>{pct(m.volatility)}</td>)}</tr>
        <tr><th>Historical Sharpe</th>{result.metrics.map(m=><td key={m.label}>{number(m.sharpe)}</td>)}</tr>
        <tr><th>Total return</th>{result.metrics.map(m=><td key={m.label}>{pct(m.totalReturn)}</td>)}</tr>
        <tr><th>Maximum drawdown</th>{result.metrics.map(m=><td key={m.label}>{pct(m.drawdown)}</td>)}</tr>
        <tr><th>Execution costs · % starting capital</th>{result.metrics.map(m=><td key={m.label}>{pct(m.executionCost)}</td>)}</tr>
        <tr><th>Borrow / financing spread · % starting capital</th>{result.metrics.map(m=><td key={m.label}>{pct(m.borrowCost)}</td>)}</tr>
        <tr><th>Overlay trades incl. final close</th>{result.metrics.map(m=><td key={m.label}>{m.trades}</td>)}</tr>
      </tbody></table></div><HedgeChart result={result}/>
      <details className="hedge-audit"><summary>Quarterly risk & decision audit</summary><div className="table-scroll"><table><thead><tr><th>Annualized realized volatility</th>{result.metrics.map(m=><th key={m.label}>{m.label}</th>)}</tr></thead><tbody>{result.quarterly.map(q=><tr key={q.quarter}><th>{q.quarter}</th>{q.volatility.map((v,i)=><td key={i}>{pct(v)}</td>)}</tr>)}</tbody></table></div><div className="table-scroll hedge-decision-table"><table><thead><tr><th>Decision close</th><th>Execution close</th><th>ETF</th><th>Target overlay</th><th>SPY-only target</th></tr></thead><tbody>{result.decisions.map(d=><tr key={d.decision}><td>{d.decision}</td><td>{d.execution}</td><td>{d.ticker}</td><td>{pct(d.weight)}</td><td>{pct(d.spyWeight)}</td></tr>)}</tbody></table></div></details></>}
    </section>
  </div>;
}
