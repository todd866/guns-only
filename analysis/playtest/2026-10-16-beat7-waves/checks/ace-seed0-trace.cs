using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.PlaytestLab;
var s = new SimulationSession(7, serviceLifeCaptureEnabled: false);
s.DecisionCaptureEnabled = false;
var pilot = new LabPilot("ace", 0, null, 600);
var observer = new ExperienceObserver(new Options(), "ace", 0);
s.ConfigureSortieSeed(0); s.Begin(); double perceived = 0;
for(int tick=0;tick<150*AircraftSim.TickHz && s.Lifecycle==SimulationSession.LifecycleState.Active;tick++) {
 var decisions=pilot.Drive(s, perceived);
 int factor=s.Advance(0, maximumCompressionFactor:8);
 string inhibit=s.TimeCompressionInhibitReason.ToString();
 observer.BeforeStep(s);s.StepFixed();observer.Observe(s,decisions,factor,inhibit);
 perceived+=SortieRunner.Dt/factor;
 if(tick%1200==1199 && s.EngagementNumber>=3){
  string State(IBandit b) {var delta=s.Player.State.Position-b.State.Position;
   double angle=Math.Acos(Math.Clamp(b.State.ForwardDir().Dot(delta.Normalized()),-1,1))*180/Math.PI;
   return $"range={delta.Length:F0} nose={angle:F0} speed={b.State.Speed:F0} alt={b.State.Position.Y:F0} tactic={(b is ReactiveBandit rb ? rb.Tactic.ToString():b.GetType().Name)}";}
  Console.WriteLine($"{s.TimeSeconds:F0}s own speed={s.Player.State.Speed:F0} alt={s.Player.State.Position.Y:F0} primary {State(s.Bandit)} role={s.PrimaryFormationRole}");
  foreach(var w in s.Wingmen) if(w.StillFighting) Console.WriteLine($"  wing {State(w.Bandit)}");
 }
}
