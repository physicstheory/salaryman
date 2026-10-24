// Makes Web/music/index.json for playing the game from a browser (the desktop app builds the list itself).
// Put songs in Web/music/ (loose files = "My Music") or Web/music/<station>/ (gold1, tokonto43, soul, westside, nashville), then:
//   node Game/tools/make-music-index.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../Web/music"), AUDIO = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i, out = {};
const add = (st, file) => { const base = file.replace(AUDIO, ""), m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(base); (out[st] || (out[st] = [])).push({ f: "music/" + (st === "mymusic" && fs.existsSync(path.join(dir, file)) ? "" : st + "/") + file, a: m ? m[1].trim() : "", t: m ? m[2].trim() : base.trim() }); };
for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
  if (e.isFile() && AUDIO.test(e.name)) add("mymusic", e.name);
  else if (e.isDirectory()) for (const f of fs.readdirSync(path.join(dir, e.name))) if (AUDIO.test(f)) add(e.name.toLowerCase(), f);
}
fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify({ stations: out }, null, 1));
console.log("music/index.json: " + Object.keys(out).map(k => k + " (" + out[k].length + ")").join(", "));
