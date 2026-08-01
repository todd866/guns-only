export function indoorActionPolicy(snapshot) {
  const survey = snapshot?.survey ?? null;
  const stealthMandatory = survey?.doctrine === "stealth-mandatory";
  const scansComplete = survey?.objectives?.scan?.complete === true;
  const returning = survey?.returnRequested === true;
  const fiberAttached = snapshot?.link?.mode === "fiber";

  return Object.freeze({
    stealthMandatory,
    scansComplete,
    returning,
    canDetach: fiberAttached && !stealthMandatory,
    canBroadcast: Boolean(survey) && !fiberAttached && !returning && !stealthMandatory,
    canFire: !fiberAttached && !stealthMandatory,
    canReturn: Boolean(survey) && scansComplete && !returning,
  });
}

export function indoorBlockedActionMessage(action, policy) {
  if (policy?.stealthMandatory && ["detach", "broadcast", "fire"].includes(action)) {
    return "Stealth profile: keep the fibre attached and weapons silent. Complete the survey, then return dark.";
  }
  if (action === "return" && !policy?.scansComplete) {
    return "Return is locked until every marked room has been surveyed.";
  }
  if (action === "broadcast") return "Broadcast requires a detached radio link.";
  if (action === "fire") return "Guns remain safe while the optical fibre is attached.";
  if (action === "detach") return "The fibre is already detached.";
  return "That action is not available in the current mission phase.";
}
