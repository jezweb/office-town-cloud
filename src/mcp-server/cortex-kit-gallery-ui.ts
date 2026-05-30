// Kit gallery — a playground panel that demonstrates the interaction range of
// the MCP-UI primitive: buttons, a drag-to-reorder list, and a form with
// controls. Every control funnels its captured value into act(prompt) so you
// can see exactly what instruction the agent would receive. Purely educational
// (no backend) — the point is to understand what the primitive can do.

import { esc, uiPage } from './ui-kit';

const DEMO_TASKS = ['Ship the task board', 'Wire the session-start pull', 'Test it in Goose Desktop'];

export function renderKitGallery(): string {
	const items = DEMO_TASKS.map(
		(t) => `<li class="card drag" draggable="true"><span class="grip">⋮⋮</span><span class="t">${esc(t)}</span></li>`,
	).join('');

	const body = `
    <section>
      <h2>1 · Buttons → an action</h2>
      <p class="note">A button posts a <code>prompt</code> action. Goose injects it into chat; the agent acts.</p>
      <div class="row"><button class="btn primary" onclick='act("The kit gallery button fired — this text was injected into chat by a panel.")'>Fire a prompt</button></div>
    </section>

    <section>
      <h2>2 · Reorder — drag the cards</h2>
      <p class="note">Dragging happens live in the panel (pure JS). "Apply" captures the new order and sends it.</p>
      <ul id="tasks" style="list-style:none;padding:0;margin:0;">${items}</ul>
      <div class="row" style="margin-top:8px;"><button class="btn primary sm" onclick="applyOrder()">Apply this order</button></div>
    </section>

    <section>
      <h2>3 · A form with controls</h2>
      <div class="card">
        <div class="field"><label>Task title</label><input id="f-title" placeholder="e.g. Call the Acme account"></div>
        <div class="field"><label>Priority</label>
          <select id="f-pri"><option>low</option><option selected>normal</option><option>high</option></select>
        </div>
        <label class="chk" style="margin:4px 0 12px;"><input type="checkbox" id="f-urgent"> Mark urgent</label>
        <div class="row"><button class="btn primary sm" onclick="createTask()">Create task</button></div>
      </div>
    </section>

    <script>
      // Drag-to-reorder (HTML5 dnd — works inside the sandboxed iframe).
      var dragEl = null;
      function wire(li) {
        li.addEventListener('dragstart', function(){ dragEl = li; setTimeout(function(){ li.style.opacity = '.4'; }, 0); });
        li.addEventListener('dragend',   function(){ li.style.opacity = ''; document.querySelectorAll('#tasks .drag').forEach(function(x){ x.classList.remove('over'); }); });
        li.addEventListener('dragover',  function(e){ e.preventDefault(); if (!dragEl || dragEl === li) return; li.classList.add('over');
          var list = li.parentNode, kids = Array.prototype.slice.call(list.children);
          if (kids.indexOf(dragEl) < kids.indexOf(li)) li.after(dragEl); else li.before(dragEl); });
        li.addEventListener('dragleave', function(){ li.classList.remove('over'); });
      }
      document.querySelectorAll('#tasks .drag').forEach(wire);

      function applyOrder() {
        var order = Array.prototype.map.call(document.querySelectorAll('#tasks .t'), function(el){ return el.textContent.trim(); });
        act('I reordered my tasks to this sequence — ' + order.map(function(t,i){ return (i+1)+') '+t; }).join('  '));
      }
      function createTask() {
        var t = (document.getElementById('f-title').value || '').trim();
        var p = document.getElementById('f-pri').value;
        var u = document.getElementById('f-urgent').checked;
        if (!t) { act('(kit gallery: the form needs a task title)'); return; }
        act('Create a task: "' + t + '" — priority ' + p + (u ? ', urgent' : '') + '.');
      }
    </script>`;

	return uiPage({
		title: 'Cortex UI Kit — what the primitive can do',
		subtitle: 'A playground. Each control captures a value and shows you the instruction it would send the agent.',
		body,
	});
}
