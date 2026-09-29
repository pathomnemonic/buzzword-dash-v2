/**
 * skins.js — Track skin definitions
 *
 * Each skin defines:
 * - id: stable deterministic identifier for multiplayer skin selection
 * - name/desc: display info
 * - wallType: geometry style for side walls
 * - archType: geometry style for overhead structures
 * - groundType: visual style for the track floor
 * - particleType: floating atmospheric elements
 * - colors: complete color palette for the environment
 *
 * ARCHITECTURE CONTRACT (§23):
 * - Each skin has a stable `id` for deterministic selection.
 * - getRandomSkin() uses Math.random() for solo play.
 * - getSkinById() supports deterministic multiplayer selection.
 * - getSkinByName() supports legacy lookups.
 */

export var SKINS = [
  {
    id: 'skin_neural_highway',
    name: 'Neural Highway',
    desc: 'Race through neural pathways',
    wallType: 'organic_tubes',
    archType: 'synapse_arcs',
    groundType: 'myelin',
    particleType: 'sparks',
    colors: {
      bg: 0x08061e, sky: 0x0a0828,
      ground: 0x1a1050, groundStripe: 0x3020aa, groundAccent: 0x2818cc,
      wallA: 0x6622cc, wallB: 0x8844ff, wallGlow: 0xaa66ff,
      archMain: 0x4422aa, archGlow: 0xcc88ff,
      lane: 0x8844ff,
      gateBase: 0x3322aa, gateGlow: 0xbb66ff,
      particle: 0xccaaff, particleB: 0x8866dd,
      coin: 0xffdd44,
      ambient: 0x6644aa, hemiTop: 0x8866cc, hemiBot: 0x110022,
      dirLight: 0xaa88ee
    }
  },
  {
    id: 'skin_vascular_rush',
    name: 'Vascular Rush',
    desc: 'Sprint through the bloodstream',
    wallType: 'artery_walls',
    archType: 'capillary_branches',
    groundType: 'endothelium',
    particleType: 'blood_cells',
    colors: {
      bg: 0x140606, sky: 0x1a0808,
      ground: 0x300a0a, groundStripe: 0xaa2020, groundAccent: 0xcc3030,
      wallA: 0xcc2233, wallB: 0xff3344, wallGlow: 0xff5566,
      archMain: 0xaa1122, archGlow: 0xff6677,
      lane: 0xff3355,
      gateBase: 0x881122, gateGlow: 0xff4455,
      particle: 0xff6666, particleB: 0xdd4444,
      coin: 0xffee44,
      ambient: 0xcc4444, hemiTop: 0xff4466, hemiBot: 0x100000,
      dirLight: 0xff8888
    }
  },
  {
    id: 'skin_skeletal_corridor',
    name: 'Skeletal Corridor',
    desc: 'Race through a giant ribcage',
    wallType: 'bone_pillars',
    archType: 'rib_arches',
    groundType: 'cartilage',
    particleType: 'calcium_dust',
    colors: {
      bg: 0x0e0c0a, sky: 0x141210,
      ground: 0x201c18, groundStripe: 0x887766, groundAccent: 0xaa9988,
      wallA: 0xddccbb, wallB: 0xeeddcc, wallGlow: 0xffeedd,
      archMain: 0xccbbaa, archGlow: 0xffeecc,
      lane: 0xaa9988,
      gateBase: 0x776655, gateGlow: 0xddccaa,
      particle: 0xeeddcc, particleB: 0xccbbaa,
      coin: 0xffcc00,
      ambient: 0xddccbb, hemiTop: 0xeeddcc, hemiBot: 0x0a0808,
      dirLight: 0xffeedd
    }
  },
  {
    id: 'skin_cellular_matrix',
    name: 'Cellular Matrix',
    desc: 'Shrink inside a living cell',
    wallType: 'membrane',
    archType: 'organelle_bridges',
    groundType: 'cytoplasm',
    particleType: 'vesicles',
    colors: {
      bg: 0x031508, sky: 0x041a10,
      ground: 0x062818, groundStripe: 0x22aa55, groundAccent: 0x33cc66,
      wallA: 0x22cc66, wallB: 0x44ee88, wallGlow: 0x66ffaa,
      archMain: 0x118844, archGlow: 0x88ffbb,
      lane: 0x33dd66,
      gateBase: 0x116633, gateGlow: 0x66ff99,
      particle: 0x88ffcc, particleB: 0x44dd88,
      coin: 0xffdd00,
      ambient: 0x44cc77, hemiTop: 0x44dd66, hemiBot: 0x001a08,
      dirLight: 0x88ffaa
    }
  },
  {
    id: 'skin_neon_er',
    name: 'Neon ER',
    desc: 'Emergency room at midnight',
    wallType: 'hospital_panels',
    archType: 'fluorescent_bars',
    groundType: 'linoleum',
    particleType: 'dust_motes',
    colors: {
      bg: 0x060a14, sky: 0x080c18,
      ground: 0x101828, groundStripe: 0x2244aa, groundAccent: 0x3355cc,
      wallA: 0x1a2a60, wallB: 0x2a3a80, wallGlow: 0x4488ff,
      archMain: 0x223366, archGlow: 0x66aaff,
      lane: 0x3366cc,
      gateBase: 0x1a2a55, gateGlow: 0x4488ff,
      particle: 0x88bbff, particleB: 0x6699dd,
      coin: 0xffdd44,
      ambient: 0x4466aa, hemiTop: 0x4477cc, hemiBot: 0x000818,
      dirLight: 0x88aaff
    }
  },
  {
    id: 'skin_dna_helix_tunnel',
    name: 'DNA Helix Tunnel',
    desc: 'Spiral through the double helix',
    wallType: 'helix_strands',
    archType: 'base_pair_rungs',
    groundType: 'phosphate',
    particleType: 'nucleotides',
    colors: {
      bg: 0x030614, sky: 0x040818,
      ground: 0x081030, groundStripe: 0x2244cc, groundAccent: 0x3366ee,
      wallA: 0x4488ff, wallB: 0xff4488, wallGlow: 0x66aaff,
      archMain: 0x44ff88, archGlow: 0x88ffaa,
      lane: 0x3366ff,
      gateBase: 0x2244aa, gateGlow: 0x66bbff,
      particle: 0xaaddff, particleB: 0xff88cc,
      coin: 0xffee44,
      ambient: 0x4488cc, hemiTop: 0x4477ff, hemiBot: 0x000410,
      dirLight: 0x88bbff
    }
  },
  {
    id: 'skin_prescription_sunset',
    name: 'Prescription Sunset',
    desc: 'Warm pharmacy vibes',
    wallType: 'pill_shelves',
    archType: 'rx_signs',
    groundType: 'pharmacy_floor',
    particleType: 'capsule_bits',
    colors: {
      bg: 0x140a03, sky: 0x1a0c04,
      ground: 0x281808, groundStripe: 0xcc7722, groundAccent: 0xee9933,
      wallA: 0xff8833, wallB: 0xffaa55, wallGlow: 0xffcc77,
      archMain: 0xcc6622, archGlow: 0xffbb66,
      lane: 0xff9944,
      gateBase: 0x884422, gateGlow: 0xffaa44,
      particle: 0xffddaa, particleB: 0xffbb77,
      coin: 0x44ccff,
      ambient: 0xffaa66, hemiTop: 0xff9944, hemiBot: 0x0a0400,
      dirLight: 0xffcc88
    }
  },
  {
    id: 'skin_cardiac_pulse',
    name: 'Cardiac Pulse',
    desc: 'Inside a beating heart',
    wallType: 'muscle_fibers',
    archType: 'valve_leaflets',
    groundType: 'endocardium',
    particleType: 'platelets',
    colors: {
      bg: 0x12030c, sky: 0x1a0410,
      ground: 0x2a0818, groundStripe: 0xdd2255, groundAccent: 0xff3366,
      wallA: 0xcc2244, wallB: 0xee3366, wallGlow: 0xff5588,
      archMain: 0xaa1133, archGlow: 0xff77aa,
      lane: 0xff3366,
      gateBase: 0x881133, gateGlow: 0xff5577,
      particle: 0xff99bb, particleB: 0xdd6688,
      coin: 0xffee44,
      ambient: 0xcc4466, hemiTop: 0xff3366, hemiBot: 0x0a0004,
      dirLight: 0xff7799
    }
  },
  {
    id: 'skin_surgical_theater',
    name: 'Surgical Theater',
    desc: 'Under the bright OR lights',
    wallType: 'sterile_panels',
    archType: 'surgical_lamps',
    groundType: 'surgical_floor',
    particleType: 'sterile_sparkles',
    colors: {
      bg: 0x071012, sky: 0x0a1418,
      ground: 0x102028, groundStripe: 0x22aa88, groundAccent: 0x33ccaa,
      wallA: 0x00aa88, wallB: 0x22ccaa, wallGlow: 0x44eedd,
      archMain: 0x008866, archGlow: 0x66ffcc,
      lane: 0x22ccaa,
      gateBase: 0x006655, gateGlow: 0x44ddbb,
      particle: 0x88ffdd, particleB: 0x44ddaa,
      coin: 0xffdd44,
      ambient: 0x44aa88, hemiTop: 0x44ccaa, hemiBot: 0x000a08,
      dirLight: 0x88eedd
    }
  },
  {
    id: 'skin_candy_lab',
    name: 'Candy Lab',
    desc: 'Chemistry experiment gone wild',
    wallType: 'test_tubes',
    archType: 'bubble_arches',
    groundType: 'petri_dish',
    particleType: 'bubbles',
    colors: {
      bg: 0x0c0312, sky: 0x100418,
      ground: 0x1a0828, groundStripe: 0xcc44cc, groundAccent: 0xee66ee,
      wallA: 0xee55ee, wallB: 0xff77ff, wallGlow: 0xff99ff,
      archMain: 0xcc44cc, archGlow: 0xffaaff,
      lane: 0xdd55dd,
      gateBase: 0x993399, gateGlow: 0xff88ff,
      particle: 0xffccff, particleB: 0xdd88dd,
      coin: 0x44ffaa,
      ambient: 0xcc66cc, hemiTop: 0xee66ee, hemiBot: 0x080008,
      dirLight: 0xff99ff
    }
  },
  {
    id: 'skin_xray_vision',
    name: 'X-Ray Vision',
    desc: 'See through everything',
    wallType: 'skeletal_xray',
    archType: 'scan_frames',
    groundType: 'lightbox',
    particleType: 'photons',
    colors: {
      bg: 0x000810, sky: 0x000a14,
      ground: 0x041420, groundStripe: 0x0088bb, groundAccent: 0x00aadd,
      wallA: 0x00aadd, wallB: 0x22ccee, wallGlow: 0x44eeff,
      archMain: 0x0088aa, archGlow: 0x66ffff,
      lane: 0x00bbdd,
      gateBase: 0x006688, gateGlow: 0x44ddff,
      particle: 0x88ffff, particleB: 0x44ccee,
      coin: 0xffaa33,
      ambient: 0x44aacc, hemiTop: 0x22ccee, hemiBot: 0x000408,
      dirLight: 0x88eeff
    }
  },
  {
    id: 'skin_defibrillator_shock',
    name: 'Defibrillator Shock',
    desc: 'Electric urgency',
    wallType: 'circuit_panels',
    archType: 'tesla_arcs',
    groundType: 'conductor_grid',
    particleType: 'electric_arcs',
    colors: {
      bg: 0x100e03, sky: 0x141204,
      ground: 0x201c08, groundStripe: 0xccaa22, groundAccent: 0xeecc33,
      wallA: 0xddbb22, wallB: 0xffdd44, wallGlow: 0xffee66,
      archMain: 0xaaaa11, archGlow: 0xffff88,
      lane: 0xeedd33,
      gateBase: 0x887711, gateGlow: 0xffdd44,
      particle: 0xffff99, particleB: 0xdddd66,
      coin: 0xff4444,
      ambient: 0xddcc44, hemiTop: 0xffdd44, hemiBot: 0x0a0800,
      dirLight: 0xffee88
    }
  }
];

/**
 * Pick a random skin from the available pool.
 * Called at the start of each solo run.
 */
export function getRandomSkin() {
  return SKINS[Math.floor(Math.random() * SKINS.length)];
}

/**
 * Get a specific skin by name (legacy support).
 * @param {string} name
 * @returns {object}
 */
export function getSkinByName(name) {
  for (var i = 0; i < SKINS.length; i++) {
    if (SKINS[i].name === name) return SKINS[i];
  }
  return SKINS[0];
}

/**
 * Get a specific skin by stable ID.
 * Used for deterministic multiplayer skin selection.
 * @param {string} skinId
 * @returns {object}
 */
export function getSkinById(skinId) {
  for (var i = 0; i < SKINS.length; i++) {
    if (SKINS[i].id === skinId) return SKINS[i];
  }
  return SKINS[0];
}

/**
 * Get all skin IDs (for multiplayer skin selection).
 * @returns {string[]}
 */
export function getAllSkinIds() {
  return SKINS.map(function (s) { return s.id; });
}
