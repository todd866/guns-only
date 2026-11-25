#include "GunsOnlyHUD.h"
#include "GunsOnlyFlightPawn.h"
#include "Engine/Canvas.h"
#include "Engine/Texture2D.h"
#include "Engine/Engine.h"
#include "Engine/GameViewportClient.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "Camera/PlayerCameraManager.h"
#include "CollisionQueryParams.h"
#include "IImageWrapper.h"
#include "IImageWrapperModule.h"
#include "Modules/ModuleManager.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "HAL/FileManager.h"
#include "UnrealClient.h"

namespace
{
	void DrawDiamond(AHUD* Hud, float X, float Y, float R, const FLinearColor& Color, float Thickness)
	{
		Hud->DrawLine(X, Y - R, X + R, Y, Color, Thickness);
		Hud->DrawLine(X + R, Y, X, Y + R, Color, Thickness);
		Hud->DrawLine(X, Y + R, X - R, Y, Color, Thickness);
		Hud->DrawLine(X - R, Y, X, Y - R, Color, Thickness);
	}

	void DrawBoxOutline(AHUD* Hud, float X0, float Y0, float W, float H, const FLinearColor& Color, float Thickness)
	{
		Hud->DrawLine(X0, Y0, X0 + W, Y0, Color, Thickness);
		Hud->DrawLine(X0 + W, Y0, X0 + W, Y0 + H, Color, Thickness);
		Hud->DrawLine(X0 + W, Y0 + H, X0, Y0 + H, Color, Thickness);
		Hud->DrawLine(X0, Y0 + H, X0, Y0, Color, Thickness);
	}

	void DrawCirclePoly(AHUD* Hud, float CX, float CY, float Radius, int32 Segments, const FLinearColor& Color, float Thickness)
	{
		const float Step = 2.0f * PI / static_cast<float>(Segments);
		FVector2D Prev(CX + Radius, CY);
		for (int32 i = 1; i <= Segments; ++i)
		{
			const float A = i * Step;
			const FVector2D Next(CX + Radius * FMath::Cos(A), CY + Radius * FMath::Sin(A));
			Hud->DrawLine(Prev.X, Prev.Y, Next.X, Next.Y, Color, Thickness);
			Prev = Next;
		}
	}

	double WrapAngle180(double Deg)
	{
		double R = FMath::Fmod(Deg + 180.0, 360.0);
		if (R < 0.0) R += 360.0;
		return R - 180.0;
	}

	const TCHAR* ContactCallsign(int32 Role)
	{
		switch (Role)
		{
		case 1: return TEXT("SU-27");
		case 2: return TEXT("WING");
		case 3: return TEXT("RELIEF");
		case 4: return TEXT("MIG-28");
		case 5: return TEXT("PAYLOAD");
		case 6: return TEXT("DRONE");
		case 7: return TEXT("FOX-2");
		default: return TEXT("TGT");
		}
	}

	double ContactWingspanM(int32 Role)
	{
		switch (Role)
		{
		case 3: return 13.56;
		case 4: return 8.13;
		case 5: return 15.0;
		case 6: return 10.5;
		default: return 14.7;
		}
	}
}

void AGunsOnlyHUD::EnsureUiTexturesLoaded()
{
	if (bUiTexturesLoaded)
	{
		return;
	}
	bUiTexturesLoaded = true;
	CardF22 = LoadObject<UTexture2D>(nullptr, TEXT("/Game/GunsOnly/UI/T_Card_F22.T_Card_F22"));
	CardCobra = LoadObject<UTexture2D>(nullptr, TEXT("/Game/GunsOnly/UI/T_Card_Cobra.T_Card_Cobra"));
	CardRapier = LoadObject<UTexture2D>(nullptr, TEXT("/Game/GunsOnly/UI/T_Card_Rapier.T_Card_Rapier"));
	CardF14 = LoadObject<UTexture2D>(nullptr, TEXT("/Game/GunsOnly/UI/T_Card_F14.T_Card_F14"));
	CardFireBoss = LoadObject<UTexture2D>(nullptr, TEXT("/Game/GunsOnly/UI/T_Card_FireBoss.T_Card_FireBoss"));
	CardHangar = LoadObject<UTexture2D>(nullptr, TEXT("/Game/GunsOnly/UI/T_Card_Hangar.T_Card_Hangar"));
}

void AGunsOnlyHUD::DrawArcPoly(float CX, float CY, float Radius, float StartDeg, float EndDeg, int32 Segments, const FLinearColor& Color, float Thickness)
{
	const float StartRad = FMath::DegreesToRadians(StartDeg);
	const float EndRad = FMath::DegreesToRadians(EndDeg);
	FVector2D Prev(CX + Radius * FMath::Cos(StartRad), CY + Radius * FMath::Sin(StartRad));
	for (int32 i = 1; i <= Segments; ++i)
	{
		const float T = static_cast<float>(i) / static_cast<float>(Segments);
		const float A = FMath::Lerp(StartRad, EndRad, T);
		const FVector2D Next(CX + Radius * FMath::Cos(A), CY + Radius * FMath::Sin(A));
		DrawLine(Prev.X, Prev.Y, Next.X, Next.Y, Color, Thickness);
		Prev = Next;
	}
}

void AGunsOnlyHUD::HandlePendingQaScreenshot(AGunsOnlyFlightPawn* Pawn)
{
	if (Pawn == nullptr)
	{
		return;
	}
	if (bWaitingAsyncScreenshot)
	{
		AsyncWaitTicks++;
		if ((FPaths::FileExists(AsyncScreenshotPath) && IFileManager::Get().FileSize(*AsyncScreenshotPath) > 0) || AsyncWaitTicks >= 30)
		{
			bWaitingAsyncScreenshot = false;
			Pawn->NotifyQaCaptureCompleted(AsyncScreenshotPath);
		}
		return;
	}

	FString TargetPath;
	if (!Pawn->ConsumePendingQaCapture(TargetPath))
	{
		return;
	}

	// Capture after Canvas HUD & Slate overlay composite with opaque alpha=255
	bWaitingAsyncScreenshot = true;
	AsyncScreenshotPath = TargetPath;
	AsyncWaitTicks = 0;
	FScreenshotRequest::RequestScreenshot(TargetPath, true, false);
}

void AGunsOnlyHUD::DrawProgramPicker(AGunsOnlyFlightPawn* Pawn, float W, float H)
{
	EnsureUiTexturesLoaded();
	const FLinearColor HudGreen(0.30f, 1.0f, 0.53f, 0.90f);
	const FLinearColor HudCyan(0.28f, 0.90f, 1.0f, 0.94f);
	const FLinearColor HudAmber(1.0f, 0.74f, 0.20f, 0.94f);

	const float ConsoleH = FMath::Clamp(H * 0.49f, 300.0f, 365.0f);
	const float ConsoleY = H - ConsoleH - 12.0f;
	const float ConsoleX = 20.0f;
	const float ConsoleW = W - 40.0f;

	DrawRect(FLinearColor(0.03f, 0.045f, 0.065f, 0.90f), ConsoleX, ConsoleY, ConsoleW, ConsoleH);
	DrawBoxOutline(this, ConsoleX, ConsoleY, ConsoleW, ConsoleH, HudCyan, 1.6f);

	// Header row inside bottom console
	DrawText(TEXT("GUNS ONLY   —   FLIGHT PROGRAMS"), FLinearColor(0.92f, 0.96f, 1.0f, 0.96f),
		ConsoleX + 18.0f, ConsoleY + 12.0f, nullptr, 1.15f);
	DrawText(
		FString::Printf(TEXT("RUNG %d   ·   BEST SCORE %.0f"), Pawn->GetSavedRung(), Pawn->GetBestScore()),
		HudAmber, ConsoleX + 340.0f, ConsoleY + 14.0f, nullptr, 0.95f);

	const float BtnResW = 132.0f;
	const float BtnResX = ConsoleX + ConsoleW - BtnResW - 16.0f;
	DrawRect(FLinearColor(0.10f, 0.34f, 0.22f, 0.90f), BtnResX, ConsoleY + 10.0f, BtnResW, 26.0f);
	DrawBoxOutline(this, BtnResX, ConsoleY + 10.0f, BtnResW, 26.0f, HudGreen, 1.4f);
	DrawText(TEXT("RESUME [ESC]"), HudGreen, BtnResX + 14.0f, ConsoleY + 16.0f, nullptr, 0.88f);
	AddHitBox(FVector2D(BtnResX, ConsoleY + 10.0f), FVector2D(BtnResW, 26.0f), TEXT("PickResume"), true, 20);

	// 5 Illustrated Aircraft/Theatre Program Cards
	struct FProgramCard
	{
		FName Id;
		int32 Beat;
		const TCHAR* KeyHint;
		const TCHAR* Title;
		const TCHAR* Subtitle;
		UTexture2D* Tex;
	};
	const FProgramCard Cards[5] = {
		{ TEXT("PickF22"),     GUNS_SIM_BEAT_F22_MERGE,        TEXT("[1]"), TEXT("F-22A RAPTOR"),   TEXT("Modern Guns & RTB"),    CardF22.Get() },
		{ TEXT("PickCobra"),   GUNS_SIM_BEAT_COBRA_CANYON,     TEXT("[2]"), TEXT("AH-1G COBRA"),    TEXT("Vietnam River Gorge"),  CardCobra.Get() },
		{ TEXT("PickTopGun"),  GUNS_SIM_BEAT_TOPGUN_F14,       TEXT("[3]"), TEXT("F-14A TOP GUN"),  TEXT("Carrier & MiG-28"),     CardF14.Get() },
		{ TEXT("PickRapier"),  GUNS_SIM_BEAT_RAPIER_INTERCEPT, TEXT("[4]"), TEXT("RAPIER MACH 3"),  TEXT("Stratosphere Intercept"),CardRapier.Get() },
		{ TEXT("PickOkanagan"),GUNS_SIM_BEAT_OKANAGAN_FIREBOSS,TEXT("[5]"), TEXT("AT-802F FIRE BOSS"), TEXT("Okanagan Wildfire"), CardFireBoss.Get() },
	};

	const float CardGap = 12.0f;
	const float CardsTop = ConsoleY + 46.0f;
	const float CardsAvailW = ConsoleW - 36.0f;
	const float CardW = (CardsAvailW - CardGap * 4.0f) / 5.0f;
	const float CardH = FMath::Max(160.0f, ConsoleH - 108.0f);
	const float ImgH = CardH - 52.0f;
	const int32 ActiveBeat = Pawn->GetCurrentBeatIndex();

	for (int32 i = 0; i < 5; ++i)
	{
		const FProgramCard& C = Cards[i];
		const float CX0 = ConsoleX + 18.0f + i * (CardW + CardGap);
		const bool bSel = (ActiveBeat == C.Beat);
		DrawRect(bSel ? FLinearColor(0.08f, 0.16f, 0.22f, 0.95f) : FLinearColor(0.05f, 0.07f, 0.10f, 0.92f),
			CX0, CardsTop, CardW, CardH);
		if (C.Tex != nullptr)
		{
			DrawTexture(C.Tex, CX0 + 2.0f, CardsTop + 2.0f, CardW - 4.0f, ImgH, 0.0f, 0.0f, 1.0f, 1.0f,
				FLinearColor::White, BLEND_Opaque);
		}
		DrawBoxOutline(this, CX0, CardsTop, CardW, CardH, bSel ? HudCyan : FLinearColor(0.28f, 0.42f, 0.48f, 0.70f),
			bSel ? 2.2f : 1.0f);
		DrawText(FString::Printf(TEXT("%s %s"), C.KeyHint, C.Title), bSel ? HudCyan : HudGreen,
			CX0 + 8.0f, CardsTop + ImgH + 6.0f, nullptr, 0.90f);
		DrawText(C.Subtitle, FLinearColor(0.75f, 0.84f, 0.90f, 0.86f),
			CX0 + 8.0f, CardsTop + ImgH + 26.0f, nullptr, 0.82f);
		AddHitBox(FVector2D(CX0, CardsTop), FVector2D(CardW, CardH), C.Id, true, 20);
	}

	// Bottom row: First Run + Practice Drills + Rung / Assist / Controls / Mute
	struct FSubPill { FName Id; FString Label; float W; bool bActive; };
	const FSubPill Pills[] = {
		{ TEXT("PickFirstRun"), TEXT("FIRST RUN"), 92.0f, ActiveBeat == GUNS_SIM_BEAT_FIRST_RUN },
		{ TEXT("PickVal"),      TEXT("VALLEY"),    74.0f, ActiveBeat == GUNS_SIM_BEAT_PRACTICE_VALLEY },
		{ TEXT("PickGun"),      TEXT("GUNNERY"),   82.0f, ActiveBeat == GUNS_SIM_BEAT_PRACTICE_GUNNERY },
		{ TEXT("PickRec"),      TEXT("RECOVERY"),  90.0f, ActiveBeat == GUNS_SIM_BEAT_PRACTICE_RECOVERY },
		{ TEXT("PickFin"),      TEXT("SHORT FINAL"),104.0f, ActiveBeat == GUNS_SIM_BEAT_PRACTICE_SHORT_FINAL },
		{ TEXT("PickRung"),     FString::Printf(TEXT("RUNG %d"), Pawn->GetSavedRung()), 76.0f, false },
		{ TEXT("PickScas"),     Pawn->IsAssistedFlight() ? TEXT("SCAS: AUTO") : TEXT("SCAS: RAW"), 102.0f, Pawn->IsAssistedFlight() },
		{ TEXT("BtnKeys"),      TEXT("CONTROLS [H]"), 116.0f, false },
		{ TEXT("PickMute"),     Pawn->IsMuted() ? TEXT("SOUND: OFF") : TEXT("SOUND: ON"), 104.0f, !Pawn->IsMuted() },
	};
	float PX = ConsoleX + 18.0f;
	const float PY = CardsTop + CardH + 10.0f;
	for (const FSubPill& P : Pills)
	{
		if (PX + P.W > ConsoleX + ConsoleW - 12.0f) break;
		const FLinearColor Col = P.bActive ? HudCyan : HudGreen;
		DrawRect(P.bActive ? FLinearColor(0.08f, 0.22f, 0.28f, 0.90f) : FLinearColor(0.04f, 0.06f, 0.09f, 0.85f),
			PX, PY, P.W, 24.0f);
		DrawBoxOutline(this, PX, PY, P.W, 24.0f, P.bActive ? HudCyan : FLinearColor(0.28f, 0.65f, 0.45f, 0.65f), 1.0f);
		DrawText(P.Label, Col, PX + 8.0f, PY + 5.0f, nullptr, 0.82f);
		AddHitBox(FVector2D(PX, PY), FVector2D(P.W, 24.0f), P.Id, true, 20);
		PX += P.W + 8.0f;
	}
}

void AGunsOnlyHUD::DrawControlsQuicklook(float W, float H)
{
	const float BW = FMath::Min(760.0f, W - 64.0f);
	const float BH = 370.0f;
	const float BX = (W - BW) * 0.5f;
	const float BY = (H - BH) * 0.5f;
	const FLinearColor Bg(0.025f, 0.04f, 0.06f, 0.94f);
	const FLinearColor Cyan(0.28f, 0.92f, 1.0f, 0.95f);
	const FLinearColor Green(0.30f, 1.0f, 0.53f, 0.90f);
	const FLinearColor White(0.88f, 0.93f, 0.98f, 0.92f);

	DrawRect(Bg, BX, BY, BW, BH);
	DrawBoxOutline(this, BX, BY, BW, BH, Cyan, 1.8f);
	DrawText(TEXT("HOTAS & FLIGHT CONTROLS   ([H] OR [ESC] TO CLOSE)"), Cyan, BX + 22.0f, BY + 16.0f, nullptr, 1.05f);

	const float Col1 = BX + 24.0f;
	const float Col2 = BX + BW * 0.50f + 10.0f;
	DrawText(TEXT("LEFT HAND  (THROTTLE / PEDALS / WEAPONS)"), Green, Col1, BY + 48.0f, nullptr, 0.90f);
	DrawText(TEXT("RIGHT HAND  (STICK / CYCLIC / VIEW)"), Green, Col2, BY + 48.0f, nullptr, 0.90f);

	const TCHAR* LeftLines[] = {
		TEXT("[W / S]       Throttle / Collective Up-Down"),
		TEXT("[A / D]       Rudder / Anti-Torque Pedals"),
		TEXT("[F]           Fire Guns / Cobra Consent / Drop"),
		TEXT("[V]           Padlock Selected Target Toggle"),
		TEXT("[Q / SHIFT]   AIM-9 / Rapier SRM / Rockets"),
		TEXT("[TAB]         Cycle Target Contact"),
		TEXT("[O]           Knock It Off / Request RTB"),
		TEXT("[SPACE]       G-Limit / GCAS Valley Override"),
		TEXT("[G]           Gear / Fire Boss Scoops"),
		TEXT("[ [ / ] ]     Flaps Up / Down"),
		TEXT("[K]           Auto-GCAS Paddle Override"),
	};
	for (int32 i = 0; i < UE_ARRAY_COUNT(LeftLines); ++i)
	{
		DrawText(LeftLines[i], White, Col1, BY + 76.0f + i * 24.0f, nullptr, 0.85f);
	}

	const TCHAR* RightLines[] = {
		TEXT("[ARROWS]      Pitch & Roll Stick / Cyclic"),
		TEXT("[, / . / /]   F-14 Wing Sweep Fwd/Aft/Auto"),
		TEXT("[U]           Tailhook Up / Down"),
		TEXT("[Y]           RTB Time Compression"),
		TEXT("[B]           SCAS / Assisted Auto-Trim"),
		TEXT("[C / F2]      Cockpit / Chase Camera"),
		TEXT("[R / P]       Restart Sortie / Pause"),
		TEXT("[ESC]         Program Picker"),
		TEXT("[1..5]        Quick Switch Theatre"),
		TEXT("GAMEPAD       LS Stick · RT/LT Throttle · LB/RB Rudder"),
		TEXT("GAMEPAD       A Fire · B Padlock · X Secondary"),
	};
	for (int32 i = 0; i < UE_ARRAY_COUNT(RightLines); ++i)
	{
		DrawText(RightLines[i], White, Col2, BY + 76.0f + i * 24.0f, nullptr, 0.85f);
	}
}

void AGunsOnlyHUD::DrawDebriefCard(const AGunsOnlyFlightPawn* Pawn, float W, float H)
{
	const GunsSimFrame& Frame = Pawn->GetLatestFrame();
	const GunsSimCourseState& Course = Pawn->GetLatestCourse();
	const GunsSimCombatDirector& Dir = Pawn->GetLatestCombatDirector();
	const GunsSimOkanaganState& Ok = Pawn->GetLatestOkanagan();
	const GunsSimCobraState& Cobra = Pawn->GetLatestCobraState();

	const FLinearColor HudGreen(0.30f, 1.0f, 0.53f, 0.90f);
	const FLinearColor HudCyan(0.28f, 0.92f, 1.0f, 0.94f);
	const FLinearColor HudRed(1.0f, 0.25f, 0.20f, 0.95f);

	FString Headline = TEXT("PAUSED");
	FLinearColor Accent = HudCyan;
	if (Frame.player_alive == 0 || (Ok.active != 0 && Ok.phase == 3))
	{
		Headline = Cobra.active != 0 ? TEXT("AIRFRAME LOST — MISSION DEFEAT") : TEXT("AIRCRAFT LOST");
		Accent = HudRed;
	}
	else if (Course.touchdown_contact != 0)
	{
		Headline = Course.touchdown_survivable != 0 ? TEXT("TOUCHDOWN — SAFE ON DECK") : TEXT("HARD LANDING");
		Accent = Course.touchdown_survivable != 0 ? HudGreen : HudRed;
	}
	else if (Frame.lifecycle == 3)
	{
		Headline = (Course.combat_complete != 0 || Frame.outcome == 1)
			? TEXT("SORTIE COMPLETE — VICTORY") : TEXT("SORTIE ENDED");
		Accent = Frame.outcome == 2 ? HudRed : HudGreen;
	}

	const float CardW = 470.0f;
	const float CardH = 112.0f;
	const float CardX = (W - CardW) * 0.5f;
	const float CardY = H - 155.0f;
	DrawRect(FLinearColor(0.03f, 0.045f, 0.065f, 0.90f), CardX, CardY, CardW, CardH);
	DrawBoxOutline(this, CardX, CardY, CardW, CardH, Accent, 1.6f);
	DrawText(Headline, Accent, CardX + 18.0f, CardY + 14.0f, nullptr, 1.18f);
	if (Ok.active != 0)
	{
		DrawText(
			FString::Printf(TEXT("SCORE %.0f   DROPS %d   BURNED %.1f HA   INTENSITY %.0f%%"),
				Ok.score, Ok.effective_drops, Ok.burned_area_ha, Ok.fire_intensity * 100.0),
			HudGreen, CardX + 18.0f, CardY + 46.0f, nullptr, 0.92f);
	}
	else
	{
		DrawText(
			FString::Printf(TEXT("SCORE %.0f   KILLS %d   HITS %d   PEAK %.1f G   RUNG %d"),
				Dir.combat_score, FMath::Max(Course.kills, Dir.director_kills),
				FMath::Max(Course.sortie_hits, Dir.director_hits), Dir.sortie_peak_g, Dir.earned_rung),
			HudGreen, CardX + 18.0f, CardY + 46.0f, nullptr, 0.92f);
	}
	DrawText(TEXT("[P] RESUME   [R] FLY AGAIN   [ESC] FLIGHT PROGRAMS"),
		HudCyan, CardX + 18.0f, CardY + 78.0f, nullptr, 0.88f);
}

void AGunsOnlyHUD::DrawHUD()
{
	Super::DrawHUD();

	APlayerController* PC = GetOwningPlayerController();
	if (PC == nullptr || Canvas == nullptr)
	{
		return;
	}
	AGunsOnlyFlightPawn* FlightPawn = Cast<AGunsOnlyFlightPawn>(PC->GetPawn());
	if (FlightPawn == nullptr || !FlightPawn->GetBridge().HasSession())
	{
		return;
	}

	const GunsSimFrame& Frame = FlightPawn->GetLatestFrame();
	const TArray<GunsSimContact>& Contacts = FlightPawn->GetLatestContacts();
	const GunsSimRunway& Runway = FlightPawn->GetLatestRunway();
	const GunsSimCourseState& Course = FlightPawn->GetLatestCourse();
	const GunsSimLeadCue& Lead = FlightPawn->GetLatestLeadCue();
	const GunsSimCobraState& Cobra = FlightPawn->GetLatestCobraState();
	const GunsSimGunFunnel& Funnel = FlightPawn->GetLatestGunFunnel();
	const GunsSimPilotState& Pilot = FlightPawn->GetLatestPilotState();
	const GunsSimCombatDirector& Dir = FlightPawn->GetLatestCombatDirector();
	const GunsSimCarrierState& Carrier = FlightPawn->GetLatestCarrier();
	const GunsSimOkanaganState& Ok = FlightPawn->GetLatestOkanagan();
	const FGunsOnlySimBridge& Bridge = FlightPawn->GetBridge();

	const float W = static_cast<float>(Canvas->SizeX);
	const float H = static_cast<float>(Canvas->SizeY);
	const float CX = W * 0.5f;
	const float CY = H * 0.5f;

	// Canonical HUD Phosphor restraint: #4dff88 at 0.84 opacity (`hud_phosphor.js`)
	const FLinearColor HudGreen(0.30f, 1.0f, 0.53f, 0.84f);
	const FLinearColor HudGreenDim(0.30f, 1.0f, 0.53f, 0.42f);
	const FLinearColor HudCyan(0.28f, 0.92f, 1.0f, 0.88f);
	const FLinearColor HudAmber(1.0f, 0.74f, 0.16f, 0.92f);
	const FLinearColor HudRed(1.0f, 0.24f, 0.20f, 0.94f);
	const FLinearColor PanelBg(0.03f, 0.045f, 0.065f, 0.58f);

	FVector CamLoc = FVector::ZeroVector;
	FRotator CamRot = FRotator::ZeroRotator;
	PC->GetPlayerViewPoint(CamLoc, CamRot);
	const FRotationMatrix CamMat(CamRot);
	const FVector CamFwd = CamMat.GetScaledAxis(EAxis::X);
	const FVector CamRight = CamMat.GetScaledAxis(EAxis::Y);
	const FVector CamUp = CamMat.GetScaledAxis(EAxis::Z);
	const float FovDeg = PC->PlayerCameraManager != nullptr ? PC->PlayerCameraManager->GetFOVAngle() : 72.0f;
	const float FocalPx = (0.5f * W) / FMath::Tan(FMath::DegreesToRadians(FovDeg * 0.5f));

	auto ProjectWorldClamped = [this, &CamLoc, &CamFwd, &CamRight, &CamUp, W, H, CX, CY](
		const FVector& TargetUE, bool& OutInFront, FVector2D& OutScreen)
	{
		const FVector Delta = TargetUE - CamLoc;
		const double FwdDot = FVector::DotProduct(Delta, CamFwd);
		if (FwdDot > 50.0)
		{
			const FVector P = Project(TargetUE, false);
			OutInFront = true;
			OutScreen = FVector2D(
				FMath::Clamp(static_cast<float>(P.X), 24.0f, W - 24.0f),
				FMath::Clamp(static_cast<float>(P.Y), 24.0f, H - 24.0f));
			return;
		}
		OutInFront = false;
		const double RightComp = FVector::DotProduct(Delta, CamRight);
		const double UpComp = FVector::DotProduct(Delta, CamUp);
		FVector2D Dir2D(static_cast<float>(RightComp), static_cast<float>(-UpComp));
		if (!Dir2D.Normalize()) Dir2D = FVector2D(0.0f, -1.0f);
		OutScreen = FVector2D(
			FMath::Clamp(CX + Dir2D.X * (CX - 30.0f), 26.0f, W - 26.0f),
			FMath::Clamp(CY + Dir2D.Y * (CY - 30.0f), 26.0f, H - 26.0f));
	};

	// Whisper-quiet corner pill ONLY (no cluttered 8-button top bar in active flight!)
	if (!FlightPawn->IsProgramPickerOpen())
	{
		DrawRect(PanelBg, 16.0f, 12.0f, 122.0f, 22.0f);
		DrawText(TEXT("[ESC] PROGRAMS"), HudCyan, 24.0f, 16.0f, nullptr, 0.80f);
		AddHitBox(FVector2D(16.0f, 12.0f), FVector2D(122.0f, 22.0f), TEXT("BtnPrograms"), true, 12);

		DrawRect(PanelBg, 144.0f, 12.0f, 76.0f, 22.0f);
		DrawText(TEXT("[H] KEYS"), HudGreen, 152.0f, 16.0f, nullptr, 0.80f);
		AddHitBox(FVector2D(144.0f, 12.0f), FVector2D(76.0f, 22.0f), TEXT("BtnKeys"), true, 12);

		if (FlightPawn->IsPadlockActive())
		{
			DrawRect(PanelBg, 226.0f, 12.0f, 88.0f, 22.0f);
			DrawText(TEXT("PADLOCK"), HudAmber, 234.0f, 16.0f, nullptr, 0.80f);
		}
		if (Cobra.active == 0 && Ok.active == 0 && (Dir.wave_number > 0 || Dir.combat_score > 0.0))
		{
			const FString Badge = FString::Printf(TEXT("W%d · R%d · %.0f"),
				FMath::Max(1, Dir.wave_number), Dir.sortie_rung, Dir.combat_score);
			DrawRect(PanelBg, W - 188.0f, 12.0f, 172.0f, 22.0f);
			DrawText(Badge, HudGreen, W - 180.0f, 16.0f, nullptr, 0.84f);
		}
	}

	const FVector PlayerUE = Bridge.SimPosToUE(Frame.pos_east_m, Frame.pos_up_m, Frame.pos_north_m);
	const FVector FwdUE = FGunsOnlySimBridge::SimDirToUE(Frame.fwd_east, Frame.fwd_up, Frame.fwd_north);
	const FVector PlaneUpUE = FGunsOnlySimBridge::SimDirToUE(Frame.up_east, Frame.up_up, Frame.up_north);
	const FVector VelUE = FGunsOnlySimBridge::SimVelToUE(Frame.vel_east_mps, Frame.vel_up_mps, Frame.vel_north_mps);

	// -------------------------------------------------------------------------
	// 1. AH-1G COBRA GUNSHIP HUD
	// -------------------------------------------------------------------------
	if (Cobra.active != 0)
	{
		const float ColPct = static_cast<float>(Cobra.collective01 * 100.0);
		const float TrqPct = static_cast<float>(Cobra.torque_fraction * 100.0);
		const int32 Mins = FMath::Max(0, Cobra.time_remaining_s) / 60;
		const int32 Secs = FMath::Max(0, Cobra.time_remaining_s) % 60;

		static const TCHAR* GunnerLabels[6] = {
			TEXT("AWAIT TGT"), TEXT("ACQUIRING"), TEXT("TRACKING"),
			TEXT("MASKED"), TEXT("OUT OF LIMITS"), TEXT("INHIBITED")
		};
		const int32 GIdx = FMath::Clamp(Cobra.gunner_state, 0, 5);
		const FLinearColor GunCol = Cobra.gunner_fire_authorized != 0 ? HudAmber
			: (Cobra.gunner_state == 2 ? HudGreen : (Cobra.gunner_state >= 3 ? HudRed : HudCyan));

		DrawCirclePoly(this, CX, CY, 15.0f, 20, HudGreen, 1.5f);
		DrawLine(CX - 24.0f, CY, CX - 15.0f, CY, HudGreen, 1.5f);
		DrawLine(CX + 15.0f, CY, CX + 24.0f, CY, HudGreen, 1.5f);
		DrawLine(CX, CY - 24.0f, CX, CY - 15.0f, HudGreen, 1.5f);
		DrawLine(CX, CY + 15.0f, CX, CY + 24.0f, HudGreen, 1.5f);

		const float StripW = 470.0f;
		const float StripX = CX - StripW * 0.5f;
		const float StripY = 16.0f;
		DrawRect(PanelBg, StripX, StripY, StripW, 42.0f);
		DrawBoxOutline(this, StripX, StripY, StripW, 42.0f, HudCyan, 1.2f);
		DrawText(
			FString::Printf(TEXT("IRON BELL   PTS %d - %d   TKT %d / %d   T-%02d:%02d"),
				Cobra.friendly_points, Cobra.hostile_points,
				Cobra.friendly_tickets, Cobra.hostile_tickets, Mins, Secs),
			HudGreen, StripX + 14.0f, StripY + 4.0f, nullptr, 0.92f);
		DrawText(
			FString::Printf(TEXT("TURRET: %s%s   7.62 %d   RKTS %d/38"),
				GunnerLabels[GIdx],
				Cobra.gunner_fire_authorized != 0 ? TEXT(" [FIRING]") : TEXT(""),
				Frame.ammo_remaining, Cobra.rockets_remaining),
			GunCol, StripX + 14.0f, StripY + 23.0f, nullptr, 0.88f);

		DrawRect(PanelBg, 22.0f, CY - 62.0f, 162.0f, 114.0f);
		DrawText(FString::Printf(TEXT("RPM  %3.0f"), Cobra.main_rotor_rpm), HudGreen, 32.0f, CY - 52.0f, nullptr, 0.96f);
		DrawText(FString::Printf(TEXT("TRQ  %3.0f%%"), TrqPct), TrqPct > 92.0f ? HudRed : HudGreen, 32.0f, CY - 30.0f, nullptr, 0.96f);
		DrawText(FString::Printf(TEXT("COL  %3.0f%%"), ColPct), HudCyan, 32.0f, CY - 8.0f, nullptr, 0.96f);
		DrawText(FString::Printf(TEXT("SCAS %s"), Cobra.assisted_scas != 0 ? TEXT("AUTO") : TEXT("RAW")),
			Cobra.assisted_scas != 0 ? HudCyan : HudAmber, 32.0f, CY + 14.0f, nullptr, 0.96f);
		DrawText(FString::Printf(TEXT("KILLS %d"), Course.kills), HudGreen, 32.0f, CY + 36.0f, nullptr, 0.92f);

		DrawRect(PanelBg, W - 184.0f, CY - 52.0f, 160.0f, 92.0f);
		DrawText(FString::Printf(TEXT("AGL  %4.0f M"), Cobra.agl_m), Cobra.agl_m < 10.0 ? HudAmber : HudGreen, W - 174.0f, CY - 42.0f, nullptr, 0.96f);
		DrawText(FString::Printf(TEXT("VSI  %+5.1f"), Cobra.vertical_speed_mps), HudGreen, W - 174.0f, CY - 20.0f, nullptr, 0.96f);
		DrawText(FString::Printf(TEXT("GS   %3.0f KT"), Frame.kcas), HudGreen, W - 174.0f, CY + 2.0f, nullptr, 0.96f);
		DrawText(FString::Printf(TEXT("HDG  %03d"), FMath::RoundToInt(FMath::RadiansToDegrees(FMath::Atan2(Frame.fwd_east, Frame.fwd_north)) + 360.0) % 360),
			HudCyan, W - 174.0f, CY + 24.0f, nullptr, 0.92f);

		auto DrawLandmarkMarker = [this, &Bridge, &PlayerUE, &ProjectWorldClamped, W, CY](
			double E, double U, double N, const TCHAR* Label, const FLinearColor& Col)
		{
			bool bFront = false;
			FVector2D PosS;
			const FVector PosUE = Bridge.SimPosToUE(E, U + 10.0, N);
			ProjectWorldClamped(PosUE, bFront, PosS);
			DrawDiamond(this, PosS.X, PosS.Y, bFront ? 9.0f : 6.0f, Col, 1.4f);
			const float LX = (PosS.X > W - 210.0f)
				? FMath::Max(24.0f, static_cast<float>(PosS.X) - 142.0f)
				: FMath::Clamp(static_cast<float>(PosS.X) + 12.0f, 24.0f, W - 205.0f);
			float LY = static_cast<float>(PosS.Y) - 7.0f;
			if ((PosS.X > W - 210.0f || LX + 130.0f > W - 190.0f) && LY > CY - 66.0f && LY < CY + 48.0f)
			{
				LY = CY - 72.0f;
			}
			DrawText(FString::Printf(TEXT("%s %.1f KM"), Label, FVector::Dist(PlayerUE, PosUE) / 100000.0),
				Col, LX, LY, nullptr, 0.82f);
		};
		DrawLandmarkMarker(Cobra.bridge_east_m, Cobra.bridge_up_m, Cobra.bridge_north_m, TEXT("IRON BELL"), HudAmber);
		DrawLandmarkMarker(Cobra.fob_east_m, Cobra.fob_up_m, Cobra.fob_north_m, TEXT("FOB EMBER"), HudCyan);

		for (const GunsSimContact& Contact : Contacts)
		{
			if (Contact.alive == 0) continue;
			const FVector ContactUE = Bridge.SimPosToUE(Contact.pos_east_m, Contact.pos_up_m + 2.5, Contact.pos_north_m);
			if (FVector::Dist(PlayerUE, ContactUE) / 100.0 > 3200.0) continue;
			bool bFront = false;
			FVector2D ScreenPos;
			ProjectWorldClamped(ContactUE, bFront, ScreenPos);
			if (!bFront) continue;
			const bool bHostile = (Contact.role < 14);
			DrawDiamond(this, ScreenPos.X, ScreenPos.Y, bHostile ? 8.0f : 6.0f, bHostile ? HudRed : HudCyan, 1.4f);
		}
		if (Cobra.has_target != 0)
		{
			bool bTgtFront = false;
			FVector2D TgtS;
			const FVector TgtUE = Bridge.SimPosToUE(Cobra.target_east_m, Cobra.target_up_m, Cobra.target_north_m);
			ProjectWorldClamped(TgtUE, bTgtFront, TgtS);
			DrawBoxOutline(this, TgtS.X - 15.0f, TgtS.Y - 15.0f, 30.0f, 30.0f, HudAmber, 2.0f);
			DrawRect(FLinearColor(0.2f, 0.05f, 0.05f, 0.8f), TgtS.X - 16.0f, TgtS.Y + 18.0f, 32.0f, 4.0f);
			DrawRect(HudRed, TgtS.X - 16.0f, TgtS.Y + 18.0f, 32.0f * static_cast<float>(FMath::Clamp(Cobra.target_health01, 0.0, 1.0)), 4.0f);
			DrawText(FString::Printf(TEXT("LOCK %.0f M"), FVector::Dist(PlayerUE, TgtUE) / 100.0),
				HudAmber, FMath::Clamp(static_cast<float>(TgtS.X) - 28.0f, 24.0f, W - 120.0f), static_cast<float>(TgtS.Y) + 24.0f, nullptr, 0.86f);
		}

		if (FlightPawn->IsProgramPickerOpen()) DrawProgramPicker(FlightPawn, W, H);
		else if (FlightPawn->IsControlsQuicklookOpen()) DrawControlsQuicklook(W, H);
		else if (FlightPawn->IsPaused() || Frame.lifecycle == 3 || Frame.player_alive == 0) DrawDebriefCard(FlightPawn, W, H);
		HandlePendingQaScreenshot(FlightPawn);
		return;
	}

	// -------------------------------------------------------------------------
	// 2. FIXED-WING & OKANAGAN COMMON SYMBOLOGY
	// -------------------------------------------------------------------------
	// Project boresight along aircraft +Fwd (moves accurately when padlocked off-nose!)
	FVector2D NoseScreen(CX, CY);
	bool bNoseFront = true;
	if (!FwdUE.IsNearlyZero())
	{
		ProjectWorldClamped(PlayerUE + FwdUE * 400000.0, bNoseFront, NoseScreen);
	}
	if (bNoseFront)
	{
		const float NX = NoseScreen.X;
		const float NY = NoseScreen.Y;
		DrawLine(NX - 12.0f, NY, NX - 4.0f, NY, HudGreen, 1.5f);
		DrawLine(NX + 4.0f, NY, NX + 12.0f, NY, HudGreen, 1.5f);
		DrawLine(NX, NY - 12.0f, NX, NY - 4.0f, HudGreen, 1.5f);
		DrawLine(NX, NY + 4.0f, NX, NY + 12.0f, HudGreen, 1.5f);
	}

	// Conformal Horizon + 5-deg Pitch Ladder
	const FVector HorizFwd = FVector(CamFwd.X, CamFwd.Y, 0.0).GetSafeNormal();
	if (!HorizFwd.IsNearlyZero())
	{
		const FVector HorizRight(-HorizFwd.Y, HorizFwd.X, 0.0);
		constexpr double FarRangeCm = 400000.0;
		const float ClipMinX = CX - 185.0f;
		const float ClipMaxX = CX + 185.0f;
		const float ClipMinY = 92.0f;
		const float ClipMaxY = H - 88.0f;

		auto DrawConformalBar = [this, &CamLoc, &CamFwd, &HorizFwd, &HorizRight, ClipMinX, ClipMaxX, ClipMinY, ClipMaxY](
			double PitchDeg, double HalfSpanCm, double InnerGapCm, const FLinearColor& Color, float Thickness, bool bTickLabel)
		{
			const double PitchRad = FMath::DegreesToRadians(PitchDeg);
			const FVector RayCenter = HorizFwd * FMath::Cos(PitchRad) + FVector::UpVector * FMath::Sin(PitchRad);
			if (FVector::DotProduct(RayCenter, CamFwd) < 0.25) return;
			const FVector CenterW = CamLoc + RayCenter * FarRangeCm;
			const auto DrawHalfSeg = [this, &CenterW, &HorizRight, &CamLoc, &CamFwd, ClipMinX, ClipMaxX, ClipMinY, ClipMaxY, PitchDeg, &Color, Thickness, bTickLabel](double Sign, double HS, double IG)
			{
				const FVector PIn = CenterW + HorizRight * (Sign * IG);
				const FVector POut = CenterW + HorizRight * (Sign * HS);
				if (FVector::DotProduct(PIn - CamLoc, CamFwd) <= 50.0 || FVector::DotProduct(POut - CamLoc, CamFwd) <= 50.0) return;
				const FVector SIn = Project(PIn, false);
				const FVector SOut = Project(POut, false);
				if (SIn.X < ClipMinX || SIn.X > ClipMaxX || SIn.Y < ClipMinY || SIn.Y > ClipMaxY
					|| SOut.X < ClipMinX || SOut.X > ClipMaxX || SOut.Y < ClipMinY || SOut.Y > ClipMaxY) return;
				DrawLine(static_cast<float>(SIn.X), static_cast<float>(SIn.Y), static_cast<float>(SOut.X), static_cast<float>(SOut.Y), Color, Thickness);
				if (bTickLabel)
				{
					const double TickDir = PitchDeg >= 0.0 ? -1.0 : 1.0;
					const FVector STick = Project(POut + FVector::UpVector * (TickDir * 4200.0), false);
					DrawLine(static_cast<float>(SOut.X), static_cast<float>(SOut.Y), static_cast<float>(STick.X), static_cast<float>(STick.Y), Color, Thickness);
					if (Sign > 0.0 && FMath::Abs(PitchDeg) >= 5.0)
					{
						DrawText(FString::Printf(TEXT("%+d"), FMath::RoundToInt(PitchDeg)),
							Color, static_cast<float>(SOut.X) + 5.0f, static_cast<float>(SOut.Y) - 7.0f, nullptr, 0.82f);
					}
				}
			};
			DrawHalfSeg(-1.0, HalfSpanCm, InnerGapCm);
			DrawHalfSeg(+1.0, HalfSpanCm, InnerGapCm);
		};
		DrawConformalBar(0.0, 95000.0, 14000.0, HudGreen, 1.5f, false);
		for (int32 Deg = -30; Deg <= 30; Deg += 5)
		{
			if (Deg == 0) continue;
			DrawConformalBar(static_cast<double>(Deg), 42000.0, 14000.0, HudGreenDim, 1.2f, true);
		}
	}

	// Flight-Path Marker (FPM)
	FVector2D FpmScreen(CX, CY);
	bool bFpmValid = false;
	if (VelUE.SizeSquared() > 100.0)
	{
		bool bVelFront = false;
		ProjectWorldClamped(PlayerUE + VelUE.GetSafeNormal() * 400000.0, bVelFront, FpmScreen);
		if (bVelFront && FpmScreen.X > 120.0f && FpmScreen.X < W - 120.0f)
		{
			bFpmValid = true;
			const float VX = FpmScreen.X, VY = FpmScreen.Y;
			DrawCirclePoly(this, VX, VY, 6.5f, 12, HudGreen, 1.6f);
			DrawLine(VX - 14.0f, VY, VX - 6.5f, VY, HudGreen, 1.6f);
			DrawLine(VX + 6.5f, VY, VX + 14.0f, VY, HudGreen, 1.6f);
			DrawLine(VX, VY - 12.0f, VX, VY - 6.5f, HudGreen, 1.6f);
		}
	}

	// 11.5 deg Landing / Carrier AoA E-Bracket
	if (Ok.active == 0 && (Frame.gear_down01 > 0.25 || Course.armed != 0 || Carrier.present != 0) && !FwdUE.IsNearlyZero() && !PlaneUpUE.IsNearlyZero())
	{
		constexpr double TargetLandingAoaRad = FMath::DegreesToRadians(11.5);
		const FVector BracketDir = (FwdUE * FMath::Cos(TargetLandingAoaRad) - PlaneUpUE * FMath::Sin(TargetLandingAoaRad)).GetSafeNormal();
		bool bBracketFront = false;
		FVector2D BS;
		ProjectWorldClamped(PlayerUE + BracketDir * 400000.0, bBracketFront, BS);
		if (bBracketFront)
		{
			const FLinearColor ECol = FMath::Abs(Frame.alpha_deg - 11.5) <= 2.0 ? HudGreen : HudCyan;
			const float EX = BS.X - 18.0f;
			DrawLine(EX, BS.Y - 14.0f, EX, BS.Y + 14.0f, ECol, 1.7f);
			DrawLine(EX, BS.Y - 14.0f, EX + 8.0f, BS.Y - 14.0f, ECol, 1.7f);
			DrawLine(EX, BS.Y, EX + 6.0f, BS.Y, ECol, 1.7f);
			DrawLine(EX, BS.Y + 14.0f, EX + 8.0f, BS.Y + 14.0f, ECol, 1.7f);
		}
	}

	// 9-sample EEGS Ballistic Gun Funnel (`gun_funnel.js`) in cockpit combat
	if (Ok.active == 0 && !FlightPawn->IsChaseCameraActive() && Funnel.valid != 0 && Funnel.sample_count >= 2)
	{
		TArray<FVector2D> LeftRail, RightRail;
		const int32 N = FMath::Min(9, Funnel.sample_count);
		for (int32 i = 0; i < N; ++i)
		{
			const FVector PtUE = Bridge.SimPosToUE(Funnel.east_m[i], Funnel.up_m[i], Funnel.north_m[i]);
			const FVector Delta = PtUE - CamLoc;
			if (FVector::DotProduct(Delta, CamFwd) <= 50.0) continue;
			const FVector Proj = Project(PtUE, false);
			const float RngM = FMath::Max(110.0f, static_cast<float>(Funnel.range_m[i]));
			const float HalfW = FMath::Clamp(FocalPx * static_cast<float>(0.5 * Funnel.target_wingspan_m) / RngM, 5.0f, 145.0f);
			LeftRail.Emplace(static_cast<float>(Proj.X) - HalfW, static_cast<float>(Proj.Y));
			RightRail.Emplace(static_cast<float>(Proj.X) + HalfW, static_cast<float>(Proj.Y));
		}
		for (int32 i = 0; i + 1 < LeftRail.Num(); ++i)
		{
			DrawLine(LeftRail[i].X, LeftRail[i].Y, LeftRail[i + 1].X, LeftRail[i + 1].Y, HudGreen, 1.4f);
			DrawLine(RightRail[i].X, RightRail[i].Y, RightRail[i + 1].X, RightRail[i + 1].Y, HudGreen, 1.4f);
			if (i == 2 || i == 5)
			{
				DrawLine(LeftRail[i].X, LeftRail[i].Y, LeftRail[i].X + 7.0f, LeftRail[i].Y, HudGreenDim, 1.2f);
				DrawLine(RightRail[i].X, RightRail[i].Y, RightRail[i].X - 7.0f, RightRail[i].Y, HudGreenDim, 1.2f);
			}
		}
	}

	// Scrolling KCAS Airspeed Tape (left)
	const float TapeHalfH = 104.0f;
	const float SpdX = CX - 220.0f;
	const double Kcas = Frame.kcas;
	DrawLine(SpdX, CY - TapeHalfH, SpdX, CY + TapeHalfH, HudGreenDim, 1.2f);
	constexpr float PxPerKt = 2.4f;
	const int32 BaseSpdTick = FMath::FloorToInt(Kcas / 10.0) * 10;
	for (int32 SpdTick = BaseSpdTick - 50; SpdTick <= BaseSpdTick + 50; SpdTick += 10)
	{
		if (SpdTick < 0) continue;
		const float TY = CY - static_cast<float>(SpdTick - Kcas) * PxPerKt;
		if (TY < CY - TapeHalfH || TY > CY + TapeHalfH) continue;
		const bool bMajor = (SpdTick % 50 == 0);
		DrawLine(SpdX - (bMajor ? 10.0f : 6.0f), TY, SpdX, TY, HudGreen, 1.2f);
		if (bMajor && FMath::Abs(TY - CY) > 16.0f)
		{
			DrawText(FString::Printf(TEXT("%d"), SpdTick), HudGreen, SpdX - 44.0f, TY - 7.0f, nullptr, 0.84f);
		}
	}
	if (Course.armed != 0 && Course.next_gate_kcas > 1.0)
	{
		const float BugY = FMath::Clamp(CY - static_cast<float>(Course.next_gate_kcas - Kcas) * PxPerKt,
			CY - TapeHalfH, CY + TapeHalfH);
		DrawLine(SpdX + 2.0f, BugY, SpdX + 10.0f, BugY - 5.0f, HudCyan, 1.8f);
		DrawLine(SpdX + 2.0f, BugY, SpdX + 10.0f, BugY + 5.0f, HudCyan, 1.8f);
	}
	DrawRect(PanelBg, SpdX - 66.0f, CY - 13.0f, 62.0f, 26.0f);
	DrawBoxOutline(this, SpdX - 66.0f, CY - 13.0f, 62.0f, 26.0f, HudGreen, 1.3f);
	DrawText(FString::Printf(TEXT("%3d"), FMath::RoundToInt(Kcas)), HudGreen, SpdX - 58.0f, CY - 9.0f, nullptr, 1.12f);
	DrawText(FString::Printf(TEXT("M %.2f"), Frame.mach), HudGreen, SpdX - 64.0f, CY + TapeHalfH + 8.0f, nullptr, 0.88f);

	// Scrolling Altitude Tape (right)
	const float AltX = CX + 220.0f;
	const double AltFt = Frame.pos_up_m * 3.28084;
	DrawLine(AltX, CY - TapeHalfH, AltX, CY + TapeHalfH, HudGreenDim, 1.2f);
	constexpr float PxPer100Ft = 0.16f;
	const int32 BaseAltTick = FMath::FloorToInt(AltFt / 200.0) * 200;
	for (int32 AltTick = BaseAltTick - 800; AltTick <= BaseAltTick + 800; AltTick += 200)
	{
		if (AltTick < 0) continue;
		const float TY = CY - static_cast<float>(AltTick - AltFt) * PxPer100Ft;
		if (TY < CY - TapeHalfH || TY > CY + TapeHalfH) continue;
		const bool bMajor = (AltTick % 400 == 0);
		DrawLine(AltX, TY, AltX + (bMajor ? 10.0f : 6.0f), TY, HudGreen, 1.2f);
		if (bMajor && FMath::Abs(TY - CY) > 16.0f)
		{
			DrawText(FString::Printf(TEXT("%d"), AltTick), HudGreen, AltX + 14.0f, TY - 7.0f, nullptr, 0.84f);
		}
	}
	if (Course.armed != 0 && Course.next_gate_alt_ft > 1.0)
	{
		const float BugY = FMath::Clamp(CY - static_cast<float>(Course.next_gate_alt_ft - AltFt) * PxPer100Ft,
			CY - TapeHalfH, CY + TapeHalfH);
		DrawLine(AltX - 2.0f, BugY, AltX - 10.0f, BugY - 5.0f, HudCyan, 1.8f);
		DrawLine(AltX - 2.0f, BugY, AltX - 10.0f, BugY + 5.0f, HudCyan, 1.8f);
	}
	DrawRect(PanelBg, AltX + 4.0f, CY - 13.0f, 76.0f, 26.0f);
	DrawBoxOutline(this, AltX + 4.0f, CY - 13.0f, 76.0f, 26.0f, HudGreen, 1.3f);
	DrawText(FString::Printf(TEXT("%5d"), FMath::RoundToInt(AltFt)), HudGreen, AltX + 10.0f, CY - 9.0f, nullptr, 1.12f);
	double TerrainM = 0.0;
	const double AglFt = Ok.active != 0
		? FMath::Max(0.0, Ok.agl_m * 3.28084)
		: (Bridge.SampleTerrainMeters(Frame.pos_east_m, Frame.pos_north_m, TerrainM)
			? FMath::Max(0.0, (Frame.pos_up_m - TerrainM) * 3.28084)
			: FMath::Max(0.0, AltFt));
	DrawText(FString::Printf(TEXT("R %4d"), FMath::RoundToInt(AglFt)), HudGreen, AltX + 8.0f, CY + TapeHalfH + 8.0f, nullptr, 0.88f);

	// Top Heading Tape
	double HdgDeg = FMath::RadiansToDegrees(FMath::Atan2(Frame.fwd_east, Frame.fwd_north));
	if (HdgDeg < 0.0) HdgDeg += 360.0;
	const float HdgTapeY = 38.0f;
	const float HdgHalfW = 140.0f;
	constexpr float PxPerDeg = 5.0f;
	DrawLine(CX - HdgHalfW, HdgTapeY, CX + HdgHalfW, HdgTapeY, HudGreenDim, 1.2f);
	const int32 BaseHdg = FMath::FloorToInt(HdgDeg / 5.0) * 5;
	for (int32 Step = -30; Step <= 30; Step += 5)
	{
		const int32 DegTick = BaseHdg + Step;
		const double Diff = WrapAngle180(static_cast<double>(DegTick) - HdgDeg);
		const float TX = CX + static_cast<float>(Diff) * PxPerDeg;
		if (TX < CX - HdgHalfW || TX > CX + HdgHalfW) continue;
		const bool bMajor = ((DegTick % 10 + 10) % 10 == 0);
		DrawLine(TX, HdgTapeY - (bMajor ? 9.0f : 5.0f), TX, HdgTapeY, HudGreen, 1.2f);
		if (bMajor && FMath::Abs(TX - CX) > 22.0f)
		{
			DrawText(FString::Printf(TEXT("%03d"), ((DegTick % 360) + 360) % 360),
				HudGreen, TX - 12.0f, HdgTapeY - 22.0f, nullptr, 0.82f);
		}
	}
	if (Runway.present != 0 || Carrier.present != 0)
	{
		const double TgtE = Carrier.present != 0 ? Carrier.pos_east_m : Runway.threshold_east_m;
		const double TgtN = Carrier.present != 0 ? Carrier.pos_north_m : Runway.threshold_north_m;
		const double BrgDeg = FMath::RadiansToDegrees(FMath::Atan2(TgtE - Frame.pos_east_m, TgtN - Frame.pos_north_m));
		const double RelBrg = WrapAngle180(BrgDeg - HdgDeg);
		const float CaretX = FMath::Clamp(CX + static_cast<float>(RelBrg) * PxPerDeg, CX - HdgHalfW, CX + HdgHalfW);
		DrawLine(CaretX, HdgTapeY + 2.0f, CaretX - 6.0f, HdgTapeY + 10.0f, HudCyan, 1.8f);
		DrawLine(CaretX, HdgTapeY + 2.0f, CaretX + 6.0f, HdgTapeY + 10.0f, HudCyan, 1.8f);
		DrawLine(CaretX - 6.0f, HdgTapeY + 10.0f, CaretX + 6.0f, HdgTapeY + 10.0f, HudCyan, 1.8f);
	}
	DrawRect(PanelBg, CX - 24.0f, HdgTapeY - 25.0f, 48.0f, 21.0f);
	DrawBoxOutline(this, CX - 24.0f, HdgTapeY - 25.0f, 48.0f, 21.0f, HudGreen, 1.2f);
	DrawText(FString::Printf(TEXT("%03d"), FMath::RoundToInt(HdgDeg) % 360), HudGreen, CX - 14.0f, HdgTapeY - 21.0f, nullptr, 1.0f);

	// Waze-style single-row RTB Next-Fix Cue (`approach_next_cue.js`) + 3D carrot box
	if (Ok.active == 0 && Course.armed != 0)
	{
		if (Course.carrot_valid != 0)
		{
			bool bCarrotFront = false;
			FVector2D CarrotS;
			ProjectWorldClamped(Bridge.SimPosToUE(Course.carrot_east_m, Course.carrot_up_m, Course.carrot_north_m),
				bCarrotFront, CarrotS);
			DrawBoxOutline(this, CarrotS.X - 10.0f, CarrotS.Y - 10.0f, 20.0f, 20.0f, bCarrotFront ? HudCyan : HudAmber, 1.8f);

			bool bPredFront = false;
			FVector2D PredS;
			ProjectWorldClamped(Bridge.SimPosToUE(Course.predictor_east_m, Course.predictor_up_m, Course.predictor_north_m),
				bPredFront, PredS);
			if (bPredFront)
			{
				DrawCirclePoly(this, PredS.X, PredS.Y, 4.5f, 10, HudCyan, 1.5f);
				if (bCarrotFront) DrawLine(PredS.X, PredS.Y, CarrotS.X, CarrotS.Y, FLinearColor(0.28f, 0.92f, 1.0f, 0.45f), 1.0f);
			}
		}
		static const TCHAR* GateShortNames[7] = { TEXT("IP"), TEXT("INI"), TEXT("BRK"), TEXT("DWN"), TEXT("PCH"), TEXT("FNL"), TEXT("TD") };
		const TCHAR* FixName = GateShortNames[FMath::Clamp(Course.next_gate_index, 0, 6)];
		const FString CueText = FString::Printf(TEXT("NEXT FIX · %s · %.1f NM · %.0f FT · %.0f KT%s"),
			FixName, Course.next_gate_dist_nm, Course.next_gate_alt_ft, Course.next_gate_kcas,
			(Course.next_gate_needs_gear != 0 && Frame.gear_down01 < 0.8) ? TEXT(" · [G] GEAR") : TEXT(""));
		DrawRect(PanelBg, CX - 195.0f, HdgTapeY + 16.0f, 390.0f, 22.0f);
		DrawText(CueText, HudCyan, CX - 185.0f, HdgTapeY + 20.0f, nullptr, 0.84f);
	}
	else if (Ok.active == 0 && Frame.rtb_available != 0 && Carrier.present == 0)
	{
		DrawText(TEXT("[O] RTB TO SON 015 AVAILABLE"), HudAmber, CX - 110.0f, HdgTapeY + 18.0f, nullptr, 0.90f);
	}

	// Theatre Specializations: Top Gun Carrier/F-14, Rapier Mach/Thermal, Okanagan Water/Fire
	if (FlightPawn->GetCurrentBeatIndex() == GUNS_SIM_BEAT_TOPGUN_F14)
	{
		DrawRect(PanelBg, 20.0f, CY + 126.0f, 195.0f, 84.0f);
		const TCHAR* SeekerStates[5] = { TEXT("OFF"), TEXT("COOL"), TEXT("SCAN"), TEXT("GROWL"), TEXT("LOCK") };
		const int32 SIdx = FMath::Clamp(Dir.aim9_seeker_state, 0, 4);
		DrawText(FString::Printf(TEXT("SWEEP %2.0f°   HOOK %s"), Dir.wing_sweep_deg, Dir.hook_down01 > 0.5 ? TEXT("DN") : TEXT("UP")),
			HudGreen, 28.0f, CY + 132.0f, nullptr, 0.86f);
		DrawText(FString::Printf(TEXT("AIM-9 %d   [%s]"), Dir.missiles_remaining, SeekerStates[SIdx]),
			SIdx >= 4 ? HudRed : (SIdx >= 3 ? HudAmber : HudCyan), 28.0f, CY + 154.0f, nullptr, 0.88f);

		const FVector ShipUE = Bridge.SimPosToUE(Carrier.pos_east_m, Carrier.pos_up_m, Carrier.pos_north_m);
		const double BoatNm = FVector::Dist(PlayerUE, ShipUE) / 185200.0;
		const TCHAR* LsoCall = Carrier.lso_severity == 3 ? TEXT("WAVE OFF")
			: (Carrier.lso_severity == 2 ? TEXT("CORRECTING")
				: (Carrier.lso_severity == 1 ? TEXT("ON BALL") : TEXT("STEAMING")));
		DrawText(FString::Printf(TEXT("BOAT %.1f NM · %s"), BoatNm, LsoCall),
			Carrier.lso_severity == 3 ? HudRed : (Carrier.lso_severity == 1 ? HudGreen : HudCyan),
			28.0f, CY + 176.0f, nullptr, 0.86f);

		if (Carrier.caught_wire > 0)
		{
			DrawRect(PanelBg, CX - 110.0f, CY + 95.0f, 220.0f, 28.0f);
			DrawBoxOutline(this, CX - 110.0f, CY + 95.0f, 220.0f, 28.0f, HudGreen, 1.5f);
			DrawText(FString::Printf(TEXT("OK · WIRE #%d TRAP"), Carrier.caught_wire), HudGreen, CX - 75.0f, CY + 101.0f, nullptr, 0.96f);
		}
	}
	else if (FlightPawn->GetCurrentBeatIndex() == GUNS_SIM_BEAT_RAPIER_INTERCEPT)
	{
		const float TempFrac = FMath::Clamp(static_cast<float>(Dir.rapier_skin_temp_c / FMath::Max(1.0, Dir.rapier_skin_limit_c)), 0.0f, 1.2f);
		const FLinearColor TempCol = TempFrac > 0.92f ? HudRed : (TempFrac > 0.78f ? HudAmber : HudCyan);
		DrawRect(PanelBg, 20.0f, CY + 126.0f, 210.0f, 70.0f);
		DrawText(FString::Printf(TEXT("TGT MACH %.2f   SRM %d"), Dir.rapier_target_mach, Dir.missiles_remaining),
			HudCyan, 28.0f, CY + 132.0f, nullptr, 0.88f);
		DrawText(FString::Printf(TEXT("SKIN %.0f / %.0f C"), Dir.rapier_skin_temp_c, Dir.rapier_skin_limit_c),
			TempCol, 28.0f, CY + 154.0f, nullptr, 0.88f);
		DrawRect(FLinearColor(0.08f, 0.10f, 0.14f, 0.8f), 28.0f, CY + 178.0f, 188.0f, 8.0f);
		DrawRect(TempCol, 28.0f, CY + 178.0f, 188.0f * FMath::Min(1.0f, TempFrac), 8.0f);
	}
	else if (Ok.active != 0)
	{
		const float WaterFrac = FMath::Clamp(static_cast<float>(Ok.water_kg / FMath::Max(1.0, Ok.water_capacity_kg)), 0.0f, 1.0f);
		static const TCHAR* SurfNames[4] = { TEXT("RUNWAY"), TEXT("ON LAKE"), TEXT("AIRBORNE"), TEXT("LOST") };
		const int32 SM = FMath::Clamp(Ok.surface_mode, 0, 3);
		DrawRect(PanelBg, 20.0f, CY + 116.0f, 232.0f, 96.0f);
		DrawText(FString::Printf(TEXT("TANK %.0f / %.0f KG (%s)"),
			Ok.water_kg, Ok.water_capacity_kg, Ok.scoops_commanded != 0 ? TEXT("SCOOPS DN") : TEXT("UP")),
			HudCyan, 28.0f, CY + 122.0f, nullptr, 0.86f);
		DrawRect(FLinearColor(0.06f, 0.10f, 0.14f, 0.85f), 28.0f, CY + 144.0f, 210.0f, 8.0f);
		DrawRect(Ok.scoop_valid != 0 ? HudGreen : HudCyan, 28.0f, CY + 144.0f, 210.0f * WaterFrac, 8.0f);
		DrawText(FString::Printf(TEXT("%s   DROPS %d   SCORE %.0f"), SurfNames[SM], Ok.effective_drops, Ok.score),
			HudGreen, 28.0f, CY + 158.0f, nullptr, 0.86f);
		DrawText(FString::Printf(TEXT("FIRE %.1f   BURNED %.1f HA"), Ok.fire_intensity, Ok.burned_area_ha),
			Ok.fire_intensity > 12.0 ? HudAmber : HudGreen, 28.0f, CY + 180.0f, nullptr, 0.86f);

		// Projected terrain Drop Aim diamond
		bool bAimFront = false;
		FVector2D AimS;
		ProjectWorldClamped(Bridge.SimPosToUE(Ok.drop_aim_east_m, Ok.drop_aim_up_m, Ok.drop_aim_north_m), bAimFront, AimS);
		if (bAimFront)
		{
			DrawDiamond(this, AimS.X, AimS.Y, 12.0f, Ok.water_kg > 100.0 ? HudCyan : HudAmber, 1.8f);
			DrawText(TEXT("DROP AIM"), Ok.water_kg > 100.0 ? HudCyan : HudAmber, AimS.X + 14.0f, AimS.Y - 7.0f, nullptr, 0.82f);
		}
	}

	// Lead Pipper (`1.35pi` amber -> `2pi` green + SHOOT) + Blooming Hit Markers + Kill Flash
	bool bLeadDrawn = false;
	FVector2D LeadScreen(0.0f, 0.0f);
	if (Ok.active == 0 && Lead.has_lead_solution != 0)
	{
		bool bLeadFront = false;
		FVector2D LeadS;
		ProjectWorldClamped(Bridge.SimPosToUE(Lead.lead_east_m, Lead.lead_up_m, Lead.lead_north_m), bLeadFront, LeadS);
		if (bLeadFront)
		{
			bLeadDrawn = true;
			LeadScreen = LeadS;
			const bool bShoot = (Lead.gun_solution != 0 || Lead.in_gun_window != 0);
			const FLinearColor PipperCol = bShoot ? HudGreen : HudAmber;
			if (bShoot)
			{
				DrawCirclePoly(this, LeadS.X, LeadS.Y, 13.0f, 20, PipperCol, 1.8f);
				DrawText(TEXT("SHOOT"), HudGreen, LeadS.X - 20.0f, LeadS.Y + 16.0f, nullptr, 0.90f);
			}
			else
			{
				// 1.35 * PI (243 deg) amber arc per `gun_funnel.js` / `combat_row.js`
				DrawArcPoly(LeadS.X, LeadS.Y, 13.0f, -120.0f, 123.0f, 14, PipperCol, 1.8f);
			}
			DrawLine(LeadS.X - 3.0f, LeadS.Y, LeadS.X + 3.0f, LeadS.Y, PipperCol, 1.5f);
			DrawLine(LeadS.X, LeadS.Y - 3.0f, LeadS.X, LeadS.Y + 3.0f, PipperCol, 1.5f);
		}
	}

	const float HitAlpha = FlightPawn->GetHitMarkerAlpha();
	if (HitAlpha > 0.02f)
	{
		const float Spread = 8.0f + 10.0f * (1.0f - HitAlpha);
		const FLinearColor HitCol(1.0f, 0.85f, 0.30f, HitAlpha);
		for (int32 sx = -1; sx <= 1; sx += 2)
		{
			for (int32 sy = -1; sy <= 1; sy += 2)
			{
				DrawLine(CX + sx * 5.0f, CY + sy * 5.0f, CX + sx * Spread, CY + sy * Spread, HitCol, 2.0f);
			}
		}
	}
	const float FlashAlpha = FlightPawn->GetKillFlashAlpha();
	if (FlashAlpha > 0.01f)
	{
		DrawCirclePoly(this, CX, CY, 42.0f + (1.0f - FlashAlpha * 3.5f) * 30.0f, 24,
			FLinearColor(0.30f, 1.0f, 0.53f, FlashAlpha), 2.2f);
	}

	// Air Contacts: Distant Aircraft Silhouette Impostor (<= 10..14 px, LOS-checked) + Gutter-Clamped Target Data Line
	TArray<FBox2D> ReservedLabelBoxes;
	ReservedLabelBoxes.Add(FBox2D(FVector2D(SpdX - 78.0f, CY - 118.0f), FVector2D(SpdX + 12.0f, CY + 130.0f)));
	ReservedLabelBoxes.Add(FBox2D(FVector2D(AltX - 12.0f, CY - 118.0f), FVector2D(AltX + 92.0f, CY + 130.0f)));
	if (bLeadDrawn)
	{
		ReservedLabelBoxes.Add(FBox2D(FVector2D(LeadScreen.X - 32.0f, LeadScreen.Y - 22.0f), FVector2D(LeadScreen.X + 36.0f, LeadScreen.Y + 34.0f)));
	}

	FCollisionQueryParams TraceParams(SCENE_QUERY_STAT(GunsImpostorLOS), false);
	TraceParams.AddIgnoredActor(FlightPawn);
	for (int32 i = 0; i < Contacts.Num(); ++i)
	{
		const GunsSimContact& C = Contacts[i];
		if (C.alive == 0) continue;
		const FVector ContactUE = Bridge.SimPosToUE(C.pos_east_m, C.pos_up_m, C.pos_north_m);
		const double DistCm = FVector::Dist(CamLoc, ContactUE);
		const double DistNm = DistCm / 185200.0;
		bool bInFront = false;
		FVector2D ScreenPos;
		ProjectWorldClamped(ContactUE, bInFront, ScreenPos);

		const FLinearColor Color = C.role == 3 ? HudCyan : (C.role == 7 ? HudAmber : HudRed);
		if (C.role == 7)
		{
			DrawCirclePoly(this, ScreenPos.X, ScreenPos.Y, 4.0f, 8, HudAmber, 1.4f);
			continue;
		}

		// Distant silhouette impostor (`<= 10 px` enter, `< 14 px` exit, visible line-of-sight only)
		const float ProjSpanPx = (static_cast<float>(ContactWingspanM(C.role)) * 100.0f / FMath::Max(1000.0f, static_cast<float>(DistCm))) * FocalPx;
		bool& bImp = ImpostorActiveByIdx.FindOrAdd(i);
		if (ProjSpanPx <= 10.0f) bImp = true;
		else if (ProjSpanPx >= 14.0f) bImp = false;

		if (bInFront && bImp && DistCm > 25000.0 && !GetWorld()->LineTraceTestByChannel(CamLoc, ContactUE, ECC_Visibility, TraceParams))
		{
			const float SizePx = FMath::Clamp(ProjSpanPx * 1.1f, 8.0f, 13.0f);
			const FVector UpUE = FGunsOnlySimBridge::SimDirToUE(C.up_east, C.up_up, C.up_north);
			const double BankRad = FMath::Atan2(FVector::DotProduct(UpUE, CamRight), FVector::DotProduct(UpUE, CamUp));
			const float WingCos = FMath::Cos(static_cast<float>(BankRad));
			const float WingSin = FMath::Sin(static_cast<float>(BankRad));
			const FVector2D W0(ScreenPos.X - WingCos * SizePx * 0.5f, ScreenPos.Y - WingSin * SizePx * 0.5f);
			const FVector2D W1(ScreenPos.X + WingCos * SizePx * 0.5f, ScreenPos.Y + WingSin * SizePx * 0.5f);
			const FVector2D F0(ScreenPos.X - WingSin * SizePx * 0.35f, ScreenPos.Y + WingCos * SizePx * 0.35f);
			const FVector2D F1(ScreenPos.X + WingSin * SizePx * 0.35f, ScreenPos.Y - WingCos * SizePx * 0.35f);
			const FLinearColor RimCol(0.84f, 0.77f, 0.61f, 0.24f);
			const FLinearColor CoreCol(0.03f, 0.043f, 0.047f, 0.92f);
			DrawLine(W0.X, W0.Y, W1.X, W1.Y, RimCol, 3.0f);
			DrawLine(W0.X, W0.Y, W1.X, W1.Y, CoreCol, 1.8f);
			DrawLine(F0.X, F0.Y, F1.X, F1.Y, CoreCol, 1.8f);
		}

		DrawDiamond(this, ScreenPos.X, ScreenPos.Y, bInFront ? 10.5f : 7.0f, Color, 1.5f);

		// Gutter-clamped & FPM/tape/contact-de-overlapped Target Data Line (`target_data_line.js`)
		const FString Line = (i == 0 && FMath::Abs(Funnel.closure_kts) > 1.0)
			? FString::Printf(TEXT("%s · %.1f NM · %+.0f KT"), ContactCallsign(C.role), DistNm, Funnel.closure_kts)
			: FString::Printf(TEXT("%s · %.1f NM"), ContactCallsign(C.role), DistNm);
		const float LabelW = Line.Len() * 6.8f;
		float LabelX = (ScreenPos.X + 14.0f + LabelW > W - 24.0f) ? (ScreenPos.X - LabelW - 14.0f) : (ScreenPos.X + 13.0f);
		if (LabelX < AltX + 96.0f && LabelX + LabelW > AltX - 18.0f && ScreenPos.X < AltX + 4.0f)
		{
			LabelX = ScreenPos.X - LabelW - 14.0f;
		}
		float LabelY = ScreenPos.Y - 9.0f;
		if (bFpmValid && FMath::Abs(LabelX - FpmScreen.X) < 55.0f && FMath::Abs(LabelY - FpmScreen.Y) < 28.0f)
		{
			LabelY = (LabelY <= FpmScreen.Y) ? (FpmScreen.Y - 30.0f) : (FpmScreen.Y + 22.0f);
		}
		LabelX = FMath::Clamp(LabelX, 24.0f, FMath::Max(24.0f, W - LabelW - 20.0f));
		LabelY = FMath::Clamp(LabelY, 64.0f, H - 68.0f);
		for (int32 Pass = 0; Pass < 14; ++Pass)
		{
			const FBox2D CandBox(FVector2D(LabelX, LabelY), FVector2D(LabelX + LabelW, LabelY + 17.0f));
			const bool bHitsReserved = ReservedLabelBoxes.ContainsByPredicate([&CandBox](const FBox2D& Existing)
			{
				return CandBox.Intersect(Existing);
			});
			if (!bHitsReserved)
			{
				break;
			}
			LabelY = (LabelY + 19.0f <= H - 68.0f) ? (LabelY + 19.0f) : FMath::Max(64.0f, LabelY - 19.0f);
		}
		ReservedLabelBoxes.Add(FBox2D(FVector2D(LabelX, LabelY), FVector2D(LabelX + LabelW, LabelY + 17.0f)));
		DrawRect(FLinearColor(0.03f, 0.05f, 0.08f, 0.56f), LabelX - 3.0f, LabelY - 1.0f, LabelW + 6.0f, 16.0f);
		DrawText(Line, FLinearColor(0.0f, 0.0f, 0.0f, 0.68f), LabelX + 1.0f, LabelY + 1.0f, nullptr, 0.86f);
		DrawText(Line, Color, LabelX, LabelY, nullptr, 0.86f);
	}

	// Auto-GCAS break-X / FLY UP & High-Alpha Recovery (`high_alpha_recovery.js`)
	if (Ok.active == 0 && (Pilot.auto_gcas_warning != 0 || Pilot.auto_gcas_active != 0))
	{
		const FLinearColor GcasCol = Pilot.auto_gcas_active != 0 ? HudRed : HudAmber;
		DrawLine(CX - 34.0f, CY - 24.0f, CX + 34.0f, CY + 24.0f, GcasCol, 2.5f);
		DrawLine(CX - 34.0f, CY + 24.0f, CX + 34.0f, CY - 24.0f, GcasCol, 2.5f);
		DrawText(Pilot.auto_gcas_active != 0 ? TEXT("AUTO-GCAS PULL UP") : TEXT("FLY UP  [K] PADDLE"),
			GcasCol, CX - 78.0f, CY + 34.0f, nullptr, 1.04f);
	}
	else if (Ok.active == 0 && Pilot.high_alpha_recovery != 0)
	{
		DrawText(TEXT("->  (o)  <-   CTR STICK"), HudAmber, CX - 86.0f, CY + 42.0f, nullptr, 0.96f);
	}

	// Honest Physiology Status (`g_tolerance_presentation.js`): show 1,2,5,6; intentionally omit BLACKOUT(3) / G_LOC(4)
	if (Ok.active == 0 && (Pilot.pilot_state == 1 || Pilot.pilot_state == 2 || Pilot.pilot_state == 5 || Pilot.pilot_state == 6))
	{
		static const TCHAR* PhysLabels[7] = { TEXT(""), TEXT("G-STRAIN"), TEXT("GRAYOUT"), TEXT(""), TEXT(""), TEXT("RECOVERING"), TEXT("REDOUT") };
		const FLinearColor PhysCol = Pilot.pilot_state == 6 ? HudRed : HudAmber;
		DrawRect(PanelBg, CX - 56.0f, CY - 82.0f, 112.0f, 22.0f);
		DrawText(PhysLabels[Pilot.pilot_state], PhysCol, CX - 42.0f, CY - 78.0f, nullptr, 0.86f);
	}

	// Bottom Corner Aircraft Telemetry (clean, uncrowded)
	if (!FlightPawn->IsProgramPickerOpen())
	{
		DrawText(
			FString::Printf(TEXT("%.1f G   AoA %.1f   THR %.0f%%   SPD BRK %.0f%%"),
				Frame.nz_g, Frame.alpha_deg, Frame.throttle01 * 100.0, Frame.speedbrake01 * 100.0),
			HudGreen, 26.0f, H - 40.0f, nullptr, 0.94f);

		DrawText(
			FString::Printf(TEXT("%s %d   FUEL %.0f LB   GEAR %s   %s"),
				Ok.active != 0 ? TEXT("H2O") : TEXT("GUN"),
				Frame.ammo_remaining, Frame.fuel_lb,
				Frame.gear_down01 > 0.8 ? TEXT("DN") : (Frame.gear_down01 > 0.05 ? TEXT("TR") : TEXT("UP")),
				FlightPawn->IsChaseCameraActive() ? TEXT("CHASE [C]") : TEXT("COCKPIT [C]")),
			HudGreen, W - 470.0f, H - 40.0f, nullptr, 0.94f);
	}

	if (FlightPawn->IsProgramPickerOpen())
	{
		DrawProgramPicker(FlightPawn, W, H);
	}
	else if (FlightPawn->IsControlsQuicklookOpen())
	{
		DrawControlsQuicklook(W, H);
	}
	else if (FlightPawn->IsPaused() || Frame.lifecycle == 3 || Frame.player_alive == 0 || Course.touchdown_contact != 0)
	{
		DrawDebriefCard(FlightPawn, W, H);
	}

	HandlePendingQaScreenshot(FlightPawn);
}

void AGunsOnlyHUD::NotifyHitBoxClick(FName BoxName)
{
	Super::NotifyHitBoxClick(BoxName);

	APlayerController* PC = GetOwningPlayerController();
	AGunsOnlyFlightPawn* FlightPawn = PC != nullptr ? Cast<AGunsOnlyFlightPawn>(PC->GetPawn()) : nullptr;
	if (FlightPawn == nullptr)
	{
		return;
	}

	auto LaunchBeat = [FlightPawn](int32 Beat)
	{
		FlightPawn->SetProgramPickerOpen(false);
		FlightPawn->SwitchMission(Beat);
	};

	if (BoxName == TEXT("BtnPrograms"))        FlightPawn->ToggleProgramPicker();
	else if (BoxName == TEXT("BtnKeys"))     FlightPawn->ToggleControlsQuicklook();
	else if (BoxName == TEXT("PickResume"))  FlightPawn->SetProgramPickerOpen(false);
	else if (BoxName == TEXT("PickF22"))     LaunchBeat(GUNS_SIM_BEAT_F22_MERGE);
	else if (BoxName == TEXT("PickCobra"))   LaunchBeat(GUNS_SIM_BEAT_COBRA_CANYON);
	else if (BoxName == TEXT("PickTopGun"))  LaunchBeat(GUNS_SIM_BEAT_TOPGUN_F14);
	else if (BoxName == TEXT("PickRapier"))  LaunchBeat(GUNS_SIM_BEAT_RAPIER_INTERCEPT);
	else if (BoxName == TEXT("PickOkanagan"))LaunchBeat(GUNS_SIM_BEAT_OKANAGAN_FIREBOSS);
	else if (BoxName == TEXT("PickFirstRun"))LaunchBeat(GUNS_SIM_BEAT_FIRST_RUN);
	else if (BoxName == TEXT("PickVal"))     LaunchBeat(GUNS_SIM_BEAT_PRACTICE_VALLEY);
	else if (BoxName == TEXT("PickGun"))     LaunchBeat(GUNS_SIM_BEAT_PRACTICE_GUNNERY);
	else if (BoxName == TEXT("PickRec"))     LaunchBeat(GUNS_SIM_BEAT_PRACTICE_RECOVERY);
	else if (BoxName == TEXT("PickFin"))     LaunchBeat(GUNS_SIM_BEAT_PRACTICE_SHORT_FINAL);
	else if (BoxName == TEXT("PickRung"))    FlightPawn->SelectRung((FlightPawn->GetSavedRung() + 1) % 4);
	else if (BoxName == TEXT("PickScas"))    FlightPawn->ToggleAssistedFlight();
	else if (BoxName == TEXT("PickMute"))    FlightPawn->ToggleMute();
}
