/**
 * hazards.js — per-map environmental hazards.
 *
 * Each track has a signature hazard that strikes now and then during solo
 * runs. Most are visual set pieces (drawn with CSS on the canvas); the surge
 * also speeds the track up and the quake shakes the camera. Hazards never
 * change which answer is correct.
 *
 * They are skipped for seeded and competitive modes (fairness), and when the
 * player prefers reduced motion. Flicker rates stay under 3 Hz.
 */

export var HAZARD_BY_SKIN = {
  'Neural Highway': 'blackout',
  'Vascular Rush': 'pulse',
  'Skeletal Corridor': 'quake',
  'Cellular Matrix': 'fog',
  'Neon ER': 'surge',
  'Hospital Hallway': 'surge',
  'Operating Room': 'blackout',
  'Research Lab': 'glitch',
  'Ambulance Bay': 'flare',
  'DNA Helix Tunnel': 'fog',
  'Prescription Sunset': 'flare',
  'Cardiac Pulse': 'pulse',
  'Surgical Theater': 'blackout',
  'Candy Lab': 'glitch',
  'X-Ray Vision': 'glitch',
  'Defibrillator Shock': 'surge',
  // the bright maps only ever get the gentle ones: a speed surge or a bright flare
  'Pediatric Playland': 'surge',
  'Sunshine Rehab Garden': 'flare',
  'Cafeteria Carnival': 'surge',
  'Neonatal Cloud Nursery': 'flare',
  'Anatomy Amusement Park': 'surge',
  'Pharmacy Pop Factory': 'glitch',
  'Aquarium Imaging Center': 'pulse',
  'Rooftop Helipad Resort': 'flare',
  'Vet and Farm Clinic': 'surge',
  'Holiday Wards': 'flare'
};

export var HAZARDS = {
  blackout: { label: 'Neural blackout!', duration: 3.0, speed: 1.0 },
  pulse: { label: 'Pulse wave!', duration: 3.5, speed: 1.0 },
  quake: { label: 'Tremor!', duration: 2.5, speed: 1.0 },
  fog: { label: 'Dense fog!', duration: 3.5, speed: 1.0 },
  surge: { label: 'Speed surge!', duration: 3.0, speed: 1.25 },
  flare: { label: 'Solar flare!', duration: 2.5, speed: 1.0 },
  glitch: { label: 'Signal glitch!', duration: 3.0, speed: 1.0 }
};

var START_CHANCE = 0.3;
var COOLDOWN_SECONDS = 14;
var MIN_ENCOUNTERS = 3;

export class HazardManager {
  constructor() {
    this.reset();
  }

  reset() {
    this.type = null;
    this.timer = 0;
    this.cooldown = COOLDOWN_SECONDS / 2;
    this._shakeClock = 0;
    this._beat = 0;
  }

  /**
   * Maybe start a hazard as a new encounter spawns.
   * @param {string} skinName
   * @param {number} encountersDone
   * @param {function(): number} [rng]
   * @returns {string|null} the hazard type if one started
   */
  maybeStart(skinName, encountersDone, rng) {
    if (this.type || this.cooldown > 0 || encountersDone < MIN_ENCOUNTERS) return null;
    var kind = HAZARD_BY_SKIN[skinName];
    if (!kind) return null;
    if ((rng || Math.random)() > START_CHANCE) return null;
    this.type = kind;
    this.timer = HAZARDS[kind].duration;
    this._shakeClock = 0;
    this._beat = 0;
    return kind;
  }

  /**
   * Advance the active hazard.
   * @param {number} dt seconds
   * @returns {{type: string|null, speedMult: number, fovKick: number, shake: boolean, ended: boolean}}
   */
  update(dt) {
    var fx = { type: this.type, speedMult: 1, fovKick: 0, shake: false, ended: false };
    if (this.cooldown > 0) this.cooldown -= dt;
    if (!this.type) return fx;

    this.timer -= dt;
    var def = HAZARDS[this.type];
    fx.speedMult = def.speed;

    if (this.type === 'quake') {
      this._shakeClock += dt;
      if (this._shakeClock >= 0.25) { this._shakeClock = 0; fx.shake = true; }
    } else if (this.type === 'pulse') {
      this._beat += dt;
      if (this._beat >= 0.6) { this._beat = 0; fx.fovKick = 4; }
    } else if (this.type === 'surge') {
      fx.fovKick = 5;
    }

    if (this.timer <= 0) {
      fx.ended = true;
      this.type = null;
      this.cooldown = COOLDOWN_SECONDS;
    }
    return fx;
  }
}
