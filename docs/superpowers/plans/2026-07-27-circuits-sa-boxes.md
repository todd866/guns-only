# Circuits SA Implementation Plan

> **For agentic workers:** Implement task-by-task.

**Goal:** Military overhead Circuits with traffic/comms, threshold padlock, Circuits nav, failure practice, draggable consoles.

**Architecture:** Kernel owns pattern geometry + kinematic traffic + fault flags on `PatternOnly`. Browser owns padlock/Tab, nav/systems, drag, comms line.

## Global Constraints

- Military overhead (INITIAL → BREAK → DOWNWIND → BASE → SHORT_FINAL → WIRE_FINAL)
- Mirage/F-104 brick speeds; cheap attritable failures

### Task 1: Overhead pattern geometry
### Task 2: Circuit traffic + snapshot
### Task 3: Padlock / Tab Circuits grammar
### Task 4: Nav console + drag
### Task 5: Attritable failures
### Task 6: Verify
