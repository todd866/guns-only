// AUTO-SYNC from airframes/rapier.v1.json
export default {
  "schema": "guns-only.airframe-definition.v1",
  "id": "rapier.public-data-surrogate.v1",
  "revision": "1.4.0",
  "displayName": "Rapier",
  "role": "dispersed TBCC interceptor",
  "presentationId": "presentation.vehicle.rapier.public-data-surrogate.v1",
  "flightModelBinding": "FlightModel.RapierPublicDataSurrogate",
  "epistemic": "surrogate",
  "frameConvention": "threejs-createRapier-v1",
  "sePackagePath": "docs/airframes/rapier/",
  "dimensionsM": {
    "length": 13,
    "span": 7.35,
    "height": 2.5
  },
  "wing": {
    "areaM2": 18,
    "aspectRatio": 3,
    "renderedSolidPlanformAreaM2": 24.3173,
    "bodyOverlapNonReferenceAreaM2": 6.3173,
    "thickness": 0.16,
    "bevel": 0.044,
    "planform": [
      [
        0,
        -3.8
      ],
      [
        -0.74,
        -3.1
      ],
      [
        -3.675,
        0.05
      ],
      [
        -3.48,
        0.92
      ],
      [
        -1.04,
        0.46
      ],
      [
        -0.72,
        3.5
      ],
      [
        0,
        4.05
      ],
      [
        0.72,
        3.5
      ],
      [
        1.04,
        0.46
      ],
      [
        3.48,
        0.92
      ],
      [
        3.675,
        0.05
      ],
      [
        0.74,
        -3.1
      ]
    ]
  },
  "aerodynamics": {
    "model": "rapier-cranked-delta-public-data-surrogate.v1",
    "epistemic": "surrogate",
    "clAlphaLowSpeedPerRad": 3.6,
    "clMaxLowSpeed": 1.35,
    "supersonicLiftSlopeCeiling": "4/sqrt(M^2-1)",
    "normalLawAlphaMachKnots": [0, 0.9, 1.05, 1.2, 1.6, 2, 2.5, 3.5, 4.5],
    "normalLawAlphaRadKnots": [0.42, 0.42, 0.36, 0.3, 0.24, 0.2, 0.16, 0.13, 0.11],
    "controlEffectivenessMachKnots": [0, 1, 1.65, 2.5, 3.5, 4.5],
    "controlEffectivenessKnots": [1, 1, 0.5, 0.36, 0.28, 0.22],
    "controlMomentCoefficientMax": {
      "pitchCm": 0.18,
      "yawCn": 0.055,
      "rollCl": 0.047
    },
    "landingElevonDroop": {
      "fullDegrees": 30,
      "deltaCl": 0.26,
      "deltaCd": 0.07,
      "deltaCm": -0.055,
      "rollAuthorityFraction": 0.55,
      "pitchAuthorityFraction": 0.68,
      "mechanicallyInterconnected": false
    },
    "inletRecovery": {
      "onsetMach": 2,
      "driver": "sqrt(alphaRad^2+betaRad^2)",
      "epistemic": "provisional surrogate; no unstart state"
    }
  },
  "fuselage": {
    "stations": [
      {
        "z": -6.5,
        "rx": 0.03,
        "ry": 0.03,
        "y": 0.03
      },
      {
        "z": -5.65,
        "rx": 0.34,
        "ry": 0.3,
        "y": 0.05
      },
      {
        "z": -3.6,
        "rx": 0.6,
        "ry": 0.52,
        "y": 0.08
      },
      {
        "z": -0.6,
        "rx": 0.76,
        "ry": 0.66,
        "y": 0.08
      },
      {
        "z": 2.9,
        "rx": 0.72,
        "ry": 0.6,
        "y": 0.06
      },
      {
        "z": 5.55,
        "rx": 0.48,
        "ry": 0.4,
        "y": 0.05
      },
      {
        "z": 6.5,
        "rx": 0.24,
        "ry": 0.22,
        "y": 0.04
      }
    ]
  },
  "escapePodSpine": {
    "stations": [
      {
        "z": -3.95,
        "rx": 0.12,
        "ry": 0.08,
        "y": 0.48
      },
      {
        "z": -2.75,
        "rx": 0.43,
        "ry": 0.3,
        "y": 0.56
      },
      {
        "z": -0.35,
        "rx": 0.48,
        "ry": 0.34,
        "y": 0.58
      },
      {
        "z": 1.05,
        "rx": 0.24,
        "ry": 0.16,
        "y": 0.48
      }
    ]
  },
  "propulsionTunnel": {
    "stations": [
      {
        "z": -3.68,
        "rx": 0.5,
        "ry": 0.34,
        "y": -0.2
      },
      {
        "z": -1.9,
        "rx": 0.58,
        "ry": 0.4,
        "y": -0.18
      },
      {
        "z": 4.9,
        "rx": 0.52,
        "ry": 0.36,
        "y": -0.14
      },
      {
        "z": 6.1,
        "rx": 0.34,
        "ry": 0.28,
        "y": -0.1
      }
    ]
  },
  "intake": {
    "innerR": 0.29,
    "outerR": 0.55,
    "scaleY": 0.72,
    "position": [
      0,
      -0.22,
      -3.72
    ]
  },
  "exhaust": {
    "radius": 0.34,
    "tube": 0.07,
    "position": [
      0,
      -0.1,
      6.12
    ]
  },
  "fins": [
    {
      "planform": [
        [
          2.2,
          0
        ],
        [
          5.72,
          0
        ],
        [
          5.1,
          1.82
        ],
        [
          4.24,
          2.22
        ],
        [
          3.15,
          0.28
        ]
      ],
      "thickness": 0.11,
      "sideX": 0.58,
      "y": 0.24,
      "rotZ": -0.08
    }
  ],
  "accents": [
    {
      "size": [
        0.18,
        0.035,
        1.55
      ],
      "position": [
        2.92,
        0.15,
        0.32
      ],
      "rotY": -0.16
    }
  ],
  "sockets": {
    "cockpitCamera": {
      "x": 0,
      "y": 0.62,
      "z": -2.2,
      "epistemic": "surrogate"
    },
    "muzzleLeft": {
      "x": -0.32,
      "y": -0.08,
      "z": -5.55,
      "epistemic": "surrogate"
    },
    "muzzleRight": {
      "x": 0.32,
      "y": -0.08,
      "z": -5.55,
      "epistemic": "surrogate"
    },
    "hook": {
      "x": 0,
      "y": -0.55,
      "z": 4.2,
      "epistemic": "provisional"
    },
    "droneBay": [
      {
        "x": -0.55,
        "y": -0.35,
        "z": 0.5,
        "epistemic": "provisional",
        "cellClearM": {
          "width": 1.0,
          "height": 0.55,
          "length": 1.1
        },
        "notes": "Preferred 2x2 belly trade; folded stow"
      },
      {
        "x": 0.55,
        "y": -0.35,
        "z": 0.5,
        "epistemic": "provisional",
        "cellClearM": {
          "width": 1.0,
          "height": 0.55,
          "length": 1.1
        },
        "notes": "Preferred 2x2 belly trade; folded stow"
      },
      {
        "x": -0.55,
        "y": -0.35,
        "z": 1.8,
        "epistemic": "provisional",
        "cellClearM": {
          "width": 1.0,
          "height": 0.55,
          "length": 1.1
        },
        "notes": "Preferred 2x2 belly trade; folded stow"
      },
      {
        "x": 0.55,
        "y": -0.35,
        "z": 1.8,
        "epistemic": "provisional",
        "cellClearM": {
          "width": 1.0,
          "height": 0.55,
          "length": 1.1
        },
        "notes": "Preferred 2x2 belly trade; folded stow"
      }
    ]
  },
  "materialZones": [
    {
      "id": "leadingEdges",
      "material": "cmc",
      "thermalClass": "hot"
    },
    {
      "id": "hotSectionFairing",
      "material": "cmc",
      "thermalClass": "hot"
    },
    {
      "id": "upperAirframe",
      "material": "composite",
      "thermalClass": "warm"
    },
    {
      "id": "lowerAirframe",
      "material": "composite",
      "thermalClass": "warm"
    },
    {
      "id": "sensorSpine",
      "material": "composite-opaque",
      "thermalClass": "warm"
    },
    {
      "id": "accentTips",
      "material": "paint",
      "thermalClass": "cool"
    }
  ],
  "palette": {
    "upper": "0x596b73",
    "lower": "0x26343a",
    "hot": "0x765244",
    "sensor": "0x11191d",
    "accent": "0xb85e32"
  },
  "massKg": {
    "fuelFreeAirframe": 5150,
    "designStowedGunDrones": 1440,
    "fuelFree": 6590,
    "fuelCapacity": 4500,
    "gross": 11090,
    "notes": "fuelFree/gross include design 4×360 kg gun-drone bay; session sheds as cells empty"
  },
  "propulsion": {
    "ramCaptureAreaM2": 1.2,
    "thrustMaxN": 84000,
    "maxThrustFraction": 1.55,
    "designMachNormaliser": 2.6,
    "epistemic": "provisional",
    "notes": "84 kN keeps aug T/W ≤1.20 at design gross; M4 dash still fiction — see REALISM-AND-OVERPERFORMANCE.md"
  },
  "thermal": {
    "skinTemperatureLimitK": 1473.15,
    "epistemic": "surrogate",
    "notes": "CMC materials freeze; lag taus for HUD skin are provisional"
  },
  "performanceClaims": {
    "designDashMach": {
      "value": 4.0,
      "epistemic": "fiction",
      "notes": "Mission branding; OFT peak ~M3.69"
    },
    "measuredOftPeakMach": {
      "value": 3.69,
      "epistemic": "measured",
      "notes": "analysis/intercept-oft energy-ladder"
    },
    "wetThrustWeightGross": {
      "value": 1.2,
      "epistemic": "closed",
      "notes": "84 kN × 1.55 / (11090 kg × g) ≈ 1.197; family cap 1.20"
    },
    "stowedDroneMassKg": {
      "value": 1440,
      "epistemic": "closed",
      "notes": "4 x RapierGunDroneSurrogate 360 kg; included in MassKg / FuelFreeMassKg; shed on release"
    }
  },
  "notes": "Geometry 1:1 from createRapier. Rev 1.4.0 captures the explicit cranked-delta aerodynamic/control/inlet surrogate; see docs/airframes/rapier/12-aerodynamics-and-controls.md.",
  "structure": {
    "epistemic": "provisional",
    "longerons": "four continuous U/L × L/R",
    "carryThroughZ": [
      -1.0,
      1.5
    ],
    "frameStationsZ": [
      -5.65,
      -3.6,
      -0.6,
      2.9,
      5.55,
      6.5
    ],
    "hookHardpointZ": 4.2,
    "notes": "See docs/airframes/rapier/blueprints/plate-11 and plate-00 BOM"
  },
  "buildPackage": "docs/airframes/rapier/blueprints/"
};
