"use client";
import { useMemo, useState, type ReactNode } from "react";
import { buildAnalytics, buildPortfolioDecomposition, type MarketPayload, type PortfolioAnalytics, type SecurityDecomposition } from "@/lib/analytics";
import { coveredHistoricalScenario, modeledScenario, type ScenarioHolding } from "@/lib/scenario-analysis";

const money=(value:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(value);
const pct=(value:number)=>`${value>=0?"+":""}${(value*100).toFixed(2)}%`;
const events=[{id:"inflation",label:"2022 inflation selloff",start:"2022-01-03",end:"2022-10-12"},{id:"covid",label:"COVID selloff",start:"2020-02-19",end:"2020-03-23"},{id:"banks",label:"Regional-bank stress",start:"2023-03-08",end:"2023-03-24"},{id:"tech2024",label:"Summer 2024 selloff",start:"2024-07-16",end:"2024-08-05"}];
export default function ScenarioWorkspace({mode,setMode,market,setMarket,tech,setTech,total,holdings,analytics,payload,renderPerformance,renderDecomposition}:{mode:string;setMode:(v:"Modelled shock"|"Historical replay")=>void;market:number;setMarket:(n:number)=>void;tech:number;setTech:(n:number)=>void;total:number;holdings:ScenarioHolding[];analytics:PortfolioAnalytics;payload:MarketPayload;renderPerformance:(a:Pick<PortfolioAnalytics,"dates"|"curve"|"benchmarkCurve"|"startDate"|"endDate">)=>ReactNode;renderDecomposition:(a:SecurityDecomposition)=>ReactNode}){
  const [selected,setSelected]=useState("custom");
  const betas=useMemo(()=>Object.fromEntries(analytics.positions.map(p=>[p.ticker,p.beta])),[analytics]);
  const shocks=[{id:"market",label:"Market selloff",market:-10,tech:0},{id:"tech",label:"Technology stress",market:-5,tech:-15},{id:"broad",label:"Broad selloff",market:-20,tech:0},{id:"rally",label:"Market rally",market:10,tech:0},{id:"custom",label:"Custom shock",market,tech}];
  const modeled=useMemo(()=>shocks.map(s=>({...s,result:modeledScenario(holdings,betas,s.market,s.tech)})),[holdings,betas,market,tech]);
  const historical=useMemo(()=>events.map(e=>({...e,result:coveredHistoricalScenario(payload,holdings,e.start,e.end)})),[payload,holdings]);
  const isHistorical=mode==="Historical replay";
  const choices=(isHistorical?historical:modeled).map(s=>({id:s.id,label:s.label,impact:s.result?.impact??null})).sort((a,b)=>a.impact===null?1:b.impact===null?-1:a.impact-b.impact);
  const id=choices.some(c=>c.id===selected)?selected:choices[0]?.id;
  const selectedEvent=historical.find(s=>s.id===id);
  const selectedShock=modeled.find(s=>s.id===id);
  const result=isHistorical?selectedEvent?.result:selectedShock?.result;
  const impact=result?.impact??null;
  const positions=result?.positions??[];
  const eventAnalysis=useMemo(()=>isHistorical&&selectedEvent?.result.available?buildAnalytics(payload,holdings,{startDate:selectedEvent.start,endDate:selectedEvent.end}):null,[isHistorical,selectedEvent,payload,holdings]);
  const decomposition=useMemo(()=>eventAnalysis?buildPortfolioDecomposition(payload,eventAnalysis):null,[eventAnalysis,payload]);
  const scale=Math.max(1,...choices.map(c=>Math.abs(c.impact??0)));
  return <section className="stress-workspace">
    <div className="compare-review-header"><div><h3>Stress scenarios</h3><span>Current allocation · ranked by portfolio impact</span></div><div className="segmented">{(["Modelled shock","Historical replay"] as const).map(m=><button key={m} className={mode===m?"on":""} onClick={()=>{setMode(m);setSelected(m==="Historical replay"?"tech2024":"custom");}}>{m}</button>)}</div></div>
    <div className="stress-grid"><aside className="panel stress-rankings"><header className="panel-title"><h3>Scenario ranking</h3><span>Worst impact first</span></header>{choices.map(c=><button key={c.id} className={`stress-rank ${id===c.id?"active":""}`} aria-pressed={id===c.id} onClick={()=>setSelected(c.id)}><span>{c.label}</span><strong>{c.impact===null?"Unavailable":pct(c.impact/total)}</strong><i><b style={{width:`${Math.abs(c.impact??0)/scale*100}%`,background:(c.impact??0)<0?"#da8188":"#68c5ad"}}/></i></button>)}
      {!isHistorical&&<div className="stress-custom"><h3>Custom shock</h3><label>Market <strong>{market.toFixed(1)}%</strong><input aria-label="Custom market shock" type="range" min="-30" max="20" step=".5" value={market} onChange={e=>{setMarket(Number(e.target.value));setSelected("custom");}}/></label><label>Technology overlay <strong>{tech.toFixed(1)}%</strong><input aria-label="Custom technology overlay" type="range" min="-30" max="20" step=".5" value={tech} onChange={e=>{setTech(Number(e.target.value));setSelected("custom");}}/></label></div>}
    </aside><div className="stress-detail"><article className="panel"><header className="panel-title"><h3>{choices.find(c=>c.id===id)?.label}</h3><span>{isHistorical?`${selectedEvent?.start} — ${selectedEvent?.end}`:`Market ${selectedShock?.market}% · technology overlay ${selectedShock?.tech}%`}</span></header>{impact===null?<p className="compare-error" role="status">{isHistorical?`Full event coverage is unavailable for ${selectedEvent?.result.missing.length??0} positions. No portfolio result is reported.`:"Market sensitivities are missing for one or more positions."}</p>:<div className="stress-impact"><div><span>Portfolio impact</span><strong className={impact<0?"negative":"positive"}>{money(impact)}</strong></div><div><span>Return on portfolio value</span><strong>{pct(impact/total)}</strong></div></div>}
      {!isHistorical&&selectedShock?.result&&<div className="stress-components">{selectedShock.result.factors.map(f=><div key={f.name}><span>{f.name}</span><b>{money(f.impact)}</b><small>{pct(f.impact/total)}</small></div>)}</div>}
      {isHistorical&&!selectedEvent?.result.available&&<details className="stress-missing"><summary>Missing event coverage</summary><p>{selectedEvent?.result.missing.join(", ")}</p></details>}
    </article>
    {impact!==null&&<article className="panel compare-summary"><header className="panel-title"><h3>Position impacts</h3><span>Signed contribution to portfolio return</span></header><div className="stress-position-scroll"><table><thead><tr><th>Position</th><th>Weight</th><th>Impact</th><th>Contribution</th></tr></thead><tbody>{positions.map(p=><tr key={p.ticker}><th>{p.ticker}</th><td>{pct(p.value/total)}</td><td>{money(p.impact)}</td><td>{(p.impact/total*100).toFixed(2)} pp</td></tr>)}</tbody></table></div></article>}
    {isHistorical&&selectedEvent?.result.path&&<article className="panel"><header className="panel-title"><h3>Historical event path</h3><span>Current signed holdings</span></header>{renderPerformance(selectedEvent.result.path)}</article>}
    {isHistorical&&impact!==null&&!decomposition&&<p className="lab-note">Factor attribution is unavailable for this event: at least 40 aligned price observations and complete factor coverage are required.</p>}
    {decomposition&&<article className="panel"><header className="panel-title"><h3>Factor contributions during the event</h3><span>Cumulative through each date</span></header>{renderDecomposition(decomposition)}</article>}
    </div></div>
  </section>;
}
