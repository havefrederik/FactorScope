/** The downloadable example and the About guide use the same valid holdings file. */
export const HOLDINGS_CSV_TEMPLATE = `ticker,market_value,name,sector
AAPL,45000,Apple,Technology
MSFT,35000,Microsoft,Technology
CASH,20000,Cash,Cash
`;

export function downloadHoldingsTemplate() {
  const url = URL.createObjectURL(new Blob([HOLDINGS_CSV_TEMPLATE], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "factorscope-holdings-example.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
