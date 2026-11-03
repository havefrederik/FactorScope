import {alignedAcademicRows,timeSeriesExposures} from './academic-factors.ts';
import type {MarketPayload,PortfolioAnalytics,FactorModelAnalytics,SecurityDecomposition,SecurityDrilldownAnalytics,FactorAnalytics} from './analytics.ts';
const mean=(x:number[])=>x.reduce((s,v)=>s+v,0)/x.length;
const cov=(a:number[],b:number[])=>{const am=mean(a),bm=mean(b);return a.reduce((s,v,i)=>s+(v-am)*(b[i]-bm),0)/(a.length-1)};
const corr=(a:number[],b:number[])=>cov(a,b)/Math.max(Math.sqrt(cov(a,a)*cov(b,b)),1e-20);

/** Descriptive, joint full-window OLS in excess returns. No causal or forecast claim.
 * RF is shown separately; intercept + unexplained return remain idiosyncratic.
 * Wealth linking is additive at every date, not separate compounding of components. */
export function academicAttribution(payload:MarketPayload,a:Pick<PortfolioAnalytics,'dates'|'dailyReturns'|'curve'|'annualVolatility'|'totalReturn'>,total:number):{model:FactorModelAnalytics;decomposition:SecurityDecomposition}|null{
 try{
  const data=payload.academicFactors;if(!data||a.dailyReturns.length<39||a.curve.length!==a.dates.length||a.dailyReturns.length!==a.dates.length-1||[...a.curve,...a.dailyReturns,total].some(v=>!Number.isFinite(v)))return null;
  const rows=alignedAcademicRows(data,a.dates),rf=rows.map(r=>r.rf),f=data.names.map((_,k)=>rows.map(r=>r.values[k]));
  const excess=a.dailyReturns.map((v,t)=>v-rf[t]),betas=timeSeriesExposures([excess],f)[0];
  const daily=[...f.map((x,k)=>x.map(v=>v*betas[k])),rf];
  const names=[...data.names,'Risk-free'],groups:FactorAnalytics['group'][]=names.map((_,k)=>k===0||k===6?'Core':'Style');
  const residual=a.dailyReturns.map((v,t)=>v-daily.reduce((s,x)=>s+x[t],0));
  const link=(x:number[])=>{let running=0;return x.map((v,t)=>running+=a.curve[t]*v)};
  const contributions=daily.map(link),idio=link(residual);
  const systematic=a.dailyReturns.map((_,t)=>contributions.reduce((s,x)=>s+x[t],0));
  const variance=cov(a.dailyReturns,a.dailyReturns),share=(x:number[])=>variance>1e-20?cov(x,a.dailyReturns)/variance:0;
  const factors=names.map((name,k)=>({name,group:groups[k],exposure:k===6?1:betas[k],riskShare:share(daily[k]),annualRisk:total*a.annualVolatility*share(daily[k]),returnAttribution:total*contributions[k].at(-1)!}));
  const correlations=f.flatMap((x,i)=>f.slice(i+1).map((y,j)=>({factorA:names[i],factorB:names[i+j+1],correlation:corr(x,y),groups:`${groups[i]} / ${groups[i+j+1]}`}))).sort((a,b)=>Math.abs(b.correlation)-Math.abs(a.correlation));
  const style=a.dailyReturns.map((_,t)=>contributions.slice(1,6).reduce((s,x)=>s+x[t],0));
  const systematicReturn=systematic.at(-1)!,idiosyncraticReturn=idio.at(-1)!;
  const layer=(name:'Market'|'Style'|'Risk-free',indices:number[])=>({name,riskShare:indices.reduce((s,k)=>s+factors[k].riskShare,0),returnAttribution:indices.reduce((s,k)=>s+factors[k].returnAttribution,0)});
  const excessVariance=cov(excess,excess);
  return {model:{factors,layers:[layer('Market',[0]),layer('Style',[1,2,3,4,5]),layer('Risk-free',[6]),{name:'Idiosyncratic',riskShare:share(residual),returnAttribution:total*idiosyncraticReturn}],rSquared:excessVariance>1e-20?Math.max(0,Math.min(1,1-cov(residual,residual)/excessVariance)):0,systematicReturn,idiosyncraticReturn,systematicAttribution:total*systematicReturn,idiosyncraticAttribution:total*idiosyncraticReturn,reconciliationDifference:total*(a.totalReturn-systematicReturn-idiosyncraticReturn),diagnostics:{specification:'Published daily Fama–French 5 + momentum. Joint excess-return regression with an intercept over the displayed period. Risk-free return is a separate contribution. This is a descriptive historical fit; the intercept remains in the idiosyncratic contribution.',correlations}},
   decomposition:{model:'Published FF5 + momentum',dates:a.dates.slice(1),observed:a.curve.slice(1).map(v=>v-1),systematic,factors:names.map((name,k)=>({name,group:groups[k],values:contributions[k]})),market:contributions[0],style,sector:a.dailyReturns.map(()=>0),idiosyncratic:idio}};
 }catch{return null;}
}

export function academicSecurity(payload:MarketPayload,a:PortfolioAnalytics,ticker:string):SecurityDrilldownAnalytics|null{
 const map=new Map(payload.series[ticker]?.points.map(p=>[p.date,p.close])??[]),bm=new Map(payload.series.SPY?.points.map(p=>[p.date,p.close])??[]);
 // Do not bridge missing observations or correlate mismatched trailing dates.
 if(!a.dates.every(d=>Number.isFinite(map.get(d))&&map.get(d)!>0&&Number.isFinite(bm.get(d))&&bm.get(d)!>0))return null;
 const curve=a.dates.map(d=>map.get(d)!/map.get(a.dates[0])!),benchmarkCurve=a.dates.map(d=>bm.get(d)!/bm.get(a.dates[0])!);
 const returns=curve.slice(1).map((v,t)=>v/curve[t]-1),benchmark=benchmarkCurve.slice(1).map((v,t)=>v/benchmarkCurve[t]-1);
 const totalReturn=curve.at(-1)!-1,annualVolatility=Math.sqrt(cov(returns,returns)*252);
 const result=academicAttribution(payload,{dates:a.dates,curve,dailyReturns:returns,totalReturn,annualVolatility},1);if(!result)return null;
 let peak=1,drawdown=0;for(const v of curve){peak=Math.max(peak,v);drawdown=Math.min(drawdown,v/peak-1)}
 return {ticker,dates:a.dates,curve,benchmarkCurve,totalReturn,benchmarkReturn:benchmarkCurve.at(-1)!-1,annualVolatility,beta:cov(returns,benchmark)/Math.max(cov(benchmark,benchmark),1e-20),maxDrawdown:drawdown,correlationWithPortfolio:corr(returns,a.dailyReturns),rSquared:result.model.rSquared,systematicReturn:result.model.systematicReturn,idiosyncraticReturn:result.model.idiosyncraticReturn,factorExposures:result.model.factors.filter(f=>f.name!=='Risk-free').map(f=>({name:f.name,exposure:f.exposure})),decomposition:result.decomposition};
}
