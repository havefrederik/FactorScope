import type { OptimizerInput } from './portfolio-optimizer';
import type { ReturnAssumption } from './optimizer-returns';

export const objectiveChoices = ['Minimum volatility', 'Maximum return / risk', 'Minimum tracking error'] as const;
export type ObjectiveChoice = typeof objectiveChoices[number];

// Keep the saved solver objective stable; describe the actual selected numerator.
export function objectiveChoice(objective: OptimizerInput['objective'], assumption?: string): string {
  if (objective !== 'Maximum Sharpe') return objective;
  if (assumption === 'Proportional to total volatility') return 'Maximum diversification';
  if (assumption === 'My return forecasts') return 'Maximum expected Sharpe';
  return assumption === 'Proportional to idiosyncratic volatility' ? 'Maximum idiosyncratic return / risk' : 'Maximum return / risk';
}
export function selectObjective(choice: ObjectiveChoice, assumption: ReturnAssumption): { objective: OptimizerInput['objective']; assumption: ReturnAssumption } {
  return { objective: choice === 'Maximum return / risk' ? 'Maximum Sharpe' : choice, assumption };
}

export const exposurePresets = [
  { id: 'long-only', label: 'Long-only', longOnly: true, shortOnly: false, net: 1, gross: 1, description: '100% net · maximum 100% gross · no short positions.' },
  { id: '130-30', label: '130/30 limits', longOnly: false, shortOnly: false, net: 1, gross: 1.6, description: '100% net · maximum 160% gross · up to 130% long and 30% short. Shorts are permitted, not required.' },
  { id: 'neutral', label: 'Market-neutral · dollar-neutral', longOnly: false, shortOnly: false, net: 0, gross: 2, description: '0% net · maximum 200% gross · up to 100% on each side. Equal long/short dollars; market beta is not constrained.' },
] as const;
export function matchingExposurePreset(input: Pick<OptimizerInput, 'longOnly' | 'shortOnly' | 'net' | 'gross'> & { netRange: boolean }): string {
  if (input.netRange) return 'custom';
  return exposurePresets.find(p => p.longOnly === input.longOnly && p.shortOnly === !!input.shortOnly && Math.abs(p.net - input.net) < 1e-8 && Math.abs(p.gross - input.gross) < 1e-8)?.id ?? 'custom';
}
// Triangle inequality: sum |new-current| >= |sum(new-current)|. This is
// only a necessary trading budget, not a full constraint-feasibility check.
export function minimumNetTrade(current: number[], netMin: number, netMax: number): number | null {
  if (![...current, netMin, netMax].every(Number.isFinite) || netMin > netMax) return null;
  const net = current.reduce((a, b) => a + b, 0);
  return Math.max(0, netMin - net, net - netMax);
}

type ShortInputs = Pick<OptimizerInput, 'current' | 'longOnly' | 'shortOnly' | 'net' | 'netMin' | 'netMax' | 'gross' | 'positionCap' | 'positionBounds' | 'locked' | 'turnoverCap' | 'changeCap' | 'newNameGrossCap'>;
type ShortStatus = { severity: 'info' | 'warning' | 'error'; blocked: boolean; title: string; detail: string; focus: 'sides' | 'exposure' | 'allocation'; exposureShortCeiling: number | null };
const pct = (x: number) => `${Number((x * 100).toFixed(2))}%`;

// Necessary bounds, not a feasibility solver. Never promise that a positive
// ceiling is attainable: factor constraints and coupled bounds still apply.
export function shortExposureStatus(input: ShortInputs): ShortStatus {
  const lo = input.netMin ?? input.net, hi = input.netMax ?? input.net;
  const invalid = (detail: string, focus: ShortStatus['focus'] = 'exposure'): ShortStatus => ({ severity: 'error', blocked: false, title: 'Check exposure limits', detail, focus, exposureShortCeiling: null });
  if (![lo, hi, input.gross, input.positionCap].every(Number.isFinite) || lo > hi || input.gross < 0 || input.positionCap <= 0)
    return invalid('Enter valid net, gross and position limits.');
  if (lo > input.gross + 1e-10 || hi < -input.gross - 1e-10)
    return invalid('The net exposure cannot exceed the maximum gross exposure in absolute value.');
  if (input.longOnly && input.shortOnly || input.longOnly && hi < 0 || input.shortOnly && lo > 0)
    return invalid('The net exposure conflicts with the selected position sides.');
  if (input.longOnly) return { severity: 'info', blocked: true, title: 'Shorts off · long-only allocation', detail: 'Choose Long and short to permit negative weights. Exposure limits still apply.', focus: 'sides', exposureShortCeiling: 0 };
  const ceiling = Math.max(0, Math.min(input.gross, (input.gross - lo) / 2));
  if (ceiling < 1e-10) return { severity: 'warning', blocked: true, title: 'Shorts blocked by gross/net limits', detail: `${pct(input.gross)} maximum gross and ${pct(lo)} ${lo === hi ? 'net target' : 'minimum net'} permit 0% short exposure. Increase maximum gross or lower net exposure to permit shorts.`, focus: 'exposure', exposureShortCeiling: 0 };
  const optional = [input.turnoverCap, input.changeCap, input.newNameGrossCap];
  if (optional.some(v => v != null && (!Number.isFinite(v) || v < 0)) || input.current.some(v => !Number.isFinite(v)))
    return invalid('Enter valid trading limits and portfolio weights.', 'allocation');
  const lower = input.current.map((w, i) => {
    const b = input.positionBounds?.[i];
    let min = Math.max(-input.positionCap, b?.min ?? -Infinity), max = Math.min(input.shortOnly ? 0 : input.positionCap, b?.max ?? Infinity);
    if (input.changeCap !== null) { min = Math.max(min, w - input.changeCap); max = Math.min(max, w + input.changeCap); }
    if (input.turnoverCap !== null) { min = Math.max(min, w - input.turnoverCap); max = Math.min(max, w + input.turnoverCap); }
    if (Math.abs(w) < 1e-12 && input.newNameGrossCap !== undefined) { min = Math.max(min, -input.newNameGrossCap); max = Math.min(max, input.newNameGrossCap); }
    if (input.locked.includes(i)) { min = Math.max(min, w); max = Math.min(max, w); }
    return { min, max };
  });
  if (lower.some(b => !Number.isFinite(b.min) || !Number.isFinite(b.max) || b.min > b.max + 1e-10))
    return invalid('A position bound, lock or trading limit conflicts with the selected allocation.', 'allocation');
  if (lower.length && lower.every(b => b.min >= -1e-10)) return { severity: 'warning', blocked: true, title: 'Shorts blocked by position or trading limits', detail: 'No stock can cross below zero under its bounds, locks and trading limits. Review those limits to permit short positions.', focus: 'allocation', exposureShortCeiling: ceiling };
  return { severity: 'info', blocked: false, title: 'Shorts permitted by exposure limits', detail: `Gross/net short ceiling: ${pct(ceiling)} of capital. Other constraints may reduce it; the optimizer is not required to take shorts.`, focus: 'exposure', exposureShortCeiling: ceiling };
}
