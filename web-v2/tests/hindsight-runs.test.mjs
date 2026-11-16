import test from 'node:test';import assert from 'node:assert/strict';
import {pathMetrics,comparableRuns,readHindsightRuns,historyFingerprint} from '../lib/hindsight-runs.ts';
test('comparison cannot mix periods or starting histories',()=>{const runs=[{comparisonKey:'a',name:'a'},{comparisonKey:'b',name:'b'},{comparisonKey:'a',name:'c'}];assert.deepEqual(comparableRuns(runs,'a').map(r=>r.name),['a','c']);});
test('metrics use the actual path including drawdown',()=>{const x=pathMetrics([1,1.2,.9,1.1],[.2,-.25,1.1/.9-1]);assert.ok(Math.abs(x.maxDrawdown+.25)<1e-10);assert.ok(Math.abs(x.totalReturn-.1)<1e-10);});
test('changed input prices invalidate comparison fingerprints; corrupt saved runs are ignored',()=>{assert.notEqual(historyFingerprint([[{date:'2026-01-01',close:1}]]),historyFingerprint([[{date:'2026-01-01',close:2}]]));assert.deepEqual(readHindsightRuns('bad'),[]);assert.deepEqual(readHindsightRuns('[{"version":1}]'),[]);});
test('persisted history tests retain the exact baseline and accept earlier snapshots without one',()=>{
 const r={version:1,id:'1',name:'Weekly',modelSignature:'{}',modelLabel:'LW',comparisonKey:'same',start:'2026-07-10',end:'2026-07-14',policy:{},dates:['2026-07-10','2026-07-13','2026-07-14'],curve:[1,1.02,1.05],totalReturn:.05,maxDrawdown:0,volatility:.2,trades:1,turnover:.2,cost:.0001,sharpe:1,baselineSharpe:.8};
 const saved={...r,portfolioName:'Research portfolio',baselineCurve:[1,1.01,1.03]};
 assert.deepEqual(readHindsightRuns(JSON.stringify([r,saved])),[r,saved]);
 assert.deepEqual(readHindsightRuns(JSON.stringify([{...saved,baselineCurve:[1,1.01]}])),[]);
});
