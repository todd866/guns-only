using System.Text.Json;
using GunsOnly.ArenaServer;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<ArenaStore>();

WebApplication app = builder.Build();

app.Use(async (context, next) => {
    string? origin = context.Request.Headers.Origin.FirstOrDefault();
    string configured = app.Configuration["GUNS_ALLOWED_ORIGINS"]
        ?? "https://guns-only.com,https://guns-only.cohort.md,https://guns-only.vercel.app,http://127.0.0.1:8877,http://localhost:8877,http://[::1]:8877";
    if (origin is not null) {
        HashSet<string> allowed = configured.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .ToHashSet(StringComparer.Ordinal);
        if (!allowed.Contains(origin)) {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsync("Origin is not allowed");
            return;
        }
        context.Response.Headers.Append("Access-Control-Allow-Origin", origin);
        context.Response.Headers.Append("Vary", "Origin");
    }
    if (HttpMethods.IsOptions(context.Request.Method)) {
        context.Response.Headers.Append("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        context.Response.Headers.Append("Access-Control-Allow-Headers", "content-type");
        context.Response.StatusCode = StatusCodes.Status204NoContent;
        return;
    }
    await next();
});

app.MapGet("/healthz", (ArenaStore store) => Results.Json(store.Health()));

app.MapGet("/v1/standings", (ArenaStore store, int? limit) =>
    Results.Json(store.Standings(limit ?? 50)));

app.MapPost("/v1/match", async (HttpRequest request, ArenaStore store) => {
    MatchCreateBody? body = await request.ReadFromJsonAsync<MatchCreateBody>();
    if (body is null) return Results.Json(new { ok = false, reason = "invalid-request" }, statusCode: 400);
    object result = store.CreateMatch(body.PilotKey ?? "", body.Scaffolded);
    int status = result is { } r && PropertyEquals(r, "ok", true) ? 200
        : PropertyEquals(result, "reason", "no-eligible-bot") ? 503 : 400;
    return Results.Json(result, statusCode: status);
});

app.MapPost("/v1/match/complete", async (HttpRequest request, ArenaStore store) => {
    MatchCompleteBody? body = await request.ReadFromJsonAsync<MatchCompleteBody>();
    if (body is null || string.IsNullOrWhiteSpace(body.MatchId))
        return Results.Json(new { ok = false, reason = "invalid-request" }, statusCode: 400);
    object result = store.CompleteMatch(
        body.MatchId,
        body.PilotKey ?? "",
        body.Outcome ?? "",
        body.Completed ?? true,
        body.EarlyAbandon ?? false,
        body.Rematch ?? false,
        body.AgainVote ?? 0,
        body.Sanity);
    int status = PropertyEquals(result, "ok", true) ? 200
        : PropertyEquals(result, "reason", "unknown-match") ? 404
        : PropertyEquals(result, "reason", "already-completed") ? 409
        : 400;
    return Results.Json(result, statusCode: status);
});

app.Run();

static bool PropertyEquals(object result, string name, object expected) {
    System.Reflection.PropertyInfo? prop = result.GetType().GetProperty(name);
    if (prop is null) {
        // anonymous objects use the compiler-generated property names as-is
        prop = result.GetType().GetProperties()
            .FirstOrDefault(p => string.Equals(p.Name, name, StringComparison.OrdinalIgnoreCase));
    }
    object? value = prop?.GetValue(result);
    return Equals(value, expected);
}

public sealed record MatchCreateBody(string? PilotKey, bool Scaffolded = false);

public sealed record MatchCompleteBody(
    string? MatchId,
    string? PilotKey,
    string? Outcome,
    bool? Completed,
    bool? EarlyAbandon,
    bool? Rematch,
    int? AgainVote,
    MatchSanity? Sanity);

public partial class Program;
