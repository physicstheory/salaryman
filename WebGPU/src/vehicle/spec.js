// Everything that makes one car drive differently from another.
// Units are SI: kg, m, N, Nm, rad/s. Forward is -Z, up is +Y, the body origin is the centre of mass.

export class VehicleSpec {
  constructor(kind) {
    this.name = kind;
    this.model = 'sedan';             // a file in assets/cars (without .glb)
    this.modelYaw = 180;              // degrees: the models face +Z, the vehicle faces -Z
    this.modelScale = [1, 1, 1];
    this.mass = 1350;
    this.bodySize = [1.8, 0.85, 4.3];     // collision box
    this.bodyClear = 0.22;                // underside above the road at rest
    this.wheelbase = 2.7;
    this.frontWeight = 0.55;              // share of mass on the front axle
    this.trackF = 1.52;
    this.trackR = 1.52;
    this.comHeight = 0.5;                 // centre of mass above the road at rest
    this.wheelRadius = 0.33;
    this.wheelInertia = 1.8;              // kg m^2 per wheel
    this.travel = 0.22;                   // suspension travel, m
    this.rideFreqF = 1.35;                // Hz, sprung-mass natural frequency
    this.rideFreqR = 1.45;
    this.dampingRatio = 0.45;
    this.reboundRatio = 1.35;             // rebound is stiffer than bump
    this.arbF = 9000;                     // anti-roll bar, N per m of left-right difference
    this.arbR = 6000;
    this.drive = 'rwd';                   // rwd, fwd, awd
    this.awdFrontShare = 0.35;
    this.lsd = 0;
    this.torqueCurve = [[1000, 150], [2500, 230], [4500, 260], [6000, 235], [6800, 190]];
    this.idleRpm = 900;
    this.redline = 6800;
    this.shiftUp = 6000;
    this.shiftDown = 2400;
    this.gears = [3.6, 2.2, 1.5, 1.1, 0.88];
    this.reverseRatio = 3.4;
    this.finalDrive = 3.9;
    this.drivelineEff = 0.88;
    this.engineBrake = 55;                // Nm at the engine at redline with the throttle shut
    this.brakeTorque = 2300;              // per wheel at full pedal
    this.brakeBias = 0.62;                // share to the front axle
    this.absOn = true;
    this.tcOn = true;
    this.maxSteer = 33;                   // degrees at standstill
    this.maxSteerFast = 7;                // degrees at 150 km/h
    this.steerRate = 4.5;
    this.tyreMu = 1.05;                   // peak grip coefficient on asphalt
    this.tyreMuRear = 1.05;
    this.slipPeakRatio = 0.13;            // slip ratio at peak longitudinal force
    this.slipPeakAngle = 0.17;            // rad of slip angle at peak lateral force
    this.dragCda = 0.68;                  // Cd*A in m^2
    this.liftCla = 0;                     // downforce, negative lift area in m^2
    this.esc = 0.35;                      // stability control strength, 0 = off
    this.rollRes = 0.012;
    this.electric = false;                // one fixed gear, torque from standstill, regenerative braking on lift-off
    this.fallbackModel = 'sedan';         // shown until the real mesh is dropped into assets/cars
    this.fallbackScale = [1, 1, 1];
    this.paint = 0xd8dde6;                // body colour when the model has a plain paint material
  }

  static make(kind) {
    const s = new VehicleSpec(kind);
    switch (kind) {
      case 'sports':
        // the coupe body is the sedan's, lowered and widened
        Object.assign(s, { model: 'sedan', modelScale: [1.04, 0.88, 1.0], mass: 1480, bodySize: [1.85, 0.75, 4.4], bodyClear: 0.12, wheelbase: 2.65, frontWeight: 0.5, trackF: 1.58, trackR: 1.6,
          comHeight: 0.45, wheelRadius: 0.34, rideFreqF: 1.7, rideFreqR: 1.85, arbF: 14000, arbR: 9000, dampingRatio: 0.55, lsd: 220,
          torqueCurve: [[1000, 210], [3000, 340], [5500, 430], [7500, 390], [8200, 300]], idleRpm: 1000, redline: 8200, shiftUp: 7500, shiftDown: 3600,
          gears: [3.2, 2.2, 1.65, 1.3, 1.05, 0.86], finalDrive: 3.7, brakeTorque: 3300, brakeBias: 0.6, maxSteer: 30, maxSteerFast: 5.5,
          tyreMu: 1.3, tyreMuRear: 1.32, dragCda: 0.62, liftCla: 0.55, paint: 0xc0392b });
        break;
      case 'kei':
        Object.assign(s, { model: 'kei', mass: 860, bodySize: [1.45, 0.95, 3.35], bodyClear: 0.2, wheelbase: 2.3, frontWeight: 0.6, trackF: 1.3, trackR: 1.28,
          comHeight: 0.55, wheelRadius: 0.29, wheelInertia: 1.1, rideFreqF: 1.25, rideFreqR: 1.3, arbF: 4000, arbR: 2500, drive: 'fwd',
          torqueCurve: [[1500, 45], [3500, 78], [6500, 95], [8000, 72]], idleRpm: 1000, redline: 8000, shiftUp: 7000, shiftDown: 2800,
          gears: [3.7, 2.1, 1.4, 1.0], finalDrive: 4.6, brakeTorque: 1400, tyreMu: 0.98, tyreMuRear: 0.98, dragCda: 0.72 });
        break;
      case 'rsq8':
        // Audi RS Q8: a 2.3 tonne, 4.0 V8 twin-turbo, eight-speed, quattro AWD SUV
        Object.assign(s, { model: 'rsq8', fallbackScale: [1.1, 1.18, 1.07], mass: 2350, bodySize: [2.0, 1.1, 4.95], bodyClear: 0.25, wheelbase: 3.0, frontWeight: 0.56, trackF: 1.69, trackR: 1.68,
          comHeight: 0.62, wheelRadius: 0.4, wheelInertia: 2.6, travel: 0.26, rideFreqF: 1.5, rideFreqR: 1.6, arbF: 18000, arbR: 13000, dampingRatio: 0.5,
          drive: 'awd', awdFrontShare: 0.4, lsd: 260,
          torqueCurve: [[1000, 350], [2000, 700], [2200, 800], [4500, 800], [5500, 700], [6500, 560]], idleRpm: 800, redline: 6500, shiftUp: 5800, shiftDown: 2200,
          gears: [4.7, 3.2, 2.1, 1.7, 1.3, 1.0, 0.82, 0.64], finalDrive: 3.2, brakeTorque: 4600, brakeBias: 0.64,
          maxSteer: 32, maxSteerFast: 5.5, tyreMu: 1.12, tyreMuRear: 1.12, dragCda: 0.95, liftCla: 0.1, paint: 0x23262b });
        break;
      case 'a7':
        // Audi A7 Sportback: 1.9 tonnes, 3.0 V6 turbo, seven-speed dual clutch, quattro
        Object.assign(s, { model: 'a7', fallbackScale: [1.05, 0.98, 1.08], mass: 1950, bodySize: [1.95, 0.9, 4.95], bodyClear: 0.16, wheelbase: 2.93, frontWeight: 0.54, trackF: 1.65, trackR: 1.64,
          comHeight: 0.53, wheelRadius: 0.35, wheelInertia: 2.0, rideFreqF: 1.55, rideFreqR: 1.65, arbF: 14000, arbR: 10000, drive: 'awd', awdFrontShare: 0.4, lsd: 200,
          torqueCurve: [[1000, 250], [1400, 500], [4500, 500], [5500, 430], [6500, 340]], idleRpm: 800, redline: 6500, shiftUp: 5600, shiftDown: 2300,
          gears: [3.5, 2.3, 1.6, 1.2, 0.95, 0.78, 0.64], finalDrive: 4.1, brakeTorque: 3500, maxSteer: 31, maxSteerFast: 5.5,
          tyreMu: 1.18, tyreMuRear: 1.18, dragCda: 0.62, liftCla: 0.15, paint: 0x5b6b7c });
        break;
      case 'byd_song':
        // BYD Song: a 2.0 tonne electric SUV, one motor, one gear, regenerative braking
        Object.assign(s, { model: 'byd_song', fallbackScale: [1.07, 1.12, 1.04], mass: 2000, bodySize: [1.95, 1.0, 4.75], bodyClear: 0.2, wheelbase: 2.77, frontWeight: 0.53, trackF: 1.67, trackR: 1.67,
          comHeight: 0.52, wheelRadius: 0.36, wheelInertia: 2.2, rideFreqF: 1.4, rideFreqR: 1.5, arbF: 12000, arbR: 8000, drive: 'fwd', electric: true,
          torqueCurve: [[0, 310], [4000, 310], [8000, 190], [12000, 120]], idleRpm: 0, redline: 12000, shiftUp: 1.0e9, shiftDown: -1,
          gears: [1.0], reverseRatio: 1.0, finalDrive: 9.0, drivelineEff: 0.92, engineBrake: 120, brakeTorque: 3300,
          maxSteer: 32, maxSteerFast: 6, tyreMu: 1.05, tyreMuRear: 1.05, dragCda: 0.8, paint: 0xe8eaed });
        break;
      case 'keivan':
        Object.assign(s, { model: 'keivan', mass: 1010, bodySize: [1.45, 1.2, 3.35], bodyClear: 0.22, wheelbase: 2.35, frontWeight: 0.5, trackF: 1.3, trackR: 1.28,
          comHeight: 0.62, wheelRadius: 0.29, wheelInertia: 1.1, rideFreqF: 1.2, rideFreqR: 1.35, arbF: 3500, arbR: 2000, drive: 'rwd',
          torqueCurve: [[1500, 46], [3500, 78], [6500, 92], [8000, 70]], idleRpm: 1000, redline: 8000, shiftUp: 6800, shiftDown: 2800,
          gears: [3.7, 2.1, 1.4, 1.0], finalDrive: 4.8, brakeTorque: 1500, tyreMu: 0.95, tyreMuRear: 0.95, dragCda: 0.85 });
        break;
      default:
        break;   // the sedan
    }
    return s;
  }
}
