using System.Runtime.InteropServices.JavaScript;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;

// The .NET runtime is used ONLY as a wasm host for the sim kernel — no Blazor UI, no razor.
// Rendering, input and HUD are plain JS/three.js. The kernel that runs here is the SAME
// compiled C# that runs on the desktop and passes the 90 tests: not a port, a recompile.
var builder = WebAssemblyHostBuilder.CreateDefault(args);
await builder.Build().RunAsync();
