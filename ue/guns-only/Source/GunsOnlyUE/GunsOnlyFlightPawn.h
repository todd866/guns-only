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
class UAudioComponent;
class USoundWave;
class UStaticMesh;

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
	const GunsSimGunFunnel& GetLatestGunFunnel() const { return LatestFunnel; }
	const GunsSimPilotState& GetLatestPilotState() const { return LatestPilot; }
	const GunsSimCombatDirector& GetLatestCombatDirector() const { return LatestDirector; }
	const GunsSimWeatherState& GetLatestWeather() const { return LatestWeather; }
	const GunsSimCarrierState& GetLatestCarrier() const { return LatestCarrier; }
	const GunsSimOkanaganState& GetLatestOkanagan() const { return LatestOkanagan; }
	const TArray<GunsSimFireCell>& GetLatestFireCells() const { return LatestFireCells; }

	int32 GetCurrentBeatIndex() const { return CurrentBeatIndex; }
	int32 GetSavedRung() const { return SavedRung; }
	double GetBestScore() const { return BestScore; }
	bool IsAssistedFlight() const { return bAssistedFlight; }
	bool IsChaseCameraActive() const { return bChaseCameraActive; }
	bool IsPaused() const { return bPaused; }
	bool IsPadlockActive() const { return bPadlockActive; }
	bool IsProgramPickerOpen() const { return bProgramPickerOpen; }
	bool IsControlsQuicklookOpen() const { return bControlsQuicklookOpen; }
	bool IsMuted() const { return bMuted; }
	float GetHitMarkerAlpha() const { return FMath::Clamp(HitMarkerTimer / 0.24f, 0.0f, 1.0f); }
	float GetKillFlashAlpha() const { return FMath::Clamp(KillFlashTimer / 0.45f, 0.0f, 1.0f) * 0.28f; }
	int32 GetSelectedRungForUi() const { return SavedRung; }

	// Deterministic offscreen QA capture hooks driven by AGunsOnlyHUD::DrawHUD
	bool ConsumePendingQaCapture(FString& OutFilePath);
	void NotifyQaCaptureCompleted(const FString& CapturedPath);

	void ToggleCameraView();
	void SwitchMission(int32 NewBeatIndex);
	void ToggleAssistedFlight();
	void RestartCurrentMission();
	void TogglePause();
	void SetProgramPickerOpen(bool bOpen);
	void ToggleProgramPicker();
	void ToggleControlsQuicklook();
	void ToggleMute();
	void TogglePadlock();
	void SelectRung(int32 NewRung);
	void TriggerPrimaryHudAction();
	void TriggerSecondaryHudAction();

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

private:
	void PollPlayerInputs(float DeltaSeconds);
	void SyncVisualActors();
	void SyncCameraAndMeshVisibility();
	void UpdatePadlockAndHeadMotion(float DeltaSeconds);
	void UpdatePhysiologyPostProcess();
	void UpdateAudioEngine(float DeltaSeconds);
	void UpdateEffectsAndWildfire(float DeltaSeconds);
	void UpdateWingtipVaporTrails();
	void ClearDynamicActors();
	void LoadAudioAssets();
	void LoadProfile();
	void SaveProfile() const;
	void StepQaHarness();
	void SpawnExplosionAt(const FVector& PosUE, float Scale);
	void SpawnSmokePuffAt(const FVector& PosUE, float InitialScale);
	void PlayOneShotUiOrCombat(USoundWave* Wave, float Volume = 0.7f, float Pitch = 1.0f);

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
	TObjectPtr<UStaticMeshComponent> FireBossPropMesh;

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

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UAudioComponent> AudioEngineIdle;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UAudioComponent> AudioEngineMil;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UAudioComponent> AudioEngineGrit;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UAudioComponent> AudioWeaponLoop;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UAudioComponent> AudioSeekerLoop;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UAudioComponent> AudioWarnLoop;

	UPROPERTY(Transient)
	TArray<TObjectPtr<AActor>> SpawnedWorldActors;

	UPROPERTY(Transient)
	TArray<TObjectPtr<AActor>> ContactActors;

	UPROPERTY(Transient)
	TArray<TObjectPtr<AActor>> TracerActors;

	UPROPERTY(Transient)
	TArray<TObjectPtr<AActor>> GateActors;

	// Pooled 3D effects (smoke trails, HDR explosions, wildfire flames, Okanagan water drop curtain)
	struct FGunsSmokePuff
	{
		TObjectPtr<AActor> Actor;
		FVector VelocityUE = FVector::ZeroVector;
		float Age = 0.0f;
		float MaxAge = 2.6f;
		float BaseScale = 1.0f;
		bool bActive = false;
	};
	struct FGunsExplosionFx
	{
		TObjectPtr<AActor> Actor;
		TObjectPtr<UPointLightComponent> Light;
		float Age = 0.0f;
		float MaxAge = 0.9f;
		float PeakScale = 6.0f;
		bool bActive = false;
	};
	TArray<FGunsSmokePuff> SmokePool;
	TArray<FGunsExplosionFx> ExplosionPool;
	UPROPERTY(Transient)
	TArray<TObjectPtr<AActor>> WildfireFlameActors;
	UPROPERTY(Transient)
	TArray<TObjectPtr<AActor>> WaterDropActors;

	// Cached StaticMeshes & Sounds
	UPROPERTY(Transient) TObjectPtr<UStaticMesh> MeshF22;
	UPROPERTY(Transient) TObjectPtr<UStaticMesh> MeshF14;
	UPROPERTY(Transient) TObjectPtr<UStaticMesh> MeshRapier;
	UPROPERTY(Transient) TObjectPtr<UStaticMesh> MeshFireBoss;
	UPROPERTY(Transient) TObjectPtr<UStaticMesh> MeshFireBossProp;
	UPROPERTY(Transient) TObjectPtr<UStaticMesh> MeshF22Cockpit;
	UPROPERTY(Transient) TObjectPtr<UStaticMesh> MeshF14Cockpit;
	UPROPERTY(Transient) TObjectPtr<UStaticMesh> MeshSu27;
	UPROPERTY(Transient) TObjectPtr<UStaticMesh> MeshMig28;
	UPROPERTY(Transient) TObjectPtr<UStaticMesh> MeshBalloon;
	UPROPERTY(Transient) TObjectPtr<UStaticMesh> MeshBunker;
	UPROPERTY(Transient) TObjectPtr<UStaticMesh> MeshExplosion;
	UPROPERTY(Transient) TObjectPtr<UStaticMesh> MeshSmokePuff;

	UPROPERTY(Transient) TObjectPtr<USoundWave> SndF22Idle;
	UPROPERTY(Transient) TObjectPtr<USoundWave> SndF22Mil;
	UPROPERTY(Transient) TObjectPtr<USoundWave> SndF22Grit;
	UPROPERTY(Transient) TObjectPtr<USoundWave> SndRapierIdle;
	UPROPERTY(Transient) TObjectPtr<USoundWave> SndRapierMil;
	UPROPERTY(Transient) TObjectPtr<USoundWave> SndRapierGrit;
	UPROPERTY(Transient) TObjectPtr<USoundWave> SndF14Engine;
	UPROPERTY(Transient) TObjectPtr<USoundWave> SndCobraRotor;
	UPROPERTY(Transient) TObjectPtr<USoundWave> SndFireBossProp;
	UPROPERTY(Transient) TObjectPtr<USoundWave> SndVulcanLoop;
	UPROPERTY(Transient) TObjectPtr<USoundWave> SndMinigunLoop;
	UPROPERTY(Transient) TObjectPtr<USoundWave> SndAim9Growl;
	UPROPERTY(Transient) TObjectPtr<USoundWave> SndAim9Lock;
	UPROPERTY(Transient) TObjectPtr<USoundWave> SndRocketLaunch;
	UPROPERTY(Transient) TObjectPtr<USoundWave> SndExplosion;
	UPROPERTY(Transient) TObjectPtr<USoundWave> SndHitImpact;
	UPROPERTY(Transient) TObjectPtr<USoundWave> SndPullUpWarn;
	UPROPERTY(Transient) TObjectPtr<USoundWave> SndWaterDrop;
	UPROPERTY(Transient) TObjectPtr<USoundWave> SndWireTrap;

	TArray<int32> ContactBuiltRole;
	TArray<int32> ContactWasAlive;
	TArray<int32> TracerBuiltFriendly;
	TArray<FVector> LeftTrailPts;
	TArray<FVector> RightTrailPts;
	TArray<double> TrailTimes;
	double LastTrailSampleTime = -10.0;
	double LastSmokeEmitSimTime = -10.0;

	bool bHasPlayerStaticMesh = false;
	bool bHasAfterburnerStaticMesh = false;
	bool bHasCockpitStaticMesh = false;
	bool bHasCobraStaticMesh = false;
	bool bHasCobraRotorMesh = false;
	bool bHasCobraCockpitMesh = false;

	FGunsOnlyPapiRig PapiRig;
	FGunsOnlyAtmosphereRig AtmoRig;
	FGunsOnlySimBridge SimBridge;

	GunsSimFrame LatestFrame {};
	GunsSimRunway LatestRunway {};
	GunsSimCourseState LatestCourse {};
	GunsSimLeadCue LatestLeadCue {};
	GunsSimCobraState LatestCobra {};
	GunsSimGunFunnel LatestFunnel {};
	GunsSimPilotState LatestPilot {};
	GunsSimCombatDirector LatestDirector {};
	GunsSimWeatherState LatestWeather {};
	GunsSimCarrierState LatestCarrier {};
	GunsSimOkanaganState LatestOkanagan {};
	TArray<GunsSimContact> LatestContacts;
	TArray<GunsSimTracer> LatestTracers;
	TArray<GunsSimApproachGate> LatestGates;
	TArray<GunsSimFireCell> LatestFireCells;

	int32 CurrentBeatIndex = GUNS_SIM_BEAT_F22_MERGE;
	int32 SavedRung = 0;
	double BestScore = 0.0;
	bool bAssistedFlight = true;
	bool bChaseCameraActive = false;
	bool bPaused = false;
	bool bProgramPickerOpen = false;
	bool bControlsQuicklookOpen = false;
	bool bMuted = false;
	bool bAudioCliDisabled = false;
	bool bInputModeConfigured = false;
	bool bPadlockActive = false;

	double ManualThrottle01 = 0.85;
	double CobraManualCollective = 0.50;
	bool bThrottleManualEngaged = false;
	double CobraSmoothedFwdCyclic = 0.0;
	double CobraSmoothedRightCyclic = 0.0;
	double CobraSmoothedPedalYaw = 0.0;

	// Gimballed Padlock + Cockpit Head Spring state
	double PadlockYawDeg = 0.0;
	double PadlockPitchDeg = 0.0;
	double PadlockRollDeg = 0.0;
	double PadlockShoulderSign = 1.0;
	double HeadOffsetZ = 0.0, HeadVelZ = 0.0;
	double HeadOffsetX = 0.0, HeadVelX = 0.0;
	double HeadOffsetY = 0.0, HeadVelY = 0.0;
	double HeadPitchDeg = 0.0, HeadRollDeg = 0.0;
	double FireBossPropDeg = 0.0;

	// Edge detectors & FX timers
	int32 PrevRoundsFired = 0;
	int32 PrevSortieHits = 0;
	int32 PrevDirectorKills = 0;
	int32 PrevCaughtWire = 0;
	int32 PrevAudioBeat = -1;
	bool bPrevTriggerDown = false;
	float HitMarkerTimer = 0.0f;
	float KillFlashTimer = 0.0f;
	float WaterCurtainTimer = 0.0f;

	// Offscreen GPU QA Capture harness state
	FString QaShotsDir;
	bool bQaHarnessActive = false;
	int32 QaStage = 0;
	int32 QaSettleFrames = 0;
	int32 QaShaderWaitFrames = 0;
	bool bQaCaptureRequested = false;
	bool bQaCaptureInFlight = false;
	FString PendingQaFile;
};
