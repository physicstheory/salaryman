extends SceneTree
func _initialize() -> void:
	Engine.physics_ticks_per_second = 120
	var scene := load("res://scenes/main.tscn") as PackedScene
	var g := scene.instantiate() as Game
	g.smoke_test = true
	root.add_child(g)
	_go.call_deferred(g)
func _go(g: Game) -> void:
	for i in 120 * 14:
		await physics_frame
	for v in g.traffic:
		var ai: AIDriver
		for c in v.get_children():
			if c is AIDriver: ai = c
		var hit := ""
		if ai and ai._ray.is_colliding():
			var col = ai._ray.get_collider()
			hit = "%s d=%.1f" % [col.get_class() + ":" + str(col.name), (ai._ray.get_collision_point() - ai._ray.global_position).length()]
		print("car %s pos=%s v=%.1f head=%s steer=%.2f thr=%.2f brk=%.2f ray=%s bar=%s" % [v.kind, str(v.global_position.round()), v.forward_speed, str(ai.heading) if ai else "-", v.steer_in, v.throttle, v.brake, hit, str(g.world.barrier_distance(v.global_position, ai.heading)) if ai else ""])
	quit()
