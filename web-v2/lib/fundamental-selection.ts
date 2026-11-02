import type { FundamentalBundle } from './fundamental-risk.ts';
import { principalComponents } from './shrinkage-risk.ts';
const dot=(a:ArrayLike<number>,b:ArrayLike<number>)=>{let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s;};
export type RefitPanel={designs:string;outcomes:string;weights:string;reference:number[]};
export function unpackFloats(encoded:string,length:number){
 const binary=atob(encoded),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 if(bytes.byteLength!==length*4)throw Error('Invalid private estimation panel.');
 const view=new DataView(bytes.buffer),out=new Float32Array(length);
 for(let i=0;i<length;i++){out[i]=view.getFloat32(i*4,true);if(!Number.isFinite(out[i]))throw Error('Invalid private estimation value.');}return out;
}
/** Refit each dated weighted cross-section BEFORE extracting residual PCs.
 * Omitting a named factor puts its unexplained risk back into the residual panel. */
export function selectFundamentalFactors(b:FundamentalBundle,selected:number[]):FundamentalBundle{
 const n=b.tickers.length,k=b.factorNames.length,t=b.observations;
 if(!Array.isArray(selected)||new Set(selected).size!==selected.length||selected.some(i=>!Number.isInteger(i)||i<0||i>=k))throw Error('Choose available fundamental factors.');
 const ids=[...selected].sort((a,b)=>a-b);
 if(ids.length===k)return b;
 if(!b.refit)throw Error('Factor selection requires the updated private estimation panel.');
 const panel=b.refit,refs=panel.reference;
 if(refs.length!==b.referenceCount||new Set(refs).size!==refs.length||refs.some(i=>!Number.isInteger(i)||i<0||i>=n))throw Error('Invalid reference universe.');
 const X=unpackFloats(panel.designs,t*n*k),Y=unpackFloats(panel.outcomes,t*n),W=unpackFloats(panel.weights,t*n);
 const F=ids.map(()=>Array(t).fill(0)),E=Array.from({length:n},()=>Array(t).fill(0));
 for(let d=0;d<t;d++){
  const Q:number[][]=[],R=ids.map(()=>ids.map(()=>0));
  for(let j=0;j<ids.length;j++){
   let v=refs.map(i=>X[(d*n+i)*k+ids[j]]*W[d*n+i]);const original=Math.sqrt(dot(v,v));
   for(let pass=0;pass<2;pass++)for(let q=0;q<j;q++){const r=dot(Q[q],v);R[q][j]+=r;v=v.map((x,i)=>x-r*Q[q][i]);}
   R[j][j]=Math.sqrt(dot(v,v));if(R[j][j]<original*1e-9||R[j][j]<1e-12)throw Error('Selected fundamental exposures are rank deficient.');Q.push(v.map(x=>x/R[j][j]));
  }
  const y=refs.map(i=>Y[d*n+i]*W[d*n+i]),f=Q.map(q=>dot(q,y));
  for(let j=f.length-1;j>=0;j--){for(let q=j+1;q<f.length;q++)f[j]-=R[j][q]*f[q];f[j]/=R[j][j];F[j][d]=f[j];}
  for(let i=0;i<n;i++)E[i][d]=Y[d*n+i]-ids.reduce((s,id,j)=>s+X[(d*n+i)*k+id]*f[j],0);
 }
 for(const row of E){const m=row.reduce((s,x)=>s+x,0)/t;for(let d=0;d<t;d++)row[d]-=m;}
 // Use the smaller time × time Gram matrix for reference-universe standardized PCA.
 const scales=E.map(r=>Math.max(1e-5,Math.sqrt(dot(r,r)/t)));
 const gramTime=Array.from({length:t},()=>Array(t).fill(0));
 for(const i of refs)for(let a=0;a<t;a++)for(let c=0;c<=a;c++)gramTime[a][c]+=E[i][a]*E[i][c]/(scales[i]*scales[i]*t);
 for(let a=0;a<t;a++)for(let c=0;c<a;c++)gramTime[c][a]=gramTime[a][c];
 const eig=principalComponents(gramTime).filter(x=>x.variance>1e-10).slice(0,20);
 const S=eig.map(e=>e.vector.map(v=>v*Math.sqrt(t*e.variance))),lam=eig.map(e=>e.variance);
 const A=E.map(r=>S.map((s,j)=>dot(r,s)/t/lam[j]));
 for(let j=0;j<S.length;j++){const anchor=A.reduce((a,r,i)=>Math.abs(r[j])>Math.abs(A[a][j])?i:a,0);if(A[anchor][j]<0){S[j]=S[j].map(v=>-v);A.forEach(r=>r[j]*=-1);}}
 const C=E.map(r=>E.map(q=>dot(r,q)/t)),G=S.map((_,a)=>S.map((_,c)=>A.reduce((s,r)=>s+r[a]*r[c],0)));
 const projection=S.map((_,j)=>Array.from({length:t},(_,d)=>E.reduce((s,r,i)=>s+r[d]*A[i][j],0)));
 const selectedGroups=ids.map(i=>i===0?'Core':i<=b.industryCount?'Sector':'Style');
 return {...b,factorNames:ids.map(i=>b.factorNames[i]),factorGroups:selectedGroups,exposures:b.exposures.map(r=>ids.map(i=>r[i])),factorReturns:F,
  statLoadings:A,statReturns:S,statVariances:lam,residualCovariance:C,gram:G,residualProjection:projection,
  squaredNorms:Array.from({length:t},(_,d)=>E.reduce((s,r)=>s+r[d]*r[d],0)),covarianceNormSquared:C.reduce((s,r)=>s+dot(r,r),0),
  loadingCovarianceQuadratic:S.map((_,j)=>A.reduce((s,r,i)=>s+r[j]*C[i].reduce((v,c,l)=>v+c*A[l][j],0),0)),residualTrace:C.reduce((s,r,i)=>s+r[i],0)};
}
