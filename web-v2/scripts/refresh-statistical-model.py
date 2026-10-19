"""Re-estimate dated models privately; publish only their displayed results through the API.
The supplied research package and archived panel are never modified.
"""
import os
for k in ('OPENBLAS_NUM_THREADS','OMP_NUM_THREADS','MKL_NUM_THREADS','NUMEXPR_NUM_THREADS','VECLIB_MAXIMUM_THREADS'):os.environ[k]='1'
import argparse,json,sys,hashlib
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor,as_completed
import numpy as np
import pandas as pd
DATA={}
def clean(x):
    if isinstance(x,dict):return {k:clean(v) for k,v in x.items()}
    if isinstance(x,(list,tuple)):return [clean(v) for v in x]
    if isinstance(x,np.ndarray):return clean(x.tolist())
    if isinstance(x,(float,np.floating)):return float(x) if np.isfinite(x) else None
    if isinstance(x,np.integer):return int(x)
    return x

def setup(root,panel,out,source_hash):
    global DATA
    root=Path(root);sys.path.insert(0,str(root/'source'))
    import run_variants as rv
    rv.setup();rv.DATA.update(dict(np.load(panel,allow_pickle=False)))
    d=rv.DATA;amap=json.loads((root/'inputs/ai35_permnos.json').read_text());legacy=pd.read_csv(root/'inputs/legacy_mapping_checked.csv')
    lookup={str(r.ticker).replace('-','.'):int(r.permno) for r in legacy.itertuples()};lookup.update({k.replace('-','.'):v for k,v in amap.items()})
    tickers='AAPL,MSFT,NVDA,AMZN,GOOGL,META,TSLA,AVGO,AMD,CRM,ORCL,NFLX,JPM,BAC,GS,BRK.B,XOM,CVX,COP,UNH,LLY,JNJ,ABBV,PFE,CAT,HON,GE,BA,COST,WMT,HD,KO,PEP,PG,NEE,DUK,SO,DIS,MCD'.split(',')
    requested=list(dict.fromkeys([*tickers,*amap]));ids=d['permnos'].tolist();selected=[(t,ids.index(lookup[t])) for t in requested if t in lookup and lookup[t] in ids]
    if len(selected)!=len(requested):raise ValueError('Unmapped receiver stocks')
    base=dict(schemaVersion=2,title='Statistical replication research',source='CRSP history + overlap-audited Yahoo adjusted-return extension',dataThrough=str(d['dates'][-1])[:10],sourceHash=source_hash,universeNote='Research eligibility is anchored to the archived universe. Yahoo continuation preserves that universe and excludes failed overlap or coverage checks; it does not certify current eligibility or remove survivorship bias.',aiBasket=list(amap))
    DATA=dict(rv=rv,root=root,out=Path(out),base=base,selected=selected)

def task(date):
    from run_history import load_fit,portfolios
    from risk_core import separate_cov
    rv=DATA['rv'];root=DATA['root'];base=DATA['base'];selected=DATA['selected'];file=DATA['out']/f'{date}.json'
    if file.exists():
        old=json.loads(file.read_text())
        if old.get('sourceHash')==base['sourceHash']:return date,'cached'
    ix,raw,don=rv.data_at(date,'REIT');ledger=rv.DATA['ledger'];snapshots=[];histories=[];checks=[]
    for variant in ('ONE_YEAR_EQUAL','REFERENCE'):
        f,_,_,_=rv.extract(raw[:,don],variant);H=separate_cov(f,len(f),len(f),60,125,1)
        y=raw[:,[i for _,i in selected]];B,a,d,counts=load_fit(f,y,'EW63')
        good=np.isfinite(B).all(1)&np.isfinite(d)&(d>0)&np.isfinite(y[-250:]).all(0)
        stocks=[dict(ticker=t,exposures=B[j],specificVariance=d[j]) for j,(t,_) in enumerate(selected) if good[j]]
        moments=np.cov(np.column_stack([y[-250:,good],f[-250:]]),rowvar=False);n=len(stocks)
        z=raw[-250:,don];z=z-z.mean(0);ff=f[-250:]-f[-250:].mean(0);cs=(z.T@ff)/np.sqrt(np.outer((z*z).sum(0),(ff*ff).sum(0)))
        profiles=[]
        for k in range(20):
            order=np.argsort(cs[:,k]);sides=[]
            for order_side in (order[:5],order[-5:][::-1]):
                sides.append([dict(ticker=str(ledger.iloc[don[q]].chosen_symbol),correlation=float(cs[q,k])) for q in order_side])
            profiles.append(dict(negative=sides[0],positive=sides[1]))
        snapshots.append(dict(asOf=date,variant=variant,population='REIT-inclusive',donorCount=len(don),loading='EW63',dates=rv.DATA['dates'][ix[-250:]].astype('datetime64[D]').astype(str).tolist(),covariance=H,stocks=stocks,profiles=profiles,observedCovariance=moments[:n,:n],stockFactorCovariance=moments[:n,n:],factorVariances=np.diag(moments)[n:]))
        names=base['aiBasket'];ai=[next(j for j,(t,_) in enumerate(selected) if t==name) for name in names]
        metrics=portfolios(B[ai],H,d[ai],counts[ai],f,y[:,ai],names,rv.DATA['defs'],date,'REIT','EW63',len(don))
        for row in metrics:
            if not row['coverage_ok']:continue
            chosen=names if row['basket']=='AI35' else rv.DATA['defs']['strict32'] if row['basket']=='AI32' else [t for t in names if good[next(j for j,(name,_) in enumerate(selected) if name==t)]]
            inds=[next(j for j,(t,_) in enumerate(selected) if t==name) for name in chosen]
            corr=np.abs(np.corrcoef(np.column_stack([y[-250:,inds].mean(1),f[-250:]]),rowvar=False)[0,1:])
            histories.append(dict(variant=variant,loading='EW63',basket=row['basket'],points=[dict(date=date,nHoldings=row['n_holdings'],correlations=corr,risk=[row['f1_bps'],row['f2_bps'],row['other_bps'],row['specific_bps']],volatility=row['volatility'])]))
        cpfile=root/f'results/checkpoints/REIT_{date}_{variant}_EW63.npz'
        if cpfile.exists():
            cp=np.load(cpfile,allow_pickle=False);err=float(np.max(np.abs(H-cp['H'])));be=float(np.nanmax(np.abs(B[ai]-cp['B'])));de=float(np.nanmax(np.abs(d[ai]-cp['d'])))
            if max(err,be,de)>1e-8:raise ValueError('Archived checkpoint replay failed')
            checks.append(dict(date=date,variant=variant,covarianceMaxError=err,loadingMaxError=be,specificMaxError=de))
    result=clean(dict(**base,snapshots=snapshots,histories=histories,exportChecks=checks))
    file.write_text(json.dumps(result,separators=(',',':'),allow_nan=False));return date,len(don)

def main():
    p=argparse.ArgumentParser();p.add_argument('--research-dir',required=True,type=Path);p.add_argument('--panel',required=True,type=Path);p.add_argument('--output-dir',required=True,type=Path);p.add_argument('--workers',type=int,default=2);a=p.parse_args()
    repo=Path(__file__).resolve().parents[1]
    if a.output_dir.resolve().is_relative_to(repo):raise ValueError('Write private outputs outside the public website checkout')
    a.output_dir.mkdir(parents=True,exist_ok=True);source_hash=hashlib.sha256(a.panel.read_bytes()).hexdigest()
    z=np.load(a.panel);days=z['dates'].astype('datetime64[D]').astype(str);old=sorted(pd.read_csv(a.research_dir/'inputs/reference_history.csv').date.unique());archived=old[-1]
    # Last actual session of each completed week, plus the latest completed session.
    extra=pd.Series(days[days>archived]);weekly=extra.groupby(pd.to_datetime(extra).dt.to_period('W-FRI')).last().tolist();dates=sorted(set(old+weekly+[days[-1]]))
    args=(str(a.research_dir.resolve()),str(a.panel.resolve()),str(a.output_dir.resolve()),source_hash)
    with ProcessPoolExecutor(max_workers=a.workers,initializer=setup,initargs=args) as pool:
        jobs={pool.submit(task,d):d for d in dates}
        for i,job in enumerate(as_completed(jobs),1):
            print(i,'/',len(dates),job.result(),flush=True)
    rows=[json.loads((a.output_dir/f'{date}.json').read_text()) for date in dates]
    latest=rows[-1];histories=[]
    for variant in ('ONE_YEAR_EQUAL','REFERENCE'):
        for basket in ('AVAILABLE_NOT_AI35','AI35','AI32'):
            points=[p for row in rows for h in row['histories'] if h['variant']==variant and h['basket']==basket for p in h['points']]
            histories.append(dict(variant=variant,loading='EW63',basket=basket,points=points))
    latest.update(histories=histories,historyDates=dates,exportChecks=[c for row in rows for c in row['exportChecks']]);(a.output_dir/'model.json').write_text(json.dumps(latest,separators=(',',':'),allow_nan=False))
    print('Published manifest prepared privately:',len(dates),'model dates through',days[-1],flush=True)
if __name__=='__main__':main()
