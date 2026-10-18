export type ImportedHolding={ticker:string;name:string;sector:string;value:number};

/** RFC-style quoted cells, including embedded commas, quotes and newlines. */
export function csvRows(text:string){const rows:string[][]=[];let row:string[]=[],cell="",quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===","||c==="\n"||c==="\r")){row.push(cell);cell="";if(c!==","){if(row.some(v=>v.trim()))rows.push(row);row=[];if(c==="\r"&&text[i+1]==="\n")i++;}}else cell+=c;}if(quoted)throw Error("Unclosed quoted field in CSV.");row.push(cell);if(row.some(v=>v.trim()))rows.push(row);return rows;}

export function parseHoldingsCsv(text:string):ImportedHolding[]{
  const rows=csvRows(text.replace(/^\uFEFF/,"")),header=(rows.shift()??[]).map(v=>v.trim().toLowerCase());
  const tickerIndex=header.indexOf("ticker"),valueIndex=header.indexOf("market_value"),sectorIndex=header.indexOf("sector"),nameIndex=header.indexOf("name");
  if(tickerIndex<0||valueIndex<0)throw Error("CSV requires ticker and market_value columns.");
  const combined=new Map<string,ImportedHolding>();
  rows.forEach((row,i)=>{const ticker=(row[tickerIndex]??"").trim().toUpperCase(),raw=(row[valueIndex]??"").trim().replace(/[$,\s]/g,""),value=Number(raw);if(!/^[A-Z][A-Z0-9.^=-]{0,14}$/.test(ticker)||!raw||!Number.isFinite(value))throw Error(`Invalid ticker or market value on row ${i+2}.`);const sector=ticker==="CASH"?"Cash":(row[sectorIndex]??"").trim()||"Unclassified",name=(row[nameIndex]??"").trim()||ticker,previous=combined.get(ticker);if(previous){if(previous.sector!==sector)throw Error(`Conflicting sector classifications for ${ticker}.`);previous.value+=value;}else combined.set(ticker,{ticker,name,sector,value});});
  if(!combined.size)throw Error("CSV contains no portfolio rows.");
  if(!combined.has("CASH"))combined.set("CASH",{ticker:"CASH",name:"Cash (residual)",sector:"Cash",value:0});
  const holdings=[...combined.values()];if(holdings.reduce((s,h)=>s+h.value,0)<=0)throw Error("Portfolio NAV must be positive. Include CASH / collateral when uploading a net-zero or net-short stock book.");
  return holdings;
}
