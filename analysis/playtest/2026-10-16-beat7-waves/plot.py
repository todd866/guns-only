"""Plot per-seed ace gates from the saved cohort; no simulation or display server."""
import gzip
import json
import os
from pathlib import Path

os.environ.setdefault('MPLCONFIGDIR', '/tmp/beat7-wave-matplotlib')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

root = Path(__file__).resolve().parent


def aces(folder):
    manifest = json.loads((folder/'manifest.json').read_text())
    rows = [json.load(gzip.open(folder/p)) for p in manifest['runs'] if '/ace-' in p]
    rows.sort(key=lambda r: r['seed'])
    assert [r['seed'] for r in rows] == list(range(30))
    return rows


new = aces(root/'land-autopilot')
old = aces(root.parent/'2026-10-16-beat7-rtb/land-autopilot')
x = list(range(30))
fig, axes = plt.subplots(3, 1, figsize=(11, 8), sharex=True, layout='constrained')
fig.suptitle('Beat 7 · ace · 30 paired seeds · land + RTB autopilot', fontsize=14)
axes[0].axhspan(300, 480, color='#dcfce7', label='300–480 s target')
axes[0].bar(x, [r['perceivedSeconds'] for r in new], color='#1d4ed8', label='Waves')
axes[0].scatter(x, [r['perceivedSeconds'] for r in old], facecolors='white',
                edgecolors='#111827', s=24, zorder=3, label='Prior finite sortie')
axes[0].set_ylabel('Perceived sortie (s)')
axes[0].legend(loc='upper right', fontsize=8, ncol=3)
shares = [100 * sum(r['phaseSeconds'].get(p, 0) for p in ('merge', 'fight', 'defensive'))
          / r['perceivedSeconds'] for r in new]
axes[1].bar(x, shares, color='#1d4ed8')
axes[1].axhline(40, color='#15803d', linestyle='--', label='≥40% target')
axes[1].set_ylabel('Combat share (%)')
axes[1].set_ylim(0, 100)
axes[1].legend(loc='upper right', fontsize=8)
dead = [r['longestDeadAirExcludingRtbAutopilotSeconds'] for r in new]
axes[2].bar(x, dead, color=['#b91c1c' if d > 30 else '#15803d' for d in dead])
axes[2].axhline(30, color='#15803d', linestyle='--', label='≤30 s target')
axes[2].set_ylabel('Longest dead air (s)\nRTB AP excluded')
axes[2].set_xlabel('Seed')
axes[2].legend(loc='upper right', fontsize=8)
for ax in axes:
    ax.spines[['top', 'right']].set_visible(False)
    ax.grid(axis='y', alpha=.18)
    ax.set_axisbelow(True)
    ax.set_xticks(x)
    ax.tick_params(labelsize=8)
fig.savefig(root/'ace-gates.png', dpi=160)
fig.savefig(root/'ace-gates.svg')
svg = root/'ace-gates.svg'
svg.write_text('\n'.join(line.rstrip() for line in svg.read_text().splitlines()) + '\n')
print(root/'ace-gates.png')
