import type { CovarianceForecastAnalytics } from './analytics.ts';
import { riskConcentration } from './risk-concentration.ts';
import { horizonVolatility } from './forecast-horizon.ts';

/** All weights use net capital. Gross is a display denominator, never a new
 * covariance or a renormalization of the allocation used by the optimizer. */
export function portfolioRiskSummary(forecast: CovarianceForecastAnalytics, weights: Record<string,number>, capital:number, basis:'capital'|'gross'='capital') {
  const n=forecast.tickers.length, matrix=forecast.covarianceMatrix;
  const validMatrix=(m:number[][])=>m.length===n&&m.every(row=>row.length===n&&row.every(Number.isFinite));
  if(!(capital>0)||!Number.isFinite(capital)||!validMatrix(matrix)||new Set(forecast.tickers).size!==n)throw Error('Risk summary requires positive capital and a complete covariance matrix.');
  if(Object.entries(weights).some(([t,w])=>!Number.isFinite(w)||(Math.abs(w)>1e-10&&!forecast.tickers.includes(t))))throw Error('Risk data does not cover every held asset.');
  const w=forecast.tickers.map(t=>weights[t]??0),quad=(m:number[][])=>w.reduce((s,v,i)=>s+v*m[i].reduce((z,c,j)=>z+c*w[j],0),0);
  const variance=quad(matrix);
  if(variance < -1e-10)throw Error('Invalid negative portfolio variance.');
  const annual=Math.sqrt(Math.max(0,variance)),sessions=forecast.forecastSessions??1;
  const long=w.reduce((s,v)=>s+Math.max(v,0),0),short=w.reduce((s,v)=>s+Math.min(v,0),0),gross=long-short,net=long+short;
  const denominator=basis==='capital'?1:gross;
  const scaled=(v:number)=>denominator>1e-10?v/denominator:null;
  let commonShare:number|null=null,residualShare:number|null=null;
  if(forecast.riskBreakdown){
    const {common,residual}=forecast.riskBreakdown;
    if(!validMatrix(common)||!validMatrix(residual)||matrix.some((r,i)=>r.some((v,j)=>Math.abs(v-common[i][j]-residual[i][j])>1e-9*Math.max(1,Math.abs(v)))))throw Error('Risk components do not reconcile to the selected covariance.');
    if(variance>1e-16){commonShare=quad(common)/variance;residualShare=quad(residual)/variance;}
  }
  const betas=forecast.marketBetas;
  if(betas&&(betas.length!==n||betas.some(v=>!Number.isFinite(v))))throw Error('Incomplete market-beta coverage.');
  const longBeta=betas?w.reduce((s,v,i)=>s+Math.max(v,0)*betas[i],0):null;
  const shortBeta=betas?w.reduce((s,v,i)=>s+Math.min(v,0)*betas[i],0):null;
  const beta=longBeta===null||shortBeta===null?null:longBeta+shortBeta;
  const concentration=riskConcentration(forecast.tickers,w,matrix);
  return {
    basis,sessions,annualVolatility:scaled(annual),volatility:scaled(horizonVolatility(annual,sessions)),dollarRisk:capital*horizonVolatility(annual,sessions),annualDollarRisk:capital*annual,
    commonShare,residualShare,beta:beta===null?null:scaled(beta),longBeta:longBeta===null?null:scaled(longBeta),shortBeta:shortBeta===null?null:scaled(shortBeta),
    dollarBeta:beta===null?null:capital*beta,longDollarBeta:longBeta===null?null:capital*longBeta,shortDollarBeta:shortBeta===null?null:capital*shortBeta,
    gross:scaled(gross),net:scaled(net),long:scaled(long),short:scaled(short),grossDollars:capital*gross,netDollars:capital*net,longDollars:capital*long,shortDollars:capital*short,
    positions:concentration.positions.length,effectivePositions:concentration.effectivePositions,topFiveWeight:concentration.topFiveWeight,topFiveRisk:concentration.topFiveRisk,contributors:concentration.positions,
  };
}
