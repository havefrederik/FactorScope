"""Export a local FactorScope snapshot from the separately supplied research package.
Raw research inputs stay local. Only derived model summaries are suitable for the website.
Run: python scripts/export-statistical-model.py --research-dir /path/to/package --output /path/outside/repo/model.json
"""
import os
for key in ('OPENBLAS_NUM_THREADS','OMP_NUM_THREADS','MKL_NUM_THREADS','VECLIB_MAXIMUM_THREADS'):
    os.environ[key]='1'
import argparse, json, sys, hashlib
from pathlib import Path
import numpy as np
import pandas as pd

def clean(x):
    if isinstance(x,dict): return {k:clean(v) for k,v in x.items()}
    if isinstance(x,(list,tuple)): return [clean(v) for v in x]
    if isinstance(x,np.ndarray): return clean(x.tolist())
    if isinstance(x,(float,np.floating)): return float(x) if np.isfinite(x) else None
    if isinstance(x,np.integer): return int(x)
    return x

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--research-dir',required=True,type=Path)
    p.add_argument('--output',required=True,type=Path)
    p.add_argument('--dates',default='2023-12-29,2024-08-30,2025-04-04,2026-07-10')
    p.add_argument('--tickers',default='AAPL,MSFT,NVDA,AMZN,GOOGL,META,TSLA,AVGO,AMD,CRM,ORCL,NFLX,JPM,BAC,GS,BRK.B,XOM,CVX,COP,UNH,LLY,JNJ,ABBV,PFE,CAT,HON,GE,BA,COST,WMT,HD,KO,PEP,PG,NEE,DUK,SO,DIS,MCD')
    args=p.parse_args();root=args.research_dir.resolve()
    repo=Path(__file__).resolve().parents[1]
    if args.output.resolve().is_relative_to(repo): raise ValueError('Write private model data outside the public website checkout.')
    sys.path.insert(0,str(root/'source'))
    import run_variants as rv
    from run_history import load_fit,portfolios
    from risk_core import separate_cov
    rv.setup(); data=rv.DATA; ledger=data['ledger']; ids=data['permnos'].tolist()
    amap=json.loads((root/'inputs/ai35_permnos.json').read_text())
    legacy=pd.read_csv(root/'inputs/legacy_mapping_checked.csv')
    lookup={str(r.ticker).replace('-','.'):int(r.permno) for r in legacy.itertuples()}
    lookup.update({k.replace('-','.'):v for k,v in amap.items()})
    requested=list(dict.fromkeys([*args.tickers.upper().split(','),*amap.keys()]))
    selected=[(t,ids.index(lookup[t])) for t in requested if t in lookup and lookup[t] in ids]
    missing=[t for t in requested if t not in dict(selected)]
    snapshots=[];checks=[]
    for date in args.dates.split(','):
      if np.datetime64(date)>data['dates'][-1]: raise ValueError('Requested date exceeds source panel; refresh and audit the input panel first.')
      ix,raw,don=rv.data_at(date,'REIT')
      for variant in ('ONE_YEAR_EQUAL','REFERENCE'):
        f,_,_,_=rv.extract(raw[:,don],variant); H=separate_cov(f,len(f),len(f),60,125,1)
        inds=[i for _,i in selected]; y=raw[:,inds]; B,a,d,counts=load_fit(f,y,'EW63')
        stocks=[]
        for j,(ticker,i) in enumerate(selected):
          valid=np.isfinite(B[j]).all() and np.isfinite(d[j]) and np.isfinite(y[-250:,j]).all()
          if valid: stocks.append(dict(ticker=ticker,exposures=B[j],specificVariance=d[j],returns=y[-250:,j]))
        # The selected factor's extremes are measured across eligible extraction stocks,
        # not only the portfolio or the hand-picked AI basket.
        z=raw[-250:,don]; z=z-z.mean(0); ff=f[-250:]-f[-250:].mean(0)
        cs=(z.T@ff)/np.sqrt(np.outer((z*z).sum(0),(ff*ff).sum(0)))
        profiles=[]
        for k in range(20):
          order=np.argsort(cs[:,k]);pairs=[]
          for q in [*order[:5],*order[-5:][::-1]]:
            row=ledger.iloc[don[q]]; symbol=row.chosen_symbol
            if not isinstance(symbol,str) or not symbol: symbol=str(row.permno)
            pairs.append(dict(ticker=symbol,correlation=float(cs[q,k])))
          profiles.append(dict(negative=pairs[:5],positive=pairs[5:]))
        snap=dict(asOf=date,variant=variant,population='REIT-inclusive',donorCount=len(don),loading='EW63',dates=data['dates'][ix[-250:]].astype(str).tolist(),factorReturns=f[-250:],covariance=H,stocks=stocks,profiles=profiles)
        # Publish sufficient statistics, never daily security or factor return histories.
        observations=np.array([stock.pop('returns') for stock in stocks]).T
        moments=np.cov(np.column_stack([observations,f[-250:]]),rowvar=False)
        n=len(stocks)
        snap.pop('factorReturns')
        snap['observedCovariance']=moments[:n,:n]
        snap['stockFactorCovariance']=moments[:n,n:]
        snap['factorVariances']=np.diag(moments)[n:]
        snapshots.append(snap)
        # Independently compare the same AI basket against the supplied saved checkpoint.
        saved=root/f'results/checkpoints/REIT_{date}_{variant}_EW63.npz'
        if saved.exists():
          cp=np.load(saved,allow_pickle=False)
          err=float(np.max(np.abs(H-cp['H'])))
          names=cp['names'].tolist()
          pairs=[(j,names.index(t)) for j,(t,_) in enumerate(selected) if t in names and np.isfinite(B[j]).all()]
          be=max(float(np.max(np.abs(B[j]-cp['B'][k]))) for j,k in pairs)
          de=max(float(abs(d[j]-cp['d'][k])) for j,k in pairs)
          if be>1e-8 or de>1e-8: raise ValueError('EW63 loading replay failed')
          checks.append(dict(date=date,variant=variant,covarianceMaxError=err,loadingMaxError=be,specificMaxError=de))
          if err>1e-8:raise ValueError('Research covariance replay failed')
        print(date,variant,len(stocks),'receivers',len(don),'donors',flush=True)
    metrics=pd.read_csv(root/'results/metrics.csv');corr=pd.read_csv(root/'results/correlations.csv')
    histories=[]
    for variant in ('ONE_YEAR_EQUAL','REFERENCE'):
      for basket in ('AVAILABLE_NOT_AI35','AI35','AI32'):
        rows=metrics[(metrics.model=='REIT')&(metrics.variant==variant)&(metrics.loading=='EW63')&(metrics.basket==basket)&metrics.coverage_ok]
        cs=corr[(corr.model=='REIT')&(corr.variant==variant)&(corr.basket==basket)].pivot(index='date',columns='factor',values='abs_correlation')
        points=[]
        for r in rows.sort_values('date').itertuples():
          if r.date in cs.index:points.append(dict(date=r.date,nHoldings=int(r.n_holdings),correlations=cs.loc[r.date].tolist(),risk=[r.f1_bps,r.f2_bps,r.other_bps,r.specific_bps],volatility=r.volatility))
        histories.append(dict(variant=variant,loading='EW63',basket=basket,points=points))
    result=dict(schemaVersion=2,title='Statistical replication research',source='CRSP history + audited Yahoo extension',dataThrough=str(data['dates'][-1]),sourceHash=hashlib.sha256((root/'inputs/extended_hybrid_panel.npz').read_bytes()).hexdigest(),universeNote='Research eligibility is anchored to the archived universe; this is not a survivorship-free historical universe.',aiBasket=list(amap),snapshots=snapshots,histories=histories,exportChecks=checks,unmappedTickers=missing)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(clean(result),separators=(',',':'),allow_nan=False))
    print('Exported',args.output,'bytes',args.output.stat().st_size,'unmapped',missing)
if __name__=='__main__':main()
