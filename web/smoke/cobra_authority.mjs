// Shared read seams for the published Cobra Hold the Bridge route, used by BOTH halves of the
// Cobra smoke coverage: the boot/designation half that gates the release (smoke.test.mjs) and the
// full crew-chain half that does not (cobra-crew-chain.test.mjs). One copy so the two can never
// drift onto different surfaces or a different build query string.
//
// Build 265 replaced the Cobra's DOM text strip with the production F-22 combiner plus the
// rotorcraft extras, both painted to #hud-canvas -- so ammo, target and gun status are pixels, not
// textContent. The truth behind those pixels comes from the two seams the play HUD itself draws
// from: the authority snapshot (window.__gunsOnlyCobraAuthority) and the SAME production model
// function main.js hands the painter, imported here from the published bundle.

export const COBRA_ROUTE = "cobra-lab/index.html?audioQa=silent";

export const COBRA_CHROMIUM_ARGS = Object.freeze([
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
]);

/**
 * Wait for the published route to reach a live authority: the status card reports ready AND the
 * QA snapshot carries a vehicle. Wall budgets here are backstops against a genuine hang, not
 * semantic limits -- see the sizing note in smoke.test.mjs.
 */
export async function waitForCobraAuthority(page, timeoutMs) {
  await page.waitForFunction(
    () => document.querySelector("#status")?.dataset.ready === "true"
      && !!window.__gunsOnlyCobraAuthority?.vehicle,
    undefined,
    { timeout: timeoutMs },
  );
}

/** One read of everything the play HUD is drawing from, through the production model function. */
export function readCobraHud(page) {
  return page.evaluate(async () => {
    const { cobraRotorcraftHudModel } =
      await import("/render/cobra/cobra_rotorcraft_hud.js?v=296");
    const state = window.__gunsOnlyCobraAuthority ?? null;
    const canvas = document.querySelector("#hud-canvas");
    return {
      status: document.querySelector("#status span")?.textContent ?? "",
      model: cobraRotorcraftHudModel(state),
      gunner: state?.gunner ?? null,
      ammo: state?.ground_war?.ammo_remaining ?? null,
      ammoCapacity: state?.ground_war?.ammo_capacity ?? null,
      hostiles: (state?.ground_war?.units ?? [])
        .filter((unit) => unit.alive && unit.faction === "hostile").length,
      // The ground war's OWN mission clock. Everything the gun engagement depends on -- which
      // hostiles are alive, where they are, whether one is inside the turret envelope -- moves on
      // this clock, never on the test's wall clock.
      elapsedS: state?.ground_war?.debrief?.elapsed_s ?? null,
      tick: state?.vehicle?.tick ?? -1,
      canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
    };
  });
}

/**
 * Press Tab and wait for the authority to acknowledge THIS mark, not merely to hold some mark:
 * the designation is pushed to the bridge on the next rendered frame, so a read taken before that
 * frame reports the previous target's reason chain.
 */
export async function designateNextHostile(page, timeoutMs) {
  await page.keyboard.press("Tab");
  await page.waitForFunction(
    () => {
      const chosen = document.querySelector("#target")?.value ?? "";
      return chosen !== ""
        && window.__gunsOnlyCobraAuthority?.gunner?.selected_target_id === chosen;
    },
    undefined,
    { timeout: timeoutMs },
  );
}
