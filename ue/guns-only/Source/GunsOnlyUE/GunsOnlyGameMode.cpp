#include "GunsOnlyGameMode.h"
#include "GunsOnlyFlightPawn.h"
#include "GunsOnlyHUD.h"

AGunsOnlyGameMode::AGunsOnlyGameMode()
{
	DefaultPawnClass = AGunsOnlyFlightPawn::StaticClass();
	HUDClass = AGunsOnlyHUD::StaticClass();
}
