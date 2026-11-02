// The car radio: eight dial positions (six stations, a night talk station and "off"), each playing something right now whether or not you
// are tuned in, so tuning away and back finds the song where it would have got to. Same stations, songs and talk as the web build.
// R taps to the next one; holding R opens the wheel. It only plays when you are in a car.
import { Data } from './data.js';
import { Audio_ } from './audio.js';
import { gs } from './state.js';

// the synth styles, by station style: [style index, bpm]
const STYLE_OF = { synth80: [6, 118], jpop: [7, 128], kpop: [8, 116], gfunk: [9, 92], country: [10, 100], talk: [5, 60] };

export class CarRadio {
  constructor(onChange) {
    this.onChange = onChange || (() => {});
    this.st = gs.radioStation || 0;
    this.driving = false;
    this.t0 = Math.random() * 4000;
    this.songKey = ''; this.talkI = -1;
  }

  stations() { return Data.raw.radio; }
  station(i) { const l = this.stations(); return l[((i % l.length) + l.length) % l.length]; }
  now() { return performance.now() / 1000 + this.t0; }
  isOff(i = this.st) { return !!this.station(i).off; }

  /** What is on a station right now: song, artist, position in it and its length (and the host's line on talk stations). */
  info(s) {
    const songs = s.songs;
    const total = songs.reduce((a, x) => a + x[2], 0);
    const off = songs.length * 17.3 * (this.stations().indexOf(s) + 1);
    let pos = (this.now() + off) % total, i = 0;
    while (pos >= songs[i][2]) { pos -= songs[i][2]; i++; }
    const out = { title: songs[i][0], artist: songs[i][1], pos, dur: songs[i][2], idx: i, cap: '' };
    if (s.talk) {
      const lines = Data.raw.talk_lines[s.talk];
      const li = Math.floor(this.now() / 6.5) % lines.length;
      out.cap = `${lines[li][0]}: ${lines[li][1]}`;
      out.line = li;
    }
    return out;
  }

  next(d = 1) { this.setStation(this.st + d); }

  setStation(i) {
    const n = this.stations().length;
    this.st = ((i % n) + n) % n;
    gs.radioStation = this.st;
    this.songKey = ''; this.talkI = -1;
    const s = this.station(this.st);
    this.onChange(s.off ? 'Radio off' : `${s.name}  ·  ${s.freq}  ${this.info(s).title}`);
  }

  update(isDriving) {
    this.driving = isDriving;
    const s = this.station(this.st);
    if (!isDriving || s.off) {
      if (Audio_.bandOn) Audio_.stopBand();
      this.songKey = ''; this.talkI = -1;
      if (window.speechSynthesis && speechSynthesis.speaking) speechSynthesis.cancel();
      return;
    }
    const inf = this.info(s);
    const key = this.st + ':' + inf.idx;
    const sty = STYLE_OF[s.style || 'talk'] || [5, 60];
    if (key !== this.songKey) {
      this.songKey = key;
      Audio_.playBand(sty[0], sty[1] + ((inf.idx * 5) % 9) - 4, this.st * 7 + inf.idx);
    }
    if (s.talk && inf.line !== this.talkI) { this.talkI = inf.line; this.speak(inf.cap); }
  }

  /** The host's line, read aloud where the system has a voice for it. */
  speak(text) {
    if (!window.speechSynthesis) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.slice(text.indexOf(':') + 2));
      u.rate = 1.05; u.volume = 0.7;
      speechSynthesis.speak(u);
    } catch (e) { /* no voice */ }
  }
}
