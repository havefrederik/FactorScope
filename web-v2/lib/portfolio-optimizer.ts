export type ExposureLimit={name:string;values:number[];min:number|null;max:number|null};
export type OptimizerInput={covariance:number[][];current:number[];objective:"Minimum volatility"|"Maximum Sharpe";expectedReturns?:number[];longOnly:boolean;net:number;gross:number;positionCap:number;turnoverCap:number|null;changeCap:number|null;locked:number[];exposures:ExposureLimit[]};
export type OptimizerAudit={name:string;current:number;proposed:number;min:number|null;max:number|null;passed:boolean};
export type OptimizerResult={status:"Solved"|"Invalid inputs"|"Not solved";message:string;weights:number[];volatility:number;currentVolatility:number;cash:number;gross:number;turnover:number;expectedReturn:number|null;assumedSharpe:number|null;audit:OptimizerAudit[];iterations:number;primalResidual:number;dualResidual:number};
const dot=(a:number[],b:number[])=>a.reduce((s,v,i)=>s+v*b[i],0);
const multiply=(a:number[][],x:number[])=>a.map(row=>dot(row,x));
const norm=(x:number[])=>Math.max(0,...x.map(Math.abs));
const sum=(x:number[])=>x.reduce((a,b)=>a+b,0);
const volatility=(w:number[],c:number[][])=>Math.sqrt(Math.max(0,dot(w,multiply(c,w))));
function cholesky(a:number[][]){const n=a.length,l=Array.from({length:n},()=>Array(n).fill(0));for(let i=0;i<n;i++)for(let j=0;j<=i;j++){let v=a[i][j];for(let k=0;k<j;k++)v-=l[i][k]*l[j][k];if(i===j){if(!(v>0))return null;l[i][j]=Math.sqrt(v);}else l[i][j]=v/l[j][j];}return l;}
function solve(l:number[][],b:number[]){const n=b.length,x=Array(n).fill(0),y=Array(n).fill(0);for(let i=0;i<n;i++){let v=b[i];for(let j=0;j<i;j++)v-=l[i][j]*y[j];y[i]=v/l[i][i];}for(let i=n-1;i>=0;i--){let v=y[i];for(let j=i+1;j<n;j++)v-=l[j][i]*x[j];x[i]=v/l[i][i];}return x;}

// Box-constrained ADMM for convex QPs, using the indirect-system equations and
// primal/dual stopping residuals described in https://osqp.org/docs/solver/ .
// This is a small local implementation, not the OSQP library or its certificates.
function quadraticProgram(p:number[][],a:number[][],lo:number[],hi:number[],initial:number[]){
  const n=p.length,m=a.length,at=Array.from({length:n},(_,i)=>a.map(row=>row[i]));
  const ata=at.map(row=>at.map(other=>dot(row,other)));
  const sigma=1e-7,alpha=1.6;let rho=1;
  function factor(){return cholesky(p.map((row,i)=>row.map((value,j)=>value+rho*ata[i][j]+(i===j?sigma:0))));}
  let l=factor();if(!l)return null;
  let x=initial.slice(),z=multiply(a,x).map((v,i)=>Math.max(lo[i],Math.min(hi[i],v))),dual=Array(m).fill(0),primalResidual=Infinity,dualResidual=Infinity;
  for(let iteration=1;iteration<=12000;iteration++){
    const rhs=at.map((row,i)=>sigma*x[i]+row.reduce((s,v,j)=>s+v*(rho*z[j]-dual[j]),0));
    x=solve(l,rhs);const ax=multiply(a,x);
    for(let i=0;i<m;i++){const relaxed=alpha*ax[i]+(1-alpha)*z[i];z[i]=Math.max(lo[i],Math.min(hi[i],relaxed+dual[i]/rho));dual[i]+=rho*(relaxed-z[i]);}
    if(iteration%20!==0)continue;
    const px=multiply(p,x),aty=at.map(row=>dot(row,dual));
    primalResidual=norm(ax.map((v,i)=>v-z[i]));dualResidual=norm(px.map((v,i)=>v+aty[i]));
    if(!x.every(Number.isFinite))return null;
    const primalTolerance=1e-8+1e-7*Math.max(norm(ax),norm(z));
    const dualTolerance=1e-8+1e-7*Math.max(norm(px),norm(aty));
    if(primalResidual<=primalTolerance&&dualResidual<=dualTolerance)return {x,iteration,primalResidual,dualResidual};
    if(iteration%100===0){const ratio=Math.sqrt(primalResidual/Math.max(dualResidual,1e-15));if(ratio>4||ratio<.25){rho=Math.max(1e-5,Math.min(1e5,rho*Math.max(.1,Math.min(10,ratio))));l=factor();if(!l)return null;}}
  }
  return {x,iteration:12000,primalResidual,dualResidual};
}

export function optimizePortfolio(input:OptimizerInput):OptimizerResult{
  const empty=(status:OptimizerResult["status"],message:string):OptimizerResult=>({status,message,weights:[],volatility:0,currentVolatility:0,cash:0,gross:0,turnover:0,expectedReturn:null,assumedSharpe:null,audit:[],iterations:0,primalResidual:Infinity,dualResidual:Infinity});
  const n=input.current.length;
  if(!n||n>150||input.covariance.length!==n||input.covariance.some(row=>row.length!==n||row.some(v=>!Number.isFinite(v)))||input.current.some(v=>!Number.isFinite(v)))return empty("Invalid inputs","A finite covariance matrix and aligned portfolio weights are required (up to 150 assets).");
  if(![input.net,input.gross,input.positionCap].every(Number.isFinite)||Math.abs(input.net)>1||input.gross<Math.abs(input.net)||input.positionCap<=0||input.turnoverCap!==null&&(!Number.isFinite(input.turnoverCap)||input.turnoverCap<0)||input.changeCap!==null&&(!Number.isFinite(input.changeCap)||input.changeCap<0))return empty("Invalid inputs","Check net exposure, gross exposure, position and trading limits.");
  if(input.longOnly&&input.net<0||Math.abs(input.net)>n*input.positionCap+1e-10)return empty("Invalid inputs","The net exposure cannot be reached with this universe and position cap.");
  if(input.locked.some(i=>!Number.isInteger(i)||i<0||i>=n))return empty("Invalid inputs","A locked position is outside the optimization universe.");
  for(const exposure of input.exposures)if(exposure.values.length!==n||exposure.values.some(v=>!Number.isFinite(v))||exposure.min!==null&&!Number.isFinite(exposure.min)||exposure.max!==null&&!Number.isFinite(exposure.max)||exposure.min!==null&&exposure.max!==null&&exposure.min>exposure.max)return empty("Invalid inputs",`Check ${exposure.name} exposure bounds.`);
  const sharpe=input.objective==="Maximum Sharpe",mu=input.expectedReturns??Array(n).fill(0);
  if(sharpe&&(mu.length!==n||mu.some(v=>!Number.isFinite(v))||!mu.some(v=>Math.abs(v)>1e-10)))return empty("Invalid inputs","Enter annual expected excess returns for maximum-Sharpe optimization. Blank values mean zero.");
  if(sharpe&&input.longOnly&&mu.every(v=>v<=0))return empty("Invalid inputs","Maximum Sharpe requires a feasible portfolio with positive assumed excess return.");
  if(sharpe&&input.longOnly&&input.net===0)return empty("Invalid inputs","A long-only portfolio with zero net exposure cannot have positive assumed excess return.");
  const average=input.covariance.reduce((s,row,i)=>s+row[i],0)/n;
  if(!(average>0))return empty("Invalid inputs","Positive forecast variances are required.");
  const covariance=input.covariance.map((row,i)=>row.map((v,j)=>(v+input.covariance[j][i])/2));
  if(!cholesky(covariance.map((row,i)=>row.map((v,j)=>v+(i===j?average*1e-10:0)))))return empty("Invalid inputs","The covariance matrix must be positive semidefinite.");
  const scaleIndex=sharpe?n:-1,grossIndex=n+(sharpe?1:0),tradeIndex=grossIndex+n,dimension=tradeIndex+(input.turnoverCap===null?0:n);
  const p=Array.from({length:dimension},(_,i)=>Array.from({length:dimension},(_,j)=>i<n&&j<n?2*covariance[i][j]/average:0));
  const a:number[][]=[],lo:number[]=[],hi:number[]=[];
  const vector=()=>Array(dimension).fill(0);
  function row(values:number[],lower:number,upper:number){const length=Math.sqrt(dot(values,values));if(length<1e-14){if(lower>0||upper<0)throw Error("Contradictory zero exposure constraint");return;}a.push(values.map(v=>v/length));lo.push(lower/length);hi.push(upper/length);}
  // For Sharpe, y=t*w and mu'y=1: minimize y'Σy. Every original affine
  // constraint is homogenized in t, preserving turnover, locks and exposures.
  function bound(values:number[],lower:number|null,upper:number|null){
    if(!sharpe){row(values,lower??-Infinity,upper??Infinity);return;}
    if(lower!==null){const v=values.slice();v[scaleIndex]-=lower;row(v,0,Infinity);}
    if(upper!==null){const v=values.slice();v[scaleIndex]-=upper;row(v,-Infinity,0);}
  }
  try{
    const budget=vector();for(let i=0;i<n;i++)budget[i]=1;bound(budget,input.net,input.net);
    for(let i=0;i<n;i++){
      const v=vector();v[i]=1;
      let lower=input.longOnly?0:-input.positionCap,upper=input.positionCap;
      if(input.changeCap!==null){lower=Math.max(lower,input.current[i]-input.changeCap);upper=Math.min(upper,input.current[i]+input.changeCap);}
      if(input.locked.includes(i)){lower=Math.max(lower,input.current[i]);upper=Math.min(upper,input.current[i]);}
      if(lower>upper+1e-12)return empty("Invalid inputs",`Position ${i+1} conflicts with its lock, side or position limits.`);
      bound(v,lower,upper);
      const plus=vector();plus[i]=1;plus[grossIndex+i]=-1;row(plus,-Infinity,0);
      const minus=vector();minus[i]=-1;minus[grossIndex+i]=-1;row(minus,-Infinity,0);
      if(input.turnoverCap!==null){const buy=vector();buy[i]=1;buy[tradeIndex+i]=-1;if(sharpe){buy[scaleIndex]=-input.current[i];row(buy,-Infinity,0);}else row(buy,-Infinity,input.current[i]);const sell=vector();sell[i]=-1;sell[tradeIndex+i]=-1;if(sharpe){sell[scaleIndex]=input.current[i];row(sell,-Infinity,0);}else row(sell,-Infinity,-input.current[i]);}
    }
    const gross=vector();for(let i=0;i<n;i++)gross[grossIndex+i]=1;bound(gross,null,input.gross);
    if(input.turnoverCap!==null){const trade=vector();for(let i=0;i<n;i++)trade[tradeIndex+i]=1;bound(trade,null,input.turnoverCap);}
    for(const exposure of input.exposures){const v=vector();exposure.values.forEach((value,i)=>v[i]=value);bound(v,exposure.min,exposure.max);}
    if(sharpe){const expected=vector();mu.forEach((v,i)=>expected[i]=v);row(expected,1,1);const scale=vector();scale[scaleIndex]=1;row(scale,1e-6,1e6);}
  }catch{return empty("Invalid inputs","An exposure constraint contradicts the available asset exposures.");}
  const initial=vector();input.current.forEach((v,i)=>{initial[i]=v;initial[grossIndex+i]=Math.abs(v);});if(sharpe)initial[scaleIndex]=1;
  const solved=quadraticProgram(p,a,lo,hi,initial);
  if(!solved||solved.iteration>=12000)return empty("Not solved","The solver did not converge. The limits may conflict; relax them and run again. No proposal has been applied.");
  const t=sharpe?solved.x[scaleIndex]:1,weights=solved.x.slice(0,n).map(v=>v/t);
  if(!weights.every(Number.isFinite)||!(t>0))return empty("Not solved","Numerical failure; no proposal has been applied.");
  const audit:OptimizerAudit[]=[];
  function check(name:string,current:number,proposed:number,min:number|null,max:number|null){audit.push({name,current,proposed,min,max,passed:(min===null||proposed>=min-2e-6)&&(max===null||proposed<=max+2e-6)});}
  const gross=sum(weights.map(Math.abs)),turnover=sum(weights.map((v,i)=>Math.abs(v-input.current[i])));
  check("Net exposure",sum(input.current),sum(weights),input.net,input.net);
  check("Gross exposure",sum(input.current.map(Math.abs)),gross,null,input.gross);
  check("Largest absolute position",norm(input.current),norm(weights),null,input.positionCap);
  if(input.longOnly)check("Smallest stock weight",Math.min(...input.current),Math.min(...weights),0,null);
  if(input.turnoverCap!==null)check("Traded weight / NAV",0,turnover,null,input.turnoverCap);
  if(input.changeCap!==null)check("Largest position change",0,norm(weights.map((v,i)=>v-input.current[i])),null,input.changeCap);
  for(const i of input.locked)check(`Locked position ${i+1}`,input.current[i],weights[i],input.current[i],input.current[i]);
  for(const exposure of input.exposures)check(exposure.name,dot(exposure.values,input.current),dot(exposure.values,weights),exposure.min,exposure.max);
  if(audit.some(item=>!item.passed))return empty("Not solved","The numerical solution did not pass the constraint audit. No proposal has been applied.");
  const risk=volatility(weights,covariance),expectedReturn=sharpe?dot(mu,weights):null;
  if(sharpe&&!(expectedReturn!>1e-8))return empty("Not solved","No positive assumed excess-return portfolio was found under these limits.");
  return {status:"Solved",message:"Converged; every enabled constraint passed the independent weight audit.",weights,volatility:risk,currentVolatility:volatility(input.current,covariance),cash:1-sum(weights),gross,turnover,expectedReturn,assumedSharpe:expectedReturn!==null&&risk>1e-12?expectedReturn/risk:null,audit,iterations:solved.iteration,primalResidual:solved.primalResidual,dualResidual:solved.dualResidual};
}
