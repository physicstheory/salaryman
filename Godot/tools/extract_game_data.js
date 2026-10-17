// Reads the web build (Web/konto.html) and writes Godot/data/game_data.json. Needs: npm i acorn.  node tools/extract_game_data.js
const fs = require("fs"), acorn = require("acorn"), vm = require("vm");
const html = fs.readFileSync("/home/user/salaryman/Web/konto.html", "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const src = scripts.reduce((a, b) => a.length > b.length ? a : b);
const ast = acorn.parse(src, { ecmaVersion: 2022, locations: false, ranges: true, allowReturnOutsideFunction: true });
const names = new Set(["SHOP_BRANDS","SHELVES","STORE_SHELVES","SHIRTS","ITEMS","ITEM","SHOP_ITEMS","ARMS_STOCK","PLAZA_FLOORS","TVS","TV_BY_ID","AUDIO_NAMES","AUDIO_PRICE","SHOP_BUILD","WHEEL_CATS","PHONE_APPS","PHONE_DOCK","BASIC_APPS","WEB","GAMES","GAME_BY_ID","FILLER_SITES","WATCHES","PHONES","CONSOLES","MENU_ITEMS","DEVICES","SO_COLOURS","PEAR_COLOURS","PEAR_PRO_COLOURS","DEVICE_ORDER","COMFORT_RE","GEAR","HOME_ACTS","RADIO_STATIONS","TALK_LINES"]);
const ctx = vm.createContext({ console, Math, Object, Array, JSON, String, Number, roundRect(){}, clamp:(v,a,b)=>Math.min(b,Math.max(a,v)), clamp01:v=>Math.min(1,Math.max(0,v)) });
const used = [], skipped = [];
for (const st of ast.body) {
  const text = src.slice(st.start, st.end);
  let declared = [];
  if (st.type === "VariableDeclaration") declared = st.declarations.map(d => d.id.name).filter(Boolean);
  const touches = st.type === "FunctionDeclaration" ? false :
    (declared.some(n => names.has(n)) || (st.type === "ExpressionStatement" && [...names].some(n => new RegExp("\\b" + n + "\\b").test(text.slice(0, 400)))));
  if (!touches) continue;
  try { vm.runInContext(text, ctx, { timeout: 2000 }); used.push(declared.join(",") || text.slice(0, 60).replace(/\n/g, " ")); }
  catch (e) { skipped.push([declared.join(",") || text.slice(0, 60).replace(/\n/g, " "), e.message]); }
}
console.log("evaluated", used.length, "skipped", skipped.length);
skipped.slice(0, 20).forEach(s => console.log("  skipped:", s[0], "->", s[1]));
const out = {};
for (const n of names) { try { const v = vm.runInContext("typeof " + n + " !== 'undefined' ? " + n + " : undefined", ctx); if (v !== undefined) out[n] = JSON.parse(JSON.stringify(v)); } catch (e) {} }
for (const k of Object.keys(out)) console.log(k, Array.isArray(out[k]) ? out[k].length + " entries" : Object.keys(out[k]).length + " keys");
fs.writeFileSync("/tmp/kk/ex/data.json", JSON.stringify(out));

// ---- the trimmed tables the Godot project reads
const d = out;
const slim = { brands: d.SHOP_BRANDS, shelves: d.SHELVES, store_shelves: d.STORE_SHELVES, items: d.ITEMS, shop_items: d.SHOP_ITEMS, arms: d.ARMS_STOCK,
  plaza: d.PLAZA_FLOORS, tvs: d.TVS, audio_names: d.AUDIO_NAMES, audio_price: d.AUDIO_PRICE, shop_build: d.SHOP_BUILD, wheel_cats: d.WHEEL_CATS,
  phone_apps: d.PHONE_APPS, phone_dock: d.PHONE_DOCK, basic_apps: d.BASIC_APPS, web: d.WEB, filler_sites: d.FILLER_SITES,
  games: d.GAMES.map(g => ({ id: g.id, name: g.name, genre: g.genre, price: g.price, on: g.on, tier: g.tier, blurb: g.blurb, rating: g.rating })),
  consoles: d.CONSOLES, devices: d.DEVICES, shirts: d.SHIRTS, gear: d.GEAR, home_acts: d.HOME_ACTS, radio: d.RADIO_STATIONS, talk_lines: d.TALK_LINES };
fs.writeFileSync(__dirname + "/../data/game_data.json", JSON.stringify(slim, null, 1));
console.log("wrote data/game_data.json with", Object.keys(slim).length, "tables");
