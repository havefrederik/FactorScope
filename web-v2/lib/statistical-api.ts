import {parseStatisticalBundle,type StatisticalBundle} from './statistical-model.ts';
import {statisticalMetadata,statisticalDisplay} from './statistical-public.ts';
type Store={get:(key:string)=>Promise<{text:()=>Promise<string>}|null>;put:(key:string,value:string)=>Promise<unknown>};
export function createStatisticalApi(getBindings:()=>{bucket:Store;adminToken:string|undefined}){
 let cached:StatisticalBundle|null=null;
 const key='statistical-model-ew63-v2';
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
    const b=parseStatisticalBundle(JSON.parse(raw));await bucket.put(key,JSON.stringify(b));cached=b;return json({saved:true,dataThrough:b.dataThrough});
   }
   if(!['GET','POST'].includes(request.method))return json({error:'Method not allowed.'},405);
   if(!cached){const object=await bucket.get(key);if(!object)return json({error:'The statistical model is being prepared. Please retry shortly.'},503);cached=parseStatisticalBundle(JSON.parse(await object.text()));}
   if(request.method==='GET')return json(statisticalMetadata(cached));
   if(Number(request.headers.get('content-length'))>32_000)return json({error:'Portfolio request is too large.'},413);
   const raw=await request.text();if(raw.length>32_000)return json({error:'Portfolio request is too large.'},413);
   return json(statisticalDisplay(cached,JSON.parse(raw)));
  }catch(e){return json({error:e instanceof Error&&/Choose an available|Supply a valid|Portfolio net value|Model coverage missing/.test(e.message)?e.message:'Statistical analysis is temporarily unavailable.'},400);}
 };
}
