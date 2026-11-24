#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "GunsOnlySimBridge.h"
#include "GunsOnlyWorldBuilder.h"
#include "GunsOnlyFlightPawn.generated.h"

class UCameraComponent;
class USpringArmComponent;
class UProceduralMeshComponent;
class UStaticMeshComponent;
class UPointLightComponent;

UCLASS()
class GUNSONLYUE_API AGunsOnlyFlightPawn : public APawn
{
	GENERATED_BODY()

public:
	AGunsOnlyFlightPawn();

	virtual void Tick(float DeltaSeconds) override;

	const FGunsOnlySimBridge& GetBridge() const { return SimBridge; }
	const GunsSimFrame& GetLatestFrame() const { return LatestFrame; }
	const TArray<GunsSimContact>& GetLatestContacts() const { return LatestContacts; }
	const GunsSimRunway& GetLatestRunway() const { return LatestRunway; }
	const GunsSimCourseState& GetLatestCourse() const { return LatestCourse; }
	const GunsSimLeadCue& GetLatestLeadCue() const { return LatestLeadCue; }
	const GunsSimCobraState& GetLatestCobraState() const { return LatestCobra; }
	int32 GetCurrentBeatIndex() const { return CurrentBeatIndex; }
	bool IsAssistedFlight() const { return bAssistedFlight; }
	bool IsChaseCameraActive() const { return bChaseCameraActive; }
	bool IsPaused() const { return bPaused; }

	void ToggleCameraView();
	void SwitchMission(int32 NewBeatIndex);

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

private:
	void PollPlayerInputs(float DeltaSeconds);
	void SyncVisualActors();
	void SyncCameraAndMeshVisibility();
	void UpdateWingtipVaporTrails();
	void ClearDynamicActors();

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<USceneComponent> RootScene;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UProceduralMeshComponent> PlayerMesh;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> PlayerStaticMesh;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> CobraStaticMesh;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> CobraMainRotorMesh;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UProceduralMeshComponent> AfterburnerMesh;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> AfterburnerStaticMesh;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UProceduralMeshComponent> CockpitFrameMesh;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> CockpitStaticMesh;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> CobraCockpitMesh;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UProceduralMeshComponent> WingtipTrailMesh;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UPointLightComponent> MuzzleFlashLight;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UCameraComponent> CockpitCamera;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<USpringArmComponent> ChaseBoom;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UCameraComponent> ChaseCamera;

	UPROPERTY(Transient)
	TArray<TObjectPtr<AActor>> SpawnedWorldActors;

	UPROPERTY(Transient)
	TArray<TObjectPtr<AActor>> ContactActors;

	UPROPERTY(Transient)
	TArray<TObjectPtr<AActor>> TracerActors;

	UPROPERTY(Transient)
	TArray<TObjectPtr<AActor>> GateActors;

	TArray<int32> ContactBuiltFriendly;
	TArray<int32> TracerBuiltFriendly;
	TArray<FVector> LeftTrailPts;
	TArray<FVector> RightTrailPts;
	TArray<double> TrailTimes;
	double LastTrailSampleTime = -10.0;
	bool bHasPlayerStaticMesh = false;
	bool bHasAfterburnerStaticMesh = false;
	bool bHasCockpitStaticMesh = false;
	bool bHasCobraStaticMesh = false;
	bool bHasCobraRotorMesh = false;
	bool bHasCobraCockpitMesh = false;
	FGunsOnlyPapiRig PapiRig;
	FGunsOnlySimBridge SimBridge;
	GunsSimFrame LatestFrame {};
	GunsSimRunway LatestRunway {};
	GunsSimCourseState LatestCourse {};
	GunsSimLeadCue LatestLeadCue {};
	GunsSimCobraState LatestCobra {};
	TArray<GunsSimContact> LatestContacts;
	TArray<GunsSimTracer> LatestTracers;
	TArray<GunsSimApproachGate> LatestGates;

	int32 CurrentBeatIndex = GUNS_SIM_BEAT_F22_MERGE;
	bool bAssistedFlight = true;
	bool bChaseCameraActive = false;
	bool bPaused = false;
	double ManualThrottle01 = 0.85;
	double CobraManualCollective = 0.50;
	bool bThrottleManualEngaged = false;
};
