/// Which contact's bracket carries the range/closure data line.
///
/// The kernel's range_m and closure_kts follow the player's gun-target selection
/// (selected_player_gun_target_slot), so the line must ride the bracket of the jet those numbers
/// describe — numbers hovering beside a jet they no longer measure taught pilots the wrong range
/// in the 2v1. Slot 0, or an older kernel without the field, keeps the primary. Slot 1 moves the
/// line to the formation wingman's marker. Slots beyond 1 have no dedicated fight-HUD marker yet
/// and stay with the primary rather than vanishing.
export function targetDataLineOwner(state) {
  const slot = Number(state?.selected_player_gun_target_slot);
  return slot === 1 ? "wingman" : "primary";
}
