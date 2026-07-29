using System;

namespace GunsOnly.Sim;

/// <summary>Which automatic checklist is currently running. Ordinal values ride the snapshot.</summary>
public enum MissionChecklistId { None = 0, Launch = 1, Commit = 2, Recovery = 3 }

/// <summary>
/// Per-tick truth the checklist director observes. Assembled by SimulationSession from
/// authoritative subsystem state, mirroring MissionRadioState — the director never reads
/// the session directly.
/// </summary>
public readonly record struct MissionChecklistState(
    double TimeSeconds,
    bool MissionActive,
    bool RapierMissionAvailable,
    RapierMissionPhase RapierPhase,
    bool CatapultStroke,
    bool SystemsSimulated,
    bool AllGearUp,
    bool AllGearDown,
    bool FlapsUp,
    bool FlapsLanding,
    bool WeaponsAuthorized);

/// <summary>
/// The panel-facing checklist snapshot. CompletedCall carries an item's narration token for
/// exactly the tick it completes ("" otherwise) so MissionRadio can voice the milestone.
/// </summary>
public readonly record struct MissionChecklistStatus(
    bool Active,
    MissionChecklistId Id,
    string Name,
    int Done,
    int Total,
    string NextItem,
    string CompletedCall) {
    public static MissionChecklistStatus None { get; } =
        new(false, MissionChecklistId.None, "", 0, 0, "", "");
}

/// <summary>
/// "The automation does it; the panel shows it." Checklists are data — a phase gate plus
/// ordered items whose predicates read sim truth — and the aircraft completes every item
/// itself at tick boundaries; nothing is ever handed to the player. Items complete strictly
/// in order (the loop stops at the first incomplete item) so "2/4 · next GEAR UP" is honest.
/// Initialize-then-diff shape mirrors MissionRadioDirector.
/// </summary>
public sealed class MissionChecklistDirector {
    readonly record struct Item(string Label, string CallToken,
        Func<MissionChecklistState, MissionChecklistDirector, bool> Complete);

    readonly record struct Definition(MissionChecklistId Id, string Name,
        Func<MissionChecklistState, bool> ActiveWhen, Item[] Items);

    static readonly Definition[] Definitions = [
        new(MissionChecklistId.Launch, "LAUNCH",
            state => state.RapierPhase == RapierMissionPhase.Launch,
            [
                new("CAT STROKE", "", (s, d) => d._strokeSeen |= s.CatapultStroke),
                new("AIRBORNE", "", (s, d) => d._strokeSeen && !s.CatapultStroke),
                new("GEAR UP", "LAUNCH_GEAR_UP",
                    (s, _) => s.SystemsSimulated && s.AllGearUp),
                new("FLAPS UP", "", (s, _) => s.SystemsSimulated && s.FlapsUp),
            ]),
        new(MissionChecklistId.Commit, "COMMIT",
            state => state.RapierPhase is RapierMissionPhase.Intercept
                or RapierMissionPhase.Attack,
            [
                new("COMMITTED", "", (s, _) => s.RapierPhase
                    is RapierMissionPhase.Intercept or RapierMissionPhase.Attack),
                new("WEAPONS AUTH", "", (s, _) => s.WeaponsAuthorized),
            ]),
        new(MissionChecklistId.Recovery, "RECOVERY",
            state => state.RapierPhase == RapierMissionPhase.Recovery,
            [
                new("GEAR DN LOCKED", "RECOVERY_GEAR_DOWN",
                    (s, _) => s.SystemsSimulated && s.AllGearDown),
                new("FLAPS LDG", "", (s, _) => s.SystemsSimulated && s.FlapsLanding),
            ]),
    ];

    // Later checklists never regress to earlier ones (Recovery does not fall back to
    // Commit when the phase machine wobbles back through Intercept).
    int _definitionIndex = -1;
    bool[] _done = [];
    bool _strokeSeen;

    public void Reset() {
        _definitionIndex = -1;
        _done = [];
        _strokeSeen = false;
    }

    public MissionChecklistStatus Step(in MissionChecklistState state) {
        if (!state.MissionActive || !state.RapierMissionAvailable)
            return _definitionIndex < 0 ? MissionChecklistStatus.None : Snapshot("");

        for (int index = Definitions.Length - 1; index > _definitionIndex; index--) {
            if (!Definitions[index].ActiveWhen(state)) continue;
            _definitionIndex = index;
            _done = new bool[Definitions[index].Items.Length];
            break;
        }
        if (_definitionIndex < 0) return MissionChecklistStatus.None;

        Definition definition = Definitions[_definitionIndex];
        string completedCall = "";
        for (int index = 0; index < definition.Items.Length; index++) {
            if (_done[index]) continue;
            if (!definition.Items[index].Complete(state, this)) break;
            _done[index] = true;
            if (definition.Items[index].CallToken.Length > 0)
                completedCall = definition.Items[index].CallToken;
        }
        return Snapshot(completedCall);
    }

    MissionChecklistStatus Snapshot(string completedCall) {
        Definition definition = Definitions[_definitionIndex];
        int done = 0;
        string nextItem = "";
        for (int index = 0; index < _done.Length; index++) {
            if (_done[index]) { done++; continue; }
            if (nextItem.Length == 0) nextItem = definition.Items[index].Label;
        }
        return new MissionChecklistStatus(
            true, definition.Id, definition.Name, done, _done.Length, nextItem,
            completedCall);
    }
}
