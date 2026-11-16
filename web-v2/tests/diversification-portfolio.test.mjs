import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {researchPortfolio} from '../lib/diversification-portfolio.ts';

test('published weekly account carries its July positions forward and compounds the extension',()=>{
  const account=JSON.parse(readFileSync(new URL('../public/data/portfolio-18.json',import.meta.url)));
  const first=account.rows[0],last=account.rows.at(-1);
  const extension=account.rows.filter(row=>row[0]>'2026-07-10');
  const boundary=account.rows.find(row=>row[0]==='2026-07-10');
  assert.equal(account.tickers.length,60);
  assert.equal(first[0],'2022-11-07');
  assert.equal(last[0],'2026-09-30');
  assert.equal(extension.filter(row=>row[3]).length,12);
  assert.equal(extension[0][0],'2026-07-13');
  assert.ok(Math.abs(last[1]/first[1]-3.001967226975)<1e-10);
  assert.ok(Math.abs(last[1]/boundary[1]-.992379361316)<1e-10);
  let prior='';
  for(const [date,wealth,positions,,fee] of account.rows){
    assert.ok(date>prior && wealth>0 && fee>=0);
    assert.ok(Math.abs(positions.reduce((sum,[index,weight])=>{
      assert.ok(Number.isInteger(index)&&index>=0&&index<60&&weight>0);
      return sum+weight;
    },0)-1)<2e-7);
    prior=date;
  }
  const series={SPY:{points:account.rows.map(([date])=>({date,close:100}))}};
  const h=researchPortfolio(account,{asOf:last[0],series},boundary[0]);
  assert.equal(h.days.length,extension.length+1);
  assert.equal(h.days[0].date,boundary[0]);
  assert.ok(Math.abs(h.analytics.totalReturn+.007620638684)<1e-10);
  assert.ok(h.totalCosts>0);
  assert.equal(h.rebalances[h.days[0].rebalance].date,'2026-07-06');
});
