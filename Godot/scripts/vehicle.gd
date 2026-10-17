class_name Vehicle
extends RigidBody3D
## A raycast vehicle with a real tyre model.
##
## Each wheel casts a ray, runs a spring and damper along it, and turns its share of the
## engine torque into a longitudinal and a lateral tyre force from a combined-slip curve.
## Wheel speed is its own state (it can lock, spin, or hop), the engine runs a torque curve
## through an automatic gearbox, and weight transfer, roll, aero and brakes all fall out of
## forces acting at the contact patches rather than being faked on top.

signal crashed(strength: float)

static var debug := false

class Wheel:
	var pos := Vector3.ZERO         # hardpoint in body space
	var front := false
	var left := false
	var driven := false
	var ray: RayCast3D
	var omega := 0.0                # rad/s, forward positive
	var length := 0.0               # current spring length
	var prev_length := 0.0
	var grounded := false
	var contact := Vector3.ZERO
	var normal := Vector3.UP
	var load := 0.0                 # N on the tyre this step
	var steer := 0.0                # rad
	var slip_ratio := 0.0
	var slip_angle := 0.0
	var slip := 0.0                 # combined, 1.0 = at the limit
	var surface := 1.0
	var smoke: CPUParticles3D

@export var kind := "sedan"
var spec: VehicleSpec
var wheels: Array[Wheel] = []

# driver inputs, written by the player or by the AI
var throttle := 0.0
var brake := 0.0
var steer_in := 0.0     # -1 left .. 1 right
var handbrake := false
var lights_on := false

# state
var gear := 1           # -1 reverse, 0 neutral, 1.. forward
var rpm := 900.0
var forward_speed := 0.0
var health := 100.0
var shift_timer := 0.0
var auto_reverse := true
var wrecked := false
var driver_present := false
var _prev_vel := Vector3.ZERO
var _steer_angle := 0.0
var _model: Node3D
var _headlights: Array[SpotLight3D] = []
var _brake_lights: MeshInstance3D
var _audio: AudioStreamPlayer3D
var _gen: AudioStreamGeneratorPlayback
var _phase := 0.0

func _ready() -> void:
	if spec == null:
		spec = VehicleSpec.make(kind)
	_setup_body()
	_setup_wheels()
	_setup_visuals()
	can_sleep = false
	# layer 1 is the static world, 2 is cars, 4 is people; wheel rays only ever look at the world
	collision_layer = 2
	collision_mask = 1 | 2 | 4
	continuous_cd = true
	contact_monitor = false
	# the project default damping would act as a hidden brake, so replace it
	linear_damp_mode = RigidBody3D.DAMP_MODE_REPLACE
	angular_damp_mode = RigidBody3D.DAMP_MODE_REPLACE
	linear_damp = 0.0
	angular_damp = 0.15

func _setup_body() -> void:
	mass = spec.mass
	center_of_mass_mode = RigidBody3D.CENTER_OF_MASS_MODE_CUSTOM
	center_of_mass = Vector3.ZERO
	var s := spec.body_size
	var m := spec.mass
	# a box's inertia, a little generous in yaw so the car is not twitchy
	inertia = Vector3(m / 12.0 * (s.y * s.y + s.z * s.z), m / 12.0 * (s.x * s.x + s.z * s.z) * 1.15, m / 12.0 * (s.x * s.x + s.y * s.y)) * 1.1
	var cs := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = s
	cs.shape = box
	cs.position = Vector3(0, spec.body_clear + s.y * 0.5 - spec.com_height, 0)
	add_child(cs)
	var pm := PhysicsMaterial.new()
	pm.friction = 0.15
	pm.bounce = 0.05
	physics_material_override = pm

func _setup_wheels() -> void:
	var zf := spec.wheelbase * (1.0 - spec.front_weight)
	var zr := spec.wheelbase * spec.front_weight
	# at rest the spring is compressed by g / (2 pi f)^2, so the hardpoint sits that far above full droop
	var rest_f := clampf(spec.travel - 9.81 / pow(TAU * spec.ride_freq_f, 2.0), 0.02, spec.travel)
	var rest_r := clampf(spec.travel - 9.81 / pow(TAU * spec.ride_freq_r, 2.0), 0.02, spec.travel)
	var hy_f := spec.wheel_radius + rest_f - spec.com_height
	var hy_r := spec.wheel_radius + rest_r - spec.com_height
	var layout := [
		[Vector3(-spec.track_f * 0.5, hy_f, -zf), true, true, rest_f],
		[Vector3(spec.track_f * 0.5, hy_f, -zf), true, false, rest_f],
		[Vector3(-spec.track_r * 0.5, hy_r, zr), false, true, rest_r],
		[Vector3(spec.track_r * 0.5, hy_r, zr), false, false, rest_r],
	]
	for l in layout:
		var w := Wheel.new()
		w.pos = l[0]
		w.front = l[1]
		w.left = l[2]
		w.driven = spec.drive == "awd" or (spec.drive == "fwd" and w.front) or (spec.drive == "rwd" and not w.front)
		w.length = l[3]
		w.prev_length = l[3]
		var r := RayCast3D.new()
		r.position = w.pos
		r.target_position = Vector3(0, -(spec.travel + spec.wheel_radius), 0)
		r.enabled = true
		r.collide_with_areas = false
		r.collision_mask = 1
		r.add_exception(self)
		add_child(r)
		w.ray = r
		var p := CPUParticles3D.new()
		p.emitting = false
		p.amount = 24
		p.lifetime = 1.1
		p.local_coords = false
		p.direction = Vector3(0, 1, 0)
		p.spread = 35.0
		p.initial_velocity_min = 0.6
		p.initial_velocity_max = 1.6
		p.gravity = Vector3(0, 0.5, 0)
		p.scale_amount_min = 0.5
		p.scale_amount_max = 1.2
		var qm := QuadMesh.new()
		qm.size = Vector2(0.7, 0.7)
		var mat := StandardMaterial3D.new()
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		mat.albedo_color = Color(0.82, 0.82, 0.84, 0.3)
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
		qm.material = mat
		p.mesh = qm
		p.position = w.pos + Vector3(0, -spec.com_height * 0.0 - spec.wheel_radius, 0)
		add_child(p)
		w.smoke = p
		wheels.append(w)

func _setup_visuals() -> void:
	var scene := load(spec.model) as PackedScene
	if scene:
		_model = scene.instantiate()
		_model.rotation_degrees.y = spec.model_yaw
		_model.position.y = -spec.com_height
		add_child(_model)
	else:
		var mi := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = spec.body_size
		mi.mesh = bm
		add_child(mi)
	var zf := spec.wheelbase * (1.0 - spec.front_weight)
	for sx in [-1.0, 1.0]:
		var sp := SpotLight3D.new()
		sp.position = Vector3(sx * spec.body_size.x * 0.32, spec.body_clear + spec.body_size.y * 0.55 - spec.com_height, -(zf + 1.0))
		sp.rotation_degrees.x = -6.0
		sp.spot_range = 45.0
		sp.spot_angle = 32.0
		sp.light_energy = 2.4
		sp.light_color = Color(1.0, 0.95, 0.82)
		sp.visible = false
		add_child(sp)
		_headlights.append(sp)
	_audio = AudioStreamPlayer3D.new()
	var gen := AudioStreamGenerator.new()
	gen.mix_rate = 22050.0
	gen.buffer_length = 0.15
	_audio.stream = gen
	_audio.unit_size = 8.0
	_audio.max_distance = 70.0
	_audio.volume_db = -8.0
	add_child(_audio)

func start_engine_audio() -> void:
	if _audio and not _audio.playing:
		_audio.play()
		_gen = _audio.get_stream_playback() as AudioStreamGeneratorPlayback

func _torque_at(r: float) -> float:
	var c := spec.torque_curve
	if r <= c[0].x:
		return c[0].y
	for i in range(1, c.size()):
		if r <= c[i].x:
			var t := (r - c[i - 1].x) / (c[i].x - c[i - 1].x)
			return lerpf(c[i - 1].y, c[i].y, t)
	return c[c.size() - 1].y

func _ratio() -> float:
	if gear == -1:
		return -spec.reverse_ratio * spec.final_drive
	if gear == 0:
		return 0.0
	return spec.gears[gear - 1] * spec.final_drive

## The Pacejka-style curve, x is slip normalised so the peak sits near 1.
func _curve(x: float) -> float:
	var bx := 1.9 * x
	return sin(1.55 * atan(bx - 0.25 * (bx - atan(bx))))

func _physics_process(dt: float) -> void:
	if wrecked:
		throttle = 0.0
		brake = 0.3
	var xf := global_transform
	var up := xf.basis.y
	var fwd_body := -xf.basis.z
	var right_body := xf.basis.x
	var com_world := xf * center_of_mass
	var vel := linear_velocity
	forward_speed = vel.dot(fwd_body)
	var speed := vel.length()

	_update_steer(dt, speed)
	_update_gearbox(dt)

	# ---- suspension pass: springs first, tyres need the load
	var kf := spec.mass * 0.5 * spec.front_weight * pow(TAU * spec.ride_freq_f, 2.0)
	var kr := spec.mass * 0.5 * (1.0 - spec.front_weight) * pow(TAU * spec.ride_freq_r, 2.0)
	var mf := spec.mass * 0.5 * spec.front_weight
	var mr := spec.mass * 0.5 * (1.0 - spec.front_weight)
	var comp_l_f := 0.0
	var comp_r_f := 0.0
	var comp_l_r := 0.0
	var comp_r_r := 0.0
	for w in wheels:
		w.ray.force_raycast_update()
		w.prev_length = w.length
		if w.ray.is_colliding():
			w.contact = w.ray.get_collision_point()
			w.normal = w.ray.get_collision_normal()
			var dist := (w.ray.global_position - w.contact).length()
			w.length = clampf(dist - spec.wheel_radius, 0.0, spec.travel)
			w.grounded = dist - spec.wheel_radius <= spec.travel + 0.001
			w.surface = 1.0
			var col := w.ray.get_collider()
			if col and col.has_meta("grip"):
				w.surface = float(col.get_meta("grip"))
		else:
			w.grounded = false
			w.length = move_toward(w.length, spec.travel, dt * 2.0)
		var c := spec.travel - w.length
		if w.front:
			if w.left: comp_l_f = c
			else: comp_r_f = c
		else:
			if w.left: comp_l_r = c
			else: comp_r_r = c
	var arb_f_force := spec.arb_f * (comp_l_f - comp_r_f)
	var arb_r_force := spec.arb_r * (comp_l_r - comp_r_r)

	var brake_cmd := brake
	if gear == -1:
		brake_cmd = 0.0 if brake > 0.0 else throttle
	var drive_torque := _wheel_drive_torque()
	var driven := wheels.filter(func(x): return x.driven)

	for w in wheels:
		var k := kf if w.front else kr
		var mw := mf if w.front else mr
		var spring := 0.0
		w.load = 0.0
		if w.grounded:
			var vel_len := clampf((w.length - w.prev_length) / dt, -6.0, 6.0)
			var c := spec.travel - w.length
			spring = k * c
			var cdamp := 2.0 * spec.damping_ratio * sqrt(k * mw)
			if vel_len > 0.0:
				cdamp *= spec.rebound_ratio
			spring -= cdamp * vel_len
			var arb := arb_f_force if w.front else arb_r_force
			spring += arb if w.left else -arb
			if w.length < 0.015:
				spring += 60000.0 * (0.015 - w.length)       # bump stop
			spring = maxf(spring, 0.0)
			w.load = spring
			apply_force(up * spring, w.contact - com_world)

	# ---- tyre pass
	var any_slip := 0.0
	for w in wheels:
		var tq := 0.0
		if w.driven and not driven.is_empty():
			tq = drive_torque / float(driven.size())
		var btq := 0.0
		var bias := spec.brake_bias if w.front else 1.0 - spec.brake_bias
		btq = brake_cmd * spec.brake_torque * bias * 2.0
		if handbrake and not w.front:
			btq = spec.brake_torque * 3.0
		if not w.grounded:
			w.omega = _free_spin(w.omega, tq, btq, dt)
			w.slip = 0.0
			w.slip_ratio = 0.0
			w.slip_angle = 0.0
			w.smoke.emitting = false
			continue
		var steer_rot := Basis(up, -w.steer) if w.front else Basis.IDENTITY
		var f := (steer_rot * fwd_body)
		f = (f - w.normal * f.dot(w.normal)).normalized()
		var r := f.cross(w.normal).normalized()
		var vc := vel + angular_velocity.cross(w.contact - com_world)
		var vx := vc.dot(f)
		var vy := vc.dot(r)
		var mu := (spec.tyre_mu if w.front else spec.tyre_mu_rear) * w.surface
		if handbrake and not w.front:
			mu *= 0.72
		# load sensitivity: grip per newton falls a little as the tyre is loaded up
		var nominal := spec.mass * 9.81 * 0.25
		var mu_eff := mu * (1.0 - 0.07 * clampf(w.load / nominal - 1.0, -0.6, 1.5))
		var fmax := maxf(mu_eff * w.load, 1.0)

		# ABS and traction control work on the pedal and the throttle, not on the tyres
		var btq_use := btq
		if spec.abs_on and brake_cmd > 0.05 and absf(vx) > 3.0 and w.slip_ratio < -spec.slip_peak_ratio * 1.6 and not handbrake:
			btq_use *= 0.35
		var tq_use := tq
		if spec.tc_on and w.driven and w.slip_ratio > spec.slip_peak_ratio * 2.0 and absf(vx) > 1.5:
			tq_use *= 0.45

		var den_x := maxf(absf(vx), 2.0)
		var den_y := maxf(absf(vx), 3.0)
		var eval := func(om: float) -> Vector2:
			var kappa: float = (om * spec.wheel_radius - vx) / den_x
			var tana: float = vy / den_y
			var kn: float = kappa / spec.slip_peak_ratio
			var an: float = tana / tan(spec.slip_peak_angle)
			var tot: float = sqrt(kn * kn + an * an)
			var ft: float = fmax * _curve(tot) if tot > 0.0001 else 0.0
			var fx: float = 0.0
			var fy: float = 0.0
			if tot > 0.0001:
				fx = ft * kn / tot
				fy = -ft * an / tot
			return Vector2(fx, fy)
		var f0: Vector2 = eval.call(w.omega)
		var f1: Vector2 = eval.call(w.omega + 1.0)
		# only the rising side of the curve is treated implicitly; past the peak it would be unstable
		var kslope := maxf(f1.x - f0.x, 0.0)        # N per rad/s
		var net := tq_use - f0.x * spec.wheel_radius
		var domega := net * dt / (spec.wheel_inertia + spec.wheel_radius * kslope * dt)
		w.omega += domega
		var fx_used := clampf(f0.x + kslope * domega, -fmax, fmax)
		w.omega = clampf(w.omega, -_omega_cap(), _omega_cap())
		# brakes bite last, and cannot reverse the wheel
		var dwb := btq_use / spec.wheel_inertia * dt
		if absf(w.omega) <= dwb:
			w.omega = 0.0
		else:
			w.omega -= signf(w.omega) * dwb
		# rolling resistance
		var rr := -spec.roll_res * w.load * clampf(vx, -1.0, 1.0)
		var force := f * (fx_used + rr) + r * f0.y
		apply_force(force, w.contact - com_world)

		w.slip_ratio = (w.omega * spec.wheel_radius - vx) / den_x
		w.slip_angle = atan2(vy, den_y)
		var kn2 := w.slip_ratio / spec.slip_peak_ratio
		var an2 := tan(w.slip_angle) / tan(spec.slip_peak_angle)
		w.slip = sqrt(kn2 * kn2 + an2 * an2)
		any_slip = maxf(any_slip, w.slip)
		w.smoke.emitting = w.slip > 1.5 and speed > 2.5
		w.smoke.global_position = w.contact + Vector3(0, 0.1, 0)

	# ---- aero and the stability system
	if speed > 0.1:
		apply_central_force(-0.5 * 1.2 * spec.drag_cda * speed * vel)
		apply_central_force(-up * 0.5 * 1.2 * spec.lift_cla * speed * speed)
	if spec.esc > 0.0 and speed > 6.0 and not handbrake:
		var lat := vel.dot(right_body)
		var yaw_rate := angular_velocity.dot(up)
		# the yaw rate the steering is asking for, from a bicycle model
		var want := forward_speed * tan(_steer_angle) / spec.wheelbase
		var err := yaw_rate - want
		var slide := absf(lat) / maxf(absf(forward_speed), 1.0)
		if slide > 0.25 or absf(err) > 0.6:
			apply_torque(-up * err * spec.esc * spec.mass * 0.8 * clampf(slide * 2.0, 0.3, 1.5))

	# ---- impacts
	var impact := (linear_velocity - _prev_vel).length()
	if impact > 7.0:
		if debug:
			print("IMPACT %s %.1f tick=%d prev=%s now=%s grounded=%d thr=%.2f omega=%s" % [kind, impact, Engine.get_physics_frames(), str(_prev_vel.snapped(Vector3(0.1,0.1,0.1))), str(linear_velocity.snapped(Vector3(0.1,0.1,0.1))), wheels.filter(func(x): return x.grounded).size(), throttle, str(wheels.map(func(x): return snappedf(x.omega, 0.1)))])
		health = maxf(0.0, health - (impact - 5.0) * 1.6)
		crashed.emit(impact)
		if health <= 0.0 and not wrecked:
			wrecked = true
	_prev_vel = linear_velocity

	_update_lights()
	_update_audio()

func _omega_cap() -> float:
	# a wheel cannot be driven past what the engine's redline allows in the current gear
	var r := absf(_ratio())
	var cap := 600.0
	if r > 0.1:
		cap = spec.redline * TAU / 60.0 / r * 1.15
	return maxf(cap, 120.0)

func _free_spin(om: float, tq: float, btq: float, dt: float) -> float:
	om += tq * dt / spec.wheel_inertia
	om = clampf(om, -_omega_cap(), _omega_cap())
	var d := btq / spec.wheel_inertia * dt
	if absf(om) <= d:
		return 0.0
	om -= signf(om) * d
	return om * (1.0 - 0.02 * dt)

func _update_steer(dt: float, speed: float) -> void:
	var t := clampf(speed / 41.0, 0.0, 1.0)
	var lim := deg_to_rad(lerpf(spec.max_steer, spec.max_steer_fast, t * t))
	var target := steer_in * lim
	# the rack is quick towards centre and a touch slower outward
	var rate := spec.steer_rate * (1.4 if absf(target) < absf(_steer_angle) else 1.0)
	_steer_angle = move_toward(_steer_angle, target, rate * lim * dt * 2.0)
	for w in wheels:
		if w.front:
			w.steer = _steer_angle

func _update_gearbox(dt: float) -> void:
	shift_timer = maxf(0.0, shift_timer - dt)
	var avg := 0.0
	var n := 0
	for w in wheels:
		if w.driven:
			avg += w.omega
			n += 1
	avg = avg / maxf(1.0, float(n))
	var ratio := _ratio()
	var wheel_rpm := absf(avg) * 60.0 / TAU
	rpm = maxf(spec.idle_rpm, wheel_rpm * absf(ratio))
	if gear == -1:
		if throttle > 0.1 and forward_speed > -1.0:
			gear = 1
	else:
		if auto_reverse and brake > 0.1 and throttle < 0.1 and forward_speed < 0.8:
			gear = -1
		elif gear == 0:
			gear = 1
		elif shift_timer <= 0.0:
			if gear < spec.gears.size() and rpm > spec.shift_up and throttle > 0.2:
				gear += 1
				shift_timer = 0.28
			elif gear > 1 and rpm < spec.shift_down:
				gear -= 1
				shift_timer = 0.2

func _wheel_drive_torque() -> float:
	if shift_timer > 0.0:
		return 0.0
	var ratio := _ratio()
	if ratio == 0.0:
		return 0.0
	var thr := throttle
	if gear == -1:
		thr = brake
	var t := 0.0
	if rpm >= spec.redline:
		t = 0.0
	else:
		t = _torque_at(rpm) * thr
	if thr < 0.05:
		t = -spec.engine_brake * (rpm / spec.redline) * (1.0 if forward_speed * ratio > 0.0 or gear == -1 else 0.0)
	return t * ratio * spec.driveline_eff

func _update_lights() -> void:
	for h in _headlights:
		h.visible = lights_on

func _update_audio() -> void:
	if _gen == null:
		return
	var avail := _gen.get_frames_available()
	if avail <= 0:
		return
	var f0 := rpm / 60.0 * 0.5          # firing frequency of a four-stroke four
	var load_amt := clampf(throttle, 0.15, 1.0)
	var buf := PackedVector2Array()
	buf.resize(mini(avail, 1500))
	for i in buf.size():
		_phase += f0 / 22050.0
		if _phase > 1.0:
			_phase -= 1.0
		var s := (_phase * 2.0 - 1.0) * 0.5 + sin(_phase * TAU * 2.0) * 0.25 + sin(_phase * TAU * 0.5) * 0.15
		s = clampf(s * (0.3 + 0.4 * load_amt), -0.8, 0.8)
		buf[i] = Vector2(s, s)
	_gen.push_buffer(buf)

func reset_upright() -> void:
	var p := global_position + Vector3(0, 1.0, 0)
	var yaw := global_transform.basis.get_euler().y
	global_transform = Transform3D(Basis(Vector3.UP, yaw), p)
	linear_velocity = Vector3.ZERO
	angular_velocity = Vector3.ZERO
	for w in wheels:
		w.omega = 0.0

func speed_kmh() -> float:
	return forward_speed * 3.6
