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
