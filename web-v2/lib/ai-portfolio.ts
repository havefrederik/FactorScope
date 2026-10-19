export const AI_PORTFOLIO_TICKERS = ["AMZN", "CIEN", "ANET", "PWR", "NRG", "OKLO", "CEG", "VRT", "ETN", "GLW", "VST", "GOOG", "META", "UEC", "INOD", "LRCX", "KLAC", "MU", "AMD", "AVGO", "MRVL", "NVDA", "CRDO", "AMAT", "CDNS", "MSFT", "SNPS", "RZLV", "ORCL", "FTNT", "EQIX", "DLR", "SMCI", "WDC", "DELL"];
export const AI_PORTFOLIO_DATE = "2026-07-10";
// Broad sector groups for the study basket's overview.
const aiSectors:Record<string,string>={
  AMZN:"Consumer Discretionary",GOOG:"Communication Services",META:"Communication Services",
  PWR:"Industrials",VRT:"Industrials",ETN:"Industrials",
  NRG:"Utilities",OKLO:"Utilities",CEG:"Utilities",VST:"Utilities",
  UEC:"Energy",EQIX:"Real Estate",DLR:"Real Estate",
};
export const aiPortfolioSeed = AI_PORTFOLIO_TICKERS.map(ticker=>({ticker,name:ticker,sector:aiSectors[ticker]??"Technology",value:1_000_000/35,beta:0,vol:0,risk:0}));
