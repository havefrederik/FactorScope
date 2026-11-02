import type { MarketPayload } from './analytics.ts';
import { optimizePortfolio, type OptimizerInput } from './portfolio-optimizer.ts';
export type ReoptimizationPolicy={interval:'Once'|'Daily'|'Weekly'|'Monthly'|'Quarterly';trigger:'Interval'|'Weight drift'|'Volatility ceiling'|'Interval or threshold';drift:number;volatility:number;costBps:number;costGate:boolean;riskAversion:number;horizon:number;borrowRate:number;financingRate:number};
export type ReoptimizationEvent={decisionDate:string;executionDate:string;status:string;turnover:number;cost:number;forecastVolatility:number;weights:number[]};
const variance=(w:number[],c:number[][])=>w.reduce((s,v,i)=>s+v*c[i].reduce((q,x,j)=>q+x*w[j],0),0);
function bucket(date:string,interval:ReoptimizationPolicy['interval']){const d=new Date(date+'T00:00:00Z');return interval==='Daily'?date:interval==='Weekly'?Math.floor((+d+3*86400000)/(7*86400000)):interval==='Quarterly'?date.slice(0,4)+'-'+Math.floor(d.getUTCMonth()/3):date.slice(0,7);}
/** Decisions use close t information, execute at t+1 close, and earn returns from t+2.
 * The caller must construct a dated risk model; no end-of-window covariance is reused. */
export async function backtestOptimizer(payload:MarketPayload,tickers:string[],start:string,end:string,initial:number[],policy:ReoptimizationPolicy,model:(date:string,weights:number[])=>OptimizerInput,onProgress?:(fraction:number)=>void){
 if(![policy.drift,policy.volatility,policy.costBps,policy.riskAversion,policy.horizon,policy.borrowRate,policy.financingRate].every(Number.isFinite)||policy.costBps<0||policy.costBps>1000||policy.drift<0||policy.volatility<0||policy.horizon<1||policy.riskAversion<=0||policy.borrowRate<0||policy.financingRate<0)throw Error('Check the rebalance and cost settings.');
 const prices=tickers.map(t=>new Map(payload.series[t]?.points.map(p=>[p.date,p.close])??[])),cashPrices=new Map(payload.series.BIL?.points.map(p=>[p.date,p.close])??[]);
 const calendar=(payload.series.SPY?.points??[]).map(p=>p.date).filter(d=>d<=end);
 const dates=calendar.filter(d=>d>=start);if(dates.length<3)throw Error('Choose at least three trading dates.');
 for(const map of prices)if(dates.some(d=>!(map.get(d)!>0)))throw Error('Every selected security needs complete price coverage for the test period. Choose a later start.');
 if(dates.some(d=>!(cashPrices.get(d)!>0)))throw Error('The test requires a complete BIL cash benchmark.');
 if(initial.length!==tickers.length||initial.some(v=>!Number.isFinite(v)))throw Error('Invalid starting allocation.');
 let values=initial.slice(),cash=1-initial.reduce((s,v)=>s+v,0),nav=1,lastTarget=initial.slice(),pending:{date:string;target:number[];vol:number}|null=null;
 const curve=[1],events:ReoptimizationEvent[]=[],weightsHistory=[initial.slice()];let decisions=0,totalCosts=0;
 for(let d=0;d<dates.length;d++){
  if(d>0){const previous=dates[d-1];values=values.map((v,i)=>v*prices[i].get(dates[d])!/prices[i].get(previous)!);
   cash*=cash>=0?cashPrices.get(dates[d])!/cashPrices.get(previous)!:1+policy.financingRate/252;
   cash-=values.reduce((s,v)=>s+Math.max(0,-v),0)*policy.borrowRate/252;nav=cash+values.reduce((s,v)=>s+v,0);
   if(pending){let after=nav;const rate=policy.costBps/10000;for(let q=0;q<40;q++)after=nav-rate*values.reduce((s,v,i)=>s+Math.abs(pending!.target[i]*after-v),0);
    const turnover=values.reduce((s,v,i)=>s+Math.abs(pending!.target[i]*after-v),0)/nav,cost=nav-after;totalCosts+=cost;
    values=pending.target.map(w=>w*after);cash=after-values.reduce((s,v)=>s+v,0);nav=after;lastTarget=pending.target.slice();
    events.push({decisionDate:pending.date,executionDate:dates[d],status:'Traded',turnover,cost,forecastVolatility:pending.vol,weights:lastTarget.slice()});pending=null;
   }
   if(!(nav>0)||!Number.isFinite(nav))throw Error(`Capital exhausted on ${dates[d]}.`);curve.push(nav);weightsHistory.push(values.map(v=>v/nav));
  }
  if(d===dates.length-1)break;
  const current=values.map(v=>v/nav),scheduled=d===0||(policy.interval!=='Once'&&bucket(dates[d],policy.interval)!==bucket(dates[d-1],policy.interval));
  const drift=Math.max(...current.map((v,i)=>Math.abs(v-lastTarget[i])))>=policy.drift;
  let input:OptimizerInput|undefined;
  const needsRisk=policy.trigger==='Volatility ceiling'||policy.trigger==='Interval or threshold';
  if(needsRisk)input=model(dates[d],current);
  const breached=needsRisk&&Math.sqrt(Math.max(0,variance(current,input!.covariance)))>policy.volatility;
  const trigger=d===0||policy.interval!=='Once'&&(policy.trigger==='Interval'?scheduled:policy.trigger==='Weight drift'?drift:policy.trigger==='Volatility ceiling'?breached:scheduled||drift||breached);
  if(trigger){input??=model(dates[d],current);decisions++;
   const solved=optimizePortfolio(input);if(solved.status!=='Solved')throw Error(`${dates[d]}: ${solved.message}`);
   const turnover=solved.weights.reduce((s,w,i)=>s+Math.abs(w-current[i]),0),cost=turnover*policy.costBps/10000;
   // Risk-only certainty-equivalent gain; never interprets relative scores as forecast returns.
   const riskGain=.5*policy.riskAversion*(variance(current,input.covariance)-variance(solved.weights,input.covariance))*policy.horizon/252;
   if(policy.costGate&&riskGain<=cost){events.push({decisionDate:dates[d],executionDate:'',status:'Skipped: cost gate',turnover,cost:0,forecastVolatility:solved.volatility,weights:current});}
   else if(turnover>1e-7)pending={date:dates[d],target:solved.weights,vol:solved.volatility};
  }
  if(d%10===0){onProgress?.(d/dates.length);await new Promise<void>(resolve=>setTimeout(resolve,0));}
 }
 onProgress?.(1);return {dates,curve,dailyReturns:curve.slice(1).map((v,i)=>v/curve[i]-1),events,decisions,totalCosts,weightsHistory};
}
