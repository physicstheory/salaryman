// Rapier, and the collision groups the game uses: 1 is the static world, 2 is cars, 4 is people.
// Wheel rays only ever look at the world.
import RAPIER from '@dimforge/rapier3d-compat';

export const G_WORLD = 1, G_CAR = 2, G_PERSON = 4;
export const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);
export const GROUPS = {
  world: groups(G_WORLD, 0xffff),
  car: groups(G_CAR, G_WORLD | G_CAR | G_PERSON),
  person: groups(G_PERSON, G_WORLD | G_CAR),
  rayWorld: groups(0xffff, G_WORLD),
};

export const STEP = 1 / 120;

export class Physics {
  static async create() {
    await RAPIER.init();
    const p = new Physics();
    return p;
  }
  constructor() {
    this.R = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = STEP;
    this.grip = new Map();            // collider handle -> surface grip
    this.userData = new Map();        // collider handle -> any object (for things that need to know what they hit)
    this.events = new RAPIER.EventQueue(true);
  }

  step() { this.world.step(); }

  /** A fixed box in the world. `center` and `half` are {x,y,z}. */
  staticBox(cx, cy, cz, hx, hy, hz, opts = {}) {
    const body = this.world.createRigidBody(this.R.RigidBodyDesc.fixed().setTranslation(cx, cy, cz));
    const desc = this.R.ColliderDesc.cuboid(hx, hy, hz).setCollisionGroups(GROUPS.world).setFriction(opts.friction ?? 1);
    const col = this.world.createCollider(desc, body);
    if (opts.grip !== undefined) this.grip.set(col.handle, opts.grip);
    return col;
  }

  staticCylinder(cx, cy, cz, halfHeight, radius) {
    const body = this.world.createRigidBody(this.R.RigidBodyDesc.fixed().setTranslation(cx, cy, cz));
    return this.world.createCollider(this.R.ColliderDesc.cylinder(halfHeight, radius).setCollisionGroups(GROUPS.world), body);
  }

  /** Cast a ray at the static world only. Returns {toi, normal, collider} or null. */
  rayWorld(ox, oy, oz, dx, dy, dz, maxToi, exclude) {
    const ray = new this.R.Ray({ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz });
    const hit = this.world.castRayAndGetNormal(ray, maxToi, true, undefined, GROUPS.rayWorld, undefined, exclude);
    return hit;
  }

  /** Cast a ray at everything cars and people can hit, for the AI's look-ahead. */
  rayAny(ox, oy, oz, dx, dy, dz, maxToi, excludeBody) {
    const ray = new this.R.Ray({ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz });
    return this.world.castRayAndGetNormal(ray, maxToi, true, undefined, groups(0xffff, G_WORLD | G_CAR | G_PERSON), undefined, excludeBody);
  }
}
