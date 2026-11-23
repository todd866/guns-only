#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "GunsOnlySimBridge.h"
#include "GunsOnlyFlightPawn.generated.h"

class UCameraComponent;
class USpringArmComponent;
class UProceduralMeshComponent;

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
	bool IsChaseCameraActive() const { return bChaseCameraActive; }

	void ToggleCameraView();

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

private:
	void PollPlayerInputs(float DeltaSeconds);
	void SyncVisualActors();

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<USceneComponent> RootScene;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UProceduralMeshComponent> PlayerMesh;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UCameraComponent> CockpitCamera;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<USpringArmComponent> ChaseBoom;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UCameraComponent> ChaseCamera;

	UPROPERTY(Transient)
	TArray<TObjectPtr<AActor>> ContactActors;

	UPROPERTY(Transient)
	TArray<TObjectPtr<AActor>> TracerActors;

	UPROPERTY(Transient)
	TArray<TObjectPtr<AActor>> GateActors;

	FGunsOnlySimBridge SimBridge;
	GunsSimFrame LatestFrame {};
	GunsSimRunway LatestRunway {};
	TArray<GunsSimContact> LatestContacts;
	TArray<GunsSimTracer> LatestTracers;
	TArray<GunsSimApproachGate> LatestGates;

	bool bChaseCameraActive = false;
	bool bPaused = false;
	double ManualThrottle01 = 0.85;
	bool bThrottleManualEngaged = false;
};
