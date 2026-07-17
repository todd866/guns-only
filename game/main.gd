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
