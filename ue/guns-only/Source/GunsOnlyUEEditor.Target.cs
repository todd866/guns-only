using UnrealBuildTool;

public class GunsOnlyUEEditorTarget : TargetRules
{
	public GunsOnlyUEEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("GunsOnlyUE");
	}
}
