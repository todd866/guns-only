using UnrealBuildTool;

public class RCOdysseyTarget : TargetRules
{
	public RCOdysseyTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("RCOdyssey");
	}
}
