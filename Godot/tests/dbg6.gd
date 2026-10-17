extends SceneTree
func _initialize() -> void:
	Engine.physics_ticks_per_second = 120
	var scene := load("res://scenes/main.tscn") as PackedScene
	var g := scene.instantiate() as Game
	g.smoke_test = true
	root.add_child(g)
	_go.call_deferred(g)
func _go(g: Game) -> void:
	var W := CityWorld.P * CityWorld.N
	var reported := {}
	var hist := {}
	for i in 120 * 40:
		await physics_frame
		for v in g.traffic:
			var ai: AIDriver
			for c in v.get_children():
				if c is AIDriver: ai = c
			var p := v.global_position
			if i % 12 == 0:
				if not hist.has(v): hist[v] = []
				hist[v].append("t=%.1f %s h=%s next=%s dl=%.0f v=%.1f" % [i / 120.0, str(p.round()), str(ai.heading), str(ai._next), ai._decided_line, v.forward_speed])
				if hist[v].size() > 10: hist[v].pop_front()
			if not reported.has(v) and (p.x < -5 or p.x > W + 5 or p.z < -5 or p.z > W + 5):
				reported[v] = true
				print("LEFT MAP: ", v.kind)
				for h in hist[v]: print("   ", h)
	quit()
