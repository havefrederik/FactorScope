import {parseStatisticalBundle,type StatisticalBundle} from './statistical-model.ts';
import {statisticalMetadata,statisticalDisplay,statisticalHistoryPoint,type PortfolioHistoryPage,type StatisticalRequest} from './statistical-public.ts';
type Store={get:(key:string)=>Promise<{text:()=>Promise<string>}|null>;put:(key:string,value:string)=>Promise<unknown>};
export function createStatisticalApi(getBindings:()=>{bucket:Store;adminToken:string|undefined}){
 let cached:StatisticalBundle|null=null,expires=0;
 const key='statistical-model-ew63-v2';
 const datedKey=(b:StatisticalBundle,date:string)=>`statistical-snapshot-v3-${b.sourceHash}-${date}`;
 const allowed=new Set(['https://factor-scope.vercel.app','https://factorscope-v2.frede2200.chatgpt.site','http://localhost:4173']);
 return async function handle(request:Request){
  const origin=request.headers.get('origin');
  const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  if(origin&&allowed.has(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS';headers['Access-Control-Allow-Headers']='Content-Type';}
  const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(origin&&!allowed.has(origin))return json({error:'Origin not allowed.'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  try{
   const {bucket,adminToken}=getBindings();
   if(request.method==='PUT'){
    if(!adminToken||request.headers.get('authorization')!==`Bearer ${adminToken}`)return json({error:'Unauthorized.'},401);
    if(Number(request.headers.get('content-length'))>3_000_000)return json({error:'Model is too large.'},413);
    const raw=await request.text();if(raw.length>3_000_000)return json({error:'Model is too large.'},413);
    const b=parseStatisticalBundle(JSON.parse(raw)),date=new URL(request.url).searchParams.get('date');
    if(date){
     if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([a-f0-9]{64})$/.test(b.sourceHash)||b.snapshots.length!==2||b.snapshots.some(s=>s.asOf!==date))return json({error:'Invalid dated model.'},400);
     await bucket.put(datedKey(b,date),JSON.stringify(b));return json({saved:true,date});
    }
    await bucket.put(key,JSON.stringify(b));cached=b;expires=Date.now()+60_000;return json({saved:true,dataThrough:b.dataThrough});
   }
   if(!['GET','POST'].includes(request.method))return json({error:'Method not allowed.'},405);
   if(!cached||Date.now()>expires){const object=await bucket.get(key);if(!object)return json({error:'The statistical model is being prepared. Please retry shortly.'},503);cached=parseStatisticalBundle(JSON.parse(await object.text()));expires=Date.now()+60_000;}
   const bundle=cached; // One request uses one published revision, including across awaited reads.
   if(request.method==='GET')return json(statisticalMetadata(bundle));
   if(Number(request.headers.get('content-length'))>32_000)return json({error:'Portfolio request is too large.'},413);
   const raw=await request.text();if(raw.length>32_000)return json({error:'Portfolio request is too large.'},413);
   const input=JSON.parse(raw) as StatisticalRequest;
   if(!input||!['ONE_YEAR_EQUAL','REFERENCE'].includes(input.variant))return json({error:'Choose an available model date and specification.'},400);
   const dates=bundle.historyDates??[...new Set(bundle.snapshots.filter(s=>s.variant===input.variant).map(s=>s.asOf))].sort();
   async function at(date:string){
    if(bundle.snapshots.some(s=>s.asOf===date&&s.variant===input.variant))return bundle;
    if(!dates.includes(date))throw new Error('Choose an available model date and specification.');
    const object=await bucket.get(datedKey(bundle,date));if(!object)throw Error('Missing private dated model');
    const dated=parseStatisticalBundle(JSON.parse(await object.text()));
    if(dated.sourceHash!==bundle.sourceHash)throw Error('Model revision mismatch');
    return dated;
   }
   if(input.view==='history'){
    const dated=input.datedHoldings;
    if(dated!==undefined&&(!Array.isArray(dated)||!dated.length||dated.length>12||dated.some((p,i)=>!p||!dates.includes(p.asOf)||(i>0&&p.asOf<=dated[i-1].asOf)||!Array.isArray(p.holdings)||!p.holdings.length)))return json({error:'Supply valid dated holdings for up to 12 available model dates.'},400);
    const start=dated?0:input.cursor??0;
    if(!Number.isInteger(start)||start<0||start>dates.length)return json({error:'Invalid history cursor.'},400);
    // At most 24 storage reads per request; four at a time to bound worker memory.
    const slice=dated?dated.map(p=>p.asOf):dates.slice(start,start+24),page:PortfolioHistoryPage={points:[],skipped:[],nextCursor:!dated&&start+24<dates.length?start+24:null};
    for(let i=0;i<slice.length;i+=4){
     await Promise.all(slice.slice(i,i+4).map(async date=>{
      try{page.points.push(statisticalHistoryPoint(await at(date),{...input,asOf:date,...(dated?{portfolio:undefined,holdings:dated.find(p=>p.asOf===date)!.holdings}:{})}));}
      catch(e){if(e instanceof Error&&e.message.startsWith('Model coverage missing:'))page.skipped.push({date,reason:e.message});else throw e;}
     }));
    }
    page.points.sort((a,b)=>a.date.localeCompare(b.date));page.skipped.sort((a,b)=>a.date.localeCompare(b.date));return json(page);
   }
   return json(statisticalDisplay(await at(input.asOf),input));
  }catch(e){return json({error:e instanceof Error&&/Choose an available|Supply a valid|Portfolio net value|Model coverage missing/.test(e.message)?e.message:'Statistical analysis is temporarily unavailable.'},400);}
 };
}
