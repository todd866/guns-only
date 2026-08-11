// The Multiplayer preview always uses same-origin `/arena` (Vercel Function). Direct ArenaClient
// tooling may still use a local `?arena=http://localhost:5081` override for ASP.NET parity.
globalThis.GUNS_ARENA_URL = globalThis.GUNS_ARENA_URL || "";
