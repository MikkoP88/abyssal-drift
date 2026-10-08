// ============================================================================
// config.js — Central tuning table.
// Everything gameplay/art-directorial lives here so it can be lifted into
// Unreal as UDataAsset / UDeveloperSettings structs almost 1:1.
// Units: meters, seconds, radians where noted.
// ============================================================================

export const CONFIG = {
  // ---- World -------------------------------------------------------------
  world: {
    seaLevel: 0.0,          // y of calm water plane
    mapRadius: 900,         // playable radius (m)
    fogDensityDay: 0.0016,
    fogDensityNight: 0.0026,
    fogColorDay: 0xbfd4dd,
    fogColorNight: 0x0a1420,
    fogColorStorm: 0x3a4650,
  },

  // ---- Time / weather ----------------------------------------------------
  time: {
    dayLengthSec: 420,      // full day->night cycle
    startHour: 7.5,         // begin at dawn
    sunIntensityDay: 3.2,
    sunIntensityNight: 0.25,
    ambientDay: 0.55,
    ambientNight: 0.18,
  },

  weather: {
    stormChance: 0.22,
    stormDurationMin: 45,
    stormDurationMax: 120,
    rainIntensityStorm: 1.0,
  },

  // ---- Ocean -------------------------------------------------------------
  ocean: {
    tileSize: 2400,         // size of the tiled water quad (m)
    segments: 220,          // vertex grid resolution
    waveHeight: 1.15,       // base swell amplitude
    chop: 0.35,              // high-frequency chop amplitude
    speed: 1.15,             // wave phase speed
    deepColor: 0x052e42,     // deep water albedo
    shallowColor: 0x147086, // shallow / trough albedo
    foamThreshold: 0.55,     // crest foam factor
    reflectionStrength: 0.85,
  },

  // ---- Boat --------------------------------------------------------------
  boat: {
    maxSpeed: 16.0,         // m/s at full throttle
    accel: 6.5,              // m/s^2
    drag: 1.4,               // linear drag coefficient
    turnRate: 1.15,          // rad/s at full rudder
    boostMultiplier: 1.6,
    bobAmplitude: 0.55,      // heave from waves (m)
    rollFactor: 0.35,        // roll from lateral wave slope
    pitchFactor: 0.28,       // pitch from fore/aft wave slope
    fuelBurnBase: 0.15,       // %/sec idle
    fuelBurnThrottle: 0.9,    // %/sec at full throttle fraction
    fuelCapacity: 100,
  },

  // ---- Player ------------------------------------------------------------
  player: {
    eyeHeight: 1.75,         // camera height above deck pivot
    lookSensitivity: 0.0022,
    maxHealth: 100,
    maxStamina: 100,
    staminaDrainReel: 9.0,   // %/sec while reeling hard
    staminaRegen: 14.0,       // %/sec resting
    healthRegen: 1.5,        // %/sec when safe
    strikeDamageMin: 8,
    strikeDamageMax: 22,
  },

  // ---- Fishing -----------------------------------------------------------
  fishing: {
    castDistanceMin: 8,
    castDistanceMax: 46,
    lineBreakTension: 1.0,   // normalized tension that snaps line
    tensionRiseReel: 0.9,    // tension/sec while reeling under load
    tensionDecayIdle: 0.7,   // tension/sec while letting out line
    catchFillRate: 0.16,      // catch-meter/sec while tension in sweet spot
    sweetSpotLow: 0.45,
    sweetSpotHigh: 0.85,
    biteWaitMin: 4,
    biteWaitMax: 14,
    fightDurationMin: 6,
    fightDurationMax: 16,
    reelClickHz: 18,
  },

  // ---- Fish catalogue ----------------------------------------------------
  // Each species is a data record; geometry is generated procedurally in
  // fish.js from these params (size, palette, fin ratios, aggression).
  fish: {
    species: [
      {
        id: 'gulper', name: 'Abyssal Gulper', rarity: 0.34,
        length: 9, girth: 2.2, hue: 0x2b4a55, belly: 0x9fb8bd,
        speed: 3.2, aggression: 0.45, weightKg: [320, 640],
        teeth: true, glowEyes: 0x9fe8ff, depthBand: [6, 40],
        desc: 'A bottom-feeder with a jaw that unhinges.',
      },
      {
        id: 'serpent', name: 'Pale Serpent Eel', rarity: 0.26,
        length: 16, girth: 1.3, hue: 0xcfd8cf, belly: 0xf2efe4,
        speed: 4.6, aggression: 0.7, weightKg: [180, 420],
        teeth: true, glowEyes: 0xfff2b0, depthBand: [4, 30],
        desc: 'Long, sinuous, and deceptively fast.',
      },
      {
        id: 'leviathan', name: 'Leviathan Ray', rarity: 0.22,
        length: 13, girth: 3.4, hue: 0x3a3f52, belly: 0xd8d2c4,
        speed: 2.6, aggression: 0.35, weightKg: [900, 1800],
        teeth: false, glowEyes: 0xffd27a, depthBand: [8, 55],
        desc: 'A winged shadow that banks beneath the keel.',
      },
      {
        id: 'kraken', name: 'Deep Kraken', rarity: 0.12,
        length: 22, girth: 4.2, hue: 0x5a2b3a, belly: 0x8a6f7a,
        speed: 3.8, aggression: 0.95, weightKg: [2400, 5200],
        teeth: true, glowEyes: 0xff5a6a, depthBand: [18, 90],
        desc: 'Legend says it drags boats down. Legend is right.',
      },
      {
        id: 'aurora', name: 'Aurora Whale', rarity: 0.06,
        length: 34, girth: 6.5, hue: 0x1f6f87, belly: 0xeaf4f4,
        speed: 2.2, aggression: 0.2, weightKg: [9000, 16000],
        teeth: false, glowEyes: 0xaef3ff, depthBand: [30, 120],
        desc: 'A living aurora. Rare beyond measure.',
      },
    ],
    populationCap: 26,
    respawnDelayMin: 20,
    respawnDelayMax: 45,
  },

  // ---- Camera / rendering ------------------------------------------------
  render: {
    fov: 62,
    near: 0.1,
    far: 4000,
    toneMappingExposure: 1.05,
    antialias: true,
    pixelRatioCap: 2,
  },

  // ---- Audio -------------------------------------------------------------
  audio: {
    masterVolume: 0.8,
    oceanNoiseGain: 0.35,
    windGain: 0.12,
    engineGainBase: 0.05,
    engineGainFull: 0.4,
  },
};

export default CONFIG;
