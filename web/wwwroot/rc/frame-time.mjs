// RAF may deliver a timestamp captured before synchronous startup finished.
// Never extrapolate camera damping backwards; long suspension remains capped.
export const frameSeconds = (now, previous) => Math.max(0, Math.min((now - previous) / 1000, 0.1));
