#include "GunsOnlyWorldBuilder.h"
#include "GunsOnlySimBridge.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "Engine/DirectionalLight.h"
#include "Engine/SkyLight.h"
#include "Engine/ExponentialHeightFog.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Components/VolumetricCloudComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "ProceduralMeshComponent.h"
#include "Materials/Material.h"
#include "Materials/MaterialInstanceDynamic.h"

namespace
{
	void AppendQuad(
		TArray<FVector>& Verts,
		TArray<int32>& Tris,
		TArray<FVector>& Normals,
		TArray<FVector2D>& UVs,
		TArray<FColor>& Colors,
		TArray<FProcMeshTangent>& Tangents,
		const FVector& A,
		const FVector& B,
		const FVector& C,
		const FVector& D,
		const FColor& Color)
	{
		const int32 Base = Verts.Num();
		const FVector N = FVector::CrossProduct(C - A, B - A).GetSafeNormal();
		Verts.Add(A); Verts.Add(B); Verts.Add(C); Verts.Add(D);
		for (int32 i = 0; i < 4; ++i)
		{
			Normals.Add(N);
			Colors.Add(Color);
			Tangents.Add(FProcMeshTangent());
		}
		UVs.Add(FVector2D(0.0, 0.0));
		UVs.Add(FVector2D(1.0, 0.0));
		UVs.Add(FVector2D(1.0, 1.0));
		UVs.Add(FVector2D(0.0, 1.0));

		Tris.Add(Base + 0); Tris.Add(Base + 2); Tris.Add(Base + 1);
		Tris.Add(Base + 0); Tris.Add(Base + 3); Tris.Add(Base + 2);
	}

	void AppendBox(
		TArray<FVector>& Verts,
		TArray<int32>& Tris,
		TArray<FVector>& Normals,
		TArray<FVector2D>& UVs,
		TArray<FColor>& Colors,
		TArray<FProcMeshTangent>& Tangents,
		const FVector& Center,
		const FVector& HalfExtents,
		const FColor& Color)
	{
		const FVector P000 = Center + FVector(-HalfExtents.X, -HalfExtents.Y, -HalfExtents.Z);
		const FVector P100 = Center + FVector( HalfExtents.X, -HalfExtents.Y, -HalfExtents.Z);
		const FVector P110 = Center + FVector( HalfExtents.X,  HalfExtents.Y, -HalfExtents.Z);
		const FVector P010 = Center + FVector(-HalfExtents.X,  HalfExtents.Y, -HalfExtents.Z);
		const FVector P001 = Center + FVector(-HalfExtents.X, -HalfExtents.Y,  HalfExtents.Z);
		const FVector P101 = Center + FVector( HalfExtents.X, -HalfExtents.Y,  HalfExtents.Z);
		const FVector P111 = Center + FVector( HalfExtents.X,  HalfExtents.Y,  HalfExtents.Z);
		const FVector P011 = Center + FVector(-HalfExtents.X,  HalfExtents.Y,  HalfExtents.Z);

		AppendQuad(Verts, Tris, Normals, UVs, Colors, Tangents, P001, P101, P111, P011, Color); // Top
		AppendQuad(Verts, Tris, Normals, UVs, Colors, Tangents, P010, P110, P100, P000, Color); // Bottom
		AppendQuad(Verts, Tris, Normals, UVs, Colors, Tangents, P100, P110, P111, P101, Color); // +X
		AppendQuad(Verts, Tris, Normals, UVs, Colors, Tangents, P010, P000, P001, P011, Color); // -X
		AppendQuad(Verts, Tris, Normals, UVs, Colors, Tangents, P010, P011, P111, P110, Color); // +Y
		AppendQuad(Verts, Tris, Normals, UVs, Colors, Tangents, P000, P100, P101, P001, Color); // -Y
	}
}

UMaterialInterface* FGunsOnlyWorldBuilder::CreateColoredMaterial(UObject* Outer, const FLinearColor& Color)
{
	UMaterialInterface* BaseMat = LoadObject<UMaterialInterface>(
		nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
	if (BaseMat == nullptr)
	{
		BaseMat = UMaterial::GetDefaultMaterial(MD_Surface);
	}
	if (BaseMat == nullptr)
	{
		return nullptr;
	}
	UMaterialInstanceDynamic* Dyn = UMaterialInstanceDynamic::Create(BaseMat, Outer);
	if (Dyn != nullptr)
	{
		Dyn->SetVectorParameterValue(TEXT("Color"), Color);
	}
	return Dyn;
}

void FGunsOnlyWorldBuilder::EnsureEnvironmentAndRunway(
	UWorld* World,
	const FGunsOnlySimBridge& Bridge,
	const GunsSimRunway& Runway)
{
	if (World == nullptr)
	{
		return;
	}

	TActorIterator<ASkyAtmosphere> AtmoIt(World);
	const bool bHasAtmosphere = static_cast<bool>(AtmoIt);

	if (!bHasAtmosphere)
	{
		FActorSpawnParameters Params;
		Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

		if (ADirectionalLight* Sun = World->SpawnActor<ADirectionalLight>(
			FVector::ZeroVector, FRotator(-32.0f, 138.0f, 0.0f), Params))
		{
			if (UDirectionalLightComponent* LightComp = Cast<UDirectionalLightComponent>(Sun->GetLightComponent()))
			{
				LightComp->SetAtmosphereSunLight(true);
				LightComp->SetIntensity(8.0f);
			}
		}

		World->SpawnActor<ASkyAtmosphere>(FVector::ZeroVector, FRotator::ZeroRotator, Params);

		if (ASkyLight* Sky = World->SpawnActor<ASkyLight>(FVector::ZeroVector, FRotator::ZeroRotator, Params))
		{
			if (USkyLightComponent* SkyComp = Sky->GetLightComponent())
			{
				SkyComp->bRealTimeCapture = true;
			}
		}

		World->SpawnActor<AVolumetricCloud>(FVector::ZeroVector, FRotator::ZeroRotator, Params);

		if (AExponentialHeightFog* Fog = World->SpawnActor<AExponentialHeightFog>(
			FVector::ZeroVector, FRotator::ZeroRotator, Params))
		{
			if (UExponentialHeightFogComponent* FogComp = Fog->GetComponent())
			{
				FogComp->SetFogDensity(0.0025f);
				FogComp->SetFogInscatteringColor(FLinearColor(0.55f, 0.72f, 0.90f));
			}
		}
	}

	// Ground / sea-level theater plane anchored near sea level (Z=0) around runway threshold
	{
		AActor* GroundActor = World->SpawnActor<AActor>(FVector::ZeroVector, FRotator::ZeroRotator);
		if (GroundActor != nullptr)
		{
			UProceduralMeshComponent* GroundMesh = NewObject<UProceduralMeshComponent>(GroundActor, TEXT("TheatreFloor"));
			GroundActor->SetRootComponent(GroundMesh);
			GroundMesh->RegisterComponent();
			BuildBoxProceduralMesh(
				GroundMesh, GroundActor,
				FVector(4000000.0, 4000000.0, 200.0), // 80 km x 80 km base slab
				FLinearColor(0.11f, 0.22f, 0.16f));
			GroundActor->SetActorLocation(FVector(0.0, 0.0, -250.0));
		}
	}

	if (Runway.present != 0)
	{
		const double LengthCm = Runway.length_m * 100.0;
		const double WidthCm = Runway.width_m * 100.0;
		const double AimAlongCm = Runway.touchdown_aim_along_m * 100.0;
		const float HeadingDeg = static_cast<float>(FMath::RadiansToDegrees(Runway.heading_rad));

		const FVector ThresholdUE = Bridge.SimPosToUE(
			Runway.threshold_east_m,
			Runway.threshold_up_m,
			Runway.threshold_north_m);

		AActor* RunwayActor = World->SpawnActor<AActor>(ThresholdUE, FRotator(0.0f, HeadingDeg, 0.0f));
		if (RunwayActor != nullptr)
		{
			UProceduralMeshComponent* RunwayMesh = NewObject<UProceduralMeshComponent>(RunwayActor, TEXT("SonRunway"));
			RunwayActor->SetRootComponent(RunwayMesh);
			RunwayMesh->RegisterComponent();

			TArray<FVector> Verts, Normals;
			TArray<int32> Tris;
			TArray<FVector2D> UVs;
			TArray<FColor> Colors;
			TArray<FProcMeshTangent> Tangents;

			// Runway asphalt slab: +X along runway from threshold to LengthCm
			AppendBox(Verts, Tris, Normals, UVs, Colors, Tangents,
				FVector(LengthCm * 0.5, 0.0, -35.0),
				FVector(LengthCm * 0.5, WidthCm * 0.5, 35.0),
				FColor(46, 50, 56, 255));
			RunwayMesh->CreateMeshSection(0, Verts, Tris, Normals, UVs, Colors, Tangents, false);
			RunwayMesh->SetMaterial(0, CreateColoredMaterial(RunwayActor, FLinearColor(0.10f, 0.11f, 0.13f)));

			// White threshold piano keys + dashed centerline markings slightly above slab
			TArray<FVector> MarkVerts, MarkNorms;
			TArray<int32> MarkTris;
			TArray<FVector2D> MarkUVs;
			TArray<FColor> MarkCols;
			TArray<FProcMeshTangent> MarkTangents;

			const int32 StripeCount = 8;
			const double Span = WidthCm * 0.80;
			for (int32 i = 0; i < StripeCount; ++i)
			{
				const double OffsetY = -Span * 0.5 + (Span / (StripeCount - 1)) * i;
				AppendBox(MarkVerts, MarkTris, MarkNorms, MarkUVs, MarkCols, MarkTangents,
					FVector(2200.0, OffsetY, 6.0),
					FVector(1600.0, 95.0, 6.0),
					FColor(238, 240, 236, 255));
			}

			for (double Along = 8000.0; Along < LengthCm - 6000.0; Along += 6000.0)
			{
				AppendBox(MarkVerts, MarkTris, MarkNorms, MarkUVs, MarkCols, MarkTangents,
					FVector(Along, 0.0, 6.0),
					FVector(1800.0, 48.0, 6.0),
					FColor(238, 240, 236, 255));
			}

			// Touchdown aim blocks
			AppendBox(MarkVerts, MarkTris, MarkNorms, MarkUVs, MarkCols, MarkTangents,
				FVector(AimAlongCm, -WidthCm * 0.25, 6.0),
				FVector(1500.0, 150.0, 6.0),
				FColor(238, 240, 236, 255));
			AppendBox(MarkVerts, MarkTris, MarkNorms, MarkUVs, MarkCols, MarkTangents,
				FVector(AimAlongCm, WidthCm * 0.25, 6.0),
				FVector(1500.0, 150.0, 6.0),
				FColor(238, 240, 236, 255));

			RunwayMesh->CreateMeshSection(1, MarkVerts, MarkTris, MarkNorms, MarkUVs, MarkCols, MarkTangents, false);
			RunwayMesh->SetMaterial(1, CreateColoredMaterial(RunwayActor, FLinearColor(0.92f, 0.92f, 0.90f)));

			// 4-light 3D PAPI array left of touchdown point (2 white on-slope inner, 2 red outer visual reference)
			for (int32 PapiIdx = 0; PapiIdx < 4; ++PapiIdx)
			{
				TArray<FVector> PV, PN;
				TArray<int32> PT;
				TArray<FVector2D> PUV;
				TArray<FColor> PC;
				TArray<FProcMeshTangent> PTan;
				const double PapiY = -WidthCm * 0.5 - 900.0 - PapiIdx * 700.0;
				const FLinearColor PapiColor = (PapiIdx < 2)
					? FLinearColor(1.0f, 0.96f, 0.85f)
					: FLinearColor(1.0f, 0.16f, 0.12f);
				AppendBox(PV, PT, PN, PUV, PC, PTan,
					FVector(AimAlongCm, PapiY, 120.0),
					FVector(140.0, 220.0, 110.0),
					FColor::White);
				const int32 SecIdx = 2 + PapiIdx;
				RunwayMesh->CreateMeshSection(SecIdx, PV, PT, PN, PUV, PC, PTan, false);
				RunwayMesh->SetMaterial(SecIdx, CreateColoredMaterial(RunwayActor, PapiColor));
			}
		}
	}
}

void FGunsOnlyWorldBuilder::BuildF22ProceduralMesh(
	UProceduralMeshComponent* Mesh,
	UObject* MaterialOuter,
	const FLinearColor& BodyTint,
	const FLinearColor& CanopyTint)
{
	if (Mesh == nullptr)
	{
		return;
	}

	// Scale: 1 m = 100 cm (~18.9 m long F-22A, ~13.56 m wingspan)
	TArray<FVector> Verts, Normals;
	TArray<int32> Tris;
	TArray<FVector2D> UVs;
	TArray<FColor> Colors;
	TArray<FProcMeshTangent> Tangents;

	const FColor BodyCol(200, 206, 214, 255);
	// Forward fuselage & nose chine
	AppendBox(Verts, Tris, Normals, UVs, Colors, Tangents,
		FVector(450.0, 0.0, 0.0), FVector(500.0, 95.0, 58.0), BodyCol);
	AppendBox(Verts, Tris, Normals, UVs, Colors, Tangents,
		FVector(-250.0, 0.0, 0.0), FVector(450.0, 145.0, 62.0), BodyCol);
	// Swept delta wing panels
	AppendBox(Verts, Tris, Normals, UVs, Colors, Tangents,
		FVector(-60.0, -340.0, -5.0), FVector(280.0, 340.0, 10.0), BodyCol);
	AppendBox(Verts, Tris, Normals, UVs, Colors, Tangents,
		FVector(-60.0, 340.0, -5.0), FVector(280.0, 340.0, 10.0), BodyCol);
	// Horizontal stabilators
	AppendBox(Verts, Tris, Normals, UVs, Colors, Tangents,
		FVector(-680.0, -240.0, 0.0), FVector(140.0, 180.0, 8.0), BodyCol);
	AppendBox(Verts, Tris, Normals, UVs, Colors, Tangents,
		FVector(-680.0, 240.0, 0.0), FVector(140.0, 180.0, 8.0), BodyCol);
	// Twin canted vertical stabilizers
	AppendBox(Verts, Tris, Normals, UVs, Colors, Tangents,
		FVector(-660.0, -165.0, 150.0), FVector(135.0, 12.0, 155.0), BodyCol);
	AppendBox(Verts, Tris, Normals, UVs, Colors, Tangents,
		FVector(-660.0, 165.0, 150.0), FVector(135.0, 12.0, 155.0), BodyCol);

	Mesh->CreateMeshSection(0, Verts, Tris, Normals, UVs, Colors, Tangents, false);
	Mesh->SetMaterial(0, CreateColoredMaterial(MaterialOuter, BodyTint));

	// Golden-tinted fighter canopy bubble
	TArray<FVector> CV, CN;
	TArray<int32> CT;
	TArray<FVector2D> CUV;
	TArray<FColor> CC;
	TArray<FProcMeshTangent> CTan;
	AppendBox(CV, CT, CN, CUV, CC, CTan,
		FVector(420.0, 0.0, 75.0), FVector(190.0, 48.0, 36.0), FColor(235, 195, 90, 255));
	Mesh->CreateMeshSection(1, CV, CT, CN, CUV, CC, CTan, false);
	Mesh->SetMaterial(1, CreateColoredMaterial(MaterialOuter, CanopyTint));
}

void FGunsOnlyWorldBuilder::BuildBoxProceduralMesh(
	UProceduralMeshComponent* Mesh,
	UObject* MaterialOuter,
	const FVector& HalfExtentsCm,
	const FLinearColor& Tint)
{
	if (Mesh == nullptr)
	{
		return;
	}
	TArray<FVector> Verts, Normals;
	TArray<int32> Tris;
	TArray<FVector2D> UVs;
	TArray<FColor> Colors;
	TArray<FProcMeshTangent> Tangents;
	AppendBox(Verts, Tris, Normals, UVs, Colors, Tangents, FVector::ZeroVector, HalfExtentsCm, FColor::White);
	Mesh->CreateMeshSection(0, Verts, Tris, Normals, UVs, Colors, Tangents, false);
	Mesh->SetMaterial(0, CreateColoredMaterial(MaterialOuter, Tint));
}
