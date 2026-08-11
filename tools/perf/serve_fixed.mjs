import { serveOnFixedPort, PORT, WWWROOT } from "./frame_attribution.mjs";
const site = await serveOnFixedPort(WWWROOT, PORT);
console.log("serving", WWWROOT, "at", site.url);
process.on("SIGTERM", () => site.close().then(() => process.exit(0)));
setInterval(() => {}, 1 << 30);
