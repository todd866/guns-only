using GunsOnly.Sim.Korea;

namespace GunsOnly.Sim.Tests.Korea;

public sealed class ArmstrongCableStrikeControllerTests {
    [Fact]
    public void BeginUsesFirstGlobalEventAsEpochAndRequiresMonotonicAuthorityTicks() {
        var harness = new Harness(sequenceBeforeFirst: 40);

        ArmstrongCableStrikeSnapshot begun = harness.Controller.Begin(700);

        Assert.Equal(ArmstrongCableStrikePhase.AttackRun, begun.Phase);
        Assert.Equal(41, begun.ReconstructionEpochSequence);
        Assert.Equal(700, begun.EpochBeginSourceTick);
        Assert.Equal(700, begun.LastSourceTick);
        Assert.Equal(0, begun.SimulationTick);
        Assert.Equal(0, begun.ActiveEpochTicks);
        Assert.Null(begun.DamageEpistemic);
        Assert.Equal(ArmstrongCableStrikeContract.AttackRunCheckpointId,
            begun.CheckpointId);
        ArmstrongCableStrikeEventRecord started = Assert.Single(harness.Events);
        Assert.Equal(41, started.Sequence);
        Assert.Equal(41, started.ReconstructionEpochSequence);
        Assert.Equal(
            ArmstrongCableStrikeEventKind.ReconstructionEpochStarted,
            started.Kind);
        Assert.Throws<InvalidOperationException>(() =>
            harness.Controller.Begin(701));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            harness.Controller.Advance(Observation(700, 1)));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            harness.Controller.Advance(Observation(701, 0)));
    }

    [Fact]
    public void ContactAndIndependentDamageCommitAreOrderedInOnePhysicalTick() {
        var harness = new Harness();
        harness.Controller.Begin(0);
        harness.Controller.Advance(Observation(1, 1) with {
            EnteredCableCorridor = true
        });
        CableContactRecord contact = Contact(harness.Definition);
        ArmstrongDamageCommitObservation damage = Damage(harness.Definition);

        ArmstrongCableStrikeSnapshot snapshot = harness.Controller.Advance(
            Observation(2, 2) with {
                CableContact = contact,
                DamageCommit = damage
            });

        Assert.Equal(ArmstrongCableStrikePhase.DamagedUnstable, snapshot.Phase);
        Assert.True(snapshot.CableContactObserved);
        Assert.Equal(damage.ProfileId, snapshot.VisibleDamage.ProfileId);
        Assert.Equal(
            AirframeDamageEpistemic.Reconstruction,
            snapshot.DamageEpistemic);
        Assert.Equal(
            new[] {
                ArmstrongCableStrikeEventKind.CableContact,
                ArmstrongCableStrikeEventKind.DamageCommitted
            },
            harness.Events
                .Where(missionEvent => missionEvent.SourceTick == 2)
                .Select(missionEvent => missionEvent.Kind));
        Assert.Equal(contact, harness.Events[^2].Contact);
        Assert.Equal(damage.VisibleDamage, harness.Events[^1].VisibleDamage);
    }

    [Fact]
    public void PhysicalContactMayCommitDamageOnTheFollowingAuthorityTick() {
        var harness = new Harness();
        harness.Controller.Begin(0);
        harness.Controller.Advance(Observation(1, 1) with {
            EnteredCableCorridor = true
        });

        ArmstrongCableStrikeSnapshot contacted = harness.Controller.Advance(
            Observation(2, 2) with {
                CableContact = Contact(harness.Definition)
            });
        ArmstrongCableStrikeSnapshot damaged = harness.Controller.Advance(
            Observation(3, 3) with {
                DamageCommit = Damage(harness.Definition)
            });

        Assert.Equal(ArmstrongCableStrikePhase.CableCorridor, contacted.Phase);
        Assert.True(contacted.CableContactObserved);
        Assert.False(contacted.VisibleDamage.IsPresent);
        Assert.Null(contacted.DamageEpistemic);
        Assert.Equal(ArmstrongCableStrikePhase.DamagedUnstable, damaged.Phase);
        Assert.True(damaged.VisibleDamage.IsPresent);
        Assert.Equal(
            AirframeDamageEpistemic.Reconstruction,
            damaged.DamageEpistemic);
    }

    [Fact]
    public void FullCableToDecisionPathRequiresPhysicalDamageStabilityInspectionAndMargin() {
        var harness = new Harness();
        IReadOnlyList<ArmstrongCableStrikeSnapshot> snapshots =
            RunCompletedScript(harness);

        Assert.Equal(ArmstrongCableStrikePhase.Southbound,
            harness.Controller.Phase);
        Assert.True(harness.Controller.IsSliceComplete);
        Assert.True(snapshots[^1].SouthboundCheckpointReached);
        Assert.True(snapshots[^1].NoLandingDecisionCommitted);
        Assert.True(snapshots[^1].PersistentLateralDemandObserved);
        Assert.Equal(ArmstrongRollMarginBand.LandingEnvelopeUnsafe,
            snapshots[^1].RollMarginBand);
        Assert.True(snapshots[^1].Inspection.Complete);
        Assert.Equal(
            new[] {
                ArmstrongCableStrikeEventKind.ReconstructionEpochStarted,
                ArmstrongCableStrikeEventKind.CableCorridorEntered,
                ArmstrongCableStrikeEventKind.CableContact,
                ArmstrongCableStrikeEventKind.DamageCommitted,
                ArmstrongCableStrikeEventKind.DamagedFlightStabilized,
                ArmstrongCableStrikeEventKind.InspectionStarted,
                ArmstrongCableStrikeEventKind.InspectionCompleted,
                ArmstrongCableStrikeEventKind.NoLandingDecisionCommitted,
                ArmstrongCableStrikeEventKind.SouthboundCheckpointReached
            },
            harness.Events.Select(missionEvent => missionEvent.Kind));
        Assert.Equal(Enumerable.Range(1, harness.Events.Count).Select(x => (long)x),
            harness.Events.Select(missionEvent => missionEvent.Sequence));
    }

    [Theory]
    [InlineData(0.4, 0.4)]
    [InlineData(0.4, 0.3)]
    [InlineData(0.4, 1.0)]
    public void ScenarioRequiresLimitedRollThresholdAboveUnsafeAndBelowFullAuthority(
        double unsafeThreshold,
        double limitedThreshold) {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            Definition(unsafeThreshold, limitedThreshold));
    }

    [Fact]
    public void RollMarginBandsUseScenarioOwnedUnsafeAndLimitedThresholds() {
        ArmstrongCableStrikeScenarioDefinition definition = Definition(
            maximumLandingEnvelopeRollAuthorityFraction: 0.4,
            maximumLimitedRollAuthorityFraction: 0.6);
        var harness = new Harness(definition: definition);
        harness.Controller.Begin(0);
        harness.Controller.Advance(Observation(1, 1) with {
            EnteredCableCorridor = true
        });
        harness.Controller.Advance(Observation(2, 2) with {
            CableContact = Contact(definition),
            DamageCommit = Damage(definition)
        });

        ArmstrongCableStrikeSnapshot limited = harness.Controller.Advance(
            Observation(3, 3) with {
                SlowFlightProbeComplete = true,
                RemainingRollAuthorityFraction = 0.5
            });
        ArmstrongCableStrikeSnapshot unsafeMargin = harness.Controller.Advance(
            Observation(4, 4) with {
                SlowFlightProbeComplete = true,
                RemainingRollAuthorityFraction = 0.4
            });
        ArmstrongCableStrikeSnapshot adequate = harness.Controller.Advance(
            Observation(5, 5) with {
                SlowFlightProbeComplete = true,
                RemainingRollAuthorityFraction = 0.61
            });

        Assert.Equal(ArmstrongRollMarginBand.Limited, limited.RollMarginBand);
        Assert.Equal(ArmstrongRollMarginBand.LandingEnvelopeUnsafe,
            unsafeMargin.RollMarginBand);
        Assert.Equal(ArmstrongRollMarginBand.Adequate, adequate.RollMarginBand);
    }

    [Fact]
    public void InspectionAloneCannotManufactureNoLandingDecision() {
        var harness = new Harness();
        ReachInspection(harness, demonstrateMargin: false);

        harness.Controller.Advance(Observation(6, 6) with {
            Carpenter = Carpenter(harness.Definition)
        });
        ArmstrongCableStrikeSnapshot inspected = harness.Controller.Advance(
            Observation(7, 7) with {
                Carpenter = Carpenter(harness.Definition)
            });

        Assert.True(inspected.Inspection.Complete);
        Assert.Equal(ArmstrongCableStrikePhase.Inspection, inspected.Phase);
        Assert.False(inspected.NoLandingDecisionCommitted);
        Assert.DoesNotContain(harness.Events, missionEvent =>
            missionEvent.Kind
                == ArmstrongCableStrikeEventKind.NoLandingDecisionCommitted);

        harness.Controller.Advance(Observation(8, 8) with {
            Carpenter = Carpenter(harness.Definition),
            PilotLateralInput = 0.6,
            SlowFlightProbeComplete = true,
            RemainingRollAuthorityFraction = 0.1
        });
        ArmstrongCableStrikeSnapshot decided = harness.Controller.Advance(
            Observation(9, 9) with {
                Carpenter = Carpenter(harness.Definition),
                PilotLateralInput = 0.6,
                SlowFlightProbeComplete = true,
                RemainingRollAuthorityFraction = 0.1
            });

        Assert.Equal(ArmstrongCableStrikePhase.Southbound, decided.Phase);
        Assert.True(decided.NoLandingDecisionCommitted);
    }

    [Fact]
    public void MissingCableRestoresCheckpointWithFreshEpochAndRewoundSimulationTime() {
        var harness = new Harness(sequenceBeforeFirst: 9);
        harness.Controller.Begin(100);
        harness.Controller.Advance(Observation(200, 50) with {
            EnteredCableCorridor = true
        });

        ArmstrongCableStrikeSnapshot retry = harness.Controller.Advance(
            Observation(300, 75) with {
                ExitedCableCorridorWithoutContact = true
            });

        Assert.Equal(ArmstrongCableStrikePhase.AttackRun, retry.Phase);
        Assert.Equal(13, retry.ReconstructionEpochSequence);
        Assert.Equal(1, retry.RetryCount);
        Assert.Equal(300, retry.LastSourceTick);
        Assert.Equal(300, retry.EpochBeginSourceTick);
        Assert.Equal(0, retry.SimulationTick);
        Assert.Equal(0, retry.ActiveEpochTicks);
        Assert.False(retry.CableContactObserved);
        Assert.Equal(10, harness.Events[2].ReconstructionEpochSequence);
        Assert.Equal(
            ArmstrongCableStrikeEventKind.CheckpointRestoreRequested,
            harness.Events[2].Kind);
        Assert.Equal(13, harness.Events[3].Sequence);
        Assert.Equal(13, harness.Events[3].ReconstructionEpochSequence);
        Assert.Equal(
            ArmstrongCableStrikeEventKind.ReconstructionEpochStarted,
            harness.Events[3].Kind);
    }

    [Fact]
    public void NonAuthoritativeComponentContactIsRecordedThenRestartsWithoutDamage() {
        var harness = new Harness();
        harness.Controller.Begin(0);
        harness.Controller.Advance(Observation(1, 1) with {
            EnteredCableCorridor = true
        });
        CableContactRecord wrongComponent = Contact(harness.Definition) with {
            AircraftComponentId =
                "component.panther-subtype-unresolved.nose.reconstruction.v1"
        };

        ArmstrongCableStrikeSnapshot retry = harness.Controller.Advance(
            Observation(2, 2) with { CableContact = wrongComponent });

        Assert.Equal(ArmstrongCableStrikePhase.AttackRun, retry.Phase);
        Assert.Equal(1, retry.RetryCount);
        Assert.False(retry.VisibleDamage.IsPresent);
        Assert.Equal(
            new[] {
                ArmstrongCableStrikeEventKind.CableContact,
                ArmstrongCableStrikeEventKind.CheckpointRestoreRequested,
                ArmstrongCableStrikeEventKind.ReconstructionEpochStarted
            },
            harness.Events
                .Where(missionEvent => missionEvent.SourceTick == 2)
                .Select(missionEvent => missionEvent.Kind));
        Assert.DoesNotContain(harness.Events, missionEvent =>
            missionEvent.Kind == ArmstrongCableStrikeEventKind.DamageCommitted);
    }

    [Fact]
    public void ContactMustUseScenarioOwnedResponseProfileAndImpulse() {
        var harness = new Harness();
        harness.Controller.Begin(0);
        harness.Controller.Advance(Observation(1, 1) with {
            EnteredCableCorridor = true
        });
        CableContactRecord substituted = Contact(harness.Definition) with {
            ContactResponseProfileId = "response.substituted.v1"
        };

        ArmstrongCableStrikeSnapshot retry = harness.Controller.Advance(
            Observation(2, 2) with { CableContact = substituted });

        Assert.Equal(ArmstrongCableStrikePhase.AttackRun, retry.Phase);
        Assert.Equal(1, retry.RetryCount);
        Assert.DoesNotContain(harness.Events, missionEvent =>
            missionEvent.Kind == ArmstrongCableStrikeEventKind.DamageCommitted);
    }

    [Fact]
    public void LosingDamagedAircraftRestartsRatherThanInventingHistoricalDeath() {
        var harness = new Harness();
        harness.Controller.Begin(0);
        harness.Controller.Advance(Observation(1, 1) with {
            EnteredCableCorridor = true
        });
        harness.Controller.Advance(Observation(2, 2) with {
            CableContact = Contact(harness.Definition),
            DamageCommit = Damage(harness.Definition)
        });

        ArmstrongCableStrikeSnapshot retry = harness.Controller.Advance(
            Observation(3, 3) with { AircraftFlyable = false });

        Assert.Equal(ArmstrongCableStrikePhase.AttackRun, retry.Phase);
        Assert.Equal(1, retry.RetryCount);
        Assert.False(retry.VisibleDamage.IsPresent);
        Assert.Contains(harness.Events, missionEvent =>
            missionEvent.Kind
                == ArmstrongCableStrikeEventKind.CheckpointRestoreRequested
            && missionEvent.RetryReason
                == ArmstrongRetryReason.DamagedAircraftLost);
    }

    [Fact]
    public void ContactCannotBeSilentlyRelabelledAsAnAvoidedCorridor() {
        var harness = new Harness();
        harness.Controller.Begin(0);
        harness.Controller.Advance(Observation(1, 1) with {
            EnteredCableCorridor = true
        });
        harness.Controller.Advance(Observation(2, 2) with {
            CableContact = Contact(harness.Definition)
        });
        ArmstrongCableStrikeSnapshot before = harness.Controller.Snapshot;

        Assert.Throws<InvalidOperationException>(() =>
            harness.Controller.Advance(Observation(3, 3) with {
                ExitedCableCorridorWithoutContact = true
            }));

        Assert.Equal(before, harness.Controller.Snapshot);
    }

    [Fact]
    public void FailedAllocatorRollsBackTheWholeAuthorityTick() {
        var sequences = new Queue<long>(new long[] { 10, 10, 20 });
        var harness = new Harness(allocator: () => sequences.Dequeue());
        harness.Controller.Begin(1);
        ArmstrongCableStrikeSnapshot before = harness.Controller.Snapshot;

        Assert.Throws<InvalidOperationException>(() =>
            harness.Controller.Advance(Observation(2, 2) with {
                EnteredCableCorridor = true
            }));

        Assert.Equal(before, harness.Controller.Snapshot);
        Assert.Single(harness.Events);
        ArmstrongCableStrikeSnapshot recovered = harness.Controller.Advance(
            Observation(2, 2) with { EnteredCableCorridor = true });
        Assert.Equal(ArmstrongCableStrikePhase.CableCorridor, recovered.Phase);
        Assert.Equal(new long[] { 10, 20 },
            harness.Events.Select(missionEvent => missionEvent.Sequence));
    }

    [Fact]
    public void EventObserversSeeCommittedStateAndCannotReenterAuthority() {
        ArmstrongCableStrikeController? controller = null;
        ArmstrongCableStrikePhase? phaseSeen = null;
        bool reentryRejected = false;
        long sequence = 0;
        ArmstrongCableStrikeScenarioDefinition definition = Definition();
        controller = new ArmstrongCableStrikeController(
            definition,
            () => ++sequence,
            missionEvent => {
                if (missionEvent.Kind
                    != ArmstrongCableStrikeEventKind.DamageCommitted) return;
                phaseSeen = controller!.Snapshot.Phase;
                reentryRejected = Assert.Throws<InvalidOperationException>(() =>
                    controller.Advance(Observation(3, 3))).Message
                    .Contains("re-entered", StringComparison.Ordinal);
            });
        controller.Begin(0);
        controller.Advance(Observation(1, 1) with {
            EnteredCableCorridor = true
        });

        controller.Advance(Observation(2, 2) with {
            CableContact = Contact(definition),
            DamageCommit = Damage(definition)
        });

        Assert.Equal(ArmstrongCableStrikePhase.DamagedUnstable, phaseSeen);
        Assert.True(reentryRejected);
    }

    [Fact]
    public void ThrowingPostCommitObserverIsFailStopAndEventsAreNotReplayed() {
        ArmstrongCableStrikeController? controller = null;
        long sequence = 0;
        int corridorDeliveries = 0;
        controller = new ArmstrongCableStrikeController(
            Definition(),
            () => ++sequence,
            missionEvent => {
                if (missionEvent.Kind
                    != ArmstrongCableStrikeEventKind.CableCorridorEntered) return;
                corridorDeliveries++;
                throw new InvalidOperationException("presentation failed");
            });
        controller.Begin(0);

        Assert.Throws<InvalidOperationException>(() =>
            controller.Advance(Observation(1, 1) with {
                EnteredCableCorridor = true
            }));

        Assert.Equal(ArmstrongCableStrikePhase.CableCorridor,
            controller.Snapshot.Phase);
        Assert.Equal(2, controller.LatestEventSequence);
        controller.Advance(Observation(2, 2));
        Assert.Equal(1, corridorDeliveries);
    }

    [Fact]
    public void IdenticalObservationStreamsProduceIdenticalSnapshotsAndEvents() {
        var first = new Harness(sequenceBeforeFirst: 100);
        var second = new Harness(sequenceBeforeFirst: 100);

        IReadOnlyList<ArmstrongCableStrikeSnapshot> firstSnapshots =
            RunCompletedScript(first);
        IReadOnlyList<ArmstrongCableStrikeSnapshot> secondSnapshots =
            RunCompletedScript(second);

        Assert.Equal(firstSnapshots, secondSnapshots);
        Assert.Equal(first.Controller.Snapshot, second.Controller.Snapshot);
        Assert.Equal(first.Events, second.Events);
    }

    [Fact]
    public void ObserverSnapshotCannotExposeContactTimingOrAerodynamicCoefficients() {
        string[] forbiddenFragments = {
            "Coefficient",
            "Future",
            "RequiredInput",
            "CollisionTime"
        };

        Assert.DoesNotContain(
            typeof(ArmstrongCableStrikeSnapshot).GetProperties(),
            property => property.PropertyType == typeof(CableContactRecord)
                || property.PropertyType == typeof(AirframeAerodynamicState)
                || forbiddenFragments.Any(fragment =>
                    property.Name.Contains(fragment, StringComparison.Ordinal)));
    }

    [Fact]
    public void CarpenterCannotSubstituteVisibleDamageForPhysicalTruth() {
        var harness = new Harness();
        ReachInspection(harness, demonstrateMargin: true);
        VisibleAirframeDamage truth =
            harness.Definition.RightWingDamageProfile.VisibleDamage;
        var substituted = new VisibleAirframeDamage(
            truth.ProfileId!,
            truth.RightOuterWingAbsent,
            truth.RightTipTankAbsent,
            truth.RightAileron,
            truth.VisibleFuelLeak,
            visibleSmoke: !truth.VisibleSmoke,
            truth.LooseStructureVisible);
        var report = new CarpenterInspectionObservation(
            "actor.carpenter.v1",
            worldPosition: new Vec3D(20.0, 300.0, 0.0),
            relativePosition: new Vec3D(20.0, 0.0, 0.0),
            closureMps: 0.25,
            relativeRollRad: 0.05,
            lineOfSightClear: true,
            substituted);
        ArmstrongCableStrikeSnapshot before = harness.Controller.Snapshot;

        Assert.Throws<InvalidOperationException>(() =>
            harness.Controller.Advance(Observation(6, 6) with {
                Carpenter = report
            }));

        Assert.Equal(before, harness.Controller.Snapshot);
    }

    static IReadOnlyList<ArmstrongCableStrikeSnapshot> RunCompletedScript(
        Harness harness) {
        var snapshots = new List<ArmstrongCableStrikeSnapshot> {
            harness.Controller.Begin(0),
            harness.Controller.Advance(Observation(1, 1) with {
                EnteredCableCorridor = true
            }),
            harness.Controller.Advance(Observation(2, 2) with {
                CableContact = Contact(harness.Definition),
                DamageCommit = Damage(harness.Definition)
            }),
            harness.Controller.Advance(Observation(3, 3) with {
                StabilizationEnvelopeSatisfied = true,
                PilotLateralInput = 0.6,
                SlowFlightProbeComplete = true,
                RemainingRollAuthorityFraction = 0.1
            }),
            harness.Controller.Advance(Observation(4, 4) with {
                StabilizationEnvelopeSatisfied = true,
                PilotLateralInput = 0.6,
                SlowFlightProbeComplete = true,
                RemainingRollAuthorityFraction = 0.1
            }),
            harness.Controller.Advance(Observation(5, 5) with {
                Carpenter = Carpenter(harness.Definition)
            }),
            harness.Controller.Advance(Observation(6, 6) with {
                Carpenter = Carpenter(harness.Definition)
            }),
            harness.Controller.Advance(Observation(7, 7) with {
                Carpenter = Carpenter(harness.Definition)
            }),
            harness.Controller.Advance(Observation(8, 8) with {
                SouthboundGateReached = true
            })
        };
        return snapshots;
    }

    static void ReachInspection(Harness harness, bool demonstrateMargin) {
        harness.Controller.Begin(0);
        harness.Controller.Advance(Observation(1, 1) with {
            EnteredCableCorridor = true
        });
        harness.Controller.Advance(Observation(2, 2) with {
            CableContact = Contact(harness.Definition),
            DamageCommit = Damage(harness.Definition)
        });
        harness.Controller.Advance(Observation(3, 3) with {
            StabilizationEnvelopeSatisfied = true,
            PilotLateralInput = demonstrateMargin ? 0.6 : 0.0,
            SlowFlightProbeComplete = demonstrateMargin,
            RemainingRollAuthorityFraction = demonstrateMargin ? 0.1 : 1.0
        });
        harness.Controller.Advance(Observation(4, 4) with {
            StabilizationEnvelopeSatisfied = true,
            PilotLateralInput = demonstrateMargin ? 0.6 : 0.0,
            SlowFlightProbeComplete = demonstrateMargin,
            RemainingRollAuthorityFraction = demonstrateMargin ? 0.1 : 1.0
        });
        ArmstrongCableStrikeSnapshot inspection = harness.Controller.Advance(
            Observation(5, 5) with {
                Carpenter = Carpenter(harness.Definition)
            });
        Assert.Equal(ArmstrongCableStrikePhase.Inspection, inspection.Phase);
    }

    static ArmstrongCableStrikeObservation Observation(long sourceTick, long simulationTick) =>
        new(
            sourceTick,
            simulationTick,
            AircraftFlyable: true,
            TerrainClearanceM: 300.0,
            PlayerPosition: new Vec3D(0.0, 300.0, simulationTick),
            PlayerVelocity: new Vec3D(0.0, 0.0, 150.0));

    static CarpenterInspectionObservation Carpenter(
        ArmstrongCableStrikeScenarioDefinition definition) => new(
        "actor.carpenter.v1",
        worldPosition: new Vec3D(20.0, 300.0, 0.0),
        relativePosition: new Vec3D(20.0, 0.0, 0.0),
        closureMps: 0.25,
        relativeRollRad: 0.05,
        lineOfSightClear: true,
        definition.RightWingDamageProfile.VisibleDamage);

    static ArmstrongDamageCommitObservation Damage(
        ArmstrongCableStrikeScenarioDefinition definition) => new(
        definition.RightWingDamageProfile.Id,
        definition.RightWingDamageProfile.VisibleDamage);

    static CableContactRecord Contact(
        ArmstrongCableStrikeScenarioDefinition definition) {
        CableContactResponseProfile response =
            definition.RightOuterWingCollisionVolume.ResponseProfile;
        var sweep = new AircraftComponentSweep(
            ArmstrongCableStrikeScenarios.RightOuterWingComponentId,
            new Vec3D(0.0, 74.0, 0.0),
            new Vec3D(0.0, 78.0, 0.0),
            RadiusM: 0.25,
            TickDurationS: 1.0 / 120.0,
            CableCollisionLayer.PlayerAirframe,
            new CablePreContactState(
                new Vec3D(0.0, 300.0, 0.0),
                new Vec3D(0.0, 0.0, 150.0),
                QuaternionD.Identity,
                PilotLateralInput: 0.0,
                RudderInput: 0.0,
                NormalLoadDemandG: 1.0,
                Throttle: 0.85),
            definition.RightWingDamageProfile.Id,
            response);
        Assert.True(definition.CableField.TrySweepFirst(
            sweep, out CableContactRecord contact));
        return contact;
    }

    static ArmstrongCableStrikeScenarioDefinition Definition(
        double maximumLandingEnvelopeRollAuthorityFraction = 0.2,
        double maximumLimitedRollAuthorityFraction = 0.35) {
        ArmstrongCableStrikeScenarioDefinition builtIn =
            ArmstrongCableStrikeScenarios.CableToDecisionGreybox();
        return new ArmstrongCableStrikeScenarioDefinition(
            builtIn.Id,
            builtIn.AttackRunCheckpoint,
            builtIn.CableField,
            builtIn.RightOuterWingCollisionVolume,
            builtIn.RightWingDamageProfile,
            new DamageInspectionDefinition(
                maximumRangeM: 30.0,
                maximumAbsoluteClosureMps: 1.5,
                maximumAbsoluteRelativeRollRad: 0.3,
                requiredDwellTicks: 2),
            stabilizationDwellTicks: 2,
            maximumStabilizedAbsoluteRollRateRadS: 0.2,
            minimumStabilizationTerrainClearanceM: 100.0,
            sustainedLateralDemandTicks: 2,
            lateralDemandThreshold: 0.25,
            maximumLandingEnvelopeRollAuthorityFraction:
                maximumLandingEnvelopeRollAuthorityFraction,
            maximumLimitedRollAuthorityFraction:
                maximumLimitedRollAuthorityFraction);
    }

    sealed class Harness {
        long _sequence;

        public Harness(
            long sequenceBeforeFirst = 0,
            Func<long>? allocator = null,
            ArmstrongCableStrikeScenarioDefinition? definition = null) {
            _sequence = sequenceBeforeFirst;
            Definition = definition
                ?? ArmstrongCableStrikeControllerTests.Definition();
            Controller = new ArmstrongCableStrikeController(
                Definition,
                allocator ?? (() => ++_sequence),
                Events.Add);
        }

        public ArmstrongCableStrikeScenarioDefinition Definition { get; }
        public ArmstrongCableStrikeController Controller { get; }
        public List<ArmstrongCableStrikeEventRecord> Events { get; } = new();
    }
}
