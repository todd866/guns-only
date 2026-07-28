# Flight frame reports

Agent-readable beat-7 harness outputs (`*-beat7-flight.json` / `.md`) land here after:

```sh
dotnet publish web/GunsOnly.Web.csproj -c Release
# stage Ukraine atlas (see bin/preview-web)
node tools/perf/flight_frame_harness.mjs
```

JSON/MD run artifacts are gitignored; this README stays tracked.
