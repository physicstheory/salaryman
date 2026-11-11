// Places: every plot in the city given a purpose, a name, opening hours, a day off, staff, and a state at any minute.
//
// The host hands over its plots as plain objects ({ id, kind, x, z, w, d, yaw, floors, ward, district, city }) and gets back
// places that know what they are for: a ramen shop that opens at eleven, sells out by two and shuts on Wednesdays; a
// pharmacy; a pachinko parlour; a ward office; a block of flats with forty-two households; a detached house with one.
// Kinds the host uses: houses, flats, midrise, office, tower, shop, civic, campus, factory, shed, wharf, shrine, park, parking.

import { hash32, r01, pick, weighted, clamp } from "./Rng.js";

// Shops and services. hours: [open, close] in minutes past midnight (close past 1440 runs into the next morning).
// off: the usual weekly closing day (teikyūbi), or -1. staff: people working at once. busy: when it fills up (hour -> 0..1).
export const PURPOSES = {
  konbini:     { name: "Convenience store", hours: [0, 1440], off: -1, staff: 2, sign: "konbini", busy: { 7: 0.9, 8: 1, 12: 1, 13: 0.7, 18: 0.9, 19: 0.8, 23: 0.5, 2: 0.25 } },
  ramen:       { name: "Ramen", hours: [660, 1380], off: 3, staff: 3, busy: { 12: 1, 13: 0.7, 19: 0.9, 20: 0.8, 22: 0.6 }, queue: true },
  teishoku:    { name: "Set-meal diner", hours: [660, 1260], off: 0, staff: 3, busy: { 12: 1, 13: 0.6, 19: 0.7 }, queue: true },
  soba:        { name: "Soba stand", hours: [390, 1260], off: 0, staff: 2, busy: { 7: 0.8, 8: 0.9, 12: 1, 18: 0.6 } },
  izakaya:     { name: "Izakaya", hours: [1020, 1500], off: 0, staff: 4, busy: { 19: 0.9, 20: 1, 21: 1, 22: 0.8, 23: 0.5 }, night: true },
  bar:         { name: "Bar", hours: [1140, 1620], off: 0, staff: 2, busy: { 21: 0.7, 22: 0.9, 23: 1, 0: 0.8, 1: 0.5 }, night: true },
  snack:       { name: "Snack bar", hours: [1200, 1560], off: 0, staff: 2, busy: { 21: 0.6, 22: 0.9, 23: 1, 0: 0.7 }, night: true },
  karaoke:     { name: "Karaoke", hours: [660, 1740], off: -1, staff: 3, busy: { 16: 0.5, 20: 0.8, 22: 1, 0: 0.9, 2: 0.6 }, night: true },
  cafe:        { name: "Café", hours: [450, 1260], off: 1, staff: 2, busy: { 8: 0.8, 10: 0.6, 13: 0.8, 15: 1, 16: 0.8 } },
  kissaten:    { name: "Kissaten", hours: [480, 1140], off: 0, staff: 1, busy: { 8: 0.7, 10: 0.8, 14: 0.7 } },
  bakery:      { name: "Bakery", hours: [420, 1170], off: 1, staff: 2, busy: { 7: 0.8, 8: 1, 12: 0.6, 17: 0.5 } },
  bento:       { name: "Bentō shop", hours: [600, 1200], off: 0, staff: 2, busy: { 11: 0.8, 12: 1, 18: 0.7 } },
  pharmacy:    { name: "Pharmacy", hours: [570, 1290], off: -1, staff: 3, busy: { 12: 0.5, 18: 0.8, 19: 0.7 } },
  supermarket: { name: "Supermarket", hours: [540, 1380], off: -1, staff: 8, busy: { 10: 0.6, 16: 0.8, 17: 1, 18: 1, 19: 0.8, 21: 0.5 } },
  greengrocer: { name: "Greengrocer", hours: [540, 1140], off: 0, staff: 2, busy: { 10: 0.7, 16: 0.9, 17: 0.8 } },
  fishmonger:  { name: "Fishmonger", hours: [480, 1110], off: 3, staff: 2, busy: { 10: 0.7, 16: 0.9 } },
  butcher:     { name: "Butcher (korokke too)", hours: [600, 1140], off: 0, staff: 2, busy: { 11: 0.6, 16: 1, 17: 0.9 } },
  barber:      { name: "Barber", hours: [540, 1140], off: 1, staff: 2, busy: { 10: 0.6, 14: 0.5, 17: 0.6 } },
  salon:       { name: "Hair salon", hours: [600, 1200], off: 2, staff: 4, busy: { 11: 0.7, 14: 0.9, 18: 0.7 } },
  laundromat:  { name: "Coin laundry", hours: [360, 1440], off: -1, staff: 0, busy: { 8: 0.4, 20: 0.7, 22: 0.6 } },
  drycleaner:  { name: "Dry cleaner", hours: [570, 1170], off: 0, staff: 1, busy: { 8: 0.5, 19: 0.7 } },
  bookshop:    { name: "Bookshop", hours: [600, 1260], off: -1, staff: 2, busy: { 13: 0.5, 18: 0.7 } },
  florist:     { name: "Florist", hours: [600, 1140], off: 3, staff: 1, busy: { 12: 0.4, 17: 0.6 } },
  tobacco:     { name: "Tobacconist", hours: [480, 1200], off: 0, staff: 1, busy: { 8: 0.5, 18: 0.5 } },
  electronics: { name: "Electronics", hours: [600, 1260], off: -1, staff: 6, busy: { 13: 0.6, 15: 0.8, 19: 0.7 } },
  hardware:    { name: "Hardware store", hours: [540, 1140], off: 0, staff: 2, busy: { 10: 0.6, 14: 0.5 } },
  pachinko:    { name: "Pachinko", hours: [600, 1365], off: -1, staff: 6, busy: { 10: 0.9, 13: 0.7, 19: 0.9 } },
  sento:       { name: "Sentō bathhouse", hours: [900, 1440], off: 1, staff: 2, busy: { 16: 0.6, 19: 0.8, 21: 0.9 } },
  clinic:      { name: "Clinic", hours: [540, 1110], off: 0, staff: 4, busy: { 9: 1, 10: 0.9, 15: 0.6 }, lunchClose: true },
  dentist:     { name: "Dentist", hours: [570, 1140], off: 4, staff: 3, busy: { 10: 0.7, 17: 0.8 }, lunchClose: true },
  realestate:  { name: "Estate agent", hours: [600, 1140], off: 3, staff: 3, busy: { 13: 0.5, 15: 0.6 } },
  tailor:      { name: "Tailor", hours: [600, 1140], off: 0, staff: 2, busy: { 13: 0.4 } },
  cram:        { name: "Cram school", hours: [900, 1320], off: 0, staff: 4, busy: { 18: 1, 19: 1, 20: 0.9 } },
  gym:         { name: "Gym", hours: [420, 1380], off: -1, staff: 2, busy: { 7: 0.6, 19: 1, 20: 0.9 } },
  bank:        { name: "Bank", hours: [540, 900], off: -1, weekdaysOnly: true, staff: 8, busy: { 9: 0.6, 12: 1, 14: 0.7 } },
  post:        { name: "Post office", hours: [540, 1020], off: -1, weekdaysOnly: true, staff: 5, busy: { 10: 0.6, 12: 0.8 } },
  // civic and work places
  office:      { name: "Offices", hours: [480, 1260], off: -1, weekdaysOnly: true, work: true },
  wardoffice:  { name: "Ward office", hours: [510, 1035], off: -1, weekdaysOnly: true, staff: 40, busy: { 9: 0.8, 10: 1, 14: 0.8 } },
  library:     { name: "Library", hours: [540, 1200], off: 1, staff: 8, busy: { 10: 0.6, 16: 0.9 } },
  school:      { name: "School", hours: [480, 1080], off: -1, weekdaysOnly: true, staff: 30, school: true },
  hospital:    { name: "Hospital", hours: [0, 1440], off: -1, staff: 60, busy: { 9: 1, 10: 1, 14: 0.7 } },
  koban:       { name: "Kōban", hours: [0, 1440], off: -1, staff: 2 },
  community:   { name: "Community hall", hours: [540, 1260], off: 1, staff: 2, busy: { 10: 0.6, 19: 0.6 } },
  university:  { name: "University", hours: [510, 1260], off: -1, weekdaysOnly: true, staff: 120, school: true },
  workshop:    { name: "Workshop", hours: [480, 1050], off: 0, staff: 8, work: true },
  warehouse:   { name: "Warehouse", hours: [360, 1320], off: -1, staff: 12, work: true },
  port:        { name: "Port", hours: [360, 1200], off: -1, staff: 20, work: true },
  shrine:      { name: "Shrine", hours: [360, 1020], off: -1, staff: 1, busy: { 7: 0.4, 10: 0.5, 16: 0.4 } },
  park:        { name: "Park", hours: [0, 1440], off: -1, staff: 0, busy: { 6: 0.8, 7: 0.6, 10: 0.5, 15: 0.9, 16: 1, 17: 0.7 } },
  parking:     { name: "Car park", hours: [0, 1440], off: -1, staff: 0 },
  home:        { name: "Home", hours: [0, 1440], off: -1, staff: 0, home: true }
};

// which shops line which kind of street
const SHOP_MIX = {
  Station: { konbini: 5, ramen: 4, soba: 3, izakaya: 4, cafe: 4, bakery: 2, pharmacy: 3, bookshop: 1, bento: 2, realestate: 2, karaoke: 2, pachinko: 1, bank: 1, clinic: 1, cram: 2, gym: 1, tobacco: 1, salon: 2, teishoku: 2 },
  Retail:  { konbini: 3, cafe: 4, bakery: 2, pharmacy: 3, electronics: 2, bookshop: 2, salon: 3, florist: 1, supermarket: 1, ramen: 2, teishoku: 2, tailor: 1, realestate: 1, karaoke: 1, drycleaner: 1 },
  Night:   { izakaya: 6, bar: 5, snack: 4, karaoke: 3, ramen: 3, konbini: 2, pachinko: 1, tobacco: 1 },
  Core:    { konbini: 3, cafe: 4, teishoku: 3, bento: 3, soba: 2, ramen: 2, bank: 2, post: 1, izakaya: 2, drycleaner: 1, tailor: 1 },
  Office:  { konbini: 3, cafe: 3, teishoku: 3, bento: 3, soba: 2, ramen: 2, izakaya: 3, drycleaner: 1, post: 1, clinic: 1 },
  House:   { konbini: 2, greengrocer: 2, fishmonger: 1, butcher: 1, barber: 2, laundromat: 2, drycleaner: 1, kissaten: 1, clinic: 2, dentist: 1, sento: 1, hardware: 1, tobacco: 1, bakery: 1, supermarket: 1, ramen: 1 },
  Suburb:  { konbini: 3, supermarket: 2, barber: 1, laundromat: 2, clinic: 1, dentist: 1, ramen: 1, hardware: 1, cram: 1, pharmacy: 1 },
  Village: { greengrocer: 2, konbini: 1, tobacco: 1, kissaten: 1, soba: 1, hardware: 1, barber: 1 },
  default: { konbini: 3, ramen: 2, cafe: 2, izakaya: 2, pharmacy: 1, barber: 1, laundromat: 1, bakery: 1, clinic: 1, realestate: 1 }
};

const SHOP_NAMES_A = ["Sakura", "Matsu", "Fuji", "Kiku", "Hinode", "Asahi", "Midori", "Komorebi", "Tsubaki", "Yamato", "Kaede", "Hoshi", "Nami", "Ume", "Take", "Tora", "Shiro", "Kuro", "Aoi", "Hana", "Daikoku", "Fukuya", "Marumi", "Yamaya", "Kawaguchi", "Ōmori", "Suzuran"];
const SHOP_NAMES_B = { ramen: ["Ramen", "Menya", "Chūka Soba"], izakaya: ["Izakaya", "Sakaba", "Torikizoku-ya"], bar: ["Bar", "Lounge"], snack: ["Snack"], cafe: ["Coffee", "Café"], kissaten: ["Kissa"], bakery: ["Bakery", "Pan-ya"], pharmacy: ["Drug", "Pharmacy"],
  barber: ["Barber", "Rihatsu"], salon: ["Hair", "Salon"], greengrocer: ["Yaoya"], fishmonger: ["Sakana-ya"], butcher: ["Seiniku"], laundromat: ["Coin Laundry"], drycleaner: ["Cleaning"], florist: ["Flowers", "Hanaya"], realestate: ["Fudōsan"], tailor: ["Yōfuku"],
  bookshop: ["Shoten"], teishoku: ["Shokudō", "Teishoku"], soba: ["Soba"], bento: ["Bentō"], cram: ["Seminar", "Juku"], gym: ["Fitness"], karaoke: ["Karaoke", "Utahiroba"], pachinko: ["Pachinko", "Hall"], clinic: ["Clinic", "Naika"], dentist: ["Dental"], sento: ["-yu"], electronics: ["Denki"], hardware: ["Hardware", "Kanamono"], tobacco: ["Tabako"] };
const COMPANY_A = ["Sōwa", "Nichiyō", "Kōsei", "Daitō", "Tōkon", "Shinwa", "Meiji", "Taiyō", "Heisei", "Fujimi", "Hikari", "Ōkura", "Mirai", "Kyōei", "Sanwa", "Nippa", "Marunaka"];
const COMPANY_B = ["Trading", "Insurance", "Logistics", "Systems", "Securities", "Printing", "Construction", "Pharmaceuticals", "Electric", "Foods", "Advertising", "Shipping", "Consulting", "Real Estate", "Textiles"];

export function hourly(table, minute) {
  if (!table) return 0;
  const h = Math.floor(minute / 60) % 24, f = (minute % 60) / 60;
  const at = x => { x = ((x % 24) + 24) % 24; return table[x] != null ? table[x] : null; };
  // nearest defined hours either side, interpolated; an undefined stretch falls to a low murmur
  let a = h, b = h + 1, va = at(a), vb = at(b);
  if (va == null) va = (at(a - 1) != null ? at(a - 1) * 0.5 : 0.15);
  if (vb == null) vb = (at(b + 1) != null ? at(b + 1) * 0.5 : 0.15);
  return va + (vb - va) * f;
}

export class Place {
  constructor(src, seed, index) {
    Object.assign(this, src);
    this.index = index;
    this.seed = hash32(seed, src.id | 0, 4021);
    this.purpose = choosePurpose(src, this.seed);
    // a mid-rise is flats over a shop, or offices all the way up
    if (src.kind === "midrise") {
      const flats = (src.floors || 1) > 2 && r01(this.seed, 8) < 0.6;
      if (!flats) this.purpose = "office";
      else if (r01(this.seed, 14) < 0.55) this.groundShop = weighted(SHOP_MIX[src.district] || SHOP_MIX.default, r01(this.seed, 15));
    }
    const P = PURPOSES[this.purpose] || PURPOSES.home;
    this.def = P;
    const j = r01(this.seed, 3);
    // a little personality in the hours: a quarter of an hour either way, some owners keep later
    this.open = P.hours[0] === 0 && P.hours[1] === 1440 ? 0 : P.hours[0] + Math.round((j - 0.5) * 2) * 15;
    this.close = P.hours[0] === 0 && P.hours[1] === 1440 ? 1440 : P.hours[1] + Math.round((r01(this.seed, 4) - 0.4) * 2) * 30;
    this.dayOff = P.off >= 0 ? (r01(this.seed, 5) < 0.7 ? P.off : Math.floor(r01(this.seed, 6) * 7)) : -1;
    this.name = src.label || placeName(this);
    this.units = 0; this.households = 0;
    // residents' capacity: households per building
    const area = Math.max(30, (src.w || 10) * (src.d || 10)), floors = Math.max(1, src.floors || 1);
    if (src.kind === "houses") this.units = area > 360 && floors <= 2 ? (r01(this.seed, 7) < 0.3 ? 2 : 1) : 1;
    else if (src.kind === "flats") this.units = clamp(Math.round(floors * area / 70), 2, 240);
    else if (src.kind === "midrise") this.units = this.purpose === "home" ? clamp(Math.round((floors - 1) * area / 75), 1, 120) : 0;
    else if (src.kind === "shop" && floors >= 2 && r01(this.seed, 9) < 0.55) this.units = 1;   // the family lives over the shop
    if (src.units != null) this.units = src.units;       // the host knows better (an empty house, a house that is one home)
    if (src.hours && src.hours.open != null) { const m = v => v <= 30 ? Math.round(v * 60) : v; this.open = m(src.hours.open); this.close = m(src.hours.close); if (this.close <= this.open) this.close += 1440; }
    // workers it takes: offices fill by floor area
    if (src.kind === "office" || src.kind === "tower") this.jobs = clamp(Math.round(floors * area / 14), 10, 4000);
    else if (src.kind === "midrise" && !this.units) this.jobs = clamp(Math.round(floors * area / 22), 4, 300);
    else this.jobs = P.staff ? Math.max(1, Math.round(P.staff * (1 + r01(this.seed, 10)))) : 0;
    if (this.jobs && (src.kind === "office" || src.kind === "tower" || src.kind === "midrise")) this.company = pick(COMPANY_A, r01(this.seed, 11)) + " " + pick(COMPANY_B, r01(this.seed, 12));
    // per-office culture: how late people stay
    this.overtime = src.kind === "office" || src.kind === "tower" ? 0.3 + r01(this.seed, 13) * 0.9 : 0.2;
    this.workers = null;  // filled by the census
    this.residents = null;
  }
  get home() { return this.units > 0; }
  // Open at this minute on this day? (with the calendar's day info)
  isOpen(minute, info) {
    const P = this.def;
    if (this.purpose === "home") return true;
    if (P.weekdaysOnly && info && info.offWork) return false;
    if (info && this.dayOff === info.dow) return false;
    if (info && info.newYear && !(this.purpose === "konbini" || this.purpose === "shrine" || this.purpose === "hospital" || this.purpose === "koban" || this.purpose === "park")) return false;
    if (P.lunchClose && minute >= 750 && minute < 870) return false;
    const o = this.open, c = this.close;
    if (o === 0 && c >= 1440) return true;
    if (minute >= o && minute < Math.min(c, 1440)) return true;
    if (c > 1440 && minute < c - 1440) return true;     // still going from last night
    return false;
  }
  // What the front of the place looks like now: "open", "preparing" (half an hour before: shutter half up, someone sweeping),
  // "closing" (the last half hour: noren coming in), "closed" (shutter down), with how busy it is.
  state(minute, info) {
    if (this.purpose === "home") return { open: true, phase: "home", busy: 0 };
    const open = this.isOpen(minute, info), P = this.def;
    const to = (t) => ((t - minute) % 1440 + 1440) % 1440;
    let phase = open ? "open" : "closed";
    if (!open && to(this.open) <= 40 && !(info && this.dayOff === info.dow) && !(P.weekdaysOnly && info && info.offWork)) phase = "preparing";
    else if (open && this.close < 1440 + 600 && to(this.close % 1440) <= 30 && this.close !== 1440) phase = "closing";
    const busy = open ? clamp(hourly(P.busy, minute) * (info && info.offWork && !P.night ? 1.15 : 1) * (info && (info.beforeOff || info.afterPayday) && P.night ? 1.25 : 1), 0, 1) : 0;
    return { open, phase, busy, closesAt: this.close % 1440, opensAt: this.open };
  }
  hoursText() {
    if (this.open === 0 && this.close >= 1440) return "Open 24 hours";
    const f = m => { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };
    const off = this.dayOff >= 0 ? " · closed " + ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"][this.dayOff] : this.def.weekdaysOnly ? " · weekdays" : "";
    return f(this.open) + "–" + f(this.close) + off;
  }
}

function choosePurpose(src, seed) {
  const r = r01(seed, 1), k = src.kind;
  const district = src.district || "default";
  switch (k) {
    case "houses": case "flats": return "home";
    case "midrise": return "home";      // the ground floor may still be a shop: see groundShop
    case "office": case "tower": return "office";
    case "shop": {
      const mix = SHOP_MIX[src.village ? "Village" : district] || SHOP_MIX.default;
      return weighted(mix, r);
    }
    case "civic": return weighted(src.village ? { community: 3, post: 1, koban: 1, clinic: 1 } : { wardoffice: 1, library: 2, school: 4, hospital: 1, koban: 2, community: 2, post: 2 }, r);
    case "campus": return r < 0.6 ? "university" : "school";
    case "factory": return "workshop";
    case "shed": return r < 0.6 ? "warehouse" : "workshop";
    case "wharf": return "port";
    case "shrine": return "shrine";
    case "park": return "park";
    case "parking": return "parking";
    default: return "home";
  }
}
function placeName(p) {
  const s = p.seed;
  if (p.purpose === "home") return null;
  if (p.purpose === "office") return null;   // set to the company once known
  const A = pick(SHOP_NAMES_A, r01(s, 21)), B = SHOP_NAMES_B[p.purpose];
  if (p.purpose === "konbini") return pick(["Konto Mart", "Daily Eleven", "Sunny Lawson-ya", "FamiPort"], r01(s, 22));
  if (p.purpose === "sento") return A + "-yu";
  if (B) return r01(s, 23) < 0.5 ? A + " " + pick(B, r01(s, 24)) : pick(B, r01(s, 24)) + " " + A;
  return A + " " + PURPOSES[p.purpose].name;
}
