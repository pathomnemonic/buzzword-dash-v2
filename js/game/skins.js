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
    desc: 'A bubblegum brain-wave speedway with waving neurons',
    world: 'neural',
    wallType: 'world',
    archType: 'world',
    groundType: 'world',
    particleType: 'sparks',
    fog: { near: 55, far: 150 },
    light: { ambient: 0.9, hemi: 0.85, dir: 0.8 },
    colors: {
      bg: 0xd9c8ff, sky: 0xc9b7ff,
      ground: 0x6a50e0, groundStripe: 0xff6bd6, groundAccent: 0x9a80ff,
      wallA: 0xcdbdff, wallB: 0xff6bd6, wallGlow: 0x35e0d0,
      archMain: 0xffffff, archGlow: 0xff6bd6,
      lane: 0xffffff,
      gateBase: 0x3b2fd0, gateGlow: 0xff6bd6,
      particle: 0xffffff, particleB: 0xcdbdff,
      coin: 0xffcc22,
      ambient: 0xffffff, hemiTop: 0xf1e8ff, hemiBot: 0xb9a6f0,
      dirLight: 0xfff0ff
    }
  },
  {
    id: 'skin_vascular_rush',
    name: 'Vascular Rush',
    desc: 'A splash-park slide through the bloodstream',
    world: 'vascular',
    wallType: 'world',
    archType: 'world',
    groundType: 'world',
    particleType: 'blood_cells',
    fog: { near: 55, far: 150 },
    light: { ambient: 0.9, hemi: 0.85, dir: 0.8 },
    colors: {
      bg: 0xffc2cc, sky: 0xffc2cc,
      ground: 0xff7d8c, groundStripe: 0x35d6e8, groundAccent: 0xffa0ac,
      wallA: 0xff9aa6, wallB: 0x35d6e8, wallGlow: 0xffffff,
      archMain: 0xffffff, archGlow: 0xff4a5e,
      lane: 0xffffff,
      gateBase: 0x2a5fe0, gateGlow: 0xffd23f,
      particle: 0xffffff, particleB: 0xffd0d8,
      coin: 0xffcc22,
      ambient: 0xffffff, hemiTop: 0xfff0f2, hemiBot: 0xe58a98,
      dirLight: 0xfff6f0
    }
  },
  {
    id: 'skin_skeletal_corridor',
    name: 'Skeletal Corridor',
    desc: 'A spooky-fun skeleton dance party under a giant ribcage',
    world: 'skeletal',
    wallType: 'world',
    archType: 'world',
    groundType: 'world',
    particleType: 'calcium_dust',
    fog: { near: 55, far: 150 },
    light: { ambient: 0.9, hemi: 0.85, dir: 0.8 },
    colors: {
      bg: 0xc9a8ff, sky: 0xc9a8ff,
      ground: 0x4a2490, groundStripe: 0xff8a1f, groundAccent: 0x8a52e0,
      wallA: 0x7a3fd0, wallB: 0xff8a1f, wallGlow: 0x8dea3a,
      archMain: 0xffffff, archGlow: 0xff8a1f,
      lane: 0xffe14a,
      gateBase: 0x2a1a80, gateGlow: 0xff8a1f,
      particle: 0xffffff, particleB: 0xe0c8ff,
      coin: 0xffcc22,
      ambient: 0xffffff, hemiTop: 0xf0e4ff, hemiBot: 0x9a7ad0,
      dirLight: 0xfff0ff
    }
  },
  {
    id: 'skin_cellular_matrix',
    name: 'Cellular Matrix',
    desc: 'A jelly-bright playground inside a living cell',
    world: 'cellular',
    wallType: 'world',
    archType: 'world',
    groundType: 'world',
    particleType: 'vesicles',
    fog: { near: 55, far: 150 },
    light: { ambient: 0.9, hemi: 0.85, dir: 0.8 },
    colors: {
      bg: 0xc4f7d8, sky: 0xc4f7d8,
      ground: 0x46d68a, groundStripe: 0xff7ac8, groundAccent: 0x7af0a8,
      wallA: 0x9af5cf, wallB: 0xff7ac8, wallGlow: 0xffe14a,
      archMain: 0xffffff, archGlow: 0xff7ac8,
      lane: 0xffffff,
      gateBase: 0x5a2fc0, gateGlow: 0xffe14a,
      particle: 0xffffff, particleB: 0xd8fff0,
      coin: 0xffcc22,
      ambient: 0xffffff, hemiTop: 0xeafff2, hemiBot: 0x8fd8b0,
      dirLight: 0xfffff0
    }
  },
  {
    id: 'skin_neon_er',
    name: 'Neon ER',
    desc: 'An all-night neon diner of an emergency room',
    world: 'neoner',
    wallType: 'world',
    archType: 'world',
    groundType: 'world',
    particleType: 'dust_motes',
    fog: { near: 55, far: 150 },
    light: { ambient: 0.9, hemi: 0.85, dir: 0.8 },
    colors: {
      bg: 0xbdf6f0, sky: 0xbdf6f0,
      ground: 0x2a2a3e, groundStripe: 0xff3d9a, groundAccent: 0x22e6d8,
      wallA: 0xbdf6f0, wallB: 0xff3d9a, wallGlow: 0x22e6d8,
      archMain: 0xffffff, archGlow: 0xff3d9a,
      lane: 0xff3d9a,
      gateBase: 0x1f3fb8, gateGlow: 0xffe14a,
      particle: 0xffffff, particleB: 0xaafff7,
      coin: 0xffcc22,
      ambient: 0xffffff, hemiTop: 0xe8fffc, hemiBot: 0x8fd8d2,
      dirLight: 0xfff6ff
    }
  },
  {
    id: 'skin_dna_helix_tunnel',
    name: 'DNA Helix Tunnel',
    desc: 'A candy-coloured carnival hall with giant double helixes turning on the walls',
    world: 'dna',
    wallType: 'world',
    archType: 'world',
    groundType: 'world',
    particleType: 'nucleotides',
    fog: { near: 55, far: 150 },
    light: { ambient: 0.9, hemi: 0.85, dir: 0.8 },
    colors: {
      bg: 0xe4d8ff, sky: 0xe4d8ff,
      ground: 0xf2ecff, groundStripe: 0x8a5cf6, groundAccent: 0xd9ccff,
      wallA: 0xd9ccff, wallB: 0xff6bb5, wallGlow: 0x4fb8ff,
      archMain: 0xffffff, archGlow: 0x8a5cf6,
      lane: 0xffffff,
      gateBase: 0x3a2fc0, gateGlow: 0xffe14a,
      particle: 0xffffff, particleB: 0xe0d4ff,
      coin: 0xffcc22,
      ambient: 0xffffff, hemiTop: 0xf4efff, hemiBot: 0xb8a8e8,
      dirLight: 0xffffff
    }
  },
  {
    id: 'skin_prescription_sunset',
    name: 'Prescription Sunset',
    desc: 'Golden hour on a beach boardwalk: lighthouse, surf shack and ice pops',
    world: 'sunset',
    wallType: 'world',
    archType: 'world',
    groundType: 'world',
    particleType: 'capsule_bits',
    fog: { near: 60, far: 160 },
    light: { ambient: 0.8, hemi: 0.8, dir: 0.95 },
    fixedSky: true,
    sky: { top: 0x5a3fc0, horizon: 0xff9055, sun: 0xffd27a, sunX: -0.9, sunY: 0.16 },
    colors: {
      bg: 0xffa876, sky: 0xffa876,
      ground: 0xf3d49c, groundStripe: 0xff8a3d, groundAccent: 0xe6aa6a,
      wallA: 0xffd6b8, wallB: 0xff8a3d, wallGlow: 0xffd23f,
      archMain: 0xffffff, archGlow: 0xffb347,
      lane: 0xffffff,
      gateBase: 0x6a2fd0, gateGlow: 0xffd23f,
      particle: 0xfff0c0, particleB: 0xffd0a0,
      coin: 0xffcc22,
      ambient: 0xffffff, hemiTop: 0xffe0b8, hemiBot: 0xd9a070,
      dirLight: 0xffd9a0
    }
  },
  {
    id: 'skin_cardiac_pulse',
    name: 'Cardiac Pulse',
    desc: 'A valentine carnival inside a very happy, thumping heart',
    world: 'cardiac',
    wallType: 'world',
    archType: 'world',
    groundType: 'world',
    particleType: 'blood_cells',
    fog: { near: 55, far: 150 },
    light: { ambient: 0.9, hemi: 0.85, dir: 0.8 },
    colors: {
      bg: 0xffc6d8, sky: 0xffc6d8,
      ground: 0xfff0f5, groundStripe: 0xff3d5e, groundAccent: 0xffc2d6,
      wallA: 0xffc2d6, wallB: 0xff3d5e, wallGlow: 0xffd23f,
      archMain: 0xffffff, archGlow: 0xff3d5e,
      lane: 0xffffff,
      gateBase: 0x2a4fd0, gateGlow: 0xffd23f,
      particle: 0xffffff, particleB: 0xffd0e0,
      coin: 0xffcc22,
      ambient: 0xffffff, hemiTop: 0xfff2f6, hemiBot: 0xe8a0b8,
      dirLight: 0xfff4f4
    }
  },
  {
    id: 'skin_hospital_hallway',
    name: 'Hospital Hallway',
    desc: 'Sprint down the ward corridor',
    wallType: 'hospital_hall',
    archType: 'hall_signs',
    groundType: 'hall_floor',
    particleType: 'dust_motes',
    colors: {
      bg: 0xbcd6dc, sky: 0xcfe4e8,
      ground: 0x9fb4bb, groundStripe: 0x6f858c, groundAccent: 0x8aa0a5,
      wallA: 0xe9f1f0, wallB: 0x2a8f9a, wallGlow: 0x7fd8e6,
      archMain: 0xdde7ea, archGlow: 0xffffff,
      lane: 0x5aa9b8,
      gateBase: 0x1d6f7a, gateGlow: 0x5ff0ff,
      particle: 0xffffff, particleB: 0xcfe9ef,
      coin: 0xffcc22,
      ambient: 0xcfe6ea, hemiTop: 0xe8f6f8, hemiBot: 0x6f858c,
      dirLight: 0xffffff
    }
  },
  {
    id: 'skin_operating_room',
    name: 'Operating Room',
    desc: 'Scrubbed in and running',
    wallType: 'room_or',
    archType: 'or_lamps',
    groundType: 'or_floor',
    particleType: 'dust_motes',
    colors: {
      bg: 0xa9d6cc, sky: 0xc4e8e0,
      ground: 0x7fb5aa, groundStripe: 0x4f8f84, groundAccent: 0x6fa59a,
      wallA: 0xcdeee6, wallB: 0x2fa48f, wallGlow: 0x7fe8d4,
      archMain: 0xdcefea, archGlow: 0xffffff,
      lane: 0x4fb8a5,
      gateBase: 0x136b5c, gateGlow: 0x5ffff0,
      particle: 0xffffff, particleB: 0xcfeee8,
      coin: 0xffcc22,
      ambient: 0xd0f0ea, hemiTop: 0xeafaf6, hemiBot: 0x6f9f96,
      dirLight: 0xffffff
    }
  },
  {
    id: 'skin_research_lab',
    name: 'Research Lab',
    desc: 'Between the benches',
    wallType: 'room_lab',
    archType: 'lab_pipes',
    groundType: 'lab_floor',
    particleType: 'dust_motes',
    colors: {
      bg: 0xb9c6d6, sky: 0xd0dae6,
      ground: 0x5d6b7c, groundStripe: 0x3a4658, groundAccent: 0x4a586b,
      wallA: 0xe8eef4, wallB: 0x4a6fa5, wallGlow: 0x8fb8ff,
      archMain: 0xdfe6ee, archGlow: 0xffffff,
      lane: 0x6f8fc0,
      gateBase: 0x24427a, gateGlow: 0x7fb0ff,
      particle: 0xffffff, particleB: 0xd6e4f6,
      coin: 0xffcc22,
      ambient: 0xd6e2f2, hemiTop: 0xeef4fb, hemiBot: 0x6b7a90,
      dirLight: 0xffffff
    }
  },
  {
    id: 'skin_ambulance_bay',
    name: 'Ambulance Bay',
    desc: 'Sirens and sliding doors',
    wallType: 'room_bay',
    archType: 'bay_lights',
    groundType: 'bay_floor',
    particleType: 'dust_motes',
    colors: {
      bg: 0x3b4a60, sky: 0x2a3548,
      ground: 0x3c4450, groundStripe: 0x59636b, groundAccent: 0x4a525c,
      wallA: 0xb8bfc7, wallB: 0xc0392b, wallGlow: 0xff7a6a,
      archMain: 0x59636b, archGlow: 0xfff6c8,
      lane: 0x8a96a3,
      gateBase: 0x7a1f18, gateGlow: 0xff6a5a,
      particle: 0xdde6f0, particleB: 0xaebccc,
      coin: 0xffcc22,
      ambient: 0x9fb0c6, hemiTop: 0xc6d6ea, hemiBot: 0x2a3340,
      dirLight: 0xfff0d0
    }
  },
  {
    id: 'skin_surgical_theater',
    name: 'Surgical Theater',
    desc: 'The big show: velvet curtains, spotlights and a standing ovation',
    world: 'theater',
    wallType: 'world',
    archType: 'world',
    groundType: 'world',
    particleType: 'dust_motes',
    fog: { near: 55, far: 150 },
    light: { ambient: 0.9, hemi: 0.85, dir: 0.8 },
    colors: {
      bg: 0xffe2c8, sky: 0xffe2c8,
      ground: 0xb3122f, groundStripe: 0xffc83d, groundAccent: 0xe0264d,
      wallA: 0x8f0e2c, wallB: 0xffc83d, wallGlow: 0xffc83d,
      archMain: 0xffffff, archGlow: 0xffc83d,
      lane: 0xffc83d,
      gateBase: 0x1f3fb8, gateGlow: 0xffc83d,
      particle: 0xfff0a0, particleB: 0xffe0c0,
      coin: 0xffcc22,
      ambient: 0xffffff, hemiTop: 0xfff2e6, hemiBot: 0xcf8a7a,
      dirLight: 0xfff2d8
    }
  },
  {
    id: 'skin_candy_lab',
    name: 'Candy Lab',
    desc: 'A sweet-shop laboratory where every experiment is sugar',
    world: 'candylab',
    wallType: 'world',
    archType: 'world',
    groundType: 'world',
    particleType: 'capsule_bits',
    fog: { near: 55, far: 150 },
    light: { ambient: 0.9, hemi: 0.85, dir: 0.8 },
    colors: {
      bg: 0xffdcee, sky: 0xffdcee,
      ground: 0xfff3fa, groundStripe: 0xff6aa8, groundAccent: 0xc9f5e4,
      wallA: 0xffc2e0, wallB: 0xff6aa8, wallGlow: 0x7ff0c6,
      archMain: 0xffffff, archGlow: 0xff6aa8,
      lane: 0xff6aa8,
      gateBase: 0x7a3bd0, gateGlow: 0xffee7a,
      particle: 0xffffff, particleB: 0xffd0e8,
      coin: 0xffcc22,
      ambient: 0xffffff, hemiTop: 0xfff4fa, hemiBot: 0xe8b0c8,
      dirLight: 0xffffff
    }
  },
  {
    id: 'skin_xray_vision',
    name: 'X-Ray Vision',
    desc: 'A glowing radiology disco where every skeleton is having a great time',
    world: 'xray',
    wallType: 'world',
    archType: 'world',
    groundType: 'world',
    particleType: 'calcium_dust',
    fog: { near: 55, far: 150 },
    light: { ambient: 0.9, hemi: 0.85, dir: 0.8 },
    colors: {
      bg: 0xcfeeff, sky: 0xcfeeff,
      ground: 0xeefaff, groundStripe: 0x2f7bff, groundAccent: 0xcdefff,
      wallA: 0xb8ecff, wallB: 0x2f7bff, wallGlow: 0x39e6ff,
      archMain: 0xffffff, archGlow: 0xff5fc0,
      lane: 0xffffff,
      gateBase: 0x1a3fa0, gateGlow: 0x39e6ff,
      particle: 0xffffff, particleB: 0xd0f0ff,
      coin: 0xffcc22,
      ambient: 0xffffff, hemiTop: 0xeaf8ff, hemiBot: 0x9ac8e8,
      dirLight: 0xffffff
    }
  },
  {
    id: 'skin_pediatric_playland',
    name: 'Pediatric Playland',
    desc: 'A giant playroom in the children\'s ward',
    world: 'playland',
    wallType: 'world',
    archType: 'world',
    groundType: 'world',
    particleType: 'bubbles',
    fog: { near: 55, far: 150 },
    light: { ambient: 0.9, hemi: 0.85, dir: 0.85 },
    colors: {
      bg: 0xcfeaff, sky: 0x9ed8ff,
      ground: 0xdff0ff, groundStripe: 0x9ecbff, groundAccent: 0xb5d8ff,
      wallA: 0xfff3dc, wallB: 0xff7ab8, wallGlow: 0xffd23f,
      archMain: 0xffffff, archGlow: 0xffd23f,
      lane: 0x5aa0ff,
      gateBase: 0x3d6fe0, gateGlow: 0xff7ab8,
      particle: 0xffffff, particleB: 0xbfe6ff,
      coin: 0xffcc22,
      ambient: 0xffffff, hemiTop: 0xeaf6ff, hemiBot: 0xcfd8f0,
      dirLight: 0xfff6e0
    }
  },
  {
    id: 'skin_sunshine_rehab_garden',
    name: 'Sunshine Rehab Garden',
    desc: 'A sunny walk through the therapy garden',
    world: 'garden',
    wallType: 'world',
    archType: 'world',
    groundType: 'world',
    particleType: 'dust_motes',
    fog: { near: 60, far: 160 },
    light: { ambient: 0.8, hemi: 0.8, dir: 1.0 },
    sky: { top: 0x1f86ee, horizon: 0xbfe6ff, sun: 0xfff2c0 },
    colors: {
      bg: 0xcdeeff, sky: 0x2f9bf0,
      ground: 0xe9d3ac, groundStripe: 0xd9c08f, groundAccent: 0xe0c99c,
      wallA: 0x2fae58, wallB: 0xffd23f, wallGlow: 0xfff2a0,
      archMain: 0x3fbf5a, archGlow: 0xffffff,
      lane: 0xffffff,
      gateBase: 0x2f7fe0, gateGlow: 0xffd23f,
      particle: 0xffffff, particleB: 0xfff2a0,
      coin: 0xffcc22,
      ambient: 0xffffff, hemiTop: 0xcfeaff, hemiBot: 0x9fe0a0,
      dirLight: 0xfff4d6
    }
  },
  {
    id: 'skin_cafeteria_carnival',
    name: 'Cafeteria Carnival',
    desc: 'Fair day in the hospital canteen',
    world: 'cafeteria',
    wallType: 'world',
    archType: 'world',
    groundType: 'world',
    particleType: 'sparks',
    fog: { near: 55, far: 150 },
    light: { ambient: 0.9, hemi: 0.85, dir: 0.85 },
    colors: {
      bg: 0xffe9c8, sky: 0xffe9c8,
      ground: 0xfff1de, groundStripe: 0xff7a6b, groundAccent: 0xffd9a0,
      wallA: 0xfff6e2, wallB: 0x20c4b0, wallGlow: 0xffd23f,
      archMain: 0xff4d4d, archGlow: 0xffd23f,
      lane: 0xff4d4d,
      gateBase: 0x1f8fa8, gateGlow: 0xffd23f,
      particle: 0xfff2a0, particleB: 0xffd0a0,
      coin: 0xffcc22,
      ambient: 0xfff4e0, hemiTop: 0xfff6e8, hemiBot: 0xf0c8a0,
      dirLight: 0xfff0d0
    }
  },
  {
    id: 'skin_neonatal_cloud_nursery',
    name: 'Neonatal Cloud Nursery',
    desc: 'A pastel nursery floating on clouds',
    world: 'nursery',
    wallType: 'world',
    archType: 'world',
    groundType: 'world',
    particleType: 'bubbles',
    fog: { near: 70, far: 170 },
    light: { ambient: 0.6, hemi: 0.7, dir: 0.7 },
    sky: { top: 0x6a9cff, horizon: 0xffc8e2, sun: 0xffd6ec },
    colors: {
      bg: 0xffcfe6, sky: 0x6a9cff,
      ground: 0xfff0f6, groundStripe: 0xffb3d1, groundAccent: 0xd6ecff,
      wallA: 0xffffff, wallB: 0xffb3d1, wallGlow: 0xffd6ec,
      archMain: 0xffffff, archGlow: 0xffe9a0,
      lane: 0xffffff,
      gateBase: 0x6a5be0, gateGlow: 0xffb3d1,
      particle: 0xffffff, particleB: 0xd6ecff,
      coin: 0xffcc22,
      ambient: 0xfff6fa, hemiTop: 0xeaf4ff, hemiBot: 0xffd6ec,
      dirLight: 0xfff0e0
    }
  },
  {
    id: 'skin_anatomy_amusement_park',
    name: 'Anatomy Amusement Park',
    desc: 'Rides shaped like the human body',
    world: 'amusement',
    wallType: 'world',
    archType: 'world',
    groundType: 'world',
    particleType: 'sparks',
    fog: { near: 60, far: 160 },
    light: { ambient: 0.75, hemi: 0.8, dir: 1.0 },
    sky: { top: 0x1f86ee, horizon: 0xb8e4ff, sun: 0xfff2c0 },
    colors: {
      bg: 0xb8e4ff, sky: 0x1f86ee,
      ground: 0xf1d3a0, groundStripe: 0xe8c78e, groundAccent: 0xf4daae,
      wallA: 0xff4d6a, wallB: 0xffd23f, wallGlow: 0xfff2a0,
      archMain: 0xff4d6a, archGlow: 0xffd23f,
      lane: 0xff4d6a,
      gateBase: 0x5a3fd0, gateGlow: 0xffd23f,
      particle: 0xfff2a0, particleB: 0xffb3d1,
      coin: 0xffcc22,
      ambient: 0xffffff, hemiTop: 0xcfeaff, hemiBot: 0xf0d8b0,
      dirLight: 0xfff4d6
    }
  },
  {
    id: 'skin_pharmacy_pop_factory',
    name: 'Pharmacy Pop Factory',
    desc: 'Giant capsules roll off the candy-coloured line',
    world: 'pharmacy',
    wallType: 'world',
    archType: 'world',
    groundType: 'world',
    particleType: 'capsule_bits',
    fog: { near: 55, far: 150 },
    light: { ambient: 0.75, hemi: 0.75, dir: 0.85 },
    colors: {
      bg: 0xcdeeff, sky: 0xcdeeff,
      ground: 0xeaf6ff, groundStripe: 0xffd23f, groundAccent: 0xd4ecff,
      wallA: 0xf4fbff, wallB: 0xff6fae, wallGlow: 0x4fb8ff,
      archMain: 0xffffff, archGlow: 0xff6fae,
      lane: 0xff6fae,
      gateBase: 0x2a6fd0, gateGlow: 0xff6fae,
      particle: 0xffffff, particleB: 0xffd0e8,
      coin: 0xffcc22,
      ambient: 0xffffff, hemiTop: 0xf4fbff, hemiBot: 0xc8e0f0,
      dirLight: 0xffffff
    }
  },
  {
    id: 'skin_aquarium_imaging_center',
    name: 'Aquarium Imaging Center',
    desc: 'A glass tunnel under a sunlit reef',
    world: 'aquarium',
    wallType: 'world',
    archType: 'world',
    groundType: 'world',
    particleType: 'bubbles',
    fog: { near: 50, far: 140 },
    light: { ambient: 0.65, hemi: 0.65, dir: 0.75 },
    colors: {
      bg: 0x5fd0f0, sky: 0x5fd0f0,
      ground: 0xf6e6bf, groundStripe: 0x1fb4d8, groundAccent: 0xf0dcae,
      wallA: 0x1fb4d8, wallB: 0x4fe0c0, wallGlow: 0x9af0ff,
      archMain: 0xdfe8f2, archGlow: 0xffe27a,
      lane: 0x1fb4d8,
      gateBase: 0x1a4fa8, gateGlow: 0xffe27a,
      particle: 0xffffff, particleB: 0x9af0ff,
      coin: 0xffcc22,
      ambient: 0xe0f8ff, hemiTop: 0xcff6ff, hemiBot: 0x7fcfe8,
      dirLight: 0xffffff
    }
  },
  {
    id: 'skin_rooftop_helipad_resort',
    name: 'Rooftop Helipad Resort',
    desc: 'A sun deck above the city skyline',
    world: 'rooftop',
    wallType: 'world',
    archType: 'world',
    groundType: 'world',
    particleType: 'dust_motes',
    fog: { near: 70, far: 180 },
    light: { ambient: 0.7, hemi: 0.8, dir: 1.0 },
    sky: { top: 0x2a8ff0, horizon: 0xcfeaff, sun: 0xffe9a0, sunX: -0.5, sunY: 0.4 },
    colors: {
      bg: 0xcfeaff, sky: 0x2a8ff0,
      ground: 0xd9a566, groundStripe: 0xe2b073, groundAccent: 0xdcaa68,
      wallA: 0xcff4ff, wallB: 0x2fd0d8, wallGlow: 0xffe9a0,
      archMain: 0xe8eef6, archGlow: 0xffe27a,
      lane: 0xffffff,
      gateBase: 0x2a5fd0, gateGlow: 0xffe27a,
      particle: 0xffffff, particleB: 0xfff0a8,
      coin: 0xffcc22,
      ambient: 0xffffff, hemiTop: 0xcfeaff, hemiBot: 0xf0d8b0,
      dirLight: 0xfff0d0
    }
  },
  {
    id: 'skin_vet_and_farm_clinic',
    name: 'Vet and Farm Clinic',
    desc: 'A country clinic full of friendly animals',
    world: 'farm',
    wallType: 'world',
    archType: 'world',
    groundType: 'world',
    particleType: 'dust_motes',
    fog: { near: 60, far: 160 },
    light: { ambient: 0.75, hemi: 0.8, dir: 1.0 },
    sky: { top: 0x2a8ff0, horizon: 0xcdeeff, sun: 0xfff2c0 },
    colors: {
      bg: 0xcdeeff, sky: 0x2a8ff0,
      ground: 0xe0b878, groundStripe: 0xd0a463, groundAccent: 0xecc98d,
      wallA: 0xffffff, wallB: 0xd9382f, wallGlow: 0xfff2a0,
      archMain: 0xd9382f, archGlow: 0xffd23f,
      lane: 0xffffff,
      gateBase: 0x2f6fd0, gateGlow: 0xffd23f,
      particle: 0xfff2a0, particleB: 0xffffff,
      coin: 0xffcc22,
      ambient: 0xffffff, hemiTop: 0xcfeaff, hemiBot: 0x9fe08a,
      dirLight: 0xfff4d6
    }
  },
  {
    id: 'skin_holiday_wards',
    name: 'Holiday Wards',
    desc: 'Decorated for the season: snow, blossoms, beaches, pumpkins or a party',
    world: 'holiday',
    wallType: 'world',
    archType: 'world',
    groundType: 'world',
    particleType: 'sparks',
    fog: { near: 60, far: 160 },
    light: { ambient: 0.85, hemi: 0.85, dir: 0.9 },
    sky: { top: 0x4aa8f0, horizon: 0xdff0ff, sun: 0xfff2c0 },
    colors: {
      bg: 0xdff0ff, sky: 0x4aa8f0,
      ground: 0xffe9f4, groundStripe: 0xb89aff, groundAccent: 0xd9e8ff,
      wallA: 0xffffff, wallB: 0xff5a8a, wallGlow: 0xffd23f,
      archMain: 0xff5a8a, archGlow: 0xffd23f,
      lane: 0xff5a8a,
      gateBase: 0x3a5fd0, gateGlow: 0xffd23f,
      particle: 0xffffff, particleB: 0xffd0e8,
      coin: 0xffcc22,
      ambient: 0xffffff, hemiTop: 0xeaf4ff, hemiBot: 0xf0e0f0,
      dirLight: 0xfff4e0
    }
  },
  {
    id: 'skin_defibrillator_shock',
    name: 'Defibrillator Shock',
    desc: 'An electric amusement park: Tesla coils, bumper cars and a very friendly CLEAR!',
    world: 'defib',
    wallType: 'world',
    archType: 'world',
    groundType: 'world',
    particleType: 'sparks',
    fog: { near: 55, far: 150 },
    light: { ambient: 0.9, hemi: 0.85, dir: 0.8 },
    colors: {
      bg: 0xfff0a0, sky: 0xfff0a0,
      ground: 0xbcd6ee, groundStripe: 0x2f9bff, groundAccent: 0x8fb0d0,
      wallA: 0xffe14a, wallB: 0x2f9bff, wallGlow: 0xffe14a,
      archMain: 0xffffff, archGlow: 0x2f9bff,
      lane: 0xffffff,
      gateBase: 0x1a3fa0, gateGlow: 0xffe14a,
      particle: 0xffffff, particleB: 0xfff4b0,
      coin: 0xffcc22,
      ambient: 0xffffff, hemiTop: 0xfffbe0, hemiBot: 0xd8c060,
      dirLight: 0xffffff
    }
  }
];

/**
 * Maps set in real hospital rooms  are "indoor"; the open and
 * body-interior worlds are "outdoor". A run starts indoors, then moves outdoors, then is random.
 */
var INDOOR_IDS = [
  'skin_hospital_hallway', 'skin_operating_room', 'skin_research_lab',
  'skin_ambulance_bay'
];

export function isIndoorSkin(skin) {
  return !!skin && INDOOR_IDS.indexOf(skin.id) >= 0;
}

/** The Locker item that unlocks a map ("skin_cardiac_pulse" -> "map_cardiac_pulse"). */
export function mapItemId(skin) {
  return 'map_' + String(skin && skin.id || '').replace(/^skin_/, '');
}

/** Indoor maps are free for everyone; every other map has to be bought in the Locker. */
export function isMapUnlocked(skin, ownsItem) {
  return isIndoorSkin(skin) || !!(ownsItem && ownsItem(mapItemId(skin)));
}

function pickFrom(list, rand) {
  var r = rand || Math.random;
  return list[Math.floor(r() * list.length) % list.length];
}

/** The map a run opens on: one of the indoor maps, at random. */
export function getStartSkin(rand) {
  return pickFrom(SKINS.filter(isIndoorSkin), rand);
}

/**
 * The map after a transition. The first change of a run goes outdoors; after that it is any map but
 * the current one.
 * @param {object} current the map being left
 * @param {number} changesSoFar how many map changes this run has already made (0 for the first)
 * @param {function(): number} [rand]
 * @param {function(string): boolean} [ownsItem] which Locker items the player owns (omit to allow every map)
 */
export function getNextSkin(current, changesSoFar, rand, ownsItem) {
  var open = SKINS.filter(function (s) { return isMapUnlocked(s, ownsItem || function () { return true; }); });
  // The first change of a run goes outdoors, if the player has any outdoor map; otherwise it stays among the indoor ones
  var outdoor = open.filter(function (s) { return !isIndoorSkin(s); });
  var pool = changesSoFar < 1 && outdoor.length ? outdoor : open;
  var others = pool.filter(function (s) { return !current || s.id !== current.id; });
  return pickFrom(others.length ? others : pool, rand);
}

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
