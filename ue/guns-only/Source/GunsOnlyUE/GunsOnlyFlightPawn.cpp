#include "GunsOnlyFlightPawn.h"
#include "GunsOnlyWorldBuilder.h"
#include "Camera/CameraComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "GameFramework/PlayerController.h"
#include "Components/StaticMeshComponent.h"
#include "Components/PointLightComponent.h"
#include "Engine/StaticMesh.h"
#include "ProceduralMeshComponent.h"
#include "InputCoreTypes.h"
#include "Engine/World.h"

namespace
{
	// Mirror GKey enum ordinals in sim/KeyGrammar.cs
	constexpr int32 SimGKeyPullUp = 0;
	constexpr int32 SimGKeyPushDown = 1;
	constexpr int32 SimGKeyRollLeft = 2;
	constexpr int32 SimGKeyRollRight = 3;
	constexpr int32 SimGKeyRudderLeft = 4;
	constexpr int32 SimGKeyRudderRight = 5;
	constexpr int32 SimGKeyThrottleUp = 6;
	constexpr int32 SimGKeyThrottleDown = 7;
	constexpr int32 SimGKeyGearToggle = 13;
	constexpr int32 SimGKeyFlapDown = 15;
}

AGunsOnlyFlightPawn::AGunsOnlyFlightPawn()
{
	PrimaryActorTick.bCanEverTick = true;
	AutoPossessPlayer = EAutoReceiveInput::Player0;

	RootScene = CreateDefaultSubobject<USceneComponent>(TEXT("RootScene"));
	SetRootComponent(RootScene);

	PlayerMesh = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("PlayerF22Mesh"));
	PlayerMesh->SetupAttachment(RootScene);

	PlayerStaticMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("PlayerF22StaticMesh"));
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
}

void AGunsOnlyFlightPawn::BeginPlay()
{
	Super::BeginPlay();

	if (UStaticMesh* F22Asset = FGunsOnlyWorldBuilder::LoadGunsStaticMesh(TEXT("/Game/GunsOnly/Meshes/SM_F22_Raptor.SM_F22_Raptor")))
	{
		PlayerStaticMesh->SetStaticMesh(F22Asset);
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

	if (UStaticMesh* PitAsset = FGunsOnlyWorldBuilder::LoadGunsStaticMesh(TEXT("/Game/GunsOnly/Meshes/SM_F22_Cockpit.SM_F22_Cockpit")))
	{
		CockpitStaticMesh->SetStaticMesh(PitAsset);
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

	WingtipTrailMesh->SetMaterial(0,
		FGunsOnlyWorldBuilder::LoadGunsMaterial(TEXT("/Game/GunsOnly/Materials/M_Vapor_Trail.M_Vapor_Trail"),
			this, FLinearColor(0.92f, 0.96f, 1.0f)));

	SwitchMission(CurrentBeatIndex);
}

void AGunsOnlyFlightPawn::ClearDynamicActors()
{
	for (AActor* Actor : ContactActors)
	{
		if (Actor != nullptr) Actor->Destroy();
	}
	for (AActor* Actor : TracerActors)
	{
		if (Actor != nullptr) Actor->Destroy();
	}
	for (AActor* Actor : GateActors)
	{
		if (Actor != nullptr) Actor->Destroy();
	}
	ContactActors.Empty();
	ContactBuiltFriendly.Empty();
	TracerActors.Empty();
	TracerBuiltFriendly.Empty();
	GateActors.Empty();
	FGunsOnlyWorldBuilder::ClearSpawnedWorldActors(SpawnedWorldActors);
}

void AGunsOnlyFlightPawn::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
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
	if (WingtipTrailMesh != nullptr)
	{
		WingtipTrailMesh->ClearAllMeshSections();
	}

	CurrentBeatIndex = NewBeatIndex;
	FMemory::Memzero(&LatestFrame, sizeof(LatestFrame));
	FMemory::Memzero(&LatestRunway, sizeof(LatestRunway));
	FMemory::Memzero(&LatestCourse, sizeof(LatestCourse));
	FMemory::Memzero(&LatestLeadCue, sizeof(LatestLeadCue));
	FMemory::Memzero(&LatestCobra, sizeof(LatestCobra));
	LatestContacts.Reset();
	LatestTracers.Reset();
	LatestGates.Reset();

	if (!SimBridge.CreateSession(CurrentBeatIndex, 1))
	{
		UE_LOG(LogTemp, Error, TEXT("GunsOnlyFlightPawn: failed to create simulation session (beat=%d)."), CurrentBeatIndex);
		return;
	}
	SimBridge.SetAssistedFlight(bAssistedFlight);

	if (CurrentBeatIndex == GUNS_SIM_BEAT_COBRA_CANYON && SimBridge.ReadCobraState(LatestCobra) && LatestCobra.active != 0)
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
	else
	{
		if (SimBridge.ReadRunway(LatestRunway) && LatestRunway.present != 0)
		{
			SimBridge.SetWorldOriginMeters(LatestRunway.threshold_east_m, LatestRunway.threshold_north_m);
		}
		else
		{
			SimBridge.SetWorldOriginMeters(0.0, 0.0);
		}
		CockpitCamera->SetRelativeLocation(FVector(240.0, 0.0, 115.0));
		ChaseBoom->TargetArmLength = 2400.0f;
		ChaseBoom->SetRelativeLocation(FVector(0.0, 0.0, 260.0));
		MuzzleFlashLight->SetRelativeLocation(FVector(360.0, -54.0, 22.0));
		ManualThrottle01 = 0.85;
		bThrottleManualEngaged = false;
	}

	FGunsOnlyWorldBuilder::EnsureEnvironmentAndRunway(
		GetWorld(), SimBridge, LatestRunway, LatestCobra, PapiRig, SpawnedWorldActors);

	bPaused = false;
	SimBridge.Begin();
	SimBridge.Advance(1.0 / 120.0, 1);
	SyncVisualActors();
	SyncCameraAndMeshVisibility();
}

void AGunsOnlyFlightPawn::SyncCameraAndMeshVisibility()
{
	const bool bIsCobra = (CurrentBeatIndex == GUNS_SIM_BEAT_COBRA_CANYON);
	CockpitCamera->SetActive(!bChaseCameraActive);
	ChaseCamera->SetActive(bChaseCameraActive);

	PlayerMesh->SetVisibility(!bIsCobra && !bHasPlayerStaticMesh && bChaseCameraActive);
	PlayerStaticMesh->SetVisibility(!bIsCobra && bHasPlayerStaticMesh && bChaseCameraActive);
	const bool bBurner = !bIsCobra && bChaseCameraActive && LatestFrame.player_alive != 0 && LatestFrame.throttle01 > 0.76;
	AfterburnerMesh->SetVisibility(!bIsCobra && !bHasAfterburnerStaticMesh && bBurner);
	AfterburnerStaticMesh->SetVisibility(!bIsCobra && bHasAfterburnerStaticMesh && bBurner);
	CockpitFrameMesh->SetVisibility(!bIsCobra && !bHasCockpitStaticMesh && !bChaseCameraActive);
	CockpitStaticMesh->SetVisibility(!bIsCobra && bHasCockpitStaticMesh && !bChaseCameraActive);

	CobraStaticMesh->SetVisibility(bIsCobra && bHasCobraStaticMesh && bChaseCameraActive);
	CobraMainRotorMesh->SetVisibility(bIsCobra && bHasCobraRotorMesh);
	CobraCockpitMesh->SetVisibility(bIsCobra && bHasCobraCockpitMesh && !bChaseCameraActive);
}

void AGunsOnlyFlightPawn::ToggleCameraView()
{
	bChaseCameraActive = !bChaseCameraActive;
	SyncCameraAndMeshVisibility();
}

void AGunsOnlyFlightPawn::PollPlayerInputs(float DeltaSeconds)
{
	APlayerController* PC = Cast<APlayerController>(GetController());
	if (PC == nullptr || !SimBridge.HasSession())
	{
		return;
	}

	if (PC->WasInputKeyJustPressed(EKeys::One) && CurrentBeatIndex != GUNS_SIM_BEAT_F22_MERGE)
	{
		SwitchMission(GUNS_SIM_BEAT_F22_MERGE);
		return;
	}
	if (PC->WasInputKeyJustPressed(EKeys::Two) && CurrentBeatIndex != GUNS_SIM_BEAT_COBRA_CANYON)
	{
		SwitchMission(GUNS_SIM_BEAT_COBRA_CANYON);
		return;
	}
	if (PC->WasInputKeyJustPressed(EKeys::U))
	{
		bAssistedFlight = !bAssistedFlight;
		SimBridge.SetAssistedFlight(bAssistedFlight);
		if (CurrentBeatIndex == GUNS_SIM_BEAT_COBRA_CANYON && !bAssistedFlight && LatestCobra.collective01 > 0.05)
		{
			CobraManualCollective = LatestCobra.collective01;
		}
	}
	if (PC->WasInputKeyJustPressed(EKeys::Tab))
	{
		SimBridge.CycleTarget();
	}

	if (PC->WasInputKeyJustPressed(EKeys::F2) || PC->WasInputKeyJustPressed(EKeys::C)
		|| PC->WasInputKeyJustPressed(EKeys::Gamepad_RightThumbstick))
	{
		ToggleCameraView();
	}

	if (PC->WasInputKeyJustPressed(EKeys::Escape) || PC->WasInputKeyJustPressed(EKeys::P))
	{
		bPaused = !bPaused;
		SimBridge.SetPaused(bPaused);
	}

	if (PC->WasInputKeyJustPressed(EKeys::R))
	{
		SimBridge.Restart();
		SimBridge.SetAssistedFlight(bAssistedFlight);
		SimBridge.Begin();
		bPaused = false;
		bThrottleManualEngaged = false;
		ManualThrottle01 = 0.85;
		CobraManualCollective = 0.62;
	}

	if (CurrentBeatIndex == GUNS_SIM_BEAT_COBRA_CANYON)
	{
		if (PC->WasInputKeyJustPressed(EKeys::LeftShift)
			|| PC->WasInputKeyJustPressed(EKeys::Q)
			|| PC->WasInputKeyJustPressed(EKeys::LeftMouseButton))
		{
			SimBridge.FireRocket();
		}

		double FwdCyclic = static_cast<double>(PC->GetInputAnalogKeyState(EKeys::Gamepad_LeftY));
		if (PC->IsInputKeyDown(EKeys::Up)) FwdCyclic += 1.0;
		if (PC->IsInputKeyDown(EKeys::Down)) FwdCyclic -= 1.0;

		double RightCyclic = static_cast<double>(PC->GetInputAnalogKeyState(EKeys::Gamepad_LeftX));
		if (PC->IsInputKeyDown(EKeys::Right)) RightCyclic += 1.0;
		if (PC->IsInputKeyDown(EKeys::Left)) RightCyclic -= 1.0;

		double PedalYaw = static_cast<double>(PC->GetInputAnalogKeyState(EKeys::Gamepad_RightX));
		if (PC->IsInputKeyDown(EKeys::D)) PedalYaw += 1.0;
		if (PC->IsInputKeyDown(EKeys::A)) PedalYaw -= 1.0;

		const double ClimbAxis = (PC->IsInputKeyDown(EKeys::W) ? 1.0 : 0.0)
			- (PC->IsInputKeyDown(EKeys::S) ? 1.0 : 0.0)
			+ static_cast<double>(PC->GetInputAnalogKeyState(EKeys::Gamepad_RightTriggerAxis)
				- PC->GetInputAnalogKeyState(EKeys::Gamepad_LeftTriggerAxis));

		double ColToSend = 0.5;
		if (bAssistedFlight)
		{
			ColToSend = FMath::Clamp(0.5 + 0.5 * ClimbAxis, 0.0, 1.0);
		}
		else
		{
			CobraManualCollective = FMath::Clamp(CobraManualCollective + 0.35 * ClimbAxis * DeltaSeconds, 0.05, 0.98);
			ColToSend = CobraManualCollective;
		}

		const int32 TriggerDown = (PC->IsInputKeyDown(EKeys::SpaceBar)
			|| PC->IsInputKeyDown(EKeys::F)
			|| PC->IsInputKeyDown(EKeys::Gamepad_FaceButton_Right)) ? 1 : 0;
		SimBridge.SetControls(
			FMath::Clamp(RightCyclic, -1.0, 1.0),
			FMath::Clamp(FwdCyclic, -1.0, 1.0),
			FMath::Clamp(PedalYaw, -1.0, 1.0),
			ColToSend,
			true,
			TriggerDown);
		return;
	}

	if (PC->WasInputKeyJustPressed(EKeys::O))
	{
		SimBridge.RequestRtb();
	}

	if (PC->WasInputKeyJustPressed(EKeys::G))
	{
		SimBridge.FeedKey(SimGKeyGearToggle, true);
		SimBridge.FeedKey(SimGKeyGearToggle, false);
	}

	if (PC->WasInputKeyJustPressed(EKeys::F))
	{
		SimBridge.FeedKey(SimGKeyFlapDown, true);
		SimBridge.FeedKey(SimGKeyFlapDown, false);
	}

	const double GPitch = static_cast<double>(-PC->GetInputAnalogKeyState(EKeys::Gamepad_LeftY));
	const double GRoll = static_cast<double>(PC->GetInputAnalogKeyState(EKeys::Gamepad_LeftX));
	const double GYaw = static_cast<double>(PC->GetInputAnalogKeyState(EKeys::Gamepad_RightX));

	SimBridge.FeedKey(SimGKeyPullUp, PC->IsInputKeyDown(EKeys::S) || PC->IsInputKeyDown(EKeys::Down));
	SimBridge.FeedKey(SimGKeyPushDown, PC->IsInputKeyDown(EKeys::W) || PC->IsInputKeyDown(EKeys::Up));
	SimBridge.FeedKey(SimGKeyRollLeft, PC->IsInputKeyDown(EKeys::A) || PC->IsInputKeyDown(EKeys::Left));
	SimBridge.FeedKey(SimGKeyRollRight, PC->IsInputKeyDown(EKeys::D) || PC->IsInputKeyDown(EKeys::Right));
	SimBridge.FeedKey(SimGKeyRudderLeft, PC->IsInputKeyDown(EKeys::Q));
	SimBridge.FeedKey(SimGKeyRudderRight, PC->IsInputKeyDown(EKeys::E));

	const bool bThrUp = PC->IsInputKeyDown(EKeys::Equals) || PC->IsInputKeyDown(EKeys::PageUp)
		|| PC->GetInputAnalogKeyState(EKeys::Gamepad_RightTriggerAxis) > 0.15f;
	const bool bThrDown = PC->IsInputKeyDown(EKeys::Hyphen) || PC->IsInputKeyDown(EKeys::PageDown)
		|| PC->GetInputAnalogKeyState(EKeys::Gamepad_LeftTriggerAxis) > 0.15f;
	SimBridge.FeedKey(SimGKeyThrottleUp, bThrUp);
	SimBridge.FeedKey(SimGKeyThrottleDown, bThrDown);
	if (bThrUp)
	{
		bThrottleManualEngaged = true;
		ManualThrottle01 = FMath::Clamp(ManualThrottle01 + 0.55 * DeltaSeconds, 0.0, 1.0);
	}
	else if (bThrDown)
	{
		bThrottleManualEngaged = true;
		ManualThrottle01 = FMath::Clamp(ManualThrottle01 - 0.55 * DeltaSeconds, 0.0, 1.0);
	}

	const int32 TriggerDown = (PC->IsInputKeyDown(EKeys::SpaceBar) || PC->IsInputKeyDown(EKeys::Gamepad_FaceButton_Right)) ? 1 : 0;
	SimBridge.SetControls(GRoll, GPitch, GYaw, ManualThrottle01, bThrottleManualEngaged, TriggerDown);
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

	const bool bIsCobra = (LatestCobra.active != 0);
	if (bIsCobra)
	{
		const float RotorDeg = static_cast<float>(FMath::RadiansToDegrees(LatestCobra.rotor_azimuth_rad));
		CobraMainRotorMesh->SetRelativeRotation(FRotator(0.0f, RotorDeg, 0.0f));
		AfterburnerMesh->SetVisibility(false);
		AfterburnerStaticMesh->SetVisibility(false);
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

	UStaticMesh* F22Static = FGunsOnlyWorldBuilder::LoadGunsStaticMesh(TEXT("/Game/GunsOnly/Meshes/SM_F22_Raptor.SM_F22_Raptor"));
	UStaticMesh* Su27Static = FGunsOnlyWorldBuilder::LoadGunsStaticMesh(TEXT("/Game/GunsOnly/Meshes/SM_Su27_Flanker.SM_Su27_Flanker"));
	UStaticMesh* BunkerStatic = FGunsOnlyWorldBuilder::LoadGunsStaticMesh(TEXT("/Game/GunsOnly/Meshes/SM_Cobra_Bunker.SM_Cobra_Bunker"));

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
			if (BunkerStatic != nullptr)
			{
				UStaticMeshComponent* StaticComp = NewObject<UStaticMeshComponent>(ContactActor, TEXT("GroundStaticMesh"));
				StaticComp->SetStaticMesh(BunkerStatic);
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
		else
		{
			const bool bIsFriendlyJet = (ContactRole == 3);
			UStaticMesh* ChosenStatic = bIsFriendlyJet ? F22Static : Su27Static;
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
				if (bIsFriendlyJet)
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
		ContactBuiltFriendly.Add(ContactRole);
	}
	for (int32 i = 0; i < ContactActors.Num(); ++i)
	{
		AActor* Actor = ContactActors[i];
		if (Actor == nullptr) continue;
		if (i < LatestContacts.Num() && LatestContacts[i].alive != 0)
		{
			const GunsSimContact& C = LatestContacts[i];
			if (C.role >= 10)
			{
				const float Scale = (C.role == 11 || C.role == 12) ? 1.25f : (C.role == 10 || C.role == 15 ? 0.95f : 0.62f);
				Actor->SetActorScale3D(FVector(Scale));
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
			Mesh,
			TracerActor,
			FVector(240.0, 20.0, 20.0),
			FLinearColor(1.0f, 0.84f, 0.28f));
		if (BoltMat != nullptr)
		{
			Mesh->SetMaterial(0, BoltMat);
		}
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
					if (UseMat != nullptr)
					{
						Mesh->SetMaterial(0, UseMat);
					}
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

	// Sync hollow 3D RTB approach gate portals oriented along the approach path
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
				Mesh,
				GateActor,
				FVector(260.0, 5200.0, 1500.0),
				FLinearColor(0.20f, 0.90f, 1.0f));
		}
		GateActors.Add(GateActor);
	}
	const FVector RunwayThresholdUE = LatestRunway.present != 0
		? SimBridge.SimPosToUE(LatestRunway.threshold_east_m, LatestRunway.threshold_up_m, LatestRunway.threshold_north_m)
		: FVector::ZeroVector;
	const float RunwayYawDeg = LatestRunway.present != 0
		? static_cast<float>(FMath::RadiansToDegrees(LatestRunway.heading_rad))
		: 0.0f;
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
				? HorizontalDir.Rotation()
				: FRotator(0.0f, RunwayYawDeg, 0.0f);
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
	if (CurrentBeatIndex == GUNS_SIM_BEAT_COBRA_CANYON)
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
		LeftTrailPts.Add(Tx.TransformPosition(FVector(-340.0, -678.0, -8.0)));
		RightTrailPts.Add(Tx.TransformPosition(FVector(-340.0, 678.0, -8.0)));
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

void AGunsOnlyFlightPawn::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!SimBridge.HasSession())
	{
		return;
	}

	PollPlayerInputs(DeltaSeconds);
	if (!bPaused)
	{
		SimBridge.Advance(static_cast<double>(FMath::Clamp(DeltaSeconds, 0.0f, 0.05f)), 1);
	}
	SyncVisualActors();
}
