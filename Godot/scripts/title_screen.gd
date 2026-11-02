class_name TitleScreen
extends Control
## The first thing you see: the city turning slowly behind the name, and four buttons.

signal start_new
signal start_continue

func _fit() -> void:
	position = Vector2.ZERO
	size = get_viewport().get_visible_rect().size

func _ready() -> void:
	_fit()
	get_viewport().size_changed.connect(_fit)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var shade := ColorRect.new()
	shade.color = Color(0.02, 0.02, 0.05, 0.45)
	shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(shade)
	var box := VBoxContainer.new()
	box.set_anchors_preset(Control.PRESET_TOP_LEFT)
	box.position = Vector2(110, 140)
	box.add_theme_constant_override("separation", 12)
	add_child(box)
	var t := Label.new()
	t.text = "SALARY MAN"
	t.add_theme_font_size_override("font_size", 84)
	t.add_theme_color_override("font_color", Color(1.0, 0.92, 0.7))
	box.add_child(t)
	var sub := Label.new()
	sub.text = "T Ō K O N T O   N I G H T S"
	sub.add_theme_font_size_override("font_size", 24)
	sub.add_theme_color_override("font_color", Color(1.0, 0.45, 0.65))
	box.add_child(sub)
	var gap := Control.new()
	gap.custom_minimum_size = Vector2(0, 30)
	box.add_child(gap)
	var first: Button
	for def in [["New game", func(): start_new.emit()], ["Continue", func(): start_continue.emit()], ["Quit", func(): get_tree().quit()]]:
		var b := Button.new()
		b.text = def[0]
		b.custom_minimum_size = Vector2(300, 48)
		b.add_theme_font_size_override("font_size", 22)
		b.pressed.connect(def[1])
		box.add_child(b)
		if first == null:
			first = b
		if def[0] == "Continue":
			b.disabled = not FileAccess.file_exists("user://save.json")
	first.grab_focus()
	var foot := Label.new()
	foot.text = "A night in a city that does not sleep. Eat, shop, ride the train, and try not to end up under it."
	foot.add_theme_color_override("font_color", Color(1, 1, 1, 0.55))
	foot.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	foot.position = Vector2(114, size.y - 60.0)
	add_child(foot)
