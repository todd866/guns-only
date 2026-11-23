#include "GunsOnlySimBridge.h"
#include "HAL/PlatformProcess.h"
#include "Misc/Paths.h"

namespace
{
	template <typename FnType>
	bool LoadSymbol(void* Handle, const TCHAR* Name, FnType& OutFn)
	{
		OutFn = reinterpret_cast<FnType>(FPlatformProcess::GetDllExport(Handle, Name));
		return OutFn != nullptr;
	}
}

FGunsOnlySimBridge::~FGunsOnlySimBridge()
{
	DestroySession();
	ShutdownLibrary();
}

bool FGunsOnlySimBridge::InitializeLibrary()
{
	if (bLibraryReady)
	{
		return true;
	}

#if defined(GUNS_SIM_STATIC) && GUNS_SIM_STATIC
	PtrAbiVersion = &::guns_sim_abi_version;
	PtrCreate = &::guns_sim_create;
	PtrDestroy = &::guns_sim_destroy;
	PtrBegin = &::guns_sim_begin;
	PtrRestart = &::guns_sim_restart;
	PtrSetPaused = &::guns_sim_set_paused;
	PtrRequestRtb = &::guns_sim_request_rtb;
	PtrEndSortie = &::guns_sim_end_sortie;
	PtrSetControls = &::guns_sim_set_controls;
	PtrFeedKey = &::guns_sim_feed_key;
	PtrSetAssistedFlight = &::guns_sim_set_assisted_flight;
	PtrSetAutoGcas = &::guns_sim_set_auto_gcas;
	PtrAdvance = &::guns_sim_advance;
	PtrReadFrame = &::guns_sim_read_frame;
	PtrReadContacts = &::guns_sim_read_contacts;
	PtrReadTracers = &::guns_sim_read_tracers;
	PtrReadGates = &::guns_sim_read_gates;
	PtrReadRunway = &::guns_sim_read_runway;
	bLibraryReady = (PtrAbiVersion && PtrAbiVersion() == GUNS_SIM_ABI_VERSION);
	return bLibraryReady;
#else
	const FString ProjectLib = FPaths::ConvertRelativePathToFull(
		FPaths::Combine(FPaths::ProjectDir(), TEXT("Binaries/ThirdParty/GunsOnlySim/Mac/libGunsOnlySim.dylib")));
	const FString BaseDirLib = FPaths::Combine(FPaths::GetPath(FPlatformProcess::ExecutablePath()), TEXT("libGunsOnlySim.dylib"));
	const FString MacBinLib = FPaths::ConvertRelativePathToFull(
		FPaths::Combine(FPaths::ProjectDir(), TEXT("Binaries/Mac/libGunsOnlySim.dylib")));

	const FString Candidates[] = { ProjectLib, BaseDirLib, MacBinLib };
	for (const FString& Candidate : Candidates)
	{
		if (FPaths::FileExists(Candidate))
		{
			DllHandle = FPlatformProcess::GetDllHandle(*Candidate);
			if (DllHandle != nullptr)
			{
				break;
			}
		}
	}

	if (DllHandle == nullptr)
	{
		UE_LOG(LogTemp, Error, TEXT("GunsOnlySimBridge: failed to load libGunsOnlySim.dylib (checked %s, %s, %s)"),
			*ProjectLib, *BaseDirLib, *MacBinLib);
		return false;
	}

	const bool bLoaded =
		LoadSymbol(DllHandle, TEXT("guns_sim_abi_version"), PtrAbiVersion) &&
		LoadSymbol(DllHandle, TEXT("guns_sim_create"), PtrCreate) &&
		LoadSymbol(DllHandle, TEXT("guns_sim_destroy"), PtrDestroy) &&
		LoadSymbol(DllHandle, TEXT("guns_sim_begin"), PtrBegin) &&
		LoadSymbol(DllHandle, TEXT("guns_sim_restart"), PtrRestart) &&
		LoadSymbol(DllHandle, TEXT("guns_sim_set_paused"), PtrSetPaused) &&
		LoadSymbol(DllHandle, TEXT("guns_sim_request_rtb"), PtrRequestRtb) &&
		LoadSymbol(DllHandle, TEXT("guns_sim_end_sortie"), PtrEndSortie) &&
		LoadSymbol(DllHandle, TEXT("guns_sim_set_controls"), PtrSetControls) &&
		LoadSymbol(DllHandle, TEXT("guns_sim_feed_key"), PtrFeedKey) &&
		LoadSymbol(DllHandle, TEXT("guns_sim_set_assisted_flight"), PtrSetAssistedFlight) &&
		LoadSymbol(DllHandle, TEXT("guns_sim_set_auto_gcas"), PtrSetAutoGcas) &&
		LoadSymbol(DllHandle, TEXT("guns_sim_advance"), PtrAdvance) &&
		LoadSymbol(DllHandle, TEXT("guns_sim_read_frame"), PtrReadFrame) &&
		LoadSymbol(DllHandle, TEXT("guns_sim_read_contacts"), PtrReadContacts) &&
		LoadSymbol(DllHandle, TEXT("guns_sim_read_tracers"), PtrReadTracers) &&
		LoadSymbol(DllHandle, TEXT("guns_sim_read_gates"), PtrReadGates) &&
		LoadSymbol(DllHandle, TEXT("guns_sim_read_runway"), PtrReadRunway);

	if (!bLoaded || PtrAbiVersion() != GUNS_SIM_ABI_VERSION)
	{
		UE_LOG(LogTemp, Error, TEXT("GunsOnlySimBridge: ABI mismatch or missing symbol."));
		ShutdownLibrary();
		return false;
	}

	bLibraryReady = true;
	return true;
#endif
}

void FGunsOnlySimBridge::ShutdownLibrary()
{
	if (DllHandle != nullptr)
	{
		FPlatformProcess::FreeDllHandle(DllHandle);
		DllHandle = nullptr;
	}
	bLibraryReady = false;
}

bool FGunsOnlySimBridge::CreateSession(int32 BeatIndex, int32 DeckConfig)
{
	if (!InitializeLibrary())
	{
		return false;
	}
	DestroySession();
	SessionHandle = PtrCreate(BeatIndex, DeckConfig);
	return SessionHandle > 0;
}

void FGunsOnlySimBridge::DestroySession()
{
	if (SessionHandle > 0 && PtrDestroy != nullptr)
	{
		PtrDestroy(SessionHandle);
	}
	SessionHandle = 0;
}

void FGunsOnlySimBridge::Begin()
{
	if (SessionHandle > 0 && PtrBegin != nullptr)
	{
		PtrBegin(SessionHandle);
	}
}

void FGunsOnlySimBridge::Restart()
{
	if (SessionHandle > 0 && PtrRestart != nullptr)
	{
		PtrRestart(SessionHandle);
	}
}

void FGunsOnlySimBridge::SetPaused(bool bPaused)
{
	if (SessionHandle > 0 && PtrSetPaused != nullptr)
	{
		PtrSetPaused(SessionHandle, bPaused ? 1 : 0);
	}
}

bool FGunsOnlySimBridge::RequestRtb()
{
	return (SessionHandle > 0 && PtrRequestRtb != nullptr) ? (PtrRequestRtb(SessionHandle) != 0) : false;
}

bool FGunsOnlySimBridge::EndSortie()
{
	return (SessionHandle > 0 && PtrEndSortie != nullptr) ? (PtrEndSortie(SessionHandle) != 0) : false;
}

void FGunsOnlySimBridge::SetControls(double Roll, double Pitch, double Yaw, double Throttle01, bool bThrottleOverride, int32 TriggerDown)
{
	if (SessionHandle > 0 && PtrSetControls != nullptr)
	{
		PtrSetControls(SessionHandle, Roll, Pitch, Yaw, Throttle01, bThrottleOverride ? 1 : 0, TriggerDown);
	}
}

void FGunsOnlySimBridge::FeedKey(int32 GKeyCode, bool bPressed)
{
	if (SessionHandle > 0 && PtrFeedKey != nullptr)
	{
		PtrFeedKey(SessionHandle, GKeyCode, bPressed ? 1 : 0);
	}
}

void FGunsOnlySimBridge::SetAssistedFlight(bool bEnabled)
{
	if (SessionHandle > 0 && PtrSetAssistedFlight != nullptr)
	{
		PtrSetAssistedFlight(SessionHandle, bEnabled ? 1 : 0);
	}
}

void FGunsOnlySimBridge::SetAutoGcas(bool bEnabled)
{
	if (SessionHandle > 0 && PtrSetAutoGcas != nullptr)
	{
		PtrSetAutoGcas(SessionHandle, bEnabled ? 1 : 0);
	}
}

int32 FGunsOnlySimBridge::Advance(double DeltaSeconds, int32 MaxCompression)
{
	if (SessionHandle > 0 && PtrAdvance != nullptr)
	{
		return PtrAdvance(SessionHandle, DeltaSeconds, MaxCompression);
	}
	return 0;
}

bool FGunsOnlySimBridge::ReadFrame(GunsSimFrame& OutFrame) const
{
	if (SessionHandle <= 0 || PtrReadFrame == nullptr)
	{
		return false;
	}
	return PtrReadFrame(SessionHandle, &OutFrame) != 0;
}

int32 FGunsOnlySimBridge::ReadContacts(TArray<GunsSimContact>& OutContacts) const
{
	if (SessionHandle <= 0 || PtrReadContacts == nullptr)
	{
		return 0;
	}
	OutContacts.SetNumZeroed(16);
	const int32 Written = PtrReadContacts(SessionHandle, OutContacts.GetData(), OutContacts.Num());
	OutContacts.SetNum(FMath::Max(0, Written));
	return Written;
}

int32 FGunsOnlySimBridge::ReadTracers(TArray<GunsSimTracer>& OutTracers) const
{
	if (SessionHandle <= 0 || PtrReadTracers == nullptr)
	{
		return 0;
	}
	OutTracers.SetNumZeroed(128);
	const int32 Written = PtrReadTracers(SessionHandle, OutTracers.GetData(), OutTracers.Num());
	OutTracers.SetNum(FMath::Max(0, Written));
	return Written;
}

int32 FGunsOnlySimBridge::ReadGates(TArray<GunsSimApproachGate>& OutGates) const
{
	if (SessionHandle <= 0 || PtrReadGates == nullptr)
	{
		return 0;
	}
	OutGates.SetNumZeroed(32);
	const int32 Written = PtrReadGates(SessionHandle, OutGates.GetData(), OutGates.Num());
	OutGates.SetNum(FMath::Max(0, Written));
	return Written;
}

bool FGunsOnlySimBridge::ReadRunway(GunsSimRunway& OutRunway) const
{
	if (SessionHandle <= 0 || PtrReadRunway == nullptr)
	{
		return false;
	}
	return PtrReadRunway(SessionHandle, &OutRunway) != 0;
}

void FGunsOnlySimBridge::SetWorldOriginMeters(double InOriginEastM, double InOriginNorthM)
{
	OriginEastM = InOriginEastM;
	OriginNorthM = InOriginNorthM;
}

FVector FGunsOnlySimBridge::SimPosToUE(double EastM, double UpM, double NorthM) const
{
	// Sim uses X=east, Y=up, Z=north in meters; UE5 uses X=forward(north), Y=right(east), Z=up in cm.
	return FVector(
		(NorthM - OriginNorthM) * 100.0,
		(EastM - OriginEastM) * 100.0,
		UpM * 100.0);
}

FVector FGunsOnlySimBridge::SimVelToUE(double VelEastMps, double VelUpMps, double VelNorthMps)
{
	return FVector(VelNorthMps * 100.0, VelEastMps * 100.0, VelUpMps * 100.0);
}

FVector FGunsOnlySimBridge::SimDirToUE(double East, double Up, double North)
{
	return FVector(North, East, Up).GetSafeNormal();
}

FQuat FGunsOnlySimBridge::SimBasisToUEQuat(
	double FwdE, double FwdU, double FwdN,
	double UpE, double UpU, double UpN)
{
	const FVector UEFwd = SimDirToUE(FwdE, FwdU, FwdN);
	const FVector UEUp = SimDirToUE(UpE, UpU, UpN);
	if (UEFwd.IsNearlyZero() || UEUp.IsNearlyZero())
	{
		return FQuat::Identity;
	}
	return FRotationMatrix::MakeFromXZ(UEFwd, UEUp).ToQuat().GetNormalized();
}
