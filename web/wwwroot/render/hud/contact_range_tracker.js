const KNOTS_PER_MPS = 1.94384;
const MAX_SAMPLE_GAP_SECONDS = 0.5;

function nonEmpty(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

/// Identity of the opponent body represented by one HUD contact. The formation snapshot currently
/// publishes one primary entity id; the second body's slot is stable only inside that primary
/// lifecycle, so it receives an explicit suffix. When the primary lifecycle rotates, both keys
/// rotate and neither range-rate history can transfer to a replacement aircraft.
export function contactRangeIdentity(state, role) {
  const primary = nonEmpty(state?.bandit_entity_id);
  if (!primary) return null;
  if (role === "bandit" || role === "primary") return primary;
  if (role === "wingman") return `${primary}.wingman`;
  return null;
}

/// A player entity is one staged sortie. Mission and engagement make the reset explicit on older
/// snapshots whose host may reuse a player id while restaging or promoting formation slots.
export function contactRangeLifecycle(state) {
  return [
    nonEmpty(state?.player_entity_id) ?? "legacy-player",
    nonEmpty(state?.mission_definition_id) ?? "legacy-mission",
    Number.isFinite(Number(state?.engagement_number))
      ? Math.trunc(Number(state.engagement_number)) : "legacy-engagement",
  ].join("|");
}

export class ContactRangeTracker {
  constructor() {
    this._lifecycle = null;
    this._tracks = new Map();
  }

  reset() {
    this._lifecycle = null;
    this._tracks.clear();
  }

  update({ identity, lifecycle, position, playerPosition, nowSeconds }) {
    if (lifecycle !== this._lifecycle) {
      this._lifecycle = lifecycle;
      this._tracks.clear();
    }

    const stableIdentity = nonEmpty(identity);
    const now = Number(nowSeconds);
    const dx = Number(position?.x) - Number(playerPosition?.x);
    const dy = Number(position?.y) - Number(playerPosition?.y);
    const dz = Number(position?.z) - Number(playerPosition?.z);
    const rangeM = Math.hypot(dx, dy, dz);
    if (!stableIdentity || !Number.isFinite(now) || !Number.isFinite(rangeM)) {
      // Without identity, carrying a role-keyed sample would be worse than showing no closure: a
      // replacement in the same slot can otherwise inherit an arbitrary opening/closing rate.
      if (stableIdentity) this._tracks.delete(stableIdentity);
      return { rangeM: Number.isFinite(rangeM) ? rangeM : null, closureKts: null };
    }

    const previous = this._tracks.get(stableIdentity);
    if (previous && now === previous.now && rangeM === previous.rangeM) {
      // One contact can be painted in more than one HUD layer during the same animation frame.
      // Treat that as the same sample: a second read must not erase the closure the first layer
      // just calculated or make smoothing depend on draw order.
      return { rangeM, closureKts: previous.closureKts };
    }
    let closureKts = null;
    if (previous && now > previous.now
      && now - previous.now < MAX_SAMPLE_GAP_SECONDS) {
      const dt = now - previous.now;
      const rawKts = -((rangeM - previous.rangeM) / dt) * KNOTS_PER_MPS;
      closureKts = previous.closureKts == null
        ? rawKts : previous.closureKts * 0.8 + rawKts * 0.2;
    }
    this._tracks.set(stableIdentity, { rangeM, now, closureKts });
    return { rangeM, closureKts };
  }
}
