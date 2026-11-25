#include "GunsOnlyWorldBuilder.h"
#include "GunsOnlySimBridge.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "Engine/DirectionalLight.h"
#include "Engine/SkyLight.h"
#include "Engine/ExponentialHeightFog.h"
#include "Engine/PostProcessVolume.h"
#include "Engine/StaticMesh.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Components/VolumetricCloudComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "ProceduralMeshComponent.h"
#include "Materials/Material.h"
#include "Materials/MaterialInstanceDynamic.h"

namespace
{
	struct FMeshBuffers
	{
		TArray<FVector> Verts;
		TArray<int32> Tris;
		TArray<FVector> Normals;
		TArray<FVector2D> UVs;
		TArray<FColor> Colors;
		TArray<FProcMeshTangent> Tangents;
	};

	struct FChineStation
	{
		double X = 0.0;
		double CenterZ = 0.0;
		double HalfWidthY = 0.0;
		double TopHalfZ = 0.0;
		double BotHalfZ = 0.0;
	};

	double SmoothStep01(double T)
	{
		const double C = FMath::Clamp(T, 0.0, 1.0);
		return C * C * (3.0 - 2.0 * C);
	}

	void AppendQuad(
		FMeshBuffers& Buf,
		const FVector& A,
		const FVector& B,
		const FVector& C,
		const FVector& D,
		const FColor& Color)
	{
		const int32 Base = Buf.Verts.Num();
		const FVector Normal = FVector::CrossProduct(B - A, C - A).GetSafeNormal();
		Buf.Verts.Add(A);
		Buf.Verts.Add(B);
		Buf.Verts.Add(C);
		Buf.Verts.Add(D);
		for (int32 i = 0; i < 4; ++i)
		{
			Buf.Normals.Add(Normal);
			Buf.Colors.Add(Color);
			Buf.Tangents.Add(FProcMeshTangent());
		}
		Buf.UVs.Add(FVector2D(0.0, 0.0));
		Buf.UVs.Add(FVector2D(1.0, 0.0));
		Buf.UVs.Add(FVector2D(1.0, 1.0));
		Buf.UVs.Add(FVector2D(0.0, 1.0));

		Buf.Tris.Add(Base + 0); Buf.Tris.Add(Base + 2); Buf.Tris.Add(Base + 1);
		Buf.Tris.Add(Base + 0); Buf.Tris.Add(Base + 3); Buf.Tris.Add(Base + 2);
	}

	void AppendQuadOutward(
		FMeshBuffers& Buf,
		const FVector& A,
		const FVector& B,
		const FVector& C,
		const FVector& D,
		const FVector& OutwardHint,
		const FColor& Color)
	{
		const FVector TriNormal = FVector::CrossProduct(B - A, C - A);
		if (FVector::DotProduct(TriNormal, OutwardHint) >= 0.0)
		{
			AppendQuad(Buf, A, B, C, D, Color);
		}
		else
		{
			AppendQuad(Buf, D, C, B, A, Color);
		}
	}

	void AppendBox(
		FMeshBuffers& Buf,
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

		AppendQuad(Buf, P001, P101, P111, P011, Color);
		AppendQuad(Buf, P010, P110, P100, P000, Color);
		AppendQuad(Buf, P100, P110, P111, P101, Color);
		AppendQuad(Buf, P010, P000, P001, P011, Color);
		AppendQuad(Buf, P010, P011, P111, P110, Color);
		AppendQuad(Buf, P000, P100, P101, P001, Color);
	}

	void AppendSweptPlate(
		FMeshBuffers& Buf,
		const FVector& RootLE,
		const FVector& RootTE,
		const FVector& TipLE,
		const FVector& TipTE,
		double HalfThicknessCm,
		const FColor& Color)
	{
		const FVector ChordVec = TipLE - RootLE;
		const FVector SpanVec = RootTE - RootLE;
		FVector PlateNormal = FVector::CrossProduct(SpanVec, ChordVec).GetSafeNormal();
		if (PlateNormal.IsNearlyZero())
		{
			PlateNormal = FVector::UpVector;
		}
		const FVector Offset = PlateNormal * HalfThicknessCm;
		const FVector Center = 0.25 * (RootLE + RootTE + TipLE + TipTE);

		const FVector RLE_T = RootLE + Offset;
		const FVector RTE_T = RootTE + Offset;
		const FVector TLE_T = TipLE + Offset;
		const FVector TTE_T = TipTE + Offset;
		const FVector RLE_B = RootLE - Offset;
		const FVector RTE_B = RootTE - Offset;
		const FVector TLE_B = TipLE - Offset;
		const FVector TTE_B = TipTE - Offset;

		AppendQuadOutward(Buf, RLE_T, RTE_T, TTE_T, TLE_T, PlateNormal, Color);
		AppendQuadOutward(Buf, RLE_B, TLE_B, TTE_B, RTE_B, -PlateNormal, Color);
		AppendQuadOutward(Buf, RLE_B, RLE_T, TLE_T, TLE_B, FVector(1.0, 0.0, 0.0), Color);
		AppendQuadOutward(Buf, RTE_T, RTE_B, TTE_B, TTE_T, FVector(-1.0, 0.0, 0.0), Color);
		AppendQuadOutward(Buf, TLE_B, TLE_T, TTE_T, TTE_B, TipLE - RootLE, Color);
		AppendQuadOutward(Buf, RLE_T, RLE_B, RTE_B, RTE_T, RootLE - TipLE, Color);
		(void)Center;
	}

	void BuildHexRing(const FChineStation& St, double YOffset, FVector OutRing[6])
	{
		// Octagonal/chined 6-vertex fuselage ring in clockwise order facing +X
		const double EdgeY = St.HalfWidthY * 0.56;
		OutRing[0] = FVector(St.X, YOffset - EdgeY, St.CenterZ + St.TopHalfZ);
		OutRing[1] = FVector(St.X, YOffset + EdgeY, St.CenterZ + St.TopHalfZ);
		OutRing[2] = FVector(St.X, YOffset + St.HalfWidthY, St.CenterZ);
		OutRing[3] = FVector(St.X, YOffset + EdgeY, St.CenterZ - St.BotHalfZ);
		OutRing[4] = FVector(St.X, YOffset - EdgeY, St.CenterZ - St.BotHalfZ);
		OutRing[5] = FVector(St.X, YOffset - St.HalfWidthY, St.CenterZ);
	}

	void AppendChinedFuselage(
		FMeshBuffers& Buf,
		const TArray<FChineStation>& Stations,
		double YOffset,
		const FColor& Color)
	{
		if (Stations.Num() < 2)
		{
			return;
		}
		TArray<FVector> Rings;
		Rings.SetNum(Stations.Num() * 6);
		for (int32 i = 0; i < Stations.Num(); ++i)
		{
			BuildHexRing(Stations[i], YOffset, &Rings[i * 6]);
		}

		for (int32 s = 0; s < Stations.Num() - 1; ++s)
		{
			const FVector* R0 = &Rings[s * 6];
			const FVector* R1 = &Rings[(s + 1) * 6];
			const FVector MidCenter = FVector(
				0.5 * (Stations[s].X + Stations[s + 1].X),
				YOffset,
				0.5 * (Stations[s].CenterZ + Stations[s + 1].CenterZ));
			for (int32 e = 0; e < 6; ++e)
			{
				const int32 Next = (e + 1) % 6;
				const FVector QuadMid = 0.25 * (R0[e] + R0[Next] + R1[Next] + R1[e]);
				AppendQuadOutward(Buf, R0[e], R0[Next], R1[Next], R1[e], QuadMid - MidCenter, Color);
			}
		}

		// Nose and tail caps
		const FVector NoseCenter(Stations[0].X, YOffset, Stations[0].CenterZ);
		const FVector TailCenter(Stations.Last().X, YOffset, Stations.Last().CenterZ);
		AppendQuadOutward(Buf, Rings[0], Rings[1], Rings[2], Rings[3], FVector(1.0, 0.0, 0.0), Color);
		AppendQuadOutward(Buf, Rings[0], Rings[3], Rings[4], Rings[5], FVector(1.0, 0.0, 0.0), Color);
		const FVector* LastR = &Rings[(Stations.Num() - 1) * 6];
		AppendQuadOutward(Buf, LastR[3], LastR[2], LastR[1], LastR[0], FVector(-1.0, 0.0, 0.0), Color);
		AppendQuadOutward(Buf, LastR[5], LastR[4], LastR[3], LastR[0], FVector(-1.0, 0.0, 0.0), Color);
		(void)NoseCenter;
		(void)TailCenter;
	}

	void CommitSection(
		UProceduralMeshComponent* Mesh,
		int32 SectionIdx,
		const FMeshBuffers& Buf,
		UMaterialInterface* Mat)
	{
		Mesh->CreateMeshSection(
			SectionIdx, Buf.Verts, Buf.Tris, Buf.Normals, Buf.UVs, Buf.Colors, Buf.Tangents, false);
		Mesh->SetMaterial(SectionIdx, Mat);
	}

	void AppendBoxScaledUV(
		FMeshBuffers& Buf,
		const FVector& Center,
		const FVector& HalfExtents,
		const FColor& Color,
		double TopTileCm = 4500.0)
	{
		const FVector P000 = Center + FVector(-HalfExtents.X, -HalfExtents.Y, -HalfExtents.Z);
		const FVector P100 = Center + FVector( HalfExtents.X, -HalfExtents.Y, -HalfExtents.Z);
		const FVector P110 = Center + FVector( HalfExtents.X,  HalfExtents.Y, -HalfExtents.Z);
		const FVector P010 = Center + FVector(-HalfExtents.X,  HalfExtents.Y, -HalfExtents.Z);
		const FVector P001 = Center + FVector(-HalfExtents.X, -HalfExtents.Y,  HalfExtents.Z);
		const FVector P101 = Center + FVector( HalfExtents.X, -HalfExtents.Y,  HalfExtents.Z);
		const FVector P111 = Center + FVector( HalfExtents.X,  HalfExtents.Y,  HalfExtents.Z);
		const FVector P011 = Center + FVector(-HalfExtents.X,  HalfExtents.Y,  HalfExtents.Z);

		// Top face receives life-size metric UVs so runway concrete slabs scale naturally
		{
			const int32 Base = Buf.Verts.Num();
			const float MaxU = static_cast<float>((HalfExtents.X * 2.0) / TopTileCm);
			const float MaxV = static_cast<float>((HalfExtents.Y * 2.0) / TopTileCm);
			Buf.Verts.Add(P001); Buf.Verts.Add(P101); Buf.Verts.Add(P111); Buf.Verts.Add(P011);
			for (int32 i = 0; i < 4; ++i)
			{
				Buf.Normals.Add(FVector::UpVector);
				Buf.Colors.Add(Color);
				Buf.Tangents.Add(FProcMeshTangent());
			}
			Buf.UVs.Add(FVector2D(0.0f, 0.0f));
			Buf.UVs.Add(FVector2D(MaxU, 0.0f));
			Buf.UVs.Add(FVector2D(MaxU, MaxV));
			Buf.UVs.Add(FVector2D(0.0f, MaxV));
			Buf.Tris.Add(Base + 0); Buf.Tris.Add(Base + 2); Buf.Tris.Add(Base + 1);
			Buf.Tris.Add(Base + 0); Buf.Tris.Add(Base + 3); Buf.Tris.Add(Base + 2);
		}
		AppendQuad(Buf, P010, P110, P100, P000, Color);
		AppendQuad(Buf, P100, P110, P111, P101, Color);
		AppendQuad(Buf, P010, P000, P001, P011, Color);
		AppendQuad(Buf, P010, P011, P111, P110, Color);
		AppendQuad(Buf, P000, P100, P101, P001, Color);
	}

	void SpawnStaticAirbaseActor(
		UWorld* World,
		const FTransform& RunwayFrame,
		const FVector& LocalPosCm,
		const FRotator& LocalRot,
		const TCHAR* MeshPath,
		const TCHAR* Label,
		TArray<TObjectPtr<AActor>>& OutSpawned)
	{
		UStaticMesh* MeshAsset = FGunsOnlyWorldBuilder::LoadGunsStaticMesh(MeshPath);
		if (World == nullptr || MeshAsset == nullptr)
		{
			return;
		}
		const FVector WorldPos = RunwayFrame.TransformPosition(LocalPosCm);
		const FRotator WorldRot = (RunwayFrame.GetRotation() * LocalRot.Quaternion()).Rotator();
		FActorSpawnParameters Params;
		Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		if (AActor* Actor = World->SpawnActor<AActor>(WorldPos, WorldRot, Params))
		{
			UStaticMeshComponent* Comp = NewObject<UStaticMeshComponent>(Actor, Label);
			Comp->SetStaticMesh(MeshAsset);
			Comp->SetCollisionEnabled(ECollisionEnabled::NoCollision);
			Actor->SetRootComponent(Comp);
			Comp->RegisterComponent();
			Actor->SetActorLocationAndRotation(WorldPos, WorldRot);
			OutSpawned.Add(Actor);
		}
	}

	uint32 HashStep(uint32& State)
	{
		State = State * 1664525u + 1013904223u;
		return State;
	}

	double HashUnit01(uint32& State)
	{
		return static_cast<double>(HashStep(State) >> 8) / static_cast<double>(1u << 24);
	}

	void SpawnInstancedFoliage(
		UWorld* World,
		const TCHAR* MeshPath,
		const TCHAR* CompName,
		const TArray<FTransform>& Transforms,
		TArray<TObjectPtr<AActor>>& OutSpawned)
	{
		if (World == nullptr || Transforms.IsEmpty())
		{
			return;
		}
		UStaticMesh* MeshAsset = FGunsOnlyWorldBuilder::LoadGunsStaticMesh(MeshPath);
		if (MeshAsset == nullptr)
		{
			return;
		}
		FActorSpawnParameters Params;
		Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		if (AActor* FoliageActor = World->SpawnActor<AActor>(FVector::ZeroVector, FRotator::ZeroRotator, Params))
		{
			UInstancedStaticMeshComponent* ISM = NewObject<UInstancedStaticMeshComponent>(FoliageActor, CompName);
			ISM->SetStaticMesh(MeshAsset);
			ISM->SetCollisionEnabled(ECollisionEnabled::NoCollision);
			ISM->SetCastShadow(true);
			ISM->SetCullDistances(0, 2600000); // visible up to 26 km
			FoliageActor->SetRootComponent(ISM);
			ISM->RegisterComponent();
			ISM->AddInstances(Transforms, false);
			OutSpawned.Add(FoliageActor);
		}
	}

	void BuildUkraineTerrainActor(
		UWorld* World,
		const FGunsOnlySimBridge& Bridge,
		const GunsSimRunway& Runway,
		TArray<TObjectPtr<AActor>>& OutSpawned)
	{
		const double OriginE = Bridge.GetOriginEastMeters();
		const double OriginN = Bridge.GetOriginNorthMeters();

		constexpr int32 InnerN = 201;
		constexpr double InnerStepM = 120.0;
		const double InnerHalfM = 0.5 * (InnerN - 1) * InnerStepM; // 12,000 m (24x24 km)
		const double InnerMinE = OriginE - InnerHalfM;
		const double InnerMinN = OriginN - InnerHalfM;

		constexpr int32 OuterN = 121;
		constexpr double OuterStepM = 700.0;
		const double OuterHalfM = 0.5 * (OuterN - 1) * OuterStepM; // 42,000 m (84x84 km)
		const double OuterMinE = OriginE - OuterHalfM;
		const double OuterMinN = OriginN - OuterHalfM;

		TArray<float> InnerHeightsM;
		TArray<float> OuterHeightsM;
		const bool bHasInner = Bridge.SampleTerrainGrid(InnerMinE, InnerMinN, InnerStepM, InnerN, InnerN, InnerHeightsM) == InnerN * InnerN;
		const bool bHasOuter = Bridge.SampleTerrainGrid(OuterMinE, OuterMinN, OuterStepM, OuterN, OuterN, OuterHeightsM) == OuterN * OuterN;

		if (!bHasInner)
		{
			InnerHeightsM.Init(Runway.present != 0 ? static_cast<float>(Runway.threshold_up_m - 0.6) : 0.0f, InnerN * InnerN);
		}
		if (!bHasOuter)
		{
			OuterHeightsM.Init(Runway.present != 0 ? static_cast<float>(Runway.threshold_up_m - 1.1) : 0.0f, OuterN * OuterN);
		}

		// Grade Son runway + eastern taxiways + apron pad completely level
		if (Runway.present != 0)
		{
			const double FwdE = FMath::Sin(Runway.heading_rad);
			const double FwdN = FMath::Cos(Runway.heading_rad);
			const double RightE = FMath::Cos(Runway.heading_rad);
			const double RightN = -FMath::Sin(Runway.heading_rad);
			const double MinCross = -(Runway.width_m * 0.5 + 140.0);
			const double MaxCross = +(Runway.width_m * 0.5 + 360.0);
			const double PadMinAlong = -220.0;
			const double PadMaxAlong = Runway.length_m + 220.0;
			const double PadHeightM = Runway.threshold_up_m - 0.60;

			for (int32 j = 0; j < InnerN; ++j)
			{
				const double NorthM = InnerMinN + j * InnerStepM;
				for (int32 i = 0; i < InnerN; ++i)
				{
					const double EastM = InnerMinE + i * InnerStepM;
					const double RelE = EastM - Runway.threshold_east_m;
					const double RelN = NorthM - Runway.threshold_north_m;
					const double AlongM = RelE * FwdE + RelN * FwdN;
					const double CrossM = RelE * RightE + RelN * RightN;
					const double dAlong = AlongM < PadMinAlong
						? (PadMinAlong - AlongM)
						: (AlongM > PadMaxAlong ? (AlongM - PadMaxAlong) : 0.0);
					const double dCross = CrossM < MinCross
						? (MinCross - CrossM)
						: (CrossM > MaxCross ? (CrossM - MaxCross) : 0.0);
					const double DistM = FMath::Sqrt(dAlong * dAlong + dCross * dCross);
					if (DistM < 450.0)
					{
						const int32 Idx = j * InnerN + i;
						const double Alpha = SmoothStep01(DistM / 450.0);
						InnerHeightsM[Idx] = static_cast<float>(FMath::Lerp(PadHeightM, static_cast<double>(InnerHeightsM[Idx]), Alpha));
					}
				}
			}
		}

		UMaterialInterface* TerrainPbrMat = LoadObject<UMaterialInterface>(
			nullptr, TEXT("/Game/GunsOnly/Materials/M_Ukraine_Terrain.M_Ukraine_Terrain"));
		const bool bUseUnifiedPbr = (TerrainPbrMat != nullptr);

		FMeshBuffers Sections[4];
		auto AppendTerrainRing = [&Sections, bUseUnifiedPbr](
			const TArray<float>& GridHeights,
			int32 DimN,
			double RingMinE,
			double RingMinN,
			double StepM,
			double OriginEastM,
			double OriginNorthM,
			double VerticalBiasCm,
			bool bSkipInnerHole,
			double HoleHalfSpanM)
		{
			TArray<FVector> RingPositions;
			TArray<FVector> RingNormals;
			RingPositions.SetNumUninitialized(DimN * DimN);
			RingNormals.SetNumUninitialized(DimN * DimN);

			for (int32 j = 0; j < DimN; ++j)
			{
				const double NorthM = RingMinN + j * StepM;
				for (int32 i = 0; i < DimN; ++i)
				{
					const double EastM = RingMinE + i * StepM;
					const int32 Idx = j * DimN + i;
					const double H = static_cast<double>(GridHeights[Idx]);
					RingPositions[Idx] = FVector(
						(NorthM - OriginNorthM) * 100.0,
						(EastM - OriginEastM) * 100.0,
						H * 100.0 + VerticalBiasCm);
				}
			}

			for (int32 j = 0; j < DimN; ++j)
			{
				const int32 Jm = FMath::Max(0, j - 1);
				const int32 Jp = FMath::Min(DimN - 1, j + 1);
				const double SpanN = FMath::Max(1.0, static_cast<double>(Jp - Jm) * StepM);
				for (int32 i = 0; i < DimN; ++i)
				{
					const int32 Im = FMath::Max(0, i - 1);
					const int32 Ip = FMath::Min(DimN - 1, i + 1);
					const double SpanE = FMath::Max(1.0, static_cast<double>(Ip - Im) * StepM);
					const double dHdN = (GridHeights[Jp * DimN + i] - GridHeights[Jm * DimN + i]) / SpanN;
					const double dHdE = (GridHeights[j * DimN + Ip] - GridHeights[j * DimN + Im]) / SpanE;
					RingNormals[j * DimN + i] = FVector(-dHdN, -dHdE, 1.0).GetSafeNormal();
				}
			}

			for (int32 j = 0; j < DimN - 1; ++j)
			{
				for (int32 i = 0; i < DimN - 1; ++i)
				{
					const int32 I00 = j * DimN + i;
					const int32 I10 = j * DimN + (i + 1);
					const int32 I11 = (j + 1) * DimN + (i + 1);
					const int32 I01 = (j + 1) * DimN + i;

					if (bSkipInnerHole)
					{
						const double CenterE = RingMinE + (i + 0.5) * StepM;
						const double CenterN = RingMinN + (j + 0.5) * StepM;
						if (FMath::Abs(CenterE - OriginEastM) < HoleHalfSpanM
							&& FMath::Abs(CenterN - OriginNorthM) < HoleHalfSpanM)
						{
							continue;
						}
					}

					int32 Sec = 0;
					if (!bUseUnifiedPbr)
					{
						const float AvgH = 0.25f * (GridHeights[I00] + GridHeights[I10] + GridHeights[I11] + GridHeights[I01]);
						Sec = 1;
						if (AvgH <= 2.0f) Sec = 0;
						else if (AvgH > 240.0f) Sec = 3;
						else if (AvgH > 110.0f) Sec = 2;
					}

					FMeshBuffers& Buf = Sections[Sec];
					const int32 Base = Buf.Verts.Num();
					const int32 CornerIndices[4] = { I00, I10, I11, I01 };
					const FVector2D CornerUVs[4] = {
						FVector2D(0.0, 0.0), FVector2D(1.0, 0.0), FVector2D(1.0, 1.0), FVector2D(0.0, 1.0)
					};
					for (int32 k = 0; k < 4; ++k)
					{
						const int32 Src = CornerIndices[k];
						Buf.Verts.Add(RingPositions[Src]);
						Buf.Normals.Add(RingNormals[Src]);
						Buf.UVs.Add(CornerUVs[k]);
						Buf.Colors.Add(FColor::White);
						Buf.Tangents.Add(FProcMeshTangent());
					}
					Buf.Tris.Add(Base + 0); Buf.Tris.Add(Base + 1); Buf.Tris.Add(Base + 3);
					Buf.Tris.Add(Base + 1); Buf.Tris.Add(Base + 2); Buf.Tris.Add(Base + 3);
				}
			}
		};

		AppendTerrainRing(InnerHeightsM, InnerN, InnerMinE, InnerMinN, InnerStepM, OriginE, OriginN, 0.0, false, 0.0);
		AppendTerrainRing(OuterHeightsM, OuterN, OuterMinE, OuterMinN, OuterStepM, OriginE, OriginN, -55.0, true, InnerHalfM - 450.0);

		FActorSpawnParameters TerrainSpawnParams;
		TerrainSpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		AActor* TerrainActor = World->SpawnActor<AActor>(FVector::ZeroVector, FRotator::ZeroRotator, TerrainSpawnParams);
		if (TerrainActor != nullptr)
		{
			UProceduralMeshComponent* TerrainMesh = NewObject<UProceduralMeshComponent>(TerrainActor, TEXT("UkraineTerrain"));
			TerrainActor->SetRootComponent(TerrainMesh);
			TerrainMesh->RegisterComponent();
			OutSpawned.Add(TerrainActor);

			if (bUseUnifiedPbr)
			{
				CommitSection(TerrainMesh, 0, Sections[0], TerrainPbrMat);
			}
			else
			{
				const FLinearColor BiomeColors[4] = {
					FLinearColor(0.07f, 0.18f, 0.27f),
					FLinearColor(0.14f, 0.24f, 0.14f),
					FLinearColor(0.23f, 0.26f, 0.16f),
					FLinearColor(0.32f, 0.30f, 0.25f)
				};
				for (int32 Sec = 0; Sec < 4; ++Sec)
				{
					if (Sections[Sec].Verts.Num() > 0)
					{
						CommitSection(TerrainMesh, Sec, Sections[Sec], FGunsOnlyWorldBuilder::CreateColoredMaterial(TerrainActor, BiomeColors[Sec]));
					}
				}
			}
		}

		// Ukraine windbreak / shelterbelt tree rows along steppe fields outside Son airbase clearways
		TArray<FTransform> TreeTransforms;
		TreeTransforms.Reserve(520);
		uint32 Rng = 0x51A9E123u;
		for (int32 Attempt = 0; Attempt < 1400 && TreeTransforms.Num() < 480; ++Attempt)
		{
			const double LocalE = (HashUnit01(Rng) - 0.5) * 20000.0;
			const double LocalN = (HashUnit01(Rng) - 0.5) * 20000.0;
			const double WorldE = OriginE + LocalE;
			const double WorldN = OriginN + LocalN;
			if (Runway.present != 0)
			{
				const double FwdE = FMath::Sin(Runway.heading_rad);
				const double FwdN = FMath::Cos(Runway.heading_rad);
				const double RightE = FMath::Cos(Runway.heading_rad);
				const double RightN = -FMath::Sin(Runway.heading_rad);
				const double Along = (WorldE - Runway.threshold_east_m) * FwdE + (WorldN - Runway.threshold_north_m) * FwdN;
				const double Cross = (WorldE - Runway.threshold_east_m) * RightE + (WorldN - Runway.threshold_north_m) * RightN;
				if (Along > -1800.0 && Along < Runway.length_m + 1800.0 && Cross > -380.0 && Cross < 620.0)
				{
					continue;
				}
			}
			double H = 0.0;
			if (!Bridge.SampleTerrainMeters(WorldE, WorldN, H) || H < 8.0 || H > 180.0)
			{
				continue;
			}
			// Encourage linear hedgerows along 900 m stepped agricultural grid lines
			const double ModE = FMath::Fmod(FMath::Abs(LocalE), 900.0);
			const double ModN = FMath::Fmod(FMath::Abs(LocalN), 900.0);
			if (ModE > 55.0 && ModN > 55.0)
			{
				continue;
			}
			const float Yaw = static_cast<float>(HashUnit01(Rng) * 360.0);
			const float Scale = static_cast<float>(0.85 + HashUnit01(Rng) * 0.65);
			TreeTransforms.Emplace(FRotator(0.0f, Yaw, 0.0f), Bridge.SimPosToUE(WorldE, H - 0.3, WorldN), FVector(Scale));
		}
		SpawnInstancedFoliage(World, TEXT("/Game/GunsOnly/Meshes/SM_Shelterbelt_Tree.SM_Shelterbelt_Tree"),
			TEXT("UkraineShelterbelts"), TreeTransforms, OutSpawned);
	}

	void BuildCobraEnvironment(
		UWorld* World,
		const FGunsOnlySimBridge& Bridge,
		const GunsSimCobraState& CobraState,
		TArray<TObjectPtr<AActor>>& OutSpawned)
	{
		const double OriginE = Bridge.GetOriginEastMeters();
		const double OriginN = Bridge.GetOriginNorthMeters();

		constexpr int32 DimN = 201;
		constexpr double StepM = 80.0;
		constexpr double MinE = -8000.0;
		constexpr double MinN = -8000.0;

		TArray<float> HeightsM;
		if (Bridge.SampleTerrainGrid(MinE, MinN, StepM, DimN, DimN, HeightsM) != DimN * DimN)
		{
			HeightsM.Init(static_cast<float>(CobraState.bridge_up_m), DimN * DimN);
		}

		// Level small 34m helipad shoulder around Camp Ember FOB
		for (int32 Row = 0; Row < DimN; ++Row)
		{
			const double NorthM = MinN + Row * StepM;
			for (int32 Col = 0; Col < DimN; ++Col)
			{
				const double EastM = MinE + Col * StepM;
				const double dE = EastM - CobraState.fob_east_m;
				const double dN = NorthM - CobraState.fob_north_m;
				const double Dist = FMath::Sqrt(dE * dE + dN * dN);
				if (Dist < 68.0)
				{
					const double Alpha = SmoothStep01(FMath::Clamp((Dist - 24.0) / 44.0, 0.0, 1.0));
					const int32 CellIdx = Row * DimN + Col;
					HeightsM[CellIdx] = static_cast<float>(FMath::Lerp(
						CobraState.fob_up_m - 0.15, static_cast<double>(HeightsM[CellIdx]), Alpha));
				}
			}
		}

		UMaterialInterface* CanyonPbrMat = LoadObject<UMaterialInterface>(
			nullptr, TEXT("/Game/GunsOnly/Materials/M_Cobra_Jungle_Terrain.M_Cobra_Jungle_Terrain"));
		const bool bUseUnifiedPbr = (CanyonPbrMat != nullptr);

		TArray<FVector> Positions;
		TArray<FVector> Normals;
		Positions.SetNumUninitialized(DimN * DimN);
		Normals.SetNumUninitialized(DimN * DimN);
		for (int32 Row = 0; Row < DimN; ++Row)
		{
			const double NorthM = MinN + Row * StepM;
			for (int32 Col = 0; Col < DimN; ++Col)
			{
				const double EastM = MinE + Col * StepM;
				const int32 CellIdx = Row * DimN + Col;
				Positions[CellIdx] = FVector(
					(NorthM - OriginN) * 100.0,
					(EastM - OriginE) * 100.0,
					static_cast<double>(HeightsM[CellIdx]) * 100.0);
			}
		}
		for (int32 Row = 0; Row < DimN; ++Row)
		{
			const int32 Rm = FMath::Max(0, Row - 1);
			const int32 Rp = FMath::Min(DimN - 1, Row + 1);
			const double SpanN = FMath::Max(1.0, static_cast<double>(Rp - Rm) * StepM);
			for (int32 Col = 0; Col < DimN; ++Col)
			{
				const int32 Cm = FMath::Max(0, Col - 1);
				const int32 Cp = FMath::Min(DimN - 1, Col + 1);
				const double SpanE = FMath::Max(1.0, static_cast<double>(Cp - Cm) * StepM);
				const double dHdN = (HeightsM[Rp * DimN + Col] - HeightsM[Rm * DimN + Col]) / SpanN;
				const double dHdE = (HeightsM[Row * DimN + Cp] - HeightsM[Row * DimN + Cm]) / SpanE;
				Normals[Row * DimN + Col] = FVector(-dHdN, -dHdE, 1.0).GetSafeNormal();
			}
		}

		FMeshBuffers Sections[4];
		for (int32 Row = 0; Row < DimN - 1; ++Row)
		{
			for (int32 Col = 0; Col < DimN - 1; ++Col)
			{
				const int32 I00 = Row * DimN + Col;
				const int32 I10 = Row * DimN + (Col + 1);
				const int32 I11 = (Row + 1) * DimN + (Col + 1);
				const int32 I01 = (Row + 1) * DimN + Col;

				int32 Sec = 0;
				if (!bUseUnifiedPbr)
				{
					const float AvgH = 0.25f * (HeightsM[I00] + HeightsM[I10] + HeightsM[I11] + HeightsM[I01]);
					Sec = 1;
					if (AvgH <= 96.0f) Sec = 0;
					else if (AvgH > 260.0f) Sec = 3;
					else if (AvgH > 165.0f) Sec = 2;
				}
				FMeshBuffers& Buf = Sections[Sec];
				const int32 Base = Buf.Verts.Num();
				const int32 Corners[4] = { I00, I10, I11, I01 };
				const FVector2D QuadUVs[4] = {
					FVector2D(0.0, 0.0), FVector2D(1.0, 0.0), FVector2D(1.0, 1.0), FVector2D(0.0, 1.0)
				};
				for (int32 CornerIdx = 0; CornerIdx < 4; ++CornerIdx)
				{
					const int32 Src = Corners[CornerIdx];
					Buf.Verts.Add(Positions[Src]);
					Buf.Normals.Add(Normals[Src]);
					Buf.UVs.Add(QuadUVs[CornerIdx]);
					Buf.Colors.Add(FColor::White);
					Buf.Tangents.Add(FProcMeshTangent());
				}
				Buf.Tris.Add(Base + 0); Buf.Tris.Add(Base + 1); Buf.Tris.Add(Base + 3);
				Buf.Tris.Add(Base + 1); Buf.Tris.Add(Base + 2); Buf.Tris.Add(Base + 3);
			}
		}

		FActorSpawnParameters SpawnParams;
		SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		if (AActor* CanyonActor = World->SpawnActor<AActor>(FVector::ZeroVector, FRotator::ZeroRotator, SpawnParams))
		{
			UProceduralMeshComponent* CanyonMesh = NewObject<UProceduralMeshComponent>(CanyonActor, TEXT("CobraCanyonTerrain"));
			CanyonActor->SetRootComponent(CanyonMesh);
			CanyonMesh->RegisterComponent();
			OutSpawned.Add(CanyonActor);
			if (bUseUnifiedPbr)
			{
				CommitSection(CanyonMesh, 0, Sections[0], CanyonPbrMat);
			}
			else
			{
				const FLinearColor JungleColors[4] = {
					FLinearColor(0.06f, 0.16f, 0.14f),
					FLinearColor(0.11f, 0.24f, 0.10f),
					FLinearColor(0.19f, 0.24f, 0.12f),
					FLinearColor(0.30f, 0.28f, 0.24f)
				};
				for (int32 Sec = 0; Sec < 4; ++Sec)
				{
					if (Sections[Sec].Verts.Num() > 0)
					{
						CommitSection(CanyonMesh, Sec, Sections[Sec],
							FGunsOnlyWorldBuilder::CreateColoredMaterial(CanyonActor, JungleColors[Sec]));
					}
				}
			}
		}

		// Iron Bell Bridge landmark
		if (UStaticMesh* BridgeStatic = FGunsOnlyWorldBuilder::LoadGunsStaticMesh(
			TEXT("/Game/GunsOnly/Meshes/SM_Cobra_Bridge.SM_Cobra_Bridge")))
		{
			const FVector BridgeUE = Bridge.SimPosToUE(
				CobraState.bridge_east_m, CobraState.bridge_up_m + 0.25, CobraState.bridge_north_m);
			if (AActor* BridgeActor = World->SpawnActor<AActor>(BridgeUE, FRotator::ZeroRotator, SpawnParams))
			{
				UStaticMeshComponent* Comp = NewObject<UStaticMeshComponent>(BridgeActor, TEXT("IronBellBridge"));
				Comp->SetStaticMesh(BridgeStatic);
				Comp->SetCollisionEnabled(ECollisionEnabled::NoCollision);
				BridgeActor->SetRootComponent(Comp);
				Comp->RegisterComponent();
				BridgeActor->SetActorLocation(BridgeUE);
				OutSpawned.Add(BridgeActor);
			}
		}

		// Camp Ember FOB helipad + Tower + Hangar
		const FVector FobUE = Bridge.SimPosToUE(CobraState.fob_east_m, CobraState.fob_up_m, CobraState.fob_north_m);
		const FTransform FobFrame(FRotator::ZeroRotator, FobUE);
		if (AActor* PadActor = World->SpawnActor<AActor>(FobUE, FRotator::ZeroRotator, SpawnParams))
		{
			UProceduralMeshComponent* PadMesh = NewObject<UProceduralMeshComponent>(PadActor, TEXT("CampEmberPad"));
			PadActor->SetRootComponent(PadMesh);
			PadMesh->RegisterComponent();
			PadActor->SetActorLocation(FobUE);
			OutSpawned.Add(PadActor);

			FMeshBuffers Slab;
			AppendBoxScaledUV(Slab, FVector(0.0, 0.0, -25.0), FVector(2200.0, 2200.0, 25.0), FColor(52, 54, 58, 255));
			CommitSection(PadMesh, 0, Slab,
				FGunsOnlyWorldBuilder::LoadGunsMaterial(
					TEXT("/Game/GunsOnly/Materials/M_Runway_Asphalt.M_Runway_Asphalt"),
					PadActor, FLinearColor(0.12f, 0.13f, 0.14f)));

			FMeshBuffers HMark;
			const FColor YellowCol(240, 198, 45, 255);
			AppendBox(HMark, FVector(0.0, -520.0, 5.0), FVector(780.0, 95.0, 5.0), YellowCol);
			AppendBox(HMark, FVector(0.0,  520.0, 5.0), FVector(780.0, 95.0, 5.0), YellowCol);
			AppendBox(HMark, FVector(0.0,    0.0, 5.0), FVector(95.0, 520.0, 5.0), YellowCol);
			CommitSection(PadMesh, 1, HMark,
				FGunsOnlyWorldBuilder::CreateColoredMaterial(PadActor, FLinearColor(0.95f, 0.78f, 0.14f)));
		}
		SpawnStaticAirbaseActor(World, FobFrame, FVector(2200.0, -2800.0, -20.0), FRotator(0.0f, -90.0f, 0.0f),
			TEXT("/Game/GunsOnly/Meshes/SM_Son_ControlTower.SM_Son_ControlTower"), TEXT("CampEmberTower"), OutSpawned);
		SpawnStaticAirbaseActor(World, FobFrame, FVector(-1800.0, -3400.0, -20.0), FRotator(0.0f, 90.0f, 0.0f),
			TEXT("/Game/GunsOnly/Meshes/SM_Son_Hangar.SM_Son_Hangar"), TEXT("CampEmberHangar"), OutSpawned);

		// Dense tropical palm clusters & understory plants across the Vietnam canyon jungle slopes
		TArray<FTransform> PalmTransforms;
		TArray<FTransform> PlantTransforms;
		PalmTransforms.Reserve(900);
		PlantTransforms.Reserve(1100);
		uint32 JungleRng = 0xC0B4A196u;
		for (int32 Attempt = 0; Attempt < 6000 && PalmTransforms.Num() < 850; ++Attempt)
		{
			const double WorldE = (HashUnit01(JungleRng) - 0.5) * 11000.0;
			const double WorldN = (HashUnit01(JungleRng) - 0.5) * 11000.0;
			const double DistFob = FMath::Sqrt(
				FMath::Square(WorldE - CobraState.fob_east_m) + FMath::Square(WorldN - CobraState.fob_north_m));
			const double DistBridge = FMath::Sqrt(
				FMath::Square(WorldE - CobraState.bridge_east_m) + FMath::Square(WorldN - CobraState.bridge_north_m));
			if (DistFob < 85.0 || DistBridge < 75.0)
			{
				continue;
			}
			double H = 0.0;
			if (!Bridge.SampleTerrainMeters(WorldE, WorldN, H) || H < 101.0 || H > 290.0)
			{
				continue;
			}
			const float Yaw = static_cast<float>(HashUnit01(JungleRng) * 360.0);
			const float Scale = static_cast<float>(0.85 + HashUnit01(JungleRng) * 0.70);
			PalmTransforms.Emplace(FRotator(0.0f, Yaw, 0.0f), Bridge.SimPosToUE(WorldE, H - 0.35, WorldN), FVector(Scale));
		}
		for (int32 Attempt = 0; Attempt < 5000 && PlantTransforms.Num() < 1000; ++Attempt)
		{
			const double WorldE = (HashUnit01(JungleRng) - 0.5) * 9000.0;
			const double WorldN = (HashUnit01(JungleRng) - 0.5) * 9000.0;
			const double DistFob = FMath::Sqrt(
				FMath::Square(WorldE - CobraState.fob_east_m) + FMath::Square(WorldN - CobraState.fob_north_m));
			if (DistFob < 70.0)
			{
				continue;
			}
			double H = 0.0;
			if (!Bridge.SampleTerrainMeters(WorldE, WorldN, H) || H < 100.5 || H > 250.0)
			{
				continue;
			}
			const float Yaw = static_cast<float>(HashUnit01(JungleRng) * 360.0);
			const float Scale = static_cast<float>(0.90 + HashUnit01(JungleRng) * 0.85);
			PlantTransforms.Emplace(FRotator(0.0f, Yaw, 0.0f), Bridge.SimPosToUE(WorldE, H - 0.15, WorldN), FVector(Scale));
		}
		SpawnInstancedFoliage(World, TEXT("/Game/GunsOnly/Meshes/SM_Cobra_PalmCluster.SM_Cobra_PalmCluster"),
			TEXT("CobraJunglePalms"), PalmTransforms, OutSpawned);
		SpawnInstancedFoliage(World, TEXT("/Game/GunsOnly/Meshes/SM_Cobra_PlantClump.SM_Cobra_PlantClump"),
			TEXT("CobraJunglePlants"), PlantTransforms, OutSpawned);
	}

	void BuildRunwayAndAirbase(
		UWorld* World,
		const FGunsOnlySimBridge& Bridge,
		const GunsSimRunway& Runway,
		bool bSpawnAirbaseStructures,
		FGunsOnlyPapiRig& OutPapiRig,
		TArray<TObjectPtr<AActor>>& OutSpawnedWorldActors)
	{
		if (World == nullptr || Runway.present == 0)
		{
			return;
		}
		const double LengthCm = Runway.length_m * 100.0;
		const double WidthCm = Runway.width_m * 100.0;
		const double AimAlongCm = Runway.touchdown_aim_along_m * 100.0;
		const float HeadingDeg = static_cast<float>(FMath::RadiansToDegrees(Runway.heading_rad));

		const FVector ThresholdUE = Bridge.SimPosToUE(
			Runway.threshold_east_m,
			Runway.threshold_up_m,
			Runway.threshold_north_m);
		const FTransform RunwayTransform(FRotator(0.0f, HeadingDeg, 0.0f), ThresholdUE);

		FActorSpawnParameters RunwaySpawnParams;
		RunwaySpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		AActor* RunwayActor = World->SpawnActor<AActor>(ThresholdUE, FRotator(0.0f, HeadingDeg, 0.0f), RunwaySpawnParams);
		if (RunwayActor != nullptr)
		{
			OutSpawnedWorldActors.Add(RunwayActor);
			UProceduralMeshComponent* RunwayMesh = NewObject<UProceduralMeshComponent>(RunwayActor, TEXT("RunwaySlab"));
			RunwayActor->SetRootComponent(RunwayMesh);
			RunwayMesh->RegisterComponent();
			RunwayActor->SetActorLocationAndRotation(ThresholdUE, FRotator(0.0f, HeadingDeg, 0.0f));

			FMeshBuffers SlabBuf;
			AppendBoxScaledUV(SlabBuf,
				FVector(LengthCm * 0.5, 0.0, -35.0),
				FVector(LengthCm * 0.5, WidthCm * 0.5, 35.0),
				FColor(46, 50, 56, 255));
			if (bSpawnAirbaseStructures)
			{
				AppendBoxScaledUV(SlabBuf,
					FVector(LengthCm * 0.5, 18000.0, -35.0),
					FVector(LengthCm * 0.5, 1200.0, 35.0),
					FColor(46, 50, 56, 255));
				AppendBoxScaledUV(SlabBuf, FVector(15000.0, 9000.0, -35.0), FVector(1200.0, 9000.0, 35.0), FColor(46, 50, 56, 255));
				AppendBoxScaledUV(SlabBuf, FVector(AimAlongCm, 9000.0, -35.0), FVector(1200.0, 9000.0, 35.0), FColor(46, 50, 56, 255));
				AppendBoxScaledUV(SlabBuf, FVector(LengthCm - 15000.0, 9000.0, -35.0), FVector(1200.0, 9000.0, 35.0), FColor(46, 50, 56, 255));
				AppendBoxScaledUV(SlabBuf, FVector(92000.0, 22500.0, -35.0), FVector(32000.0, 4200.0, 35.0), FColor(46, 50, 56, 255));
			}

			CommitSection(RunwayMesh, 0, SlabBuf,
				FGunsOnlyWorldBuilder::LoadGunsMaterial(TEXT("/Game/GunsOnly/Materials/M_Runway_Asphalt.M_Runway_Asphalt"),
					RunwayActor, FLinearColor(0.10f, 0.11f, 0.13f)));

			FMeshBuffers MarkBuf;
			const int32 StripeCount = 8;
			const double Span = WidthCm * 0.80;
			for (int32 i = 0; i < StripeCount; ++i)
			{
				const double OffsetY = -Span * 0.5 + (Span / (StripeCount - 1)) * i;
				AppendBox(MarkBuf, FVector(2200.0, OffsetY, 6.0), FVector(1600.0, 95.0, 6.0), FColor(238, 240, 236, 255));
			}
			for (double Along = 8000.0; Along < LengthCm - 6000.0; Along += 6000.0)
			{
				AppendBox(MarkBuf, FVector(Along, 0.0, 6.0), FVector(1800.0, 48.0, 6.0), FColor(238, 240, 236, 255));
			}
			AppendBox(MarkBuf, FVector(AimAlongCm, -WidthCm * 0.25, 6.0), FVector(1500.0, 150.0, 6.0), FColor(238, 240, 236, 255));
			AppendBox(MarkBuf, FVector(AimAlongCm,  WidthCm * 0.25, 6.0), FVector(1500.0, 150.0, 6.0), FColor(238, 240, 236, 255));

			CommitSection(RunwayMesh, 1, MarkBuf,
				FGunsOnlyWorldBuilder::LoadGunsMaterial(TEXT("/Game/GunsOnly/Materials/M_Runway_Markings.M_Runway_Markings"),
					RunwayActor, FLinearColor(0.92f, 0.92f, 0.90f)));

			UMaterialInterface* PapiBase = LoadObject<UMaterialInterface>(
				nullptr, TEXT("/Game/GunsOnly/Materials/M_Papi_Lamp.M_Papi_Lamp"));
			for (int32 PapiIdx = 0; PapiIdx < 4; ++PapiIdx)
			{
				FMeshBuffers PapiBuf;
				const double PapiY = -WidthCm * 0.5 - 900.0 - PapiIdx * 700.0;
				AppendBox(PapiBuf, FVector(AimAlongCm, PapiY, 120.0), FVector(140.0, 220.0, 110.0), FColor::White);
				UMaterialInstanceDynamic* PapiMat = PapiBase != nullptr
					? UMaterialInstanceDynamic::Create(PapiBase, RunwayActor)
					: Cast<UMaterialInstanceDynamic>(FGunsOnlyWorldBuilder::CreateColoredMaterial(RunwayActor, FLinearColor(1.0f, 0.96f, 0.85f)));
				CommitSection(RunwayMesh, 2 + PapiIdx, PapiBuf, PapiMat);
				OutPapiRig.LampMaterials.Add(PapiMat);
			}
			FGunsOnlyWorldBuilder::UpdatePapiRig(OutPapiRig, 3.0);

			FMeshBuffers EdgeLightBuf;
			for (double Along = 5000.0; Along <= LengthCm - 5000.0; Along += 15000.0)
			{
				AppendBox(EdgeLightBuf, FVector(Along, -WidthCm * 0.5 - 120.0, 22.0), FVector(55.0, 55.0, 32.0), FColor::White);
				AppendBox(EdgeLightBuf, FVector(Along,  WidthCm * 0.5 + 120.0, 22.0), FVector(55.0, 55.0, 32.0), FColor::White);
			}
			UMaterialInterface* EdgeLightBase = PapiBase != nullptr ? PapiBase : FGunsOnlyWorldBuilder::CreateColoredMaterial(RunwayActor, FLinearColor(1.2f, 1.0f, 0.72f));
			UMaterialInstanceDynamic* EdgeLightDyn = UMaterialInstanceDynamic::Create(EdgeLightBase, RunwayActor);
			if (EdgeLightDyn != nullptr)
			{
				EdgeLightDyn->SetVectorParameterValue(TEXT("Color"), FLinearColor(1.0f, 0.88f, 0.62f));
			}
			CommitSection(RunwayMesh, 6, EdgeLightBuf, EdgeLightDyn);
		}

		if (bSpawnAirbaseStructures)
		{
			SpawnStaticAirbaseActor(World, RunwayTransform, FVector(88000.0, 29500.0, -40.0), FRotator(0.0f, -90.0f, 0.0f),
				TEXT("/Game/GunsOnly/Meshes/SM_Son_ControlTower.SM_Son_ControlTower"), TEXT("SonControlTower"), OutSpawnedWorldActors);
			for (int32 h = 0; h < 4; ++h)
			{
				const double HangarAlong = 64000.0 + h * 15000.0;
				SpawnStaticAirbaseActor(World, RunwayTransform, FVector(HangarAlong, 29500.0, -40.0), FRotator(0.0f, 90.0f, 0.0f),
					TEXT("/Game/GunsOnly/Meshes/SM_Son_Hangar.SM_Son_Hangar"), TEXT("SonHAS"), OutSpawnedWorldActors);
			}
			SpawnStaticAirbaseActor(World, RunwayTransform, FVector(152000.0, 33000.0, -40.0), FRotator::ZeroRotator,
				TEXT("/Game/GunsOnly/Meshes/SM_Son_RadarDome.SM_Son_RadarDome"), TEXT("SonRadarDome"), OutSpawnedWorldActors);
		}
	}

	void BuildWaterSheetActor(
		UWorld* World,
		double HalfSpanCm,
		double WaterZCm,
		const TCHAR* MatPath,
		const FLinearColor& FallbackCol,
		const TCHAR* Name,
		TArray<TObjectPtr<AActor>>& OutSpawned)
	{
		FActorSpawnParameters Params;
		Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		if (AActor* WaterActor = World->SpawnActor<AActor>(FVector(0.0, 0.0, WaterZCm), FRotator::ZeroRotator, Params))
		{
			UProceduralMeshComponent* Mesh = NewObject<UProceduralMeshComponent>(WaterActor, Name);
			WaterActor->SetRootComponent(Mesh);
			Mesh->RegisterComponent();
			WaterActor->SetActorLocation(FVector(0.0, 0.0, WaterZCm));
			OutSpawned.Add(WaterActor);

			constexpr int32 GridN = 48;
			const double Step = (2.0 * HalfSpanCm) / GridN;
			FMeshBuffers Buf;
			for (int32 j = 0; j < GridN; ++j)
			{
				const double X0 = -HalfSpanCm + j * Step;
				const double X1 = X0 + Step;
				for (int32 i = 0; i < GridN; ++i)
				{
					const double Y0 = -HalfSpanCm + i * Step;
					const double Y1 = Y0 + Step;
					const int32 Base = Buf.Verts.Num();
					Buf.Verts.Add(FVector(X0, Y0, 0.0));
					Buf.Verts.Add(FVector(X1, Y0, 0.0));
					Buf.Verts.Add(FVector(X1, Y1, 0.0));
					Buf.Verts.Add(FVector(X0, Y1, 0.0));
					for (int32 k = 0; k < 4; ++k)
					{
						Buf.Normals.Add(FVector::UpVector);
						Buf.Colors.Add(FColor::White);
						Buf.Tangents.Add(FProcMeshTangent());
					}
					Buf.UVs.Add(FVector2D(0.0f, 0.0f));
					Buf.UVs.Add(FVector2D(1.0f, 0.0f));
					Buf.UVs.Add(FVector2D(1.0f, 1.0f));
					Buf.UVs.Add(FVector2D(0.0f, 1.0f));
					Buf.Tris.Add(Base + 0); Buf.Tris.Add(Base + 2); Buf.Tris.Add(Base + 1);
					Buf.Tris.Add(Base + 0); Buf.Tris.Add(Base + 3); Buf.Tris.Add(Base + 2);
				}
			}
			CommitSection(Mesh, 0, Buf, FGunsOnlyWorldBuilder::LoadGunsMaterial(MatPath, WaterActor, FallbackCol));
		}
	}

	void BuildMaritimeCarrierEnvironment(
		UWorld* World,
		const FGunsOnlySimBridge& Bridge,
		const GunsSimCarrierState& CarrierState,
		FGunsOnlyAtmosphereRig& InOutAtmoRig,
		TArray<TObjectPtr<AActor>>& OutSpawned)
	{
		// 180 km x 180 km Pacific Ocean surface at Sea Level Z = 0
		BuildWaterSheetActor(World, 9000000.0, 0.0,
			TEXT("/Game/GunsOnly/Materials/M_Ocean_Water.M_Ocean_Water"),
			FLinearColor(0.015f, 0.055f, 0.11f), TEXT("PacificOcean"), OutSpawned);

		if (CarrierState.present != 0)
		{
			UStaticMesh* CarrierMesh = FGunsOnlyWorldBuilder::LoadGunsStaticMesh(
				TEXT("/Game/GunsOnly/Meshes/SM_Carrier_Hull.SM_Carrier_Hull"));
			const FVector CarrierPos = Bridge.SimPosToUE(
				CarrierState.pos_east_m, CarrierState.pos_up_m, CarrierState.pos_north_m);
			const float CarrierYaw = static_cast<float>(FMath::RadiansToDegrees(CarrierState.heading_rad));
			FActorSpawnParameters Params;
			Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
			if (AActor* Ship = World->SpawnActor<AActor>(CarrierPos, FRotator(0.0f, CarrierYaw, 0.0f), Params))
			{
				if (CarrierMesh != nullptr)
				{
					UStaticMeshComponent* Comp = NewObject<UStaticMeshComponent>(Ship, TEXT("CarrierHullMesh"));
					Comp->SetStaticMesh(CarrierMesh);
					Comp->SetCollisionEnabled(ECollisionEnabled::NoCollision);
					Ship->SetRootComponent(Comp);
					Comp->RegisterComponent();
				}
				else
				{
					UProceduralMeshComponent* Fallback = NewObject<UProceduralMeshComponent>(Ship, TEXT("CarrierFallback"));
					Ship->SetRootComponent(Fallback);
					Fallback->RegisterComponent();
					FGunsOnlyWorldBuilder::BuildBoxProceduralMesh(Fallback, Ship, FVector(16000.0, 3800.0, 1000.0), FLinearColor(0.18f, 0.20f, 0.22f));
				}
				Ship->SetActorLocationAndRotation(CarrierPos, FRotator(0.0f, CarrierYaw, 0.0f));
				InOutAtmoRig.CarrierActor = Ship;
				OutSpawned.Add(Ship);
			}
		}
	}

	void BuildOkanaganEnvironment(
		UWorld* World,
		const FGunsOnlySimBridge& Bridge,
		const GunsSimRunway& Runway,
		const GunsSimOkanaganState& OkanaganState,
		FGunsOnlyPapiRig& OutPapiRig,
		TArray<TObjectPtr<AActor>>& OutSpawned)
	{
		const double OriginE = Bridge.GetOriginEastMeters();
		const double OriginN = Bridge.GetOriginNorthMeters();
		constexpr int32 DimN = 201;
		constexpr double StepM = 280.0;
		const double HalfSpanM = 0.5 * (DimN - 1) * StepM; // 28,000 m (56x56 km)
		const double MinE = OriginE - HalfSpanM;
		const double MinN = OriginN - HalfSpanM;

		TArray<float> HeightsM;
		if (Bridge.SampleTerrainGrid(MinE, MinN, StepM, DimN, DimN, HeightsM) != DimN * DimN)
		{
			HeightsM.Init(static_cast<float>(OkanaganState.water_level_m + 35.0), DimN * DimN);
		}

		// Grade Kelowna airport apron level
		if (Runway.present != 0)
		{
			const double FwdE = FMath::Sin(Runway.heading_rad);
			const double FwdN = FMath::Cos(Runway.heading_rad);
			const double RightE = FMath::Cos(Runway.heading_rad);
			const double RightN = -FMath::Sin(Runway.heading_rad);
			const double PadH = Runway.threshold_up_m - 0.55;
			for (int32 j = 0; j < DimN; ++j)
			{
				const double NorthM = MinN + j * StepM;
				for (int32 i = 0; i < DimN; ++i)
				{
					const double EastM = MinE + i * StepM;
					const double RelE = EastM - Runway.threshold_east_m;
					const double RelN = NorthM - Runway.threshold_north_m;
					const double AlongM = RelE * FwdE + RelN * FwdN;
					const double CrossM = RelE * RightE + RelN * RightN;
					const double dA = AlongM < -200.0 ? (-200.0 - AlongM) : (AlongM > Runway.length_m + 200.0 ? AlongM - (Runway.length_m + 200.0) : 0.0);
					const double dC = FMath::Max(0.0, FMath::Abs(CrossM) - 220.0);
					const double D = FMath::Sqrt(dA * dA + dC * dC);
					if (D < 480.0)
					{
						const int32 Idx = j * DimN + i;
						HeightsM[Idx] = static_cast<float>(FMath::Lerp(PadH, static_cast<double>(HeightsM[Idx]), SmoothStep01(D / 480.0)));
					}
				}
			}
		}

		// Sink lakebed vertices cleanly below the water sheet so OkanaganTerrain never z-fights with OkanaganLake.
		const double LakeSurfaceM = OkanaganState.water_level_m > 10.0 ? OkanaganState.water_level_m : 342.0;
		for (int32 Idx = 0; Idx < HeightsM.Num(); ++Idx)
		{
			if (HeightsM[Idx] <= static_cast<float>(LakeSurfaceM + 0.15))
			{
				HeightsM[Idx] = static_cast<float>(LakeSurfaceM - 6.0);
			}
		}

		UMaterialInterface* OkMat = LoadObject<UMaterialInterface>(
			nullptr, TEXT("/Game/GunsOnly/Materials/M_Okanagan_Terrain.M_Okanagan_Terrain"));
		FMeshBuffers TerrainBuf;
		TArray<FVector> Positions;
		TArray<FVector> Normals;
		Positions.SetNumUninitialized(DimN * DimN);
		Normals.SetNumUninitialized(DimN * DimN);
		for (int32 j = 0; j < DimN; ++j)
		{
			const double NorthM = MinN + j * StepM;
			for (int32 i = 0; i < DimN; ++i)
			{
				const double EastM = MinE + i * StepM;
				const int32 Idx = j * DimN + i;
				Positions[Idx] = FVector((NorthM - OriginN) * 100.0, (EastM - OriginE) * 100.0, static_cast<double>(HeightsM[Idx]) * 100.0);
			}
		}
		for (int32 j = 0; j < DimN; ++j)
		{
			const int32 Jm = FMath::Max(0, j - 1), Jp = FMath::Min(DimN - 1, j + 1);
			const double SpanN = FMath::Max(1.0, static_cast<double>(Jp - Jm) * StepM);
			for (int32 i = 0; i < DimN; ++i)
			{
				const int32 Im = FMath::Max(0, i - 1), Ip = FMath::Min(DimN - 1, i + 1);
				const double SpanE = FMath::Max(1.0, static_cast<double>(Ip - Im) * StepM);
				const double dHdN = (HeightsM[Jp * DimN + i] - HeightsM[Jm * DimN + i]) / SpanN;
				const double dHdE = (HeightsM[j * DimN + Ip] - HeightsM[j * DimN + Im]) / SpanE;
				Normals[j * DimN + i] = FVector(-dHdN, -dHdE, 1.0).GetSafeNormal();
			}
		}
		for (int32 j = 0; j < DimN - 1; ++j)
		{
			for (int32 i = 0; i < DimN - 1; ++i)
			{
				const int32 Corners[4] = { j * DimN + i, j * DimN + i + 1, (j + 1) * DimN + i + 1, (j + 1) * DimN + i };
				const FVector2D UVs[4] = { {0,0}, {1,0}, {1,1}, {0,1} };
				const int32 Base = TerrainBuf.Verts.Num();
				for (int32 k = 0; k < 4; ++k)
				{
					TerrainBuf.Verts.Add(Positions[Corners[k]]);
					TerrainBuf.Normals.Add(Normals[Corners[k]]);
					TerrainBuf.UVs.Add(UVs[k]);
					TerrainBuf.Colors.Add(FColor::White);
					TerrainBuf.Tangents.Add(FProcMeshTangent());
				}
				TerrainBuf.Tris.Add(Base + 0); TerrainBuf.Tris.Add(Base + 1); TerrainBuf.Tris.Add(Base + 3);
				TerrainBuf.Tris.Add(Base + 1); TerrainBuf.Tris.Add(Base + 2); TerrainBuf.Tris.Add(Base + 3);
			}
		}

		FActorSpawnParameters SpawnParams;
		SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		if (AActor* OkActor = World->SpawnActor<AActor>(FVector::ZeroVector, FRotator::ZeroRotator, SpawnParams))
		{
			UProceduralMeshComponent* OkMesh = NewObject<UProceduralMeshComponent>(OkActor, TEXT("OkanaganTerrain"));
			OkActor->SetRootComponent(OkMesh);
			OkMesh->RegisterComponent();
			OutSpawned.Add(OkActor);
			CommitSection(OkMesh, 0, TerrainBuf, OkMat != nullptr
				? OkMat : FGunsOnlyWorldBuilder::CreateColoredMaterial(OkActor, FLinearColor(0.14f, 0.24f, 0.13f)));
		}

		// Reflective Okanagan Lake sheet above sunken lakebed + Kelowna airport strip
		const double LakeWaterM = OkanaganState.water_level_m > 10.0 ? OkanaganState.water_level_m : 342.0;
		const double LakeCm = (LakeWaterM + 0.35) * 100.0;
		BuildWaterSheetActor(World, 2600000.0, LakeCm,
			TEXT("/Game/GunsOnly/Materials/M_Okanagan_Lake.M_Okanagan_Lake"),
			FLinearColor(0.02f, 0.09f, 0.14f), TEXT("OkanaganLake"), OutSpawned);

		BuildRunwayAndAirbase(World, Bridge, Runway, false, OutPapiRig, OutSpawned);

		// BC Pine Conifer forest scattered across Okanagan valley slopes
		TArray<FTransform> PineTransforms;
		PineTransforms.Reserve(950);
		uint32 PineRng = 0x0CA4A9A4u;
		const double WaterH = OkanaganState.water_level_m > 10.0 ? OkanaganState.water_level_m : 342.0;
		for (int32 Attempt = 0; Attempt < 6000 && PineTransforms.Num() < 900; ++Attempt)
		{
			const double WorldE = OriginE + (HashUnit01(PineRng) - 0.5) * 26000.0;
			const double WorldN = OriginN + (HashUnit01(PineRng) - 0.5) * 26000.0;
			double H = 0.0;
			if (!Bridge.SampleTerrainMeters(WorldE, WorldN, H) || H < WaterH + 7.5 || H > 1400.0)
			{
				continue;
			}
			if (Runway.present != 0)
			{
				const double DistRwy = FMath::Sqrt(
					FMath::Square(WorldE - Runway.threshold_east_m) + FMath::Square(WorldN - Runway.threshold_north_m));
				if (DistRwy < 3200.0 && H < Runway.threshold_up_m + 40.0)
				{
					continue;
				}
			}
			const float Yaw = static_cast<float>(HashUnit01(PineRng) * 360.0);
			const float Scale = static_cast<float>(0.85 + HashUnit01(PineRng) * 0.75);
			PineTransforms.Emplace(FRotator(0.0f, Yaw, 0.0f), Bridge.SimPosToUE(WorldE, H - 0.4, WorldN), FVector(Scale));
		}
		SpawnInstancedFoliage(World, TEXT("/Game/GunsOnly/Meshes/SM_Pine_Tree.SM_Pine_Tree"),
			TEXT("OkanaganPines"), PineTransforms, OutSpawned);
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

UMaterialInterface* FGunsOnlyWorldBuilder::LoadGunsMaterial(
	const TCHAR* AssetPath,
	UObject* Outer,
	const FLinearColor& FallbackColor)
{
	if (UMaterialInterface* Loaded = LoadObject<UMaterialInterface>(nullptr, AssetPath))
	{
		return Loaded;
	}
	return CreateColoredMaterial(Outer, FallbackColor);
}

UStaticMesh* FGunsOnlyWorldBuilder::LoadGunsStaticMesh(const TCHAR* AssetPath)
{
	return LoadObject<UStaticMesh>(nullptr, AssetPath);
}

void FGunsOnlyWorldBuilder::ClearSpawnedWorldActors(TArray<TObjectPtr<AActor>>& Actors)
{
	for (AActor* Actor : Actors)
	{
		if (Actor != nullptr)
		{
			Actor->Destroy();
		}
	}
	Actors.Reset();
}

void FGunsOnlyWorldBuilder::EnsureEnvironmentAndRunway(
	UWorld* World,
	int32 BeatIndex,
	const FGunsOnlySimBridge& Bridge,
	const GunsSimRunway& Runway,
	const GunsSimCobraState& CobraState,
	const GunsSimCarrierState& CarrierState,
	const GunsSimOkanaganState& OkanaganState,
	FGunsOnlyPapiRig& OutPapiRig,
	FGunsOnlyAtmosphereRig& InOutAtmoRig,
	TArray<TObjectPtr<AActor>>& OutSpawnedWorldActors)
{
	ClearSpawnedWorldActors(OutSpawnedWorldActors);
	InOutAtmoRig.CarrierActor = nullptr;
	OutPapiRig.LampMaterials.Reset();
	OutPapiRig.LastWhiteCount = -1;
	if (World == nullptr)
	{
		return;
	}

	auto FindFirstActor = [World](auto* DummyType) -> decltype(DummyType)
	{
		using ActorT = typename TRemovePointer<decltype(DummyType)>::Type;
		for (TActorIterator<ActorT> It(World); It; ++It)
		{
			return *It;
		}
		return nullptr;
	};

	if (!InOutAtmoRig.SkyAtmosphere.IsValid())
	{
		FActorSpawnParameters Params;
		Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

		ADirectionalLight* Sun = FindFirstActor(static_cast<ADirectionalLight*>(nullptr));
		if (Sun == nullptr)
		{
			Sun = World->SpawnActor<ADirectionalLight>(FVector::ZeroVector, FRotator(-22.0f, 132.0f, 0.0f), Params);
		}
		if (Sun != nullptr)
		{
			InOutAtmoRig.SunLight = Sun;
			if (UDirectionalLightComponent* LightComp = Cast<UDirectionalLightComponent>(Sun->GetLightComponent()))
			{
				LightComp->SetMobility(EComponentMobility::Movable);
				LightComp->SetAtmosphereSunLight(true);
				LightComp->SetIntensity(10.5f);
				LightComp->SetLightColor(FLinearColor(1.0f, 0.95f, 0.86f));
			}
		}

		ASkyAtmosphere* Atmo = FindFirstActor(static_cast<ASkyAtmosphere*>(nullptr));
		if (Atmo == nullptr)
		{
			Atmo = World->SpawnActor<ASkyAtmosphere>(FVector::ZeroVector, FRotator::ZeroRotator, Params);
		}
		InOutAtmoRig.SkyAtmosphere = Atmo;
		if (Atmo != nullptr)
		{
			if (USkyAtmosphereComponent* AtmoComp = Atmo->GetComponent())
			{
				AtmoComp->SetGroundAlbedo(FColor(45, 72, 102));
			}
		}

		ASkyLight* Sky = FindFirstActor(static_cast<ASkyLight*>(nullptr));
		if (Sky == nullptr)
		{
			Sky = World->SpawnActor<ASkyLight>(FVector::ZeroVector, FRotator::ZeroRotator, Params);
		}
		if (Sky != nullptr)
		{
			InOutAtmoRig.SkyLight = Sky;
			if (USkyLightComponent* SkyComp = Sky->GetLightComponent())
			{
				SkyComp->SetMobility(EComponentMobility::Movable);
				SkyComp->bRealTimeCapture = true;
			}
		}

		AVolumetricCloud* Clouds = FindFirstActor(static_cast<AVolumetricCloud*>(nullptr));
		if (Clouds == nullptr)
		{
			Clouds = World->SpawnActor<AVolumetricCloud>(FVector::ZeroVector, FRotator::ZeroRotator, Params);
		}
		if (Clouds != nullptr)
		{
			InOutAtmoRig.VolumetricCloud = Clouds;
			if (UVolumetricCloudComponent* CloudComp = Clouds->FindComponentByClass<UVolumetricCloudComponent>())
			{
				CloudComp->SetLayerBottomAltitude(1.6f);
				CloudComp->SetLayerHeight(2.6f);
				CloudComp->SetTracingStartMaxDistance(350.0f);
				CloudComp->SetGroundAlbedo(FColor(76, 106, 140));
				UMaterialInterface* CloudMat = LoadObject<UMaterialInterface>(
					nullptr, TEXT("/Game/GunsOnly/Materials/M_Volumetric_Clouds.M_Volumetric_Clouds"));
				if (CloudMat != nullptr)
				{
					UMaterialInstanceDynamic* CloudMID = UMaterialInstanceDynamic::Create(CloudMat, Clouds);
					CloudComp->SetMaterial(CloudMID);
					InOutAtmoRig.CloudMID = CloudMID;
				}
			}
		}

		AExponentialHeightFog* Fog = FindFirstActor(static_cast<AExponentialHeightFog*>(nullptr));
		if (Fog == nullptr)
		{
			Fog = World->SpawnActor<AExponentialHeightFog>(FVector::ZeroVector, FRotator::ZeroRotator, Params);
		}
		if (Fog != nullptr)
		{
			InOutAtmoRig.HeightFog = Fog;
			if (UExponentialHeightFogComponent* FogComp = Fog->GetComponent())
			{
				FogComp->SetFogDensity(0.00022f);
				FogComp->SetFogHeightFalloff(0.08f);
				FogComp->SetFogMaxOpacity(0.55f);
				FogComp->SetFogInscatteringColor(FLinearColor(0.58f, 0.74f, 0.92f));
			}
		}

		APostProcessVolume* PPV = FindFirstActor(static_cast<APostProcessVolume*>(nullptr));
		if (PPV == nullptr)
		{
			PPV = World->SpawnActor<APostProcessVolume>(FVector::ZeroVector, FRotator::ZeroRotator, Params);
		}
		if (PPV != nullptr)
		{
			InOutAtmoRig.PostProcessVolume = PPV;
			PPV->bUnbound = true;
			PPV->Settings.bOverride_BloomIntensity = true;
			PPV->Settings.BloomIntensity = 0.45f;
			PPV->Settings.bOverride_BloomThreshold = true;
			PPV->Settings.BloomThreshold = 1.15f;
			PPV->Settings.bOverride_AutoExposureMinBrightness = true;
			PPV->Settings.AutoExposureMinBrightness = 0.35f;
			PPV->Settings.bOverride_AutoExposureMaxBrightness = true;
			PPV->Settings.AutoExposureMaxBrightness = 2.0f;
			PPV->Settings.bOverride_AutoExposureBias = true;
			PPV->Settings.AutoExposureBias = 0.2f;
		}
	}

	if (CobraState.active != 0 || BeatIndex == GUNS_SIM_BEAT_COBRA_CANYON)
	{
		BuildCobraEnvironment(World, Bridge, CobraState, OutSpawnedWorldActors);
		return;
	}
	if (OkanaganState.active != 0 || BeatIndex == GUNS_SIM_BEAT_OKANAGAN_FIREBOSS)
	{
		BuildOkanaganEnvironment(World, Bridge, Runway, OkanaganState, OutPapiRig, OutSpawnedWorldActors);
		return;
	}
	if (BeatIndex == GUNS_SIM_BEAT_TOPGUN_F14 || (CarrierState.present != 0 && Runway.present == 0))
	{
		BuildMaritimeCarrierEnvironment(World, Bridge, CarrierState, InOutAtmoRig, OutSpawnedWorldActors);
		return;
	}

	BuildUkraineTerrainActor(World, Bridge, Runway, OutSpawnedWorldActors);
	BuildRunwayAndAirbase(World, Bridge, Runway, BeatIndex != GUNS_SIM_BEAT_RAPIER_INTERCEPT, OutPapiRig, OutSpawnedWorldActors);
}

void FGunsOnlyWorldBuilder::ApplyTheatreWeather(
	FGunsOnlyAtmosphereRig& Rig,
	int32 BeatIndex,
	const GunsSimWeatherState& Weather,
	const GunsSimFrame& Frame,
	double SimTimeSec,
	bool bTheatreChanged)
{
	if (bTheatreChanged || Rig.LastBeatIndex != BeatIndex)
	{
		Rig.LastBeatIndex = BeatIndex;
		FRotator SunRot(-38.0f, 135.0f, 0.0f);
		float SunIntensity = 11.5f;
		FLinearColor SunColor(1.0f, 0.98f, 0.95f);
		if (BeatIndex == GUNS_SIM_BEAT_COBRA_CANYON)
		{
			SunRot = FRotator(-40.0f, 148.0f, 0.0f);
			SunIntensity = 11.5f;
			SunColor = FLinearColor(1.0f, 0.95f, 0.86f);
			Rig.BaselineFogDensity = 0.00045f;
			Rig.BaselineFogColor = FLinearColor(0.68f, 0.74f, 0.68f);
		}
		else if (BeatIndex == GUNS_SIM_BEAT_TOPGUN_F14)
		{
			SunRot = FRotator(-38.0f, 52.0f, 0.0f);
			SunIntensity = 12.0f;
			SunColor = FLinearColor(1.0f, 0.98f, 0.94f);
			Rig.BaselineFogDensity = 0.00018f;
			Rig.BaselineFogColor = FLinearColor(0.54f, 0.74f, 0.96f);
		}
		else if (BeatIndex == GUNS_SIM_BEAT_RAPIER_INTERCEPT)
		{
			SunRot = FRotator(-36.0f, 120.0f, 0.0f);
			SunIntensity = 13.0f;
			SunColor = FLinearColor(0.97f, 0.99f, 1.0f);
			Rig.BaselineFogDensity = 0.00010f;
			Rig.BaselineFogColor = FLinearColor(0.46f, 0.66f, 0.96f);
		}
		else if (BeatIndex == GUNS_SIM_BEAT_OKANAGAN_FIREBOSS)
		{
			SunRot = FRotator(-40.0f, 45.0f, 0.0f);
			SunIntensity = 11.5f;
			SunColor = FLinearColor(1.0f, 0.97f, 0.91f);
			Rig.BaselineFogDensity = 0.00024f;
			Rig.BaselineFogColor = FLinearColor(0.56f, 0.74f, 0.92f);
		}
		else
		{
			Rig.BaselineFogDensity = 0.00022f;
			Rig.BaselineFogColor = FLinearColor(0.58f, 0.74f, 0.92f);
		}

		if (ADirectionalLight* Sun = Rig.SunLight.Get())
		{
			Sun->SetActorRotation(SunRot);
			if (UDirectionalLightComponent* LC = Cast<UDirectionalLightComponent>(Sun->GetLightComponent()))
			{
				LC->SetIntensity(SunIntensity);
				LC->SetLightColor(SunColor);
			}
		}
		if (ASkyLight* Sky = Rig.SkyLight.Get())
		{
			if (USkyLightComponent* SC = Sky->GetLightComponent())
			{
				SC->RecaptureSky();
			}
		}
	}

	double Base1M = (Weather.layer_count >= 1 && Weather.layer_top_alt_m[0] > Weather.layer_base_alt_m[0])
		? Weather.layer_base_alt_m[0]
		: (BeatIndex == GUNS_SIM_BEAT_COBRA_CANYON ? 1250.0 : (BeatIndex == GUNS_SIM_BEAT_OKANAGAN_FIREBOSS ? 2100.0 : 1650.0));
	double Top1M = (Weather.layer_count >= 1 && Weather.layer_top_alt_m[0] > Base1M + 50.0)
		? Weather.layer_top_alt_m[0] : (Base1M + 2200.0);
	double Cov1 = (Weather.layer_count >= 1 && Weather.layer_coverage01[0] > 0.02)
		? FMath::Clamp(Weather.layer_coverage01[0], 0.15, 0.82)
		: (BeatIndex == GUNS_SIM_BEAT_RAPIER_INTERCEPT ? 0.42 : 0.50);
	double Scale1M = (Weather.layer_count >= 1 && Weather.layer_scale_m[0] > 200.0) ? Weather.layer_scale_m[0] : 4600.0;

	double Base2M = (Weather.layer_count >= 2 && Weather.layer_top_alt_m[1] > Weather.layer_base_alt_m[1])
		? Weather.layer_base_alt_m[1] : 6200.0;
	double Top2M = (Weather.layer_count >= 2 && Weather.layer_top_alt_m[1] > Base2M + 50.0)
		? Weather.layer_top_alt_m[1] : (Base2M + 1600.0);
	double Cov2 = (Weather.layer_count >= 2) ? FMath::Clamp(Weather.layer_coverage01[1], 0.0, 0.55) : 0.24;
	double Scale2M = (Weather.layer_count >= 2 && Weather.layer_scale_m[1] > 200.0) ? Weather.layer_scale_m[1] : 8200.0;

	if (BeatIndex == GUNS_SIM_BEAT_TOPGUN_F14)
	{
		Top1M = FMath::Min(Top1M, Base1M + 400.0);
		Cov1 = FMath::Min(Cov1, 0.22);
		if (Weather.layer_count < 2)
		{
			Base2M = 6400.0;
			Top2M = 7800.0;
			Cov2 = 0.24;
			Scale2M = 8200.0;
		}
	}

	if (AVolumetricCloud* Clouds = Rig.VolumetricCloud.Get())
	{
		if (UVolumetricCloudComponent* CC = Clouds->FindComponentByClass<UVolumetricCloudComponent>())
		{
			const double MinKm = FMath::Max(0.4, Base1M * 0.001);
			const double MaxKm = FMath::Max(MinKm + 2.5, (Cov2 > 0.05 ? FMath::Max(Top1M, Top2M) : Top1M) * 0.001);
			const float MinKmF = static_cast<float>(MinKm);
			const float HeightKmF = static_cast<float>(MaxKm - MinKm);
			if (bTheatreChanged || FMath::Abs(MinKmF - Rig.LastCloudMinKm) > 0.05f || FMath::Abs(HeightKmF - Rig.LastCloudHeightKm) > 0.05f)
			{
				CC->SetLayerBottomAltitude(MinKmF);
				CC->SetLayerHeight(HeightKmF);
				Rig.LastCloudMinKm = MinKmF;
				Rig.LastCloudHeightKm = HeightKmF;
			}
		}
	}
	if (UMaterialInstanceDynamic* MID = Rig.CloudMID.Get())
	{
		MID->SetScalarParameterValue(TEXT("Coverage"), static_cast<float>(Cov1));
		MID->SetScalarParameterValue(TEXT("BaseAltCm"), static_cast<float>(Base1M * 100.0));
		MID->SetScalarParameterValue(TEXT("ThicknessCm"), static_cast<float>((Top1M - Base1M) * 100.0));
		MID->SetScalarParameterValue(TEXT("MacroScaleCm"), static_cast<float>(Scale1M * 100.0));
		MID->SetScalarParameterValue(TEXT("Coverage2"), static_cast<float>(Cov2));
		MID->SetScalarParameterValue(TEXT("BaseAlt2Cm"), static_cast<float>(Base2M * 100.0));
		MID->SetScalarParameterValue(TEXT("Thickness2Cm"), static_cast<float>((Top2M - Base2M) * 100.0));
		MID->SetScalarParameterValue(TEXT("MacroScale2Cm"), static_cast<float>(Scale2M * 100.0));
		MID->SetScalarParameterValue(TEXT("DensityScale"), BeatIndex == GUNS_SIM_BEAT_COBRA_CANYON ? 0.018f : 0.022f);
		const double AdvN = (Weather.layer_count >= 1 ? Weather.layer_adv_north_mps[0] : 8.0) * SimTimeSec * 100.0;
		const double AdvE = (Weather.layer_count >= 1 ? Weather.layer_adv_east_mps[0] : 12.0) * SimTimeSec * 100.0;
		MID->SetVectorParameterValue(TEXT("WindOffsetCm"), FLinearColor(static_cast<float>(AdvN), static_cast<float>(AdvE), 0.0f, 0.0f));
	}
	if (AExponentialHeightFog* Fog = Rig.HeightFog.Get())
	{
		if (UExponentialHeightFogComponent* FC = Fog->GetComponent())
		{
			const float CloudDimBoost = FMath::Clamp(
				static_cast<float>(Weather.local_cloud_fraction01 * 0.0025 + Weather.local_cloud_extinction_per_m * 0.12),
				0.0f, 0.0045f);
			const float NewDensity = Rig.BaselineFogDensity + CloudDimBoost;
			if (bTheatreChanged || FMath::Abs(NewDensity - Rig.LastFogDensity) > 1e-4f)
			{
				FC->SetFogDensity(NewDensity);
				const FLinearColor CloudWhite(0.84f, 0.88f, 0.93f);
				const float Blend = FMath::Clamp(static_cast<float>(Weather.local_cloud_fraction01), 0.0f, 1.0f);
				FC->SetFogInscatteringColor(FMath::Lerp(Rig.BaselineFogColor, CloudWhite, Blend * 0.75f));
				Rig.LastFogDensity = NewDensity;
			}
		}
	}
	(void)Frame;
}

void FGunsOnlyWorldBuilder::UpdatePapiRig(FGunsOnlyPapiRig& PapiRig, double GlideslopeDeg)
{
	if (PapiRig.LampMaterials.Num() != 4)
	{
		return;
	}
	int32 WhiteCount = 2;
	if (GlideslopeDeg > 3.5) WhiteCount = 4;
	else if (GlideslopeDeg > 3.2) WhiteCount = 3;
	else if (GlideslopeDeg >= 2.8) WhiteCount = 2;
	else if (GlideslopeDeg >= 2.5) WhiteCount = 1;
	else WhiteCount = 0;

	if (WhiteCount == PapiRig.LastWhiteCount)
	{
		return;
	}
	PapiRig.LastWhiteCount = WhiteCount;

	const FLinearColor WhiteLamp(1.15f, 1.08f, 0.92f);
	const FLinearColor RedLamp(1.40f, 0.14f, 0.09f);
	for (int32 PapiIdx = 0; PapiIdx < 4; ++PapiIdx)
	{
		if (UMaterialInstanceDynamic* Mat = PapiRig.LampMaterials[PapiIdx])
		{
			// Outer lamps (idx 3 -> 0) light white as approach climbs above 3 deg
			const bool bWhite = PapiIdx >= (4 - WhiteCount);
			Mat->SetVectorParameterValue(TEXT("Color"), bWhite ? WhiteLamp : RedLamp);
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

	// Sculpted F-22A Raptor (~18.9 m long, ~13.56 m wingspan)
	FMeshBuffers Body;
	const FColor HullCol(205, 212, 220, 255);
	const TArray<FChineStation> Fuselage = {
		{  960.0,  0.0,   4.0,  4.0,  4.0 },
		{  820.0,  2.0,  46.0, 26.0, 24.0 },
		{  620.0,  4.0,  86.0, 48.0, 38.0 },
		{  360.0,  0.0, 142.0, 56.0, 48.0 },
		{  -40.0,  0.0, 152.0, 58.0, 50.0 },
		{ -520.0,  0.0, 146.0, 54.0, 46.0 },
		{ -850.0,  0.0, 128.0, 36.0, 34.0 }
	};
	AppendChinedFuselage(Body, Fuselage, 0.0, HullCol);

	for (const double Side : { -1.0, 1.0 })
	{
		// Caret stealth intake cheeks
		const TArray<FChineStation> Intake = {
			{  370.0, -6.0, 38.0, 24.0, 32.0 },
			{  140.0, -8.0, 46.0, 34.0, 38.0 },
			{ -450.0, -6.0, 42.0, 32.0, 36.0 }
		};
		AppendChinedFuselage(Body, Intake, Side * 112.0, HullCol);

		// Diamond cropped-delta wing
		AppendSweptPlate(
			Body,
			FVector(240.0, Side * 135.0, -4.0),
			FVector(-430.0, Side * 135.0, -4.0),
			FVector(-230.0, Side * 678.0, -8.0),
			FVector(-415.0, Side * 678.0, -8.0),
			10.0, HullCol);

		// Horizontal stabilators
		AppendSweptPlate(
			Body,
			FVector(-515.0, Side * 130.0, -2.0),
			FVector(-835.0, Side * 130.0, -2.0),
			FVector(-695.0, Side * 435.0, -4.0),
			FVector(-840.0, Side * 435.0, -4.0),
			8.0, HullCol);

		// 28-deg outward canted vertical stabilizers
		constexpr double CantSin = 0.46947156;
		constexpr double CantCos = 0.88294759;
		constexpr double FinHeight = 250.0;
		const double TopY = Side * (120.0 + FinHeight * CantSin);
		const double TopZ = 34.0 + FinHeight * CantCos;
		AppendSweptPlate(
			Body,
			FVector(-475.0, Side * 120.0, 34.0),
			FVector(-775.0, Side * 120.0, 30.0),
			FVector(-640.0, TopY, TopZ),
			FVector(-815.0, TopY, TopZ - 6.0),
			9.0, HullCol);

		// Twin thrust-vectoring nozzle shrouds
		AppendBox(Body, FVector(-875.0, Side * 64.0, 0.0), FVector(55.0, 42.0, 28.0), FColor(62, 66, 74, 255));
	}

	CommitSection(Mesh, 0, Body, CreateColoredMaterial(MaterialOuter, BodyTint));

	// Golden stealth bubble canopy (Section 1)
	FMeshBuffers Canopy;
	const TArray<FChineStation> Dome = {
		{ 610.0, 48.0, 22.0, 14.0, 10.0 },
		{ 490.0, 74.0, 46.0, 34.0, 22.0 },
		{ 340.0, 76.0, 48.0, 36.0, 24.0 },
		{ 195.0, 58.0, 32.0, 18.0, 14.0 }
	};
	AppendChinedFuselage(Canopy, Dome, 0.0, FColor(235, 195, 90, 255));
	CommitSection(Mesh, 1, Canopy, CreateColoredMaterial(MaterialOuter, CanopyTint));
}

void FGunsOnlyWorldBuilder::BuildSu27ProceduralMesh(
	UProceduralMeshComponent* Mesh,
	UObject* MaterialOuter,
	const FLinearColor& BodyTint,
	const FLinearColor& CanopyTint)
{
	if (Mesh == nullptr)
	{
		return;
	}

	// Sculpted Su-27S Flanker (~21.9 m long, ~14.7 m wingspan)
	FMeshBuffers Body;
	const FColor FlankerCol(170, 192, 214, 255);
	const TArray<FChineStation> Fuselage = {
		{ 1090.0, -32.0,  3.0,  3.0,  3.0 },
		{  910.0, -18.0, 34.0, 24.0, 22.0 },
		{  660.0,   4.0, 62.0, 48.0, 36.0 },
		{  380.0,  16.0, 72.0, 62.0, 38.0 },
		{  -80.0,  14.0, 78.0, 56.0, 34.0 },
		{ -580.0,  10.0, 66.0, 42.0, 28.0 },
		{ -960.0,   4.0, 24.0, 18.0, 16.0 }
	};
	AppendChinedFuselage(Body, Fuselage, 0.0, FlankerCol);

	for (const double Side : { -1.0, 1.0 })
	{
		// Wide-spaced underslung AL-31F nacelles + long tailcones
		const TArray<FChineStation> Nacelle = {
			{  170.0, -20.0, 46.0, 36.0, 38.0 },
			{ -350.0, -16.0, 50.0, 38.0, 40.0 },
			{ -840.0, -10.0, 42.0, 34.0, 34.0 }
		};
		AppendChinedFuselage(Body, Nacelle, Side * 108.0, FlankerCol);

		// Leading-edge root extension (LERX) blending smoothly to fuselage
		AppendSweptPlate(
			Body,
			FVector(540.0, Side * 65.0, 12.0),
			FVector(180.0, Side * 65.0, 8.0),
			FVector(215.0, Side * 165.0, 2.0),
			FVector(120.0, Side * 165.0, 0.0),
			8.0, FlankerCol);

		// Swept high-aspect Flanker main wing
		AppendSweptPlate(
			Body,
			FVector(220.0, Side * 145.0, -2.0),
			FVector(-320.0, Side * 145.0, -4.0),
			FVector(-350.0, Side * 735.0, -10.0),
			FVector(-535.0, Side * 735.0, -10.0),
			9.0, FlankerCol);

		// Horizontal tailplane
		AppendSweptPlate(
			Body,
			FVector(-560.0, Side * 125.0, -4.0),
			FVector(-875.0, Side * 125.0, -4.0),
			FVector(-765.0, Side * 470.0, -8.0),
			FVector(-930.0, Side * 470.0, -8.0),
			8.0, FlankerCol);

		// Upright twin vertical stabilizers (0 deg cant on Su-27)
		AppendSweptPlate(
			Body,
			FVector(-490.0, Side * 134.0, 28.0),
			FVector(-855.0, Side * 134.0, 24.0),
			FVector(-720.0, Side * 138.0, 305.0),
			FVector(-895.0, Side * 138.0, 300.0),
			9.0, FlankerCol);
	}

	CommitSection(Mesh, 0, Body, CreateColoredMaterial(MaterialOuter, BodyTint));

	// Teardrop glass canopy (Section 1)
	FMeshBuffers Canopy;
	const TArray<FChineStation> Dome = {
		{ 650.0, 56.0, 20.0, 14.0, 10.0 },
		{ 515.0, 92.0, 42.0, 34.0, 20.0 },
		{ 360.0, 94.0, 42.0, 34.0, 20.0 },
		{ 210.0, 68.0, 28.0, 18.0, 14.0 }
	};
	AppendChinedFuselage(Canopy, Dome, 0.0, FColor(175, 225, 255, 255));
	CommitSection(Mesh, 1, Canopy, CreateColoredMaterial(MaterialOuter, CanopyTint));
}

void FGunsOnlyWorldBuilder::BuildAfterburnerPlumeMesh(
	UProceduralMeshComponent* Mesh,
	UObject* MaterialOuter)
{
	if (Mesh == nullptr)
	{
		return;
	}
	FMeshBuffers Core;
	const FColor FlameCol(255, 168, 48, 255);
	for (const double Side : { -1.0, 1.0 })
	{
		// Plume origin sits at X=0 in component local space (component anchored at nozzles X=-885)
		const TArray<FChineStation> Cone = {
			{    0.0, 0.0, 34.0, 22.0, 22.0 },
			{ -240.0, 0.0, 24.0, 16.0, 16.0 },
			{ -520.0, 0.0,  6.0,  4.0,  4.0 }
		};
		AppendChinedFuselage(Core, Cone, Side * 64.0, FlameCol);
	}
	CommitSection(Mesh, 0, Core, CreateColoredMaterial(MaterialOuter, FLinearColor(2.8f, 1.15f, 0.28f)));
}

void FGunsOnlyWorldBuilder::BuildCockpitFrameMesh(
	UProceduralMeshComponent* Mesh,
	UObject* MaterialOuter)
{
	if (Mesh == nullptr)
	{
		return;
	}
	// Peripheral cockpit frame relative to pawn origin (CockpitCamera is at X=240, Y=0, Z=115, FOV=72).
	// Leaves central +/- 24 deg sightline and HUD completely clear.
	FMeshBuffers Frame;
	const FColor RailCol(28, 30, 34, 255);
	// Low glare shield well below center sightline (Z=84..90 at X=305)
	AppendBox(Frame, FVector(305.0, 0.0, 86.0), FVector(16.0, 42.0, 3.0), RailCol);
	// Left and right canopy sills
	AppendBox(Frame, FVector(272.0, -44.0, 96.0), FVector(36.0, 2.5, 4.0), RailCol);
	AppendBox(Frame, FVector(272.0,  44.0, 96.0), FVector(36.0, 2.5, 4.0), RailCol);
	// Subtle side canopy struts & outer eyebrow rail
	AppendSweptPlate(
		Frame,
		FVector(298.0, -44.0, 98.0), FVector(294.0, -44.0, 98.0),
		FVector(295.0, -34.0, 139.0), FVector(291.0, -34.0, 139.0),
		1.5, RailCol);
	AppendSweptPlate(
		Frame,
		FVector(298.0,  44.0, 98.0), FVector(294.0,  44.0, 98.0),
		FVector(295.0,  34.0, 139.0), FVector(291.0,  34.0, 139.0),
		1.5, RailCol);
	CommitSection(Mesh, 0, Frame, CreateColoredMaterial(MaterialOuter, FLinearColor(0.05f, 0.06f, 0.07f)));
}

void FGunsOnlyWorldBuilder::BuildGatePortalMesh(
	UProceduralMeshComponent* Mesh,
	UObject* MaterialOuter,
	const FVector& HalfExtentsCm,
	const FLinearColor& Tint)
{
	if (Mesh == nullptr)
	{
		return;
	}
	// Hollow rectangular flight-path portal facing +/- X: four edge bars, open center
	FMeshBuffers Portal;
	const double ThickX = FMath::Max(120.0, HalfExtentsCm.X * 0.35);
	const double Rail = FMath::Clamp(FMath::Min(HalfExtentsCm.Y, HalfExtentsCm.Z) * 0.07, 110.0, 320.0);
	const FColor FrameCol(80, 235, 255, 255);

	// Top & bottom horizontal bars
	AppendBox(Portal, FVector(0.0, 0.0,  HalfExtentsCm.Z), FVector(ThickX, HalfExtentsCm.Y + Rail, Rail), FrameCol);
	AppendBox(Portal, FVector(0.0, 0.0, -HalfExtentsCm.Z), FVector(ThickX, HalfExtentsCm.Y + Rail, Rail), FrameCol);
	// Left & right vertical pillars
	AppendBox(Portal, FVector(0.0, -HalfExtentsCm.Y, 0.0), FVector(ThickX, Rail, HalfExtentsCm.Z), FrameCol);
	AppendBox(Portal, FVector(0.0,  HalfExtentsCm.Y, 0.0), FVector(ThickX, Rail, HalfExtentsCm.Z), FrameCol);

	CommitSection(Mesh, 0, Portal, CreateColoredMaterial(MaterialOuter, Tint));
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
	FMeshBuffers BoxBuf;
	AppendBox(BoxBuf, FVector::ZeroVector, HalfExtentsCm, FColor::White);
	CommitSection(Mesh, 0, BoxBuf, CreateColoredMaterial(MaterialOuter, Tint));
}
