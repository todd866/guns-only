# Guns Only UE 5.8 Native Slice (`Path A`)

Native Unreal Engine 5.8 Mac + iOS vertical slice driven directly by the deterministic `GunsOnly.Sim` kernel (`sim/`) compiled with .NET 8 NativeAOT (`sim-native/`) over a pure C99 ABI (`guns_only_sim.h`).

## Layout

- `sim-native/`: `.NET 8` NativeAOT C ABI bridge (`libGunsOnlySim.dylib` on macOS, `libGunsOnlySim.a` on iOS `ios-arm64`) plus `tests/test_c_abi.c`.
- `ue/guns-only/`: Tracked UE 5.8 project descriptor, `.ini` config, C++ `GunsOnlyUE` runtime/automation module, and `bootstrap-ue.sh`.
- Working UE5 workspace on disk (outside iCloud & git): `/Users/iantodd/Projects/guns-only-ue`.

## Platform Scope (UE 5.8 Verified)

- **macOS (`Mac`):** Supported (`SF_METAL_SM6`, Lumen GI/Reflections, Volumetric Clouds, SkyAtmosphere, Virtual Shadow Maps, Xcode 27.2).
- **iOS (`IOS`):** Pre-wired in `DefaultEngine.ini` (`BundleIdentifier=com.iantodd.gunsonly`, `TeamID=U87MQBZKJ5`, Metal + static `libGunsOnlySim.a` with `GUNS_SIM_STATIC=1`). Packaging iOS directly from UE 5.8 requires installing UE 5.8's **iOS** target platform component in Epic Games Launcher (`/Users/Shared/Epic Games/UE_5.8/Engine/Intermediate/Build/IOS` is absent in the current Mac/VisionOS-only engine install). Use `ios/` (`GunsOnlyiOS`) for immediate App Store / iPhone device builds on Xcode 27.2.
- **tvOS:** Not supported by Unreal Engine 5.8 (`Engine/Platforms` omits `TVOS`).

## Commands

```sh
# 1. Build NativeAOT C ABI + run C test + sync files to /Users/iantodd/Projects/guns-only-ue
./ue/guns-only/bootstrap-ue.sh

# 2. Build UE 5.8 Editor & Standalone Game targets
heavy-slot -- "/Users/Shared/Epic Games/UE_5.8/Engine/Build/BatchFiles/Mac/Build.sh" \
  GunsOnlyUEEditor Mac Development -project="/Users/iantodd/Projects/guns-only-ue/GunsOnlyUE.uproject" -progress

heavy-slot -- "/Users/Shared/Epic Games/UE_5.8/Engine/Build/BatchFiles/Mac/Build.sh" \
  GunsOnlyUE Mac Development -project="/Users/iantodd/Projects/guns-only-ue/GunsOnlyUE.uproject" -progress

# 3. Run UE 5.8 Headless NativeBridge Automation Test
"/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor-Cmd" \
  "/Users/iantodd/Projects/guns-only-ue/GunsOnlyUE.uproject" \
  -ExecCmds="Automation RunTests GunsOnly.NativeBridge.FlightAndRtb; Quit" \
  -unattended -nop4 -nosplash -NullRHI -NoSound -TestExit="Automation Test Queue Empty"
```

## Controls

- **Stick / Flight:** `W`/`S` or `Up`/`Down` (pitch), `A`/`D` or `Left`/`Right` (roll), `Q`/`E` (rudder), Gamepad Left Stick + Right Stick yaw
- **Throttle:** `=` / `PageUp` and `-` / `PageDown` or Gamepad triggers
- **Gun:** `Space` or Gamepad Face Button Right (Circle / B)
- **RTB / Systems / View:** `O` (RTB overhead course), `G` (gear), `F` (flaps), `F2` / R3 (cockpit <-> chase camera), `R` (restart), `Esc` / `P` (pause)
