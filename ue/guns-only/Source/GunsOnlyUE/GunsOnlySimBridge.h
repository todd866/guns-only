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
	int32 GetLoadedAbiVersion() const { return PtrAbiVersion ? PtrAbiVersion() : 0; }

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
	void SetPadlockRollAssist(bool bEnabled);
	int32 Advance(double DeltaSeconds, int32 MaxCompression = 1);

	bool ReadFrame(GunsSimFrame& OutFrame) const;
	int32 ReadContacts(TArray<GunsSimContact>& OutContacts) const;
	int32 ReadTracers(TArray<GunsSimTracer>& OutTracers) const;
	int32 ReadGates(TArray<GunsSimApproachGate>& OutGates) const;
	bool ReadRunway(GunsSimRunway& OutRunway) const;
	bool ReadCourse(GunsSimCourseState& OutCourse) const;
	bool ReadLeadCue(GunsSimLeadCue& OutLead) const;
	bool ReadCobraState(GunsSimCobraState& OutCobra) const;
	bool ReadGunFunnel(GunsSimGunFunnel& OutFunnel) const;
	bool ReadPilotState(GunsSimPilotState& OutPilot) const;
	bool ReadCombatDirector(GunsSimCombatDirector& OutDirector) const;
	bool ReadWeather(GunsSimWeatherState& OutWeather) const;
	bool ReadCarrier(GunsSimCarrierState& OutCarrier) const;
	bool ReadOkanagan(GunsSimOkanaganState& OutOkanagan) const;
	int32 ReadFireCells(TArray<GunsSimFireCell>& OutCells) const;
	bool CycleTarget();
	bool FireRocket();
	bool FireSecondary();
	bool SetDirectorRung(int32 Rung);
	int32 GetDirectorRung() const;
	bool SampleTerrainMeters(double EastM, double NorthM, double& OutHeightM) const;
	int32 SampleTerrainGrid(
		double MinEastM,
		double MinNorthM,
		double StepM,
		int32 CountEast,
		int32 CountNorth,
		TArray<float>& OutHeightsM) const;

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
	using FnReadCourse = int32 (*)(int64, GunsSimCourseState*);
	using FnReadLeadCue = int32 (*)(int64, GunsSimLeadCue*);
	using FnReadCobraState = int32 (*)(int64, GunsSimCobraState*);
	using FnReadGunFunnel = int32 (*)(int64, GunsSimGunFunnel*);
	using FnReadPilotState = int32 (*)(int64, GunsSimPilotState*);
	using FnReadCombatDirector = int32 (*)(int64, GunsSimCombatDirector*);
	using FnReadWeather = int32 (*)(int64, GunsSimWeatherState*);
	using FnReadCarrier = int32 (*)(int64, GunsSimCarrierState*);
	using FnReadOkanagan = int32 (*)(int64, GunsSimOkanaganState*);
	using FnReadFireCells = int32 (*)(int64, GunsSimFireCell*, int32);
	using FnCycleTarget = int32 (*)(int64);
	using FnFireRocket = int32 (*)(int64);
	using FnSetInt = int32 (*)(int64, int32);
	using FnGetInt = int32 (*)(int64);
	using FnSampleTerrainM = int32 (*)(int64, double, double, double*);
	using FnSampleTerrainGrid = int32 (*)(int64, double, double, double, int32, int32, float*);

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
	FnSetBool PtrSetPadlockRollAssist = nullptr;
	FnAdvance PtrAdvance = nullptr;
	FnReadFrame PtrReadFrame = nullptr;
	FnReadContacts PtrReadContacts = nullptr;
	FnReadTracers PtrReadTracers = nullptr;
	FnReadGates PtrReadGates = nullptr;
	FnReadRunway PtrReadRunway = nullptr;
	FnReadCourse PtrReadCourse = nullptr;
	FnReadLeadCue PtrReadLeadCue = nullptr;
	FnReadCobraState PtrReadCobraState = nullptr;
	FnReadGunFunnel PtrReadGunFunnel = nullptr;
	FnReadPilotState PtrReadPilotState = nullptr;
	FnReadCombatDirector PtrReadCombatDirector = nullptr;
	FnReadWeather PtrReadWeather = nullptr;
	FnReadCarrier PtrReadCarrier = nullptr;
	FnReadOkanagan PtrReadOkanagan = nullptr;
	FnReadFireCells PtrReadFireCells = nullptr;
	FnCycleTarget PtrCycleTarget = nullptr;
	FnFireRocket PtrFireRocket = nullptr;
	FnFireRocket PtrFireSecondary = nullptr;
	FnSetInt PtrSetDirectorRung = nullptr;
	FnGetInt PtrGetDirectorRung = nullptr;
	FnSampleTerrainM PtrSampleTerrainM = nullptr;
	FnSampleTerrainGrid PtrSampleTerrainGrid = nullptr;
};
