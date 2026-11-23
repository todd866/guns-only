#pragma once

#include "CoreMinimal.h"
#include "guns_only_sim.h"

class UWorld;
class UProceduralMeshComponent;
class UMaterialInterface;
class FGunsOnlySimBridge;

class GUNSONLYUE_API FGunsOnlyWorldBuilder
{
public:
	static UMaterialInterface* CreateColoredMaterial(
		UObject* Outer,
		const FLinearColor& Color);

	static void EnsureEnvironmentAndRunway(
		UWorld* World,
		const FGunsOnlySimBridge& Bridge,
		const GunsSimRunway& Runway);

	static void BuildF22ProceduralMesh(
		UProceduralMeshComponent* Mesh,
		UObject* MaterialOuter,
		const FLinearColor& BodyTint,
		const FLinearColor& CanopyTint);

	static void BuildBoxProceduralMesh(
		UProceduralMeshComponent* Mesh,
		UObject* MaterialOuter,
		const FVector& HalfExtentsCm,
		const FLinearColor& Tint);
};
