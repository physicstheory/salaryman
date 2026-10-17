extends SceneTree
func _initialize() -> void:
	for n in [1, 2, 4, 5, 6]:
		var m := load("res://assets/trees/Birch_%d.obj" % n) as Mesh
		if m == null:
			print("Birch_", n, " failed to load")
			continue
		var names := []
		for i in m.get_surface_count():
			var mat := m.surface_get_material(i)
			names.append("%d:%s/%s v=%d" % [i, mat.resource_name if mat else "none", (m as ArrayMesh).surface_get_name(i), (m.surface_get_arrays(i)[Mesh.ARRAY_VERTEX] as PackedVector3Array).size()])
		print("Birch_", n, " aabb ", m.get_aabb(), " surfaces ", names)
	quit()
