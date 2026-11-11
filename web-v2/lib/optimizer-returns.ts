export const returnAssumptions = ["Proportional to idiosyncratic volatility", "Proportional to total volatility", "My return forecasts"] as const;
export type ReturnAssumption = typeof returnAssumptions[number];

export function restoreReturnAssumption(value: unknown): ReturnAssumption {
  if (value === "Idiosyncratic volatility proportionate") return returnAssumptions[0];
  if (value === "Manual forecasts") return "My return forecasts";
  if (value === "Equal preferences") throw Error("This saved configuration uses the retired equal-score rule. Choose one of the three return assumptions and save new settings; no settings have been changed.");
  if (!returnAssumptions.includes(value as ReturnAssumption)) throw Error("Choose a supported return assumption.");
  return value as ReturnAssumption;
}

// Relative assumptions have mean absolute magnitude one, with no annual-return units.
// A positive common scale does not identify an expected Sharpe or forecast skill.
export function buildOptimizerReturns({ tickers, current, mode, side, idiosyncraticVolatility, covariance, overrides = {} }: {
  tickers: string[]; current: number[]; mode: ReturnAssumption;
  side: "long" | "short" | "both"; idiosyncraticVolatility: number[];
  covariance?: number[][];
  overrides?: Record<string, string>;
}): number[] {
  if (!returnAssumptions.includes(mode)) throw Error("Choose a supported return assumption.");
  const manual = mode === "My return forecasts", total = mode === "Proportional to total volatility";
  if (current.length !== tickers.length || !tickers.length || current.some(v => !Number.isFinite(v))) throw Error("A complete eligible universe is required.");
  if (!["long", "short", "both"].includes(side)) throw Error("Choose valid position sides.");
  if (total && (!covariance || covariance.length !== tickers.length || covariance.some((row, i) => row.length !== tickers.length || row.some(v => !Number.isFinite(v)) || row[i] < 0))) throw Error("Total volatility requires a complete, finite selected risk model with non-negative variances.");
  const risk = total ? covariance!.map((row, i) => Math.sqrt(row[i])) : idiosyncraticVolatility;
  if (!manual && (risk.length !== tickers.length || risk.some(v => !Number.isFinite(v) || v < 0))) throw Error("Idiosyncratic risk is unavailable. Choose total volatility or My return forecasts.");
  const averageRisk = manual ? 1 : risk.reduce((s, v) => s + v, 0) / tickers.length;
  if (!manual && !(averageRisk > 1e-12)) throw Error("Forecast volatility is too small for this return assumption.");
  return tickers.map((ticker, i) => {
    if (manual) {
      const value = Number(overrides[ticker]?.trim() || 0);
      if (!Number.isFinite(value)) throw Error(`Enter a valid expected excess return for ${ticker}.`);
      return value / 100;
    }
    const direction = side === "short" || (side === "both" && current[i] < -1e-12) ? -1 : 1;
    return direction * risk[i] / averageRisk;
  });
}
export function relativeSignalIndex(signal:number[], current:number[], proposed:number[], currentVol:number, proposedVol:number): number|null {
  const dot=(w:number[])=>w.reduce((s,v,i)=>s+v*signal[i],0);
  const baseline=dot(current);
  return baseline>1e-12&&currentVol>1e-12&&proposedVol>1e-12?100*(dot(proposed)/proposedVol)/(baseline/currentVol):null;
}
