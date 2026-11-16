import test from "node:test";
import assert from "node:assert/strict";
import { buildPortfolioGroups, groupHoldingsSnapshot } from "../lib/portfolio-groups.ts";

const dates=["2025-01-30","2025-01-31","2025-02-03","2025-02-04"];
const payload={series:Object.fromEntries([["SPY",[100,100,100,100]],["A",[100,110,121,108.9]],["B",[100,90,90,99]]].map(([ticker,prices])=>[ticker,{points:dates.map((date,i)=>({date,close:prices[i]}))}]))};
const example={tickers:["A","B"],days:[{date:dates[0],nav:100,values:[0,0],cash:100,rebalance:-1},{date:dates[1],nav:100,values:[55,45],cash:0,rebalance:0},{date:dates[2],nav:105.5,values:[60.5,45],cash:0,rebalance:0},{date:dates[3],nav:106,values:[18,88],cash:0,rebalance:1}],rebalances:[{targets:[.5,.5]},{targets:[.2,.8]}]};
test("group return uses drifting within-sector capital and excludes rebalance transfers",()=>{
  const {groups}=buildPortfolioGroups(payload,example,{A:"Same",B:"Same"});
  assert.ok(Math.abs(groups[0].curve[1]-1)<1e-12);
  assert.ok(Math.abs(groups[0].curve[2]-1.055)<1e-12);
  assert.ok(Math.abs(groups[0].curve[3]-1.055*1.06)<1e-12);
  const scaled=structuredClone(example);scaled.days[3].values=[180,880];scaled.days[3].nav=1060;
  assert.ok(Math.abs(buildPortfolioGroups(payload,scaled,{A:"Same",B:"Same"}).groups[0].curve[3]-groups[0].curve[3])<1e-12);
});
test("sector snapshots sum actual values and rebalance targets without mixing the two",()=>{
  const {groups}=buildPortfolioGroups(payload,example,{A:"Technology",B:"Energy"});
  const rows=groupHoldingsSnapshot(example,groups,3);
  assert.equal(rows.reduce((sum,row)=>sum+row.value,0),106);
  assert.equal(rows.reduce((sum,row)=>sum+row.target,0),1);
  assert.ok(Math.abs(rows.find(row=>row.name==="Technology").weight-18/106)<1e-12);
  assert.ok(Math.abs(groups.find(group=>group.name==="Technology").curve[3]-1.089)<1e-12);
});
test("missing prices do not become fabricated zero returns",()=>{
  const missing=structuredClone(payload);missing.series.A.points=missing.series.A.points.filter(point=>point.date!==dates[1]);
  const {groups}=buildPortfolioGroups(missing,example,{A:"Technology",B:"Energy"});
  assert.deepEqual(groups.find(group=>group.name==="Technology").curve,[1,null,null,null]);
  assert.equal(groups.find(group=>group.name==="Energy").incomplete,false);
});

test('stock grouping and changing long/short sleeves use signed profit on gross capital',()=>{
  const fixture={tickers:['A'],days:[{date:dates[0],nav:100,values:[100]},{date:dates[1],nav:110,values:[110]},{date:dates[2],nav:121,values:[-99]}]};
  const p={series:{SPY:{points:dates.slice(0,3).map(date=>({date,close:100}))},A:{points:[100,110,99].map((close,i)=>({date:dates[i],close}))}}};
  const result=buildPortfolioGroups(p,fixture,{A:'Technology'},'Long / short');
  const long=result.groups.find(g=>g.name==='Long'),short=result.groups.find(g=>g.name==='Short');
  assert.ok(Math.abs(long.curve[1]-1.1)<1e-12);assert.equal(long.curve[2],long.curve[1]);
  assert.equal(short.curve[1],1);assert.ok(Math.abs(short.curve[2]-1.1)<1e-12);
  assert.equal(buildPortfolioGroups(p,fixture,{A:'Technology'},'Stocks').groups[0].name,'A');
});

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);
test('contribution uses portfolio starting capital and includes gains on the stock sold at the close',()=>{
  const p={series:{SPY:payload.series.SPY,A:payload.series.A,B:payload.series.B}};
  const history={tickers:['A','B'],days:[
    {date:dates[0],values:[10,0],cash:90,nav:100},
    {date:dates[1],returnValues:[11,0],values:[0,100],cash:0,nav:100}, // $1 gain and $1 execution cost
    {date:dates[2],values:[0,100],cash:0,nav:100},
    {date:dates[3],returnValues:[0,110],values:[110,0],cash:0,nav:110}
  ]};
  const {groups}=buildPortfolioGroups(p,history,{A:'Industrials',B:'Energy'});
  const a=groups.find(g=>g.name==='Industrials'),b=groups.find(g=>g.name==='Energy');
  near(a.curve[1]-1,.10);near(a.contribution[1],.01);
  assert.deepEqual(a.held,[true,true,false,false]);
  assert.deepEqual(b.held,[false,false,true,true]); // B was held through an unchanged price.
  assert.equal(a.contribution[1],a.contribution[3]);assert.equal(a.curve[1],a.curve[3]);
  for(let i=1;i<dates.length;i++) near(a.contribution[i]+b.contribution[i]-.01,history.days[i].nav/100-1);
  const subperiod=buildPortfolioGroups(p,{...history,days:history.days.slice(2)},{A:'Industrials',B:'Energy'});
  const energy=subperiod.groups.find(g=>g.name==='Energy');
  assert.equal(energy.contribution[0],0);near(energy.contribution[1],.1);
});
test('signed stock and long/short contributions agree, even with leverage and collateral',()=>{
  const day0={date:dates[0],values:[150,-50],cash:0,nav:100};
  const day1={date:dates[1],values:[165,-45],cash:0,nav:120};
  for(const grouping of ['Stocks','Sectors','Long / short']){
    const {groups}=buildPortfolioGroups(payload,{tickers:['A','B'],days:[day0,day1]},{A:'One',B:'Two'},grouping);
    near(groups.reduce((sum,g)=>sum+g.contribution[1],0),.2);
    near(groups.find(g=>g.indexes.includes(1)).contribution[1],.05);
  }
});
test('a missing return interval stops contribution and within-group return together',()=>{
  const missing=structuredClone(payload);
  missing.series.A.points=missing.series.A.points.filter(pt=>pt.date!==dates[2]);
  const a=buildPortfolioGroups(missing,example,{A:'One',B:'Two'}).groups[0];
  near(a.contribution[1],.05);
  assert.deepEqual(a.contribution.slice(2),[null,null]);
  assert.deepEqual(a.curve.slice(2),[null,null]);
});
