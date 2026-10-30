import {inflateRawSync} from 'node:zlib';
import {combineFrench,type AcademicFactors} from '../../../lib/academic-factors.ts';
let cached:AcademicFactors|null=null,expires=0;
/** Read a small, single-CSV ZIP using its central directory; no filesystem extraction. */
function csvInZip(buffer:ArrayBuffer){
 const bytes=new Uint8Array(buffer),view=new DataView(buffer);
 for(let p=0;p+46<bytes.length;p++)if(view.getUint32(p,true)===0x02014b50){
  const method=view.getUint16(p+10,true),size=view.getUint32(p+20,true),plainSize=view.getUint32(p+24,true),nameLength=view.getUint16(p+28,true),offset=view.getUint32(p+42,true);
  const name=new TextDecoder().decode(bytes.slice(p+46,p+46+nameLength));if(!name.toLowerCase().endsWith('.csv'))continue;
  if(plainSize>10_000_000||offset+30>bytes.length||view.getUint32(offset,true)!==0x04034b50)throw Error('Invalid factor archive.');
  const start=offset+30+view.getUint16(offset+26,true)+view.getUint16(offset+28,true);if(start+size>bytes.length)throw Error('Truncated factor archive.');
  const data=bytes.slice(start,start+size);return new TextDecoder().decode(method===8?inflateRawSync(data,{maxOutputLength:10_000_000}):method===0?data:(()=>{throw Error('Unsupported factor archive')})());
 }throw Error('CSV missing from factor archive.');
}
export async function GET(){
 try{
  if(!cached||Date.now()>expires){
   const base='https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/';
   const texts=await Promise.all(['F-F_Research_Data_5_Factors_2x3_daily_CSV.zip','F-F_Momentum_Factor_daily_CSV.zip'].map(async file=>{const r=await fetch(base+file,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('French data download unavailable.');return csvInZip(await r.arrayBuffer())}));
   cached=combineFrench(texts[0],texts[1]);expires=Date.now()+6*3600_000;
  }
  return Response.json(cached,{headers:{'Cache-Control':'public, max-age=3600'}});
 }catch{return Response.json({error:'French factor data are temporarily unavailable. No ETF substitute has been used.'},{status:502});}
}
