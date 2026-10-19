/** Fetch an append-only Yahoo refresh into a private directory. No research data enters the checkout. */
import fs from 'node:fs/promises';
import path from 'node:path';
import YahooFinance from 'yahoo-finance2';
const [manifestPath,outDir]=process.argv.slice(2);
if(!manifestPath||!outDir)throw Error('Usage: node scripts/fetch-statistical-yahoo.mjs private-manifest.json private-output-directory');
const repo=path.resolve(import.meta.dirname,'..');
if(path.resolve(outDir).startsWith(repo+path.sep))throw Error('Output must be outside the website repository.');
const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
await fs.mkdir(outDir,{recursive:true});
const yahoo=new YahooFinance({suppressNotices:['yahooSurvey']});
const today=new Date().toISOString().slice(0,10);
const period2=new Date(today+'T00:00:00Z'); // exclude the current, potentially unfinished session
let completed=0;const errors=[];
async function fetchSymbol(symbol){
 const filename=path.join(outDir,encodeURIComponent(symbol)+'.json');
 try{const saved=JSON.parse(await fs.readFile(filename,'utf8'));if(saved.requestEnd===today){completed++;return;}}catch{}
 for(let attempt=0;attempt<3;attempt++)try{
  const r=await yahoo.chart(symbol,{period1:manifest.start,period2,interval:'1d',events:'div|split'});
  const points=r.quotes.filter(q=>q.date<period2).map(q=>({date:q.date.toISOString().slice(0,10),adjusted:q.adjclose??null}));
  await fs.writeFile(filename,JSON.stringify({symbol,requestEnd:today,retrievedAt:new Date().toISOString(),meta:r.meta,points}));completed++;return;
 }catch(e){if(attempt===2){errors.push({symbol,error:String(e)});completed++;return;}await new Promise(r=>setTimeout(r,1000*4**attempt));}
}
// Bounded requests and resumable cache, shared by SPY calendar and the research universe.
await fetchSymbol('SPY');
const queue=[...new Set(manifest.symbols)].filter(s=>s!=='SPY');
await Promise.all(Array.from({length:3},async()=>{while(queue.length){await fetchSymbol(queue.shift());if(completed%100===0)console.log(`${completed}/${manifest.symbols.length+1} downloaded; ${errors.length} unavailable`);await new Promise(r=>setTimeout(r,100));}}));
await fs.writeFile(path.join(outDir,'download-report.json'),JSON.stringify({requestEnd:today,completed,errors},null,2));
console.log(JSON.stringify({completed,failed:errors.length}));
