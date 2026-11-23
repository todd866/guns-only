#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "GunsOnlyHUD.generated.h"

UCLASS()
class GUNSONLYUE_API AGunsOnlyHUD : public AHUD
{
	GENERATED_BODY()

public:
	virtual void DrawHUD() override;
};
