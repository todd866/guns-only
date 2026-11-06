// RAF may deliver a timestamp captured before synchronous startup finished.
// Never extrapolate camera damping backwards; long suspension remains capped.
export const frameSeconds = (now, previous) => Math.max(0, Math.min((now - previous) / 1000, 0.1));

// Held while shaders, textures, and the asset swap settle. A moving camera
// during that work is the opening stutter; zero blend keeps the establishing shot.
export const cameraGlide = (held, dt, rate) => (held ? 0 : 1 - Math.exp(-Math.max(0, dt) * rate));
