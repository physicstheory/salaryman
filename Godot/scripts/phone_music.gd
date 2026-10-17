class_name PhoneMusic
extends Node
## Radio and music in the phone. There are no recordings in the project, so each station is synthesised: a
## chord progression, a bass and a lead in the style of its genre, at its own tempo. Station 5 is talk radio,
## which is a pad under a slow weather report. It needs earphones on, as the web build did.

var playing := -1
var _player: AudioStreamPlayer
var _gen: AudioStreamGeneratorPlayback
var _t := 0.0
var _bpm := 100.0
var _style := 0
var _ph := [0.0, 0.0, 0.0, 0.0, 0.0]
const MIX := 22050.0
# chord roots in semitones above A2, per style (four-chord loops)
const PROGS := [[0, 5, 7, 3], [0, 3, 5, 7], [2, 7, 0, 5], [0, 5, 10, 3], [0, 7, 5, 0], [0, 0, 5, 5]]
const SCALES := [[0, 2, 4, 7, 9], [0, 3, 5, 7, 10], [0, 2, 4, 7, 9], [0, 3, 5, 6, 7], [0, 1, 5, 7, 8], [0, 2, 4, 7, 9]]

func _ready() -> void:
	_player = AudioStreamPlayer.new()
	var g := AudioStreamGenerator.new()
	g.mix_rate = MIX
	g.buffer_length = 0.2
	_player.stream = g
	_player.volume_db = -10.0
	add_child(_player)
	process_mode = Node.PROCESS_MODE_ALWAYS

func play(style: int, bpm: float) -> void:
	_style = style
	_bpm = maxf(bpm, 50.0)
	playing = style
	_t = 0.0
	if not _player.playing:
		_player.play()
	_gen = _player.get_stream_playback() as AudioStreamGeneratorPlayback

func stop() -> void:
	playing = -1
	_player.stop()
	_gen = null

func _hz(semi: float) -> float:
	return 110.0 * pow(2.0, semi / 12.0)

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
	for i in n:
		var bar := int(_t / (beat * 4.0)) % 4
		var root: float = prog[bar]
		var step := _t / (beat * 0.5)
		var sub := int(step) % 8
		var s := 0.0
		# bass on the beat
		var bh := _hz(root - 12.0)
		_ph[0] = fmod(_ph[0] + bh / MIX, 1.0)
		var benv := exp(-3.0 * fmod(_t, beat) / beat)
		s += (sin(_ph[0] * TAU) + 0.3 * sin(_ph[0] * TAU * 2.0)) * 0.28 * benv
		# the pad: root, third, fifth
		for k in 3:
			var offs: Array = [0, 4 if _style != 1 else 3, 7]
			var semi: float = root + float(offs[k])
			_ph[1 + k] = fmod(_ph[1 + k] + _hz(semi) / MIX, 1.0)
			s += (_ph[1 + k] * 2.0 - 1.0) * 0.045 * (0.6 + 0.4 * sin(_t * 0.7))
		# a lead that walks the scale on offbeats
		if _style != 5 and (sub % 2 == 1 or _style == 3):
			var note: float = root + 12.0 + float(scale[(int(step * 1.7) + bar) % scale.size()])
			_ph[4] = fmod(_ph[4] + _hz(note) / MIX, 1.0)
			var env := exp(-5.0 * fmod(step, 1.0))
			s += sin(_ph[4] * TAU) * 0.16 * env
		buf[i] = Vector2(s, s)
		_t += 1.0 / MIX
	_gen.push_buffer(buf)
