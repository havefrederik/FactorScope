import YahooFinance from "yahoo-finance2";
import { normalizeYahooSymbol, validateMarketTickers } from "../../../lib/market-data-request.ts";

const yahooFinance = new YahooFinance();
const cache = new Map<string, { expires: number; value: SymbolSeries }>();
const FACTOR_SYMBOLS = [
  "SPY", "IWM", "IWD", "IWF", "MTUM", "QUAL", "USMV", "VYM", "IJH", "COWZ",
  "XLK", "XLF", "XLE", "XLV", "XLC", "XLY", "XLP", "XLI", "XLB", "XLRE", "XLU",
];

type PricePoint = { date: string; close: number };
type SymbolSeries = {
  requested: string;
  symbol: string;
  currency: string;
  exchange: string;
  instrumentType: string;
  points: PricePoint[];
};

async function loadSymbol(requested: string, period1: Date, period2: Date): Promise<SymbolSeries> {
  const symbol = normalizeYahooSymbol(requested);
  const cacheKey = `${symbol}:${period1.toISOString().slice(0, 10)}:${period2.toISOString().slice(0, 10)}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return { ...cached.value, requested };

  const result = await yahooFinance.chart(symbol, {
    period1,
    period2,
    interval: "1d",
    events: "div|split",
  });

  if (result.meta.instrumentType === "MUTUALFUND" && result.quotes.some(quote => Number.isFinite(quote.close) && !Number.isFinite(quote.adjclose))) {
    throw new Error("Distribution-adjusted fund history is unavailable; unadjusted NAV would misstate total returns.");
  }

  if (requested === "BIL" && result.quotes.some(q => Number.isFinite(q.close) && !Number.isFinite(q.adjclose))) throw new Error("Adjusted cash benchmark history is unavailable.");

  const points = result.quotes
    .map((quote) => ({
      date: quote.date.toISOString().slice(0, 10),
      close: quote.adjclose ?? quote.close,
    }))
    .filter((point): point is PricePoint => Number.isFinite(point.close));

  if (points.length < 2) throw new Error("Insufficient daily price history");
  const value: SymbolSeries = {
    requested,
    symbol,
    currency: result.meta.currency,
    exchange: result.meta.fullExchangeName ?? result.meta.exchangeName,
    instrumentType: result.meta.instrumentType,
    points,
  };
  cache.set(cacheKey, { expires: Date.now() + 30 * 60 * 1000, value });
  return value;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { tickers?: string[]; years?: number };
    let holdings: string[];
    try { holdings = validateMarketTickers(body.tickers); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid data request." }, { status: 400 }); }

    const unique = [...new Set([...holdings, ...FACTOR_SYMBOLS, "BIL"])];

    const years = Math.max(3, Math.min(10, Number(body.years) || 3));
    const period2 = new Date();
    period2.setUTCDate(period2.getUTCDate() + 1);
    const period1 = new Date(period2);
    period1.setUTCFullYear(period1.getUTCFullYear() - years);

    const settled = await Promise.allSettled(unique.map((ticker) => loadSymbol(ticker, period1, period2)));
    const series: Record<string, SymbolSeries> = {};
    const errors: { ticker: string; message: string }[] = [];
    settled.forEach((result, index) => {
      const ticker = unique[index];
      if (result.status === "fulfilled") series[ticker] = result.value;
      else errors.push({ ticker, message: result.reason instanceof Error ? result.reason.message : "Price history unavailable" });
    });

    const missingHoldings = holdings.filter((ticker) => !series[ticker]);
    if (missingHoldings.length === holdings.length) {
      return Response.json({ error: "Yahoo Finance did not return data for the portfolio.", errors }, { status: 502 });
    }

    const allDates = Object.values(series).flatMap((item) => item.points.map((point) => point.date));
    const asOf = allDates.sort().at(-1) ?? null;
    const factorStartDate = FACTOR_SYMBOLS.every((symbol) => series[symbol]?.points.length)
      ? FACTOR_SYMBOLS.map((symbol) => series[symbol].points[0].date).sort().at(-1) ?? null
      : null;
    return Response.json({
      source: "Yahoo Finance via yahoo-finance2",
      frequency: "Daily",
      adjusted: true,
      asOf,
      factorStartDate,
      series,
      errors,
      missingHoldings,
    }, { headers: { "Cache-Control": "public, max-age=900, s-maxage=1800" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load market data." }, { status: 500 });
  }
}
