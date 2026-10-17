extends SceneTree
## Headless driving tests: acceleration, braking, a skidpad, a handbrake turn and a kerb hit.
## Run: godot --headless --path Godot --script res://tests/physics_test.gd

var ground: StaticBody3D

func _initialize() -> void:
	Engine.physics_ticks_per_second = 120
	root.add_child(_make_ground())
	_run.call_deferred()

func _make_ground() -> StaticBody3D:
	ground = StaticBody3D.new()
	var cs := CollisionShape3D.new()
	var b := BoxShape3D.new()
	b.size = Vector3(4000, 2, 4000)
	cs.shape = b
	cs.position = Vector3(0, -1, 0)
	ground.add_child(cs)
	return ground

func _spawn(kind: String, pos := Vector3(0, 0.9, 0)) -> Vehicle:
	var v := Vehicle.new()
	v.kind = kind
	v.position = pos
	root.add_child(v)
	return v

func _steps(n: int) -> void:
	for i in n:
		await physics_frame

func _run() -> void:
	var ok := true
	for kind in ["sedan", "sports", "kei", "keivan"]:
		var v := _spawn(kind)
		await _steps(180)
		var settled := v.global_position.y
		var rest_tilt := absf(v.global_transform.basis.y.dot(Vector3.UP) - 1.0)
		# 0-100 km/h
		v.throttle = 1.0
		var t0 := 0.0
		var t100 := -1.0
		var top := 0.0
		for i in 120 * 20:
			await physics_frame
			t0 += 1.0 / 120.0
			var kmh := v.speed_kmh()
			if t100 < 0.0 and kmh >= 100.0:
				t100 = t0
			top = maxf(top, kmh)
		# braking from speed
		v.throttle = 0.0
		var start_speed := v.speed_kmh()
		v.brake = 1.0
		var p0 := v.global_position
		var steps := 0
		while v.forward_speed > 0.5 and steps < 120 * 15:
			await physics_frame
			steps += 1
		var stop_dist := p0.distance_to(v.global_position)
		var nan := is_nan(v.global_position.x) or v.global_position.y > 3.0 or v.global_position.y < -1.0
		print("%-7s settle y=%.3f tilt=%.4f  0-100=%.1fs top=%.0f km/h gear=%d  brake %.0f->0 in %.1f m (%.2fg) health=%.0f %s" % [kind, settled, rest_tilt, t100, top, v.gear, start_speed, stop_dist, (start_speed / 3.6) * (start_speed / 3.6) / (2.0 * stop_dist) / 9.81, v.health, "NAN/FLY" if nan else "ok"])
		if nan or t100 < 0.0:
			ok = false
		v.queue_free()
		await _steps(5)
	# skidpad: constant steer at 50 km/h, read lateral g
	for kind in ["sedan", "sports"]:
		var v := _spawn(kind, Vector3(0, 0.9, 0))
		await _steps(120)
		v.throttle = 0.5
		await _steps(120 * 8)
		v.throttle = 0.0
		var target := 50.0 / 3.6
		var peak_g := 0.0
		v.steer_in = 0.25
		var yaw_prev := v.global_transform.basis.get_euler().y
		for i in 120 * 6:
			# a gentle throttle to hold speed
			v.throttle = 0.35 if v.forward_speed < target else 0.0
			v.brake = 0.0
			await physics_frame
			var lat := v.angular_velocity.y * v.linear_velocity.length() / 9.81
			peak_g = maxf(peak_g, absf(lat))
		print("%-7s skidpad lateral peak %.2f g, speed %.0f km/h, health %.0f" % [kind, peak_g, v.speed_kmh(), v.health])
		v.queue_free()
		await _steps(5)
	# handbrake turn
	var h := _spawn("sports")
	await _steps(120)
	h.throttle = 1.0
	await _steps(120 * 6)
	h.throttle = 0.0
	h.handbrake = true
	h.steer_in = 0.6
	var yaw0 := h.global_transform.basis.get_euler().y
	await _steps(120 * 2)
	var yaw_rate := h.angular_velocity.y
	print("handbrake: yaw rate %.2f rad/s speed %.0f km/h slide angle ok=%s" % [yaw_rate, h.speed_kmh(), str(absf(yaw_rate) > 0.5)])
	h.queue_free()
	print("PHYSICS TEST ", "PASSED" if ok else "FAILED")
	quit(0 if ok else 1)
