using System.Runtime.CompilerServices;

// The opt-in lab uses the same command seam as BanditPressureReport. Keep it internal
// to avoid exposing state-changing test controls to the browser or production hosts.
[assembly: InternalsVisibleTo("GunsOnly.PlaytestLab")]
