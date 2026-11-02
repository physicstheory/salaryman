// Headless driving tests, as in the Godot project: settling, 0-100, braking, a skidpad and a handbrake turn.
// Run: node tools/physics_test.mjs
import { Physics } from '../src/physics.js';
import { Vehicle } from '../src/vehicle/vehicle.js';

const phys = await Physics.create();
phys.staticBox(0, -1, 0, 2000, 1, 2000);
const spawn = (kind, y = 0.9) => new Vehicle(phys, kind, { x: 0, y, z: 0 }, 0, { visual: false });
const kill = (v) => phys.world.removeRigidBody(v.body);
const steps = (v, n, f) => { for (let i = 0; i < n; i++) { if (f) f(i); v.update(1 / 120); phys.step(); } };
const pos = (v) => v.body.translation();
let ok = true;

for (const kind of ['sedan', 'sports', 'kei', 'keivan', 'rsq8', 'a7', 'byd_song']) {
  const v = spawn(kind);
  steps(v, 180);
  const settled = pos(v).y;
  v.throttle = 1;
  let t = 0, t100 = -1, top = 0;
  for (let i = 0; i < 120 * 20; i++) {
    steps(v, 1); t += 1 / 120;
    const kmh = v.speedKmh();
    if (t100 < 0 && kmh >= 100) t100 = t;
    top = Math.max(top, kmh);
  }
  v.throttle = 0;
  const startSpeed = v.speedKmh();
  v.brake = 1;
  const p0 = { ...pos(v) };
  let n = 0;
  while (v.forwardSpeed > 0.5 && n < 120 * 15) { steps(v, 1); n++; }
  const p1 = pos(v);
  const dist = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  const g = (startSpeed / 3.6) ** 2 / (2 * dist) / 9.81;
  const bad = Number.isNaN(p1.x) || p1.y > 3 || p1.y < -1;
  console.log(`${kind.padEnd(8)} settle y=${settled.toFixed(3)}  0-100=${t100.toFixed(1)}s top=${top.toFixed(0)} km/h gear=${v.gear}  brake ${startSpeed.toFixed(0)}->0 in ${dist.toFixed(1)} m (${g.toFixed(2)}g) health=${v.health.toFixed(0)} ${bad ? 'NAN/FLY' : 'ok'}`);
  if (bad || t100 < 0) ok = false;
  kill(v);
}
for (const kind of ['sedan', 'sports']) {
  const v = spawn(kind);
  steps(v, 120);
  v.throttle = 0.5; steps(v, 120 * 8); v.throttle = 0;
  const target = 50 / 3.6;
  let peak = 0;
  v.steerIn = 0.25;
  for (let i = 0; i < 120 * 6; i++) {
    v.throttle = v.forwardSpeed < target ? 0.35 : 0; v.brake = 0;
    steps(v, 1);
    const av = v.body.angvel();
    peak = Math.max(peak, Math.abs(av.y * v.speed / 9.81));
  }
  console.log(`${kind.padEnd(8)} skidpad lateral peak ${peak.toFixed(2)} g, speed ${v.speedKmh().toFixed(0)} km/h, health ${v.health.toFixed(0)}`);
  kill(v);
}
{
  const h = spawn('sports');
  steps(h, 120);
  h.throttle = 1; steps(h, 120 * 6); h.throttle = 0; h.handbrake = true; h.steerIn = 0.6;
  steps(h, 120 * 2);
  const yr = h.body.angvel().y;
  console.log(`handbrake: yaw rate ${yr.toFixed(2)} rad/s speed ${h.speedKmh().toFixed(0)} km/h ok=${Math.abs(yr) > 0.5}`);
}
console.log('PHYSICS TEST', ok ? 'PASSED' : 'FAILED');
process.exit(ok ? 0 : 1);
