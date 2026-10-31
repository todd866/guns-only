import {SLOT_COUNT, readSlots, createSlot, useSlot, eraseSlot, slotSave} from '../physics/save-slots.mjs';
import {createInventory, ITEMS} from '../physics/items.mjs';
import {LEGEND_CARS} from '../physics/vehicles.mjs';
import {COMBAT} from '../physics/combat.mjs';

// Zelda's file select for The Legend of Spirit Mountain: three files, one row each
// ([slot] [name] [items] [batteries] [car]). Keyboard first: arrows choose, Enter plays (or names a
// new file), Delete twice erases. Names stay in this browser (physics/save-slots.mjs).
export function createFileSelect({onPlay}) {
  const el = document.createElement('div');
  el.id = 'file-select';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Choose a save file');
  el.innerHTML = `<style>
#file-select{position:fixed;inset:0;z-index:900;display:grid;place-items:center;background:rgba(6,10,14,.72);font:15px system-ui;color:#f4ecd6}
#file-select .box{width:min(560px,calc(100vw - 32px));background:#11222b;border:1px solid #2c4a55;border-radius:12px;padding:18px 18px 12px}
#file-select h2{margin:0 0 12px;font:600 13px system-ui;letter-spacing:.22em;text-transform:uppercase;color:#bfe8e0;text-align:center}
#file-select h2 b{display:block;font:700 26px Georgia,serif;letter-spacing:.08em;color:#ffe9a8;text-transform:none}
#file-select ol{list-style:none;margin:0;padding:0;display:grid;gap:6px}
#file-select li{display:grid;grid-template-columns:28px minmax(0,1fr) auto 64px 108px;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;border:1px solid transparent;cursor:pointer;background:#0b171d}
#file-select li[aria-selected=true]{border-color:#e9b949;background:#1a2f38}
#file-select .n{font:700 18px system-ui;color:#e9b949;text-align:center}
#file-select .name{font:600 17px system-ui;overflow-wrap:anywhere}
#file-select .new{color:#8fa9b0;font-style:italic}
#file-select .bat,#file-select .car{font-variant-numeric:tabular-nums;text-align:right;color:#cfe3e8;white-space:nowrap}
#file-select input{font:600 17px system-ui;width:100%;background:#06242e;color:#fff;border:1px solid #4fc3ff;border-radius:6px;padding:3px 6px}
#file-select .keys{margin-top:10px;text-align:center;font-size:12px;letter-spacing:.08em;color:#8fa9b0}
#file-select .warn{color:#ff9b8a}
</style><div class="box"><h2>The Legend of<b>Spirit Mountain</b></h2><ol></ol><div class="keys"></div></div>`;
  document.body.appendChild(el);
  const list = el.querySelector('ol'),
    keys = el.querySelector('.keys');
  let sel = 0,
    naming = false,
    erasing = -1,
    store = null;
  try {
    store = localStorage;
  } catch {}
  const render = () => {
    const idx = store ? readSlots(store) : {slots: Array(SLOT_COUNT).fill(null)};
    list.innerHTML = '';
    idx.slots.forEach((slot, i) => {
      const li = document.createElement('li');
      li.setAttribute('aria-selected', String(i === sel));
      li.onclick = () => {
        sel = i;
        choose();
      };
      const inv = slot ? createInventory(slotSave(store, i)) : null,
        car = inv && LEGEND_CARS[inv.car];
      const name =
        naming && i === sel
          ? `<input maxlength="12" aria-label="Name for file ${i + 1}" placeholder="Your name">`
          : slot
            ? `<span class="name">${slot.name.replace(/[<&>]/g, '')}</span>`
            : '<span class="new">new file</span>';
      li.innerHTML =
        `<span class="n">${i + 1}</span>${name}<span title="${inv ? inv.items.map(id => ITEMS[id].name).join(', ') : ''}">${inv ? inv.items.map(id => ITEMS[id].icon).join('') : ''}</span>` +
        `<span class="bat" title="Batteries">${inv ? `🔋×${COMBAT.batteries.kid + inv.extraBatteries}` : ''}</span><span class="car" title="Car">${car ? car.name : ''}</span>`;
      list.appendChild(li);
    });
    keys.innerHTML =
      erasing >= 0
        ? `<span class="warn">Delete again to erase file ${erasing + 1} · Esc keeps it</span>`
        : naming
          ? 'Type a name · Enter to start · Esc to cancel'
          : '↑ ↓ choose · Enter play · Delete erase · Esc close';
    const input = list.querySelector('input');
    if (input) {
      input.focus();
      input.onkeydown = e => {
        e.stopPropagation();
        if (e.key === 'Enter' && store && createSlot(store, sel, input.value)) {
          naming = false;
          onPlay(sel);
        } else if (e.key === 'Escape') {
          naming = false;
          render();
        }
      };
    }
  };
  const choose = () => {
    if (!store) return;
    if (readSlots(store).slots[sel]) {
      useSlot(store, sel);
      onPlay(sel);
    } else {
      naming = true;
      render();
    }
  };
  const onKey = e => {
    if (el.hidden || naming) return;
    e.preventDefault();
    e.stopPropagation();
    if (erasing >= 0) {
      if (e.key === 'Delete' || e.key === 'Backspace') eraseSlot(store, erasing);
      erasing = -1;
      render();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 's') {
      sel = (sel + 1) % SLOT_COUNT;
      render();
    } else if (e.key === 'ArrowUp' || e.key === 'w') {
      sel = (sel + SLOT_COUNT - 1) % SLOT_COUNT;
      render();
    } else if (e.key === 'Enter' || e.key === ' ') choose();
    else if ((e.key === 'Delete' || e.key === 'Backspace') && store && readSlots(store).slots[sel]) {
      erasing = sel;
      render();
    } else if (e.key === 'Escape') close();
  };
  const close = () => {
    el.hidden = true;
    window.removeEventListener('keydown', onKey, true);
  };
  return {
    get open() {
      return !el.hidden;
    },
    show() {
      if (store) sel = readSlots(store).active;
      naming = false;
      erasing = -1;
      el.hidden = false;
      render();
      window.addEventListener('keydown', onKey, true);
    },
    close
  };
}
