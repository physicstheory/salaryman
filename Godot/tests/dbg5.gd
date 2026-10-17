extends SceneTree
func _initialize() -> void:
	Engine.physics_ticks_per_second = 120
	var scene := load("res://scenes/main.tscn") as PackedScene
	var g := scene.instantiate() as Game
	g.smoke_test = true
	root.add_child(g)
	_go.call_deferred(g)
func _go(g: Game) -> void:
	var P := CityWorld.P
	var reported := {}
	for i in 120 * 25:
		await physics_frame
		for v in g.traffic:
			if reported.has(v): continue
			var ai: AIDriver
			for c in v.get_children():
				if c is AIDriver: ai = c
			var p := v.global_position
			# lateral distance from the nearest lane centre line
			var lane_err := 0.0
			if absf(ai.heading.x) > 0.5:
				var kz := roundf(p.z / P)
				var lf := Vector3(ai.heading.z, 0, -ai.heading.x)
				lane_err = absf(p.z - (kz * P + 3.0 * lf.z))
			else:
				var kx := roundf(p.x / P)
				var lf2 := Vector3(ai.heading.z, 0, -ai.heading.x)
				lane_err = absf(p.x - (kx * P + 3.0 * lf2.x))
			if lane_err > 5.0 and absf(v.forward_speed) < 12:
				reported[v] = true
				print("OFF-LANE car %s at %s heading %s err %.1f v=%.1f steer=%.2f yaw=%.0f t=%.1f" % [v.kind, str(p.round()), str(ai.heading), lane_err, v.forward_speed, v.steer_in, rad_to_deg(v.global_transform.basis.get_euler().y), i / 120.0])
	quit()
