using UnrealBuildTool;

public class RCOdysseyEditorTarget : TargetRules
{
	public RCOdysseyEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("RCOdyssey");
	}
}
