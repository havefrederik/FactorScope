import { csvRows, parseHoldingsCsv } from "./holdings-input.ts";
import { normalizeYahooSymbol } from "./market-data-request.ts";
import type { MarketPayload, SymbolSeries } from "./analytics.ts";

export type CsvKind = "holdings" | "forecasts" | "prices";
export const forecastTemplate = `ticker,as_of,horizon_sessions,annual_excess_return_pct
AAPL,2026-09-01,21,8
MSFT,2026-09-01,21,6
AAPL,2026-09-15,21,-2
MSFT,2026-09-29,5,4
`;
export const pricesTemplate = `ticker,date,adjusted_close
AAPL,2026-09-01,100
AAPL,2026-09-02,101
`;

export type ForecastRow = { date: string; annualPct: number };
export type ForecastBook = { byHorizon: Map<number, Map<string, ForecastRow[]>>; count: number; name: string; id: string };
export type UploadedPrices = { series: Record<string, SymbolSeries>; name: string };

function table(text: string, required: string[]) {
  const rows = csvRows(text.replace(/^\uFEFF/, ""));
  const headers = (rows.shift() ?? []).map(cell => cell.trim().toLowerCase());
  if (new Set(headers).size !== headers.length) throw Error("Each column header must be unique.");
  for (const key of required) if (!headers.includes(key)) throw Error(`Missing column ${key}.`);
  if (!rows.length) throw Error("The CSV contains no data rows.");
  return rows.map((row, i) => {
    if (row.length !== headers.length) throw Error(`Row ${i + 2} has the wrong number of columns.`);
    return Object.fromEntries(headers.map((key, j) => [key, row[j].trim()]));
  });
}

// In a combined file, an allocation is a single snapshot. Later forecast
// revisions occupy their own rows with a blank market value.
export function parseHoldingsBundle(text:string, name:string, id:string) {
  const rows = csvRows(text.replace(/^\uFEFF/,""));
  const headers = (rows[0]??[]).map(v=>v.trim().toLowerCase());
  const pct = ["annual_excess_return_pct","horizon_excess_return_pct"].map(h=>headers.indexOf(h)).filter(i=>i>=0);
  if (!pct.length) return { holdings:parseHoldingsCsv(text), book:null };
  const ticker = headers.indexOf("ticker"), value = headers.indexOf("market_value");
  if (ticker<0 || value<0 || !headers.includes("as_of")) throw Error("A combined CSV needs ticker, market_value and as_of.");
  const positions:string[][]=[], forecasts:string[][]=[], seen=new Set<string>();
  for (const [i,row] of rows.slice(1).entries()) {
    if (row.length!==headers.length) throw Error(`Row ${i+2} has the wrong number of columns.`);
    const hasValue = Boolean(row[value].trim()), hasForecast = pct.some(j=>row[j].trim());
    if (!hasValue && !hasForecast) throw Error(`Row ${i+2} needs a position value or a forecast.`);
    if (hasValue) {
      const key=normalizeYahooSymbol(row[ticker]);
      if (seen.has(key)) throw Error(`Enter market_value only once for ${key}. Leave it blank on forecast revisions.`);
      seen.add(key); positions.push(row);
    }
    if (hasForecast) forecasts.push(row);
  }
  const encode=(data:string[][])=>[headers,...data].map(row=>row.map(v=>'"'+v.replaceAll('"','""')+'"').join(",")).join("\n");
  return {holdings:parseHoldingsCsv(encode(positions)),book:parseForecastBook(encode(forecasts),name,id)};
}

function symbol(value: string, line: number) {
  const ticker = normalizeYahooSymbol(value);
  if (!/^[A-Z0-9^][A-Z0-9.^=-]{0,14}$/.test(ticker) || ticker === "CASH") throw Error(`Invalid security ticker on row ${line}.`);
  return ticker;
}

function dateCell(value: string, line: number) {
  const stamp = Date.parse(value + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== value) {
    throw Error(`Use a valid YYYY-MM-DD date on row ${line}.`);
  }
  return value;
}

function numeric(value: string, line: number) {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(Number(value))) throw Error(`Invalid number on row ${line}. Use a decimal point.`);
  return Number(value);
}

export function parseForecastBook(text: string, name: string, id: string): ForecastBook {
  const rows = table(text, ["ticker", "as_of"]);
  const byHorizon: ForecastBook["byHorizon"] = new Map();
  rows.forEach((row, i) => {
    const line = i + 2, ticker = symbol(row.ticker, line), date = dateCell(row.as_of, line);
    const annual = row.annual_excess_return_pct, period = row.horizon_excess_return_pct;
    if (Boolean(annual) === Boolean(period)) throw Error(`Enter exactly one of annual_excess_return_pct or horizon_excess_return_pct on row ${line}.`);
    if (period && !row.horizon_sessions) throw Error(`Include horizon_sessions for the period return on row ${line}.`);
    const horizon = row.horizon_sessions ? numeric(row.horizon_sessions, line) : 252;
    if (!Number.isSafeInteger(horizon) || horizon < 1) throw Error(`Use a positive whole number of sessions on row ${line}.`);
    const annualPct = annual ? numeric(annual, line) : numeric(period, line) * (252 / horizon);
    if (!Number.isFinite(annualPct)) throw Error(`The annualized forecast on row ${line} is outside the supported range.`);
    if (!byHorizon.has(horizon)) byHorizon.set(horizon, new Map());
    const group = byHorizon.get(horizon)!;
    if (!group.has(ticker)) group.set(ticker, []);
    group.get(ticker)!.push({ date, annualPct });
  });
  for (const [horizon, group] of byHorizon) for (const [ticker, records] of group) {
    records.sort((a,b) => a.date.localeCompare(b.date));
    if (records.some((r,i) => i > 0 && r.date === records[i-1].date)) throw Error(`Duplicate ${ticker} forecast for the same date and ${horizon}-session horizon.`);
  }
  return { byHorizon, count: rows.length, name, id };
}

// Number of entries available through the close, inclusive.
function through<T>(rows: readonly T[], date: string, key: (row: T) => string) {
  let low = 0, high = rows.length;
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    if (key(rows[mid]) <= date) low = mid + 1;
    else high = mid;
  }
  return low;
}

export function forecastsAt(book: ForecastBook | null, horizon: number, tickers: string[], decision: string, sessions: readonly string[]) {
  const values: Record<string, string> = {}, dates: Record<string,string> = {};
  const group = book?.byHorizon.get(horizon);
  const decisionIndex = through(sessions, decision, d => d);
  if (!group || !decisionIndex) return { values, dates };
  for (const ticker of tickers) {
    const records = group.get(normalizeYahooSymbol(ticker));
    if (!records) continue;
    const latest = records[through(records, decision, r => r.date) - 1];
    if (!latest || latest.date < sessions[0] || decisionIndex - through(sessions, latest.date, d => d) >= horizon) continue;
    values[ticker] = String(latest.annualPct);
    dates[ticker] = latest.date;
  }
  return { values, dates };
}

export function parsePrices(text: string, name: string): UploadedPrices {
  const series: Record<string,SymbolSeries> = {};
  table(text, ["ticker","date","adjusted_close"]).forEach((row,i) => {
    const ticker = symbol(row.ticker, i + 2), date = dateCell(row.date, i + 2), close = numeric(row.adjusted_close, i + 2);
    if (close <= 0) throw Error(`Adjusted close must be positive on row ${i+2}.`);
    series[ticker] ??= { requested:ticker, symbol:ticker, currency:"USD", exchange:"Uploaded", instrumentType:"", points:[] };
    series[ticker].points.push({ date, close });
  });
  for (const [ticker,s] of Object.entries(series)) {
    s.points.sort((a,b) => a.date.localeCompare(b.date));
    if (s.points.length < 2) throw Error(`Include at least two closing prices for ${ticker}.`);
    if (s.points.some((p,i) => i > 0 && p.date === s.points[i-1].date)) throw Error(`Duplicate price date for ${ticker}.`);
  }
  return { series, name };
}

export function withUploadedPrices(payload: MarketPayload, prices: UploadedPrices | null, requested: string[]): MarketPayload {
  if (!prices) return payload;
  const series = { ...payload.series };
  for (const ticker of requested) {
    const uploaded = prices.series[normalizeYahooSymbol(ticker)];
    if (uploaded) series[ticker] = { ...uploaded, requested:ticker };
  }
  return { ...payload, series, missingHoldings: payload.missingHoldings.filter(t => !series[t]), errors: payload.errors.filter(e => !series[e.ticker]) };
}
