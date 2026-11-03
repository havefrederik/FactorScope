"use client";
import {useEffect,useMemo,useState} from 'react';
import {backtestOptimizer,type ReoptimizationPolicy} from '@/lib/optimizer-backtest';
import {comparableRuns,historyFingerprint,pathMetrics,readHindsightRuns,type HindsightRun} from '@/lib/hindsight-runs';
import type {MarketPayload,PortfolioAnalytics} from '@/lib/analytics';
import type {OptimizerInput} from '@/lib/portfolio-optimizer';
import type {ExamplePortfolioResult} from '@/lib/example-portfolio';
import {historicalSharpe} from '@/lib/historical-sharpe';
import {historyWindow} from '@/lib/comparison-history';
const storage='factorscope.hindsight.runs.v1';
const defaults:ReoptimizationPolicy={interval:'Monthly',trigger:'Interval',minHoldingSessions:21,intervalSessions:21,drift:.02,volatility:.3,costBps:5,costGate:false,riskAversion:3,horizon:21,borrowRate:.01,financingRate:.05};
const pct=(x:number)=>`${(x*100).toFixed(2)}%`;
function download(name:string,value:unknown){const u=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
export default function OptimizerBacktest({payload,tickers,initial,history,reference,buildModel,unavailable,modelSignature,onLoadSettings}:{payload:MarketPayload;tickers:string[];initial:number[];history?:ExamplePortfolioResult|null;reference?:PortfolioAnalytics|null;buildModel:(date:string,weights:number[])=>OptimizerInput;unavailable:string;modelSignature:string;onLoadSettings:(name:string,raw:string)=>void}){
 const earliest=tickers.map(t=>payload.series[t]?.points[253]?.date??'9999').sort().at(-1)??'';
 const [start,setStart]=useState(earliest),[end,setEnd]=useState([payload.asOf,reference?.endDate].filter(Boolean).sort()[0]??'');
 const [policy,setPolicy]=useState<ReoptimizationPolicy>(defaults);
 const [result,setResult]=useState<Awaited<ReturnType<typeof backtestOptimizer>>|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0);
 const [signature,setSignature]=useState(''),[runs,setRuns]=useState<HindsightRun[]>([]),[activeId,setActiveId]=useState(''),[name,setName]=useState(''),[storageNotice,setStorageNotice]=useState('');
 const [audit,setAudit]=useState<unknown>(null);
 useEffect(()=>{try{setRuns(readHindsightRuns(localStorage.getItem(storage)));}catch{setStorageNotice('Browser storage is unavailable; export runs to keep them.');}},[]);
 const dataFingerprint=useMemo(()=>historyFingerprint([...([...tickers,'SPY','BIL'].map(t=>payload.series[t]?.points??[])),...(payload.academicFactors?Array.from({length:7},(_,k)=>payload.academicFactors!.rows.map(r=>({date:r.date,close:k===6?r.rf:r.values[k]}))):[])]),[payload,tickers.join('|')]);
 const config=JSON.stringify([start,end,policy,tickers,modelSignature,dataFingerprint]);
 const patch=(p:Partial<ReoptimizationPolicy>)=>setPolicy(old=>({...old,...p}));
 function save(next:HindsightRun[]){setRuns(next);try{localStorage.setItem(storage,JSON.stringify(next));}catch{setStorageNotice('Results remain available here, but browser storage is full. Export runs to keep them.');}}
 async function run(){setError('');setBusy(true);setResult(null);try{
   const day=history?.days.find(d=>d.date>=start);const starting=day?tickers.map(t=>{const i=history!.tickers.indexOf(t);return i<0?0:day.values[i]/day.nav;}):initial;
   const r=await backtestOptimizer(payload,tickers,start,end,starting,policy,buildModel,setProgress);
   const candidate=reference?historyWindow(reference,r.dates[0],r.dates.at(-1)!):null;
   const baseline=candidate&&JSON.stringify(candidate.dates)===JSON.stringify(r.dates)?candidate:null;
   const settings=JSON.parse(modelSignature);const label=`${settings.riskEstimator} · ${settings.shrinkageMode??'Automatic'}${settings.shrinkageMode==='Manual'?` ${settings.manualShrinkage}%`:''}`;
   const snapshot:HindsightRun={version:1,sharpeBenchmark:payload.academicFactors?'French RF':'BIL',id:crypto.randomUUID(),name:name.trim()||`Run ${runs.length+1}`,createdAt:new Date().toISOString(),comparisonKey:JSON.stringify([tickers,r.dates,starting,dataFingerprint]),modelSignature,modelLabel:label,policy:{...policy},start:r.dates[0],end:r.dates.at(-1)!,sharpe:historicalSharpe(r.dates,r.dailyReturns,payload),baselineSharpe:baseline?historicalSharpe(baseline.dates,baseline.dailyReturns,payload):null,...pathMetrics(r.curve,r.dailyReturns),trades:r.events.filter(e=>e.status==='Traded').length,turnover:r.events.filter(e=>e.status==='Traded').reduce((s,e)=>s+e.turnover,0),cost:r.totalCosts,dates:r.dates,curve:r.curve};
   save([...runs,snapshot].slice(-12));setActiveId(snapshot.id);setResult(r);setSignature(config);setAudit({settings,policy:{...policy},start,end,tickers,starting,...r});
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const active=runs.find(r=>r.id===activeId)??runs.at(-1);
 const comparison=active?comparableRuns(runs,active.comparisonKey):[];
 const stale=result&&signature!==config;
 function load(r:HindsightRun){setStart(r.start);setEnd(r.end);setPolicy({...defaults,...r.policy});setName(r.name+' variant');onLoadSettings(r.name,r.modelSignature);}
 return <details id="hindsight-lab" className="panel optimizer-config optimizer-backtest"><summary>Hindsight Lab · compare models & rebalance rules</summary>
 <p className="optimizer-factor-note">Run the selected setup through history, change its settings, then run again to compare. Each decision uses preceding observations. Published factor histories can contain later revisions; see About.</p>
 {unavailable?<p className="optimizer-error">{unavailable}</p>:<><fieldset disabled={busy} className="optimizer-config-controls hindsight-controls">
 <label>Run name<input aria-label="Hindsight run name" value={name} placeholder={`Run ${runs.length+1}`} onChange={e=>setName(e.target.value)}/></label>
 <label>From<input aria-label="Hindsight start date" type="date" min={earliest} max={end} value={start} onChange={e=>setStart(e.target.value)}/></label>
 <label>To<input aria-label="Hindsight end date" type="date" min={start} max={payload.asOf??''} value={end} onChange={e=>setEnd(e.target.value)}/></label>
 <label>Optimization opportunities<select value={policy.interval} onChange={e=>patch({interval:e.target.value as ReoptimizationPolicy['interval']})}>{['Once','Daily','Weekly','Monthly','Quarterly','Every N sessions'].map(x=><option key={x}>{x}</option>)}</select></label>
 {policy.interval==='Every N sessions'&&<label>Interval (trading sessions)<input type="number" min="1" max="2520" step="1" value={policy.intervalSessions??21} onChange={e=>patch({intervalSessions:Number(e.target.value)})}/></label>}
 <label>Minimum holding time (sessions)<input aria-label="Minimum holding time in trading sessions" disabled={policy.interval==='Once'} type="number" min="0" max="2520" step="1" value={policy.minHoldingSessions??0} onChange={e=>patch({minHoldingSessions:Number(e.target.value)})}/></label>
 <label>Re-optimize when<select value={policy.trigger} disabled={policy.interval==='Once'} onChange={e=>patch({trigger:e.target.value as ReoptimizationPolicy['trigger']})}>{['Interval','Weight drift','Volatility ceiling','Interval or threshold'].map(x=><option key={x}>{x}</option>)}</select></label>
 {['Weight drift','Interval or threshold'].includes(policy.trigger)&&<label>Weight drift (pp)<input type="number" min="0" step=".5" value={policy.drift*100} onChange={e=>patch({drift:Number(e.target.value)/100})}/></label>}
 {['Volatility ceiling','Interval or threshold'].includes(policy.trigger)&&<label>Annual volatility ceiling (%)<input type="number" min="0" value={policy.volatility*100} onChange={e=>patch({volatility:Number(e.target.value)/100})}/></label>}
 <label>Execution cost (bps)<input type="number" min="0" max="1000" value={policy.costBps} onChange={e=>patch({costBps:Number(e.target.value)})}/></label>
 <label>Short borrow (%/year)<input type="number" min="0" value={policy.borrowRate*100} onChange={e=>patch({borrowRate:Number(e.target.value)/100})}/></label>
 <label>Cash borrowing (%/year)<input type="number" min="0" value={policy.financingRate*100} onChange={e=>patch({financingRate:Number(e.target.value)/100})}/></label>
 <label><input type="checkbox" checked={policy.costGate} onChange={e=>patch({costGate:e.target.checked})}/>Require risk benefit to exceed trading cost</label>
 {policy.costGate&&<><label>Risk aversion<input type="number" min=".1" step=".1" value={policy.riskAversion} onChange={e=>patch({riskAversion:Number(e.target.value)})}/></label><label>Benefit horizon (sessions)<input type="number" min="1" value={policy.horizon} onChange={e=>patch({horizon:Number(e.target.value)})}/></label></>}
 <button onClick={run}>{busy?`Testing… ${Math.round(progress*100)}%`:'Run and compare'}</button></fieldset>
 <p className="optimizer-factor-note">Available from {earliest}. Holding time applies between executed rebalances, including threshold trades; 0 removes that limit. <a href="#about" onClick={()=>window.dispatchEvent(new CustomEvent('factorscope-open-about'))}>Methodology in About</a></p></>}
 {error&&<p className="optimizer-error" role="alert">{error}</p>}{storageNotice&&<p role="status">{storageNotice}</p>}
 {result&&<><header className="panel-title"><h3>Latest run · {result.dates[0]} — {result.dates.at(-1)}</h3><button onClick={()=>download('hindsight-decisions.json',audit)}>Export decisions</button></header>{stale&&<p role="status">Settings changed. Run again to add a comparison; previous results retain their original settings.</p>}<p className="optimizer-factor-note">{result.events.filter(e=>e.status==='Traded').length} rebalances · {result.holdingChecksSkipped} checks deferred by minimum holding time.</p><details><summary>Decision history · {result.decisions} optimization checks</summary><div className="strategy-decision-scroll"><table><thead><tr><th>Decision</th><th>Execution</th><th>Result</th><th>Traded weight</th></tr></thead><tbody>{result.events.map((e,i)=><tr key={i}><td>{e.decisionDate}</td><td>{e.executionDate||'—'}</td><td>{e.status}</td><td>{pct(e.turnover)}</td></tr>)}</tbody></table></div></details></>}
 {runs.length>0&&<><header className="panel-title"><h3>Compare saved runs</h3><button onClick={()=>download('hindsight-runs.json',runs)}>Export runs</button></header><div className="optimizer-config-controls"><label>Comparison period<select aria-label="Select hindsight comparison" value={active?.id??''} onChange={e=>setActiveId(e.target.value)}>{runs.map(r=><option key={r.id} value={r.id}>{r.name} · {r.start} — {r.end}</option>)}</select></label><span>Matching dates, starting allocation, universe and price history · {comparison.length} runs</span></div>
 <div className="hindsight-table-scroll"><table className="hindsight-table"><thead><tr><th>Run / model</th><th>Rebalance rule</th><th>Minimum hold</th><th>Sharpe</th><th>Return</th><th>Volatility</th><th>Drawdown</th><th>Trades</th><th>Turnover</th><th>Trading costs*</th><th/></tr></thead><tbody>{comparison.map(r=><tr key={r.id}><th>{r.name}<small>{r.modelLabel} · Sharpe over {r.sharpeBenchmark??"BIL (saved run)"}</small></th><td>{r.policy.interval==='Every N sessions'?`Every ${r.policy.intervalSessions} sessions`:r.policy.interval}<small>{r.policy.trigger}</small></td><td>{r.policy.minHoldingSessions??0} sessions</td><td><strong>{r.sharpe?.toFixed(2)??'—'}</strong></td><td>{pct(r.totalReturn)}</td><td>{pct(r.volatility)}</td><td>{pct(r.maxDrawdown)}</td><td>{r.trades}</td><td>{pct(r.turnover)}</td><td>{pct(r.cost)}</td><td><button disabled={busy} onClick={()=>load(r)}>Load setup</button></td></tr>)}</tbody></table></div><p className="optimizer-factor-note">*Execution costs as a share of starting capital. Returns also include configured borrowing costs. Home-page Sharpe for the active run: {active?.baselineSharpe?.toFixed(2)??'unavailable'}. Latest 12 runs are saved in this browser.</p>
 <details><summary>Saved model and rule settings</summary>{comparison.map(r=><details key={r.id}><summary>{r.name}</summary><pre className="hindsight-settings">{JSON.stringify({model:JSON.parse(r.modelSignature),rules:r.policy},null,2)}</pre></details>)}</details></>}
 </details>;
}
