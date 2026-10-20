"use client";

import { useEffect, useRef, useState } from "react";
import { downloadHoldingsTemplate, HOLDINGS_CSV_TEMPLATE } from "@/lib/holdings-template";

export default function CsvUploadDialog({ open, onClose, onGuide, onUpload }: {
  open: boolean;
  onClose: () => void;
  onGuide: () => void;
  onUpload: (file: File) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);

  useEffect(() => {
    if (open) {
      setError("");
      dialog.current?.showModal();
    } else {
      dialog.current?.close();
    }
  }, [open]);

  async function readFile(file?: File) {
    if (!file) return;
    setError("");
    setReading(true);
    try {
      await onUpload(file);
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
      <div><span className="guide-eyebrow">YOUR PORTFOLIO</span><h2 id="csv-upload-title">Upload a portfolio</h2></div>
      <button type="button" className="csv-upload-close" aria-label="Close CSV upload" disabled={reading} onClick={onClose}>×</button>
    </header>
    <p id="csv-upload-description">Choose a CSV with one row per position and its market value in US dollars.</p>
    <div className="csv-upload-columns">
      <p><strong>Required</strong><code>ticker</code><code>market_value</code></p>
      <p><strong>Optional</strong><code>name</code><code>sector</code></p>
    </div>
    <pre aria-label="Example holdings CSV"><code>{HOLDINGS_CSV_TEMPLATE}</code></pre>
    <p className="csv-upload-hint">Use dollar values, not shares or percentages. Include a header row, separate columns with commas, and use a decimal point. Use <code>CASH</code> for cash.</p>
    <div className="csv-upload-help">
      <button type="button" onClick={downloadHoldingsTemplate}>Download example CSV ↓</button>
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
      <input ref={input} type="file" accept=".csv,text/csv" hidden aria-label="Portfolio CSV file" onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        void readFile(file);
      }}/>
    </footer>
  </dialog>;
}
