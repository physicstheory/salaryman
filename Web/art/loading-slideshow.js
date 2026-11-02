/* Predecoded character art with compositor-only pan and crossfade timelines. */
(function(){
'use strict';
var boot=document.getElementById('boot'),box=document.getElementById('bootshow');if(!boot||!box)return;
var fallback=['seiko_mizuho.jpg','akio.jpg','mother.jpg','receptionist.jpg','yakuza_crew.jpg','yakuza_enforcer.jpg','oyabun.jpg'];
var state={ready:false,active:false,slides:0,compositor:true,intro:true},dwell=8000,fade=1500;
function motion(){try{boot.classList.toggle('reduce-motion',!!JSON.parse(localStorage.getItem('konto.settings.v1')||'{}').reduceMotion);}catch(e){}}
function sync(){motion();state.active=!boot.hidden&&!document.hidden;box.classList.toggle('still',!state.active);}
function decode(file){return new Promise(function(resolve){var im=new Image(),done=false,timer=setTimeout(function(){finish(false);},5000);function finish(ok){if(done)return;done=true;clearTimeout(timer);im.onload=im.onerror=null;resolve(ok?file:null);}im.onload=function(){if(im.decode)im.decode().then(function(){finish(true);},function(){finish(true);});else finish(true);};im.onerror=function(){finish(false);};im.src='loading/'+file;});}
var manifest=Promise.race([fetch('loading/index.json').then(function(r){if(!r.ok)throw Error('manifest');return r.json();}),new Promise(function(resolve){setTimeout(function(){resolve({});},2000);})]).catch(function(){return {};}).then(function(j){return j&&typeof j==='object'?j:{};});
var ready=manifest.then(function(j){var files=Array.isArray(j.slides)?j.slides.filter(function(f){return typeof f==='string'&&/^[\w-]+\.(?:jpe?g|png|webp)$/i.test(f);}):[];if(!files.length)files=fallback;return Promise.all(files.map(decode)).then(function(valid){return {files:valid.filter(Boolean),focus:j.focus||{}};});}).then(function(j){
 var files=j.files,n=files.length;if(!n){state.ready=true;return;}var offset=Math.floor(Math.random()*n),period=n*dwell;
 var style=document.createElement('style');style.id='salary-loading-timeline';style.textContent='@keyframes salary-load-cycle{0%{opacity:0}'+(fade/period*100)+'%{opacity:1}'+(dwell/period*100)+'%{opacity:1}'+((dwell+fade)/period*100)+'%{opacity:0}100%{opacity:0}}';document.head.appendChild(style);
 box.replaceChildren();box.classList.add('compositor');
 for(var i=0;i<n;i++){var file=files[(offset+i)%n],slide=document.createElement('div');slide.className='slide';slide.dataset.artwork=file;slide.setAttribute('aria-hidden','true');slide.style.backgroundImage='url("loading/'+file+'")';slide.style.backgroundPosition=/^\d{1,3}% \d{1,3}%$/.test(j.focus[file]||'')?j.focus[file]:'50% 45%';
  var move=['salary-load-pan','salary-load-pan-reverse','salary-load-dolly','salary-load-rise'][i%4],duration=14000+(i%3)*2000;
  slide.dataset.motion=move;slide.style.transformOrigin=slide.style.backgroundPosition;
  slide.style.animation=move+' '+duration+'ms linear infinite alternate'+(n===1?'':', salary-load-cycle '+period+'ms linear infinite');slide.style.animationDelay=n===1?'0ms':'0ms,'+(-fade-((n-i)%n)*dwell)+'ms';box.appendChild(slide);
 }
 state.ready=true;state.slides=n;sync();
});
// Generation starts as soon as art is ready; only the title handoff waits for the cards.
var introDone=new Promise(function(resolve){setTimeout(function(){state.intro=false;boot.classList.add('intro-finished');resolve();},20000);});
window.SalaryLoading={ready:ready,introDone:introDone,state:state};
window.loadShow=function(on,text,t){boot.hidden=!on;boot.setAttribute('aria-hidden',String(!on));if(on){if(text!=null)document.getElementById('bootstage').textContent=text;if(t!=null){var v=Math.round(Math.max(0,Math.min(1,t))*100),bar=document.getElementById('bootbar');bar.setAttribute('aria-valuenow',String(v));bar.firstElementChild.style.width=v+'%';}}sync();};
new MutationObserver(sync).observe(boot,{attributes:true,attributeFilter:['hidden']});document.addEventListener('visibilitychange',sync);sync();
})();
