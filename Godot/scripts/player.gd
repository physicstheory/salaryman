class_name Player
extends CharacterBody3D
## Seiko on foot. Third person, relative to the camera, with the Idle / Walk / Run clips from seiko.glb.

signal died(reason: String)

const WALK := 3.4
const RUN := 6.4
const JUMP := 4.6

var active := true
var dead := false
var cam_yaw := 0.0
var model: Node3D
var anim: AnimationPlayer
var _face := 0.0
var _clip := ""

func _ready() -> void:
	add_to_group("killable")
	collision_layer = 4
	collision_mask = 1 | 2
	var cs := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.34
	cap.height = 1.74
	cs.shape = cap
	cs.position.y = 0.87
	add_child(cs)
	floor_snap_length = 0.35
	var scn := load("res://assets/seiko.glb") as PackedScene
	if scn:
		model = scn.instantiate()
		add_child(model)
		anim = model.find_child("AnimationPlayer", true, false) as AnimationPlayer
		if anim:
			for n in ["Idle", "Walk", "Run"]:
				if anim.has_animation(n):
					anim.get_animation(n).loop_mode = Animation.LOOP_LINEAR
			_play("Idle")
	else:
		var mi := MeshInstance3D.new()
		var cm := CapsuleMesh.new()
		cm.radius = 0.34
		cm.height = 1.74
		mi.mesh = cm
		mi.position.y = 0.87
		add_child(mi)

func _play(n: String) -> void:
	if anim and n != _clip and anim.has_animation(n):
		_clip = n
		anim.play(n, 0.18)

func _physics_process(dt: float) -> void:
	if not active or dead:
		return
	var inp := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var yaw_basis := Basis(Vector3.UP, cam_yaw)
	var dir := yaw_basis * Vector3(inp.x, 0, inp.y)
	var run := Input.is_action_pressed("sprint")
	var target_speed := (RUN if run else WALK) * minf(inp.length(), 1.0)
	var hv := Vector3(velocity.x, 0, velocity.z)
	var want := dir.normalized() * target_speed if dir.length() > 0.01 else Vector3.ZERO
	hv = hv.move_toward(want, (28.0 if want != Vector3.ZERO else 36.0) * dt)
	velocity.x = hv.x
	velocity.z = hv.z
	if is_on_floor():
		velocity.y = -0.5
		if Input.is_action_just_pressed("jump"):
			velocity.y = JUMP
	else:
		velocity.y -= 9.81 * dt * 1.4
	move_and_slide()
	if hv.length() > 0.3:
		_face = lerp_angle(_face, atan2(hv.x, hv.z), clampf(dt * 12.0, 0.0, 1.0))
		_play("Run" if hv.length() > 4.5 else "Walk")
	else:
		_play("Idle")
	if model:
		model.rotation.y = _face

func die(reason := "WASTED") -> void:
	if dead:
		return
	dead = true
	visible = false
	died.emit(reason)

func revive(at: Vector3) -> void:
	dead = false
	visible = true
	global_position = at
	velocity = Vector3.ZERO
