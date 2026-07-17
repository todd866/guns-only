extends Node3D
# Visual layer: also owns per-beat airframe silhouettes (drone/glider/AWACS swap) and the
# altitude-driven sky/sea/fog uniforms. Two lineages render here: powered jet drones (beats
# 1-3, both sides) and the balloon glider vs. its KJ-500 target (beat 4) -- see game/jet_mesh*
# .tscn, game/glider_mesh.tscn, game/awacs_mesh.tscn. Reads bridge/camera state; never writes
# sim/ or bridge/.
@onready var bridge = $SimBridge
@onready var player: Node3D = $PlayerJet
@onready var bandit: Node3D = $BanditJet
@onready var rig: Camera3D = $CameraRig
@onready var inp = $InputAdapter
@onready var sea: MeshInstance3D = $Sea
@onready var env_node: WorldEnvironment = $Env
@onready var sun: DirectionalLight3D = $Sun
var current_beat := 1

const DRONE_SCENE := preload("res://game/jet_mesh.tscn")
const DRONE_BANDIT_SCENE := preload("res://game/jet_mesh_bandit.tscn")
const GLIDER_SCENE := preload("res://game/glider_mesh.tscn")
const AWACS_SCENE := preload("res://game/awacs_mesh.tscn")

var _player_mesh: Node3D
var _bandit_mesh: Node3D
var _sky_mat: ShaderMaterial
var _sea_mat: ShaderMaterial

# Fog density at the extremes: hazy blue at the surface, essentially clear at 70k ft. Blended
# by an exponential atmosphere-scale-height curve in _process below, not a hard cutoff.
const FOG_DENSITY_SEA_LEVEL := 8.0e-5
const FOG_DENSITY_NEAR_SPACE := 2.0e-6
const HAZE_SCALE_M := 6000.0


func _ready() -> void:
	inp.padlock_toggled.connect(rig.toggle_padlock)
	inp.restart_requested.connect(func(): bridge.StartBeat(current_beat))
	inp.beat_selected.connect(func(i): current_beat = i; bridge.StartBeat(i); _set_beat_visuals(i))
	inp.kio_requested.connect(func(): bridge.StartBeat(current_beat))
	inp.variant_toggled.connect(func(): bridge.SetVariant(1 - bridge.GetVariant()))

	_sky_mat = env_node.environment.sky.sky_material as ShaderMaterial
	_sea_mat = sea.mesh.material as ShaderMaterial
	if _sea_mat != null:
		# The sun doesn't move: set its direction once rather than every frame.
		_sea_mat.set_shader_parameter("sun_dir", sun.global_transform.basis.z)
	_set_beat_visuals(current_beat)


# Swaps the visible airframe under PlayerJet/BanditJet for the current beat's lineage.
# Beat 4 is the balloon strike: player becomes the glider, bandit becomes the KJ-500 AWACS.
# All other beats are peer jet-drone BFM: both sides use the small powered-drone mesh (the
# bandit tinted red so it reads as hostile).
func _set_beat_visuals(beat: int) -> void:
	if _player_mesh != null:
		_player_mesh.queue_free()
	if _bandit_mesh != null:
		_bandit_mesh.queue_free()
	var player_scene: PackedScene = GLIDER_SCENE if beat == 4 else DRONE_SCENE
	var bandit_scene: PackedScene = AWACS_SCENE if beat == 4 else DRONE_BANDIT_SCENE
	_player_mesh = player_scene.instantiate()
	_bandit_mesh = bandit_scene.instantiate()
	player.add_child(_player_mesh)
	bandit.add_child(_bandit_mesh)


func _process(_delta: float) -> void:
	player.global_transform = bridge.GetPlayerTransform()
	bandit.global_transform = bridge.GetBanditTransform()
	# Smart scaling (spec §8): render the distant bandit larger-than-life so tally
	# distances match human eyes rather than pixels. 1:1 inside 250 m, up to 6x far out.
	var rng: float = bridge.GetHud()["range_m"]
	bandit.scale = Vector3.ONE * clampf(rng / 250.0, 1.0, 6.0)

	# Altitude-driven sky/sea/fog: the camera IS the drone's nose (rigid to airframe attitude),
	# so its world Y is the player's true altitude in metres.
	var altitude_m: float = rig.global_position.y
	if _sky_mat != null:
		_sky_mat.set_shader_parameter("altitude_m", altitude_m)
	if _sea_mat != null:
		_sea_mat.set_shader_parameter("altitude_m", altitude_m)
	if env_node != null and env_node.environment != null:
		var haze_t: float = exp(-maxf(altitude_m, 0.0) / HAZE_SCALE_M)
		env_node.environment.fog_density = lerpf(FOG_DENSITY_NEAR_SPACE, FOG_DENSITY_SEA_LEVEL, haze_t)
