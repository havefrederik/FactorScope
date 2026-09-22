export type PublishedDowArchive = {
  sourceCommit: string;
  tickers: string[];
  holdingDates: string[];
  holdings: number[][];
  targetDates: string[];
  targets: number[][];
};

export const dowArchiveCommit = "351c782b9b8b395c1a5f886b77e0d55f1bc9396e";
export const dowArchiveSource = `https://github.com/cvxgrp/cvxportfolio/tree/${dowArchiveCommit}/examples/strategies`;

export function inspectDowArchive(data: PublishedDowArchive, index: number) {
  const i = Math.max(0, Math.min(data.holdingDates.length - 1, index));
  const date = data.holdingDates[i];
  let targetIndex = 0;
  while (targetIndex + 1 < data.targetDates.length && data.targetDates[targetIndex + 1] <= date) targetIndex++;
  const nav = data.holdings[i].reduce((a, b) => a + b, 0);
  const initialNav = data.holdings[0].reduce((a, b) => a + b, 0);
  const rows = data.tickers.map((ticker, j) => ({
    ticker, dollars: data.holdings[i][j], weight: data.holdings[i][j] / nav,
    target: data.targets[targetIndex][j], change: data.targets[targetIndex][j] - data.holdings[i][j] / nav,
  })).filter(row => Math.abs(row.weight) > 1e-7 || Math.abs(row.target) > 1e-7).sort((a, b) => Math.abs(b.target) - Math.abs(a.target));
  return { date, nav, totalReturn: nav / initialNav - 1, rows, targetDate: data.targetDates[targetIndex], newTarget: data.targetDates[targetIndex] === date };
}
