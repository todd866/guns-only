extends Node3D
@onready var bridge = $SimBridge
@onready var player: Node3D = $PlayerJet
@onready var bandit: Node3D = $BanditJet
@onready var rig: Camera3D = $CameraRig
@onready var inp = $InputAdapter
var current_beat := 1

func _ready() -> void:
	inp.padlock_toggled.connect(rig.toggle_padlock)
	inp.restart_requested.connect(func(): bridge.StartBeat(current_beat))
	inp.beat_selected.connect(func(i): current_beat = i; bridge.StartBeat(i))
	inp.kio_requested.connect(func(): bridge.StartBeat(current_beat))
	inp.variant_toggled.connect(func(): bridge.SetVariant(1 - bridge.GetVariant()))

func _process(_delta: float) -> void:
	player.global_transform = bridge.GetPlayerTransform()
	bandit.global_transform = bridge.GetBanditTransform()
	# Smart scaling (spec §8): render the distant bandit larger-than-life so tally
	# distances match human eyes rather than pixels. 1:1 inside 250 m, up to 6x far out.
	var rng: float = bridge.GetHud()["range_m"]
	bandit.scale = Vector3.ONE * clampf(rng / 250.0, 1.0, 6.0)
