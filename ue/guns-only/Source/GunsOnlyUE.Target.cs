using UnrealBuildTool;

public class GunsOnlyUETarget : TargetRules
{
	public GunsOnlyUETarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("GunsOnlyUE");
	}
}
