class_name PhoneMusic
extends Node
## Music in the phone and on the car radio. There are no recordings in the project, so each station is played by a small synthesiser
## band: a chord loop, a bass, a pad, a lead and (for the radio's genres) a drummer, in the style of its genre. Styles 0-5 are the phone's
## stations; 6-10 are the car radio's 80s synth, J-pop, K-pop, G-funk and country. Style 5 is the talk pad.

var playing := -1
var _player: AudioStreamPlayer
var _gen: AudioStreamGeneratorPlayback
var _t := 0.0
var _bpm := 100.0
var _style := 0
var _key := 0.0
var _rot := 0
var _ph := [0.0, 0.0, 0.0, 0.0, 0.0]
var _noise_lp := 0.0
var volume_db := -10.0:
	set(v):
		volume_db = v
		if _player:
			_player.volume_db = v
const MIX := 22050.0
# chord roots in semitones above A2, per style (four-chord loops)
const PROGS := [[0, 5, 7, 3], [0, 3, 5, 7], [2, 7, 0, 5], [0, 5, 10, 3], [0, 7, 5, 0], [0, 0, 5, 5],
	[0, 8, 3, 10], [0, 7, 9, 5], [9, 5, 0, 7], [0, 3, 5, 3], [0, 5, 7, 5]]
const SCALES := [[0, 2, 4, 7, 9], [0, 3, 5, 7, 10], [0, 2, 4, 7, 9], [0, 3, 5, 6, 7], [0, 1, 5, 7, 8], [0, 2, 4, 7, 9],
	[0, 3, 5, 7, 10], [0, 2, 4, 7, 9], [0, 2, 4, 7, 9], [0, 3, 5, 7, 10], [0, 2, 4, 7, 9]]
const THIRD := [4, 3, 4, 3, 3, 4, 3, 4, 4, 3, 4]
const DRUMS := [false, false, false, false, false, false, true, true, true, true, true]
const SWING := [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.2, 0.0]

func _ready() -> void:
	_player = AudioStreamPlayer.new()
	var g := AudioStreamGenerator.new()
	g.mix_rate = MIX
	g.buffer_length = 0.2
	_player.stream = g
	_player.volume_db = volume_db
	add_child(_player)
	process_mode = Node.PROCESS_MODE_ALWAYS

func play(style: int, bpm: float, seed_n := 0) -> void:
	_style = clampi(style, 0, PROGS.size() - 1)
	_bpm = maxf(bpm, 50.0)
	playing = _style
	_t = 0.0
	# a different song on the same station: another key and another place in the loop
	_key = [0.0, 2.0, -3.0, 5.0, -1.0, 3.0][absi(seed_n) % 6]
	_rot = absi(seed_n / 6) % 4
	if not _player.playing:
		_player.play()
	_gen = _player.get_stream_playback() as AudioStreamGeneratorPlayback

func stop() -> void:
	playing = -1
	if _player:
		_player.stop()
	_gen = null

func _hz(semi: float) -> float:
	return 110.0 * pow(2.0, (semi + _key) / 12.0)

func _process(_dt: float) -> void:
	if _gen == null or playing < 0:
		return
	var avail := _gen.get_frames_available()
	if avail <= 0:
		return
	var n := mini(avail, 2200)
	var buf := PackedVector2Array()
	buf.resize(n)
	var beat := 60.0 / _bpm
	var prog: Array = PROGS[_style]
	var scale: Array = SCALES[_style]
	var third: int = THIRD[_style]
	var drums: bool = DRUMS[_style]
	var gfunk := _style == 9
	var country := _style == 10
	var synth80 := _style == 6
	for i in n:
		var bar := (int(_t / (beat * 4.0)) + _rot) % 4
		var root: float = prog[bar]
		var step := _t / (beat * 0.5)
		var sub := int(step) % 8
		var s := 0.0
		var bt := fmod(_t, beat) / beat
		# bass: on the beat, with the fifth under it on country and an octave bounce on pop
		var broot := root - 12.0
		if country and int(_t / beat) % 2 == 1:
			broot += 7.0
		elif drums and not gfunk and int(step) % 2 == 1:
			broot += 12.0
		_ph[0] = fmod(_ph[0] + _hz(broot) / MIX, 1.0)
		var benv := exp(-(3.0 if not drums else 5.0) * bt)
		s += (sin(_ph[0] * TAU) + 0.3 * sin(_ph[0] * TAU * 2.0)) * 0.28 * benv
		# the pad: root, third, fifth (a gated pad on the 80s synth)
		var gate := 1.0
		if synth80:
			gate = 0.55 + 0.45 * float(int(step) % 2 == 0)
		for k in 3:
			var offs: Array = [0, third, 7]
			var semi: float = root + float(offs[k])
			_ph[1 + k] = fmod(_ph[1 + k] + _hz(semi) / MIX, 1.0)
			s += (_ph[1 + k] * 2.0 - 1.0) * 0.045 * (0.6 + 0.4 * sin(_t * 0.7)) * gate
		# a lead that walks the scale on the offbeats
		if _style != 5 and (sub % 2 == 1 or _style == 3 or drums):
			var note: float = root + 12.0 + float(scale[(int(step * 1.7) + bar) % scale.size()])
			if gfunk:
				note += 12.0 + sin(_t * 5.5) * 0.35
			_ph[4] = fmod(_ph[4] + _hz(note) / MIX, 1.0)
			var env := exp(-(5.0 if not country else 9.0) * fmod(step, 1.0))
			var wave := sin(_ph[4] * TAU)
			if synth80 or country:
				wave = wave * 0.5 + (_ph[4] * 2.0 - 1.0) * 0.5
			s += wave * (0.16 if not gfunk else 0.1) * env
		# the drummer: kick on one and three, snare on two and four, hats on the eighths
		if drums:
			var bi := int(_t / beat) % 4
			if bi == 0 or bi == 2:
				var kf := 90.0 * exp(-bt * 9.0) + 42.0
				s += sin(_t * TAU * kf) * 0.34 * exp(-bt * 6.0)
			_noise_lp = lerpf(_noise_lp, randf() * 2.0 - 1.0, 0.45)
			if bi == 1 or bi == 3:
				s += (randf() * 2.0 - 1.0) * 0.17 * exp(-bt * 10.0)
			var hp := fmod(step + SWING[_style] * float(int(step) % 2), 1.0)
			s += (randf() * 2.0 - 1.0 - _noise_lp) * 0.07 * exp(-hp * 14.0)
		buf[i] = Vector2(s, s)
		_t += 1.0 / MIX
	_gen.push_buffer(buf)
