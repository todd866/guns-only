#pragma once

#include "CoreMinimal.h"
#include "guns_only_sim.h"

class UWorld;
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
		const FGunsOnlySimBridge& Bridge,
		const GunsSimRunway& Runway,
		const GunsSimCobraState& CobraState,
		FGunsOnlyPapiRig& OutPapiRig,
		TArray<TObjectPtr<AActor>>& OutSpawnedWorldActors);

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
