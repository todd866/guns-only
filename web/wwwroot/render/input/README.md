# Player-action contract

`tests/player_action_contract.test.mjs` is the release gate for the things a player can ask the
game to do. It follows each advertised action across four boundaries:

1. the key or button is named in help or visible UI;
2. the browser dispatches the correct press/release lifecycle;
3. the numeric WebAssembly key agrees with the C# `GKey` ordinal and has a real consumer; and
4. the result is visible in authoritative browser state or is an explicit presentation action.

The test also inventories every `<button>` in the flying shell. New buttons must use exactly one
auditable hook (`data-hold-key`, `data-pulse-key`, `data-test-action`, `data-mobile-action`, or an
explicitly tested element ID). A hold must have pointer-up, cancellation, focus-loss, and page-hide
release paths. A pulse must emit one down edge and one up edge; OS key repeat cannot retrigger it.

Run the focused gate with:

```sh
node --test web/wwwroot/render/input/tests/player_action_contract.test.mjs
```

It is also included by the renderer-wide `render/**/tests/*.test.mjs` suite. A control is not done
when it merely appears on screen: if its dispatch or observable effect disappears, this gate fails.
