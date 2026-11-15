"use client";

import { useEffect, useRef, useState } from "react";
import { forecastTemplate, pricesTemplate, type CsvKind } from "@/lib/portfolio-imports";
import { downloadCsvTemplate, HOLDINGS_CSV_TEMPLATE } from "@/lib/holdings-template";

export default function CsvUploadDialog({ open, onClose, onGuide, onUpload, initialKind, loaded, onRemove }: {
  open: boolean;
  onClose: () => void;
  onGuide: () => void;
  initialKind: CsvKind;
  loaded: Partial<Record<CsvKind,string>>;
  onRemove: (kind: "forecasts" | "prices") => void;
  onUpload: (file: File, kind: CsvKind) => Promise<void>;
}) {
  const [kind,setKind] = useState<CsvKind>(initialKind);
  const formats = {
    holdings: { label:"Holdings", description:"One row per position, with its market value in US dollars.", template:HOLDINGS_CSV_TEMPLATE },
    forecasts: { label:"Return forecasts", description:"One row per ticker, availability date and forecast horizon. Enter 8 for an 8% annual excess return.", template:forecastTemplate },
    prices: { label:"Adjusted prices", description:"Daily USD closes adjusted for splits and dividends. Each supplied ticker uses its complete uploaded series.", template:pricesTemplate },
  };
  const format = formats[kind];
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);

  useEffect(() => {
    if (open) {
      setError("");
      setKind(initialKind);
      dialog.current?.showModal();
    } else {
      dialog.current?.close();
    }
  }, [open,initialKind]);

  async function readFile(file?: File) {
    if (!file) return;
    setError("");
    setReading(true);
    try {
      await onUpload(file,kind);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to read this file. Please choose a CSV file.");
    } finally {
      setReading(false);
    }
  }

  return <dialog ref={dialog} className="csv-upload-dialog" aria-labelledby="csv-upload-title" aria-describedby="csv-upload-description"
    onCancel={event => { event.preventDefault(); if (!reading) onClose(); }}>
    <header className="csv-upload-heading">
      <div><h2 id="csv-upload-title">Upload CSV</h2></div>
      <button type="button" className="csv-upload-close" aria-label="Close CSV upload" disabled={reading} onClick={onClose}>×</button>
    </header>
    <div className="csv-kind-selector" role="group" aria-label="CSV type">{(Object.keys(formats) as CsvKind[]).map(k=><button key={k} type="button" disabled={reading} aria-pressed={kind===k} onClick={()=>{setKind(k);setError("");}}>{formats[k].label}</button>)}</div>
    <p id="csv-upload-description">{format.description}</p>
    <pre aria-label={format.label+" CSV example"}><code>{format.template}</code></pre>
    {kind!=="holdings" && loaded[kind] && <p className="csv-upload-hint">Loaded · {loaded[kind]} <button disabled={reading} onClick={()=>onRemove(kind)}>Remove</button></p>}
    <div className="csv-upload-help">
      <button type="button" onClick={()=>downloadCsvTemplate(kind+"-example",format.template)}>Download template ↓</button>
      <a href="#about-csv" onClick={event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        dialog.current?.close();
        onClose();
        onGuide();
      }}>Full format guidance →</a>
    </div>
    {error && <p className="csv-upload-error" role="alert">{error}</p>}
    <footer className="csv-upload-actions">
      <button type="button" disabled={reading} onClick={onClose}>Cancel</button>
      <button type="button" className="csv-choose-file" autoFocus disabled={reading} onClick={() => input.current?.click()}>{reading ? "Reading file…" : "Choose file"}</button>
      <input ref={input} type="file" accept=".csv,text/csv" hidden aria-label={format.label+" CSV file"} onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        void readFile(file);
      }}/>
    </footer>
  </dialog>;
}
