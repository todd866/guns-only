# Guns Only persistent global world

Production multiplayer runs in `world-worker/` as one Cloudflare Durable Object. This ASP.NET Core
service implements the same protocol for local development. Both endpoints accept browser
WebSockets at `/room`, require a protocol-v2 hello, assign a stable browser identity to a world
sector, validate poses, and broadcast snapshots at 20 Hz. `/healthz` reports the protocol, world
epoch, connection count, and bogey configuration.

Every browser identity receives a sector at least 40 km from its neighbours. The browser keeps its
simulation near its local origin; the server translates outgoing poses into shared-world
coordinates and the client translates snapshots back into its assigned frame. Three server-owned
bogeys continuously orbit each active sector. Their paths derive from the durable world epoch and
wall time, so they keep moving while the room is empty and across Durable Object hibernation.

Remote players and world bogeys are presently **shared presence, not combat authority**. They are
smoothed, labelled, and visible, but are excluded from local guns, padlock, collision, HUD targeting,
and sortie outcomes. The built-in local mission bandit remains the only combat opponent.

## Run locally

Start the parity server from the repository root:

```sh
dotnet run --project server/GunsOnly.Server.csproj --urls http://localhost:5080
```

Because the checked-in browser configuration points at production, add
`?server=ws://localhost:5080/room` when testing locally. `?server=off` disables multiplayer.

## Deploy

Deploy the durable world:

```sh
cd world-worker
npx wrangler deploy
```

The production endpoint is `wss://guns-only-world.toddian.workers.dev/room`; it permits the exact
origin `https://guns-only.vercel.app`. Change `GUNS_ALLOWED_ORIGINS` in `world-worker/wrangler.jsonc`
when adding another public frontend origin. The browser endpoint lives in
`web/wwwroot/multiplayer-config.js` and contains no secret.

Cloudflare persists the world epoch, browser identities, callsigns, sector assignments, and world
creation time in Durable Object storage. A browser installation stores an opaque pilot key in local
storage; clearing site data intentionally creates a new pilot identity and sector.
