extends SceneTree
func _initialize() -> void:
	Engine.physics_ticks_per_second = 120
	Vehicle.debug = true
	var w := CityWorld.new()
	root.add_child(w)
	w.build()
	var v := Vehicle.new()
	v.kind = "sedan"
	v.position = Vector3(107, 0.9, 264)
	root.add_child(v)
	_go.call_deferred(v)
func _go(v: Vehicle) -> void:
	for i in 150:
		await physics_frame
		if i < 12 or i % 20 == 0:
			var ws := v.wheels.map(func(x): return "%.3f/%.0f/%d" % [x.length, x.load, 1 if x.grounded else 0])
			print("tick %d y=%.3f vy=%.2f %s" % [i, v.global_position.y, v.linear_velocity.y, str(ws)])
	quit()
