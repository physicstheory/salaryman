class_name MiniMap
extends Control
## The little map in the corner: rotates so your view is always up, shows the shops near you, the railway,
## and the waypoint (as an arrow on the edge when it is off the map).

var world: CityWorld
var player_pos := Vector3.ZERO
var cam_yaw := 0.0
var heading := 0.0              # world-space angle of the thing you are steering
var _md := MapDraw.new()
const RANGE := 130.0            # metres from the middle to the edge

func _ready() -> void:
	clip_contents = true
	custom_minimum_size = Vector2(184, 184)
	size = Vector2(184, 184)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

func _process(_dt: float) -> void:
	queue_redraw()

func _draw() -> void:
	if world == null:
		return
	var fwd := Vector2(-sin(cam_yaw), -cos(cam_yaw))
	_md.rot = -PI * 0.5 - atan2(fwd.y, fwd.x)
	_md.scale = size.x * 0.5 / RANGE
	_md.origin = size * 0.5
	_md.centre = Vector2(player_pos.x, player_pos.z)
	_md.draw(self, world, false)
	_md.draw_waypoint(self, GameState.waypoint)
	_md.draw_marker(self, player_pos.x, player_pos.z, heading, Color(1, 0.9, 0.2), 8.0)
	draw_rect(Rect2(Vector2.ZERO, size), Color(1, 1, 1, 0.55), false, 2.0)
	var f := ThemeDB.fallback_font
	draw_string(f, Vector2(size.x * 0.5 - 4, 14), "N", HORIZONTAL_ALIGNMENT_CENTER, -1, 11, Color(1, 1, 1, 0.0))
