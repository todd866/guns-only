using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text.Json;

namespace GunsOnly.Server;

public sealed class GlobalRoom(ILogger<GlobalRoom> logger) {
    public const string RoomId = "global";
    readonly ConcurrentDictionary<string, PlayerConnection> _connections = new();
    readonly ConcurrentDictionary<string, PlayerIdentity> _identities = new();
    readonly object _admissionGate = new();
    readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web);
    readonly DateTimeOffset _worldCreatedAt = DateTimeOffset.UtcNow;
    readonly string _worldEpoch = $"world-{Guid.NewGuid():N}";
    int _nextSector = -1;

    public int ConnectionCount => _connections.Count;
    public string WorldEpoch => _worldEpoch;

    public async Task AcceptAsync(WebSocket socket, CancellationToken requestAborted) {
        PlayerConnection? connection = null;
        try {
            using var helloTimeout = CancellationTokenSource.CreateLinkedTokenSource(requestAborted);
            helloTimeout.CancelAfter(PresenceProtocol.HelloTimeout);
            HelloMessage? hello = await ReceiveHelloAsync(socket, helloTimeout.Token);
            if (hello is null || !PresenceProtocol.TryValidateHello(hello, out string pilotKey)) {
                await socket.CloseAsync(WebSocketCloseStatus.PolicyViolation,
                    "Valid protocol hello required", requestAborted);
                return;
            }
            PlayerIdentity identity = _identities.GetOrAdd(pilotKey, _ => {
                int sector = Interlocked.Increment(ref _nextSector);
                return new PlayerIdentity(
                    $"pilot-{Guid.NewGuid():N}",
                    $"PILOT-{sector + 1:0000}",
                    sector,
                    PresenceProtocol.SectorOrigin(sector));
            });
            PlayerConnection? replaced;
            lock (_admissionGate) {
                if (_connections.Count >= PresenceProtocol.MaximumConnections
                    && !_connections.ContainsKey(identity.PlayerId)) {
                    replaced = null;
                } else {
                    connection = new PlayerConnection(identity, socket);
                    replaced = ReplaceConnection(connection);
                }
            }
            if (connection is null) {
                await socket.CloseAsync(WebSocketCloseStatus.EndpointUnavailable,
                    "World connection capacity reached", requestAborted);
                return;
            }
            if (replaced is not null)
                await replaced.CloseQuietlyAsync((WebSocketCloseStatus)4001,
                    "Replaced by newer connection");
            await connection.SendAsync(new WelcomeMessage(
                "welcome", PresenceProtocol.Version, RoomId,
                identity.PlayerId, identity.Callsign, identity.SectorIndex,
                identity.SpawnOrigin, _worldEpoch,
                DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()), _json, requestAborted);

            logger.LogInformation("{Callsign} joined {Room} in sector {Sector}; {Count} connected",
                identity.Callsign, RoomId, identity.SectorIndex, _connections.Count);
            await ReceiveLoopAsync(connection, requestAborted);
        } catch (OperationCanceledException) when (requestAborted.IsCancellationRequested) {
        } catch (OperationCanceledException) {
            if (socket.State == WebSocketState.Open)
                await socket.CloseAsync(WebSocketCloseStatus.PolicyViolation,
                    "Protocol hello timed out", CancellationToken.None);
        } catch (WebSocketException exception) {
            logger.LogDebug(exception, "Global-room WebSocket ended");
        } catch (ObjectDisposedException) {
            // A newer connection for the same stable pilot may replace and dispose this socket.
        } finally {
            if (connection is not null) {
                RemoveConnection(connection);
                await connection.CloseQuietlyAsync();
                logger.LogInformation("{Callsign} left {Room}; {Count} connected",
                    connection.Identity.Callsign, RoomId, _connections.Count);
            } else {
                socket.Dispose();
            }
        }
    }

    PlayerConnection? ReplaceConnection(PlayerConnection connection) {
        string playerId = connection.Identity.PlayerId;
        while (true) {
            if (_connections.TryAdd(playerId, connection)) return null;
            if (!_connections.TryGetValue(playerId, out PlayerConnection? previous)) continue;
            if (_connections.TryUpdate(playerId, connection, previous)) return previous;
        }
    }

    bool RemoveConnection(PlayerConnection connection) =>
        ((ICollection<KeyValuePair<string, PlayerConnection>>)_connections)
            .Remove(new(connection.Identity.PlayerId, connection));

    async Task<HelloMessage?> ReceiveHelloAsync(WebSocket socket, CancellationToken cancellationToken) {
        byte[] buffer = new byte[PresenceProtocol.MaximumMessageBytes];
        ValueWebSocketReceiveResult result = await socket.ReceiveAsync(buffer.AsMemory(), cancellationToken);
        if (result.MessageType != WebSocketMessageType.Text || !result.EndOfMessage) return null;
        try { return JsonSerializer.Deserialize<HelloMessage>(buffer.AsSpan(0, result.Count), _json); }
        catch (JsonException) { return null; }
    }

    async Task ReceiveLoopAsync(PlayerConnection connection, CancellationToken cancellationToken) {
        byte[] buffer = new byte[PresenceProtocol.MaximumMessageBytes];
        while (!cancellationToken.IsCancellationRequested
            && connection.Socket.State == WebSocketState.Open) {
            ValueWebSocketReceiveResult result = await connection.Socket.ReceiveAsync(
                buffer.AsMemory(), cancellationToken);
            if (result.MessageType == WebSocketMessageType.Close) break;
            if (result.MessageType != WebSocketMessageType.Text || !result.EndOfMessage) {
                await connection.Socket.CloseAsync(WebSocketCloseStatus.MessageTooBig,
                    "One complete text message is required", cancellationToken);
                break;
            }

            try {
                if (!connection.TryConsumeMessageBudget(DateTimeOffset.UtcNow)) {
                    await connection.Socket.CloseAsync(WebSocketCloseStatus.PolicyViolation,
                        "Presence message rate exceeded", cancellationToken);
                    break;
                }
                PoseMessage? message = JsonSerializer.Deserialize<PoseMessage>(
                    buffer.AsSpan(0, result.Count), _json);
                if (message is null || !connection.TryUpdatePose(message)) {
                    if (connection.RecordInvalidMessage() >= PresenceProtocol.MaximumInvalidMessages) {
                        await connection.Socket.CloseAsync(WebSocketCloseStatus.PolicyViolation,
                            "Repeated invalid presence messages", cancellationToken);
                        break;
                    }
                }
            } catch (JsonException) {
                if (connection.RecordInvalidMessage() >= PresenceProtocol.MaximumInvalidMessages) {
                    await connection.Socket.CloseAsync(WebSocketCloseStatus.PolicyViolation,
                        "Repeated malformed JSON", cancellationToken);
                    break;
                }
            }
        }
    }

    public async Task BroadcastSnapshotAsync(CancellationToken cancellationToken) {
        if (_connections.IsEmpty) return;
        DateTimeOffset now = DateTimeOffset.UtcNow;
        PlayerConnection[] candidates = _connections.Values.ToArray();
        PlayerConnection[] stale = candidates.Where(connection => connection.IsStale(now)).ToArray();
        foreach (PlayerConnection connection in stale) {
            RemoveConnection(connection);
            await connection.CloseQuietlyAsync(WebSocketCloseStatus.EndpointUnavailable,
                "Presence timed out");
        }
        PlayerConnection[] recipients = candidates.Except(stale).ToArray();
        if (recipients.Length == 0) return;
        PlayerSnapshot[] players = recipients
            .Select(connection => connection.Snapshot(now))
            .Where(snapshot => snapshot is not null)
            .Cast<PlayerSnapshot>()
            .OrderBy(snapshot => snapshot.PlayerId, StringComparer.Ordinal)
            .ToArray();
        await Task.WhenAll(recipients.Select(async connection => {
            try {
                double[] observer = connection.ObserverPosition(now);
                PlayerSnapshot[] visiblePlayers = players
                    .Select(player => (player, distance: HorizontalDistanceSquared(
                        observer, player.Position)))
                    .Where(value => value.distance <= PresenceProtocol.InterestRadiusMetres
                        * PresenceProtocol.InterestRadiusMetres)
                    .OrderBy(value => value.distance)
                    .ThenBy(value => value.player.PlayerId, StringComparer.Ordinal)
                    .Take(PresenceProtocol.MaximumVisiblePlayers)
                    .Select(value => value.player)
                    .ToArray();
                int[] visibleSectors = recipients
                    .Select(recipient => recipient.Identity.SectorIndex)
                    .Distinct()
                    .Select(sector => (sector, distance: HorizontalDistanceSquared(
                        connection.Identity.SpawnOrigin, PresenceProtocol.SectorOrigin(sector))))
                    .Where(value => value.distance <= PresenceProtocol.InterestRadiusMetres
                        * PresenceProtocol.InterestRadiusMetres)
                    .OrderBy(value => value.distance)
                    .ThenBy(value => value.sector)
                    .Take(PresenceProtocol.MaximumVisibleSectors)
                    .Select(value => value.sector)
                    .ToArray();
                BogeySnapshot[] bogeys = visibleSectors
                    .SelectMany(sector => PresenceProtocol.BogeysForSector(
                        sector, _worldCreatedAt, now))
                    .ToArray();
                var snapshot = new RoomSnapshot(
                    "snapshot", PresenceProtocol.Version, RoomId, _worldEpoch,
                    now.ToUnixTimeMilliseconds(), recipients.Length,
                    visiblePlayers.Length, visibleSectors.Length, visiblePlayers, bogeys);
                byte[] payload = JsonSerializer.SerializeToUtf8Bytes(snapshot, _json);
                await connection.SendBytesAsync(payload, cancellationToken);
            } catch (Exception exception) when (exception is WebSocketException
                or OperationCanceledException or ObjectDisposedException) {
                RemoveConnection(connection);
                await connection.CloseQuietlyAsync();
            }
        }));
    }

    static double HorizontalDistanceSquared(double[] left, double[] right) =>
        Math.Pow(left[0] - right[0], 2) + Math.Pow(left[2] - right[2], 2);

    sealed class PlayerConnection(PlayerIdentity identity, WebSocket socket) {
        readonly object _poseLock = new();
        readonly SemaphoreSlim _sendLock = new(1, 1);
        ValidatedPose? _pose;
        DateTimeOffset _lastValidMessageAt = DateTimeOffset.UtcNow;
        DateTimeOffset _rateRefillAt = DateTimeOffset.UtcNow;
        double _rateTokens = PresenceProtocol.MessageBurstCapacity;
        int _invalidMessages;
        int _closed;

        public PlayerIdentity Identity { get; } = identity;
        public WebSocket Socket { get; } = socket;
        public string StreamId { get; } = $"stream-{Guid.NewGuid():N}";

        public bool TryConsumeMessageBudget(DateTimeOffset now) {
            lock (_poseLock) {
                double elapsedSeconds = Math.Max(0.0, (now - _rateRefillAt).TotalSeconds);
                _rateTokens = Math.Min(PresenceProtocol.MessageBurstCapacity,
                    _rateTokens + elapsedSeconds * PresenceProtocol.MessageRatePerSecond);
                _rateRefillAt = now;
                if (_rateTokens < 1.0) return false;
                _rateTokens -= 1.0;
                return true;
            }
        }

        public int RecordInvalidMessage() => Interlocked.Increment(ref _invalidMessages);

        public bool TryUpdatePose(PoseMessage message) {
            lock (_poseLock) {
                long previous = _pose?.Sequence ?? -1;
                if (!PresenceProtocol.TryValidatePose(
                    message, previous, _pose, out ValidatedPose pose))
                    return false;
                _pose = pose;
                _lastValidMessageAt = DateTimeOffset.UtcNow;
                return true;
            }
        }

        public bool IsStale(DateTimeOffset now) {
            lock (_poseLock) return now - _lastValidMessageAt > PresenceProtocol.PoseLifetime;
        }

        public double[] ObserverPosition(DateTimeOffset now) {
            lock (_poseLock) {
                if (_pose is null || now - _lastValidMessageAt > PresenceProtocol.PoseLifetime)
                    return Identity.SpawnOrigin;
                return [
                    _pose.Position[0] + Identity.SpawnOrigin[0],
                    _pose.Position[1] + Identity.SpawnOrigin[1],
                    _pose.Position[2] + Identity.SpawnOrigin[2]
                ];
            }
        }

        public PlayerSnapshot? Snapshot(DateTimeOffset now) {
            lock (_poseLock) {
                if (_pose is null || now - _lastValidMessageAt > PresenceProtocol.PoseLifetime)
                    return null;
                double[] position = [
                    _pose.Position[0] + Identity.SpawnOrigin[0],
                    _pose.Position[1] + Identity.SpawnOrigin[1],
                    _pose.Position[2] + Identity.SpawnOrigin[2]
                ];
                return new PlayerSnapshot(
                    Identity.PlayerId, Identity.Callsign, _pose.Sequence, _pose.Tick,
                    _pose.MissionId, _pose.PresentationId, _pose.Phase, _pose.Alive,
                    position, _pose.Forward, _pose.Up,
                    _pose.EntityId, StreamId, _pose.BodyPresent, _pose.TerminalState,
                    _pose.ImpactSurface,
                    Identity.SectorIndex, "client-presence", false);
            }
        }

        public async Task SendAsync<T>(T message, JsonSerializerOptions json,
            CancellationToken cancellationToken) =>
            await SendBytesAsync(JsonSerializer.SerializeToUtf8Bytes(message, json), cancellationToken);

        public async Task SendBytesAsync(byte[] payload, CancellationToken cancellationToken) {
            await _sendLock.WaitAsync(cancellationToken);
            try {
                if (Socket.State == WebSocketState.Open)
                    await Socket.SendAsync(payload.AsMemory(), WebSocketMessageType.Text,
                        endOfMessage: true, cancellationToken);
            } finally {
                _sendLock.Release();
            }
        }

        public async Task CloseQuietlyAsync(
            WebSocketCloseStatus status = WebSocketCloseStatus.NormalClosure,
            string reason = "Leaving room") {
            if (Interlocked.Exchange(ref _closed, 1) != 0) return;
            try {
                if (Socket.State is WebSocketState.Open or WebSocketState.CloseReceived)
                    await Socket.CloseOutputAsync(status, reason,
                        CancellationToken.None);
            } catch {
                // The peer commonly disappears without a closing handshake.
            } finally {
                Socket.Dispose();
                _sendLock.Dispose();
            }
        }
    }
}

public sealed class RoomBroadcastService(GlobalRoom room) : BackgroundService {
    protected override async Task ExecuteAsync(CancellationToken stoppingToken) {
        using var timer = new PeriodicTimer(
            TimeSpan.FromSeconds(1.0 / PresenceProtocol.BroadcastHz));
        while (await timer.WaitForNextTickAsync(stoppingToken))
            await room.BroadcastSnapshotAsync(stoppingToken);
    }
}
