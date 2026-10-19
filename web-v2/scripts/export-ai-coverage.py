"""Add display-only, dated AI membership to a private model manifest.
No prices, returns, exposures or covariance matrices are added to public output.
"""
import argparse,json
from pathlib import Path

def add_coverage(manifest, directory):
    history=next(h for h in manifest['histories'] if h['variant']=='ONE_YEAR_EQUAL' and h['basket']=='AVAILABLE_NOT_AI35')
    coverage=[]
    for point in history['points']:
        dated=json.loads((directory/f"{point['date']}.json").read_text())
        if dated['sourceHash']!=manifest['sourceHash']:raise ValueError('Mixed model revisions')
        snapshot=next(s for s in dated['snapshots'] if s['variant']=='ONE_YEAR_EQUAL')
        available={s['ticker'] for s in snapshot['stocks']}
        names=[t for t in manifest['aiBasket'] if t in available]
        if len(names)!=point['nHoldings']:raise ValueError('Coverage disagrees with statistical chart')
        coverage.append(dict(date=point['date'],tickers=names))
    manifest['aiCoverage']=coverage
    return manifest

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--models',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    if a.output.resolve().is_relative_to(Path(__file__).resolve().parents[1]):raise ValueError('Keep model output outside the website checkout')
    b=add_coverage(json.loads((a.models/'model.json').read_text()),a.models)
    a.output.write_text(json.dumps(b,separators=(',',':'),allow_nan=False))
    print(len(b['aiCoverage']),'coverage dates;',min(len(p['tickers']) for p in b['aiCoverage']),'to',max(len(p['tickers']) for p in b['aiCoverage']),'stocks; through',b['dataThrough'])
