export const returnAssumptions = ["Idiosyncratic volatility proportionate", "Equal expected returns", "Manual forecasts"] as const;
export type ReturnAssumption = typeof returnAssumptions[number];

// Presets encode an explicit preference, not an estimated alpha forecast.
// The shared level is the arithmetic mean absolute annual excess return,
// before optional overrides. Risk-proportionate returns use residual volatility.
export function buildOptimizerReturns({ tickers, current, mode, level, side, idiosyncraticVolatility, overrides = {} }: {
  tickers: string[]; current: number[]; mode: ReturnAssumption; level: number;
  side: "long" | "short" | "both"; idiosyncraticVolatility: number[];
  overrides?: Record<string, string>;
}): number[] {
  if (!returnAssumptions.includes(mode)) throw Error("Choose a supported return assumption.");
  const manual = mode === "Manual forecasts";
  if (!manual && (!Number.isFinite(level) || level <= 0)) throw Error("Set a positive average absolute excess return in Return assumption.");
  const riskBased = mode === "Idiosyncratic volatility proportionate";
  if (riskBased && (idiosyncraticVolatility.length !== tickers.length || idiosyncraticVolatility.some(v => !Number.isFinite(v) || v < 0))) {
    throw Error("Idiosyncratic risk is unavailable for this universe. Choose Equal expected returns or Manual forecasts.");
  }
  const averageRisk = riskBased ? idiosyncraticVolatility.reduce((s, v) => s + v, 0) / tickers.length : 1;
  if (riskBased && !(averageRisk > 1e-12)) throw Error("Idiosyncratic risk is too small for this preset. Choose another return assumption.");
  return tickers.map((ticker, i) => {
    const override = overrides[ticker]?.trim();
    if (override) {
      const value = Number(override);
      if (!Number.isFinite(value)) throw Error(`Enter a valid expected excess return for ${ticker}.`);
      return value / 100;
    }
    if (manual) return 0;
    const direction = side === "short" || (side === "both" && current[i] < -1e-12) ? -1 : 1;
    return direction * level / 100 * (riskBased ? idiosyncraticVolatility[i] / averageRisk : 1);
  });
}
