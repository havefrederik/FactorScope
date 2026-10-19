export const AI_PORTFOLIO_TICKERS = ["AMZN", "CIEN", "ANET", "PWR", "NRG", "OKLO", "CEG", "VRT", "ETN", "GLW", "VST", "GOOG", "META", "UEC", "INOD", "LRCX", "KLAC", "MU", "AMD", "AVGO", "MRVL", "NVDA", "CRDO", "AMAT", "CDNS", "MSFT", "SNPS", "RZLV", "ORCL", "FTNT", "EQIX", "DLR", "SMCI", "WDC", "DELL"];
export const AI_PORTFOLIO_DATE = "2026-07-10";
export const aiPortfolioSeed = AI_PORTFOLIO_TICKERS.map(ticker=>({ticker,name:ticker,sector:"Unclassified",value:1_000_000/35,beta:0,vol:0,risk:0}));
