# Deployed telemetry setup

The function in `api/telemetry.js` uses Vercel Blob's HTTP API directly, so this static deployment
does not need a `package.json`, an npm install, or a build step. Each flight is stored as one private
`telemetry/<session>.jsonl` blob; later recorder flushes read and overwrite that blob with the new
rows appended.

## One required dashboard step

In the Vercel dashboard, open the **guns-only** project, go to **Storage**, create a **private Blob
store**, and connect it to the project/Production environment. Vercel must expose the resulting
`BLOB_READ_WRITE_TOKEN` environment variable to the project. Redeploy after connecting the store so
the production function receives the variable. Do not put the token in this repository or browser
code.

Deploy from the directory that is the copy/publish output of `web/wwwroot`:

```sh
vercel deploy --prod
```

Because `api/telemetry.js` and `vercel.json` live inside `web/wwwroot`, they are included in that
copy. At the deploy root Vercel discovers `api/telemetry.js` as `/api/telemetry`; `vercel.json`
rewrites the recorder's unchanged `/telemetry` POST to it. The local Python telemetry server still
handles `/telemetry` directly and continues writing JSONL files to disk.

## Verify production capture

First smoke-test the deployed rewrite. A configured deployment returns `204` (storage failures also
return `204` by design, so complete the Blob check below):

```sh
curl -i -X POST 'https://guns-only.vercel.app/telemetry' \
  -H 'Content-Type: application/json' \
  --data '{"session":"smoke-test","rows":[{"k":"hdr","build":"smoke"}]}'
```

Fly the deployed game for several seconds, then list captured sessions with the same read-write
token copied from the Vercel project settings:

```sh
export BLOB_READ_WRITE_TOKEN='paste-the-token-locally'
curl -fsS 'https://blob.vercel-storage.com?prefix=telemetry/' \
  -H "Authorization: Bearer $BLOB_READ_WRITE_TOKEN" \
  -H 'x-api-version: 12'
```

The response contains a `blobs` array. Copy a session's `url` and download its current JSONL. The
`cache=0` query is important after overwrites, and private blobs require the token:

```sh
curl -fsSL 'PASTE_BLOB_URL_HERE?cache=0' \
  -H "Authorization: Bearer $BLOB_READ_WRITE_TOKEN" \
  -o flight.jsonl
```

Confirm it contains an `hdr` row followed by `st`/`in` rows:

```sh
wc -l flight.jsonl
head -n 3 flight.jsonl
```

If `/telemetry` returns `204` but no blob appears, inspect the `api/telemetry` Function logs. The
function intentionally hides configuration/storage failures from the flight client, while logging
the failure server-side.
