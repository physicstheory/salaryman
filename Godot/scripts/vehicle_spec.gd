class_name VehicleSpec
extends RefCounted
## Everything that makes one car drive differently from another.
## Units are SI: kg, m, N, Nm, rad/s. Forward is -Z, up is +Y, the body origin is the centre of mass.

var name := "sedan"
var model := "res://assets/cars/sedan.glb"
var model_yaw := 180.0          # degrees: the kit's models face +Z, the vehicle faces -Z
var model_scale := Vector3.ONE
var mass := 1350.0
var body_size := Vector3(1.8, 0.85, 4.3)   # collision box
var body_clear := 0.22                      # underside above the road at rest
var wheelbase := 2.7
var front_weight := 0.55        # share of mass on the front axle
var track_f := 1.52
var track_r := 1.52
var com_height := 0.5           # centre of mass above the road at rest
var wheel_radius := 0.33
var wheel_inertia := 1.8        # kg m^2 per wheel
var travel := 0.22              # suspension travel, m
var ride_freq_f := 1.35         # Hz, sprung-mass natural frequency
var ride_freq_r := 1.45
var damping_ratio := 0.45
var rebound_ratio := 1.35       # rebound is stiffer than bump
var arb_f := 9000.0             # anti-roll bar, N per m of left-right difference
var arb_r := 6000.0
var drive := "rwd"              # rwd, fwd, awd
var awd_front_share := 0.35
var lsd := 0.0                  # limited-slip: Nm per rad/s of wheel speed difference
var torque_curve: Array[Vector2] = [Vector2(1000, 150), Vector2(2500, 230), Vector2(4500, 260), Vector2(6000, 235), Vector2(6800, 190)]
var idle_rpm := 900.0
var redline := 6800.0
var shift_up := 6000.0
var shift_down := 2400.0
var gears: Array[float] = [3.6, 2.2, 1.5, 1.1, 0.88]
var reverse_ratio := 3.4
var final_drive := 3.9
var driveline_eff := 0.88
var engine_brake := 55.0        # Nm at the engine at redline with the throttle shut
var brake_torque := 2300.0      # per wheel at full pedal
var brake_bias := 0.62          # share to the front axle
var abs_on := true
var tc_on := true
var max_steer := 33.0           # degrees at standstill
var max_steer_fast := 7.0       # degrees at 150 km/h
var steer_rate := 4.5           # how quickly the wheel follows the pedal, per second
var tyre_mu := 1.05             # peak grip coefficient on asphalt
var tyre_mu_rear := 1.05
var slip_peak_ratio := 0.13     # slip ratio at peak longitudinal force
var slip_peak_angle := 0.17     # rad of slip angle at peak lateral force
var drag_cda := 0.68            # Cd*A in m^2
var lift_cla := 0.0             # downforce, negative lift area in m^2
var esc := 0.35                 # stability control strength, 0 = off
var roll_res := 0.012
var electric := false            # one fixed gear, torque from standstill, regenerative braking on lift-off
var fallback_model := "res://assets/cars/sedan.glb"   # shown until the real mesh is dropped into assets/cars
var fallback_scale := Vector3.ONE

static func make(kind: String) -> VehicleSpec:
	var s := VehicleSpec.new()
	s.name = kind
	match kind:
		"sports":
			# the supplied sports.glb is a motorbike mesh, so the coupe body is the sedan's, lowered and widened
			s.model = "res://assets/cars/sedan.glb"
			s.model_scale = Vector3(1.04, 0.88, 1.0)
			s.mass = 1480.0; s.body_size = Vector3(1.85, 0.75, 4.4); s.body_clear = 0.12
			s.wheelbase = 2.65; s.front_weight = 0.5; s.track_f = 1.58; s.track_r = 1.6
			s.com_height = 0.45; s.wheel_radius = 0.34; s.ride_freq_f = 1.7; s.ride_freq_r = 1.85
			s.arb_f = 14000.0; s.arb_r = 9000.0; s.damping_ratio = 0.55
			s.lsd = 220.0
			s.torque_curve = [Vector2(1000, 210), Vector2(3000, 340), Vector2(5500, 430), Vector2(7500, 390), Vector2(8200, 300)]
			s.idle_rpm = 1000.0; s.redline = 8200.0; s.shift_up = 7500.0; s.shift_down = 3600.0
			s.gears = [3.2, 2.2, 1.65, 1.3, 1.05, 0.86]; s.final_drive = 3.7
			s.brake_torque = 3300.0; s.brake_bias = 0.6
			s.max_steer = 30.0; s.max_steer_fast = 5.5
			s.tyre_mu = 1.3; s.tyre_mu_rear = 1.32; s.drag_cda = 0.62; s.lift_cla = 0.55
		"kei":
			s.model = "res://assets/cars/kei.glb"
			s.mass = 860.0; s.body_size = Vector3(1.45, 0.95, 3.35); s.body_clear = 0.2
			s.wheelbase = 2.3; s.front_weight = 0.6; s.track_f = 1.3; s.track_r = 1.28
			s.com_height = 0.55; s.wheel_radius = 0.29; s.wheel_inertia = 1.1
			s.ride_freq_f = 1.25; s.ride_freq_r = 1.3; s.arb_f = 4000.0; s.arb_r = 2500.0
			s.drive = "fwd"
			s.torque_curve = [Vector2(1500, 45), Vector2(3500, 78), Vector2(6500, 95), Vector2(8000, 72)]
			s.idle_rpm = 1000.0; s.redline = 8000.0; s.shift_up = 7000.0; s.shift_down = 2800.0
			s.gears = [3.7, 2.1, 1.4, 1.0]; s.final_drive = 4.6
			s.brake_torque = 1400.0; s.tyre_mu = 0.98; s.tyre_mu_rear = 0.98; s.drag_cda = 0.72
		"rsq8":
			# Audi RS Q8: a 2.3 tonne, 4.0 V8 twin-turbo, eight-speed, quattro AWD SUV
			s.model = "res://assets/cars/rsq8.glb"
			s.fallback_scale = Vector3(1.1, 1.18, 1.07)
			s.mass = 2350.0; s.body_size = Vector3(2.0, 1.1, 4.95); s.body_clear = 0.25
			s.wheelbase = 3.0; s.front_weight = 0.56; s.track_f = 1.69; s.track_r = 1.68
			s.com_height = 0.62; s.wheel_radius = 0.4; s.wheel_inertia = 2.6; s.travel = 0.26
			s.ride_freq_f = 1.5; s.ride_freq_r = 1.6; s.arb_f = 18000.0; s.arb_r = 13000.0; s.damping_ratio = 0.5
			s.drive = "awd"; s.awd_front_share = 0.4; s.lsd = 260.0
			s.torque_curve = [Vector2(1000, 350), Vector2(2000, 700), Vector2(2200, 800), Vector2(4500, 800), Vector2(5500, 700), Vector2(6500, 560)]
			s.idle_rpm = 800.0; s.redline = 6500.0; s.shift_up = 5800.0; s.shift_down = 2200.0
			s.gears = [4.7, 3.2, 2.1, 1.7, 1.3, 1.0, 0.82, 0.64]; s.final_drive = 3.2
			s.brake_torque = 4600.0; s.brake_bias = 0.64
			s.max_steer = 32.0; s.max_steer_fast = 5.5; s.tyre_mu = 1.12; s.tyre_mu_rear = 1.12
			s.drag_cda = 0.95; s.lift_cla = 0.1
		"a7":
			# Audi A7 Sportback: 1.9 tonnes, 3.0 V6 turbo, seven-speed dual clutch, quattro
			s.model = "res://assets/cars/a7.glb"
			s.fallback_scale = Vector3(1.05, 0.98, 1.08)
			s.mass = 1950.0; s.body_size = Vector3(1.95, 0.9, 4.95); s.body_clear = 0.16
			s.wheelbase = 2.93; s.front_weight = 0.54; s.track_f = 1.65; s.track_r = 1.64
			s.com_height = 0.53; s.wheel_radius = 0.35; s.wheel_inertia = 2.0
			s.ride_freq_f = 1.55; s.ride_freq_r = 1.65; s.arb_f = 14000.0; s.arb_r = 10000.0
			s.drive = "awd"; s.awd_front_share = 0.4; s.lsd = 200.0
			s.torque_curve = [Vector2(1000, 250), Vector2(1400, 500), Vector2(4500, 500), Vector2(5500, 430), Vector2(6500, 340)]
			s.idle_rpm = 800.0; s.redline = 6500.0; s.shift_up = 5600.0; s.shift_down = 2300.0
			s.gears = [3.5, 2.3, 1.6, 1.2, 0.95, 0.78, 0.64]; s.final_drive = 4.1
			s.brake_torque = 3500.0; s.max_steer = 31.0; s.max_steer_fast = 5.5
			s.tyre_mu = 1.18; s.tyre_mu_rear = 1.18; s.drag_cda = 0.62; s.lift_cla = 0.15
		"byd_song":
			# BYD Song: a 2.0 tonne electric SUV, one motor, one gear, regenerative braking
			s.model = "res://assets/cars/byd_song.glb"
			s.fallback_scale = Vector3(1.07, 1.12, 1.04)
			s.mass = 2000.0; s.body_size = Vector3(1.95, 1.0, 4.75); s.body_clear = 0.2
			s.wheelbase = 2.77; s.front_weight = 0.53; s.track_f = 1.67; s.track_r = 1.67
			s.com_height = 0.52; s.wheel_radius = 0.36; s.wheel_inertia = 2.2
			s.ride_freq_f = 1.4; s.ride_freq_r = 1.5; s.arb_f = 12000.0; s.arb_r = 8000.0
			s.drive = "fwd"; s.electric = true
			s.torque_curve = [Vector2(0, 310), Vector2(4000, 310), Vector2(8000, 190), Vector2(12000, 120)]
			s.idle_rpm = 0.0; s.redline = 12000.0; s.shift_up = 1.0e9; s.shift_down = -1.0
			s.gears = [1.0]; s.reverse_ratio = 1.0; s.final_drive = 9.0; s.driveline_eff = 0.92
			s.engine_brake = 120.0; s.brake_torque = 3300.0
			s.max_steer = 32.0; s.max_steer_fast = 6.0; s.tyre_mu = 1.05; s.tyre_mu_rear = 1.05; s.drag_cda = 0.8
		"keivan":
			s.model = "res://assets/cars/keivan.glb"
			s.mass = 1010.0; s.body_size = Vector3(1.45, 1.2, 3.35); s.body_clear = 0.22
			s.wheelbase = 2.35; s.front_weight = 0.5; s.track_f = 1.3; s.track_r = 1.28
			s.com_height = 0.62; s.wheel_radius = 0.29; s.wheel_inertia = 1.1
			s.ride_freq_f = 1.2; s.ride_freq_r = 1.35; s.arb_f = 3500.0; s.arb_r = 2000.0
			s.drive = "rwd"
			s.torque_curve = [Vector2(1500, 46), Vector2(3500, 78), Vector2(6500, 92), Vector2(8000, 70)]
			s.idle_rpm = 1000.0; s.redline = 8000.0; s.shift_up = 6800.0; s.shift_down = 2800.0
			s.gears = [3.7, 2.1, 1.4, 1.0]; s.final_drive = 4.8
			s.brake_torque = 1500.0; s.tyre_mu = 0.95; s.tyre_mu_rear = 0.95; s.drag_cda = 0.85
	return s
