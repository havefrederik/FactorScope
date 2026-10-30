import {parseFundamentalBundle,fundamentalDisplay,type FundamentalBundle} from './fundamental-risk.ts';
type Store={get:(key:string)=>Promise<{text:()=>Promise<string>}|null>;put:(key:string,value:string)=>Promise<unknown>};
export function createFundamentalApi(bindings:()=>{bucket:Store;adminToken:string|undefined}){
 let cached:FundamentalBundle|null=null,expires=0;const key='fundamental-model-v1';
 const allowed=new Set(['https://factor-scope.vercel.app','https://factorscope-v2.frede2200.chatgpt.site','http://localhost:4173']);
 return async(request:Request)=>{
  const origin=request.headers.get('origin'),headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
  if(origin&&!allowed.has(origin))return json({error:'Origin not allowed.'},403);
  if(origin){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS';headers['Access-Control-Allow-Headers']='Content-Type';}
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  try{
   const {bucket,adminToken}=bindings();
   if(request.method==='PUT'){
    if(!adminToken||request.headers.get('authorization')!==`Bearer ${adminToken}`)return json({error:'Unauthorized.'},401);
    if(Number(request.headers.get('content-length'))>16_000_000)return json({error:'Model too large.'},413);
    const raw=await request.text();if(raw.length>16_000_000)return json({error:'Model too large.'},413);
    const b=parseFundamentalBundle(JSON.parse(raw));await bucket.put(key,JSON.stringify(b));cached=b;expires=Date.now()+60000;
    return json({saved:true,asOf:b.asOf,stocks:b.tickers.length});
   }
   if(!['GET','POST'].includes(request.method))return json({error:'Method not allowed.'},405);
   if(!cached||Date.now()>expires){const raw=await bucket.get(key);if(!raw)return json({error:'Fundamental model is being prepared.'},503);cached=parseFundamentalBundle(JSON.parse(await raw.text()));expires=Date.now()+60000;}
   const b=cached;
   if(request.method==='GET')return json({asOf:b.asOf,universeDate:b.universeDate,observations:b.observations,referenceCount:b.referenceCount,stocks:b.tickers.length,components:b.statReturns.length,limitations:b.limitations});
   const raw=await request.text();if(raw.length>16000)return json({error:'Request too large.'},413);
   const input=JSON.parse(raw);return json(fundamentalDisplay(b,input.tickers,input.asOf,input.selected??[]));
  }catch(e){return json({error:e instanceof Error?e.message:'Fundamental analysis unavailable.'},400);}
 };
}
