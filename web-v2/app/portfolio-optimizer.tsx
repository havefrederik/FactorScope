"use client";
import { useMemo,useState } from "react";
import { buildAnalytics,buildFactorModel,type CovarianceForecastAnalytics,type MarketPayload } from "@/lib/analytics";
import { optimizePortfolio,type OptimizerResult,type ExposureLimit } from "@/lib/portfolio-optimizer";

type Holding={ticker:string;name:string;value:number};
type FactorLimit={on:boolean;min:string;max:string};
const percent=(n:number)=>`${(Math.abs(n)<.00005?0:n*100).toFixed(2)}%`;
const delta=(n:number)=>`${Math.abs(n)<.00005||n>=0?"+":""}${(Math.abs(n)<.00005?0:n*100).toFixed(2)} pp`;
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(Math.abs(n)<.5?0:n);
const dot=(a:number[],b:number[])=>a.reduce((s,v,i)=>s+v*b[i],0);

export default function PortfolioOptimizer({holdings,payload,forecast,onApply,onSelectTicker}:{holdings:Holding[];payload:MarketPayload;forecast:CovarianceForecastAnalytics|null;onApply:(weights:Record<string,number>,asOf:string)=>void;onSelectTicker:(ticker:string)=>void}){
  const total=holdings.reduce((s,h)=>s+h.value,0),tickers=forecast?.tickers??[];
  const current=tickers.map(ticker=>(holdings.find(h=>h.ticker===ticker)?.value??0)/total);
  const [objective,setObjective]=useState<"Minimum volatility"|"Maximum Sharpe">("Minimum volatility");
  const [longOnly,setLongOnly]=useState(!holdings.some(h=>h.ticker!=="CASH"&&h.value<0));
  const [net,setNet]=useState(Number((current.reduce((a,b)=>a+b,0)*100).toFixed(4)));
  const [gross,setGross]=useState(longOnly?100:200),[cap,setCap]=useState(5);
  const [turnOn,setTurnOn]=useState(true),[turn,setTurn]=useState(30);
  const [changeOn,setChangeOn]=useState(false),[change,setChange]=useState(5);
  const [locked,setLocked]=useState<string[]>([]),[returns,setReturns]=useState<Record<string,string>>({});
  const [limits,setLimits]=useState<Record<string,FactorLimit>>({});
  const [result,setResult]=useState<{data:OptimizerResult;forecast:CovarianceForecastAnalytics}|null>(null),[error,setError]=useState("");
  const [running,setRunning]=useState(false);
  const factors=useMemo(()=>{
    if(!forecast)return [];
    const dates=(payload.series.SPY?.points??[]).filter(point=>point.date<=forecast.asOf).slice(-253);
    if(dates.length<41)return [];
    const models=forecast.tickers.map(ticker=>{const analytics=buildAnalytics(payload,[{ticker,value:1}],{startDate:dates[0].date,endDate:forecast.asOf});return analytics?buildFactorModel(payload,analytics,1):null;});
    if(models.some(model=>!model))return [];
    return models[0]!.factors.map(factor=>({name:factor.name,group:factor.group,values:models.map(model=>model!.factors.find(item=>item.name===factor.name)!.exposure)}));
  },[payload,forecast]);
  function edited(){setResult(null);setError("");}
  function editLimit(name:string,patch:Partial<FactorLimit>){edited();setLimits(previous=>({...previous,[name]:{...(previous[name]??{on:false,min:"",max:""}),...patch}}));}
  async function run(){
    edited();if(!forecast)return;
    const exposures:ExposureLimit[]=[];
    for(const factor of factors){const limit=limits[factor.name];if(!limit?.on)continue;if(!limit.min.trim()&&!limit.max.trim()){setError(`Enter a minimum or maximum for ${factor.name}.`);return;}exposures.push({name:factor.name,values:factor.values,min:limit.min.trim()?Number(limit.min):null,max:limit.max.trim()?Number(limit.max):null});}
    setRunning(true);
    // Let the browser paint the pending state before the bounded numerical solve.
    await new Promise<void>(resolve=>setTimeout(resolve,20));
    try{const solved=optimizePortfolio({covariance:forecast.covarianceMatrix,current,objective,expectedReturns:tickers.map(ticker=>Number(returns[ticker]||0)/100),longOnly,net:net/100,gross:gross/100,positionCap:cap/100,turnoverCap:turnOn?turn/100:null,changeCap:changeOn?change/100:null,locked:locked.map(ticker=>tickers.indexOf(ticker)),exposures});setResult({data:solved,forecast});if(solved.status!=="Solved")setError(solved.message);}catch{setError("The optimization could not be completed. Review the inputs and try again.");}finally{setRunning(false);}
  }
  const uncovered=holdings.filter(h=>h.ticker!=="CASH"&&Math.abs(h.value)>1e-8&&!tickers.includes(h.ticker));
  if(!forecast||uncovered.length||new Set(tickers).size!==tickers.length)return <section className="panel data-state"><div><strong>Optimizer risk data unavailable</strong><p>{new Set(tickers).size!==tickers.length?"Combine duplicate ticker rows into one net position before optimization.":uncovered.length?`Missing covariance coverage for ${uncovered.map(h=>h.ticker).join(", ")}. All held assets must be covered.`:"Choose an allocation date with enough aligned history for CM-IEWMA."}</p></div></section>;
  const proposed=result?.forecast===forecast&&result.data.status==="Solved"?result.data:null;
  const currentGross=current.reduce((s,v)=>s+Math.abs(v),0),currentNet=current.reduce((a,b)=>a+b,0);
  const activeFactors=factors.filter(f=>limits[f.name]?.on);
  const summary=proposed?[
    {name:"Forecast annual volatility",current:percent(proposed.currentVolatility),proposed:percent(proposed.volatility),change:delta(proposed.volatility-proposed.currentVolatility)},
    {name:"Gross exposure",current:percent(currentGross),proposed:percent(proposed.gross),change:delta(proposed.gross-currentGross)},
    {name:"Net exposure",current:percent(currentNet),proposed:percent(1-proposed.cash),change:delta(1-proposed.cash-currentNet)},
    {name:"Cash / collateral",current:percent(1-currentNet),proposed:percent(proposed.cash),change:delta(proposed.cash-(1-currentNet))},
  ]:[];
  function factorTable(sector:boolean){return <table className="optimizer-factor-table"><thead><tr><th>Factor</th><th>Current</th><th>Min</th><th>Max</th><th>On</th></tr></thead><tbody>{factors.filter(factor=>(factor.group==="Sector")===sector).map(factor=>{const limit=limits[factor.name]??{on:false,min:"",max:""};return <tr key={factor.name}><th>{factor.name}</th><td>{dot(factor.values,current).toFixed(3)}</td><td><input aria-label={`${factor.name} minimum exposure`} type="number" step="0.01" disabled={!limit.on||running} value={limit.min} placeholder="−∞" onChange={e=>editLimit(factor.name,{min:e.target.value})}/></td><td><input aria-label={`${factor.name} maximum exposure`} type="number" step="0.01" disabled={!limit.on||running} value={limit.max} placeholder="+∞" onChange={e=>editLimit(factor.name,{max:e.target.value})}/></td><td><input aria-label={`Enable ${factor.name} constraint`} type="checkbox" checked={limit.on} disabled={running} onChange={e=>editLimit(factor.name,{on:e.target.checked})}/></td></tr>;})}</tbody></table>;}
  return <section className="optimizer-workspace">
    <div className="optimizer-toolbar"><span>CM-IEWMA · as of <b>{forecast.asOf}</b> · {tickers.length} existing assets</span><div><button disabled={running} onClick={run}>{running?"Solving…":"Run optimization"}</button><button className="optimizer-apply" disabled={!proposed||running} onClick={()=>proposed&&onApply(Object.fromEntries(tickers.map((ticker,i)=>[ticker,proposed.weights[i]])),forecast.asOf)}>Apply to comparison →</button></div></div>
    <fieldset className="optimizer-inputs" disabled={running}>
      <article className="panel optimizer-objective"><header className="panel-title"><h3>Objective</h3></header><div className="optimizer-fields">
        <label>Optimize for<select aria-label="Optimization objective" value={objective} onChange={e=>{edited();setObjective(e.target.value as typeof objective);}}><option>Minimum volatility</option><option>Maximum Sharpe</option></select></label>
        <p>{objective==="Minimum volatility"?"Minimize forecast portfolio variance under the enabled constraints.":"Maximize assumed excess return divided by forecast volatility. Enter your annual expected excess returns in the allocation table below."}</p>
        <label>Position sides<select aria-label="Optimizer position sides" value={longOnly?"Long only":"Long and short"} onChange={e=>{edited();setLongOnly(e.target.value==="Long only");}}><option>Long only</option><option>Long and short</option></select></label>
        <div className="optimizer-universe">Current universe <b>{tickers.length} assets</b><small>No new assets are added. Lock individual positions in the allocation table.</small></div>
      </div></article>
      <article className="panel optimizer-constraints"><header className="panel-title"><h3>Portfolio constraints</h3><span>% of NAV</span></header><div className="optimizer-fields">
        <label>Net exposure target (%)<input aria-label="Optimizer net exposure target" type="number" min="-100" max="100" step="1" value={net} onChange={e=>{edited();setNet(e.target.valueAsNumber);}}/></label>
        <label>Maximum gross exposure (%)<input aria-label="Optimizer gross exposure limit" type="number" min="0" max="500" step="5" value={gross} onChange={e=>{edited();setGross(e.target.valueAsNumber);}}/></label>
        <label>Maximum absolute position (%)<input aria-label="Optimizer position cap" type="number" min="0.1" max="100" step="0.5" value={cap} onChange={e=>{edited();setCap(e.target.valueAsNumber);}}/></label>
        <label className="optimizer-toggle"><span><input aria-label="Enable turnover limit" type="checkbox" checked={turnOn} onChange={e=>{edited();setTurnOn(e.target.checked);}}/>Max traded weight (%)</span><input aria-label="Optimizer turnover limit" type="number" min="0" step="5" disabled={!turnOn} value={turn} onChange={e=>{edited();setTurn(e.target.valueAsNumber);}}/></label>
        <label className="optimizer-toggle"><span><input aria-label="Enable position change limit" type="checkbox" checked={changeOn} onChange={e=>{edited();setChangeOn(e.target.checked);}}/>Max position change (pp)</span><input aria-label="Optimizer position change limit" type="number" min="0" step="0.5" disabled={!changeOn} value={change} onChange={e=>{edited();setChange(e.target.valueAsNumber);}}/></label>
        <small>Gross = sum of absolute stock weights. Traded weight = sum of absolute stock-weight changes; cash is excluded. Cash or collateral is 1 minus net exposure.</small>
      </div></article>
      <article className="panel optimizer-factors"><header className="panel-title"><h3>Factor constraints</h3><span>Exposure units</span></header>{factors.length?<><details open><summary>Market & styles</summary>{factorTable(false)}</details><details><summary>Sectors</summary>{factorTable(true)}</details><p className="optimizer-factor-note">Loadings use up to 252 preceding sessions through {forecast.asOf}. Within each factor block, exposures are conditional on the ETF proxy model.</p></>:<p className="optimizer-factor-note">Aligned factor history is unavailable. Portfolio constraints remain usable.</p>}</article>
    </fieldset>
    {error&&<p className="optimizer-error" role="alert">{error}</p>}
    {proposed&&<article className="panel optimizer-summary"><header className="panel-title"><h3>Optimization preview</h3><span>{proposed.iterations} iterations · all limits passed</span></header><table><thead><tr><th>Measure</th><th>Current</th><th>Proposed</th><th>Change</th></tr></thead><tbody>{summary.map(row=><tr key={row.name}><th>{row.name}</th><td>{row.current}</td><td>{row.proposed}</td><td>{row.change}</td></tr>)}{activeFactors.map(factor=>{const before=dot(factor.values,current),after=dot(factor.values,proposed.weights);return <tr key={factor.name}><th>{factor.name} exposure</th><td>{before.toFixed(3)}</td><td>{after.toFixed(3)}</td><td>{(after-before).toFixed(3)}</td></tr>;})}<tr><th>Estimated traded notional</th><td>—</td><td>{money(proposed.turnover*total)}</td><td>{percent(proposed.turnover)} of NAV</td></tr>{objective==="Maximum Sharpe"&&<><tr><th>Assumed annual excess return</th><td>{percent(dot(tickers.map(t=>Number(returns[t]||0)/100),current))}</td><td>{percent(proposed.expectedReturn!)}</td><td>Input assumption</td></tr><tr><th>Assumed Sharpe</th><td>—</td><td>{proposed.assumedSharpe?.toFixed(3)??"—"}</td><td>Before trading / borrow costs</td></tr></>}</tbody></table></article>}
    <article className="panel optimizer-allocations"><header className="panel-title"><h3>Universe & allocation</h3><span>Exact weights and trades</span></header>{objective==="Maximum Sharpe"&&<p className="optimizer-factor-note">Expected excess returns are your annual assumptions. Blank = 0%. FactorScope does not supply an alpha forecast.</p>}<div className="optimizer-allocation-scroll"><table><thead><tr><th>Asset</th><th>Lock</th>{objective==="Maximum Sharpe"&&<th>Expected excess return (% p.a.)</th>}<th>Current</th><th>Proposed</th><th>Change</th><th>Trade value</th></tr></thead><tbody>{tickers.map((ticker,i)=>{const weight=proposed?.weights[i];return <tr key={ticker}><th><button className="lab-stock" onClick={()=>onSelectTicker(ticker)}>{ticker} ↗</button><small>{holdings.find(h=>h.ticker===ticker)?.name}</small></th><td><input aria-label={`Lock ${ticker} weight`} type="checkbox" disabled={running} checked={locked.includes(ticker)} onChange={e=>{edited();setLocked(previous=>e.target.checked?[...previous,ticker]:previous.filter(value=>value!==ticker));}}/></td>{objective==="Maximum Sharpe"&&<td><input aria-label={`${ticker} expected annual excess return`} type="number" step="0.5" placeholder="0" value={returns[ticker]??""} disabled={running} onChange={e=>{edited();setReturns(previous=>({...previous,[ticker]:e.target.value}));}}/></td>}<td>{percent(current[i])}</td><td>{weight===undefined?"—":percent(weight)}</td><td>{weight===undefined?"—":delta(weight-current[i])}</td><td>{weight===undefined?"—":money((weight-current[i])*total)}</td></tr>;})}<tr><th>CASH / COLLATERAL</th><td/>{objective==="Maximum Sharpe"&&<td/>}<td>{percent(1-currentNet)}</td><td>{proposed?percent(proposed.cash):"—"}</td><td>{proposed?delta(proposed.cash-(1-currentNet)):"—"}</td><td>{proposed?money((proposed.cash-(1-currentNet))*total):"—"}</td></tr></tbody></table></div></article>
    <details className="panel optimizer-method"><summary>Method and constraint audit</summary><p>The optimizer uses the current CM-IEWMA covariance forecast. Minimum volatility solves a convex quadratic program; maximum Sharpe uses a positive excess-return normalization of the same constrained problem. Position, turnover, gross/net and enabled factor bounds are checked again on the returned weights. Comparison uses a fixed-allocation historical replay; it does not establish future performance. Apply to comparison does not execute trades or replace uploaded holdings.</p>{proposed&&<><p>Primal residual {proposed.primalResidual.toExponential(2)} · dual residual {proposed.dualResidual.toExponential(2)}</p><table><thead><tr><th>Constraint</th><th>Proposed</th><th>Min</th><th>Max</th><th>Audit</th></tr></thead><tbody>{proposed.audit.map((item,i)=><tr key={`${item.name}-${i}`}><th>{item.name}</th><td>{item.proposed.toFixed(6)}</td><td>{item.min?.toFixed(6)??"—"}</td><td>{item.max?.toFixed(6)??"—"}</td><td>{item.passed?"Pass":"Fail"}</td></tr>)}</tbody></table></>}</details>
  </section>;
}
