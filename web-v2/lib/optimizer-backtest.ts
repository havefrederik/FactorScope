import {calibrateRisk,type RiskCheck} from './forecast-calibration.ts';
import type { MarketPayload } from './analytics.ts';
import { optimizePortfolio, type OptimizerInput } from './portfolio-optimizer.ts';
export type ReoptimizationPolicy={infeasibleAction?:'Hold existing positions'|'Stop the run';interval:'Once'|'Daily'|'Weekly'|'Monthly'|'Quarterly'|'Every N sessions';minHoldingSessions?:number;intervalSessions?:number;trigger:'Interval'|'Weight drift'|'Volatility ceiling'|'Interval or threshold';drift:number;volatility:number;costBps:number;costGate:boolean;riskAversion:number;horizon:number;borrowRate:number;financingRate:number};
export type ReoptimizationEvent={decisionDate:string;executionDate:string;status:string;turnover:number;cost:number;forecastVolatility:number;weights:number[];reason?:string;minimumTurnover?:number;turnoverLimit?:number;currentVolatility?:number;riskBenefit?:number;estimatedCost?:number};
/** Risk-only certainty-equivalent valuation, in fractions of decision-date NAV.
 * This deliberately excludes expected-return gains and is not forecast profit. */
export function riskReductionValue(currentVariance:number,proposedVariance:number,riskAversion:number,horizon:number){
 return .5*riskAversion*(currentVariance-proposedVariance)*horizon/252;
}
const variance=(w:number[],c:number[][])=>w.reduce((s,v,i)=>s+v*c[i].reduce((q,x,j)=>q+x*w[j],0),0);
function bucket(date:string,interval:ReoptimizationPolicy['interval']){const d=new Date(date+'T00:00:00Z');return interval==='Daily'?date:interval==='Weekly'?Math.floor((+d+3*86400000)/(7*86400000)):interval==='Quarterly'?date.slice(0,4)+'-'+Math.floor(d.getUTCMonth()/3):date.slice(0,7);}
/** Decisions use close t information, execute at t+1 close, and earn returns from t+2.
 * The caller must construct a dated risk model; no end-of-window covariance is reused. */
export async function backtestOptimizer(payload:MarketPayload,tickers:string[],start:string,end:string,initial:number[],policy:ReoptimizationPolicy,model:(date:string,weights:number[])=>OptimizerInput,onProgress?:(fraction:number)=>void){
 if(![policy.drift,policy.volatility,policy.costBps,policy.riskAversion,policy.horizon,policy.borrowRate,policy.financingRate].every(Number.isFinite)||policy.costBps<0||policy.costBps>1000||policy.drift<0||policy.volatility<0||policy.horizon<1||policy.riskAversion<=0||policy.borrowRate<0||policy.financingRate<0)throw Error('Check the rebalance and cost settings.');
 if(policy.infeasibleAction!==undefined&&!['Hold existing positions','Stop the run'].includes(policy.infeasibleAction))throw Error('Choose how to handle an infeasible rebalance.');
 const hold=policy.minHoldingSessions??0,every=policy.intervalSessions??21;
 if(!Number.isInteger(hold)||hold<0||hold>2520||!Number.isInteger(every)||every<1||every>2520)throw Error('Use whole trading-session counts: holding time 0–2520 and interval 1–2520.');
 const prices=tickers.map(t=>new Map(payload.series[t]?.points.map(p=>[p.date,p.close])??[])),cashPrices=new Map(payload.series.BIL?.points.map(p=>[p.date,p.close])??[]);
 const calendar=(payload.series.SPY?.points??[]).map(p=>p.date).filter(d=>d<=end);
 const dates=calendar.filter(d=>d>=start);if(dates.length<3)throw Error('Choose at least three trading dates.');
 for(const map of prices)if(dates.some(d=>!(map.get(d)!>0)))throw Error('Every selected security needs complete price coverage for the test period. Choose a later start.');
 if(dates.some(d=>!(cashPrices.get(d)!>0)))throw Error('The test requires a complete BIL cash benchmark.');
 if(initial.length!==tickers.length||initial.some(v=>!Number.isFinite(v)))throw Error('Invalid starting allocation.');
 let values=initial.slice(),cash=1-initial.reduce((s,v)=>s+v,0),nav=1,lastTarget=initial.slice(),pending:{date:string;target:number[];vol:number;review:Pick<ReoptimizationEvent,'currentVolatility'|'riskBenefit'|'estimatedCost'>}|null=null;
 const riskChecks:RiskCheck[]=[];
 const curve=[1],events:ReoptimizationEvent[]=[],weightsHistory=[initial.slice()];let decisions=0,totalCosts=0,lastExecution=-Infinity,holdingChecksSkipped=0;
 for(let d=0;d<dates.length;d++){
  if(d>0){const previous=dates[d-1];values=values.map((v,i)=>v*prices[i].get(dates[d])!/prices[i].get(previous)!);
   cash*=cash>=0?cashPrices.get(dates[d])!/cashPrices.get(previous)!:1+policy.financingRate/252;
   cash-=values.reduce((s,v)=>s+Math.max(0,-v),0)*policy.borrowRate/252;nav=cash+values.reduce((s,v)=>s+v,0);
   if(pending){let after=nav;const rate=policy.costBps/10000;for(let q=0;q<40;q++)after=nav-rate*values.reduce((s,v,i)=>s+Math.abs(pending!.target[i]*after-v),0);
    const turnover=values.reduce((s,v,i)=>s+Math.abs(pending!.target[i]*after-v),0)/nav,cost=nav-after;totalCosts+=cost;
    values=pending.target.map(w=>w*after);cash=after-values.reduce((s,v)=>s+v,0);nav=after;lastTarget=pending.target.slice();lastExecution=d;
    events.push({decisionDate:pending.date,executionDate:dates[d],status:'Traded',turnover,cost,forecastVolatility:pending.vol,weights:lastTarget.slice(),...pending.review});pending=null;
   }
   if(!(nav>0)||!Number.isFinite(nav))throw Error(`Capital exhausted on ${dates[d]}.`);curve.push(nav);weightsHistory.push(values.map(v=>v/nav));
  }
  if(d===dates.length-1)break;
  const current=values.map(v=>v/nav),scheduled=d===0||(policy.interval!=='Once'&&(policy.interval==='Every N sessions'?d%every===0:bucket(dates[d],policy.interval)!==bucket(dates[d-1],policy.interval)));
  // Holding time measures completed return intervals between executions. A new
  // target decided today executes tomorrow, so it may be eligible one day early.
  if(d>0&&(policy.interval==='Once'||d+1-lastExecution<hold)){
   if(policy.interval!=='Once')holdingChecksSkipped++;
   if(d%10===0){onProgress?.(d/dates.length);await new Promise<void>(resolve=>setTimeout(resolve,0));}
   continue;
  }
  const drift=Math.max(...current.map((v,i)=>Math.abs(v-lastTarget[i])))>=policy.drift;
  let input:OptimizerInput|undefined;
  const needsRisk=policy.trigger==='Volatility ceiling'||policy.trigger==='Interval or threshold';
  if(needsRisk)input=model(dates[d],current);
  const breached=needsRisk&&Math.sqrt(Math.max(0,variance(current,input!.covariance)))>policy.volatility;
  const trigger=d===0||policy.interval!=='Once'&&(policy.trigger==='Interval'?scheduled:policy.trigger==='Weight drift'?drift:policy.trigger==='Volatility ceiling'?breached:scheduled||drift||breached);
  if(trigger){input??=model(dates[d],current);decisions++;
   riskChecks.push({index:d,sessions:input.riskHorizonSessions??1,weights:current.slice(),annualVariance:variance(current,input.covariance),excess:input.riskReturnBasis==='excess'});
   const solved=optimizePortfolio(input);
   if(solved.status==='Infeasible'){
    if(policy.infeasibleAction==='Stop the run')throw Error(`${dates[d]}: ${solved.message} The run stopped as requested; incomplete results are not saved.`);
    events.push({decisionDate:dates[d],executionDate:'',status:'Skipped: infeasible limits',reason:solved.message,minimumTurnover:solved.minimumTurnover,turnoverLimit:solved.turnoverLimit,turnover:0,cost:0,forecastVolatility:Math.sqrt(Math.max(0,variance(current,input.covariance))),weights:current.slice()});
    onProgress?.(d/dates.length);await new Promise<void>(resolve=>setTimeout(resolve,0));continue;
   }
   if(solved.status!=='Solved')throw Error(`${dates[d]}: ${solved.message} The run stopped; incomplete results are not saved.`);
   const turnover=solved.weights.reduce((s,w,i)=>s+Math.abs(w-current[i]),0),cost=turnover*policy.costBps/10000;
   // Risk-only certainty-equivalent gain; never interprets relative scores as forecast returns.
   const riskGain=riskReductionValue(variance(current,input.covariance),variance(solved.weights,input.covariance),policy.riskAversion,policy.horizon);
   const review={currentVolatility:solved.currentVolatility,...(policy.costGate?{riskBenefit:riskGain}:{}),estimatedCost:cost};
   if(policy.costGate&&riskGain<=cost){events.push({decisionDate:dates[d],executionDate:'',status:'Skipped: cost gate',turnover,cost:0,forecastVolatility:solved.volatility,weights:current,...review});}
   else if(turnover>1e-7)pending={date:dates[d],target:solved.weights,vol:solved.volatility,review};
   else events.push({decisionDate:dates[d],executionDate:'',status:'Unchanged',turnover:0,cost:0,forecastVolatility:solved.volatility,weights:current,...review});
  }
  if(d%10===0){onProgress?.(d/dates.length);await new Promise<void>(resolve=>setTimeout(resolve,0));}
 }
 const rf=new Map(payload.academicFactors?.rows.map(r=>[r.date,r.rf])??[]);
 const calibration=calibrateRisk(riskChecks,dates,prices.map(map=>dates.slice(1).map((date,i)=>map.get(date)!/map.get(dates[i])!-1)),dates.slice(1).map(d=>rf.get(d)));
 onProgress?.(1);return {calibration,dates,curve,dailyReturns:curve.slice(1).map((v,i)=>v/curve[i]-1),events,decisions,totalCosts,holdingChecksSkipped,weightsHistory};
}
