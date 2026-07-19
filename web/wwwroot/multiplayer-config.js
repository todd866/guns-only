// Public production endpoint for the persistent global world. Use ?server=off for isolated QA or
// ?server=ws://localhost:5080/room to exercise the local ASP.NET parity server explicitly.
globalThis.GUNS_MULTIPLAYER_URL = globalThis.GUNS_MULTIPLAYER_URL
  || "wss://guns-only-world.toddian.workers.dev/room";
