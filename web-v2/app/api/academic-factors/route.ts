import {inflateRawSync} from 'node:zlib';
import {combineFrench,validateAcademicFactors,type AcademicFactors} from '../../../lib/academic-factors.ts';
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
async function loadPublishedFactors() {
  const base = 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/';
  try {
    const texts = await Promise.all(['F-F_Research_Data_5_Factors_2x3_daily_CSV.zip', 'F-F_Momentum_Factor_daily_CSV.zip'].map(async file => {
      const response = await fetch(base + file, {signal: AbortSignal.timeout(8000)});
      if (!response.ok) throw Error('French archive unavailable.');
      return csvInZip(await response.arrayBuffer());
    }));
    return combineFrench(texts[0], texts[1]);
  } catch {
    // The independent FactorScope data service reads the same two French archives.
    const response = await fetch('https://factorscope-v2.frede2200.chatgpt.site/api/academic-factors', {signal: AbortSignal.timeout(10000)});
    if (!response.ok) throw Error('Factor service unavailable.');
    const data: AcademicFactors = await response.json();
    validateAcademicFactors(data);
    const expected = ['Market − RF', 'Size (SMB)', 'Value (HML)', 'Profitability (RMW)', 'Investment (CMA)', 'Momentum (Mom)'];
    if (data.names.some((name, i) => name !== expected[i])) throw Error('Unexpected factor ordering.');
    return data;
  }
}

export async function GET(request?: Request) {
  if (!cached || Date.now() > expires) {
    try {
      const latest = await loadPublishedFactors();
      if (!cached || latest.through >= cached.through) cached = latest;
      expires = Date.now() + 6 * 3600_000;
    } catch {
      if (!cached) {
        // Let the visitor fetch the public data directly if both server-side connections fail.
        if (request && new URL(request.url).origin === 'https://factor-scope.vercel.app') {
          return Response.redirect('https://factorscope-v2.frede2200.chatgpt.site/api/academic-factors', 307);
        }
        return Response.json({error:'French factor data are temporarily unavailable. No ETF substitute has been used.'}, {status:502});
      }
      // Keep the verified dated sample and retry soon.
      expires = Date.now() + 60_000;
    }
  }
  const maxAge = Math.min(3600, Math.max(0, Math.floor((expires - Date.now()) / 1000)));
  return Response.json(cached, {headers:{'Cache-Control':`public, max-age=${maxAge}`}});
}
