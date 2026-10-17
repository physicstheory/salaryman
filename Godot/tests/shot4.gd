extends SceneTree
func _initialize() -> void:
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.3, 0.3, 0.35)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color.WHITE
	env.environment = e
	root.add_child(env)
	var l := DirectionalLight3D.new()
	l.rotation_degrees = Vector3(-50, 30, 0)
	root.add_child(l)
	var cam := Camera3D.new()
	root.add_child(cam)
	cam.current = true
	_go.call_deferred(cam)
func _go(cam: Camera3D) -> void:
	var files := ["sedan", "kei", "keivan", "bike"]
	for f in files:
		var scn := load("res://assets/cars/%s.glb" % f) as PackedScene
		var m := scn.instantiate() as Node3D
		root.add_child(m)
		cam.global_position = Vector3(7, 0.9, 0)
		cam.look_at(Vector3(0, 0.8, 0))
		var mk := MeshInstance3D.new()
		var sm := SphereMesh.new()
		sm.radius = 0.3
		sm.height = 0.6
		mk.mesh = sm
		mk.position = Vector3(0, 0.8, -3.2)
		root.add_child(mk)
		await process_frame
		await process_frame
		root.get_texture().get_image().save_png("/tmp/godot/shots/glb_%s.png" % f)
		var box := AABB()
		var first := true
		for n in m.find_children("*", "MeshInstance3D", true, false):
			var b := (n as MeshInstance3D).global_transform * (n as MeshInstance3D).get_aabb()
			box = b if first else box.merge(b)
			first = false
		print(f, " aabb ", box)
		m.queue_free()
		mk.queue_free()
	quit()
