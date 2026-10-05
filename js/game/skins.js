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
 * Maps set in real hospital rooms (and the children's playroom) are "indoor"; the open and
 * body-interior worlds are "outdoor". A run starts indoors, then moves outdoors, then is random.
 */
var INDOOR_IDS = [
  'skin_hospital_hallway', 'skin_operating_room', 'skin_research_lab',
  'skin_ambulance_bay', 'skin_pediatric_playland'
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
