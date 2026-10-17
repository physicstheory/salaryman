extends SceneTree
func _initialize() -> void:
	Engine.physics_ticks_per_second = 120
	var scene := load("res://scenes/main.tscn") as PackedScene
	Vehicle.debug = true
	var g := scene.instantiate() as Game
	g.smoke_test = true
	root.add_child(g)
	_go.call_deferred(g)
func _go(g: Game) -> void:
	for s in 3:
		for i in 120:
			await physics_frame
		var mx := 0.0
		var worst := ""
		var miny := 99.0
		for v in g.parked + g.traffic:
			var sp := v.linear_velocity.length()
			if sp > mx:
				mx = sp
				worst = "%s at %s h%.0f" % [v.kind, str(v.global_position.round()), v.health]
			miny = minf(miny, v.global_position.y)
		print("t=%d max speed %.1f m/s (%s) min y %.2f" % [s, mx, worst, miny])
	quit()
