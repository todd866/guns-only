#include "GunsOnlyFlightPawn.h"
#include "GunsOnlyWorldBuilder.h"
#include "Camera/CameraComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "GameFramework/PlayerController.h"
#include "Components/StaticMeshComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/AudioComponent.h"
#include "Engine/PostProcessVolume.h"
#include "Engine/StaticMesh.h"
#include "Sound/SoundWave.h"
#include "Kismet/GameplayStatics.h"
#include "ProceduralMeshComponent.h"
#include "InputCoreTypes.h"
#include "Engine/World.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "Misc/FileHelper.h"
#include "HAL/PlatformFileManager.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"
#include "Dom/JsonObject.h"
#if WITH_EDITOR
#include "ShaderCompiler.h"
#endif

namespace
{
	double ApplyExpo(double V, double Expo)
	{
		const double C = FMath::Clamp(V, -1.0, 1.0);
		return Expo * C * C * C + (1.0 - Expo) * C;
	}

	double MoveToward(double Cur, double Target, double MaxDelta)
	{
		if (FMath::Abs(Target - Cur) <= MaxDelta)
		{
			return Target;
		}
		return Cur + (Target > Cur ? MaxDelta : -MaxDelta);
	}

	FString ProfileFilePath()
	{
		const FString HomeDir = FPlatformMisc::GetEnvironmentVariable(TEXT("HOME"));
		return FPaths::Combine(HomeDir, TEXT(".local/state/guns-only-ue/profile.json"));
	}
}

AGunsOnlyFlightPawn::AGunsOnlyFlightPawn()
{
	PrimaryActorTick.bCanEverTick = true;
	AutoPossessPlayer = EAutoReceiveInput::Player0;

	RootScene = CreateDefaultSubobject<USceneComponent>(TEXT("RootScene"));
	SetRootComponent(RootScene);

	PlayerMesh = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("PlayerF22Mesh"));
	PlayerMesh->SetupAttachment(RootScene);

	PlayerStaticMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("PlayerStaticMesh"));
	PlayerStaticMesh->SetupAttachment(RootScene);
	PlayerStaticMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	PlayerStaticMesh->SetVisibility(false);

	CobraStaticMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("CobraStaticMesh"));
	CobraStaticMesh->SetupAttachment(RootScene);
	CobraStaticMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	CobraStaticMesh->SetVisibility(false);

	CobraMainRotorMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("CobraMainRotorMesh"));
	CobraMainRotorMesh->SetupAttachment(RootScene);
	CobraMainRotorMesh->SetRelativeLocation(FVector(0.0, 0.0, 150.0));
	CobraMainRotorMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	CobraMainRotorMesh->SetVisibility(false);

	FireBossPropMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("FireBossPropMesh"));
	FireBossPropMesh->SetupAttachment(RootScene);
	FireBossPropMesh->SetRelativeLocation(FVector(575.0, 0.0, 8.0));
	FireBossPropMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	FireBossPropMesh->SetVisibility(false);

	AfterburnerMesh = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("AfterburnerPlumeMesh"));
	AfterburnerMesh->SetupAttachment(RootScene);
	AfterburnerMesh->SetRelativeLocation(FVector(-885.0, 0.0, 0.0));
	AfterburnerMesh->SetVisibility(false);

	AfterburnerStaticMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("AfterburnerStaticMesh"));
	AfterburnerStaticMesh->SetupAttachment(RootScene);
	AfterburnerStaticMesh->SetRelativeLocation(FVector(-885.0, 0.0, 0.0));
	AfterburnerStaticMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	AfterburnerStaticMesh->SetVisibility(false);

	CockpitFrameMesh = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("CockpitFrameMesh"));
	CockpitFrameMesh->SetupAttachment(RootScene);
	CockpitFrameMesh->SetVisibility(true);

	CockpitStaticMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("CockpitStaticMesh"));
	CockpitStaticMesh->SetupAttachment(RootScene);
	CockpitStaticMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	CockpitStaticMesh->SetVisibility(false);

	CobraCockpitMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("CobraCockpitMesh"));
	CobraCockpitMesh->SetupAttachment(RootScene);
	CobraCockpitMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	CobraCockpitMesh->SetVisibility(false);

	WingtipTrailMesh = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("WingtipTrailMesh"));
	WingtipTrailMesh->SetupAttachment(RootScene);
	WingtipTrailMesh->SetAbsolute(true, true, true);

	MuzzleFlashLight = CreateDefaultSubobject<UPointLightComponent>(TEXT("MuzzleFlashLight"));
	MuzzleFlashLight->SetupAttachment(RootScene);
	MuzzleFlashLight->SetRelativeLocation(FVector(360.0, -54.0, 22.0));
	MuzzleFlashLight->SetLightColor(FLinearColor(1.0f, 0.72f, 0.25f));
	MuzzleFlashLight->SetAttenuationRadius(1800.0f);
	MuzzleFlashLight->SetIntensity(0.0f);

	CockpitCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("CockpitCamera"));
	CockpitCamera->SetupAttachment(RootScene);
	CockpitCamera->SetRelativeLocation(FVector(240.0, 0.0, 115.0));
	CockpitCamera->FieldOfView = 72.0f;

	ChaseBoom = CreateDefaultSubobject<USpringArmComponent>(TEXT("ChaseBoom"));
	ChaseBoom->SetupAttachment(RootScene);
	ChaseBoom->TargetArmLength = 2400.0f;
	ChaseBoom->SetRelativeLocation(FVector(0.0, 0.0, 260.0));
	ChaseBoom->bDoCollisionTest = false;
	ChaseBoom->bInheritPitch = true;
	ChaseBoom->bInheritYaw = true;
	ChaseBoom->bInheritRoll = false;

	ChaseCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("ChaseCamera"));
	ChaseCamera->SetupAttachment(ChaseBoom);
	ChaseCamera->FieldOfView = 70.0f;
	ChaseCamera->SetActive(false);

	auto MakeAudioComp = [this](const TCHAR* Name) -> UAudioComponent*
	{
		UAudioComponent* Comp = CreateDefaultSubobject<UAudioComponent>(Name);
		Comp->SetupAttachment(RootScene);
		Comp->bAutoActivate = false;
		Comp->bIsUISound = true;
		return Comp;
	};
	AudioEngineIdle = MakeAudioComp(TEXT("AudioEngineIdle"));
	AudioEngineMil = MakeAudioComp(TEXT("AudioEngineMil"));
	AudioEngineGrit = MakeAudioComp(TEXT("AudioEngineGrit"));
	AudioWeaponLoop = MakeAudioComp(TEXT("AudioWeaponLoop"));
	AudioSeekerLoop = MakeAudioComp(TEXT("AudioSeekerLoop"));
	AudioWarnLoop = MakeAudioComp(TEXT("AudioWarnLoop"));
}

void AGunsOnlyFlightPawn::LoadAudioAssets()
{
	if (bAudioCliDisabled)
	{
		return;
	}
	SndF22Idle = LoadObject<USoundWave>(nullptr, TEXT("/Game/GunsOnly/Audio/SW_F22_Idle.SW_F22_Idle"));
	SndF22Mil = LoadObject<USoundWave>(nullptr, TEXT("/Game/GunsOnly/Audio/SW_F22_Mil.SW_F22_Mil"));
	SndF22Grit = LoadObject<USoundWave>(nullptr, TEXT("/Game/GunsOnly/Audio/SW_F22_Grit.SW_F22_Grit"));
	SndRapierIdle = LoadObject<USoundWave>(nullptr, TEXT("/Game/GunsOnly/Audio/SW_Rapier_Idle.SW_Rapier_Idle"));
	SndRapierMil = LoadObject<USoundWave>(nullptr, TEXT("/Game/GunsOnly/Audio/SW_Rapier_Mil.SW_Rapier_Mil"));
	SndRapierGrit = LoadObject<USoundWave>(nullptr, TEXT("/Game/GunsOnly/Audio/SW_Rapier_Grit.SW_Rapier_Grit"));
	SndF14Engine = LoadObject<USoundWave>(nullptr, TEXT("/Game/GunsOnly/Audio/SW_F14_Engine.SW_F14_Engine"));
	SndCobraRotor = LoadObject<USoundWave>(nullptr, TEXT("/Game/GunsOnly/Audio/SW_Cobra_Rotor.SW_Cobra_Rotor"));
	SndFireBossProp = LoadObject<USoundWave>(nullptr, TEXT("/Game/GunsOnly/Audio/SW_FireBoss_Prop.SW_FireBoss_Prop"));
	SndVulcanLoop = LoadObject<USoundWave>(nullptr, TEXT("/Game/GunsOnly/Audio/SW_Vulcan_Loop.SW_Vulcan_Loop"));
	SndMinigunLoop = LoadObject<USoundWave>(nullptr, TEXT("/Game/GunsOnly/Audio/SW_Minigun_Loop.SW_Minigun_Loop"));
	SndAim9Growl = LoadObject<USoundWave>(nullptr, TEXT("/Game/GunsOnly/Audio/SW_AIM9_Growl.SW_AIM9_Growl"));
	SndAim9Lock = LoadObject<USoundWave>(nullptr, TEXT("/Game/GunsOnly/Audio/SW_AIM9_Lock.SW_AIM9_Lock"));
	SndRocketLaunch = LoadObject<USoundWave>(nullptr, TEXT("/Game/GunsOnly/Audio/SW_Rocket_Launch.SW_Rocket_Launch"));
	SndExplosion = LoadObject<USoundWave>(nullptr, TEXT("/Game/GunsOnly/Audio/SW_Explosion.SW_Explosion"));
	SndHitImpact = LoadObject<USoundWave>(nullptr, TEXT("/Game/GunsOnly/Audio/SW_Hit_Impact.SW_Hit_Impact"));
	SndPullUpWarn = LoadObject<USoundWave>(nullptr, TEXT("/Game/GunsOnly/Audio/SW_PullUp_Warn.SW_PullUp_Warn"));
	SndWaterDrop = LoadObject<USoundWave>(nullptr, TEXT("/Game/GunsOnly/Audio/SW_Water_Drop.SW_Water_Drop"));
	SndWireTrap = LoadObject<USoundWave>(nullptr, TEXT("/Game/GunsOnly/Audio/SW_Wire_Trap.SW_Wire_Trap"));
}

void AGunsOnlyFlightPawn::LoadProfile()
{
	FString JsonStr;
	if (!FFileHelper::LoadFileToString(JsonStr, *ProfileFilePath()))
	{
		return;
	}
	TSharedPtr<FJsonObject> Obj;
	TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonStr);
	if (FJsonSerializer::Deserialize(Reader, Obj) && Obj.IsValid())
	{
		int32 R = 0;
		if (Obj->TryGetNumberField(TEXT("rung"), R))
		{
			SavedRung = FMath::Clamp(R, 0, 3);
		}
		Obj->TryGetNumberField(TEXT("best_score"), BestScore);
		Obj->TryGetBoolField(TEXT("muted"), bMuted);
	}
}

void AGunsOnlyFlightPawn::SaveProfile() const
{
	const FString Path = ProfileFilePath();
	IPlatformFile& PF = FPlatformFileManager::Get().GetPlatformFile();
	PF.CreateDirectoryTree(*FPaths::GetPath(Path));

	TSharedRef<FJsonObject> Obj = MakeShared<FJsonObject>();
	Obj->SetNumberField(TEXT("rung"), SavedRung);
	Obj->SetNumberField(TEXT("best_score"), BestScore);
	Obj->SetNumberField(TEXT("last_beat"), CurrentBeatIndex);
	Obj->SetBoolField(TEXT("muted"), bMuted);

	FString OutStr;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&OutStr);
	if (FJsonSerializer::Serialize(Obj, Writer))
	{
		FFileHelper::SaveStringToFile(OutStr, *Path);
	}
}

void AGunsOnlyFlightPawn::PlayOneShotUiOrCombat(USoundWave* Wave, float Volume, float Pitch)
{
	if (bAudioCliDisabled || bMuted || Wave == nullptr || GetWorld() == nullptr)
	{
		return;
	}
	UGameplayStatics::PlaySound2D(this, Wave, Volume, Pitch);
}

void AGunsOnlyFlightPawn::BeginPlay()
{
	Super::BeginPlay();

	bAudioCliDisabled = FParse::Param(FCommandLine::Get(), TEXT("NoSound"));
	FParse::Value(FCommandLine::Get(), TEXT("GunsQaShots="), QaShotsDir);
	bQaHarnessActive = !QaShotsDir.IsEmpty();

	LoadProfile();

	MeshF22 = FGunsOnlyWorldBuilder::LoadGunsStaticMesh(TEXT("/Game/GunsOnly/Meshes/SM_F22_Raptor.SM_F22_Raptor"));
	MeshF14 = FGunsOnlyWorldBuilder::LoadGunsStaticMesh(TEXT("/Game/GunsOnly/Meshes/SM_F14_Tomcat.SM_F14_Tomcat"));
	MeshRapier = FGunsOnlyWorldBuilder::LoadGunsStaticMesh(TEXT("/Game/GunsOnly/Meshes/SM_Rapier_Interceptor.SM_Rapier_Interceptor"));
	MeshFireBoss = FGunsOnlyWorldBuilder::LoadGunsStaticMesh(TEXT("/Game/GunsOnly/Meshes/SM_AT802F_FireBoss.SM_AT802F_FireBoss"));
	MeshFireBossProp = FGunsOnlyWorldBuilder::LoadGunsStaticMesh(TEXT("/Game/GunsOnly/Meshes/SM_AT802F_Prop.SM_AT802F_Prop"));
	MeshF22Cockpit = FGunsOnlyWorldBuilder::LoadGunsStaticMesh(TEXT("/Game/GunsOnly/Meshes/SM_F22_Cockpit.SM_F22_Cockpit"));
	MeshF14Cockpit = FGunsOnlyWorldBuilder::LoadGunsStaticMesh(TEXT("/Game/GunsOnly/Meshes/SM_F14_Cockpit.SM_F14_Cockpit"));
	MeshSu27 = FGunsOnlyWorldBuilder::LoadGunsStaticMesh(TEXT("/Game/GunsOnly/Meshes/SM_Su27_Flanker.SM_Su27_Flanker"));
	MeshMig28 = FGunsOnlyWorldBuilder::LoadGunsStaticMesh(TEXT("/Game/GunsOnly/Meshes/SM_MiG28_Adversary.SM_MiG28_Adversary"));
	MeshBalloon = FGunsOnlyWorldBuilder::LoadGunsStaticMesh(TEXT("/Game/GunsOnly/Meshes/SM_Balloon_Mine.SM_Balloon_Mine"));
	MeshBunker = FGunsOnlyWorldBuilder::LoadGunsStaticMesh(TEXT("/Game/GunsOnly/Meshes/SM_Cobra_Bunker.SM_Cobra_Bunker"));
	MeshExplosion = FGunsOnlyWorldBuilder::LoadGunsStaticMesh(TEXT("/Game/GunsOnly/Meshes/SM_Explosion_Core.SM_Explosion_Core"));
	MeshSmokePuff = FGunsOnlyWorldBuilder::LoadGunsStaticMesh(TEXT("/Game/GunsOnly/Meshes/SM_Smoke_Puff.SM_Smoke_Puff"));

	if (MeshF22 != nullptr)
	{
		PlayerStaticMesh->SetStaticMesh(MeshF22);
		bHasPlayerStaticMesh = true;
	}
	else
	{
		FGunsOnlyWorldBuilder::BuildF22ProceduralMesh(
			PlayerMesh, this, FLinearColor(0.45f, 0.49f, 0.54f), FLinearColor(0.85f, 0.72f, 0.30f));
	}

	if (UStaticMesh* AbAsset = FGunsOnlyWorldBuilder::LoadGunsStaticMesh(TEXT("/Game/GunsOnly/Meshes/SM_Afterburner_Plume.SM_Afterburner_Plume")))
	{
		AfterburnerStaticMesh->SetStaticMesh(AbAsset);
		bHasAfterburnerStaticMesh = true;
	}
	else
	{
		FGunsOnlyWorldBuilder::BuildAfterburnerPlumeMesh(AfterburnerMesh, this);
	}

	if (MeshF22Cockpit != nullptr)
	{
		CockpitStaticMesh->SetStaticMesh(MeshF22Cockpit);
		bHasCockpitStaticMesh = true;
	}
	else
	{
		FGunsOnlyWorldBuilder::BuildCockpitFrameMesh(CockpitFrameMesh, this);
	}

	if (UStaticMesh* CobraAsset = FGunsOnlyWorldBuilder::LoadGunsStaticMesh(TEXT("/Game/GunsOnly/Meshes/SM_AH1G_Cobra.SM_AH1G_Cobra")))
	{
		CobraStaticMesh->SetStaticMesh(CobraAsset);
		bHasCobraStaticMesh = true;
	}
	if (UStaticMesh* RotorAsset = FGunsOnlyWorldBuilder::LoadGunsStaticMesh(TEXT("/Game/GunsOnly/Meshes/SM_AH1G_MainRotor.SM_AH1G_MainRotor")))
	{
		CobraMainRotorMesh->SetStaticMesh(RotorAsset);
		bHasCobraRotorMesh = true;
	}
	if (UStaticMesh* CobraPitAsset = FGunsOnlyWorldBuilder::LoadGunsStaticMesh(TEXT("/Game/GunsOnly/Meshes/SM_AH1G_Cockpit.SM_AH1G_Cockpit")))
	{
		CobraCockpitMesh->SetStaticMesh(CobraPitAsset);
		bHasCobraCockpitMesh = true;
	}
	if (MeshFireBossProp != nullptr)
	{
		FireBossPropMesh->SetStaticMesh(MeshFireBossProp);
	}

	WingtipTrailMesh->SetMaterial(0,
		FGunsOnlyWorldBuilder::LoadGunsMaterial(TEXT("/Game/GunsOnly/Materials/M_Vapor_Trail.M_Vapor_Trail"),
			this, FLinearColor(0.92f, 0.96f, 1.0f)));

	LoadAudioAssets();

	SwitchMission(GUNS_SIM_BEAT_F22_MERGE);
	// Launch directly into the illustrated Program Picker with live sky & clouds in the background (guns-only.com parity)
	SetProgramPickerOpen(true);
	if (bQaHarnessActive)
	{
		QaStage = 0;
		QaSettleFrames = 45;
		QaShaderWaitFrames = 0;
		bQaCaptureRequested = false;
		bQaCaptureInFlight = false;
	}
}

void AGunsOnlyFlightPawn::ClearDynamicActors()
{
	auto DestroyArray = [](TArray<TObjectPtr<AActor>>& Arr)
	{
		for (AActor* Actor : Arr)
		{
			if (Actor != nullptr) Actor->Destroy();
		}
		Arr.Empty();
	};
	DestroyArray(ContactActors);
	DestroyArray(TracerActors);
	DestroyArray(GateActors);
	DestroyArray(WildfireFlameActors);
	DestroyArray(WaterDropActors);
	for (FGunsSmokePuff& Puff : SmokePool)
	{
		if (Puff.Actor != nullptr) Puff.Actor->Destroy();
	}
	for (FGunsExplosionFx& Fx : ExplosionPool)
	{
		if (Fx.Actor != nullptr) Fx.Actor->Destroy();
	}
	SmokePool.Empty();
	ExplosionPool.Empty();
	ContactBuiltRole.Empty();
	ContactWasAlive.Empty();
	TracerBuiltFriendly.Empty();
	FGunsOnlyWorldBuilder::ClearSpawnedWorldActors(SpawnedWorldActors);
}

void AGunsOnlyFlightPawn::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (AudioEngineIdle) AudioEngineIdle->Stop();
	if (AudioEngineMil) AudioEngineMil->Stop();
	if (AudioEngineGrit) AudioEngineGrit->Stop();
	if (AudioWeaponLoop) AudioWeaponLoop->Stop();
	if (AudioSeekerLoop) AudioSeekerLoop->Stop();
	if (AudioWarnLoop) AudioWarnLoop->Stop();

	SaveProfile();
	ClearDynamicActors();
	SimBridge.DestroySession();
	Super::EndPlay(EndPlayReason);
}

void AGunsOnlyFlightPawn::SwitchMission(int32 NewBeatIndex)
{
	ClearDynamicActors();
	LeftTrailPts.Reset();
	RightTrailPts.Reset();
	TrailTimes.Reset();
	LastTrailSampleTime = -10.0;
	LastSmokeEmitSimTime = -10.0;
	if (WingtipTrailMesh != nullptr)
	{
		WingtipTrailMesh->ClearAllMeshSections();
	}

	CurrentBeatIndex = NewBeatIndex;
	bControlsQuicklookOpen = false;
	bPadlockActive = false;
	PadlockYawDeg = 0.0;
	PadlockPitchDeg = 0.0;
	PadlockRollDeg = 0.0;
	HeadOffsetX = HeadVelX = HeadOffsetY = HeadVelY = HeadOffsetZ = HeadVelZ = 0.0;
	HeadPitchDeg = HeadRollDeg = 0.0;
	PrevRoundsFired = 0;
	PrevSortieHits = 0;
	PrevDirectorKills = 0;
	PrevCaughtWire = 0;
	HitMarkerTimer = 0.0f;
	KillFlashTimer = 0.0f;
	WaterCurtainTimer = 0.0f;

	FMemory::Memzero(&LatestFrame, sizeof(LatestFrame));
	FMemory::Memzero(&LatestRunway, sizeof(LatestRunway));
	FMemory::Memzero(&LatestCourse, sizeof(LatestCourse));
	FMemory::Memzero(&LatestLeadCue, sizeof(LatestLeadCue));
	FMemory::Memzero(&LatestCobra, sizeof(LatestCobra));
	FMemory::Memzero(&LatestFunnel, sizeof(LatestFunnel));
	FMemory::Memzero(&LatestPilot, sizeof(LatestPilot));
	FMemory::Memzero(&LatestDirector, sizeof(LatestDirector));
	FMemory::Memzero(&LatestWeather, sizeof(LatestWeather));
	FMemory::Memzero(&LatestCarrier, sizeof(LatestCarrier));
	FMemory::Memzero(&LatestOkanagan, sizeof(LatestOkanagan));
	LatestContacts.Reset();
	LatestTracers.Reset();
	LatestGates.Reset();
	LatestFireCells.Reset();

	if (!SimBridge.CreateSession(CurrentBeatIndex, 1))
	{
		UE_LOG(LogTemp, Error, TEXT("GunsOnlyFlightPawn: failed to create simulation session (beat=%d)."), CurrentBeatIndex);
		return;
	}
	if ((CurrentBeatIndex == GUNS_SIM_BEAT_F22_MERGE || CurrentBeatIndex == GUNS_SIM_BEAT_TOPGUN_F14) && SavedRung > 0)
	{
		SimBridge.SetDirectorRung(SavedRung);
	}
	SimBridge.SetAssistedFlight(bAssistedFlight);

	SimBridge.ReadRunway(LatestRunway);
	SimBridge.ReadCobraState(LatestCobra);
	SimBridge.ReadCarrier(LatestCarrier);
	SimBridge.ReadOkanagan(LatestOkanagan);

	if (CurrentBeatIndex == GUNS_SIM_BEAT_COBRA_CANYON && LatestCobra.active != 0)
	{
		SimBridge.SetWorldOriginMeters(
			0.5 * (LatestCobra.fob_east_m + LatestCobra.bridge_east_m),
			0.5 * (LatestCobra.fob_north_m + LatestCobra.bridge_north_m));
		CockpitCamera->SetRelativeLocation(FVector(155.0, 0.0, 85.0));
		ChaseBoom->TargetArmLength = 1650.0f;
		ChaseBoom->SetRelativeLocation(FVector(0.0, 0.0, 220.0));
		MuzzleFlashLight->SetRelativeLocation(FVector(575.0, 0.0, -38.0));
		CobraManualCollective = LatestCobra.collective01 > 0.05 ? LatestCobra.collective01 : 0.62;
	}
	else if (CurrentBeatIndex == GUNS_SIM_BEAT_OKANAGAN_FIREBOSS && LatestOkanagan.active != 0)
	{
		// Center UE coordinates on Okanagan Lake (anchor = 0,0) so 56x56 km CDEM covers Lake + Kelowna + Fire
		SimBridge.SetWorldOriginMeters(0.0, 0.0);
		if (MeshFireBoss != nullptr) PlayerStaticMesh->SetStaticMesh(MeshFireBoss);
		bHasPlayerStaticMesh = (MeshFireBoss != nullptr);
		if (MeshF22Cockpit != nullptr) CockpitStaticMesh->SetStaticMesh(MeshF22Cockpit);
		CockpitCamera->SetRelativeLocation(FVector(-45.0, 0.0, 128.0));
		ChaseBoom->TargetArmLength = 1900.0f;
		ChaseBoom->SetRelativeLocation(FVector(0.0, 0.0, 260.0));
		MuzzleFlashLight->SetRelativeLocation(FVector(0.0, 0.0, -90.0));
	}
	else if (CurrentBeatIndex == GUNS_SIM_BEAT_TOPGUN_F14)
	{
		if (LatestCarrier.present != 0)
		{
			SimBridge.SetWorldOriginMeters(LatestCarrier.pos_east_m, LatestCarrier.pos_north_m);
		}
		else
		{
			SimBridge.SetWorldOriginMeters(0.0, 0.0);
		}
		if (MeshF14 != nullptr) PlayerStaticMesh->SetStaticMesh(MeshF14);
		bHasPlayerStaticMesh = (MeshF14 != nullptr);
		CockpitStaticMesh->SetStaticMesh(MeshF14Cockpit != nullptr ? MeshF14Cockpit : MeshF22Cockpit);
		bHasCockpitStaticMesh = (CockpitStaticMesh->GetStaticMesh() != nullptr);
		CockpitCamera->SetRelativeLocation(FVector(240.0, 0.0, 115.0));
		ChaseBoom->TargetArmLength = 2350.0f;
		ChaseBoom->SetRelativeLocation(FVector(0.0, 0.0, 260.0));
		MuzzleFlashLight->SetRelativeLocation(FVector(380.0, -64.0, 18.0));
	}
	else
	{
		if (LatestRunway.present != 0)
		{
			SimBridge.SetWorldOriginMeters(LatestRunway.threshold_east_m, LatestRunway.threshold_north_m);
		}
		else
		{
			SimBridge.SetWorldOriginMeters(0.0, 0.0);
		}
		UStaticMesh* TargetAirframe = (CurrentBeatIndex == GUNS_SIM_BEAT_RAPIER_INTERCEPT && MeshRapier != nullptr) ? MeshRapier : MeshF22;
		if (TargetAirframe != nullptr)
		{
			PlayerStaticMesh->SetStaticMesh(TargetAirframe);
			bHasPlayerStaticMesh = true;
		}
		if (MeshF22Cockpit != nullptr)
		{
			CockpitStaticMesh->SetStaticMesh(MeshF22Cockpit);
			bHasCockpitStaticMesh = true;
		}
		CockpitCamera->SetRelativeLocation(FVector(240.0, 0.0, 115.0));
		ChaseBoom->TargetArmLength = CurrentBeatIndex == GUNS_SIM_BEAT_RAPIER_INTERCEPT ? 2700.0f : 2400.0f;
		ChaseBoom->SetRelativeLocation(FVector(0.0, 0.0, 260.0));
		MuzzleFlashLight->SetRelativeLocation(FVector(360.0, -54.0, 22.0));
		ManualThrottle01 = 0.85;
		bThrottleManualEngaged = false;
	}

	FGunsOnlyWorldBuilder::EnsureEnvironmentAndRunway(
		GetWorld(), CurrentBeatIndex, SimBridge, LatestRunway, LatestCobra, LatestCarrier, LatestOkanagan,
		PapiRig, AtmoRig, SpawnedWorldActors);

	bPaused = false;
	SimBridge.Begin();
	SimBridge.Advance(1.0 / 120.0, 1);
	SyncVisualActors();
	FGunsOnlyWorldBuilder::ApplyTheatreWeather(
		AtmoRig, CurrentBeatIndex, LatestWeather, LatestFrame, LatestFrame.sim_time_s, true);
	SyncCameraAndMeshVisibility();
}

void AGunsOnlyFlightPawn::SyncCameraAndMeshVisibility()
{
	const bool bIsCobra = (CurrentBeatIndex == GUNS_SIM_BEAT_COBRA_CANYON);
	const bool bIsFireBoss = (CurrentBeatIndex == GUNS_SIM_BEAT_OKANAGAN_FIREBOSS);
	const bool bHasBurner = !bIsCobra && !bIsFireBoss;

	CockpitCamera->SetActive(!bChaseCameraActive);
	ChaseCamera->SetActive(bChaseCameraActive);

	PlayerMesh->SetVisibility(!bIsCobra && !bHasPlayerStaticMesh && bChaseCameraActive);
	PlayerStaticMesh->SetVisibility(!bIsCobra && bHasPlayerStaticMesh && bChaseCameraActive);

	const bool bBurner = bHasBurner && bChaseCameraActive && LatestFrame.player_alive != 0 && LatestFrame.throttle01 > 0.76;
	AfterburnerMesh->SetVisibility(bHasBurner && !bHasAfterburnerStaticMesh && bBurner);
	AfterburnerStaticMesh->SetVisibility(bHasBurner && bHasAfterburnerStaticMesh && bBurner);

	CockpitFrameMesh->SetVisibility(!bIsCobra && !bHasCockpitStaticMesh && !bChaseCameraActive);
	CockpitStaticMesh->SetVisibility(!bIsCobra && bHasCockpitStaticMesh && !bChaseCameraActive);

	CobraStaticMesh->SetVisibility(bIsCobra && bHasCobraStaticMesh && bChaseCameraActive);
	CobraMainRotorMesh->SetVisibility(bIsCobra && bHasCobraRotorMesh);
	CobraCockpitMesh->SetVisibility(bIsCobra && bHasCobraCockpitMesh && !bChaseCameraActive);

	FireBossPropMesh->SetVisibility(bIsFireBoss && MeshFireBossProp != nullptr);
}

void AGunsOnlyFlightPawn::ToggleCameraView()
{
	bChaseCameraActive = !bChaseCameraActive;
	if (bChaseCameraActive && bPadlockActive)
	{
		bPadlockActive = false;
		SimBridge.SetPadlockRollAssist(false);
	}
	SyncCameraAndMeshVisibility();
}

void AGunsOnlyFlightPawn::ToggleAssistedFlight()
{
	if (!SimBridge.HasSession())
	{
		return;
	}
	bAssistedFlight = !bAssistedFlight;
	SimBridge.SetAssistedFlight(bAssistedFlight);
	if (CurrentBeatIndex == GUNS_SIM_BEAT_COBRA_CANYON && !bAssistedFlight && LatestCobra.collective01 > 0.05)
	{
		CobraManualCollective = LatestCobra.collective01;
	}
}

void AGunsOnlyFlightPawn::RestartCurrentMission()
{
	if (!SimBridge.HasSession())
	{
		return;
	}
	ClearDynamicActors();
	SimBridge.Restart();
	if ((CurrentBeatIndex == GUNS_SIM_BEAT_F22_MERGE || CurrentBeatIndex == GUNS_SIM_BEAT_TOPGUN_F14) && SavedRung > 0)
	{
		SimBridge.SetDirectorRung(SavedRung);
	}
	SimBridge.SetAssistedFlight(bAssistedFlight);
	SimBridge.Begin();
	bPaused = false;
	bProgramPickerOpen = false;
	bPadlockActive = false;
	bThrottleManualEngaged = false;
	ManualThrottle01 = 0.85;
	CobraManualCollective = 0.62;
	PrevRoundsFired = 0;
	PrevSortieHits = 0;
	PrevDirectorKills = 0;
	PrevCaughtWire = 0;
	FGunsOnlyWorldBuilder::EnsureEnvironmentAndRunway(
		GetWorld(), CurrentBeatIndex, SimBridge, LatestRunway, LatestCobra, LatestCarrier, LatestOkanagan,
		PapiRig, AtmoRig, SpawnedWorldActors);
	SyncVisualActors();
	SyncCameraAndMeshVisibility();
}

void AGunsOnlyFlightPawn::TogglePause()
{
	if (!SimBridge.HasSession())
	{
		return;
	}
	bPaused = !bPaused;
	SimBridge.SetPaused(bPaused);
}

void AGunsOnlyFlightPawn::SetProgramPickerOpen(bool bOpen)
{
	bProgramPickerOpen = bOpen;
	if (bOpen) bControlsQuicklookOpen = false;
	bPaused = bOpen;
	if (SimBridge.HasSession())
	{
		SimBridge.SetPaused(bPaused);
	}
}

void AGunsOnlyFlightPawn::ToggleProgramPicker()
{
	SetProgramPickerOpen(!bProgramPickerOpen);
}

void AGunsOnlyFlightPawn::ToggleControlsQuicklook()
{
	bControlsQuicklookOpen = !bControlsQuicklookOpen;
}

void AGunsOnlyFlightPawn::ToggleMute()
{
	bMuted = !bMuted;
	SaveProfile();
}

void AGunsOnlyFlightPawn::TogglePadlock()
{
	if (!SimBridge.HasSession())
	{
		return;
	}
	bPadlockActive = !bPadlockActive;
	SimBridge.FeedKey(GUNS_GKEY_PADLOCK, true);
	SimBridge.FeedKey(GUNS_GKEY_PADLOCK, false);
	SimBridge.SetPadlockRollAssist(bPadlockActive);
}

void AGunsOnlyFlightPawn::SelectRung(int32 NewRung)
{
	SavedRung = FMath::Clamp(NewRung, 0, 3);
	SaveProfile();
	if (SimBridge.HasSession() && (CurrentBeatIndex == GUNS_SIM_BEAT_F22_MERGE || CurrentBeatIndex == GUNS_SIM_BEAT_TOPGUN_F14))
	{
		SimBridge.SetDirectorRung(SavedRung);
	}
}

void AGunsOnlyFlightPawn::TriggerPrimaryHudAction()
{
	if (!SimBridge.HasSession())
	{
		return;
	}
	if (CurrentBeatIndex == GUNS_SIM_BEAT_COBRA_CANYON)
	{
		SimBridge.CycleTarget();
	}
	else if (CurrentBeatIndex == GUNS_SIM_BEAT_OKANAGAN_FIREBOSS)
	{
		SimBridge.FeedKey(GUNS_GKEY_GEAR_TOGGLE, true);
		SimBridge.FeedKey(GUNS_GKEY_GEAR_TOGGLE, false);
	}
	else
	{
		SimBridge.RequestRtb();
	}
}

void AGunsOnlyFlightPawn::TriggerSecondaryHudAction()
{
	if (!SimBridge.HasSession())
	{
		return;
	}
	if (CurrentBeatIndex == GUNS_SIM_BEAT_COBRA_CANYON || CurrentBeatIndex == GUNS_SIM_BEAT_TOPGUN_F14 || CurrentBeatIndex == GUNS_SIM_BEAT_RAPIER_INTERCEPT)
	{
		if (SimBridge.FireSecondary())
		{
			PlayOneShotUiOrCombat(SndRocketLaunch, 0.72f);
		}
	}
	else
	{
		SimBridge.FeedKey(GUNS_GKEY_GEAR_TOGGLE, true);
		SimBridge.FeedKey(GUNS_GKEY_GEAR_TOGGLE, false);
	}
}

void AGunsOnlyFlightPawn::PollPlayerInputs(float DeltaSeconds)
{
	APlayerController* PC = Cast<APlayerController>(GetController());
	if (PC == nullptr || !SimBridge.HasSession())
	{
		return;
	}
	if (!bInputModeConfigured)
	{
		bInputModeConfigured = true;
		PC->bShowMouseCursor = true;
		PC->bEnableClickEvents = true;
		FInputModeGameAndUI InputMode;
		InputMode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
		InputMode.SetHideCursorDuringCapture(false);
		PC->SetInputMode(InputMode);
	}

	// Global UI / system hotkeys (work regardless of picker state)
	if (PC->WasInputKeyJustPressed(EKeys::H))
	{
		ToggleControlsQuicklook();
		return;
	}
	if (PC->WasInputKeyJustPressed(EKeys::Escape) || PC->WasInputKeyJustPressed(EKeys::Gamepad_Special_Right))
	{
		if (bControlsQuicklookOpen)
		{
			bControlsQuicklookOpen = false;
		}
		else
		{
			ToggleProgramPicker();
		}
		return;
	}
	if (PC->WasInputKeyJustPressed(EKeys::M))
	{
		ToggleMute();
	}
	if (PC->WasInputKeyJustPressed(EKeys::R))
	{
		RestartCurrentMission();
		return;
	}
	if (PC->WasInputKeyJustPressed(EKeys::C) || PC->WasInputKeyJustPressed(EKeys::F2)
		|| PC->WasInputKeyJustPressed(EKeys::Gamepad_RightThumbstick))
	{
		ToggleCameraView();
	}
	if (PC->WasInputKeyJustPressed(EKeys::P))
	{
		if (bProgramPickerOpen)
		{
			SetProgramPickerOpen(false);
		}
		else
		{
			TogglePause();
		}
	}

	// Number keys 1..5 switch experiences quickly when Picker is open (or at any time cleanly!)
	if (PC->WasInputKeyJustPressed(EKeys::One)) { SetProgramPickerOpen(false); SwitchMission(GUNS_SIM_BEAT_F22_MERGE); return; }
	if (PC->WasInputKeyJustPressed(EKeys::Two)) { SetProgramPickerOpen(false); SwitchMission(GUNS_SIM_BEAT_COBRA_CANYON); return; }
	if (PC->WasInputKeyJustPressed(EKeys::Three)) { SetProgramPickerOpen(false); SwitchMission(GUNS_SIM_BEAT_TOPGUN_F14); return; }
	if (PC->WasInputKeyJustPressed(EKeys::Four)) { SetProgramPickerOpen(false); SwitchMission(GUNS_SIM_BEAT_RAPIER_INTERCEPT); return; }
	if (PC->WasInputKeyJustPressed(EKeys::Five)) { SetProgramPickerOpen(false); SwitchMission(GUNS_SIM_BEAT_OKANAGAN_FIREBOSS); return; }

	if (bProgramPickerOpen || bControlsQuicklookOpen || bPaused)
	{
		return;
	}

	if (PC->WasInputKeyJustPressed(EKeys::B) || PC->WasInputKeyJustPressed(EKeys::Gamepad_FaceButton_Left))
	{
		ToggleAssistedFlight();
	}
	if (PC->WasInputKeyJustPressed(EKeys::Tab) || PC->WasInputKeyJustPressed(EKeys::Gamepad_FaceButton_Top))
	{
		SimBridge.CycleTarget();
	}
	if (PC->WasInputKeyJustPressed(EKeys::V) || PC->WasInputKeyJustPressed(EKeys::Gamepad_FaceButton_Right))
	{
		TogglePadlock();
	}

	// Gamepad unified HOTAS axes (`pad/flight_layout.js`)
	constexpr float Deadzone = 0.08f;
	auto DeadzoneAxis = [Deadzone](float Raw) -> double
	{
		if (FMath::Abs(Raw) < Deadzone) return 0.0;
		return static_cast<double>(FMath::Clamp((FMath::Abs(Raw) - Deadzone) / (1.0f - Deadzone), 0.0f, 1.0f) * (Raw >= 0.0f ? 1.0f : -1.0f));
	};
	const double PadRoll = DeadzoneAxis(PC->GetInputAnalogKeyState(EKeys::Gamepad_LeftX));
	// Pull back (-Y) = nose up (+1), push forward (+Y) = nose down (-1)
	const double PadPitch = DeadzoneAxis(-PC->GetInputAnalogKeyState(EKeys::Gamepad_LeftY));
	const double PadRudderBtn = (PC->IsInputKeyDown(EKeys::Gamepad_RightShoulder) ? 1.0 : 0.0)
		- (PC->IsInputKeyDown(EKeys::Gamepad_LeftShoulder) ? 1.0 : 0.0);
	const float RawRT = PC->GetInputAnalogKeyState(EKeys::Gamepad_RightTriggerAxis);
	const float RawLT = PC->GetInputAnalogKeyState(EKeys::Gamepad_LeftTriggerAxis);
	const bool bPadThrottleHeld = (RawRT > Deadzone || RawLT > Deadzone);

	if (CurrentBeatIndex == GUNS_SIM_BEAT_COBRA_CANYON)
	{
		float MX = 0.0f, MY = 0.0f;
		const bool bInCornerPill = PC->GetMousePosition(MX, MY) && MY < 44.0f && MX < 280.0f;
		if (PC->WasInputKeyJustPressed(EKeys::Q)
			|| PC->WasInputKeyJustPressed(EKeys::LeftShift)
			|| (!bInCornerPill && PC->WasInputKeyJustPressed(EKeys::LeftMouseButton)))
		{
			if (SimBridge.FireSecondary())
			{
				PlayOneShotUiOrCombat(SndRocketLaunch, 0.72f);
			}
		}

		// Canonical Cobra controls (`cobra_pilot_input.js`):
		// Arrows = Cyclic (+ COBRA_CYCLIC_EXPO = 0.65 & 2.5/s slew), W/S = Collective (0.40/s), A/D = Pedals (2.5/s), F = Gunner consent
		const double KeyFwd = (PC->IsInputKeyDown(EKeys::Up) ? 1.0 : 0.0) - (PC->IsInputKeyDown(EKeys::Down) ? 1.0 : 0.0);
		const double KeyRight = (PC->IsInputKeyDown(EKeys::Right) ? 1.0 : 0.0) - (PC->IsInputKeyDown(EKeys::Left) ? 1.0 : 0.0);
		const double KeyYaw = (PC->IsInputKeyDown(EKeys::D) ? 1.0 : 0.0) - (PC->IsInputKeyDown(EKeys::A) ? 1.0 : 0.0);

		const double TargetFwd = FMath::Clamp(ApplyExpo(KeyFwd - PadPitch, 0.65), -1.0, 1.0);
		const double TargetRight = FMath::Clamp(ApplyExpo(KeyRight + PadRoll, 0.65), -1.0, 1.0);
		const double TargetYaw = FMath::Clamp(KeyYaw + PadRudderBtn, -1.0, 1.0);

		constexpr double SlewRate = 2.5;
		CobraSmoothedFwdCyclic = MoveToward(CobraSmoothedFwdCyclic, TargetFwd, SlewRate * DeltaSeconds);
		CobraSmoothedRightCyclic = MoveToward(CobraSmoothedRightCyclic, TargetRight, SlewRate * DeltaSeconds);
		CobraSmoothedPedalYaw = MoveToward(CobraSmoothedPedalYaw, TargetYaw, SlewRate * DeltaSeconds);

		const double ClimbAxis = (PC->IsInputKeyDown(EKeys::W) ? 1.0 : 0.0)
			- (PC->IsInputKeyDown(EKeys::S) ? 1.0 : 0.0)
			+ static_cast<double>(RawRT - RawLT);

		double ColToSend = 0.5;
		if (bAssistedFlight)
		{
			ColToSend = FMath::Clamp(0.5 + 0.5 * ClimbAxis, 0.0, 1.0);
		}
		else
		{
			CobraManualCollective = FMath::Clamp(CobraManualCollective + 0.40 * ClimbAxis * DeltaSeconds, 0.05, 0.98);
			ColToSend = CobraManualCollective;
		}

		const int32 ConsentDown = (PC->IsInputKeyDown(EKeys::F)
			|| PC->IsInputKeyDown(EKeys::Gamepad_FaceButton_Bottom)) ? 1 : 0;
		SimBridge.SetControls(
			CobraSmoothedRightCyclic,
			CobraSmoothedFwdCyclic,
			CobraSmoothedPedalYaw,
			ColToSend,
			true,
			ConsentDown);
		return;
	}

	// Fixed-wing & Fire Boss canonical controls (`player_settings.js`, `okanagan_keyboard_controls.js`, `sim/KeyGrammar.cs`):
	// Right hand = Arrows (stick), Left hand = W/S (throttle), A/D (rudder), F (guns/drop), V (padlock), Q/Shift (secondary),
	// O (RTB), Space (limit override), G (gear/scoops), [/] (flaps), K (GCAS paddle), ,/.// (F-14 sweep), U (hook), Y (time comp)
	if (PC->WasInputKeyJustPressed(EKeys::O))
	{
		SimBridge.RequestRtb();
	}
	if (PC->WasInputKeyJustPressed(EKeys::Q) || PC->WasInputKeyJustPressed(EKeys::LeftShift))
	{
		if (SimBridge.FireSecondary())
		{
			PlayOneShotUiOrCombat(CurrentBeatIndex == GUNS_SIM_BEAT_OKANAGAN_FIREBOSS ? SndWaterDrop : SndRocketLaunch, 0.72f);
		}
	}

	SimBridge.FeedKey(GUNS_GKEY_PULL_UP, PC->IsInputKeyDown(EKeys::Down));
	SimBridge.FeedKey(GUNS_GKEY_PUSH_DOWN, PC->IsInputKeyDown(EKeys::Up));
	SimBridge.FeedKey(GUNS_GKEY_ROLL_LEFT, PC->IsInputKeyDown(EKeys::Left));
	SimBridge.FeedKey(GUNS_GKEY_ROLL_RIGHT, PC->IsInputKeyDown(EKeys::Right));
	SimBridge.FeedKey(GUNS_GKEY_RUDDER_LEFT, PC->IsInputKeyDown(EKeys::A));
	SimBridge.FeedKey(GUNS_GKEY_RUDDER_RIGHT, PC->IsInputKeyDown(EKeys::D));
	SimBridge.FeedKey(GUNS_GKEY_THROTTLE_UP, PC->IsInputKeyDown(EKeys::W));
	SimBridge.FeedKey(GUNS_GKEY_THROTTLE_DOWN, PC->IsInputKeyDown(EKeys::S));
	SimBridge.FeedKey(GUNS_GKEY_OVERRIDE, PC->IsInputKeyDown(EKeys::SpaceBar));
	SimBridge.FeedKey(GUNS_GKEY_AUTO_GCAS_OVERRIDE, PC->IsInputKeyDown(EKeys::K));
	SimBridge.FeedKey(GUNS_GKEY_GEAR_TOGGLE, PC->IsInputKeyDown(EKeys::G));
	SimBridge.FeedKey(GUNS_GKEY_FLAP_UP, PC->IsInputKeyDown(EKeys::LeftBracket));
	SimBridge.FeedKey(GUNS_GKEY_FLAP_DOWN, PC->IsInputKeyDown(EKeys::RightBracket));
	SimBridge.FeedKey(GUNS_GKEY_WING_SWEEP_FWD, PC->IsInputKeyDown(EKeys::Comma));
	SimBridge.FeedKey(GUNS_GKEY_WING_SWEEP_AFT, PC->IsInputKeyDown(EKeys::Period));
	SimBridge.FeedKey(GUNS_GKEY_WING_SWEEP_AUTO, PC->IsInputKeyDown(EKeys::Slash));
	SimBridge.FeedKey(GUNS_GKEY_HOOK_TOGGLE, PC->IsInputKeyDown(EKeys::U));
	SimBridge.FeedKey(GUNS_GKEY_TIME_COMPRESSION_TOGGLE, PC->IsInputKeyDown(EKeys::Y));

	if (bPadThrottleHeld)
	{
		ManualThrottle01 = FMath::Clamp(ManualThrottle01 + 0.60 * static_cast<double>(RawRT - RawLT) * DeltaSeconds, 0.0, 1.0);
	}

	const int32 TriggerDown = (PC->IsInputKeyDown(EKeys::F)
		|| PC->IsInputKeyDown(EKeys::Gamepad_FaceButton_Bottom)) ? 1 : 0;
	SimBridge.SetControls(
		PadRoll,
		PadPitch,
		PadRudderBtn,
		ManualThrottle01,
		bPadThrottleHeld,
		TriggerDown);
}

void AGunsOnlyFlightPawn::SpawnExplosionAt(const FVector& PosUE, float PeakScale)
{
	UWorld* World = GetWorld();
	if (World == nullptr) return;

	if (ExplosionPool.Num() < 16)
	{
		FActorSpawnParameters Params;
		Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		if (AActor* Actor = World->SpawnActor<AActor>(PosUE, FRotator::ZeroRotator, Params))
		{
			FGunsExplosionFx Fx;
			Fx.Actor = Actor;
			if (MeshExplosion != nullptr)
			{
				UStaticMeshComponent* Comp = NewObject<UStaticMeshComponent>(Actor, TEXT("ExplosionMesh"));
				Comp->SetStaticMesh(MeshExplosion);
				Comp->SetCollisionEnabled(ECollisionEnabled::NoCollision);
				Actor->SetRootComponent(Comp);
				Comp->RegisterComponent();
			}
			else
			{
				UProceduralMeshComponent* PM = NewObject<UProceduralMeshComponent>(Actor, TEXT("ExplosionBox"));
				Actor->SetRootComponent(PM);
				PM->RegisterComponent();
				FGunsOnlyWorldBuilder::BuildBoxProceduralMesh(PM, Actor, FVector(120.0), FLinearColor(2.5f, 0.9f, 0.2f));
			}
			UPointLightComponent* Light = NewObject<UPointLightComponent>(Actor, TEXT("ExplosionLight"));
			Light->SetupAttachment(Actor->GetRootComponent());
			Light->SetLightColor(FLinearColor(1.0f, 0.52f, 0.16f));
			Light->SetAttenuationRadius(18000.0f);
			Light->SetIntensity(85000.0f);
			Light->RegisterComponent();
			Fx.Light = Light;
			Fx.Age = 0.0f;
			Fx.MaxAge = 0.95f;
			Fx.PeakScale = PeakScale;
			Fx.bActive = true;
			Actor->SetActorLocation(PosUE);
			Actor->SetActorScale3D(FVector(PeakScale * 0.25f));
			ExplosionPool.Add(Fx);
			return;
		}
	}

	for (FGunsExplosionFx& Fx : ExplosionPool)
	{
		if (!Fx.bActive && Fx.Actor != nullptr)
		{
			Fx.Age = 0.0f;
			Fx.PeakScale = PeakScale;
			Fx.bActive = true;
			Fx.Actor->SetActorLocation(PosUE);
			Fx.Actor->SetActorHiddenInGame(false);
			Fx.Actor->SetActorScale3D(FVector(PeakScale * 0.25f));
			if (Fx.Light != nullptr) Fx.Light->SetIntensity(85000.0f);
			return;
		}
	}
}

void AGunsOnlyFlightPawn::SpawnSmokePuffAt(const FVector& PosUE, float InitialScale)
{
	UWorld* World = GetWorld();
	if (World == nullptr) return;

	if (SmokePool.Num() < 64)
	{
		FActorSpawnParameters Params;
		Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		if (AActor* Actor = World->SpawnActor<AActor>(PosUE, FRotator::ZeroRotator, Params))
		{
			FGunsSmokePuff Puff;
			Puff.Actor = Actor;
			if (MeshSmokePuff != nullptr)
			{
				UStaticMeshComponent* Comp = NewObject<UStaticMeshComponent>(Actor, TEXT("SmokeMesh"));
				Comp->SetStaticMesh(MeshSmokePuff);
				Comp->SetCollisionEnabled(ECollisionEnabled::NoCollision);
				Actor->SetRootComponent(Comp);
				Comp->RegisterComponent();
			}
			else
			{
				UProceduralMeshComponent* PM = NewObject<UProceduralMeshComponent>(Actor, TEXT("SmokeBox"));
				Actor->SetRootComponent(PM);
				PM->RegisterComponent();
				FGunsOnlyWorldBuilder::BuildBoxProceduralMesh(PM, Actor, FVector(90.0), FLinearColor(0.09f, 0.09f, 0.10f));
			}
			Puff.VelocityUE = FVector(0.0, 0.0, 1400.0);
			Puff.Age = 0.0f;
			Puff.MaxAge = 2.6f;
			Puff.BaseScale = InitialScale;
			Puff.bActive = true;
			Actor->SetActorLocation(PosUE);
			Actor->SetActorScale3D(FVector(InitialScale));
			SmokePool.Add(Puff);
			return;
		}
	}

	int32 OldestIdx = 0;
	for (int32 i = 0; i < SmokePool.Num(); ++i)
	{
		if (!SmokePool[i].bActive)
		{
			OldestIdx = i;
			break;
		}
		if (SmokePool[i].Age > SmokePool[OldestIdx].Age)
		{
			OldestIdx = i;
		}
	}
	FGunsSmokePuff& Reuse = SmokePool[OldestIdx];
	if (Reuse.Actor != nullptr)
	{
		Reuse.Age = 0.0f;
		Reuse.BaseScale = InitialScale;
		Reuse.VelocityUE = FVector(0.0, 0.0, 1400.0);
		Reuse.bActive = true;
		Reuse.Actor->SetActorLocation(PosUE);
		Reuse.Actor->SetActorHiddenInGame(false);
		Reuse.Actor->SetActorScale3D(FVector(InitialScale));
	}
}

void AGunsOnlyFlightPawn::UpdateEffectsAndWildfire(float DeltaSeconds)
{
	UWorld* World = GetWorld();
	if (World == nullptr) return;

	HitMarkerTimer = FMath::Max(0.0f, HitMarkerTimer - DeltaSeconds);
	KillFlashTimer = FMath::Max(0.0f, KillFlashTimer - DeltaSeconds);
	WaterCurtainTimer = FMath::Max(0.0f, WaterCurtainTimer - DeltaSeconds);

	// Detect hit/kill/trap edges for FX & audio cues
	if (LatestCourse.sortie_hits > PrevSortieHits || LatestDirector.director_hits > PrevSortieHits)
	{
		HitMarkerTimer = 0.24f;
		PlayOneShotUiOrCombat(SndHitImpact, 0.55f);
	}
	PrevSortieHits = FMath::Max(LatestCourse.sortie_hits, LatestDirector.director_hits);

	if (LatestDirector.director_kills > PrevDirectorKills)
	{
		KillFlashTimer = 0.45f;
		PlayOneShotUiOrCombat(SndExplosion, 0.85f);
	}
	PrevDirectorKills = LatestDirector.director_kills;

	if (LatestCarrier.present != 0 && LatestCarrier.caught_wire > 0 && LatestCarrier.caught_wire != PrevCaughtWire)
	{
		PlayOneShotUiOrCombat(SndWireTrap, 0.80f);
	}
	PrevCaughtWire = LatestCarrier.caught_wire;

	if (LatestDirector.earned_rung > SavedRung)
	{
		SavedRung = LatestDirector.earned_rung;
		SaveProfile();
	}
	if (LatestDirector.combat_score > BestScore)
	{
		BestScore = LatestDirector.combat_score;
	}

	// Update active explosions
	for (FGunsExplosionFx& Fx : ExplosionPool)
	{
		if (!Fx.bActive || Fx.Actor == nullptr) continue;
		Fx.Age += DeltaSeconds;
		const float T = Fx.Age / Fx.MaxAge;
		if (T >= 1.0f)
		{
			Fx.bActive = false;
			Fx.Actor->SetActorHiddenInGame(true);
			if (Fx.Light != nullptr) Fx.Light->SetIntensity(0.0f);
		}
		else
		{
			const float S = Fx.PeakScale * FMath::Lerp(0.25f, 1.35f, FMath::Sqrt(T));
			Fx.Actor->SetActorScale3D(FVector(S));
			if (Fx.Light != nullptr) Fx.Light->SetIntensity(85000.0f * (1.0f - T));
		}
	}

	// Update rising smoke puffs
	for (FGunsSmokePuff& Puff : SmokePool)
	{
		if (!Puff.bActive || Puff.Actor == nullptr) continue;
		Puff.Age += DeltaSeconds;
		const float T = Puff.Age / Puff.MaxAge;
		if (T >= 1.0f)
		{
			Puff.bActive = false;
			Puff.Actor->SetActorHiddenInGame(true);
		}
		else
		{
			Puff.Actor->AddActorWorldOffset(Puff.VelocityUE * DeltaSeconds);
			Puff.Actor->SetActorScale3D(FVector(Puff.BaseScale * (1.0f + T * 2.4f)));
		}
	}

	// 0.09 s damage smoke trail & wildfire emission cadence (`damage_smoke_trail.js` parity)
	const double NowS = LatestFrame.sim_time_s;
	if ((NowS - LastSmokeEmitSimTime) >= 0.09 || NowS < LastSmokeEmitSimTime)
	{
		LastSmokeEmitSimTime = NowS;
		for (int32 i = 0; i < LatestContacts.Num(); ++i)
		{
			const GunsSimContact& C = LatestContacts[i];
			if (C.alive != 0 && (C.role == 7 || (C.role < 10 && C.health < 0.72)))
			{
				const FVector PosUE = SimBridge.SimPosToUE(C.pos_east_m, C.pos_up_m, C.pos_north_m);
				SpawnSmokePuffAt(PosUE, C.role == 7 ? 2.5f : 5.5f);
			}
		}
		if (LatestOkanagan.active != 0 && LatestFireCells.Num() > 0)
		{
			const int32 Step = FMath::Max(1, LatestFireCells.Num() / 8);
			const int32 Phase = static_cast<int32>(NowS * 11.0) % Step;
			for (int32 i = Phase; i < LatestFireCells.Num(); i += Step)
			{
				if (LatestFireCells[i].intensity01 > 0.25)
				{
					const FVector CellUE = SimBridge.SimPosToUE(LatestFireCells[i].east_m, LatestFireCells[i].up_m + 18.0, LatestFireCells[i].north_m);
					SpawnSmokePuffAt(CellUE, static_cast<float>(7.0 + LatestFireCells[i].intensity01 * 8.0));
				}
			}
		}
	}

	// Okanagan persistent HDR wildfire flames along active fire perimeter cells
	FActorSpawnParameters SpawnParams;
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	if (LatestOkanagan.active != 0)
	{
		const int32 MaxFlames = FMath::Min(LatestFireCells.Num(), 48);
		while (WildfireFlameActors.Num() < MaxFlames)
		{
			if (AActor* Flame = World->SpawnActor<AActor>(FVector::ZeroVector, FRotator::ZeroRotator, SpawnParams))
			{
				if (MeshExplosion != nullptr)
				{
					UStaticMeshComponent* Comp = NewObject<UStaticMeshComponent>(Flame, TEXT("FireCellFlame"));
					Comp->SetStaticMesh(MeshExplosion);
					Comp->SetCollisionEnabled(ECollisionEnabled::NoCollision);
					Flame->SetRootComponent(Comp);
					Comp->RegisterComponent();
				}
				WildfireFlameActors.Add(Flame);
			}
			else
			{
				break;
			}
		}
		for (int32 i = 0; i < WildfireFlameActors.Num(); ++i)
		{
			AActor* Flame = WildfireFlameActors[i];
			if (Flame == nullptr) continue;
			if (i < MaxFlames && LatestFireCells[i].intensity01 > 0.08)
			{
				const GunsSimFireCell& Fc = LatestFireCells[i];
				const float Pulse = 1.0f + 0.22f * FMath::Sin(static_cast<float>(NowS * 6.5 + i * 1.7));
				Flame->SetActorHiddenInGame(false);
				Flame->SetActorLocation(SimBridge.SimPosToUE(Fc.east_m, Fc.up_m + 6.0, Fc.north_m));
				Flame->SetActorScale3D(FVector(static_cast<float>(4.0 + Fc.intensity01 * 9.0) * Pulse));
			}
			else
			{
				Flame->SetActorHiddenInGame(true);
			}
		}

		// Water drop translucent curtain below AT-802F belly gates
		if (LatestOkanagan.water_released_this_tick_kg > 0.1 || LatestOkanagan.dropping != 0)
		{
			WaterCurtainTimer = 0.65f;
		}
		if (WaterDropActors.Num() == 0)
		{
			if (AActor* WaterActor = World->SpawnActor<AActor>(FVector::ZeroVector, FRotator::ZeroRotator, SpawnParams))
			{
				UMaterialInterface* WaterMat = FGunsOnlyWorldBuilder::LoadGunsMaterial(
					TEXT("/Game/GunsOnly/Materials/M_Water_Curtain.M_Water_Curtain"), WaterActor, FLinearColor(0.85f, 0.95f, 1.0f));
				UProceduralMeshComponent* WM = NewObject<UProceduralMeshComponent>(WaterActor, TEXT("WaterCurtainMesh"));
				WaterActor->SetRootComponent(WM);
				WM->RegisterComponent();
				FGunsOnlyWorldBuilder::BuildBoxProceduralMesh(WM, WaterActor, FVector(520.0, 95.0, 1100.0), FLinearColor(0.85f, 0.95f, 1.0f));
				if (WaterMat != nullptr) WM->SetMaterial(0, WaterMat);
				WaterDropActors.Add(WaterActor);
			}
		}
		if (WaterDropActors.Num() > 0 && WaterDropActors[0] != nullptr)
		{
			const bool bShowCurtain = WaterCurtainTimer > 0.01f;
			WaterDropActors[0]->SetActorHiddenInGame(!bShowCurtain);
			if (bShowCurtain)
			{
				WaterDropActors[0]->SetActorLocationAndRotation(
					GetActorLocation() - FVector(0.0, 0.0, 1200.0),
					FRotator(0.0f, GetActorRotation().Yaw, 0.0f));
			}
		}
	}
}

void AGunsOnlyFlightPawn::UpdatePadlockAndHeadMotion(float DeltaSeconds)
{
	if (bChaseCameraActive || LatestFrame.player_alive == 0)
	{
		return;
	}

	const bool bIsCobra = (CurrentBeatIndex == GUNS_SIM_BEAT_COBRA_CANYON);
	const bool bIsFireBoss = (CurrentBeatIndex == GUNS_SIM_BEAT_OKANAGAN_FIREBOSS);
	const FVector BaseLoc = bIsCobra
		? FVector(155.0, 0.0, 85.0)
		: (bIsFireBoss ? FVector(-45.0, 0.0, 128.0) : FVector(240.0, 0.0, 115.0));

	// 2nd-order critically damped head-motion spring (`cockpit_head_motion.js`)
	const float Dt = FMath::Clamp(DeltaSeconds, 0.001f, 0.05f);
	const double GDelta = LatestFrame.nz_g - 1.0;
	double RecoilX = 0.0;
	if (LatestFrame.rounds_fired > PrevRoundsFired)
	{
		RecoilX = -2.8;
		HeadVelX -= 48.0;
	}
	PrevRoundsFired = LatestFrame.rounds_fired;

	const double TargetX = FMath::Clamp(-LatestCarrier.wire_decel_mps2 * 0.25 + RecoilX, -10.0, 4.0);
	const double TargetY = FMath::Clamp(LatestPilot.body_rate_p_rps * 1.4, -4.5, 4.5);
	const double TargetZ = FMath::Clamp(-GDelta * 1.05, -8.5, 8.5);
	constexpr double Omega = 11.5;
	constexpr double Zeta = 0.86;
	auto StepSpring = [Dt, Omega, Zeta](double& Pos, double& Vel, double Target)
	{
		const double Acc = Omega * Omega * (Target - Pos) - 2.0 * Zeta * Omega * Vel;
		Vel += Acc * Dt;
		Pos += Vel * Dt;
	};
	StepSpring(HeadOffsetX, HeadVelX, TargetX);
	StepSpring(HeadOffsetY, HeadVelY, TargetY);
	StepSpring(HeadOffsetZ, HeadVelZ, TargetZ);

	HeadPitchDeg = FMath::Clamp(LatestPilot.buffet_pitch_deg * 0.35 + GDelta * 0.22, -2.5, 2.5);
	HeadRollDeg = FMath::Clamp(LatestPilot.buffet_roll_deg * 0.35, -2.0, 2.0);
	CockpitCamera->SetRelativeLocation(BaseLoc + FVector(HeadOffsetX, HeadOffsetY, HeadOffsetZ));

	// Smooth gimballed padlock (`padlock_controller.js`): 240 deg/s yaw, 180 deg/s pitch, 260 deg/s return, +-165/88 limits
	double DesiredYaw = 0.0;
	double DesiredPitch = 0.0;
	double DesiredRoll = 0.0;
	bool bHasTargetVec = false;
	FVector TargetUE = FVector::ZeroVector;

	if (bPadlockActive)
	{
		if (bIsCobra && LatestCobra.has_target != 0)
		{
			TargetUE = SimBridge.SimPosToUE(LatestCobra.target_east_m, LatestCobra.target_up_m, LatestCobra.target_north_m);
			bHasTargetVec = true;
		}
		else if (LatestContacts.Num() > 0)
		{
			int32 MatchIdx = -1;
			if (LatestDirector.selected_target_slot <= 0)
			{
				for (int32 i = 0; i < LatestContacts.Num(); ++i)
				{
					const int32 R = LatestContacts[i].role;
					if (LatestContacts[i].alive != 0 && R != 3 && R != 7 && R < 10)
					{
						MatchIdx = i;
						break;
					}
				}
			}
			else
			{
				int32 WingCounter = 0;
				for (int32 i = 0; i < LatestContacts.Num(); ++i)
				{
					if (LatestContacts[i].alive != 0 && LatestContacts[i].role == 2)
					{
						WingCounter++;
						if (WingCounter == LatestDirector.selected_target_slot)
						{
							MatchIdx = i;
							break;
						}
					}
				}
				if (MatchIdx < 0)
				{
					for (int32 i = 0; i < LatestContacts.Num(); ++i)
					{
						if (LatestContacts[i].alive != 0 && LatestContacts[i].role != 3 && LatestContacts[i].role != 7)
						{
							MatchIdx = i;
							break;
						}
					}
				}
			}
			if (MatchIdx >= 0)
			{
				const GunsSimContact& C = LatestContacts[MatchIdx];
				TargetUE = SimBridge.SimPosToUE(C.pos_east_m, C.pos_up_m, C.pos_north_m);
				bHasTargetVec = true;
			}
		}
	}

	if (bHasTargetVec)
	{
		const FVector DeltaWorld = TargetUE - GetActorLocation();
		const FVector Local = GetActorQuat().UnrotateVector(DeltaWorld);
		const double Len = Local.Size();
		if (Len > 100.0)
		{
			double RawYaw = FMath::RadiansToDegrees(FMath::Atan2(Local.Y, Local.X));
			if (FMath::Abs(RawYaw) > 155.0)
			{
				if (FMath::Abs(RawYaw) > 172.0) RawYaw = PadlockShoulderSign * 165.0;
				else PadlockShoulderSign = (RawYaw >= 0.0) ? 1.0 : -1.0;
			}
			const double RawPitch = FMath::RadiansToDegrees(FMath::Asin(FMath::Clamp(Local.Z / Len, -1.0, 1.0)));
			// FOV-aware nose residual pull (~0.84 factor keeps aircraft nose/horizon readable while tracking high-aspect)
			DesiredYaw = FMath::Clamp(RawYaw * 0.85, -165.0, 165.0);
			DesiredPitch = FMath::Clamp(RawPitch * 0.85, -88.0, 88.0);
			DesiredRoll = FMath::Clamp(LatestPilot.body_rate_p_rps * 6.0 - (DesiredYaw * 0.08), -16.0, 16.0);
		}
	}
	else if (bPadlockActive)
	{
		bPadlockActive = false;
		SimBridge.SetPadlockRollAssist(false);
	}

	// Allow subtle manual right-stick look when unlocked
	if (!bPadlockActive)
	{
		if (APlayerController* PC = Cast<APlayerController>(GetController()))
		{
			const float RX = PC->GetInputAnalogKeyState(EKeys::Gamepad_RightX);
			const float RY = PC->GetInputAnalogKeyState(EKeys::Gamepad_RightY);
			if (FMath::Abs(RX) > 0.12f) DesiredYaw = RX * 85.0;
			if (FMath::Abs(RY) > 0.12f) DesiredPitch = RY * 55.0;
		}
	}

	const double YawRate = bPadlockActive ? 240.0 : 260.0;
	const double PitchRate = bPadlockActive ? 180.0 : 260.0;
	PadlockYawDeg = MoveToward(PadlockYawDeg, DesiredYaw, YawRate * Dt);
	PadlockPitchDeg = MoveToward(PadlockPitchDeg, DesiredPitch, PitchRate * Dt);
	PadlockRollDeg = MoveToward(PadlockRollDeg, DesiredRoll, 120.0 * Dt);

	CockpitCamera->SetRelativeRotation(FRotator(
		static_cast<float>(PadlockPitchDeg + HeadPitchDeg),
		static_cast<float>(PadlockYawDeg),
		static_cast<float>(PadlockRollDeg + HeadRollDeg)));
}

void AGunsOnlyFlightPawn::UpdatePhysiologyPostProcess()
{
	APostProcessVolume* PPV = AtmoRig.PostProcessVolume.Get();
	if (PPV == nullptr) return;

	const float Periph = static_cast<float>(FMath::Clamp(LatestPilot.peripheral_vision01, 0.0, 1.0));
	const float Cent = static_cast<float>(FMath::Clamp(LatestPilot.central_vision01, 0.0, 1.0));
	const float Red = static_cast<float>(FMath::Clamp(LatestPilot.redout01, 0.0, 1.0));

	PPV->Settings.bOverride_VignetteIntensity = true;
	PPV->Settings.VignetteIntensity = FMath::Lerp(2.90f, 0.35f, Periph);

	const float Sat = FMath::Lerp(0.10f, 1.0f, Periph);
	PPV->Settings.bOverride_ColorSaturation = true;
	PPV->Settings.ColorSaturation = FVector4(Sat, Sat, Sat, 1.0f);

	FLinearColor Tint(Cent, Cent, Cent, 1.0f);
	if (Red > 0.05f)
	{
		Tint = FMath::Lerp(Tint, FLinearColor(1.0f, 0.22f, 0.16f, 1.0f), Red * 0.78f);
	}
	PPV->Settings.bOverride_SceneColorTint = true;
	PPV->Settings.SceneColorTint = Tint;
}

void AGunsOnlyFlightPawn::UpdateAudioEngine(float DeltaSeconds)
{
	if (bAudioCliDisabled || bMuted || bPaused || bProgramPickerOpen || LatestFrame.player_alive == 0)
	{
		if (AudioEngineIdle && AudioEngineIdle->IsPlaying()) AudioEngineIdle->SetPaused(true);
		if (AudioEngineMil && AudioEngineMil->IsPlaying()) AudioEngineMil->SetPaused(true);
		if (AudioEngineGrit && AudioEngineGrit->IsPlaying()) AudioEngineGrit->SetPaused(true);
		if (AudioWeaponLoop && AudioWeaponLoop->IsPlaying()) AudioWeaponLoop->Stop();
		if (AudioSeekerLoop && AudioSeekerLoop->IsPlaying()) AudioSeekerLoop->Stop();
		if (AudioWarnLoop && AudioWarnLoop->IsPlaying()) AudioWarnLoop->Stop();
		return;
	}

	const bool bIsCobra = (CurrentBeatIndex == GUNS_SIM_BEAT_COBRA_CANYON);
	const bool bIsF14 = (CurrentBeatIndex == GUNS_SIM_BEAT_TOPGUN_F14);
	const bool bIsRapier = (CurrentBeatIndex == GUNS_SIM_BEAT_RAPIER_INTERCEPT);
	const bool bIsFireBoss = (CurrentBeatIndex == GUNS_SIM_BEAT_OKANAGAN_FIREBOSS);

	if (PrevAudioBeat != CurrentBeatIndex)
	{
		PrevAudioBeat = CurrentBeatIndex;
		auto BindSound = [](UAudioComponent* C, USoundWave* W)
		{
			if (C == nullptr) return;
			C->Stop();
			C->SetSound(W);
			if (W != nullptr) C->Play();
		};
		if (bIsCobra)
		{
			BindSound(AudioEngineIdle, SndCobraRotor);
			BindSound(AudioEngineMil, nullptr);
			BindSound(AudioEngineGrit, nullptr);
		}
		else if (bIsF14)
		{
			BindSound(AudioEngineIdle, SndF14Engine);
			BindSound(AudioEngineMil, nullptr);
			BindSound(AudioEngineGrit, nullptr);
		}
		else if (bIsFireBoss)
		{
			BindSound(AudioEngineIdle, SndFireBossProp);
			BindSound(AudioEngineMil, nullptr);
			BindSound(AudioEngineGrit, nullptr);
		}
		else if (bIsRapier)
		{
			BindSound(AudioEngineIdle, SndRapierIdle);
			BindSound(AudioEngineMil, SndRapierMil);
			BindSound(AudioEngineGrit, SndRapierGrit);
		}
		else
		{
			BindSound(AudioEngineIdle, SndF22Idle);
			BindSound(AudioEngineMil, SndF22Mil);
			BindSound(AudioEngineGrit, SndF22Grit);
		}
	}

	const float Thr = static_cast<float>(FMath::Clamp(LatestFrame.throttle01, 0.0, 1.3));
	if (bIsCobra || bIsF14 || bIsFireBoss)
	{
		if (AudioEngineIdle && AudioEngineIdle->Sound != nullptr)
		{
			AudioEngineIdle->SetPaused(false);
			if (!AudioEngineIdle->IsPlaying()) AudioEngineIdle->Play();
			const float Vol = bIsCobra ? 0.55f : FMath::Lerp(0.28f, 0.68f, FMath::Clamp(Thr, 0.0f, 1.0f));
			const float Pitch = bIsCobra
				? static_cast<float>(FMath::Clamp(LatestCobra.main_rotor_rpm / 324.0, 0.75, 1.20))
				: FMath::Lerp(0.86f, 1.18f, FMath::Clamp(Thr, 0.0f, 1.0f));
			AudioEngineIdle->SetVolumeMultiplier(Vol);
			AudioEngineIdle->SetPitchMultiplier(Pitch);
		}
	}
	else
	{
		const float WIdle = FMath::Clamp(1.0f - Thr * 1.4f, 0.08f, 0.65f);
		const float WMil = FMath::Clamp(Thr <= 0.7f ? (Thr / 0.7f) : (1.0f - (Thr - 0.7f) * 2.0f), 0.0f, 0.65f);
		const float WGrit = FMath::Clamp((Thr - 0.65f) / 0.35f, 0.0f, 0.80f);
		const float JetPitch = FMath::Clamp(0.92f + static_cast<float>(LatestFrame.mach) * 0.14f, 0.85f, 1.25f);
		auto TuneJetLayer = [JetPitch](UAudioComponent* C, float V)
		{
			if (C == nullptr || C->Sound == nullptr) return;
			C->SetPaused(false);
			if (!C->IsPlaying()) C->Play();
			C->SetVolumeMultiplier(V);
			C->SetPitchMultiplier(JetPitch);
		};
		TuneJetLayer(AudioEngineIdle, WIdle * 0.55f);
		TuneJetLayer(AudioEngineMil, WMil * 0.55f);
		TuneJetLayer(AudioEngineGrit, WGrit * 0.60f);
	}

	// Cannon / minigun loop
	const bool bFiringGun = bIsCobra
		? (LatestCobra.gunner_fire_authorized != 0)
		: (LatestTracers.ContainsByPredicate([](const GunsSimTracer& T) { return T.friendly == 1 && T.age_s < 0.06; }));
	if (bFiringGun)
	{
		USoundWave* GunWave = bIsCobra ? SndMinigunLoop.Get() : SndVulcanLoop.Get();
		if (AudioWeaponLoop && GunWave != nullptr)
		{
			if (AudioWeaponLoop->Sound != GunWave) AudioWeaponLoop->SetSound(GunWave);
			if (!AudioWeaponLoop->IsPlaying()) AudioWeaponLoop->Play();
			AudioWeaponLoop->SetVolumeMultiplier(0.55f);
		}
	}
	else if (AudioWeaponLoop && AudioWeaponLoop->IsPlaying())
	{
		AudioWeaponLoop->Stop();
	}

	// AIM-9 Seeker Growl / Lock tone
	if (!bIsCobra && !bIsFireBoss && LatestDirector.missiles_remaining > 0 && LatestDirector.aim9_seeker_state >= 2)
	{
		USoundWave* SeekWave = (LatestDirector.aim9_seeker_state >= 3) ? SndAim9Lock.Get() : SndAim9Growl.Get();
		if (AudioSeekerLoop && SeekWave != nullptr)
		{
			if (AudioSeekerLoop->Sound != SeekWave)
			{
				AudioSeekerLoop->Stop();
				AudioSeekerLoop->SetSound(SeekWave);
			}
			if (!AudioSeekerLoop->IsPlaying()) AudioSeekerLoop->Play();
			AudioSeekerLoop->SetVolumeMultiplier(0.32f);
		}
	}
	else if (AudioSeekerLoop && AudioSeekerLoop->IsPlaying())
	{
		AudioSeekerLoop->Stop();
	}

	// Auto-GCAS warning tone
	if (!bIsCobra && !bIsFireBoss && (LatestPilot.auto_gcas_warning != 0 || LatestPilot.auto_gcas_active != 0))
	{
		if (AudioWarnLoop && SndPullUpWarn != nullptr)
		{
			if (AudioWarnLoop->Sound != SndPullUpWarn) AudioWarnLoop->SetSound(SndPullUpWarn);
			if (!AudioWarnLoop->IsPlaying()) AudioWarnLoop->Play();
			AudioWarnLoop->SetVolumeMultiplier(0.50f);
		}
	}
	else if (AudioWarnLoop && AudioWarnLoop->IsPlaying())
	{
		AudioWarnLoop->Stop();
	}
	(void)DeltaSeconds;
}

void AGunsOnlyFlightPawn::SyncVisualActors()
{
	UWorld* World = GetWorld();
	if (World == nullptr || !SimBridge.ReadFrame(LatestFrame))
	{
		return;
	}

	const FVector PlayerPos = SimBridge.SimPosToUE(
		LatestFrame.pos_east_m, LatestFrame.pos_up_m, LatestFrame.pos_north_m);
	const FQuat PlayerQuat = FGunsOnlySimBridge::SimBasisToUEQuat(
		LatestFrame.fwd_east, LatestFrame.fwd_up, LatestFrame.fwd_north,
		LatestFrame.up_east, LatestFrame.up_up, LatestFrame.up_north);
	SetActorLocationAndRotation(PlayerPos, PlayerQuat);

	SimBridge.ReadCourse(LatestCourse);
	SimBridge.ReadLeadCue(LatestLeadCue);
	SimBridge.ReadCobraState(LatestCobra);
	SimBridge.ReadGunFunnel(LatestFunnel);
	SimBridge.ReadPilotState(LatestPilot);
	SimBridge.ReadCombatDirector(LatestDirector);
	SimBridge.ReadWeather(LatestWeather);
	SimBridge.ReadCarrier(LatestCarrier);
	SimBridge.ReadOkanagan(LatestOkanagan);
	if (LatestOkanagan.active != 0)
	{
		SimBridge.ReadFireCells(LatestFireCells);
	}

	FGunsOnlyWorldBuilder::ApplyTheatreWeather(
		AtmoRig, CurrentBeatIndex, LatestWeather, LatestFrame, LatestFrame.sim_time_s, false);

	// Move live aircraft carrier across Pacific Ocean in Top Gun
	if (LatestCarrier.present != 0 && AtmoRig.CarrierActor.IsValid())
	{
		const FVector ShipPos = SimBridge.SimPosToUE(LatestCarrier.pos_east_m, LatestCarrier.pos_up_m, LatestCarrier.pos_north_m);
		const float ShipYaw = static_cast<float>(FMath::RadiansToDegrees(LatestCarrier.heading_rad));
		AtmoRig.CarrierActor->SetActorLocationAndRotation(ShipPos, FRotator(0.0f, ShipYaw, 0.0f));
	}

	const bool bIsCobra = (LatestCobra.active != 0);
	const bool bIsFireBoss = (LatestOkanagan.active != 0);
	if (bIsCobra)
	{
		const float RotorDeg = static_cast<float>(FMath::RadiansToDegrees(LatestCobra.rotor_azimuth_rad));
		CobraMainRotorMesh->SetRelativeRotation(FRotator(0.0f, RotorDeg, 0.0f));
		AfterburnerMesh->SetVisibility(false);
		AfterburnerStaticMesh->SetVisibility(false);
	}
	else if (bIsFireBoss)
	{
		FireBossPropDeg = FMath::Fmod(FireBossPropDeg + (14.0 + LatestFrame.throttle01 * 24.0), 360.0);
		FireBossPropMesh->SetRelativeRotation(FRotator(0.0f, 0.0f, static_cast<float>(FireBossPropDeg)));
		AfterburnerMesh->SetVisibility(false);
		AfterburnerStaticMesh->SetVisibility(false);
		FGunsOnlyWorldBuilder::UpdatePapiRig(PapiRig, LatestCourse.glideslope_deg);
	}
	else
	{
		const bool bBurnerOn = LatestFrame.player_alive != 0 && LatestFrame.throttle01 > 0.76;
		const float BurnerScaleX = bBurnerOn
			? static_cast<float>(FMath::Lerp(0.45, 1.40, FMath::Clamp((LatestFrame.throttle01 - 0.76) / 0.24, 0.0, 1.0)))
			: 0.01f;
		AfterburnerMesh->SetRelativeScale3D(FVector(BurnerScaleX, 1.0f, 1.0f));
		AfterburnerStaticMesh->SetRelativeScale3D(FVector(BurnerScaleX, 1.0f, 1.0f));
		AfterburnerMesh->SetVisibility(!bHasAfterburnerStaticMesh && bChaseCameraActive && bBurnerOn);
		AfterburnerStaticMesh->SetVisibility(bHasAfterburnerStaticMesh && bChaseCameraActive && bBurnerOn);
		FGunsOnlyWorldBuilder::UpdatePapiRig(PapiRig, LatestCourse.glideslope_deg);
	}

	UpdateWingtipVaporTrails();

	FActorSpawnParameters SpawnParams;
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

	SimBridge.ReadContacts(LatestContacts);
	while (ContactActors.Num() < LatestContacts.Num())
	{
		AActor* ContactActor = World->SpawnActor<AActor>(FVector::ZeroVector, FRotator::ZeroRotator, SpawnParams);
		const int32 Idx = ContactActors.Num();
		const int32 ContactRole = Idx < LatestContacts.Num() ? LatestContacts[Idx].role : 1;
		if (ContactRole >= 10)
		{
			if (MeshBunker != nullptr)
			{
				UStaticMeshComponent* StaticComp = NewObject<UStaticMeshComponent>(ContactActor, TEXT("GroundStaticMesh"));
				StaticComp->SetStaticMesh(MeshBunker);
				StaticComp->SetCollisionEnabled(ECollisionEnabled::NoCollision);
				ContactActor->SetRootComponent(StaticComp);
				StaticComp->RegisterComponent();
			}
			else
			{
				UProceduralMeshComponent* BoxMesh = NewObject<UProceduralMeshComponent>(ContactActor, TEXT("GroundBoxMesh"));
				ContactActor->SetRootComponent(BoxMesh);
				BoxMesh->RegisterComponent();
				FGunsOnlyWorldBuilder::BuildBoxProceduralMesh(
					BoxMesh, ContactActor, FVector(320.0, 280.0, 140.0),
					ContactRole >= 14 ? FLinearColor(0.20f, 0.55f, 0.85f) : FLinearColor(0.75f, 0.25f, 0.20f));
			}
		}
		else if (ContactRole == 7)
		{
			// Active AIM-9 / Rapier SRM in flight
			UStaticMesh* FlareMesh = FGunsOnlyWorldBuilder::LoadGunsStaticMesh(
				TEXT("/Game/GunsOnly/Meshes/SM_Afterburner_Plume.SM_Afterburner_Plume"));
			if (FlareMesh != nullptr)
			{
				UStaticMeshComponent* StaticComp = NewObject<UStaticMeshComponent>(ContactActor, TEXT("MissileMesh"));
				StaticComp->SetStaticMesh(FlareMesh);
				StaticComp->SetCollisionEnabled(ECollisionEnabled::NoCollision);
				ContactActor->SetRootComponent(StaticComp);
				StaticComp->RegisterComponent();
			}
			else
			{
				UProceduralMeshComponent* MslMesh = NewObject<UProceduralMeshComponent>(ContactActor, TEXT("MissileBox"));
				ContactActor->SetRootComponent(MslMesh);
				MslMesh->RegisterComponent();
				FGunsOnlyWorldBuilder::BuildBoxProceduralMesh(
					MslMesh, ContactActor, FVector(160.0, 14.0, 14.0), FLinearColor(2.0f, 0.8f, 0.2f));
			}
		}
		else
		{
			UStaticMesh* ChosenStatic = nullptr;
			if (ContactRole == 3) ChosenStatic = MeshF22;
			else if (ContactRole == 4) ChosenStatic = MeshMig28 != nullptr ? MeshMig28 : MeshSu27;
			else if (ContactRole == 5) ChosenStatic = MeshBalloon != nullptr ? MeshBalloon : MeshSu27;
			else if (ContactRole == 6) ChosenStatic = MeshRapier != nullptr ? MeshRapier : MeshSu27;
			else ChosenStatic = MeshSu27;

			if (ChosenStatic != nullptr)
			{
				UStaticMeshComponent* StaticComp = NewObject<UStaticMeshComponent>(ContactActor, TEXT("ContactStaticMesh"));
				StaticComp->SetStaticMesh(ChosenStatic);
				StaticComp->SetCollisionEnabled(ECollisionEnabled::NoCollision);
				ContactActor->SetRootComponent(StaticComp);
				StaticComp->RegisterComponent();
			}
			else
			{
				UProceduralMeshComponent* Mesh = NewObject<UProceduralMeshComponent>(ContactActor, TEXT("ContactMesh"));
				ContactActor->SetRootComponent(Mesh);
				Mesh->RegisterComponent();
				if (ContactRole == 3)
				{
					FGunsOnlyWorldBuilder::BuildF22ProceduralMesh(
						Mesh, ContactActor, FLinearColor(0.32f, 0.62f, 0.85f), FLinearColor(0.85f, 0.72f, 0.30f));
				}
				else
				{
					FGunsOnlyWorldBuilder::BuildSu27ProceduralMesh(
						Mesh, ContactActor, FLinearColor(0.38f, 0.48f, 0.62f), FLinearColor(0.65f, 0.84f, 0.96f));
				}
			}
		}
		ContactActors.Add(ContactActor);
		ContactBuiltRole.Add(ContactRole);
		ContactWasAlive.Add(1);
	}
	for (int32 i = 0; i < ContactActors.Num(); ++i)
	{
		AActor* Actor = ContactActors[i];
		if (Actor == nullptr) continue;
		if (i < LatestContacts.Num() && LatestContacts[i].alive != 0)
		{
			const GunsSimContact& C = LatestContacts[i];
			ContactWasAlive[i] = 1;
			if (C.role >= 10)
			{
				const float Scale = (C.role == 11 || C.role == 12) ? 1.25f : (C.role == 10 || C.role == 15 ? 0.95f : 0.62f);
				Actor->SetActorScale3D(FVector(Scale));
			}
			else if (C.role == 7)
			{
				Actor->SetActorScale3D(FVector(0.55f, 0.35f, 0.35f));
			}
			else
			{
				Actor->SetActorScale3D(FVector(1.0f));
			}
			Actor->SetActorHiddenInGame(false);
			Actor->SetActorLocationAndRotation(
				SimBridge.SimPosToUE(C.pos_east_m, C.pos_up_m, C.pos_north_m),
				FGunsOnlySimBridge::SimBasisToUEQuat(
					C.fwd_east, C.fwd_up, C.fwd_north,
					C.up_east, C.up_up, C.up_north));
		}
		else
		{
			if (i < LatestContacts.Num() && ContactWasAlive.IsValidIndex(i) && ContactWasAlive[i] != 0)
			{
				ContactWasAlive[i] = 0;
				const GunsSimContact& C = LatestContacts[i];
				if (C.role != 7)
				{
					const FVector DeadPos = SimBridge.SimPosToUE(C.pos_east_m, C.pos_up_m, C.pos_north_m);
					SpawnExplosionAt(DeadPos, C.role >= 10 ? 5.0f : 14.0f);
					KillFlashTimer = 0.45f;
					PlayOneShotUiOrCombat(SndExplosion, 0.85f);
				}
			}
			Actor->SetActorHiddenInGame(true);
		}
	}

	// Sync gun tracers & Hydra-70 rockets + muzzle flash light
	SimBridge.ReadTracers(LatestTracers);
	const bool bRecentFriendlyTracer = LatestTracers.ContainsByPredicate([](const GunsSimTracer& Tr)
	{
		return Tr.friendly != 0 && Tr.age_s < 0.08;
	});
	MuzzleFlashLight->SetIntensity(bRecentFriendlyTracer ? 35000.0f : 0.0f);

	UMaterialInterface* BoltMat = LoadObject<UMaterialInterface>(
		nullptr, TEXT("/Game/GunsOnly/Materials/M_Tracer_Bolt.M_Tracer_Bolt"));
	UMaterialInterface* RocketMat = LoadObject<UMaterialInterface>(
		nullptr, TEXT("/Game/GunsOnly/Materials/M_Rocket_Flare.M_Rocket_Flare"));

	while (TracerActors.Num() < LatestTracers.Num())
	{
		AActor* TracerActor = World->SpawnActor<AActor>(FVector::ZeroVector, FRotator::ZeroRotator, SpawnParams);
		UProceduralMeshComponent* Mesh = NewObject<UProceduralMeshComponent>(TracerActor, TEXT("TracerBolt"));
		TracerActor->SetRootComponent(Mesh);
		Mesh->RegisterComponent();
		FGunsOnlyWorldBuilder::BuildBoxProceduralMesh(
			Mesh, TracerActor, FVector(240.0, 20.0, 20.0), FLinearColor(1.0f, 0.84f, 0.28f));
		if (BoltMat != nullptr) Mesh->SetMaterial(0, BoltMat);
		TracerActors.Add(TracerActor);
		TracerBuiltFriendly.Add(1);
	}
	for (int32 i = 0; i < TracerActors.Num(); ++i)
	{
		AActor* Actor = TracerActors[i];
		if (Actor == nullptr) continue;
		if (i < LatestTracers.Num())
		{
			const GunsSimTracer& T = LatestTracers[i];
			if (i < TracerBuiltFriendly.Num() && TracerBuiltFriendly[i] != T.friendly)
			{
				if (UProceduralMeshComponent* Mesh = Cast<UProceduralMeshComponent>(Actor->GetRootComponent()))
				{
					UMaterialInterface* UseMat = (T.friendly == 2 && RocketMat != nullptr) ? RocketMat : BoltMat;
					if (UseMat != nullptr) Mesh->SetMaterial(0, UseMat);
				}
				TracerBuiltFriendly[i] = T.friendly;
			}
			const FVector Scale = T.friendly == 2
				? FVector(1.0f, 1.45f, 1.45f)
				: (bIsCobra ? FVector(0.55f, 0.65f, 0.65f) : FVector(1.75f, 1.1f, 1.1f));
			Actor->SetActorScale3D(Scale);
			const FVector Dir = FGunsOnlySimBridge::SimDirToUE(T.vel_east_mps, T.vel_up_mps, T.vel_north_mps);
			Actor->SetActorHiddenInGame(false);
			Actor->SetActorLocationAndRotation(
				SimBridge.SimPosToUE(T.pos_east_m, T.pos_up_m, T.pos_north_m),
				Dir.IsNearlyZero() ? FRotator::ZeroRotator : Dir.Rotation());
		}
		else
		{
			Actor->SetActorHiddenInGame(true);
		}
	}

	// Sync hollow 3D RTB / Okanagan approach gate portals
	if (!bIsCobra && LatestFrame.guidance_active != 0)
	{
		SimBridge.ReadGates(LatestGates);
	}
	else
	{
		LatestGates.Reset();
	}
	UStaticMesh* GateStatic = FGunsOnlyWorldBuilder::LoadGunsStaticMesh(TEXT("/Game/GunsOnly/Meshes/SM_ApproachGate_Portal.SM_ApproachGate_Portal"));
	while (GateActors.Num() < LatestGates.Num())
	{
		AActor* GateActor = World->SpawnActor<AActor>(FVector::ZeroVector, FRotator::ZeroRotator, SpawnParams);
		if (GateStatic != nullptr)
		{
			UStaticMeshComponent* StaticComp = NewObject<UStaticMeshComponent>(GateActor, TEXT("ApproachGateStatic"));
			StaticComp->SetStaticMesh(GateStatic);
			StaticComp->SetCollisionEnabled(ECollisionEnabled::NoCollision);
			GateActor->SetRootComponent(StaticComp);
			StaticComp->RegisterComponent();
		}
		else
		{
			UProceduralMeshComponent* Mesh = NewObject<UProceduralMeshComponent>(GateActor, TEXT("ApproachGate"));
			GateActor->SetRootComponent(Mesh);
			Mesh->RegisterComponent();
			FGunsOnlyWorldBuilder::BuildGatePortalMesh(
				Mesh, GateActor, FVector(260.0, 5200.0, 1500.0), FLinearColor(0.20f, 0.90f, 1.0f));
		}
		GateActors.Add(GateActor);
	}
	const FVector RunwayThresholdUE = LatestRunway.present != 0
		? SimBridge.SimPosToUE(LatestRunway.threshold_east_m, LatestRunway.threshold_up_m, LatestRunway.threshold_north_m)
		: FVector::ZeroVector;
	const float RunwayYawDeg = LatestRunway.present != 0
		? static_cast<float>(FMath::RadiansToDegrees(LatestRunway.heading_rad)) : 0.0f;
	for (int32 i = 0; i < GateActors.Num(); ++i)
	{
		AActor* Actor = GateActors[i];
		if (Actor == nullptr) continue;
		if (i < LatestGates.Num())
		{
			const GunsSimApproachGate& G = LatestGates[i];
			const FVector GatePos = SimBridge.SimPosToUE(G.east_m, G.up_m, G.north_m);
			FVector Tangent = FVector::ZeroVector;
			if (i + 1 < LatestGates.Num())
			{
				const GunsSimApproachGate& NextG = LatestGates[i + 1];
				Tangent = SimBridge.SimPosToUE(NextG.east_m, NextG.up_m, NextG.north_m) - GatePos;
			}
			else if (LatestRunway.present != 0)
			{
				Tangent = RunwayThresholdUE - GatePos;
			}
			const FVector HorizontalDir(Tangent.X, Tangent.Y, 0.0);
			const FRotator PortalRot = HorizontalDir.SizeSquared() > 100.0
				? HorizontalDir.Rotation() : FRotator(0.0f, RunwayYawDeg, 0.0f);
			const float GateScale = G.active != 0 ? 1.15f : 0.92f;
			Actor->SetActorHiddenInGame(false);
			Actor->SetActorLocationAndRotation(GatePos, PortalRot);
			Actor->SetActorScale3D(FVector(GateScale));
		}
		else
		{
			Actor->SetActorHiddenInGame(true);
		}
	}
}

void AGunsOnlyFlightPawn::UpdateWingtipVaporTrails()
{
	if (WingtipTrailMesh == nullptr)
	{
		return;
	}
	if (CurrentBeatIndex == GUNS_SIM_BEAT_COBRA_CANYON || CurrentBeatIndex == GUNS_SIM_BEAT_OKANAGAN_FIREBOSS)
	{
		LeftTrailPts.Reset();
		RightTrailPts.Reset();
		TrailTimes.Reset();
		WingtipTrailMesh->ClearAllMeshSections();
		return;
	}

	const double NowS = LatestFrame.sim_time_s;
	if (NowS + 0.05 < LastTrailSampleTime)
	{
		LeftTrailPts.Reset();
		RightTrailPts.Reset();
		TrailTimes.Reset();
		LastTrailSampleTime = NowS;
	}

	while (TrailTimes.Num() > 0 && (NowS - TrailTimes[0]) > 1.35)
	{
		TrailTimes.RemoveAt(0);
		LeftTrailPts.RemoveAt(0);
		RightTrailPts.RemoveAt(0);
	}

	const bool bEmitVapor = LatestFrame.player_alive != 0
		&& (FMath::Abs(LatestFrame.nz_g) > 3.2 || LatestFrame.pos_up_m > 6000.0 || LatestFrame.alpha_deg > 16.0);
	if (bEmitVapor && (NowS - LastTrailSampleTime) >= 0.025)
	{
		const FTransform Tx = GetActorTransform();
		const double SpanCm = CurrentBeatIndex == GUNS_SIM_BEAT_TOPGUN_F14 ? 970.0 : 678.0;
		LeftTrailPts.Add(Tx.TransformPosition(FVector(-340.0, -SpanCm, -8.0)));
		RightTrailPts.Add(Tx.TransformPosition(FVector(-340.0, SpanCm, -8.0)));
		TrailTimes.Add(NowS);
		LastTrailSampleTime = NowS;
		while (TrailTimes.Num() > 48)
		{
			TrailTimes.RemoveAt(0);
			LeftTrailPts.RemoveAt(0);
			RightTrailPts.RemoveAt(0);
		}
	}

	if (LeftTrailPts.Num() < 2)
	{
		WingtipTrailMesh->ClearAllMeshSections();
		return;
	}

	TArray<FVector> Verts, Normals;
	TArray<int32> Tris;
	TArray<FVector2D> UVs;
	TArray<FColor> Colors;
	TArray<FProcMeshTangent> Tangents;

	const FVector SpanAxis = GetActorRightVector();
	for (const TArray<FVector>* Chain : { &LeftTrailPts, &RightTrailPts })
	{
		const int32 Base = Verts.Num();
		const int32 N = Chain->Num();
		for (int32 i = 0; i < N; ++i)
		{
			const float T = static_cast<float>(i) / static_cast<float>(N - 1);
			const double HalfW = 6.0 + 18.0 * T;
			const FVector P = (*Chain)[i];
			Verts.Add(P - SpanAxis * HalfW);
			Verts.Add(P + SpanAxis * HalfW);
			Normals.Add(FVector::UpVector);
			Normals.Add(FVector::UpVector);
			UVs.Add(FVector2D(T, 0.0));
			UVs.Add(FVector2D(T, 1.0));
			const uint8 AlphaByte = static_cast<uint8>(FMath::Clamp(T * 200.0f, 12.0f, 200.0f));
			Colors.Add(FColor(240, 245, 255, AlphaByte));
			Colors.Add(FColor(240, 245, 255, AlphaByte));
			Tangents.Add(FProcMeshTangent());
			Tangents.Add(FProcMeshTangent());
		}
		for (int32 i = 0; i < N - 1; ++i)
		{
			const int32 I0 = Base + i * 2;
			Tris.Add(I0 + 0); Tris.Add(I0 + 2); Tris.Add(I0 + 1);
			Tris.Add(I0 + 1); Tris.Add(I0 + 2); Tris.Add(I0 + 3);
		}
	}
	WingtipTrailMesh->CreateMeshSection(0, Verts, Tris, Normals, UVs, Colors, Tangents, false);
}

bool AGunsOnlyFlightPawn::ConsumePendingQaCapture(FString& OutFilePath)
{
	if (!bQaHarnessActive || !bQaCaptureRequested || bQaCaptureInFlight || PendingQaFile.IsEmpty())
	{
		return false;
	}
	OutFilePath = PendingQaFile;
	bQaCaptureRequested = false;
	bQaCaptureInFlight = true;
	return true;
}

void AGunsOnlyFlightPawn::NotifyQaCaptureCompleted(const FString& CapturedPath)
{
	UE_LOG(LogTemp, Display, TEXT("GunsQaShots: captured %s (stage=%d)"), *CapturedPath, QaStage);
	QaStage++;
	QaSettleFrames = 28;
	QaShaderWaitFrames = 0;
	bQaCaptureRequested = false;
	bQaCaptureInFlight = false;
	PendingQaFile.Empty();

	if (QaStage == 1)
	{
		SetProgramPickerOpen(false);
		bChaseCameraActive = false;
		SyncCameraAndMeshVisibility();
		// Advance F-22 1.2s toward bandit & fire burst so tracers/funnel/clouds show cleanly
		SimBridge.SetControls(0.0, 0.0, 0.0, 0.85, false, 1);
		for (int32 i = 0; i < 12; ++i) SimBridge.Advance(1.0 / 60.0, 2);
		SimBridge.SetControls(0.0, 0.0, 0.0, 0.85, false, 0);
	}
	else if (QaStage == 2)
	{
		bPadlockActive = true;
		SimBridge.SetPadlockRollAssist(true);
		for (int32 i = 0; i < 8; ++i) SimBridge.Advance(1.0 / 60.0, 2);
	}
	else if (QaStage == 3)
	{
		SwitchMission(GUNS_SIM_BEAT_COBRA_CANYON);
		bChaseCameraActive = false;
		SyncCameraAndMeshVisibility();
		for (int32 i = 0; i < 12; ++i) SimBridge.Advance(1.0 / 60.0, 2);
	}
	else if (QaStage == 4)
	{
		SwitchMission(GUNS_SIM_BEAT_TOPGUN_F14);
		bChaseCameraActive = true;
		SyncCameraAndMeshVisibility();
		for (int32 i = 0; i < 8; ++i) SimBridge.Advance(1.0 / 60.0, 2);
	}
	else if (QaStage == 5)
	{
		SwitchMission(GUNS_SIM_BEAT_RAPIER_INTERCEPT);
		bChaseCameraActive = false;
		SyncCameraAndMeshVisibility();
		for (int32 i = 0; i < 10; ++i) SimBridge.Advance(1.0 / 60.0, 2);
	}
	else if (QaStage == 6)
	{
		SwitchMission(GUNS_SIM_BEAT_OKANAGAN_FIREBOSS);
		bChaseCameraActive = true;
		SyncCameraAndMeshVisibility();
		for (int32 i = 0; i < 15; ++i) SimBridge.Advance(1.0 / 60.0, 2);
	}
	else if (QaStage >= 7)
	{
		UE_LOG(LogTemp, Display, TEXT("GunsQaShots: all 7 shots complete, exiting cleanly."));
		FPlatformMisc::RequestExit(false);
	}
}

void AGunsOnlyFlightPawn::StepQaHarness()
{
	if (!bQaHarnessActive || bQaCaptureRequested || bQaCaptureInFlight)
	{
		return;
	}
#if WITH_EDITOR
	if (GShaderCompilingManager != nullptr && GShaderCompilingManager->IsCompiling() && QaShaderWaitFrames < 2400)
	{
		QaShaderWaitFrames++;
		QaSettleFrames = FMath::Max(QaSettleFrames, 20);
		return;
	}
#endif
	if (QaSettleFrames > 0)
	{
		QaSettleFrames--;
		return;
	}
	static const TCHAR* ShotNames[7] = {
		TEXT("01_program_picker.png"),
		TEXT("02_f22_dogfight_cockpit.png"),
		TEXT("03_f22_padlock_clouds.png"),
		TEXT("04_cobra_canyon.png"),
		TEXT("05_topgun_f14_carrier.png"),
		TEXT("06_rapier_stratosphere.png"),
		TEXT("07_okanagan_fireboss.png"),
	};
	if (QaStage >= 0 && QaStage < 7)
	{
		FPlatformFileManager::Get().GetPlatformFile().CreateDirectoryTree(*QaShotsDir);
		PendingQaFile = FPaths::Combine(QaShotsDir, ShotNames[QaStage]);
		bQaCaptureRequested = true;
	}
}

void AGunsOnlyFlightPawn::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!SimBridge.HasSession())
	{
		return;
	}

	PollPlayerInputs(DeltaSeconds);
	if (!bPaused && !bProgramPickerOpen && !bControlsQuicklookOpen)
	{
		SimBridge.Advance(static_cast<double>(FMath::Clamp(DeltaSeconds, 0.0f, 0.05f)), 1);
	}
	SyncVisualActors();
	UpdateEffectsAndWildfire(DeltaSeconds);
	UpdatePadlockAndHeadMotion(DeltaSeconds);
	UpdatePhysiologyPostProcess();
	UpdateAudioEngine(DeltaSeconds);
	StepQaHarness();
}
