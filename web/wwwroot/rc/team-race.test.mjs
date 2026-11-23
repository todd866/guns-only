import test from 'node:test';
import assert from 'node:assert/strict';
import {bestPlace, teamCard, p2LapChip, TEAM_MEDAL} from './team-race.mjs';

test('team place is the better finishing place', () => {
  assert.equal(bestPlace(3, 1), 1);
  assert.equal(bestPlace(1, 4), 1);
  assert.equal(bestPlace(2, 2), 2);
  assert.equal(bestPlace(5, 4), 4);
});

test('end card names the team medal and both places', () => {
  assert.equal(teamCard(3, 1), 'Team 🥇 · P1 3rd · P2 1st');
  assert.equal(teamCard(2, 5), 'Team 🥈 · P1 2nd · P2 5th');
  assert.equal(teamCard(6, 3), 'Team 🥉 · P1 6th · P2 3rd');
  assert.equal(teamCard(4, 8), 'Team 4th · P1 4th · P2 8th');
  assert.equal(TEAM_MEDAL[1], '🥇');
});

test('ordinal teens stay th', () => {
  assert.equal(teamCard(11, 12), 'Team 11th · P1 11th · P2 12th');
  assert.equal(teamCard(13, 21), 'Team 13th · P1 13th · P2 21st');
  assert.equal(teamCard(22, 23), 'Team 22nd · P1 22nd · P2 23rd');
});

test('P2 lap chip counts laps or gates', () => {
  assert.equal(p2LapChip({lap: 2, laps: 3, gate: 4}), 'P2 LAP 2/3');
  assert.equal(p2LapChip({lap: 1, laps: 1, gate: 3}, 8), 'P2 4/8');
  assert.equal(
    p2LapChip({lap: 1, laps: 1, gate: 7, course: {checkpoints: Array(8).fill(0)}}),
    'P2 8/8'
  );
});
