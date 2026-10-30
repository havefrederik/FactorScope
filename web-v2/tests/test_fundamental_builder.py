import importlib.util, unittest, math
from datetime import date,timedelta
from pathlib import Path
spec=importlib.util.spec_from_file_location('builder',Path(__file__).parents[1]/'scripts/build-fundamental-model.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def entry(val,end='2025-12-31',filed='2026-02-01',**kwargs):return dict(val=val,end=end,filed=filed,form='10-K',accn='accession',**kwargs)
def facts(**tags):return {'us-gaap':{tag:{'units':{'shares' if 'Shares' in tag else 'USD':entries}} for tag,entries in tags.items()}}
class TestFundamentals(unittest.TestCase):
 def test_filing_availability_and_restatements(self):
  f=facts(Assets=[entry(100),entry(200,filed='2026-05-01')])
  self.assertIsNone(m.fact(f,'Assets','2026-02-01'));self.assertEqual(m.fact(f,'Assets','2026-04-30')['val'],100);self.assertEqual(m.fact(f,'Assets','2026-05-02')['val'],200)
 def test_annual_vs_quarterly_and_stale(self):
  f=facts(NetIncomeLoss=[entry(100,start='2025-01-01'),entry(20,start='2025-10-01')])
  self.assertEqual(m.fact(f,'NetIncomeLoss','2026-03-01',annual=True)['val'],100);self.assertIsNone(m.fact(f,'NetIncomeLoss','2028-03-01',annual=True))
 def test_matching_liability_identity_and_split_consistency(self):
  f=facts(Assets=[entry(100e6)],StockholdersEquity=[entry(50e6)],StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest=[entry(60e6)],CommonStockSharesOutstanding=[entry(1e6)])
  ps=[{'date':(date(2025,6,1)+timedelta(days=i)).isoformat(),'close':50,'adjusted':50,'splits':[{'date':'2026-04-01','ratio':2}]} for i in range(280)]
  raw,_=m.descriptors(f,ps,279);self.assertAlmostEqual(raw[0],math.log(100e6));self.assertAlmostEqual(raw[4],.4)
  f['us-gaap']['StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest']['units']['USD'][0]['end']='2025-09-30'
  self.assertIsNone(m.descriptors(f,ps,279)[0][4]);self.assertIsNone(m.descriptors(f,ps,279,True)[0][0])
 def test_missing_flag_and_reference_only_standardization(self):
  raw=[[float(i)]*7 for i in range(100)]+[[None]*7];fit,missing=m.standardize(raw,[True]*100+[False]);self.assertTrue(missing[-1].all());self.assertAlmostEqual(fit[-1,0],0);self.assertAlmostEqual(fit[:-1,0].mean(),0)
if __name__=='__main__':unittest.main()
