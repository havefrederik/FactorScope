import {createFundamentalApi} from '../../../lib/fundamental-api.ts';
let api:ReturnType<typeof createFundamentalApi>|undefined;
async function handler(request:Request){
 // @ts-ignore Cloudflare provides the private storage binding in the hosted runtime.
 const {env}=await import('cloudflare:workers');
 api??=createFundamentalApi(()=>({bucket:env.STATISTICAL_MODELS,adminToken:env.FUNDAMENTAL_MODEL_ADMIN_TOKEN}));
 return api(request);
}
export const GET=handler;export const POST=handler;export const PUT=handler;export const OPTIONS=handler;
