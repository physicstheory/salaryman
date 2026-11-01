/* Salary Man character loading artwork: independent of the 3D engine. */
(function () {
  'use strict';
  var boot=document.getElementById('boot'),box=document.getElementById('bootshow');
  if(!boot||!box)return;
  var slides=['seiko_mizuho.jpg','akio.jpg','mother.jpg','receptionist.jpg','yakuza_crew.jpg','yakuza_enforcer.jpg','oyabun.jpg'];
  var focus={'seiko_mizuho.jpg':'34% 42%','akio.jpg':'36% 44%'};
  var index=Math.floor(Math.random()*slides.length),direction=0,timer=0,cleanup=0,pending=null,generation=0;
  var dwell=8000,fade=1500,failed=0;
  function active(){return !boot.hidden&&!document.hidden;}
  function stop(){generation++;clearTimeout(timer);clearTimeout(cleanup);timer=cleanup=0;if(pending){pending.onload=pending.onerror=null;pending=null;}box.classList.add('still');}
  function schedule(delay){clearTimeout(timer);if(active())timer=setTimeout(next,delay);}
  function next(){
    timer=0;if(!active())return;
    var file=slides[index++%slides.length],src='loading/'+file,token=generation,img=new Image();pending=img;
    img.onload=function(){
      if(token!==generation||!active())return;
      pending=null;failed=0;
      clearTimeout(cleanup);
      while(box.children.length>1)box.removeChild(box.firstChild);
      var previous=box.lastElementChild,slide=document.createElement('div');
      slide.className='slide '+(direction++%2?'drift-right':'drift-left');
      slide.style.backgroundImage='url("'+src+'")';slide.style.backgroundPosition=focus[file]||'50% 45%';
      slide.dataset.artwork=file;slide.setAttribute('aria-hidden','true');box.appendChild(slide);box.classList.remove('still');
      void slide.offsetWidth;slide.classList.add('on');
      if(previous){previous.classList.remove('on');cleanup=setTimeout(function(){if(previous.parentNode===box)box.removeChild(previous);cleanup=0;},fade+100);}
      schedule(dwell);
    };
    img.onerror=function(){if(token!==generation)return;pending=null;failed++;schedule(failed>=slides.length?5000:100);};
    img.src=src;
  }
  function syncMotion(){try{var prefs=JSON.parse(localStorage.getItem('konto.settings.v1')||'{}');boot.classList.toggle('reduce-motion',!!prefs.reduceMotion);}catch(e){}}
  function resume(){if(!active())return;syncMotion();box.classList.remove('still');if(!timer&&!pending)next();}
  window.loadShow=function(on,text,t){
    boot.hidden=!on;boot.setAttribute('aria-hidden',String(!on));
    if(on){
      if(text!=null)document.getElementById('bootstage').textContent=text;
      if(t!=null){var value=Math.round(Math.max(0,Math.min(1,t))*100),bar=document.getElementById('bootbar');bar.setAttribute('aria-valuenow',String(value));bar.firstElementChild.style.width=value+'%';}
      resume();
    }else stop();
  };
  // Main loading completion can set hidden directly; stop work immediately in that case too.
  new MutationObserver(function(){if(active())resume();else stop();}).observe(boot,{attributes:true,attributeFilter:['hidden']});
  document.addEventListener('visibilitychange',function(){if(active())resume();else stop();});
  syncMotion();
  fetch('loading/index.json').then(function(r){if(!r.ok)throw Error('manifest');return r.json();}).then(function(j){
    var valid=Array.isArray(j.slides)?j.slides.filter(function(f){return typeof f==='string'&&/^[\w-]+\.(?:jpe?g|png|webp)$/i.test(f);}):[];
    if(valid.length){slides=valid;index=index%slides.length;}
    if(j.focus)Object.keys(j.focus).forEach(function(f){if(/^\d{1,3}% \d{1,3}%$/.test(j.focus[f]))focus[f]=j.focus[f];});
  }).catch(function(){});
  resume();
})();
