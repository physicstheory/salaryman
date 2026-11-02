class_name CamRig
extends Node3D
## One camera that does both jobs: an orbit camera on foot, a chase camera in a car.
## Mouse look is always live; in a car the camera swings back behind the direction of travel
## once the mouse has been still for a moment.

var target: Node3D
var chase := false
var yaw := 0.0
var pitch := -0.18
var dist := 5.2
var cam: Camera3D
var _idle := 0.0
var _pos := Vector3.ZERO
var _shake := 0.0
var sens := 1.0

func _ready() -> void:
	cam = Camera3D.new()
	cam.fov = 70.0
	cam.near = 0.1
	cam.far = 900.0
	cam.current = true
	add_child(cam)

## Mouse look; the game forwards the relative motion, since this node sits inside the 3D SubViewport.
func look(rel: Vector2) -> void:
	yaw -= rel.x * 0.0028 * sens
	pitch = clampf(pitch - rel.y * 0.0028 * sens, -1.2, 0.45)
	_idle = 0.0

func bump(strength: float) -> void:
	_shake = clampf(strength * 0.02, 0.0, 0.5)

func _process(dt: float) -> void:
	if target == null:
		return
	_idle += dt
	var focus := target.global_position + Vector3(0, 1.5 if not chase else 1.3, 0)
	var d := dist
	var spd := 0.0
	if chase and target is RigidBody3D:
		var v := (target as RigidBody3D).linear_velocity
		spd = v.length()
		d = 6.6 + minf(spd * 0.05, 2.0)
		var heading: float
		if spd > 3.0 and v.dot(-target.global_transform.basis.z) > 0.0:
			heading = atan2(-v.x, -v.z)
		else:
			heading = target.global_transform.basis.get_euler().y
		if _idle > 1.4:
			yaw = lerp_angle(yaw, heading, clampf(dt * 2.4, 0.0, 1.0))
			pitch = lerpf(pitch, -0.2, clampf(dt * 2.0, 0.0, 1.0))
		focus += Vector3(0, 0.4, 0)
	var basis := Basis.from_euler(Vector3(pitch, yaw, 0))
	var want := focus + basis * Vector3(0, 0, d)
	# keep the camera out of walls
	var space := get_world_3d().direct_space_state
	var q := PhysicsRayQueryParameters3D.create(focus, want)
	q.collision_mask = 1
	if target is CollisionObject3D:
		q.exclude = [(target as CollisionObject3D).get_rid()]
	var hit := space.intersect_ray(q)
	if not hit.is_empty():
		want = hit.position + (focus - want).normalized() * 0.35
	_pos = _pos.lerp(want, clampf(dt * (14.0 if not chase else 18.0), 0.0, 1.0))
	global_position = _pos
	look_at(focus, Vector3.UP)
	if _shake > 0.0:
		cam.h_offset = randf_range(-1, 1) * _shake
		cam.v_offset = randf_range(-1, 1) * _shake
		_shake = maxf(0.0, _shake - dt * 1.5)
	else:
		cam.h_offset = 0.0
		cam.v_offset = 0.0
	cam.fov = lerpf(cam.fov, 68.0 + minf(spd * 0.55, 20.0), clampf(dt * 3.0, 0.0, 1.0))

func snap_to_target() -> void:
	if target:
		_pos = target.global_position + Vector3(0, 3, 6)
