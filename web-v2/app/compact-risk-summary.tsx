"use client";
import {useState} from 'react';
import type {CovarianceForecastAnalytics} from '@/lib/analytics';
import {portfolioRiskSummary} from '@/lib/portfolio-risk-summary';
import {horizonLabel} from '@/lib/forecast-horizon';

const pct=(v:number|null)=>v===null?'—':`${(Math.abs(v)<.00005?0:100*v).toFixed(1)}%`;
const num=(v:number|null)=>v===null?'—':(Math.abs(v)<.0005?0:v).toFixed(2);
const usd=(v:number|null)=>v===null?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:2}).format(Math.abs(v)<.5?0:v);
type Summary=ReturnType<typeof portfolioRiskSummary>;
type Props={forecast:CovarianceForecastAnalytics|null;weights:Record<string,number>;capital:number;alternative?:Record<string,number>;alternativeLabel?:string;error?:string;onSelectTicker?:(ticker:string)=>void;onMethodology?:()=>void};
export default function CompactRiskSummary({forecast,weights,capital,alternative,alternativeLabel='Proposed',error,onSelectTicker,onMethodology}:Props){
  const [basis,setBasis]=useState<'capital'|'gross'>('capital');
  let current:Summary|null=null,after:Summary|null=null,issue=error;
  try{if(forecast&&!issue){current=portfolioRiskSummary(forecast,weights,capital,basis);if(alternative)after=portfolioRiskSummary(forecast,alternative,capital,basis)}}catch(e){issue=(e as Error).message}
  const rows:{label:string;value:(s:Summary)=>string;detail?:(s:Summary)=>string;delta?:(a:Summary,b:Summary)=>string}[]=[
    {label:`Volatility · ${horizonLabel(forecast?.forecastSessions??1).toLowerCase()}`,value:s=>pct(s.volatility),detail:s=>`${usd(s.dollarRisk)} · ${pct(s.annualVolatility)} annualized`,delta:(a,b)=>a.volatility===null||b.volatility===null?'—':`${((b.volatility-a.volatility)*100).toFixed(2)} pp`},
    {label:'Common / residual variance',value:s=>`${pct(s.commonShare)} / ${pct(s.residualShare)}`},
    {label:'Model market beta',value:s=>num(s.beta),detail:s=>`${usd(s.dollarBeta)} equivalent`,delta:(a,b)=>a.beta===null||b.beta===null?'—':num(b.beta-a.beta)},
    {label:'Beta contribution · long / short',value:s=>`${num(s.longBeta)} / ${num(s.shortBeta)}`},
    {label:'Gross / net exposure',value:s=>`${pct(s.gross)} / ${pct(s.net)}`,detail:s=>`${usd(s.grossDollars)} / ${usd(s.netDollars)}`},
    {label:'Long / short exposure',value:s=>`${pct(s.long)} / ${pct(s.short)}`},
    {label:'Positions · effective / actual',value:s=>`${s.effectivePositions.toFixed(1)} / ${s.positions}`},
    {label:'Top 5 weight · % gross',value:s=>pct(s.topFiveWeight)},
    {label:'Top 5 share of variance',value:s=>pct(s.topFiveRisk)},
  ];
  return <section className={`panel compact-risk-summary ${alternative?'risk-summary-comparison':''}`} aria-label={alternative?'Before and after risk summary':'Portfolio forecast risk summary'}>
    <header className="risk-summary-heading"><h3>{alternative?'Before & after risk':'Forecast risk'}</h3><div className="risk-summary-basis" role="group" aria-label="Risk display basis"><button aria-pressed={basis==='capital'} onClick={()=>setBasis('capital')}>% Capital</button><button aria-pressed={basis==='gross'} onClick={()=>setBasis('gross')}>% Gross</button></div></header>
    <div className="risk-summary-context">{forecast?`${forecast.asOf} · ${forecast.modelLabel??'CM-IEWMA'}`:'Forecast unavailable'}</div>
    {!current||alternative&&!after?<p className="risk-summary-unavailable" role="status">{issue||'Complete dated risk data is unavailable for these holdings.'}</p>:<>
      <div className="risk-summary-table"><table><thead><tr><th>Measure</th><th>{alternative?'Current':basis==='gross'?'Gross basis':'Capital basis'}</th>{after&&<><th>{alternativeLabel}</th><th>Change</th></>}</tr></thead><tbody>{rows.map(row=><tr key={row.label}><th>{row.label}</th><td>{row.value(current!)}{row.detail&&<small>{row.detail(current!)}</small>}</td>{after&&<><td>{row.value(after)}{row.detail&&<small>{row.detail(after)}</small>}</td><td>{row.delta?.(current!,after)??'—'}</td></>}</tr>)}</tbody></table></div>
      <details className="risk-summary-contributors"><summary>Largest risk contributors</summary><table><thead><tr><th>Stock</th><th>Current</th>{after&&<th>{alternativeLabel}</th>}</tr></thead><tbody>{(after??current).contributors.slice(0,5).map(p=>{const before=current!.contributors.find(c=>c.ticker===p.ticker)?.riskShare??(current!.annualDollarRisk>1e-8?0:null);return <tr key={p.ticker}><th>{onSelectTicker?<button onClick={()=>onSelectTicker(p.ticker)}>{p.ticker} ↗</button>:p.ticker}</th><td>{pct(before)}</td>{after&&<td>{pct(p.riskShare)}</td>}</tr>})}</tbody></table></details>
    </>}
    <footer><button onClick={onMethodology??(()=>window.dispatchEvent(new CustomEvent('factorscope-open-about')))}>Definitions in About ↗</button>{current&&current.commonShare===null&&<span>Factor split unavailable</span>}{current&&current.beta===null&&<span>Market beta unavailable</span>}</footer>
  </section>;
}
