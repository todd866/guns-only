const DEFAULT_PLAYER_PRESENTATION_ID = "presentation.vehicle.player.v1";

const cleanIdentifier = (value, maximumLength, fallback = "") => {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maximumLength);
  return cleaned || fallback;
};

const scopePart = (value, fallback) => cleanIdentifier(String(value ?? ""), 256, fallback);
const keyPart = (value, fallback) => {
  const cleaned = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned || fallback;
};

/**
 * Allocation policy for one untrusted remote-aircraft presentation slot.
 *
 * Entity identity is retained for continuity diagnostics, but deliberately cannot influence an
 * asset instance key. Descriptor failures are scoped only to pack/profile/presentation, so an
 * invalid peer value is tried once instead of throwing again whenever the peer rotates entityId.
 */
export class RemoteAssetResolutionPolicy {
  constructor(presentationId, entityId) {
    this.presentationId = cleanIdentifier(
      presentationId, 128, DEFAULT_PLAYER_PRESENTATION_ID,
    );
    this.entityId = cleanIdentifier(entityId, 128) || null;
    this.failedDescriptorKey = "";
  }

  update(presentationId, entityId) {
    const nextPresentationId = cleanIdentifier(
      presentationId, 128, DEFAULT_PLAYER_PRESENTATION_ID,
    );
    const nextEntityId = cleanIdentifier(entityId, 128) || null;
    const presentationChanged = nextPresentationId !== this.presentationId;
    if (presentationChanged) {
      this.presentationId = nextPresentationId;
      this.failedDescriptorKey = "";
    }
    this.entityId = nextEntityId;
    return Object.freeze({
      presentationChanged,
      presentationId: this.presentationId,
      entityId: this.entityId,
    });
  }

  descriptorFailureKey({ packId, profileId }) {
    return [
      "descriptor",
      scopePart(packId, "pack.unknown"),
      scopePart(profileId, "profile.unknown"),
      this.presentationId,
    ].join(":");
  }

  shouldAttemptDescriptor(scope) {
    return this.failedDescriptorKey !== this.descriptorFailureKey(scope);
  }

  rememberDescriptorFailure(scope) {
    this.failedDescriptorKey = this.descriptorFailureKey(scope);
  }

  resetDescriptorFailure() {
    this.failedDescriptorKey = "";
  }

  registryInstanceKey({ packId, profileId }, assetIdentity) {
    return [
      "registry",
      scopePart(packId, "pack.unknown"),
      scopePart(profileId, "profile.unknown"),
      this.presentationId,
      "shared-presentation",
      keyPart(assetIdentity, "asset.unresolved"),
    ].join(":");
  }
}
