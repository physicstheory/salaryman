// What money buys in Tōkonto: the watches, the fragrances and the small expensive things, and who gives them to Seiko as he rises.
// Every house here is this world's own (as 11 Eleven and SOTI are), each made in the manner of a kind of house you would know.
//
//   tier   0-10  how much the thing says about the man wearing it. People who know his rank expect him to stay near it.
//   flash  0-1   how loudly it says it.
// A watch's `look` is read by LuxWatch.draw (luxury-watch.js); a fragrance's `col` is the colour of its aura and its trail.
// A fragrance's `fit` is how it lands in each kind of place, -1 (wrong) to 1 (exactly right):
//   office, street, commute (the morning crush), night (bars, karaoke), formal (boardroom, ceremony), date, yakuza.
(function () {
  "use strict";
  const W = (id, house, name, price, tier, flash, look, blurb, o) => Object.assign({ kind: "watch", id: id, house: house, name: name, price: price, tier: tier, flash: flash, look: look, blurb: blurb }, o || {});
  const WATCHES = [
    W("kashio_f91", "Kashio", "F-91 Digital", 2480, 1, 0.05,
      { shape: "digital", metal: "resin", lcd: "#b9c4a6", accent: "#2f6fd0", strap: { type: "resin", c: "#141518" }, text: ["KASHIO", "F-91"], quartz: true },
      "Seven grams of resin, an alarm, a light that lights nothing. It will outlive the building."),
    W("kashio_shokku", "Kashio", "G-Shokku 5600", 14800, 1, 0.1,
      { shape: "digital", metal: "resin", lcd: "#a9b59a", accent: "#c8372d", armour: true, strap: { type: "resin", c: "#0d0e10" }, text: ["KASHIO", "G-SHOKKU"], quartz: true },
      "Drop it off SOTI Tower, pick it up, check the time."),
    W("toyo_bambino", "Tōyō", "Bambino Hand-Wound", 28000, 2, 0.1,
      { shape: "round", metal: "steel", bezel: { type: "thin" }, dial: { c: "#f1e9d6", tex: "sunburst" }, idx: "baton", idxC: "#3a3f47", hands: "dauphine", handC: "#2d3138", comps: ["date"], strap: { type: "leather", c: "#5a3a22" }, text: ["TŌYŌ", "Automatic"], domed: true },
      "A cream dial under a domed crystal. Looks like four times the money to anyone who doesn't know watches."),
    W("hattori_5", "Hattori", "5 Sports Automatic", 39800, 2, 0.15,
      { shape: "round", metal: "steel", bezel: { type: "dive", c: "#101216", ink: "#e8e8e4" }, dial: { c: "#0f1114", tex: "matte" }, idx: "dive", hands: "sword", comps: ["daydate3"], strap: { type: "oyster" }, text: ["HATTORI", "5 SPORTS"], lume: "#cfe8c4" },
      "The first proper watch of half the men on the morning train."),
    W("chichi", "Hattori", "Father's Lord Marvel", 0, 2, 0.02,
      { shape: "round", metal: "steel", bezel: { type: "thin" }, dial: { c: "#d9d4c4", tex: "linen" }, idx: "baton", idxC: "#4a4438", hands: "dauphine", handC: "#3a352c", comps: [], strap: { type: "leather", c: "#2a1c14" }, text: ["HATTORI", "Lord Marvel"], domed: true, worn: true },
      "Hand-wound, 1968. Scratched crystal, new strap. He wore it to the co-op every day of your childhood.", { gift: true, heart: true }),
    W("shimin_eco", "Shimin", "Eco-Solar Titanium", 52000, 2, 0.15,
      { shape: "round", metal: "titanium", bezel: { type: "smooth" }, dial: { c: "#1c3a66", tex: "sunburst" }, idx: "baton", hands: "baton", comps: ["date"], strap: { type: "oyster", metal: "titanium" }, text: ["SHIMIN", "ECO-SOLAR"], quartz: true },
      "Runs on daylight. Weighs nothing. The sensible choice, and it knows it."),
    W("hambleton_field", "Hambleton", "Field Mechanical", 82000, 3, 0.15,
      { shape: "round", metal: "steel", bezel: { type: "thin" }, dial: { c: "#15171a", tex: "matte" }, idx: "field", hands: "sword", comps: [], strap: { type: "nato", c: "#5b5a3c" }, text: ["HAMBLETON", "KHAKI"], lume: "#e8dcae", matteCase: true },
      "An army watch for a man whose battlefield is the third floor."),
    W("tissard_prx", "Tissard", "PRX Automatic", 98000, 3, 0.35,
      { shape: "round", metal: "steel", bezel: { type: "smooth", wide: true }, dial: { c: "#1f4f8a", tex: "waffle" }, idx: "baton", hands: "baton", comps: ["date"], strap: { type: "integrated" }, text: ["TISSARD", "PRX"], tonneauCase: true },
      "The integrated-bracelet look of a watch thirty times the price. Colleagues look twice."),
    W("tudour_bb", "Tudour", "Black Bay 58", 520000, 4, 0.4,
      { shape: "round", metal: "steel", bezel: { type: "dive", c: "#14161a", ink: "#d9b877", pip: "#c8372d" }, dial: { c: "#121316", tex: "matte" }, idx: "dive", idxC: "#e8d9b0", hands: "snowflake", handC: "#d9b877", comps: [], strap: { type: "oyster", rivets: true }, text: ["TUDOUR", "BLACK BAY"], lume: "#f0e2b8" },
      "Gilt on black, a snowflake hand. The watch of people who could afford the crown and chose the shield."),
    W("grand_hattori", "Grand Hattori", "Snowflake Spring Drive", 790000, 5, 0.2,
      { shape: "round", metal: "titanium", bezel: { type: "smooth" }, dial: { c: "#f4f6f8", tex: "snow" }, idx: "facet", idxC: "#8d949d", hands: "dauphine", handC: "#aab0b8", secC: "#2c58b8", comps: ["date", "reserve"], strap: { type: "oyster", metal: "titanium" }, text: ["GH", "Grand Hattori"], sweep: "glide" },
      "A dial like fresh snow on the Mizuho hills, and a blued second hand that glides without a tick. People who know, know."),
    W("omegon_seamaster", "Omegon", "Seamaster 300", 820000, 5, 0.45,
      { shape: "round", metal: "steel", bezel: { type: "dive", c: "#173a6e", ink: "#eef2f6", scallop: true }, dial: { c: "#1a4079", tex: "wave" }, idx: "dive", hands: "skeleton", comps: ["date6"], strap: { type: "oyster", five: true }, text: ["Ω OMEGON", "Seamaster"], lume: "#bfe6ff" },
      "Blue waves and a helium valve. The secret agent's watch, on a salaryman."),
    W("omegon_speedmaster", "Omegon", "Speedmaster Moon", 980000, 5, 0.4,
      { shape: "round", metal: "steel", bezel: { type: "tachy", c: "#0e0f12", ink: "#e8e8e4" }, dial: { c: "#0f1012", tex: "matte" }, idx: "batonthin", hands: "baton", comps: ["chrono369"], strap: { type: "oyster" }, text: ["Ω OMEGON", "Speedmaster"], lume: "#dfe8d0" },
      "Three registers and a tachymeter. It went to the moon; it can get you to a nine o'clock meeting."),
    W("cartiere_tank", "Cartière", "Tank Louis", 1150000, 6, 0.4,
      { shape: "tank", metal: "gold", dial: { c: "#f3efe4", tex: "guilloche" }, idx: "roman", idxC: "#17181b", hands: "sword", handC: "#2c4c9c", comps: [], cabochon: "#2c4c9c", strap: { type: "leather", c: "#17181b", gloss: true }, text: ["CARTIÈRE", ""], quartz: false },
      "A rectangle, twelve Roman numerals, a blue stone in the crown. A hundred years of people with taste."),
    W("ivc_portugieser", "IVC", "Portugieser Chronograph", 1280000, 6, 0.3,
      { shape: "round", metal: "steel", bezel: { type: "thin" }, dial: { c: "#f5f5f1", tex: "lacquer" }, idx: "arabic", idxC: "#2c4c9c", hands: "leaf", handC: "#2c4c9c", comps: ["chrono612"], strap: { type: "leather", c: "#1a2c5a", gloss: true }, text: ["IVC", "Schaffhausen"] },
      "Blue leaf hands on a white dial, big and clean as a ship's instrument."),
    W("rolecks_datejust", "Rolecks", "Datejust 41", 1900000, 7, 0.6,
      { shape: "round", metal: "steel", bezel: { type: "fluted", metal: "gold" }, dial: { c: "#d9c27a", tex: "sunburst" }, idx: "baton", idxC: "#b98a2c", hands: "baton", handC: "#b98a2c", comps: ["date", "cyclops"], strap: { type: "jubilee", two: true }, text: ["ROLECKS", "DATEJUST"], crown: true },
      "Steel and gold, fluted bezel, the date under its little magnifier. The watch that says the promotion went through."),
    W("rolecks_submariner", "Rolecks", "Submariner Date", 2300000, 7, 0.6,
      { shape: "round", metal: "steel", bezel: { type: "dive", c: "#0c0d10", ink: "#e9e9e6", ceramic: true }, dial: { c: "#0b0c0e", tex: "gloss" }, idx: "dive", hands: "mercedes", comps: ["date", "cyclops"], strap: { type: "oyster" }, text: ["ROLECKS", "SUBMARINER"], crown: true, lume: "#bfeaff" },
      "The one everybody recognises from across the room, which is the point of it."),
    W("rolecks_gmt", "Rolecks", "GMT-Master “Cola”", 3100000, 7, 0.7,
      { shape: "round", metal: "steel", bezel: { type: "gmt", c: "#1c3f8f", c2: "#b3202a", ink: "#f2f2ee" }, dial: { c: "#0b0c0e", tex: "gloss" }, idx: "dive", hands: "mercedes", comps: ["date", "cyclops", "gmt"], gmtC: "#c8372d", strap: { type: "jubilee" }, text: ["ROLECKS", "GMT-MASTER"], crown: true, lume: "#bfeaff" },
      "Red and blue, two time zones. For a man who has somewhere else to be, or wants it thought."),
    W("patek_calatrava", "Patek Filippe", "Calatrava", 5200000, 8, 0.15,
      { shape: "round", metal: "rose", bezel: { type: "thin" }, dial: { c: "#f6f1e6", tex: "lacquer" }, idx: "facet", idxC: "#b3745a", hands: "dauphine", handC: "#b3745a", comps: ["smallsec"], strap: { type: "leather", c: "#3a2416", gloss: true }, text: ["PATEK FILIPPE", "GENÈVE"] },
      "Nothing on it you could take away. Old money does not need to raise its voice."),
    W("rolecks_daydate", "Rolecks", "Day-Date “President”", 6400000, 8, 0.9,
      { shape: "round", metal: "gold", bezel: { type: "fluted", metal: "gold" }, dial: { c: "#e2c16a", tex: "sunburst" }, idx: "roman", idxC: "#7a5a18", hands: "baton", handC: "#7a5a18", comps: ["dayarc", "date", "cyclops"], strap: { type: "president", metal: "gold" }, text: ["ROLECKS", "DAY-DATE"], crown: true },
      "Solid gold, the day spelled out in full at twelve. Presidents wear it. So do men who want to be mistaken for one."),
    W("rolecks_daytona", "Rolecks", "Cosmograph Daytona", 7800000, 8, 0.85,
      { shape: "round", metal: "gold", bezel: { type: "tachy", c: "#0c0d10", ink: "#eccb6a" }, dial: { c: "#0c0d10", tex: "gloss" }, idx: "baton", idxC: "#eccb6a", hands: "baton", handC: "#eccb6a", comps: ["chrono369g"], strap: { type: "rubber", c: "#0c0d10" }, text: ["ROLECKS", "DAYTONA"], crown: true },
      "Gold, black and three gold-ringed registers. There is a waiting list. There is always a waiting list."),
    W("langer_1", "A. Langer & Söhne", "Langer 1", 7400000, 9, 0.2,
      { shape: "round", metal: "rose", bezel: { type: "thin" }, dial: { c: "#e9e6de", tex: "lacquer" }, idx: "none", hands: "sword", handC: "#b3745a", comps: ["lange"], strap: { type: "leather", c: "#4a2c1c", gloss: true }, text: ["A. LANGER & SÖHNE", "Glashütte"] },
      "The time off to one side, a great date, a power reserve. Saxon, severe, and worth a flat in Oyamada."),
    W("piquet_royal", "Audemars Piquet", "Royal Oak", 9500000, 9, 0.8,
      { shape: "octagon", metal: "steel", bezel: { type: "screws" }, dial: { c: "#1d3c6c", tex: "tapisserie" }, idx: "baton", hands: "baton", comps: ["date"], strap: { type: "integrated" }, text: ["AUDEMARS PIQUET", "AUTOMATIC"] },
      "Eight screws, an octagon, a dial cut like a chocolate bar. Steel that costs more than gold."),
    W("patek_nautilus", "Patek Filippe", "Nautilus 5711", 16000000, 9, 0.8,
      { shape: "porthole", metal: "steel", bezel: { type: "porthole" }, dial: { c: "#24466e", tex: "grooves" }, idx: "baton", hands: "baton", comps: ["date"], strap: { type: "integrated", polished: true }, text: ["PATEK FILIPPE", "GENÈVE"] },
      "A ship's porthole in steel, blue fading to black. You do not buy one. You are allowed one."),
    W("daydate_oyabun", "Rolecks", "Day-Date “Oyabun”", 0, 9, 1,
      { shape: "round", metal: "gold", bezel: { type: "diamond" }, dial: { c: "#101113", tex: "gloss" }, idx: "diamond", hands: "baton", handC: "#eccb6a", comps: ["dayarc", "date", "cyclops"], strap: { type: "president", metal: "gold" }, text: ["ROLECKS", "DAY-DATE"], crown: true },
      "Black dial, diamonds for hours, diamonds round the bezel. Nobody in the room asks where it came from.", { gift: true }),
    W("millet_rm", "Richard Millet", "RM 011 Flyback", 38000000, 10, 1,
      { shape: "tonneau", metal: "carbon", bezel: { type: "tonneau", screws: true }, dial: { c: "#17181b", tex: "skeleton" }, idx: "rmarabic", idxC: "#f2f2ee", hands: "skeleton", handC: "#f2f2ee", secC: "#ff5a1f", comps: ["rmchrono", "bigdate"], strap: { type: "rubber", c: "#ff5a1f", vents: true }, text: ["RICHARD MILLET", ""], accent: "#ff5a1f" },
      "A racing engine you can see through, on an orange strap. The price of a building, and it looks it.")
  ];

  // bottle: [shape, glass tint, cap]  shapes: block, flask, round, column, can, dome
  const F = (id, house, name, type, price, tier, loud, proj, hours, col, family, notes, fit, bottle, blurb, o) =>
    Object.assign({ kind: "frag", id: id, house: house, name: name, type: type, price: price, tier: tier, loud: loud, proj: proj, hours: hours, col: col, family: family, notes: notes, fit: fit, bottle: bottle, blurb: blurb }, o || {});
  const FRAGRANCES = [
    // ---- the chemist's shelf ------------------------------------------------------------------------------------------------------------
    F("akkusu", "Akkusu", "Dark Temptation Body Spray", "drugstore", 680, 0, 0.7, 0.75, 2, ["#5a3a22", "#c98a4a"], "Sweet chocolate fog", "chocolate · amber · the changing room after PE",
      { office: -0.5, street: -0.2, commute: -0.6, night: -0.1, formal: -0.9, date: -0.5, yakuza: -0.6 }, ["can", "#16171a", "#c98a4a"], "Every boy's first scent, and for a grown man, a statement of a different kind."),
    F("old_spaisu", "Old Spaisu", "Original Cologne", "drugstore", 980, 1, 0.45, 0.5, 3, ["#c8372d", "#f1e3c8"], "Barbershop spice", "clove · carnation · your grandfather's bathroom",
      { office: 0.1, street: 0.2, commute: 0.1, night: -0.1, formal: -0.2, date: -0.2, yakuza: 0.1 }, ["flask", "#f4efe2", "#c8372d"], "Old men nod at it. Young women think of their grandfathers."),
    F("mujin_citrus", "Mujin", "Yuzu Cologne", "drugstore", 1800, 1, 0.2, 0.3, 2, ["#f2e27a", "#fffbe0"], "Clean citrus", "yuzu · green tea · soap",
      { office: 0.5, street: 0.4, commute: 0.5, night: 0, formal: 0.2, date: 0.2, yakuza: -0.2 }, ["column", "#fbfaf2", "#d9d6c8"], "Smells like a clean shirt. Gone by lunch. Offends nobody, impresses nobody."),
    // ---- designer ---------------------------------------------------------------------------------------------------------------------------
    F("ysl_y", "Yves Saint Laurant", "Y Eau de Parfum", "designer", 16800, 3, 0.55, 0.65, 8, ["#2456d8", "#86b4ff"], "Fresh blue fougère", "apple · sage · ambery woods",
      { office: 0.6, street: 0.7, commute: 0.3, night: 0.6, formal: 0.4, date: 0.6, yakuza: 0.1 }, ["block", "#2a56c8", "#17181b"], "Bright, blue and modern. The safest compliment-getter in the shop."),
    F("sauvaje", "Dioré", "Sauvaje Eau de Toilette", "designer", 15400, 3, 0.8, 0.85, 7, ["#3d5a80", "#c0c8d2"], "Peppery ambroxan", "bergamot · pepper · ambroxan",
      { office: 0.1, street: 0.4, commute: -0.3, night: 0.7, formal: 0.1, date: 0.5, yakuza: 0.2 }, ["round", "#1c2b44", "#101114"], "Fills a lift before you do. Also worn by every third man on the Kanda line.", { common: true }),
    F("bleu_chanelle", "Chanelle", "Bleu de Chanelle", "designer", 19800, 4, 0.35, 0.5, 8, ["#16254f", "#5d79c9"], "Woody aromatic", "grapefruit · incense · cedar",
      { office: 0.9, street: 0.6, commute: 0.6, night: 0.5, formal: 0.8, date: 0.6, yakuza: 0.3 }, ["block", "#10193a", "#0c0d10"], "Navy blue in a bottle: a good suit, pressed. Never wrong at a desk."),
    F("acqua_gio", "Giorgio Armane", "Acqua di Giò Profondo", "designer", 17200, 3, 0.3, 0.45, 6, ["#1b9aaa", "#bdf2f5"], "Marine aquatic", "sea notes · bergamot · patchouli",
      { office: 0.8, street: 0.7, commute: 0.7, night: 0.3, formal: 0.4, date: 0.5, yakuza: -0.1 }, ["flask", "#1672a0", "#0f3a5a"], "The sea off Hamaura on a clear morning. Summer in the office without the sweat."),
    F("eros", "Versacci", "Eros", "designer", 14900, 3, 0.85, 0.9, 9, ["#17b8a6", "#f2d36a"], "Sweet mint and vanilla", "mint · tonka · vanilla",
      { office: -0.3, street: 0.3, commute: -0.5, night: 0.9, formal: -0.4, date: 0.6, yakuza: 0.3 }, ["block", "#18b2a6", "#d9b44a"], "Loud, sweet and built for the club at one in the morning. At a desk it is a shout."),
    F("le_male", "Jean Paul Gautière", "Le Mâle Le Parfum", "designer", 15800, 3, 0.75, 0.8, 9, ["#1c2a5e", "#c9a45a"], "Lavender and warm vanilla", "cardamom · lavender · vanilla",
      { office: 0, street: 0.4, commute: -0.3, night: 0.9, formal: 0.1, date: 0.8, yakuza: 0.2 }, ["column", "#141c40", "#c9a45a"], "A sailor's torso in black glass. After dark it does exactly what it promises."),
    F("million", "Paco Rabanné", "1 Million", "designer", 13900, 3, 0.95, 0.95, 9, ["#e6b422", "#fff0a8"], "Sweet spicy leather", "blood mandarin · cinnamon · leather",
      { office: -0.6, street: 0, commute: -0.7, night: 0.6, formal: -0.6, date: 0.2, yakuza: 0.4 }, ["block", "#e0b02a", "#e0b02a"], "A gold bar that smells of cinnamon bubblegum. Announces a man who wants to be announced."),
    F("prado", "Prado", "L'Homme", "designer", 16500, 4, 0.2, 0.4, 7, ["#b7a6d9", "#f4f0ff"], "Clean iris and soap", "iris · neroli · amber",
      { office: 1, street: 0.5, commute: 0.8, night: 0.2, formal: 0.8, date: 0.5, yakuza: -0.2 }, ["block", "#ece8f4", "#17181b"], "A white shirt, ironed, still warm. The most office-proof scent ever bottled."),
    F("terre", "Hermèz", "Terre d'Hermèz", "designer", 18900, 5, 0.3, 0.5, 8, ["#d9772b", "#f6d6a8"], "Orange and flint", "orange · pepper · vetiver",
      { office: 0.9, street: 0.7, commute: 0.6, night: 0.4, formal: 0.9, date: 0.5, yakuza: 0.4 }, ["flask", "#e9a25a", "#c0c4c9"], "Bitter orange on dry earth. What a section chief smells like when he has been one for ten years."),
    F("homme_intense", "Dioré", "Homme Intense", "designer", 19600, 5, 0.5, 0.6, 9, ["#5a3d7a", "#d8b9a0"], "Powdery iris and cocoa", "iris · ambrette · cedar",
      { office: 0.4, street: 0.5, commute: 0.2, night: 0.8, formal: 0.8, date: 1, yakuza: 0.2 }, ["block", "#3a2c4a", "#17181b"], "Lipstick, cocoa and a dinner jacket. For the evening you mean to remember."),
    F("oud_wood", "Tom Forde", "Oud Wood", "designer", 42000, 6, 0.4, 0.5, 8, ["#6b5a3c", "#cdb98a"], "Smooth woods", "rosewood · oud · sandalwood",
      { office: 0.6, street: 0.5, commute: 0.4, night: 0.7, formal: 1, date: 0.7, yakuza: 0.7 }, ["column", "#3a3226", "#8a7a56"], "Quiet, dry and expensive, like the panelling on the executive floor."),
    F("tobacco_vanille", "Tom Forde", "Tobacco Vanille", "designer", 42000, 6, 0.85, 0.85, 11, ["#8a4a1c", "#e6b877"], "Pipe tobacco and vanilla", "tobacco leaf · vanilla · dried fruit",
      { office: -0.2, street: 0.4, commute: -0.4, night: 0.9, formal: 0.4, date: 0.8, yakuza: 0.8 }, ["column", "#4a2a14", "#c9a45a"], "A gentleman's club with the fire lit. Glorious in December, a hostage situation in a July lift."),
    // ---- the boutique houses ------------------------------------------------------------------------------------------------------------------
    F("kodo_hinoki", "Kōdō Tōkonto", "Hinoki & Rain", "niche", 24000, 5, 0.15, 0.3, 7, ["#8fa88a", "#e4eadf"], "Temple wood and wet stone", "hinoki · incense · petrichor",
      { office: 0.8, street: 0.8, commute: 0.8, night: 0.3, formal: 1, date: 0.5, yakuza: 0.6 }, ["dome", "#dfe6da", "#3a3f36"], "A cedar temple gate after rain. Old people stop and breathe in. Made four streets from Tōkonto Central.", { gentle: true }),
    F("greenley", "Parfums de Marlay", "Greenley", "niche", 38000, 6, 0.55, 0.65, 9, ["#22a04a", "#b9f277"], "Crisp green apple and woods", "green apple · bergamot · cashmere wood",
      { office: 0.7, street: 0.9, commute: 0.4, night: 0.6, formal: 0.5, date: 0.7, yakuza: 0.1 }, ["dome", "#1f8f44", "#d9b44a"], "A cut green apple in a spring garden. Heads turn, and they turn kindly."),
    F("layton", "Parfums de Marlay", "Layton", "niche", 39500, 6, 0.75, 0.8, 11, ["#3b3f9e", "#d9b44a"], "Apple, vanilla and spice", "apple · lavender · vanilla · cardamom",
      { office: 0.2, street: 0.6, commute: -0.1, night: 0.9, formal: 0.6, date: 0.9, yakuza: 0.4 }, ["dome", "#2a2e7a", "#c0c4c9"], "Warm, sweet and regal. The most complimented thing in the building after seven in the evening."),
    F("santal", "Le Laboratoire", "Santal 33", "niche", 34000, 6, 0.6, 0.7, 10, ["#b89b6e", "#efe2c8"], "Sandalwood and leather", "sandalwood · cardamom · papyrus",
      { office: 0.5, street: 0.8, commute: 0.2, night: 0.6, formal: 0.3, date: 0.6, yakuza: 0 }, ["column", "#efe9dc", "#17181b"], "A typewriter label, a campfire, a pickle. Every creative director in Kanda smells of it."),
    F("mojave", "Byredeau", "Mojave Ghost", "niche", 32000, 6, 0.2, 0.35, 7, ["#c9b6e0", "#fbf6ff"], "Sheer floral woods", "ambrette · magnolia · sandalwood",
      { office: 0.9, street: 0.6, commute: 0.8, night: 0.3, formal: 0.6, date: 0.6, yakuza: -0.2 }, ["round", "#f6f4f0", "#17181b"], "Hardly there, and people lean in to find it. Good taste, whispered."),
    F("hacivat", "Nishané", "Hacivat", "niche", 36000, 7, 0.6, 0.75, 11, ["#9bc23a", "#f0e68c"], "Pineapple and oakmoss", "pineapple · grapefruit · oakmoss",
      { office: 0.6, street: 0.8, commute: 0.3, night: 0.7, formal: 0.6, date: 0.6, yakuza: 0.3 }, ["block", "#d9d6a8", "#3f6f3a"], "Sharp fruit over dry moss. The connoisseur's answer to the famous one."),
    F("naxos", "Xerjof", "Naxos", "niche", 48000, 7, 0.7, 0.75, 11, ["#e0a61c", "#7a4a9c"], "Honey, tobacco and lavender", "lavender · honey · tobacco · vanilla",
      { office: 0.1, street: 0.6, commute: -0.2, night: 0.9, formal: 0.6, date: 0.9, yakuza: 0.6 }, ["flask", "#5a2f7a", "#d9b44a"], "Sicilian honey on warm tobacco. Rich as a third helping."),
    F("angels_share", "Kiliane", "Angels' Share", "niche", 46000, 7, 0.7, 0.7, 10, ["#b5651d", "#f0c890"], "Cognac and cinnamon", "cognac · cinnamon · praline · oak",
      { office: -0.1, street: 0.5, commute: -0.4, night: 1, formal: 0.5, date: 0.9, yakuza: 0.7 }, ["flask", "#c97a2a", "#17181b"], "The good brandy, breathed rather than drunk. Bartenders ask what you are wearing."),
    F("aventus", "Creede", "Aventus", "niche", 62000, 7, 0.6, 0.75, 10, ["#2b2d33", "#d6dbe2"], "Smoky pineapple and birch", "pineapple · birch · musk · oakmoss",
      { office: 0.6, street: 0.8, commute: 0.3, night: 0.8, formal: 0.8, date: 0.8, yakuza: 0.6 }, ["flask", "#1a1b1f", "#c0c4c9"], "The scent of a man who closed the deal. Half the directors' floor wears it; none of them admit it."),
    F("rouge_540", "Maison Francis Kurkjian", "Baccarat Rouge 540", "niche", 58000, 8, 0.95, 1, 12, ["#d9272e", "#f2c66a"], "Burnt sugar and saffron", "saffron · jasmine · ambergris · cedar",
      { office: -0.4, street: 0.5, commute: -0.6, night: 0.9, formal: 0.3, date: 0.7, yakuza: 0.5 }, ["block", "#f6e9e2", "#d9272e"], "Red crystal and candyfloss, and it arrives ten metres before you. Everyone knows what it cost."),
    F("oud_greatness", "Initio", "Oud for Greatness", "niche", 64000, 8, 0.9, 0.9, 12, ["#b8860b", "#1c1a17"], "Dark oud and saffron", "oud · saffron · nutmeg · patchouli",
      { office: -0.5, street: 0.2, commute: -0.7, night: 0.7, formal: 0.5, date: 0.4, yakuza: 1 }, ["round", "#151412", "#b8860b"], "Black wood, gold lettering, a name that is not joking. A room goes quiet for it, one way or the other."),
    F("elysium", "Roja Dovo", "Elysium Parfum Cologne", "niche", 78000, 8, 0.5, 0.7, 10, ["#8fd3f4", "#f6e7a1"], "Sparkling citrus and ambergris", "grapefruit · vetiver · ambergris · juniper",
      { office: 0.9, street: 0.8, commute: 0.6, night: 0.6, formal: 0.9, date: 0.7, yakuza: 0.3 }, ["dome", "#cfeaf8", "#d9b44a"], "Cold light on water, with a crystal stopper. What the top floor smells like at nine in the morning."),
    F("interlude", "Amouaj", "Interlude Man", "niche", 56000, 8, 1, 1, 14, ["#27348b", "#e57a2a"], "Incense, smoke and oregano", "oregano · frankincense · amber · leather",
      { office: -0.8, street: 0, commute: -0.9, night: 0.6, formal: 0.2, date: 0.1, yakuza: 0.9 }, ["block", "#1c2466", "#d9b44a"], "They call it the Blue Beast. A burning spice market that lasts till tomorrow. Not for the timid, or their neighbours.")
  ];

  // slot: one of each slot is worn at a time
  const I = (id, slot, house, name, price, tier, flash, blurb, o) => Object.assign({ kind: "item", id: id, slot: slot, house: house, name: name, price: price, tier: tier, flash: flash, blurb: blurb }, o || {});
  const ITEMS = [
    I("tie_silk", "tie", "Hermèz", "Printed silk tie", 32000, 5, 0.3, "Heavy twill, a pattern of tiny stirrups. Knots like nothing else."),
    I("tie_grenadine", "tie", "Dreike's", "Grenadine tie, navy", 24000, 4, 0.1, "Open-weave silk with a matte grain. The tie other well-dressed men notice."),
    I("pen_meister", "pen", "Montblanque", "Meisterstück 149 fountain pen", 120000, 6, 0.4, "Black resin, a white star, a gold nib. Contracts feel different signed with it."),
    I("cuff_silver", "cufflinks", "Tiffanie", "Silver knot cufflinks", 68000, 5, 0.3, "Sterling silver knots. They show for a second when you check the time."),
    I("cuff_gold", "cufflinks", "Cartière", "Gold and onyx cufflinks", 420000, 8, 0.7, "Yellow gold, black stone. Double cuffs only."),
    I("case_tumii", "case", "Tumii", "Ballistic nylon briefcase", 88000, 4, 0.1, "Indestructible, black, anonymous. Every consultant in Tōkonto has one."),
    I("case_depeches", "case", "Hermèz", "Sac à Dépêches briefcase", 1600000, 9, 0.6, "Saddle-stitched calf leather with a palladium clasp. One craftsman, twenty hours."),
    I("wallet_intre", "wallet", "Bottega Venetta", "Intrecciato wallet", 92000, 6, 0.2, "Woven leather, no logo anywhere. If you know, you know."),
    I("belt_h", "belt", "Hermèz", "H-buckle belt", 140000, 6, 0.85, "A leather belt with a very large initial on the front of it."),
    I("shoes_lobbe", "shoes", "John Lobbe", "City II Oxfords", 280000, 7, 0.2, "Black calf cap-toes, made on a last cut for you. Old men look at a man's shoes first."),
    I("shades_wayf", "shades", "Ray-Bann", "Wayfarer sunglasses", 26000, 3, 0.4, "Black acetate. Worn indoors they say one thing; outdoors, another."),
    I("lighter_dupond", "lighter", "S.T. Dupond", "Ligne 2 lighter, gold", 180000, 7, 0.7, "It opens with a clear ringing ping that every head at the table turns to."),
    I("ring_signet", "ring", "Kanda Goldsmiths", "Signet ring, 18k", 240000, 7, 0.6, "Heavy gold on the little finger, engraved with nothing yet."),
    I("ring_pinky", "ring", "Oyabun's jeweller", "Diamond pinky ring", 0, 9, 1, "A carat and a half, set flush in gold. In certain rooms it does the talking.", { gift: true }),
    I("chain_gold", "chain", "Oyabun's jeweller", "Gold chain, 18k", 0, 7, 1, "Under the collar, mostly. Seen when it is meant to be seen.", { gift: true })
  ];

  // ---- what people give him as he rises ---------------------------------------------------------------------------------------------------------
  // SOTI: by rank index on the company ladder (standing-hook.js SOTI_RANKS: 1 agent ... 7 president). The crime family: by rank number, 1 upward.
  const GIFTS = {
    soti: {
      1: { from: "Father", items: ["chichi"], text: "A parcel from Mizuho came to SOTI's front desk. My old watch. Wind it every morning. So you are never late again." },
      2: { from: "Akio Sotiyama", items: ["tissard_prx", "tie_grenadine"], text: "A floor manager of mine does not tell the time from his telephone. Wear these. Do not thank me." },
      3: { from: "Akio Sotiyama", items: ["omegon_seamaster", "pen_meister"], text: "Section chief. You will be signing things now. Sign them with this." },
      4: { from: "Akio Sotiyama", items: ["rolecks_datejust", "cuff_silver", "aventus"], text: "Department heads at SOTI look like department heads. The scent is what the directors wear. Do not overdo it." },
      5: { from: "The board of SOTI", items: ["rolecks_daydate", "case_depeches"], text: "With the board's compliments on your appointment as director." },
      6: { from: "Reiko Sotiyama", items: ["patek_calatrava", "elysium", "shoes_lobbe"], text: "My father gives gold. I prefer things that do not shout. Welcome to the top floor, Managing Director." },
      7: { from: "The board of SOTI", items: ["patek_nautilus", "cuff_gold"], text: "Mr President. The company is yours. So, the board hopes, is its discretion." }
    },
    yakuza: {
      1: { from: "A man you met once", items: ["lighter_dupond"], text: "The family looks after its friends. Light the boss's cigarette with it when he asks." },
      2: { from: "The wakagashira", items: ["rolecks_gmt", "chain_gold", "oud_greatness"], text: "You earn now. Look like it. Not at your office. With us." },
      3: { from: "The Oyabun", items: ["daydate_oyabun", "ring_pinky"], text: "My own jeweller. Wear them when you sit at my table." },
      4: { from: "The Oyabun", items: ["millet_rm", "interlude"], text: "There is one of these in Tōkonto. Now it is on your wrist. Remember who put it there." }
    }
  };

  // ---- what people say ------------------------------------------------------------------------------------------------------------------------
  // {w} the watch's house, {f} the fragrance's name, {fh} its house
  const LINES = {
    scentGood: ["Oh, what is that? You smell wonderful.", "Excuse me, sorry, what are you wearing?", "Mm. Somebody smells nice.", "That's lovely. Is that {f}?", "…ii nioi. Good taste."],
    scentGentle: ["Ah… like a temple in the rain.", "What a calm scent. Thank you for that.", "That takes me back. Hinoki?"],
    scentBad: ["Ugh. At this hour?", "…Somebody's wearing something.", "It's a street, not a nightclub.", "Kusai…"],
    scentCloud: ["*cough* Did you bathe in it?", "Kh— I can taste that.", "How many sprays was that? Ten?", "My eyes are watering."],
    scentCommon: ["Ah. {f}. Like every man on this line.", "{f}. Of course it is.", "My ex wore that. And my boss. And my dentist."],
    scentCheap: ["Is that… {f}? How old are you?", "You smell like my little brother's gym bag."],
    watchGood: ["Is that a {w}? …Very nice.", "A {w}. Business must be good.", "Sugoi… that watch.", "Now that is a watch."],
    watchFlash: ["That's a {w}. Real?", "He wants us to see the watch.", "A {w}, out here? Brave.", "Stolen, probably."],
    watchHeart: ["That's an old Hattori. My father had one.", "They don't make them like that now. Look after it."],
    polish: ["Sharp.", "Somebody's doing well.", "Now he looks like somebody."],
    // at work, where they know exactly what he earns
    workTry: ["Who do you think you are, {name}?", "{f}? On the {floor}? Who does he think he is.", "Somebody's dressing for the job three floors up.", "Trying a bit hard today, aren't we."],
    workWatchTry: ["Is that a {w}? On {rank} pay? …Who do you think you are.", "A {w}. Either it's fake or we should check the petty cash.", "Nice watch. Did the customers pay for it?"],
    workCloud: ["Seiko. Open a window. Now.", "We all work in this air, you know.", "Did something spill on you?"],
    workGood: ["You look the part today.", "Mm. Presentable. Good.", "You smell like a man who answers his emails.", "Is that new? Suits you."],
    workHumble: ["A {w}, sir? …It suits you, somehow.", "The boss wears a {w}. I like him more for it."],
    nightGood: ["Ooh, come and sit here. What IS that?", "You smell expensive.", "Somebody dressed up for tonight."],
    nightBad: ["You smell like the office.", "Did you come straight from a funeral?"],
    yakuzaGood: ["You carry yourself well. Good.", "He knows how to arrive."],
    yakuzaTry: ["Who gave you leave to wear that at my table?", "A {w}. Above my lieutenant's. Interesting choice, salaryman.", "You are dressed above your place."],
    yakuzaWeak: ["You come to us smelling of soap and wearing a plastic watch.", "Does SOTI not pay you? Embarrassing."]
  };

  window.LUX_DATA = { watches: WATCHES, fragrances: FRAGRANCES, items: ITEMS, gifts: GIFTS, lines: LINES };
})();
