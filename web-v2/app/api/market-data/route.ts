import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();
const cache = new Map<string, { expires: number; value: SymbolSeries }>();
const FACTOR_SYMBOLS = [
  "SPY", "IWM", "IWD", "IWF", "MTUM", "QUAL", "USMV", "VYM",
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

function normalizeYahooSymbol(symbol: string) {
  return symbol.toUpperCase().trim().replace("BRK.B", "BRK-B").replace("BF.B", "BF-B");
}

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
    const raw = Array.isArray(body.tickers) ? body.tickers : [];
    const holdings = raw
      .map((ticker) => String(ticker).toUpperCase().trim())
      .filter((ticker) => ticker && ticker !== "CASH");
    const invalid = holdings.filter((ticker) => !/^[A-Z0-9.^=-]{1,15}$/.test(normalizeYahooSymbol(ticker)));
    if (invalid.length) return Response.json({ error: `Invalid ticker format: ${invalid.join(", ")}` }, { status: 400 });

    const unique = [...new Set([...holdings, ...FACTOR_SYMBOLS])];
    if (!holdings.length) return Response.json({ error: "Add at least one non-cash position." }, { status: 400 });
    if (holdings.length > 30) return Response.json({ error: "The prototype currently supports up to 30 positions." }, { status: 400 });

    const years = Math.max(7, Math.min(10, Number(body.years) || 3));
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
