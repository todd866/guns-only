#pragma once

#include "CoreMinimal.h"
#include "guns_only_sim.h"

class UWorld;
class AActor;
class ADirectionalLight;
class ASkyAtmosphere;
class ASkyLight;
class AVolumetricCloud;
class AExponentialHeightFog;
class APostProcessVolume;
class UProceduralMeshComponent;
class UStaticMesh;
class UMaterialInterface;
class UMaterialInstanceDynamic;
class FGunsOnlySimBridge;

struct GUNSONLYUE_API FGunsOnlyPapiRig
{
	TArray<TObjectPtr<UMaterialInstanceDynamic>> LampMaterials;
	int32 LastWhiteCount = -1;
};

struct GUNSONLYUE_API FGunsOnlyAtmosphereRig
{
	TWeakObjectPtr<ADirectionalLight> SunLight;
	TWeakObjectPtr<ASkyAtmosphere> SkyAtmosphere;
	TWeakObjectPtr<ASkyLight> SkyLight;
	TWeakObjectPtr<AVolumetricCloud> VolumetricCloud;
	TWeakObjectPtr<UMaterialInstanceDynamic> CloudMID;
	TWeakObjectPtr<AExponentialHeightFog> HeightFog;
	TWeakObjectPtr<APostProcessVolume> PostProcessVolume;
	TWeakObjectPtr<AActor> CarrierActor;
	int32 LastBeatIndex = -1;
	float BaselineFogDensity = 0.0010f;
	FLinearColor BaselineFogColor = FLinearColor(0.58f, 0.74f, 0.92f);
	float LastCloudMinKm = -1.0f;
	float LastCloudHeightKm = -1.0f;
	float LastFogDensity = -1.0f;
};

class GUNSONLYUE_API FGunsOnlyWorldBuilder
{
public:
	static UMaterialInterface* CreateColoredMaterial(
		UObject* Outer,
		const FLinearColor& Color);

	static UMaterialInterface* LoadGunsMaterial(
		const TCHAR* AssetPath,
		UObject* Outer,
		const FLinearColor& FallbackColor);

	static UStaticMesh* LoadGunsStaticMesh(
		const TCHAR* AssetPath);

	static void ClearSpawnedWorldActors(
		TArray<TObjectPtr<AActor>>& Actors);

	static void EnsureEnvironmentAndRunway(
		UWorld* World,
		int32 BeatIndex,
		const FGunsOnlySimBridge& Bridge,
		const GunsSimRunway& Runway,
		const GunsSimCobraState& CobraState,
		const GunsSimCarrierState& CarrierState,
		const GunsSimOkanaganState& OkanaganState,
		FGunsOnlyPapiRig& OutPapiRig,
		FGunsOnlyAtmosphereRig& InOutAtmoRig,
		TArray<TObjectPtr<AActor>>& OutSpawnedWorldActors);

	static void ApplyTheatreWeather(
		FGunsOnlyAtmosphereRig& Rig,
		int32 BeatIndex,
		const GunsSimWeatherState& Weather,
		const GunsSimFrame& Frame,
		double SimTimeSec,
		bool bTheatreChanged);

	static void UpdatePapiRig(
		FGunsOnlyPapiRig& PapiRig,
		double GlideslopeDeg);

	static void BuildF22ProceduralMesh(
		UProceduralMeshComponent* Mesh,
		UObject* MaterialOuter,
		const FLinearColor& BodyTint,
		const FLinearColor& CanopyTint);

	static void BuildSu27ProceduralMesh(
		UProceduralMeshComponent* Mesh,
		UObject* MaterialOuter,
		const FLinearColor& BodyTint,
		const FLinearColor& CanopyTint);

	static void BuildAfterburnerPlumeMesh(
		UProceduralMeshComponent* Mesh,
		UObject* MaterialOuter);

	static void BuildCockpitFrameMesh(
		UProceduralMeshComponent* Mesh,
		UObject* MaterialOuter);

	static void BuildGatePortalMesh(
		UProceduralMeshComponent* Mesh,
		UObject* MaterialOuter,
		const FVector& HalfExtentsCm,
		const FLinearColor& Tint);

	static void BuildBoxProceduralMesh(
		UProceduralMeshComponent* Mesh,
		UObject* MaterialOuter,
		const FVector& HalfExtentsCm,
		const FLinearColor& Tint);
};
