extends Node
## Autoload: everything about the player that is not a node in the world. Money, health, stress,
## the bag, what is worn, what is owned, the clock. The rules are the web build's.

signal changed
signal notice(app: String, title: String, body: String, secs: float)
signal purchased(id: String)

var money := 500000
var health := 1.0                 # no passive regeneration: food, sleep and hospitals only
var stress := 0.14
var awake_min := 0.0
var clock_min := 19.0 * 60.0       # minutes since midnight; the city is set at night
var day := 1
var bag: Dictionary = {}           # id -> count
var wearing := ""                  # audio id on the ears
var owned: Dictionary = {}         # misc ownership: phones, tvs, games, gear
var device := "so24"
var shirt := "#f2f4f6"
var outdoors := false              # set by the world each frame: true in a park or open air
var waypoint := Vector3.INF
var waypoint_name := ""
var toasts: Array = []
const TIME_RATE := 1.0 / 2.0       # game minutes per real second

func _ready() -> void:
	owned["so24"] = true

# ---- stress and health, as in the web build
func strain() -> float:
	return clampf((stress - 0.5) / 0.5, 0.0, 1.0)

const COMFORT := ["ramen", "nigiri", "sushi", "salmon", "omakase", "tsukemen", "tonkotsu", "miso", "shoyu", "bento", "gyoza", "karaage", "onigiri", "nikuman", "meatbun"]
func eat_relief(id: String, rel: float) -> float:
	if rel == 0.0:
		return 0.0
	if stress > 0.3:
		for c in COMFORT:
			if id.contains(c):
				return rel * (1.6 + strain() * 1.2)
	return rel

func retail_relief(yen: float) -> void:
	if stress > 0.3:
		stress = clampf(stress - clampf(0.012 + yen / 60000.0, 0.0, 0.06), 0.0, 1.0)

func add_stress(d: float) -> void:
	stress = clampf(stress + d, 0.0, 1.0)
	changed.emit()

func hurt(d: float) -> void:
	health = clampf(health - d, 0.0, 1.0)
	changed.emit()

func tick(dt: float) -> void:
	stress = clampf(stress + dt * 0.0016, 0.0, 1.0)
	awake_min += dt * TIME_RATE
	clock_min += dt * TIME_RATE
	if clock_min >= 1440.0:
		clock_min -= 1440.0
		day += 1
	if awake_min > 4320.0:
		stress = clampf(stress + dt * 0.0004 * minf(2.5, (awake_min - 4320.0) / 2880.0), 0.0, 1.0)
	# being out in the open air is the free cure; a car or a street of shops is not
	if outdoors and stress > 0.05:
		stress = clampf(stress - dt * 0.0036, 0.0, 1.0)

func advance_minutes(m: float) -> void:
	clock_min += m
	while clock_min >= 1440.0:
		clock_min -= 1440.0
		day += 1
	changed.emit()

func clock_text() -> String:
	var m := int(clock_min) % 1440
	return "%02d:%02d" % [m / 60, m % 60]

# ---- money
func can_afford(yen: int) -> bool:
	return money >= yen

func spend(yen: int) -> bool:
	if money < yen:
		return false
	money -= yen
	retail_relief(yen)
	changed.emit()
	return true

func yen(n: int) -> String:
	var s := str(absi(n))
	var out := ""
	while s.length() > 3:
		out = "," + s.substr(s.length() - 3) + out
		s = s.substr(0, s.length() - 3)
	return "¥" + s + out

# ---- the bag
func give(id: String, n := 1) -> void:
	bag[id] = int(bag.get(id, 0)) + n
	changed.emit()

func has_item(id: String) -> bool:
	return int(bag.get(id, 0)) > 0

## Eat, drink, take or put on. Returns a line to show the player.
func use(id: String) -> String:
	if not has_item(id):
		return ""
	var it := GameData.item(id)
	var cat: String = it.get("cat", "")
	if cat == "audio":
		wearing = id if wearing != id else ""
		changed.emit()
		return "Put on %s." % it.name if wearing == id else "Took off %s." % it.name
	if cat in ["food", "drink", "med"]:
		bag[id] = int(bag[id]) - 1
		if int(bag[id]) <= 0:
			bag.erase(id)
		apply_consumable(id, it)
		return "%s. %s" % [it.name, it.get("note", "")]
	return ""

func apply_consumable(id: String, it: Dictionary) -> void:
	var s: float = float(it.get("stress", 0.0))
	var h: float = float(it.get("health", 0.0))
	stress = clampf(stress + eat_relief(id, s) if s < 0.0 else stress + s, 0.0, 1.0)
	health = clampf(health + h, 0.0, 1.0)
	if it.has("min"):
		advance_minutes(float(it.min))
	changed.emit()

# ---- messages for the toast stack above the minimap
func say(app: String, title: String, body: String, secs := 4.0) -> void:
	notice.emit(app, title, body, secs)

# ---- saving
func save_game() -> void:
	var f := FileAccess.open("user://save.json", FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify({"money": money, "health": health, "stress": stress, "bag": bag, "wearing": wearing, "owned": owned, "device": device, "shirt": shirt, "clock": clock_min, "day": day, "awake": awake_min}))

func load_game() -> bool:
	if not FileAccess.file_exists("user://save.json"):
		return false
	var f := FileAccess.open("user://save.json", FileAccess.READ)
	var d = JSON.parse_string(f.get_as_text())
	if typeof(d) != TYPE_DICTIONARY:
		return false
	money = int(d.get("money", money)); health = float(d.get("health", health)); stress = float(d.get("stress", stress))
	bag = d.get("bag", {}); wearing = d.get("wearing", ""); owned = d.get("owned", {"so24": true}); device = d.get("device", "so24")
	shirt = d.get("shirt", shirt); clock_min = float(d.get("clock", clock_min)); day = int(d.get("day", 1)); awake_min = float(d.get("awake", 0.0))
	changed.emit()
	return true
