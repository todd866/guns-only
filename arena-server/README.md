# Guns Only arena (local ASP.NET parity)

Implements the same HTTP protocol as [`arena-worker/`](../arena-worker/) for local development
without Wrangler.

```sh
dotnet run --project arena-server/GunsOnly.ArenaServer.csproj --urls http://localhost:5081
dotnet test arena-server.Tests/GunsOnly.ArenaServer.Tests.csproj
```

See [`arena-worker/README.md`](../arena-worker/README.md) for the protocol and authority boundary.
