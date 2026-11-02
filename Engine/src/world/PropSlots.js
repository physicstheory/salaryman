// Texture slots for the engine's street props. Every part of every prop in Props.js is drawn with one of these slots,
// and each slot is a full PBR set in Web/art/props/:
//
//   <slot>.jpg         base colour (albedo)
//   <slot>_nor.jpg     tangent-space normal map
//   <slot>_rough.jpg   roughness (white = rough, black = glossy)
//
// The repo ships procedural stand-ins for all of them (Tools/props/make_prop_maps.py --placeholders). They are meant
// to be replaced by painted textures: docs/PROP_TEXTURES.md is the brief ChatGPT works from, one slot at a time, and
// `python3 Tools/props/make_prop_maps.py <slot>` builds the normal and roughness maps from a painted base colour.
//
// uv modes, which decide how the painting has to be laid out:
//   tile  a seamless, tileable texture; `tile` is how many metres of the real surface one copy of the image covers.
//         The prop's UVs are in metres, so the texture keeps its scale on a 0.3 m bollard and a 10 m pole alike.
//   wrap  one image wrapped once around a round part (cone, bin, bollard, pole): left edge to right edge goes round
//         the part, bottom of the image is the bottom of the part. Left and right edges must meet seamlessly.
//   face  one image shown whole on one flat face (the drinks window of a vending machine, a road sign, a grille).
//         `aspect` is width / height of that face; paint the picture at that shape.
//
// tint: true means the part is recoloured per instance (bins come in green and blue, bicycles in four colours, vending
// machines in four liveries). Paint those in light neutral grey (around #c8c8c8) with all the wear, dirt and detail
// in them, and let the game add the colour. tint: false parts are painted in their real colours.
//
// material sets the base PBR response (metalness, how glossy, whether it glows at night).

export const PROP_TEX_VERSION = 1;

export const SLOT_MATERIALS = {
  paint:    { metalness: 0.15, roughness: 0.62 },
  metal:    { metalness: 0.9,  roughness: 0.38 },
  galv:     { metalness: 0.85, roughness: 0.5 },
  plastic:  { metalness: 0.0,  roughness: 0.5 },
  rubber:   { metalness: 0.0,  roughness: 0.92 },
  wood:     { metalness: 0.0,  roughness: 0.8 },
  concrete: { metalness: 0.0,  roughness: 0.9 },
  ceramic:  { metalness: 0.0,  roughness: 0.25 },
  leather:  { metalness: 0.0,  roughness: 0.6 },
  leaves:   { metalness: 0.0,  roughness: 0.85, leaves: true },
  glow:     { metalness: 0.0,  roughness: 0.3, glow: true }
};

const S = (prop, part, material, uv, extra) => Object.assign({ prop, part, material, uv }, extra);

// base: the colour of the procedural stand-in (and a hint of the real colour). brief: what the painting must show.
export const PROP_SLOTS = {
  // ---- traffic cone ----------------------------------------------------------------------------------------------
  cone_body:      S("cone", "cone shell", "plastic", "wrap", { size: 1024, base: "#e8661a", brief: "A Japanese road-works traffic cone unrolled: fluorescent red-orange PVC, two white retro-reflective sleeves (one wide band at 55-70% height, one thin band at 30%), faint moulding seams, black tyre scuffs and grey road dust towards the bottom, a few scratches through the reflective film." }),
  cone_base:      S("cone", "square rubber foot", "rubber", "tile", { tile: 0.4, size: 512, base: "#26262a", brief: "Recycled black rubber, slightly speckled, with grit and dried mud in the grooves." }),

  // ---- litter bin ------------------------------------------------------------------------------------------------
  bin_body:       S("bin", "drum", "plastic", "wrap", { size: 1024, tint: true, base: "#c8c8c8", brief: "A tall municipal plastic litter bin unrolled, painted in neutral grey for tinting: vertical moulded ribs every 8 cm, a darker drip line under the lid, scuffs and sun-faded patches, a sticker residue patch, grime collecting at the base." }),
  bin_lid:        S("bin", "lid and rim", "plastic", "tile", { tile: 0.6, size: 512, base: "#2a2a2e", brief: "Charcoal moulded plastic with a fine matte texture, scratches and dust in the corners." }),
  bin_label:      S("bin", "sorting label", "plastic", "face", { aspect: 0.75, size: 512, base: "#f2f2ee", brief: "A white sorting sticker for a Japanese bin: a coloured header band, large text 'もえるゴミ' (burnable), small icons of paper and food waste, small English 'Burnable', slightly peeled corner, rain stains." }),

  // ---- wooden crate and pallet -------------------------------------------------------------------------------------
  crate_wood:     S("crate", "planks", "wood", "tile", { tile: 0.6, size: 1024, base: "#9a7650", brief: "Rough-sawn pine crate planks running horizontally, 10 cm wide boards with gaps, nail heads, saw marks, grey weathering and a faded stencilled lot number." }),
  pallet_wood:    S("pallet", "boards", "wood", "tile", { tile: 1.2, size: 1024, base: "#a88660", brief: "A used shipping pallet's boards: heat-treated pine, an 'HT' stamp, dark water stains, forklift gouges, splinters." }),

  // ---- road-works barrier -----------------------------------------------------------------------------------------
  barrier_panel:  S("barrier", "striped panel", "plastic", "face", { aspect: 4.2, size: 1024, base: "#f0c419", brief: "A Japanese road-works barrier panel: diagonal yellow and black stripes, a white plate in the middle reading '工事中' with smaller 'ご迷惑をおかけします', scuffed, a strip of reflective tape, dirt splashes along the bottom." }),
  barrier_frame:  S("barrier", "steel legs", "galv", "tile", { tile: 0.5, size: 512, base: "#9ea2a6", brief: "Galvanised steel with spangle pattern, white rust spots and scratches." }),
  barrier_foot:   S("barrier", "rubber feet", "rubber", "tile", { tile: 0.4, size: 512, base: "#202022", brief: "Heavy black rubber ballast block, moulded grip texture, worn smooth on top." }),

  // ---- bicycle (mamachari) ------------------------------------------------------------------------------------------
  bicycle_frame:  S("bicycle", "painted frame", "paint", "tile", { tile: 0.5, size: 512, tint: true, base: "#c8c8c8", brief: "Glossy painted steel tube in neutral grey for tinting, chips showing grey primer, a few scratches, a small registration sticker (防犯登録)." }),
  bicycle_tyre:   S("bicycle", "tyres", "rubber", "wrap", { size: 512, base: "#1c1c1e", brief: "A bicycle tyre tread unrolled: fine block tread down the middle, smooth sidewall with faint lettering, dust." }),
  bicycle_steel:  S("bicycle", "chrome parts, spokes, basket", "metal", "tile", { tile: 0.3, size: 512, base: "#b8bcc0", brief: "Chrome-plated steel, slightly pitted, small rust freckles, fingerprints." }),
  bicycle_saddle: S("bicycle", "saddle and grips", "leather", "tile", { tile: 0.25, size: 512, base: "#2b2522", brief: "Black vinyl saddle cover, stitched seam, cracks from the sun." }),
  bicycle_basket: S("bicycle", "front basket", "metal", "face", { aspect: 1.2, size: 512, base: "#9fa4a8", brief: "A wire mamachari basket seen from the front: a grid of steel wires with a rolled rim, on a mid-grey background (the background shows through as the basket's fill)." }),

  // ---- vending machine -----------------------------------------------------------------------------------------
  vending_body:   S("vending", "cabinet", "paint", "tile", { tile: 1.0, size: 1024, tint: true, base: "#c8c8c8", brief: "Powder-coated steel cabinet in neutral grey for tinting: panel seams, rivets, sun fading, sticker residue, a dented corner, grime at the bottom." }),
  vending_front:  S("vending", "drinks window", "glow", "face", { aspect: 0.96, size: 1024, base: "#e6eef4", brief: "The lit display window of a Japanese drinks vending machine, seen straight on: three shelves of about 10 cans and PET bottles each (green tea, coffee, cola, water, sports drinks - invented brands), small price tags '¥130' / '¥160' under each with blue 'つめた~い' and red 'あたたか~い' labels, a row of round push buttons, slight reflections on the plastic." }),
  vending_panel:  S("vending", "lower control panel", "plastic", "face", { aspect: 1.9, size: 1024, base: "#2a2c30", brief: "The lower half of the vending machine front: coin slot, note acceptor, IC-card reader (contactless logo), change return lever, the wide dark pickup flap 'とりだしぐち', a QR sticker, scratches and finger marks." }),
  vending_trim:   S("vending", "trim and kickplate", "metal", "tile", { tile: 0.5, size: 512, base: "#8e9296", brief: "Brushed stainless steel kickplate, scuffed by shoes, water stains." }),

  // ---- bench --------------------------------------------------------------------------------------------------------
  bench_wood:     S("bench", "slats", "wood", "tile", { tile: 0.8, size: 1024, base: "#8a6440", brief: "Hardwood park-bench slats along the length, oiled but weathered, grain, rounded edges, carved initials, bird droppings." }),
  bench_iron:     S("bench", "cast frame", "paint", "tile", { tile: 0.4, size: 512, base: "#2f3236", brief: "Black-painted cast iron with a slight casting texture, paint chips showing rust." }),

  // ---- bollard ------------------------------------------------------------------------------------------------------
  bollard_body:   S("bollard", "post", "galv", "wrap", { size: 1024, base: "#8e9398", brief: "A Japanese steel car-stop bollard unrolled: galvanised grey body, a yellow reflective band near the top, scrape marks from bumpers at 40-60 cm, rust weeping at the base." }),
  bollard_cap:    S("bollard", "cap", "metal", "tile", { tile: 0.2, size: 512, base: "#d0a01a", brief: "Yellow powder-coated dome cap, chipped." }),

  // ---- street lamp --------------------------------------------------------------------------------------------------
  lamp_pole:      S("lamp", "pole and arm", "paint", "tile", { tile: 1.0, size: 1024, base: "#6a6e72", brief: "Grey painted steel lamp column: vertical weld seam, faded paint, layers of torn flyer paper and tape residue near head height, rust at the base flange." }),
  lamp_head:      S("lamp", "lantern head", "paint", "tile", { tile: 0.4, size: 512, base: "#4a4c50", brief: "Dark grey die-cast aluminium luminaire housing with cooling fins, bird droppings, dust." }),
  lamp_lens:      S("lamp", "light lens", "glow", "face", { aspect: 0.6, size: 512, base: "#fff1d6", brief: "The underside lens of an LED street lamp: a grid of small LED dots behind a frosted diffuser, warm white, slightly dirty edges." }),

  // ---- utility pole -----------------------------------------------------------------------------------------------
  pole_concrete:  S("pole", "concrete pole", "concrete", "tile", { tile: 1.5, size: 1024, base: "#a29e96", brief: "A Japanese spun-concrete utility pole: light grey with fine pores, faint vertical form lines, climbing-step bolt holes, black grime streaks running down, moss at the bottom." }),
  pole_guard:     S("pole", "yellow guard", "plastic", "face", { aspect: 0.43, size: 512, base: "#f0c419", brief: "The yellow-and-black diagonally striped reflective guard wrapped round the base of a utility pole, scuffed by cars." }),
  pole_plate:     S("pole", "pole advert plate", "paint", "face", { aspect: 0.33, size: 1024, base: "#ffffff", brief: "A tall Japanese utility-pole advertisement plate (電柱広告): a local clinic or real-estate agent's name in big vertical kanji, an arrow, '200m', a phone number, weathered with rust trickles." }),
  pole_metal:     S("pole", "cross-arms and transformer", "galv", "tile", { tile: 0.6, size: 512, base: "#8a8e92", brief: "Weathered galvanised steel and grey painted metal: bolts, rust staining, a warning sticker." }),

  // ---- tree ---------------------------------------------------------------------------------------------------------
  tree_bark:      S("tree", "trunk", "wood", "tile", { tile: 0.8, size: 1024, base: "#5a4636", brief: "Street-tree bark (zelkova / plane tree): flaking plates of grey-brown bark with lighter patches, lichen." }),
  tree_leaves:    S("tree", "canopy", "leaves", "tile", { tile: 1.5, size: 1024, base: "#4a6e34", brief: "A dense mass of small deciduous leaves seen from a few metres away, varied greens with sunlit and shadowed clusters, tiny gaps." }),
  tree_grate:     S("tree", "tree grate", "metal", "face", { aspect: 1.0, size: 1024, base: "#3a3a3c", brief: "A square cast-iron tree grate seen from above: radiating slots around a round hole, rust, cigarette butts and leaves caught in it." }),

  // ---- planter ------------------------------------------------------------------------------------------------------
  planter_box:    S("planter", "concrete planter", "concrete", "tile", { tile: 0.8, size: 1024, base: "#8d8a84", brief: "Precast concrete planter box with exposed aggregate, chipped corners, damp dark stains at the bottom." }),
  planter_shrub:  S("planter", "shrubs", "leaves", "tile", { tile: 0.8, size: 512, base: "#3e6a30", brief: "Clipped azalea / box shrubs: tight small dark-green leaves, a few pink flowers." }),

  // ---- road sign ---------------------------------------------------------------------------------------------------
  signpost_pole:  S("signpost", "post", "galv", "tile", { tile: 0.6, size: 512, base: "#a0a4a8", brief: "Galvanised steel sign post with spangle pattern, stickers half peeled." }),
  sign_face:      S("signpost", "sign front", "paint", "face", { aspect: 1.0, size: 1024, base: "#c8102e", brief: "A Japanese 'no entry' road sign (車両進入禁止): red disc, white horizontal bar, white rim, retro-reflective sheeting texture, slight fading, a small dent. On a transparent-looking light grey square background (only the disc is used)." }),
  sign_back:      S("signpost", "sign back", "galv", "tile", { tile: 0.4, size: 512, base: "#9a9ea2", brief: "The bare aluminium back of a road sign, brushed, with a stamped maker's label and bolts." }),

  // ---- air-conditioner outdoor unit -----------------------------------------------------------------------------------
  ac_body:        S("ac", "casing", "paint", "tile", { tile: 0.5, size: 512, base: "#dedcd6", brief: "Off-white painted steel casing of an aircon outdoor unit, rust streaks from the screws, grime, a faded spec label." }),
  ac_grille:      S("ac", "fan grille", "metal", "face", { aspect: 1.0, size: 512, base: "#5a5c60", brief: "The round fan grille of an aircon outdoor unit seen straight on: concentric wire rings with a dark fan blade behind, dust, rust spots." }),
  ac_fins:        S("ac", "side fins", "metal", "tile", { tile: 0.3, size: 512, base: "#9a9c9e", brief: "Aluminium heat-exchanger fins: very fine vertical slats, bent in places, dusty." }),

  // ---- ball ---------------------------------------------------------------------------------------------------------
  ball_skin:      S("ball", "football", "leather", "wrap", { size: 512, base: "#eeeeee", brief: "A worn football's panels unrolled (white with black pentagons), scuffed and grass-stained." })
};

// Slot list per prop, for the docs and the gate.
export function slotsOf(prop) { return Object.keys(PROP_SLOTS).filter(k => PROP_SLOTS[k].prop === prop); }
