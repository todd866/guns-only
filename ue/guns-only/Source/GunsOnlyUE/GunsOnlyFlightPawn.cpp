#include "GunsOnlyFlightPawn.h"
#include "GunsOnlyWorldBuilder.h"
#include "Camera/CameraComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "GameFramework/PlayerController.h"
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

	FGunsOnlyWorldBuilder::BuildF22ProceduralMesh(
		PlayerMesh,
		this,
		FLinearColor(0.45f, 0.49f, 0.54f),
		FLinearColor(0.85f, 0.72f, 0.30f));
	PlayerMesh->SetVisibility(bChaseCameraActive);

	if (!SimBridge.CreateSession(7, 1))
	{
		UE_LOG(LogTemp, Error, TEXT("GunsOnlyFlightPawn: failed to create simulation session."));
		return;
	}

	if (SimBridge.ReadRunway(LatestRunway) && LatestRunway.present != 0)
	{
		SimBridge.SetWorldOriginMeters(LatestRunway.threshold_east_m, LatestRunway.threshold_north_m);
	}

	FGunsOnlyWorldBuilder::EnsureEnvironmentAndRunway(GetWorld(), SimBridge, LatestRunway);

	SimBridge.Begin();
	SimBridge.Advance(1.0 / 120.0, 1);
	SyncVisualActors();
}

void AGunsOnlyFlightPawn::EndPlay(const EEndPlayReason::Type EndPlayReason)
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
	TracerActors.Empty();
	GateActors.Empty();

	SimBridge.DestroySession();
	Super::EndPlay(EndPlayReason);
}

void AGunsOnlyFlightPawn::ToggleCameraView()
{
	bChaseCameraActive = !bChaseCameraActive;
	CockpitCamera->SetActive(!bChaseCameraActive);
	ChaseCamera->SetActive(bChaseCameraActive);
	PlayerMesh->SetVisibility(bChaseCameraActive);
}

void AGunsOnlyFlightPawn::PollPlayerInputs(float DeltaSeconds)
{
	APlayerController* PC = Cast<APlayerController>(GetController());
	if (PC == nullptr || !SimBridge.HasSession())
	{
		return;
	}

	if (PC->WasInputKeyJustPressed(EKeys::F2) || PC->WasInputKeyJustPressed(EKeys::Gamepad_RightThumbstick))
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
		SimBridge.Begin();
		bThrottleManualEngaged = false;
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

	// Sync opponent / wingman / relief aircraft actors
	SimBridge.ReadContacts(LatestContacts);
	while (ContactActors.Num() < LatestContacts.Num())
	{
		AActor* ContactActor = World->SpawnActor<AActor>(FVector::ZeroVector, FRotator::ZeroRotator);
		UProceduralMeshComponent* Mesh = NewObject<UProceduralMeshComponent>(ContactActor, TEXT("ContactMesh"));
		ContactActor->SetRootComponent(Mesh);
		Mesh->RegisterComponent();
		const int32 Idx = ContactActors.Num();
		const bool bFriendly = (Idx < LatestContacts.Num() && LatestContacts[Idx].role == 3);
		FGunsOnlyWorldBuilder::BuildF22ProceduralMesh(
			Mesh,
			ContactActor,
			bFriendly ? FLinearColor(0.32f, 0.62f, 0.85f) : FLinearColor(0.55f, 0.25f, 0.22f),
			FLinearColor(0.85f, 0.72f, 0.30f));
		ContactActors.Add(ContactActor);
	}
	for (int32 i = 0; i < ContactActors.Num(); ++i)
	{
		AActor* Actor = ContactActors[i];
		if (Actor == nullptr) continue;
		if (i < LatestContacts.Num() && LatestContacts[i].alive != 0)
		{
			const GunsSimContact& C = LatestContacts[i];
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

	// Sync gun tracers
	SimBridge.ReadTracers(LatestTracers);
	while (TracerActors.Num() < LatestTracers.Num())
	{
		AActor* TracerActor = World->SpawnActor<AActor>(FVector::ZeroVector, FRotator::ZeroRotator);
		UProceduralMeshComponent* Mesh = NewObject<UProceduralMeshComponent>(TracerActor, TEXT("TracerBolt"));
		TracerActor->SetRootComponent(Mesh);
		Mesh->RegisterComponent();
		FGunsOnlyWorldBuilder::BuildBoxProceduralMesh(
			Mesh,
			TracerActor,
			FVector(420.0, 22.0, 22.0),
			FLinearColor(1.0f, 0.84f, 0.28f));
		TracerActors.Add(TracerActor);
	}
	for (int32 i = 0; i < TracerActors.Num(); ++i)
	{
		AActor* Actor = TracerActors[i];
		if (Actor == nullptr) continue;
		if (i < LatestTracers.Num())
		{
			const GunsSimTracer& T = LatestTracers[i];
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

	// Sync 3D RTB approach gate markers
	if (LatestFrame.guidance_active != 0)
	{
		SimBridge.ReadGates(LatestGates);
	}
	else
	{
		LatestGates.Reset();
	}
	while (GateActors.Num() < LatestGates.Num())
	{
		AActor* GateActor = World->SpawnActor<AActor>(FVector::ZeroVector, FRotator::ZeroRotator);
		UProceduralMeshComponent* Mesh = NewObject<UProceduralMeshComponent>(GateActor, TEXT("ApproachGate"));
		GateActor->SetRootComponent(Mesh);
		Mesh->RegisterComponent();
		FGunsOnlyWorldBuilder::BuildBoxProceduralMesh(
			Mesh,
			GateActor,
			FVector(600.0, 6000.0, 1200.0),
			FLinearColor(0.20f, 0.90f, 1.0f));
		GateActors.Add(GateActor);
	}
	for (int32 i = 0; i < GateActors.Num(); ++i)
	{
		AActor* Actor = GateActors[i];
		if (Actor == nullptr) continue;
		if (i < LatestGates.Num())
		{
			const GunsSimApproachGate& G = LatestGates[i];
			Actor->SetActorHiddenInGame(false);
			Actor->SetActorLocation(SimBridge.SimPosToUE(G.east_m, G.up_m, G.north_m));
		}
		else
		{
			Actor->SetActorHiddenInGame(true);
		}
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
	if (!bPaused)
	{
		SimBridge.Advance(static_cast<double>(FMath::Clamp(DeltaSeconds, 0.0f, 0.05f)), 1);
	}
	SyncVisualActors();
}
