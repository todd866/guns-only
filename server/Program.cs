using GunsOnly.Server;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<GlobalRoom>();
builder.Services.AddHostedService<RoomBroadcastService>();

WebApplication app = builder.Build();
app.UseWebSockets(new WebSocketOptions {
    KeepAliveInterval = TimeSpan.FromSeconds(20)
});

app.MapGet("/healthz", (GlobalRoom room) => Results.Ok(new {
    status = "ok",
    room = GlobalRoom.RoomId,
    connected = room.ConnectionCount,
    protocol = PresenceProtocol.Version,
    worldEpoch = room.WorldEpoch,
    bogeysPerSector = PresenceProtocol.BogeysPerSector
}));

app.Map("/room", async context => {
    if (!context.WebSockets.IsWebSocketRequest) {
        context.Response.StatusCode = StatusCodes.Status426UpgradeRequired;
        await context.Response.WriteAsync("WebSocket upgrade required");
        return;
    }

    if (!AllowedOrigin(context)) {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        await context.Response.WriteAsync("WebSocket origin is not allowed");
        return;
    }

    using var socket = await context.WebSockets.AcceptWebSocketAsync();
    await context.RequestServices.GetRequiredService<GlobalRoom>()
        .AcceptAsync(socket, context.RequestAborted);
});

app.Run();

static bool AllowedOrigin(HttpContext context) {
    string? origin = context.Request.Headers.Origin.FirstOrDefault();
    string configured = context.RequestServices.GetRequiredService<IConfiguration>()
        ["GUNS_ALLOWED_ORIGINS"] ?? PresenceProtocol.DefaultAllowedOrigins;
    return PresenceProtocol.IsAllowedOrigin(origin, configured);
}

public partial class Program;
