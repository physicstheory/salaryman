// Player settings, kept between runs.
const KEY = 'salaryman.settings';
const defaults = { renderScale: 1.0, sens: 1.0, volume: 0.8, shadows: 2, bloom: false, ssao: false, ssr: false };

export const Settings = {
  v: { ...defaults },
  load() { try { Object.assign(this.v, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* defaults */ } return this; },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.v)); } catch (e) { /* storage unavailable */ } },
  set(k, val) { this.v[k] = val; this.save(); },
};
Settings.load();
