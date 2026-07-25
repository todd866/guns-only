namespace GunsOnly.Sim.Doctrine;

/// <summary>
/// An opponent beyond the primary. The session keeps its single primary bandit exactly as before —
/// every HUD cue, padlock, range readout and engagement report follows that one — and carries any
/// additional aircraft here, each flying its own controller and shooting its own gun at the player.
///
/// Why this shape rather than a general formation object: the kernel had 92 references to a single
/// `_bandit`, all of which are correct for "the aircraft the pilot is currently fighting". Turning
/// that into a collection in one step would have rewritten the whole session to gain nothing a
/// primary-plus-others split does not already give. Adding aircraft is a list append; the primary
/// is re-elected when it dies, so the pilot's cues always track a live threat.
///
/// Damage is the one thing that genuinely must be shared: two shooters put rounds into ONE player,
/// so hits are pooled by the session rather than each gun independently deciding it has killed
/// them (see SimulationSession.PlayerHitsTaken).
/// </summary>
public sealed class Wingman {
    public Wingman(IBandit bandit, GunKill gun, PilotSkill skill) {
        Bandit = bandit ?? throw new System.ArgumentNullException(nameof(bandit));
        Gun = gun ?? throw new System.ArgumentNullException(nameof(gun));
        Skill = skill;
    }

    public IBandit Bandit { get; }
    public GunKill Gun { get; }
    public PilotSkill Skill { get; }
    /// Latched once this aircraft is out of the fight, so a dead wingman stops being stepped as a
    /// combatant while its wreck is still falling.
    public bool Defeated { get; set; }
    public bool TriggerDown { get; set; }

    public bool StillFighting => !Defeated && !Bandit.CatastrophicallyDamaged;
}
