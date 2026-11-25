#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "GunsOnlyHUD.generated.h"

class UTexture2D;
class AGunsOnlyFlightPawn;

UCLASS()
class GUNSONLYUE_API AGunsOnlyHUD : public AHUD
{
	GENERATED_BODY()

public:
	virtual void DrawHUD() override;
	virtual void NotifyHitBoxClick(FName BoxName) override;

private:
	void EnsureUiTexturesLoaded();
	void DrawArcPoly(float CX, float CY, float Radius, float StartDeg, float EndDeg, int32 Segments, const FLinearColor& Color, float Thickness);
	void DrawProgramPicker(AGunsOnlyFlightPawn* Pawn, float W, float H);
	void DrawControlsQuicklook(float W, float H);
	void DrawDebriefCard(const AGunsOnlyFlightPawn* Pawn, float W, float H);
	void HandlePendingQaScreenshot(AGunsOnlyFlightPawn* Pawn);

	UPROPERTY(Transient) TObjectPtr<UTexture2D> CardF22;
	UPROPERTY(Transient) TObjectPtr<UTexture2D> CardCobra;
	UPROPERTY(Transient) TObjectPtr<UTexture2D> CardRapier;
	UPROPERTY(Transient) TObjectPtr<UTexture2D> CardF14;
	UPROPERTY(Transient) TObjectPtr<UTexture2D> CardFireBoss;
	UPROPERTY(Transient) TObjectPtr<UTexture2D> CardHangar;
	bool bUiTexturesLoaded = false;

	TMap<int32, bool> ImpostorActiveByIdx;
	bool bWaitingAsyncScreenshot = false;
	FString AsyncScreenshotPath;
	int32 AsyncWaitTicks = 0;
};
