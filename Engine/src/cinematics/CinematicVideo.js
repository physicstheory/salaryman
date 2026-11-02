// Optional authored/generated shots. Never replace the game scene until a video can actually play.
export class CinematicVideo {
  constructor({manifest='art/cinematics/manifest.json',document:doc=globalThis.document,fetch:fetcher=globalThis.fetch}={}) {
    this.document=doc;this.element=null;this.token=0;this.active=false;this.paused=false;this.failed=[];this.clips={};
    this.ready=fetcher?fetcher(manifest).then(r=>r.ok?r.json():{}).then(m=>{this.clips=m.clips||{};return this.clips;}).catch(()=>this.clips):Promise.resolve(this.clips);
  }
  source(key) {
    const entry=this.clips[key],src=typeof entry==='string'?entry:entry?.src;
    return typeof src==='string'&&/^art\/cinematics\/[a-zA-Z0-9_/-]+\.(mp4|webm)$/.test(src)?src:null;
  }
  play(key,at=()=>0) {
    this.stop();const src=this.source(key);if(!src)return Promise.resolve(false);
    const token=++this.token,doc=this.document,v=doc.createElement('video');this.element=v;
    v.playsInline=true;v.preload='auto';v.controls=false;v.style.cssText='position:fixed;inset:0;width:100%;height:100%;object-fit:contain;background:#000;z-index:48;display:none;pointer-events:none';
    v.setAttribute('aria-label','Cinematic video');doc.body.appendChild(v);
    return new Promise(resolve=>{
      let finished=false;const settle=ok=>{if(finished)return;finished=true;clearTimeout(timer);resolve(ok);};
      const fail=()=>{if(token!==this.token){settle(false);return;}this.failed.push(key);this.stop();settle(false);};
      const timer=setTimeout(fail,3000);
      v.addEventListener('error',fail,{once:true});
      v.addEventListener('loadeddata',async()=>{
        if(token!==this.token){settle(false);return;}
        try{v.currentTime=Math.max(0,Math.min(Number.isFinite(v.duration)?v.duration-.05:0,at()||0));if(!this.paused)await v.play();if(token!==this.token){settle(false);return;}v.style.display='block';this.active=true;settle(true);}catch(e){fail();}
      },{once:true});v.src=src;v.load();
    });
  }
  tick(dt) {
    const v=this.element;if(!this.active||this.paused||!v||v.ended)return;
    if(Math.abs(v.currentTime-(this.lastTime||0))>.005){this.stalledFor=0;this.lastTime=v.currentTime;}
    else this.stalledFor=(this.stalledFor||0)+Math.min(.1,Math.max(0,dt||0));
    if(this.stalledFor>3){this.failed.push('stalled');this.stop();}
  }
  setPaused(on) {
    this.paused=!!on;const v=this.element;if(!v||!this.active)return;
    if(on)v.pause();else v.play().catch(()=>this.stop());
  }
  stop() {
    this.token++;this.active=false;this.stalledFor=0;this.lastTime=0;const v=this.element;this.element=null;
    if(v){v.pause();v.removeAttribute('src');v.load();v.remove();}
  }
}
