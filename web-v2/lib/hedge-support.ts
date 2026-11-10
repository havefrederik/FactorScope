import type {CovarianceForecastAnalytics, MarketPayload} from './analytics.ts';
import {academicRisk, alignedAcademicRows} from './academic-factors.ts';
import {historicalSharpe} from './historical-sharpe.ts';
import {defaultForecastOptions, type ForecastOptions} from './forecast-horizon.ts';

export const hedgeEtfs = [
  ['SPY','US large cap'],['IWM','US small cap'],['XLK','Technology'],['XLF','Financials'],
  ['XLE','Energy'],['XLV','Health care'],['XLC','Communication services'],['XLY','Consumer discretionary'],
  ['XLP','Consumer staples'],['XLI','Industrials'],['XLB','Materials'],['XLRE','Real estate'],['XLU','Utilities'],
] as const;
export type HedgeSettings = {candidates:string[];maxWeight:number;direction:'short'|'both';allowBorrowing:boolean;executionBps:number;shortBorrow:number;cashSpread:number;forecast:ForecastOptions};
export const defaultHedgeSettings:HedgeSettings = {candidates:hedgeEtfs.map(([t])=>t),maxWeight:.5,direction:'short',allowBorrowing:true,executionBps:5,shortBorrow:.01,cashSpread:.01,forecast:defaultForecastOptions};
export type HedgeCandidate = {ticker:string;weight:number;correlation:number|null;before:number;after:number;reduction:number;roundTripCost:number;borrowCost:number;atLimit:boolean};
export type HedgeSnapshot = {forecast:CovarianceForecastAnalytics;weights:Record<string,number>;ranked:HedgeCandidate[];spy:HedgeCandidate};
export type HedgeDay = {date:string;nav:number;values:number[];cash:number};
export type HedgeHistory = {tickers:string[];days:HedgeDay[];label:string};
const sum=(a:number[])=>a.reduce((s,v)=>s+v,0);
export function validateHedgeSettings(s:HedgeSettings){
  if(!s.candidates.length||new Set(s.candidates).size!==s.candidates.length||s.candidates.some(t=>!hedgeEtfs.some(([x])=>x===t)))throw Error('Select at least one available ETF.');
  if(!Number.isFinite(s.maxWeight)||s.maxWeight<=0||s.maxWeight>1)throw Error('Maximum hedge size must be above 0% and no more than 100% of capital.');
  if(!['short','both'].includes(s.direction)||typeof s.allowBorrowing!=='boolean')throw Error('Choose a valid hedge direction and cash borrowing setting.');
  if(!Number.isFinite(s.executionBps)||s.executionBps<0||s.executionBps>100||!Number.isFinite(s.shortBorrow)||s.shortBorrow<0||s.shortBorrow>1||!Number.isFinite(s.cashSpread)||s.cashSpread<0||s.cashSpread>1)throw Error('Enter execution costs from 0–100 bps and annual financing rates from 0–100%.');
}
/** The one-dimensional constrained minimum-variance overlay, in capital weights.
 * Existing positions stay fixed. Zero is feasible, so predicted risk cannot rise.
 * Costs are reported in return units, never subtracted from volatility units. */
export function sizeHedge(matrix:number[][],weights:number[],index:number,settings:HedgeSettings):HedgeCandidate{
  validateHedgeSettings(settings);
  const n=weights.length;
  if(!n||matrix.length!==n||matrix.some(r=>r.length!==n||r.some(v=>!Number.isFinite(v)))||weights.some(v=>!Number.isFinite(v))||index<0||index>=n)throw Error('Hedge sizing requires a complete joint covariance matrix.');
  const marginal=matrix.map(r=>sum(r.map((v,j)=>v*weights[j]))),variance=sum(weights.map((w,i)=>w*marginal[i])),etfVariance=matrix[index][index];
  if(variance < -1e-10||etfVariance < -1e-10)throw Error('The covariance model contains invalid variances.');
  const cash=1-sum(weights),upper=settings.direction==='short'?0:Math.min(settings.maxWeight,settings.allowBorrowing?settings.maxWeight:Math.max(0,cash));
  // If the existing book borrows, a short overlay must first restore nonnegative cash.
  // Otherwise zero remains feasible and no new cash borrowing is introduced.
  if(!settings.allowBorrowing&&cash < -1e-8)throw Error('The existing portfolio already borrows cash. Enable cash borrowing or change the portfolio before adding a hedge.');
  const lower=-settings.maxWeight;
  const raw=etfVariance>1e-20?-marginal[index]/etfVariance:0;
  const h=Math.min(upper,Math.max(lower,raw));
  const before=Math.sqrt(Math.max(0,variance)),after=Math.sqrt(Math.max(0,variance+2*h*marginal[index]+h*h*etfVariance));
  return {ticker:'',weight:Math.abs(h)<1e-10?0:h,correlation:before>1e-12&&etfVariance>1e-20?Math.max(-1,Math.min(1,marginal[index]/(before*Math.sqrt(etfVariance)))):null,before,after,reduction:before-after,roundTripCost:2*Math.abs(h)*settings.executionBps/10000,borrowCost:Math.max(0,Math.max(0,-weights[index]-h)-Math.max(0,-weights[index]))*settings.shortBorrow*settings.forecast.sessions/252,atLimit:Math.abs(h)>1e-10&&(Math.abs(h-lower)<1e-8||Math.abs(h-upper)<1e-8)};
}
export function hedgeSnapshot(payload:MarketPayload,weights:Record<string,number>,asOf:string,settings:HedgeSettings):HedgeSnapshot{
  validateHedgeSettings(settings);
  if(!payload.academicFactors)throw Error('Published Fama–French factors are required for hedge analysis.');
  if(Object.values(weights).some(w=>!Number.isFinite(w)))throw Error('Every portfolio weight must be finite.');
  const held=Object.keys(weights).filter(t=>t!=='CASH'&&Math.abs(weights[t])>1e-12).sort();
  // A dated book may be entirely in cash before its first allocation or between
  // allocations. Keep the ETF model and zero stock weights: the optimal overlay
  // is zero, allowing validation to wait for investment or close an old hedge.
  const tickers=[...new Set([...held,...settings.candidates,'SPY'])];
  const w=tickers.map(t=>weights[t]??0);
  const base={asOf,tickers,expertWeights:[],references:[]} as unknown as CovarianceForecastAnalytics;
  const {forecast}=academicRisk(payload,base,w,payload.academicFactors,undefined,[],null,settings.forecast);
  forecast.modelLabel='Fama–French 5 + momentum · residual Ledoit–Wolf';
  const candidate=(ticker:string)=>({...sizeHedge(forecast.covarianceMatrix,w,tickers.indexOf(ticker),settings),ticker});
  return {forecast,weights:Object.fromEntries(tickers.map((t,i)=>[t,w[i]])),ranked:settings.candidates.map(candidate).sort((a,b)=>b.reduction-a.reduction||a.ticker.localeCompare(b.ticker)),spy:candidate('SPY')};
}
export function weightsWithHedge(s:HedgeSnapshot,h:HedgeCandidate){return {...s.weights,[h.ticker]:(s.weights[h.ticker]??0)+h.weight};}
export type HedgeDecision={decision:string;execution:string;ticker:string;weight:number;forecastBefore:number;forecastAfter:number;spyWeight:number;tradeCost:number;spyTradeCost:number};
export type HedgeValidation={dates:string[];curves:number[][];metrics:{label:string;volatility:number;sharpe:number|null;totalReturn:number;drawdown:number;executionCost:number;borrowCost:number;trades:number}[];decisions:HedgeDecision[];requestedStart:string;start:string;end:string;historyLabel:string;settings:HedgeSettings;frequency:'monthly'|'weekly';quarterly:{quarter:string;volatility:number[]}[]};
export function validationStart(payload:MarketPayload,history:HedgeHistory,settings:HedgeSettings,requested:string,end:string){
  const required=[...new Set([...settings.candidates,'SPY'])];
  const firstReady=(t:string)=>payload.series[t]?.points[252]?.date??'9999-12-31';
  const factorsReady=payload.academicFactors?.rows[252]?.date??'9999-12-31';
  return history.days.find(d=>d.date>=requested&&d.date<end&&d.date>=factorsReady&&[...required,...history.tickers.filter((_,i)=>Math.abs(d.values[i])>1e-9)].every(t=>d.date>=firstReady(t)))?.date??null;
}
/** Re-select and re-size at each decision close; execute at the NEXT close.
 * Overlay units track adjusted total-return prices. The base book's recorded NAV
 * and dated positions are unchanged. A separate cash account funds the overlay.
 * No hedge return is earned during the decision-to-execution interval. */
export function validateHedges(payload:MarketPayload,history:HedgeHistory,settings:HedgeSettings,start:string,end:string,frequency:'monthly'|'weekly',progress?:(done:number,total:number)=>void,model:typeof hedgeSnapshot=hedgeSnapshot):HedgeValidation{
  validateHedgeSettings(settings);
  if(!['monthly','weekly'].includes(frequency)||start>=end)throw Error('Choose a valid validation period and rebalance interval.');
  const actual=validationStart(payload,history,settings,start,end);
  if(!actual)throw Error('No complete 252-session estimation history is available in this period.');
  const days=history.days.filter(d=>d.date>=actual&&d.date<=end);
  if(days.length<22)throw Error('Choose at least 22 trading sessions after the estimation warm-up.');
  if(days.some((d,i)=>!Number.isFinite(d.nav)||d.nav<=0||!Number.isFinite(d.cash)||d.values.length!==history.tickers.length||d.values.some(v=>!Number.isFinite(v))||Math.abs(sum(d.values)+d.cash-d.nav)>1e-6*Math.max(1,d.nav)||i>0&&d.date<=days[i-1].date))throw Error('Portfolio history needs ordered dates, complete holdings and positive, reconciled NAV.');
  if(!payload.academicFactors)throw Error('Published factors are required for validation.');
  const rf=alignedAcademicRows(payload.academicFactors,days.map(d=>d.date));
  const etfs=[...new Set([...settings.candidates,'SPY'])];
  const prices=Object.fromEntries(etfs.map(t=>{const map=new Map((payload.series[t]?.points??[]).map(p=>[p.date,p.close]));const values=days.map(d=>map.get(d.date));if(values.some(p=>p===undefined||!Number.isFinite(p)||p<=0))throw Error(`Incomplete ${t} prices during validation. No missing prices were filled.`);return [t,values as number[]]}));
  const interval=(d:string)=>frequency==='monthly'?d.slice(0,7):String(Math.floor((Date.parse(d)+3*86400000)/(7*86400000)));
  const origins=days.map((d,i)=>i===0||interval(d.date)!==interval(days[i-1].date)?i:-1).filter(i=>i>=0&&i<days.length-2);
  const originSet=new Set(origins),initial=days[0].nav;
  type Book={ticker:string|null;units:number;cash:number;cost:number;borrow:number;trades:number;curve:number[]};
  const books:Book[]=Array.from({length:2},()=>({ticker:null,units:0,cash:0,cost:0,borrow:0,trades:0,curve:[1]}));
  const decisions:HedgeDecision[]=[];
  let pending:{hedges:HedgeCandidate[];decision:HedgeDecision}|null=null,count=0;
  const marked=(b:Book,i:number)=>b.ticker?b.units*prices[b.ticker][i]:0;
  const trade=(b:Book,h:HedgeCandidate,i:number)=>{
    const old=marked(b,i),capital=days[i].nav+old+b.cash;
    if(!(capital>0))throw Error('Hedge validation exhausted portfolio capital. Reduce the hedge size.');
    const fee=settings.executionBps/10000;
    const turnover=(target:number)=>b.ticker===h.ticker?Math.abs(target-old):Math.abs(old)+Math.abs(target);
    // Solve target weight against post-cost capital; this contraction is bounded
    // by fee × |h| <= 0.01, and includes both legs when the ETF changes.
    let target=h.weight*capital;
    for(let k=0;k<16;k++)target=h.weight*(capital-turnover(target)*fee);
    const traded=turnover(target),cost=traded*fee;
    b.cash+=old-target-cost;b.units=target/prices[h.ticker][i];b.ticker=h.ticker;b.cost+=cost;if(traded>initial*1e-10)b.trades++;
    return cost;
  };
  for(let i=0;i<days.length;i++){
    if(i){
      const elapsed=(Date.parse(days[i].date)-Date.parse(days[i-1].date))/86400000;
      for(const b of books){
        const old=marked(b,i-1);
        // RF is the daily close-to-close return; annual borrow/spread uses ACT/365.25.
        const basePosition=b.ticker?days[i-1].values[history.tickers.indexOf(b.ticker)]??0:0;
        const extraShort=Math.max(0,Math.max(0,-basePosition-old)-Math.max(0,-basePosition));
        const baseCash=days[i-1].cash;
        const extraBorrow=Math.max(0,Math.max(0,-baseCash-b.cash)-Math.max(0,-baseCash));
        const borrow=extraShort*settings.shortBorrow*elapsed/365.25+extraBorrow*settings.cashSpread*elapsed/365.25;
        b.cash+=b.cash*rf[i-1].rf-borrow;b.borrow+=borrow;
      }
    }
    if(pending){
      pending.decision.tradeCost=trade(books[0],pending.hedges[0],i)/initial;
      pending.decision.spyTradeCost=trade(books[1],pending.hedges[1],i)/initial;
      decisions.push(pending.decision);pending=null;
    }
    if(i===days.length-1)for(const b of books){const old=marked(b,i),cost=Math.abs(old)*settings.executionBps/10000;b.cash+=old-cost;b.units=0;b.cost+=cost;if(Math.abs(old)>initial*1e-10)b.trades++;}
    if(i)for(const b of books){const nav=days[i].nav+marked(b,i)+b.cash;if(!(nav>0)&&Number.isFinite(nav))throw Error('Hedge validation exhausted portfolio capital. Reduce the hedge size.');if(!Number.isFinite(nav))throw Error('Invalid simulated portfolio value.');b.curve.push(nav/initial);}
    if(originSet.has(i)){
      const weights=Object.fromEntries(history.tickers.map((t,j)=>[t,days[i].values[j]/days[i].nav]));
      let s:HedgeSnapshot;try{s=model(payload,weights,days[i].date,settings)}catch(e){throw Error(`${days[i].date}: ${(e as Error).message} Validation stopped; no partial results were accepted.`)}
      const resized=books.map(b=>{
        const capital=days[i].nav+marked(b,i)+b.cash;
        if(!(capital>0))throw Error('Hedge validation exhausted portfolio capital. Reduce the hedge size.');
        const w=s.forecast.tickers.map(t=>(weights[t]??0)*days[i].nav/capital);
        const candidate=(ticker:string)=>({...sizeHedge(s.forecast.covarianceMatrix,w,s.forecast.tickers.indexOf(ticker),settings),ticker});
        return {ranked:settings.candidates.map(candidate).sort((a,b)=>b.reduction-a.reduction||a.ticker.localeCompare(b.ticker)),spy:candidate('SPY')};
      });
      const best=resized[0].ranked[0],spy=resized[1].spy;
      pending={hedges:[best,spy],decision:{decision:days[i].date,execution:days[i+1].date,ticker:best.ticker,weight:best.weight,forecastBefore:best.before,forecastAfter:best.after,spyWeight:spy.weight,tradeCost:0,spyTradeCost:0}};
      progress?.(++count,origins.length);
    }
  }
  const dates=days.map(d=>d.date),curves=[days.map(d=>d.nav/initial),...books.map(b=>b.curve)];
  const returns=curves.map(c=>c.slice(1).map((v,i)=>v/c[i]-1));
  const vol=(r:number[])=>{const m=sum(r)/r.length;return Math.sqrt(sum(r.map(v=>(v-m)**2))/Math.max(1,r.length-1)*252)};
  const metrics=curves.map((c,k)=>{let peak=1,drawdown=0;c.forEach(v=>{peak=Math.max(peak,v);drawdown=Math.min(drawdown,v/peak-1)});return {label:['Unhedged','ETF selection rule','SPY-only hedge'][k],volatility:vol(returns[k]),sharpe:historicalSharpe(dates,returns[k],payload),totalReturn:c.at(-1)!-1,drawdown,executionCost:k?books[k-1].cost/initial:0,borrowCost:k?books[k-1].borrow/initial:0,trades:k?books[k-1].trades:0}});
  const quarters=[...new Set(dates.slice(1).map(d=>`${d.slice(0,4)} Q${Math.ceil(Number(d.slice(5,7))/3)}`))];
  const quarterly=quarters.map(quarter=>{const ids=dates.slice(1).map((d,i)=>`${d.slice(0,4)} Q${Math.ceil(Number(d.slice(5,7))/3)}`===quarter?i:-1).filter(i=>i>=0);return {quarter,volatility:ids.length>=20?returns.map(r=>vol(ids.map(i=>r[i]))):[]}}).filter(q=>q.volatility.length);
  return {dates,curves,metrics,decisions,requestedStart:start,start:dates[0],end:dates.at(-1)!,historyLabel:history.label,settings,frequency,quarterly};
}
