import { publishedMarketNeutralFund as fund } from "../lib/published-fund";

export function PublishedFundContext() {
  return <aside className="published-fund-context">
    <div><span>PUBLISHED FUND</span><strong>{fund.name} · {fund.ticker}</strong><a href={fund.sourceUrl} target="_blank" rel="noreferrer">AQR source ↗</a></div>
    <p>Actual daily fund returns, including reinvested distributions, from Yahoo Finance adjusted NAV. Fund expenses are reflected in the NAV. The $1m amount scales the illustration.</p>
    <details><summary>What the analysis covers</summary><p>This is a return-based analysis of the fund’s changing portfolio, not a reconstruction of its underlying trades. Public periodic holdings do not provide its complete daily stock weights. The fund’s gross exposure, financing and cash income differ from the editable stock demo; we do not subtract additional simulated borrow or execution costs.</p><p>The factor model uses US ETF proxies. For this global fund, the unexplained component can include omitted country, currency and other systematic exposures, as well as manager performance and noise. It should not be read as pure stock-selection alpha. This is an illustrative historical case, not a proposed investment.</p></details>
  </aside>;
}

export function PublishedFundHoldings() {
  return <article className="panel published-fund-holdings"><header><h3>Published holdings snapshot</h3><span>{fund.disclosureDate} · AQR disclosure</span></header><dl><div><dt>Long positions</dt><dd>{fund.longHoldings.toLocaleString()}</dd></div><div><dt>Short positions</dt><dd>{fund.shortHoldings.toLocaleString()}</dd></div><div><dt>Long exposure</dt><dd>+{(fund.longExposure * 100).toFixed(1)}%</dd></div><div><dt>Short exposure</dt><dd>{(fund.shortExposure * 100).toFixed(1)}%</dd></div><div><dt>Gross exposure</dt><dd>{((fund.longExposure - fund.shortExposure) * 100).toFixed(1)}%</dd></div><div><dt>Net exposure</dt><dd>+{((fund.longExposure + fund.shortExposure) * 100).toFixed(1)}%</dd></div></dl><p>Snapshot excludes futures. It is separate from the selected return window and is not used to replay past holdings. Low market beta does not require zero net dollars.</p><a href={fund.factsheetUrl} target="_blank" rel="noreferrer">Read the dated AQR factsheet ↗</a></article>;
}
