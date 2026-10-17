extends SceneTree
func _initialize() -> void:
	Engine.physics_ticks_per_second = 120
	var g := StaticBody3D.new()
	var cs := CollisionShape3D.new()
	var b := BoxShape3D.new()
	b.size = Vector3(4000, 2, 4000)
	cs.shape = b
	cs.position = Vector3(0, -1, 0)
	g.add_child(cs)
	root.add_child(g)
	var v := Vehicle.new()
	v.kind = "sedan"
	v.position = Vector3(0, 0.9, 0)
	root.add_child(v)
	_go.call_deferred(v)
func _go(v: Vehicle) -> void:
	for i in 120:
		await physics_frame
	v.throttle = 1.0
	for i in 120 * 14:
		await physics_frame
		if i % 60 == 0:
			var w = v.wheels[2]
			print("t=%.1f v=%.0f km/h gear=%d rpm=%.0f omegaR=%.1f slipR=%.2f load=%.0f" % [i / 120.0, v.speed_kmh(), v.gear, v.rpm, w.omega * v.spec.wheel_radius, w.slip_ratio, w.load])
	quit()
