using System.Runtime.InteropServices.JavaScript;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;

// The .NET runtime is used only as a WASM host for the sim kernel—there is no Blazor UI or Razor.
// Rendering, input and HUD are plain JS/three.js. This is the same pure C# kernel exercised by the
// headless production-session test suite, compiled for the browser rather than ported.
var builder = WebAssemblyHostBuilder.CreateDefault(args);
await builder.Build().RunAsync();
