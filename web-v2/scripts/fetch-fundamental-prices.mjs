/** Public Yahoo inputs; keep caches and derived models outside the website source. */
import fs from 'node:fs/promises';
import path from 'node:path';
import YahooFinance from 'yahoo-finance2';
const [directory]=process.argv.slice(2);
if(!directory||path.resolve(directory).startsWith(path.resolve(import.meta.dirname,'..')+path.sep))throw Error('Supply a research directory outside the website repository.');
const universe=JSON.parse(await fs.readFile(path.join(directory,'universe.json'),'utf8'));
const out=path.join(directory,'prices');await fs.mkdir(out,{recursive:true});
const yahoo=new YahooFinance({suppressNotices:['yahooSurvey']});
const period2=new Date();period2.setUTCHours(0,0,0,0);
const period1=new Date(period2);period1.setUTCFullYear(period1.getUTCFullYear()-3);
const end=period2.toISOString().slice(0,10),queue=[...new Set(['SPY','BIL',...universe.records.map(r=>r.ticker.replaceAll('.','-'))])];
let completed=0;const errors=[];
await Promise.all(Array.from({length:3},async()=>{while(queue.length){const ticker=queue.shift(),file=path.join(out,encodeURIComponent(ticker)+'.json');
 try{const cached=JSON.parse(await fs.readFile(file,'utf8'));if(cached.requestEnd===end){completed++;continue;}}catch{}
 try{const r=await yahoo.chart(ticker,{period1,period2,interval:'1d',events:'div|split'});
  const points=r.quotes.filter(q=>q.date<period2).map(q=>({date:q.date.toISOString().slice(0,10),close:q.close,adjusted:q.adjclose}));
  const splits=Object.values(r.events?.splits??{}).map(s=>({date:s.date.toISOString().slice(0,10),ratio:s.numerator/s.denominator}));
  await fs.writeFile(file,JSON.stringify({ticker,requestEnd:end,currency:r.meta.currency,instrumentType:r.meta.instrumentType,points,splits}));
 }catch(e){errors.push({ticker,error:String(e)});}
 completed++;if(completed%50===0)console.log(`${completed} prices checked; ${errors.length} unavailable`);
 await new Promise(r=>setTimeout(r,120));
}}));
await fs.writeFile(path.join(out,'report.json'),JSON.stringify({requestEnd:end,completed,errors},null,2));
console.log(JSON.stringify({completed,errors}));
