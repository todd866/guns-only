# Guns Only rated arena

Shared Elo ladder for humans and computer opponents. Combat stays in the local sim; this
service only assigns matches, handicaps bots by interpolating `BanditSkillProfile` knobs, and
records outcomes / fun signals.

## Authority boundary

- Soft ladder: the browser reports fight outcomes with sanity checks. No money, no hard anti-cheat.
- Handicap adjusts the **bot** only. Human airframe physics are never rewritten for balance.
- `pilotKey` is hashed to a principal id; raw keys are not written to standings.
- Fun score + exploration quota gate which bots appear in human matchmaking.

## HTTP (protocol v1)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/healthz` | liveness + counts |
| `GET` | `/v1/standings?limit=50` | Elo board (bots + humans who have played) |
| `POST` | `/v1/match` | `{ pilotKey, scaffolded? }` → bot + handicap profile |
| `POST` | `/v1/match/complete` | outcome + sanity + optional `againVote` |

## Local

```sh
npm --prefix arena-worker ci --ignore-scripts
npm --prefix arena-worker test
npx --prefix arena-worker wrangler dev --port 5081
```

ASP.NET parity for local clients without Wrangler:

```sh
dotnet run --project arena-server/GunsOnly.ArenaServer.csproj --urls http://localhost:5081
```

## Deploy

```sh
cd arena-worker
npx wrangler deploy
```

The browser preview deliberately uses the same-origin Vercel function. This Worker remains the
Durable Object implementation for parity testing and a future explicitly reviewed backend switch.
