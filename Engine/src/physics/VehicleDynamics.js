// Fixed-step planar bicycle dynamics. The host retains road/deck selection, collision and vertical suspension.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=(v,f=0)=>Number.isFinite(v)?v:f;
export function vehicleMass(kind={}) {
  return {bus:11000,truck:6500,fire:12500,ambulance:3200,onebox:2300,keivan:1100,kei:980,suv:1850}[kind.body]|| (kind.exotic?1550:1450);
}
export function stepCarDynamics(c,kind,input,dt,options={}) {
  dt=clamp(finite(dt),0,.1);const mass=finite(options.mass,vehicleMass(kind)),L=Math.max(1.5,finite(kind.L,4.5)),W=Math.max(.8,finite(kind.W,1.8));
  const wb=L*.61,lf=wb*.48,lr=wb-lf,Iz=mass*(L*L+W*W)/12;
  const speedLimit=Math.max(4,finite(options.top,40)),to100=Math.max(2,finite(options.to100,10));
  const wet=clamp(finite(options.wet),0,1),grip=clamp(finite(options.grip,1)*(1-.25*wet),.25,1.6);
  const throttle=clamp(finite(input.throttle),0,1),brake=clamp(finite(input.brake),0,1),steer=clamp(finite(input.steer),-1,1),hand=!!input.hand;
  let vx=finite(c.vel?.x,Math.sin(finite(c.yaw))*finite(c.speed)),vz=finite(c.vel?.y,Math.cos(finite(c.yaw))*finite(c.speed)),yaw=finite(c.yaw);
  if(!c.vel)c.vel={x:vx,y:vz};
  const state=c.dynamics||(c.dynamics={remainder:0,rate:0,angle:0,accel:0});
  for(const k of ['remainder','rate','angle','accel'])state[k]=finite(state[k]);
  state.remainder+=dt;let steps=0,side=0,under=0;
  const STEP=1/120;
  while(state.remainder+1e-9>=STEP&&steps++<12){
    state.remainder-=STEP;const fx=Math.sin(yaw),fz=Math.cos(yaw),rx=Math.cos(yaw),rz=-Math.sin(yaw);
    const u=vx*fx+vz*fz,v=vx*rx+vz*rz,ab=Math.abs(u),sign=Math.sign(u)||1;
    const maxAngle=.52/(1+ab*.045);state.angle+=(steer*maxAngle-state.angle)*(1-Math.exp(-STEP/Math.max(.09,finite(options.steerResponse,.16))));
    const transfer=mass*state.accel*.52/wb,Nf=clamp(mass*9.81*lr/wb-transfer,mass*9.81*.18,mass*9.81*.82),Nr=mass*9.81-Nf;
    const alphaF=Math.atan2(v+lf*state.rate,Math.max(ab,2))-state.angle*sign,alphaR=Math.atan2(v-lr*state.rate,Math.max(ab,2));
    const rawF=-alphaF*mass*35,rawR=-alphaR*mass*38,capF=grip*Nf,capR=grip*Nr*(hand?.42:1);
    let FyF=clamp(rawF,-capF,capF),FyR=clamp(rawR,-capR,capR);
    const pull=mass*27.78/to100,fade=clamp(1-Math.pow(ab/speedLimit,2),0,1);
    let motor=options.engineEnabled===false?0:throttle*pull*fade;if(options.engineEnabled!==false&&brake>.05&&u<=.15&&throttle===0)motor=-brake*pull*.48;
    let Fb=brake*mass*9.81*finite(options.brakeGrip,1.05)*(u>.15?1:0),FxF=-sign*Fb*.64,FxR=motor-sign*Fb*.36;
    if(hand)FxR-=Math.sign(u)*Math.min(mass*4.5,ab*mass/STEP);
    // Each axle has one grip budget shared between cornering, acceleration and braking.
    const capLongF=Math.sqrt(Math.max(0,capF*capF-FyF*FyF)),capLongR=Math.sqrt(Math.max(0,capR*capR-FyR*FyR));
    FxF=clamp(FxF,-capLongF,capLongF);FxR=clamp(FxR,-capLongR,capLongR);
    const drag=.5*1.225*.32*W*1.35*u*ab+Math.sign(u)*mass*.12;
    const slope=finite(options.slope),ax=(FxF+FxR-drag)/mass-9.81*Math.sin(slope),ay=(FyF*Math.cos(state.angle)+FyR)/mass;
    vx+=(fx*ax+rx*ay)*STEP;vz+=(fz*ax+rz*ay)*STEP;
    if(brake>.1&&u>0&&vx*fx+vz*fz<0&&throttle===0){const lateral=vx*rx+vz*rz;vx=rx*lateral;vz=rz*lateral;}
    if(throttle===0&&brake===0&&ab<.12&&Math.abs(slope)<.015){vx*=Math.exp(-STEP*12);vz*=Math.exp(-STEP*12);}
    const targetKinematic=u/wb*Math.tan(state.angle),blend=clamp((ab-2)/4,0,1);
    const dynamic=state.rate+(lf*FyF*Math.cos(state.angle)-lr*FyR)/Iz*STEP;
    state.rate=(1-blend)*(state.rate+(targetKinematic-state.rate)*(1-Math.exp(-STEP*12)))+blend*dynamic;
    const rateLimit=Math.min(2.2,grip*9.81/Math.max(ab,3)*(hand?1.5:1.15));state.rate=clamp(state.rate,-rateLimit,rateLimit);
    yaw+=state.rate*STEP;state.accel=ax;side=ay;under=clamp((Math.abs(rawF)-capF)/Math.max(capF,1),0,1);
  }
  state.remainder=Math.max(0,state.remainder);
  const fx=Math.sin(yaw),fz=Math.cos(yaw),rx=Math.cos(yaw),rz=-Math.sin(yaw);
  c.yaw=yaw;c.vel.x=finite(vx);c.vel.y=finite(vz);c.speed=finite(vx*fx+vz*fz);c.vlat=finite(vx*rx+vz*rz);c.steer=state.angle/.52;c.steerRate=state.rate;c.under=under;c.topNow=speedLimit;
  c.slide=clamp(c.vlat/7,-1,1);c.squeal=clamp(Math.abs(c.vlat)/4+under*.6,0,1);
  c.roll=finite(c.roll)+(clamp(side/9.81*.07,-.1,.1)-finite(c.roll))*(1-Math.exp(-dt*8));
  c.accelPitch=clamp(state.accel/9.81,-1,1);c.pitch=finite(c.pitch)+(-c.accelPitch*.045-finite(input.lean)*.035-finite(c.pitch))*(1-Math.exp(-dt*9));
  return {steps,mass,grip,rate:state.rate,understeer:under};
}
