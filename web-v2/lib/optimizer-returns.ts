export const returnAssumptions = ["Idiosyncratic volatility proportionate", "Equal preferences", "Manual forecasts"] as const;
export type ReturnAssumption = typeof returnAssumptions[number];

// Relative presets have mean absolute magnitude one, with no annual-return units.
// A positive common scale does not identify an expected Sharpe or forecast skill.
export function buildOptimizerReturns({ tickers, current, mode, side, idiosyncraticVolatility, overrides = {} }: {
  tickers: string[]; current: number[]; mode: ReturnAssumption;
  side: "long" | "short" | "both"; idiosyncraticVolatility: number[];
  overrides?: Record<string, string>;
}): number[] {
  if (!returnAssumptions.includes(mode)) throw Error("Choose a supported return assumption.");
  const manual = mode === "Manual forecasts", riskBased = mode === "Idiosyncratic volatility proportionate";
  if (current.length !== tickers.length || !tickers.length) throw Error("A complete eligible universe is required.");
  if (riskBased && (idiosyncraticVolatility.length !== tickers.length || idiosyncraticVolatility.some(v => !Number.isFinite(v) || v < 0))) throw Error("Idiosyncratic risk is unavailable. Choose Equal preferences or Manual forecasts.");
  const averageRisk = riskBased ? idiosyncraticVolatility.reduce((s, v) => s + v, 0) / tickers.length : 1;
  if (riskBased && !(averageRisk > 1e-12)) throw Error("Idiosyncratic risk is too small for this preset.");
  return tickers.map((ticker, i) => {
    if (manual) {
      const value = Number(overrides[ticker]?.trim() || 0);
      if (!Number.isFinite(value)) throw Error(`Enter a valid expected excess return for ${ticker}.`);
      return value / 100;
    }
    const direction = side === "short" || (side === "both" && current[i] < -1e-12) ? -1 : 1;
    return direction * (riskBased ? idiosyncraticVolatility[i] / averageRisk : 1);
  });
}
export function relativeSignalIndex(signal:number[], current:number[], proposed:number[], currentVol:number, proposedVol:number): number|null {
  const dot=(w:number[])=>w.reduce((s,v,i)=>s+v*signal[i],0);
  const baseline=dot(current);
  return baseline>1e-12&&currentVol>1e-12&&proposedVol>1e-12?100*(dot(proposed)/proposedVol)/(baseline/currentVol):null;
}
