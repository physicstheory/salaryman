/* Original Salary Man app identities. Vector marks shared across phone, signs and fleet decals. */
(function(){'use strict';
const identities={ryde:['#101314','#b6f16b','RYDE.'],noodle:['#fff6e7','#d34c32','noodle'],rail:['#124e3b','#e8f1df','NH'],mynet:['#3e3169','#f1be7b','MyGram'],plane:['#f1b82d','#152c3a','EX'],card:['#17463f','#e4dbad','NHB'],note:['#b83f55','#fff1e6','SOUND'],soti:['#163a43','#eef4ea','SOTI']};
function icon(g,x,y,s,glyph){const d=identities[glyph];if(!d)return false;g.save();g.translate(x,y);g.beginPath();g.roundRect(0,0,s,s,s*.22);g.clip();g.fillStyle=d[0];g.fillRect(0,0,s,s);g.strokeStyle=d[1];g.fillStyle=d[1];g.lineWidth=s*.07;g.lineCap='round';g.lineJoin='round';
 if(glyph==='ryde'){g.beginPath();g.moveTo(s*.30,s*.74);g.lineTo(s*.30,s*.27);g.lineTo(s*.61,s*.27);g.quadraticCurveTo(s*.85,s*.44,s*.61,s*.52);g.lineTo(s*.44,s*.52);g.lineTo(s*.72,s*.74);g.stroke();g.beginPath();g.arc(s*.79,s*.76,s*.045,0,7);g.fill();}
 else if(glyph==='mynet'){g.beginPath();g.moveTo(s*.25,s*.72);g.lineTo(s*.25,s*.30);g.lineTo(s*.5,s*.53);g.lineTo(s*.75,s*.30);g.lineTo(s*.75,s*.72);g.stroke();g.fillRect(s*.65,s*.16,s*.14,s*.055);}
 else if(glyph==='noodle'){g.beginPath();g.arc(s*.5,s*.44,s*.28,0,Math.PI);g.fill();g.lineWidth=s*.035;[.37,.51,.65].forEach(v=>{g.beginPath();g.moveTo(s*v,s*.3);g.quadraticCurveTo(s*(v-.1),s*.23,s*v,s*.13);g.stroke();});g.fillRect(s*.3,s*.79,s*.4,s*.035);}
 else if(glyph==='note'){for(let i=0;i<5;i++){const h=[.25,.46,.62,.46,.25][i]*s;g.fillRect(s*(.19+i*.13),s*.5-h/2,s*.075,h);}}
 else{g.textAlign='center';g.textBaseline='middle';g.font='800 '+Math.round(s*(d[2].length>3?.23:.34))+'px sans-serif';g.fillText(d[2],s*.5,s*.51,s*.82);g.fillRect(s*.25,s*.77,s*.5,s*.035);}
 g.restore();return true;}
function wordmark(g,x,y,w,h){g.save();g.fillStyle='#101314';g.font='800 '+h+'px sans-serif';g.textBaseline='middle';g.textAlign='left';g.fillText('RYDE.',x,y+h*.5,w);g.restore();}
let fleetMaterial;
function livery(dim){const T=THREE;if(!fleetMaterial){const c=document.createElement('canvas');c.width=1024;c.height=256;const g=c.getContext('2d');g.fillStyle='#101314';g.fillRect(0,0,1024,256);g.fillStyle='#b6f16b';g.fillRect(0,222,1024,34);g.fillStyle='#fff';g.font='800 122px sans-serif';g.fillText('RYDE.',48,151);g.font='500 29px sans-serif';g.fillText('YOUR CITY. YOUR WAY.',535,112);g.fillStyle='#b6f16b';g.font='600 31px sans-serif';g.fillText('Book it. Ride it.',535,157);const t=new T.CanvasTexture(c);t.encoding=T.sRGBEncoding;t.anisotropy=4;fleetMaterial=new T.MeshStandardMaterial({map:t,roughness:.45,metalness:.12,polygonOffset:true,polygonOffsetFactor:-2});}
 const group=new T.Group();for(const side of [-1,1]){const pane=new T.Mesh(new T.PlaneGeometry(dim.L*.47,dim.H*.245),fleetMaterial);pane.rotation.y=side*Math.PI/2;pane.position.set(side*(dim.W*.5+.012),dim.H*.41,-dim.L*.045);group.add(pane);}group.userData.salaryRyde=true;return group;}
window.SalaryBrands={icon,wordmark,livery,identities};})();
