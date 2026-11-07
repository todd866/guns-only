// Couch play (the TV, a pad, someone else using the laptop): blur is not pause.
// The browser drops the Gamepad list the moment the window is unfocused, so couch mode
// sticks once a pad has been seen and clears only when the last pad actually disconnects.
// Keyboard-only play still pauses on blur and when the page is hidden.

const connectedCount = pads => (pads ?? []).filter(pad => pad?.connected).length;

export function createCouchPause() {
  let couch = false;
  return {
    get couch() {
      return couch;
    },
    see(pads) {
      if (connectedCount(pads) > 0) couch = true;
    },
    blur() {
      return couch ? 'keep' : 'pause';
    },
    hide() {
      return couch ? 'keep' : 'pause';
    },
    lostPad(pads) {
      if (!couch || connectedCount(pads) > 0) return 'keep';
      couch = false;
      return 'pause';
    }
  };
}
