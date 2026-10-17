extends Node
## Autoload: the shop, item, brand and phone tables, read from data/game_data.json (which
## tools/extract_game_data.js builds from the web game, so the two stay the same).

var raw: Dictionary = {}
var items: Dictionary = {}          # id -> item
var brands: Dictionary = {}

func _ready() -> void:
	var f := FileAccess.open("res://data/game_data.json", FileAccess.READ)
	if f == null:
		push_error("game_data.json is missing")
		return
	raw = JSON.parse_string(f.get_as_text())
	brands = raw.brands
	for it in raw.items:
		items[it.id] = it
	ActivityUI.register_brands()
	# shelf items that are not in the bag table still need a record
	for shelf in raw.shelves:
		for it in shelf.items:
			if not items.has(it.id):
				items[it.id] = it

func item(id: String) -> Dictionary:
	return items.get(id, {"id": id, "name": id})

func brand(id: String) -> Dictionary:
	return brands.get(id, {"name": id, "band": "#444444", "ink": "#ffffff", "stripes": ["#888888", "#444444"], "tag": ""})

## The shelves a shop sells from, in the form [{name, items: [...]}].
func shelves_for(brand_id: String) -> Array:
	match brand_id:
		"eleven", "petmart":
			var out: Array = []
			for sh in raw.shelves:
				var list: Array = []
				for it in sh.items:
					if it.get("only", brand_id) == brand_id:
						list.append(it)
				if not list.is_empty():
					out.append({"name": sh.name, "items": list})
			return out
		"arms":
			var hard: Array = []
			var under: Array = []
			for it in raw.arms:
				(hard if it.id == "baton" else under).append(it)
			return [{"name": "Hardware", "items": hard}, {"name": "Under the counter", "items": under}]
		"dokoto":
			return dokoto_shelves()
		_:
			if raw.store_shelves.has(brand_id):
				return raw.store_shelves[brand_id]
	return []

func dokoto_shelves() -> Array:
	var phones: Array = []
	for k in raw.devices:
		var d: Dictionary = raw.devices[k]
		if d.price > 0 and d.maker != "eleven" and d.maker != "petmart":
			phones.append({"id": "dev_" + k, "name": d.name, "price": d.price, "note": d.note, "device": k})
	var tvs: Array = []
	for t in raw.tvs:
		tvs.append({"id": t.id, "name": t.name, "price": t.price, "note": t.note, "tv": true})
	var audio: Array = []
	for k in ["earbuds", "headphones"]:
		for s in raw.shop_items:
			if s.id == k:
				audio.append({"id": k, "name": s.name, "price": s.price, "note": s.note, "audio": true})
	for k in raw.audio_price:
		audio.append({"id": k, "name": raw.audio_names[k], "price": raw.audio_price[k], "note": "Wireless earphones", "audio": true})
	var gear: Array = []
	for k in raw.gear:
		var g: Dictionary = raw.gear[k]
		gear.append({"id": g.id, "name": g.name, "price": g.price, "note": g.note, "gear": true})
	var games: Array = []
	for g in raw.games:
		games.append({"id": "game_" + g.id, "name": g.name, "price": g.price, "note": "%s · %s" % [g.genre, g.tier.to_upper()], "game": true})
	return [{"name": "Phones", "items": phones}, {"name": "Audio", "items": audio}, {"name": "Televisions", "items": tvs}, {"name": "Consoles and watches", "items": gear}, {"name": "Games", "items": games}]
