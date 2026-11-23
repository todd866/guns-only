#pragma once

#include "CoreMinimal.h"
#include "guns_only_sim.h"

class GUNSONLYUE_API FGunsOnlySimBridge
{
public:
	FGunsOnlySimBridge() = default;
	~FGunsOnlySimBridge();

	FGunsOnlySimBridge(const FGunsOnlySimBridge&) = delete;
	FGunsOnlySimBridge& operator=(const FGunsOnlySimBridge&) = delete;

	bool InitializeLibrary();
	void ShutdownLibrary();
	bool IsLibraryLoaded() const { return bLibraryReady; }

	bool CreateSession(int32 BeatIndex = 7, int32 DeckConfig = 1);
	void DestroySession();
	bool HasSession() const { return SessionHandle > 0; }

	void Begin();
	void Restart();
	void SetPaused(bool bPaused);
	bool RequestRtb();
	bool EndSortie();
	void SetControls(double Roll, double Pitch, double Yaw, double Throttle01, bool bThrottleOverride, int32 TriggerDown);
	void FeedKey(int32 GKeyCode, bool bPressed);
	void SetAssistedFlight(bool bEnabled);
	void SetAutoGcas(bool bEnabled);
	int32 Advance(double DeltaSeconds, int32 MaxCompression = 1);

	bool ReadFrame(GunsSimFrame& OutFrame) const;
	int32 ReadContacts(TArray<GunsSimContact>& OutContacts) const;
	int32 ReadTracers(TArray<GunsSimTracer>& OutTracers) const;
	int32 ReadGates(TArray<GunsSimApproachGate>& OutGates) const;
	bool ReadRunway(GunsSimRunway& OutRunway) const;

	void SetWorldOriginMeters(double InOriginEastM, double InOriginNorthM);
	double GetOriginEastMeters() const { return OriginEastM; }
	double GetOriginNorthMeters() const { return OriginNorthM; }

	FVector SimPosToUE(double EastM, double UpM, double NorthM) const;
	static FVector SimVelToUE(double VelEastMps, double VelUpMps, double VelNorthMps);
	static FVector SimDirToUE(double East, double Up, double North);
	static FQuat SimBasisToUEQuat(
		double FwdE, double FwdU, double FwdN,
		double UpE, double UpU, double UpN);

private:
	void* DllHandle = nullptr;
	bool bLibraryReady = false;
	int64 SessionHandle = 0;
	double OriginEastM = 0.0;
	double OriginNorthM = 0.0;

	using FnAbiVersion = int32 (*)();
	using FnCreate = int64 (*)(int32, int32);
	using FnDestroy = void (*)(int64);
	using FnBegin = void (*)(int64);
	using FnRestart = void (*)(int64);
	using FnSetPaused = void (*)(int64, int32);
	using FnRequestRtb = int32 (*)(int64);
	using FnEndSortie = int32 (*)(int64);
	using FnSetControls = void (*)(int64, double, double, double, double, int32, int32);
	using FnFeedKey = void (*)(int64, int32, int32);
	using FnSetBool = void (*)(int64, int32);
	using FnAdvance = int32 (*)(int64, double, int32);
	using FnReadFrame = int32 (*)(int64, GunsSimFrame*);
	using FnReadContacts = int32 (*)(int64, GunsSimContact*, int32);
	using FnReadTracers = int32 (*)(int64, GunsSimTracer*, int32);
	using FnReadGates = int32 (*)(int64, GunsSimApproachGate*, int32);
	using FnReadRunway = int32 (*)(int64, GunsSimRunway*);

	FnAbiVersion PtrAbiVersion = nullptr;
	FnCreate PtrCreate = nullptr;
	FnDestroy PtrDestroy = nullptr;
	FnBegin PtrBegin = nullptr;
	FnRestart PtrRestart = nullptr;
	FnSetPaused PtrSetPaused = nullptr;
	FnRequestRtb PtrRequestRtb = nullptr;
	FnEndSortie PtrEndSortie = nullptr;
	FnSetControls PtrSetControls = nullptr;
	FnFeedKey PtrFeedKey = nullptr;
	FnSetBool PtrSetAssistedFlight = nullptr;
	FnSetBool PtrSetAutoGcas = nullptr;
	FnAdvance PtrAdvance = nullptr;
	FnReadFrame PtrReadFrame = nullptr;
	FnReadContacts PtrReadContacts = nullptr;
	FnReadTracers PtrReadTracers = nullptr;
	FnReadGates PtrReadGates = nullptr;
	FnReadRunway PtrReadRunway = nullptr;
};
