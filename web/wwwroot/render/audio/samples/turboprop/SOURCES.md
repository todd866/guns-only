# Turboprop sample beds (production)

## Fire Boss machinery bed — single-engine PT6 public-domain surrogate

`pt6_single_engine_public_domain_loop.wav` is an **audio-only gameplay surrogate** conditioned
from DVIDS [U-28 Draco B-Roll Stringer](https://www.dvidshub.net/video/875554/u-28-draco-b-roll-stringer).
The U-28 is a PC-12-family, single-engine PT6 installation. It is not an AT-802F recording and the
shipped loop makes no installation-specific Fire Boss acoustic claim.

- Creator: A1C Alexis Sandoval / 27th Special Operations Wing.
- Taken: 2023-03-06; VIRIN `230306-F-VD069-1003`; DOD ID `DOD_109494649`.
- Production interval: 18.0–22.2 seconds, exterior engine-running b-roll.
- Acquired source object: `https://d34w7g4gy10iej.cloudfront.net/video/2303/DOD_109494649/DOD_109494649.mp4`.
- Acquired source SHA-256:
  `8633ac1ddbd8019a31b6459f87b888f16dd5eac2767f0ff9b2578c37987b4613`.
- Final WAV: 403,278 bytes; 48 kHz mono PCM16; 4.2 seconds; mean −27.2 dBFS,
  maximum −11.2 dBFS; SHA-256
  `1e1685e2b3c09fde200c4ada58741ae27be1676ec48b82da373d5a5995860507`.

The production conditioning high-passes at 320 Hz and low-passes at 7 kHz. That retains real PT6
machinery texture while removing the donor propeller's low orders: runtime's separately governed
five-blade layer is the only authority for the Fire Boss's 1,700 RPM / 141.67 Hz blade-pass cadence.

The DVIDS item page explicitly marks the work **PUBLIC DOMAIN**, subject to the
[DVIDS copyright notice](https://www.dvidshub.net/about/copyright). The source-derived WAV is not
relicensed under this repository's MIT license. No source visuals, logos, or marks are distributed.
This is a reasonable safe-use assessment, not a legal warranty.

> The appearance of U.S. Department of War (DoW) visual information does not imply or constitute DoW endorsement.

Silent-frame, waveform and spectrum screening found no obvious speech in the selected interval.
The exact Fire Boss cockpit reference used for spectral comparison was
[AT-802 FIRE BOSS SCOOPING PILOT VIEW](https://www.youtube.com/watch?v=h1XTbipnVjs); no YouTube PCM
is shipped.
