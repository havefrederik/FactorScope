import {hedgeSnapshot,validateHedges} from '../lib/hedge-support';
self.onmessage=({data})=>{
  try{
    const result=data.kind==='snapshot'?hedgeSnapshot(data.payload,data.weights,data.asOf,data.settings):validateHedges(data.payload,data.history,data.settings,data.start,data.end,data.frequency,(done,total)=>self.postMessage({kind:'progress',done,total}));
    self.postMessage({kind:'result',result});
  }catch(e){self.postMessage({kind:'error',message:(e as Error).message})}
};
