export const MAX_MARKET_TICKERS = 60;

export function normalizeYahooSymbol(symbol: string) {
  return symbol.toUpperCase().trim().replace("BRK.B", "BRK-B").replace("BF.B", "BF-B");
}

export function validateMarketTickers(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : [];
  const tickers = [...new Set(raw.map(ticker => String(ticker).toUpperCase().trim()).filter(ticker => ticker && ticker !== "CASH"))];
  const invalid = tickers.filter(ticker => !/^[A-Z0-9.^=-]{1,15}$/.test(normalizeYahooSymbol(ticker)));
  if (invalid.length) throw new Error(`Invalid ticker format: ${invalid.join(", ")}`);
  if (!tickers.length) throw new Error("Add at least one non-cash position.");
  if (tickers.length > MAX_MARKET_TICKERS) throw new Error(`Request up to ${MAX_MARKET_TICKERS} unique stock tickers. Received ${tickers.length}.`);
  return tickers;
}
