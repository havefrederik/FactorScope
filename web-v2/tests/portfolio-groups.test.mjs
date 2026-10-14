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
