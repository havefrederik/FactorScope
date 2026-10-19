import {existsSync,readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAnalytics} from '../lib/analytics.ts';
import {buildHoldingsOverview} from '../lib/portfolio-overview.ts';
import {exampleHoldingsSnapshot} from '../lib/example-portfolio.ts';
import {buildPortfolioGroups} from '../lib/portfolio-groups.ts';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function fixture(){
 const dates=Array.from({length:70},(_,i)=>new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10));
 const series=Object.fromEntries(['A','B','SPY'].map((ticker,k)=>[ticker,{points:dates.map((date,i)=>({date,close:100*Math.exp(i*(k+1)*.001+Math.sin(i)*.005)}))}]));
 return {series,asOf:dates.at(-1),errors:[],missingHoldings:[],source:'test',adjusted:true,frequency:'daily'};
}
test('shared overview preserves existing AI buy-and-hold analytics and reconciles every dated position',()=>{
 const p=fixture(),h=[{ticker:'A',value:500000},{ticker:'B',value:500000}];
 const r=buildHoldingsOverview(p,h,'2025-01-01',p.asOf);
 assert.deepEqual(r.analytics,buildAnalytics(p,h,{startDate:'2025-01-01',endDate:p.asOf}));
 for(const [i,d] of r.days.entries())near(d.nav,1e6*r.analytics.curve[i]);
 const last=exampleHoldingsSnapshot(r);near(last.holdings.reduce((s,h)=>s+h.value,0),r.days.at(-1).nav);
 assert.notEqual(last.holdings[0].value/last.nav,.5);
 const groups=buildPortfolioGroups(p,r,{A:'Technology',B:'Industrials'});
 for(const group of groups.groups){const ticker=group.tickers[0];near(group.curve.at(-1),p.series[ticker].points.at(-1).close/100);}
 near((1+r.annualReturn)**((Date.parse(r.analytics.endDate)-Date.parse(r.analytics.startDate))/(365.25*86400000)),1+r.analytics.totalReturn);
});
test('overview uses shared dated prices and keeps unavailable holdings as cash without fabricating returns',()=>{
 const p=fixture();p.series.B.points=p.series.B.points.slice(10);
 const r=buildHoldingsOverview(p,[{ticker:'A',value:40},{ticker:'B',value:40},{ticker:'MISSING',value:10},{ticker:'CASH',value:10}],'2025-01-01',p.asOf);
 assert.equal(r.days[0].date,p.series.B.points[0].date);
 for(const d of r.days){assert.equal(d.cash,20);near(d.nav,d.values.reduce((a,b)=>a+b,20));}
 assert.equal(r.totalCosts,0);assert.equal(r.rebalances.length,1);
 assert.equal(buildHoldingsOverview(p,[{ticker:'A',value:100}],p.asOf,p.asOf),null);
});

test('coverage-adjusted basket rebalances daily and new membership never affects its formation-day return',async()=>{
 const {buildCoverageOverview}=await import('../lib/portfolio-overview.ts');
 const p=fixture(),dates=p.series.SPY.points.map(p=>p.date);
 // B jumps on the membership formation date. It must not earn that jump.
 p.series.B.points=p.series.B.points.map((p,i)=>({...p,close:i<10?100:1000}));
 const coverage=[{date:dates[0],tickers:['A']},{date:dates[10],tickers:['A','B']},{date:dates.at(-1),tickers:['A','B']}];
 const r=buildCoverageOverview(p,coverage,dates[0],'2099-01-01');
 assert.equal(r.analytics.endDate,coverage.at(-1).date);
 near(r.analytics.dailyReturns[9],p.series.A.points[10].close/p.series.A.points[9].close-1);
 near(r.analytics.dailyReturns[10],.5*(p.series.A.points[11].close/p.series.A.points[10].close-1));
 for(const day of r.days){const n=day.date<dates[10]?1:2;assert.equal(day.values.filter(v=>v>0).length,n);for(const v of day.values.filter(v=>v>0))near(v/day.nav,1/n);near(day.values.reduce((s,v)=>s+v,0),day.nav);}
 // The new sector receives capital at the close, not a spurious 900% return.
 const grouped=buildPortfolioGroups(p,r,{A:'A sector',B:'B sector'});
 assert.ok(grouped.groups.find(g=>g.name==='B sector').curve.every(v=>v===1));
 // Changing a later membership decision cannot alter earlier returns.
 const changed=structuredClone(coverage);changed[1].tickers=['B'];
 const other=buildCoverageOverview(p,changed,dates[0],dates.at(-1));
 assert.deepEqual(other.analytics.curve.slice(0,11),r.analytics.curve.slice(0,11));
});

test('missing required Yahoo prices stop the equal-weight basket without dropping or reweighting names',async()=>{
 const {buildCoverageOverview}=await import('../lib/portfolio-overview.ts');const p=fixture(),d=p.series.SPY.points.map(p=>p.date);
 const coverage=[{date:d[0],tickers:['A','B']},{date:d.at(-1),tickers:['A','B']}];
 p.series.B.points=p.series.B.points.filter(p=>p.date!==d[12]);
 assert.throws(()=>buildCoverageOverview(p,coverage,d[0],d.at(-1)),/Missing Yahoo price for B/);
 assert.equal(buildCoverageOverview(p,coverage,'2020-01-01',d[0]),null);
});

test('all exported coverage dates agree with the private research chart counts and stock eligibility',{skip:!existsSync(new URL('../../research-imports/yahoo-extension-2026-10-19/models/model-with-coverage.json',import.meta.url))},async()=>{
 const {parseStatisticalBundle}=await import('../lib/statistical-model.ts');
 const {statisticalMetadata}=await import('../lib/statistical-public.ts');
 const b=parseStatisticalBundle(JSON.parse(readFileSync(new URL('../../research-imports/yahoo-extension-2026-10-19/models/model-with-coverage.json',import.meta.url),'utf8')));
 const history=b.histories.find(h=>h.variant==='ONE_YEAR_EQUAL'&&h.basket==='AVAILABLE_NOT_AI35');
 for(const [i,p] of b.aiCoverage.entries()){
  assert.equal(p.date,history.points[i].date);assert.equal(p.tickers.length,history.points[i].nHoldings);
  const model=JSON.parse(readFileSync(new URL(`../../research-imports/yahoo-extension-2026-10-19/models/${p.date}.json`,import.meta.url),'utf8'));
  const available=new Set(model.snapshots.find(s=>s.variant==='ONE_YEAR_EQUAL').stocks.map(s=>s.ticker));
  assert.deepEqual(p.tickers,b.aiBasket.filter(t=>available.has(t)));
 }
 assert.equal(Math.min(...b.aiCoverage.map(p=>p.tickers.length)),32);assert.equal(Math.max(...b.aiCoverage.map(p=>p.tickers.length)),35);
 const visible=statisticalMetadata(b);for(const p of visible.aiCoverage)assert.deepEqual(Object.keys(p),['date','tickers']);
 const bad=structuredClone(b);bad.aiCoverage[0].tickers.pop();assert.throws(()=>parseStatisticalBundle(bad));
 const duplicate=structuredClone(b);duplicate.aiCoverage[0].tickers[0]=duplicate.aiCoverage[0].tickers[1];assert.throws(()=>parseStatisticalBundle(duplicate));
});
