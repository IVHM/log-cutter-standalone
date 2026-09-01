# JSON Log Explorer

A standalone, local-first workspace for investigating JSON logs. Import CSV or JSONL, pin the fields you care about, spread related events across canvases, and keep notes and arrows with the evidence. Nothing leaves the browser.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:43123](http://localhost:43123). All projects persist in IndexedDB on that browser. Use **Settings → Export project file** to move an investigation to another machine.

```bash
npm run build
npm start
```

There is no backend and no account. Duplicate logs are skipped with a SHA-256 hash map of canonical JSON, which is cheaper than storing a second copy of the payload.

## Workflow

1. Create a project (or open the sample incident).
2. Import a `.csv` (JSON in a cell, or one object per row), `.json`, or `.jsonl`.
3. In the log browser, check schema fields to build a table view. Select rows and **Place on canvas**.
4. On a canvas: drag to box-select, hold **Space** or middle-click to pan, scroll to zoom. Expand a log and click the pin next to a field so it stays visible when the card is collapsed. Double-click the pane for a sticky note. Drag from a node handle to draw an adjustable arrow.

## Import formats

- CSV with a JSON blob in one column plus ancillary columns (`host`, `timestamp`, …). Ancillary values attach to the log without mutating the payload.
- CSV of flat fields (each row becomes an object).
- JSON array, single object, JSONL / NDJSON.

A sample CSV lives at `public/sample-logs.csv`.
