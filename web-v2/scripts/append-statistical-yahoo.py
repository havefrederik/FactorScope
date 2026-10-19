"""Append audited adjusted-price returns without rewriting the archived research panel."""
import argparse,json,hashlib
from pathlib import Path
from urllib.parse import quote
import numpy as np
import pandas as pd

def audit_returns(old,new):
    good=np.isfinite(old)&np.isfinite(new)
    n=int(good.sum())
    if n<20:return False,dict(overlap=n,reason='insufficient overlap')
    error=np.abs(old[good]-new[good])*10000
    corr=float(np.corrcoef(old[good],new[good])[0,1]) if np.std(old[good])>1e-12 and np.std(new[good])>1e-12 else 0
    metrics=dict(overlap=n,medianErrorBps=float(np.median(error)),maxErrorBps=float(error.max()),correlation=corr)
    return bool(np.median(error)<=1 and error.max()<=20 and corr>=.999),metrics

def main():
    p=argparse.ArgumentParser();p.add_argument('--research-dir',type=Path,required=True);p.add_argument('--prices',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    repo=Path(__file__).resolve().parents[1]
    if a.output.resolve().is_relative_to(repo):raise ValueError('Private output must be outside the website repository')
    archive=a.research_dir/'inputs/extended_hybrid_panel.npz';z=dict(np.load(archive,allow_pickle=False)); olddays=z['dates'].astype('datetime64[D]');ledger=pd.read_csv(a.research_dir/'inputs/admission_ledger.csv');assert np.array_equal(ledger.permno,z['permnos'])
    spy=json.loads((a.prices/'SPY.json').read_text()); days=np.array([p['date'] for p in spy['points'] if p['adjusted'] is not None],dtype='datetime64[D]');future=days[days>olddays[-1]]
    if not len(future):raise ValueError('No new completed Yahoo sessions available')
    extension=np.full((len(future),len(z['permnos'])),np.nan);report=[]
    for j,row in enumerate(ledger.itertuples()):
        symbol=row.chosen_symbol
        if not isinstance(symbol,str):continue
        file=a.prices/(quote(symbol,safe="~()*!.'-")+'.json')
        if not file.exists():continue
        item=json.loads(file.read_text());meta=item['meta'];pts=item['points'];lookup={p['date']:p['adjusted'] for p in pts}
        # Always form returns from adjacent market sessions. Never bridge a missing quote.
        prices=np.array([lookup.get(str(d)) or np.nan for d in days]);ret=np.full(len(days),np.nan);ret[1:]=prices[1:]/prices[:-1]-1
        shared,oi,ni=np.intersect1d(olddays,days,return_indices=True);ok,metrics=audit_returns(z['returns'][oi,j],ret[ni])
        identity=meta.get('currency')=='USD' and meta.get('instrumentType')=='EQUITY' and meta.get('symbol','').replace('.','-')==symbol.replace('.','-')
        post=ret[np.isin(days,future)];complete=bool(np.isfinite(post).all());extreme=bool(np.any(np.abs(post[np.isfinite(post)])>1))
        admitted=ok and identity
        # Do not use a later missing quote or extreme return to exclude earlier dates.
        # Each dated estimation window applies its own finite-history eligibility screen.
        if admitted:extension[:,j]=np.where(np.abs(post)<=1,post,np.nan)
        report.append(dict(permno=int(row.permno),symbol=symbol,admitted=admitted,identityMetadataMatches=identity,complete=complete,extreme=extreme,**metrics))
    z['dates']=np.concatenate([olddays,future]);z['returns']=np.vstack([z['returns'],extension])
    a.output.parent.mkdir(parents=True,exist_ok=True);np.savez_compressed(a.output,**z)
    assert np.array_equal(z['returns'][:len(olddays)],np.load(archive)['returns'],equal_nan=True)
    summary=dict(archivedThrough=str(olddays[-1]),dataThrough=str(future[-1]),newSessions=len(future),admitted=sum(r['admitted'] for r in report),reviewRequired=sum(not r['admitted'] for r in report),sourceHash=hashlib.sha256(archive.read_bytes()).hexdigest(),rules='USD equity identity metadata; >=20 overlapping sessions; median <=1bp, max <=20bp, correlation >=0.999; date-specific missing/extreme return checks; unreviewed absolute daily moves >100% are missing; no filling or price-level splice',stocks=report)
    a.output.with_suffix('.audit.json').write_text(json.dumps(summary,indent=2,allow_nan=False));print(json.dumps({k:v for k,v in summary.items() if k!='stocks'}))
if __name__=='__main__':main()
