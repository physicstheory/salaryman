// The calendar a Japanese city lives by: the day of the week, public holidays (with the Monday rules and substitutes),
// Golden Week, Obon, the New Year break, school terms, payday on the 25th, bonus months, rubbish collection days per ward,
// the season, cherry blossom and summer festivals. Routines and places ask it "what kind of day is it?" and nothing else.
//
// Day 0 is the host's epoch date (Salary Man starts on Monday 6 April 2026). Minutes are minutes past midnight.

import { hash32 } from "./Rng.js";

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const GARBAGE = { burnable: "Burnable", plastic: "Plastic", cans: "Cans & bottles", paper: "Paper & cardboard", none: "" };

function nthMonday(y, m, n) { const d = new Date(Date.UTC(y, m, 1)); const first = (8 - d.getUTCDay()) % 7 + 1; return first + (n - 1) * 7; }
const key = (m, d) => m * 100 + d;

const holidayCache = new Map();
// Japan's public holidays for a year, as month*100+day keys (month 0-based) -> name
export function holidays(y) {
  if (holidayCache.has(y)) return holidayCache.get(y);
  const H = new Map();
  const add = (m, d, n) => H.set(key(m, d), n);
  add(0, 1, "New Year's Day"); add(0, nthMonday(y, 0, 2), "Coming of Age Day"); add(1, 11, "Foundation Day"); add(1, 23, "Emperor's Birthday");
  add(2, y % 4 === 0 || y % 4 === 1 ? 20 : 21, "Vernal Equinox Day"); add(3, 29, "Shōwa Day"); add(4, 3, "Constitution Day"); add(4, 4, "Greenery Day");
  add(4, 5, "Children's Day"); add(6, nthMonday(y, 6, 3), "Marine Day"); add(7, 11, "Mountain Day"); add(8, nthMonday(y, 8, 3), "Respect for the Aged Day");
  add(8, y % 4 === 0 ? 22 : 23, "Autumnal Equinox Day"); add(9, nthMonday(y, 9, 2), "Sports Day"); add(10, 3, "Culture Day"); add(10, 23, "Labour Thanksgiving Day");
  // a weekday squeezed between two holidays is a holiday too
  for (const k of [...H.keys()]) { const m = Math.floor(k / 100), d = k % 100; if (H.has(key(m, d + 2)) && !H.has(key(m, d + 1))) { const dow = new Date(Date.UTC(y, m, d + 1)).getUTCDay(); if (dow !== 0) H.set(key(m, d + 1), "Citizens' Holiday"); } }
  // a holiday on a Sunday moves to the next day that is not one
  for (const k of [...H.keys()].sort((a, b) => a - b)) {
    const m = Math.floor(k / 100), d = k % 100;
    if (new Date(Date.UTC(y, m, d)).getUTCDay() !== 0) continue;
    let dd = d + 1; while (H.has(key(m, dd))) dd++;
    H.set(key(m, dd), "Substitute Holiday");
  }
  holidayCache.set(y, H);
  return H;
}

export class Calendar {
  constructor(opts) {
    opts = opts || {};
    this.epoch = opts.epoch || Date.UTC(2026, 3, 6);   // a Monday
    this.seed = opts.seed >>> 0;
  }
  date(day) { return new Date(this.epoch + day * 86400000); }
  // everything a routine needs to know about a day
  info(day) {
    const dt = this.date(day), y = dt.getUTCFullYear(), m = dt.getUTCMonth(), d = dt.getUTCDate(), dow = dt.getUTCDay();
    const H = holidays(y), holiday = H.get(key(m, d)) || null;
    const newYear = (m === 11 && d >= 29) || (m === 0 && d <= 3);
    const obon = m === 7 && d >= 13 && d <= 16;
    const goldenWeek = (m === 3 && d >= 29) || (m === 4 && d <= 6);
    const weekend = dow === 0 || dow === 6;
    const offWork = weekend || !!holiday || newYear;
    const schoolBreak = (m === 6 && d >= 20) || m === 7 || (m === 11 && d >= 25) || (m === 0 && d <= 7) || (m === 2 && d >= 25) || (m === 3 && d <= 6);
    // payday: the 25th, or the Friday before when it falls on a weekend
    const pd = new Date(Date.UTC(y, m, 25)), pdow = pd.getUTCDay(), payDay = 25 - (pdow === 6 ? 1 : pdow === 0 ? 2 : 0);
    const season = m <= 1 || m === 11 ? "winter" : m <= 4 ? "spring" : m <= 7 ? "summer" : "autumn";
    const tomorrow = this.date(day + 1), tdow = tomorrow.getUTCDay(), tH = holidays(tomorrow.getUTCFullYear()).get(key(tomorrow.getUTCMonth(), tomorrow.getUTCDate()));
    const beforeOff = tdow === 6 || tdow === 0 || !!tH;           // "hanakin": nobody hurries home the night before a day off
    return {
      day, y, m, d, dow, weekday: WEEKDAYS[dow], holiday, weekend, offWork, newYear, obon, goldenWeek, schoolBreak,
      schoolDay: !offWork && !schoolBreak, payday: d === payDay, afterPayday: d >= payDay && d <= payDay + 3, bonus: (m === 5 || m === 11) && d >= 10 && d <= 20,
      beforeOff, season, hanami: (m === 2 && d >= 25) || (m === 3 && d <= 10), festival: (m === 6 || m === 7) && weekend,
      hatsumode: m === 0 && d <= 3, shrineDay: d === 1 || d === 15, christmasEve: m === 11 && d === 24, halloween: m === 9 && d === 31,
      label: WEEKDAYS[dow] + " " + d + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m] + (holiday ? " · " + holiday : "")
    };
  }
  // Rubbish goes out by half past eight on the ward's days: burnable twice a week, plastic once, cans and bottles once,
  // paper every other week. Each ward has its own rota, as each real ward does.
  garbage(ward, day) {
    const dow = this.date(day).getUTCDay(), r = hash32(this.seed, ward | 0, 7711);
    const burn = [[1, 4], [2, 5], [3, 6]][r % 3], plastic = [3, 1, 2][r % 3] === burn[0] ? 6 : [3, 1, 2][r % 3];
    const cans = [5, 6, 2][(r >>> 3) % 3], paper = [6, 2, 3][(r >>> 5) % 3];
    if (dow === 0) return "none";
    if (burn.indexOf(dow) >= 0) return "burnable";
    if (dow === plastic) return "plastic";
    if (dow === cans && cans !== plastic) return "cans";
    if (dow === paper && Math.floor(day / 7) % 2 === 0) return "paper";
    return "none";
  }
}

// Sun: civil dawn and dusk for Tōkonto's latitude (about 35.7°N), by day of the year, in minutes. Good to a few minutes.
export function sunTimes(cal, day) {
  const dt = cal.date(day), start = Date.UTC(dt.getUTCFullYear(), 0, 1), doy = Math.floor((dt - start) / 86400000);
  const decl = -23.44 * Math.cos(2 * Math.PI * (doy + 10) / 365) * Math.PI / 180, lat = 35.7 * Math.PI / 180;
  const h0 = -0.833 * Math.PI / 180;
  const cosH = (Math.sin(h0) - Math.sin(lat) * Math.sin(decl)) / (Math.cos(lat) * Math.cos(decl));
  const half = Math.acos(Math.max(-1, Math.min(1, cosH))) * 180 / Math.PI * 4;   // minutes
  const noon = 11 * 60 + 40;
  return { rise: noon - half, set: noon + half };
}
