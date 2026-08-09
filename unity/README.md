# Guns Only — Unity F-22 fork

Native **standalone Mac app** (not the Unity Editor). Deterministic sim stays in
`GunsOnly.Sim`; the player talks to a sidecar `GunsOnly.UnityHost` over localhost TCP.

## Play on this computer

```sh
# from the unity-f22-fork worktree
./bin/play-unity
```

That script fail-closes through `./bin/unity-check`, starts the host, proves a live pose
frame, then opens `artifacts/unity-mac/GunsOnly.app`.

Controls: arrows pitch/roll, A/D yaw, W/S throttle, F guns.

## Proof gate (no Play Mode, no “trust me”)

```sh
./bin/unity-check     # unit + TCP loopback + host smoke + artifact checks
./bin/unity-build     # rebuild host + Mac .app, then runs unity-check
```

`unity-check` must print `UNITY_CHECK_OK` or it exits non-zero.

## Layout

| Path | Role |
| --- | --- |
| `GunsOnly.UnityBridge` | session facade + wire codec |
| `GunsOnly.UnityHost` | real-time TCP sim server |
| `GunsOnly.Unity` | Unity project (player client) |
| `artifacts/unity-mac/GunsOnly.app` | built player |
| `artifacts/unity-mac/host/` | self-contained host sidecar |
