using GunsOnly.Sim;

namespace GunsOnly.Sim.Tests;

public class CarrierPassAssessmentTests {
    static CarrierPassSample Sample(double distance,
        double glidepathError = 0, double lineup = 0, double ias = 70,
        double aoaError = 0, double sink = 3.5,
        bool lsoWaveOff = false, bool pilotWaveOff = false) => new(
            distance, glidepathError, lineup, ias, aoaError, sink,
            lsoWaveOff, pilotWaveOff);

    static Carrier.TouchdownResult Touchdown(
        Carrier.TouchdownGrade grade = Carrier.TouchdownGrade.Ok,
        Carrier.TouchdownCorrection correction = Carrier.TouchdownCorrection.None) => new(
            Carrier.Recovery.Trap,
            Carrier.TouchdownQuality.Nominal,
            Carrier.HookOutcome.Engaged,
            grade,
            Carrier.TouchdownDeviation.None,
            correction,
            3,
            3.5,
            70,
            55,
            0,
            -50,
            -56);

    [Fact]
    public void StableObservedPassGradesOkAcrossNamedPhases() {
        var recorder = new CarrierPassRecorder();
        foreach (double distance in new[] { 1500.0, 800.0, 300.0, 100.0, 20.0 })
            recorder.Observe(Sample(distance));

        CarrierPassResult result = recorder.Complete(Touchdown());

        Assert.Equal(CarrierPassGrade.Ok, result.Grade);
        Assert.Equal(5, result.Phases.Count);
        Assert.Contains("START:OK", result.PhaseSummary);
        Assert.Contains("IN CLOSE:OK", result.PhaseSummary);
        Assert.Equal(CarrierPassDeviation.None, result.Deviations);
    }

    [Fact]
    public void CorrectedEarlyDeviationProducesFairTrendInsteadOfLastFrameNoGrade() {
        var recorder = new CarrierPassRecorder();
        recorder.Observe(Sample(1500, glidepathError: 40));
        recorder.Observe(Sample(1200));
        foreach (double distance in new[] { 800.0, 300.0, 100.0, 20.0 })
            recorder.Observe(Sample(distance));

        CarrierPassResult result = recorder.Complete(Touchdown());

        Assert.Equal(CarrierPassGrade.Fair, result.Grade);
        Assert.True(result.Deviations.HasFlag(CarrierPassDeviation.Glidepath));
        Assert.True(result.Phases.Single(p => p.Phase == CarrierPassPhase.Start).Corrected);
    }

    [Fact]
    public void IgnoredWaveOffAndIncompletePassCannotGradeClean() {
        var recorder = new CarrierPassRecorder();
        recorder.Observe(Sample(300, lsoWaveOff: true));
        recorder.Observe(Sample(100));
        recorder.Observe(Sample(20));

        CarrierPassResult result = recorder.Complete(Touchdown());

        Assert.Equal(CarrierPassGrade.NoGrade, result.Grade);
        Assert.True(result.WaveOffRequired);
        Assert.False(result.WaveOffComplied);
        Assert.True(result.Deviations.HasFlag(CarrierPassDeviation.IgnoredWaveOff));
        Assert.True(result.Deviations.HasFlag(CarrierPassDeviation.Incomplete));
        Assert.Equal(Carrier.TouchdownCorrection.WaveOffEarlier,
            result.PrimaryCorrection);
    }

    [Fact]
    public void PowerAppliedBeforeARequiredWaveOffDoesNotPreCreditCompliance() {
        var recorder = new CarrierPassRecorder();
        recorder.Observe(Sample(800, pilotWaveOff: true));
        recorder.Observe(Sample(300, lsoWaveOff: true));
        recorder.Observe(Sample(100));
        recorder.Observe(Sample(20));

        CarrierPassResult result = recorder.Complete(Touchdown());

        Assert.True(result.WaveOffRequired);
        Assert.False(result.WaveOffComplied);
        Assert.True(result.Deviations.HasFlag(CarrierPassDeviation.IgnoredWaveOff));
    }

    [Fact]
    public void TouchdownCutRemainsAuthoritativeOverPhaseTrend() {
        var recorder = new CarrierPassRecorder();
        foreach (double distance in new[] { 1500.0, 800.0, 300.0, 100.0, 20.0 })
            recorder.Observe(Sample(distance));

        CarrierPassResult result = recorder.Complete(Touchdown(
            Carrier.TouchdownGrade.Cut,
            Carrier.TouchdownCorrection.WaveOffEarlier));

        Assert.Equal(CarrierPassGrade.Cut, result.Grade);
        Assert.Equal(Carrier.TouchdownCorrection.WaveOffEarlier,
            result.PrimaryCorrection);
    }
}
