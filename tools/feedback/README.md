# Feedback report retrieval

Reports are private Blob objects and require the operator credential. Set
`GUNS_TELEMETRY_ADMIN_TOKEN` (the existing `TELEMETRY_ADMIN_TOKEN` name is also accepted), then run:

```sh
node tools/feedback/pull.mjs --latest 10
node tools/feedback/pull.mjs --id REPORT_ID
```

Each report is downloaded once into
`~/.local/state/guns-only-reports/<id>/report.json` and `screenshot.jpg`; the command prints a
ten-line summary. The endpoint only permits bounded list and immutable get operations under the
`reports/` prefix.
