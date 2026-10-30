"""Dated US characteristic risk model. Public inputs and output stay outside source.

Requires numpy. Current-universe forecast, NOT a survivorship-free backtest.
SEC facts are selected by filing availability, never period-end alone.
"""
import json, sys, math
from pathlib import Path
from datetime import date, timedelta
import numpy as np

STYLES = ['Size', 'Book-to-market', 'Profitability', 'Asset growth', 'Leverage', 'Momentum', 'Volatility']

def age(a, b): return (date.fromisoformat(a)-date.fromisoformat(b)).days

def fact(facts, tag, asof, unit='USD', end=None, annual=False, stale=550, namespace='us-gaap'):
    entries=facts.get(namespace,{}).get(tag,{}).get('units',{}).get(unit,[])
    eligible=[v for v in entries if v.get('filed','9999')<asof and v.get('end','9999')<=asof
              and (end is None or v['end']==end) and age(asof,v['end'])<=stale
              and v.get('form') in ('10-K','10-Q','10-K/A','10-Q/A','20-F','20-F/A','40-F','40-F/A')
              and isinstance(v.get('val'),(int,float)) and math.isfinite(v['val'])
              and (not annual or ('start' in v and 300<=age(v['end'],v['start'])<=400))]
    return max(eligible,key=lambda v:(v['end'],v['filed'],v.get('accn',''))) if eligible else None

def descriptors(facts, prices, i, multiclass=False):
    d=prices[i]['date']; a=fact(facts,'Assets',d); eq=fact(facts,'StockholdersEquity',d)
    ni=fact(facts,'NetIncomeLoss',d,annual=True) or fact(facts,'ProfitLoss',d,annual=True)
    aa=fact(facts,'Assets',d,end=ni['end']) if ni else None
    li=fact(facts,'Liabilities',d,end=a['end']) if a else None
    if a and li is None:
        total_equity=fact(facts,'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',d,end=a['end'])
        if total_equity and a['val']>=total_equity['val']:
            li={**total_equity,'val':a['val']-total_equity['val']}
    sh=fact(facts,'EntityCommonStockSharesOutstanding',d,unit='shares',stale=200,namespace='dei') or fact(facts,'CommonStockSharesOutstanding',d,unit='shares',stale=200)
    splits=prices[i].get('splits',[])
    cap=None
    # Skip ambiguous class totals and statements that may already restate a split.
    if sh and sh['val']>0 and not multiclass and not any(sh['end']<s['date']<=sh['filed'] for s in splits):
        share_adjust=math.prod(s['ratio'] for s in splits if sh['end']<s['date']<=d)
        raw_price=prices[i]['close']*math.prod(s['ratio'] for s in splits if s['date']>d)
        cap=raw_price*sh['val']*share_adjust
        if not 1e6<cap<1e14: cap=None
    prior=None
    if a:
        candidates=facts.get('us-gaap',{}).get('Assets',{}).get('units',{}).get('USD',[])
        ends=sorted({v['end'] for v in candidates if 320<=age(a['end'],v['end'])<=410})
        for e in sorted(ends,key=lambda e:abs(age(a['end'],e)-365)):
            prior=fact(facts,'Assets',d,end=e,stale=950)
            if prior: break
    adj=np.array([p['adjusted'] for p in prices])
    momentum=float(adj[i-21]/adj[i-252]-1) if i>=252 else None
    vol=float(np.std(adj[i-62:i+1]/adj[i-63:i]-1,ddof=1)) if i>=63 else None
    vals=[math.log(cap) if cap else None, eq['val']/cap if eq and cap else None,
          ni['val']/aa['val'] if ni and aa and aa['val']>0 else None,
          a['val']/prior['val']-1 if a and prior and prior['val']>0 else None,
          li['val']/a['val'] if li and a and a['val']>0 else None,
          momentum, math.log(vol) if vol and vol>0 else None]
    used=[v for v in [a,eq,ni,aa,li,sh,prior] if v]
    return vals, [{'end':v['end'],'filed':v['filed'],'accession':v.get('accn','')} for v in used]

def standardize(raw, estimation):
    raw=np.asarray(raw,dtype=float); filled=raw.copy(); missing=~np.isfinite(raw)
    for k in range(raw.shape[1]):
        x=raw[estimation,k]; x=x[np.isfinite(x)]
        if len(x)<max(50,int(sum(estimation)*.65)): raise ValueError(f'Insufficient characteristic coverage: {STYLES[k]}')
        lo,hi=np.quantile(x,[.01,.99]); median=np.median(x)
        filled[:,k]=np.clip(np.where(missing[:,k],median,raw[:,k]),lo,hi)
        mu=filled[estimation,k].mean(); sd=filled[estimation,k].std()
        if sd<1e-12: raise ValueError('Degenerate characteristic')
        filled[:,k]=(filled[:,k]-mu)/sd
    return filled, missing

def build(directory, output):
    root=Path(directory).resolve(); repo=Path(__file__).resolve().parents[1]
    if repo in root.parents or repo in Path(output).resolve().parents: raise ValueError('Keep inputs/model outside the public source repository.')
    u=json.loads((root/'universe.json').read_text())
    def price(t):return json.loads((root/'prices'/f'{t.replace(".","-")}.json').read_text())
    calendar=[p['date'] for p in price('SPY')['points'] if p.get('adjusted') and p['adjusted']>0]
    calendar=calendar[-505:]; asof=calendar[-1]
    if len(calendar)<505 or asof<u['asOf']:raise ValueError('Need 505 sessions and a formation date no earlier than the current universe snapshot.')
    rows=[]; excluded=[]; facts=[]; panels=[]; sectors=[]; multi=[]
    for r in u['records']:
        try:
            p=price(r['ticker']); bydate={v['date']:v for v in p['points'] if v.get('adjusted') and v['adjusted']>0 and v.get('close') and v['close']>0}
            if p['currency']!='USD' or p['instrumentType']!='EQUITY' or any(d not in bydate for d in calendar):raise ValueError('Incomplete 505-session adjusted USD equity history')
            f=json.loads((root/'companyfacts'/f'{r["cik"]}.json').read_text())['facts']
            sub=json.loads((root/'submissions'/f'{r["cik"]}.json').read_text())
            sector=sub.get('sicDivision')
            if not sector or sector=='Unknown':raise ValueError('Missing SIC classification')
            # A broad reference universe, with one listed class per issuer in the fit.
            rows.append(r);facts.append(f);sectors.append(sector)
            multi.append(len(sub.get('tickers',[]))>1 or r.get('duplicateIssuerInUniverse',False))
            panels.append([{**bydate[d],'splits':p.get('splits',[])} for d in calendar])
        except Exception as e:excluded.append({'ticker':r['ticker'],'reason':str(e)})
    n=len(rows); seen=set(); estimation=[]
    for r in rows:
        include=r['estimationMember'] and r['cik'] not in seen;estimation.append(include)
        if include:seen.add(r['cik'])
    estimation=np.array(estimation); groups=sorted(set(sectors)); k=1+len(groups)-1+len(STYLES)
    if estimation.sum()<200:raise ValueError('Fewer than 200 eligible reference issuers.')
    industry=np.array([[1]+[1 if s==g else -1 if s==groups[-1] else 0 for g in groups[:-1]] for s in sectors],float)
    factor_names=['Fundamental market']+[f'SIC: {g} (contrast)' for g in groups[:-1]]+[f'Fundamental: {s}' for s in STYLES]
    returns=np.array([[p['adjusted'] for p in ps] for ps in panels]); daily=returns[:,1:]/returns[:,:-1]-1
    cashmap={p['date']:p['adjusted'] for p in price('BIL')['points']}
    if any(d not in cashmap for d in calendar):raise ValueError('Missing cash benchmark')
    cash=np.array([cashmap[calendar[i+1]]/cashmap[calendar[i]]-1 for i in range(len(calendar)-1)])
    ff=[];ee=[]; missing_history=[]; final_raw=[]; final_missing=[]; final_provenance=[]
    # Lag every descriptor and volatility weight relative to the modeled return.
    for i in range(252,505):
        raw=[]; provenance=[]
        for j in range(n):
            v,p=descriptors(facts[j],panels[j],i,multi[j]);raw.append(v);provenance.append(p)
        styles,missing=standardize(raw,estimation); B=np.column_stack([industry,styles])
        if i==504:
            latest=B;final_raw=raw;final_missing=missing;final_provenance=provenance;break
        trailing=np.std(daily[:,i-63:i],axis=1,ddof=1); lo,hi=np.quantile(trailing[estimation],[.05,.95])
        sqrtw=1/np.clip(trailing,lo,hi); X=B[estimation]*sqrtw[estimation,None]
        y=(daily[:,i]-cash[i]); f,_,rank,_=np.linalg.lstsq(X,y[estimation]*sqrtw[estimation],rcond=1e-10)
        if rank<k:raise ValueError('Fundamental exposure design is rank deficient')
        ff.append(f);ee.append(y-B@f);missing_history.append(missing.mean(axis=0).tolist())
    F=np.array(ff);E=np.array(ee);E-=E.mean(axis=0);T=len(E)
    sigma=np.maximum(E.std(axis=0),1e-5)
    # Weighted PCA is estimated on reference issuers, then extended to all covered securities.
    Z=E[:,estimation]/sigma[estimation]; U,s,_=np.linalg.svd(Z,full_matrices=False)
    count=min(20,int(np.sum(s>1e-8))); S=U[:,:count]*s[:count]; lam=np.mean(S*S,axis=0)
    A=(E.T@S/T)/lam
    for j in range(count):
        anchor=np.argmax(np.abs(A[:,j]))
        if A[anchor,j]<0:A[:,j]*=-1;S[:,j]*=-1
    C=E.T@E/T; G=A.T@A; EA=E@A
    # These sufficient statistics permit exact LW residual shrinkage for ANY selected PC subset.
    norms=np.sum(E*E,axis=1)
    stock_info=[]
    for j,r in enumerate(rows):
        stock_info.append({'ticker':r['ticker'],'name':r['name'],'cik':r['cik'],'sector':sectors[j],
            'imputed':[STYLES[q] for q,v in enumerate(final_missing[j]) if v],
            'rawCharacteristics':dict(zip(STYLES,final_raw[j])),'filings':final_provenance[j]})
    # Strict JSON: imputed inputs are null, never NaN.
    result={'version':1,'kind':'sec-characteristic','asOf':asof,'universeDate':u['asOf'],'observations':T,
        'referenceCount':int(estimation.sum()),'tickers':[r['ticker'] for r in rows], 'stocks':stock_info,
        'factorNames':factor_names,'industryCount':len(groups)-1,'industryReference':groups[-1],
        'exposures':latest.tolist(),'factorReturns':F.T.tolist(),'statLoadings':A.tolist(),'statReturns':S.T.tolist(),
        'statVariances':lam.tolist(),'residualCovariance':C.tolist(),'gram':G.tolist(),'residualProjection':EA.T.tolist(),
        'squaredNorms':norms.tolist(),'covarianceNormSquared':float(np.sum(C*C)),
        'loadingCovarianceQuadratic':np.diag(A.T@C@A).tolist(),'residualTrace':float(np.trace(C)),
        'excluded':excluded,'meanImputationRates':np.mean(missing_history,axis=0).tolist(),
        'sources':['SEC CompanyFacts, filing-date filtered','SEC current SIC classifications','Yahoo adjusted prices and split events','SSGA SPY current reference universe'],
        'limitations':['Current reference universe and classifications: not a survivorship-free historical backtest.',
          'Missing characteristics use the contemporaneous reference median and are flagged per security.',
          'Fundamental/statistical factor covariance retains cross terms; independence from remaining specific returns is a forecasting assumption.',
          'No expected-return forecasts are inferred from characteristic exposures.']}
    Path(output).write_text(json.dumps(result,separators=(',',':'),allow_nan=False))
    print(json.dumps({'asOf':asof,'stocks':n,'referenceIssuers':int(estimation.sum()),'factors':k,'pcs':count,'observations':T,'excluded':excluded,'meanImputation':dict(zip(STYLES,result['meanImputationRates']))},indent=2))

if __name__=='__main__':build(*sys.argv[1:])
