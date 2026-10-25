/*
 * SaySo prototype UI. Renders state and forwards every action to SaySo.core.
 * Screens never change balances or statuses themselves.
 */
(function () {
  'use strict';
  var S = window.SaySo, core = S.core;

  // ---------- state ----------
  function freshData() { return { st: S.seed.build(), ui: { role: 'sunita', view: 'overview', param: null } }; }
  var data = S.store.load() || freshData();
  var st = data.st, ui = data.ui;
  var tmp = {
    modal: null, drawer: false, checks: null, resetArm: false, reqTab: 'pending', logFilter: 'all',
    agentForm: {}, agentErrors: {}, agentOut: null, fundForm: { keyHolder: 'sunita' }, fundErrors: null, inline: {}
  };
  function persist() { S.store.save({ st: st, ui: ui }); }

  var ROLES = [
    { id: 'sunita', label: 'Sunita', sub: 'Key-holder' },
    { id: 'rohan', label: 'Rohan', sub: 'Account owner' },
    { id: 'agent:rohan', label: 'Rohan’s agent', sub: 'AI agent' },
    { id: 'agent:aarav', label: 'Aarav’s agent', sub: 'AI agent' }
  ];
  var NAV_HUMAN = [['overview', 'Overview'], ['funds', 'Funds'], ['requests', 'Requests'], ['activity', 'Activity log'], ['access', 'Access & rules']];
  var NAV_AGENT = [['ask', 'Ask for money'], ['myrequests', 'My requests'], ['activity', 'Activity log'], ['access', 'Access & rules']];

  // ---------- formatting ----------
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dt(t, year) {
    var d = new Date(t);
    return DAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + (year ? ' ' + d.getUTCFullYear() : '') + ', ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
  }
  function day(t) { var d = new Date(t); return DAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MON[d.getUTCMonth()]; }
  function left(ms) {
    if (ms <= 0) return 'expired';
    var m = Math.floor(ms / 60000), h = Math.floor(m / 60); m %= 60;
    return (h ? h + ' h ' : '') + m + ' m left';
  }
  function inr(n, paise) {
    var s = Math.floor(Math.abs(n)).toString(), last3 = s.slice(-3), rest = s.slice(0, -3);
    if (rest) last3 = ',' + last3;
    rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return (n < 0 ? '−' : '') + '₹' + rest + last3 + (paise ? '.00' : '');
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function who(actor) { return core.PEOPLE[actor] ? core.PEOPLE[actor].name : actor; }
  function isAgent() { return core.isAgent(ui.role); }

  // ---------- icons ----------
  var P = {
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    ban: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
    dot: '<circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 018 0v3"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L19 4M16 7l2.5 2.5M13.5 9.5l2 2"/>',
    shield: '<path d="M12 3l7 3v5.2c0 4.4-3 7.9-7 9.8-4-1.9-7-5.4-7-9.8V6z"/>',
    bot: '<rect x="4.5" y="8" width="15" height="11" rx="3.5"/><path d="M12 4.5V8"/><circle cx="9.3" cy="13.5" r="1.2" fill="currentColor"/><circle cx="14.7" cy="13.5" r="1.2" fill="currentColor"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.4"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><path d="M4 4l16 16"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 001.8 3h10.4A2 2 0 0019 18l-5-9V3"/>'
  };
  function ic(name, cls) { return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P[name] + '</svg>'; }

  var STATUS = {
    pending: ['Pending', 'dot'], paid: ['Paid', 'check'], refused: ['Refused', 'x'], expired: ['Expired', 'clock'],
    withdrawn: ['Withdrawn', 'undo'], blocked: ['Blocked', 'ban'], held: ['Held', 'lock'], met: ['Purpose met', 'check'],
    invited: ['Awaiting key-holder', 'clock'], declined: ['Declined', 'x'], invite_expired: ['Invitation lapsed', 'clock'], info: ['Done', 'check']
  };
  function pill(s, text) { var d = STATUS[s] || [s, 'dot']; return '<span class="pill s-' + s + '">' + ic(d[1]) + esc(text || d[0]) + '</span>'; }
  function avatar(actor) {
    if (core.isAgent(actor)) return '<span class="av av-agent" title="' + esc(who(actor)) + '">' + ic('bot') + '</span>';
    if (actor === 'system') return '<span class="av av-sys" title="SaySo">' + ic('shield') + '</span>';
    return '<span class="av av-' + actor + '">' + esc(who(actor).charAt(0)) + '</span>';
  }
  function fundState(f) {
    if (f.status === 'active') {
      var paid = st.requests.some(function (r) { return r.fundId === f.id && r.status === 'paid'; });
      return f.available === 0 && paid ? 'met' : 'held';
    }
    return f.status;
  }

  // ---------- shared pieces ----------
  function emptyState(title, body) { return '<div class="empty">' + ic('info') + '<div><b>' + esc(title) + '</b><p>' + esc(body) + '</p></div></div>'; }
  function backLink(view, label) { return '<button class="back" data-act="go" data-view="' + view + '">' + ic('back') + esc(label) + '</button>'; }
  function inlineResult(key) {
    var r = tmp.inline[key];
    if (!r) return '';
    return '<div class="result ' + (r.ok ? 'ok' : 'bad') + '" role="status">' + ic(r.ok ? 'check' : 'ban') +
      '<div><b>' + (r.ok ? 'Done' : 'Blocked · <code>' + esc(r.code) + '</code>') + '</b><p>' + esc(r.message || '') + '</p><span class="muted small">Recorded in the activity log.</span></div></div>';
  }

  // ---------- top ----------
  function renderTop() {
    var seg = ROLES.map(function (r) {
      return '<button class="seg-b' + (ui.role === r.id ? ' on' : '') + '" data-act="role" data-id="' + r.id + '" aria-pressed="' + (ui.role === r.id) + '">' +
        avatar(r.id) + '<span><b>' + esc(r.label) + '</b><small>' + esc(r.sub) + '</small></span></button>';
    }).join('');
    var opts = ROLES.map(function (r) { return '<option value="' + r.id + '"' + (ui.role === r.id ? ' selected' : '') + '>' + esc(r.label + ' · ' + r.sub) + '</option>'; }).join('');
    document.getElementById('top').innerHTML =
      '<div class="brand">' + '<span class="logo">' + ic('key') + '</span><div><b>SaySo</b><span>Your AI can predict your yes. It still cannot give it.</span></div></div>' +
      '<div class="who"><span class="lbl">Viewing as</span><div class="seg" role="group" aria-label="Choose demo user">' + seg + '</div>' +
      '<label class="seg-sel"><span class="sr">Choose demo user</span><select id="roleSel">' + opts + '</select></label></div>' +
      '<button class="clock" data-act="drawer" title="Open demo controls">' + ic('clock') + '<span><b>' + dt(st.now) + '</b><small>Simulated clock · Demo controls</small></span></button>';

    var ctx = {
      sunita: ['sunita', 'You are <b>Sunita Sharma</b>, key-holder. Only you can pay or refuse requests from your funds.'],
      rohan: ['rohan', 'You are <b>Rohan Sharma</b>, account owner. You created the funds but hold no key: no balances, no decisions.'],
      'agent:rohan': ['agent', 'You are <b>Rohan’s agent</b>, a simulated AI agent. You can ask for money and track your own requests. You cannot see balances or pay.'],
      'agent:aarav': ['agent', 'You are <b>Aarav’s agent</b>, a simulated AI agent. You can ask for money and track your own requests. You cannot see balances or pay.']
    }[ui.role];
    var c = document.getElementById('ctx');
    c.className = 'ctx ctx-' + ctx[0];
    c.innerHTML = '<div class="inner">' + avatar(ui.role) + '<p>' + ctx[1] + '</p></div>';
  }

  function renderNav() {
    var items = isAgent() ? NAV_AGENT : NAV_HUMAN;
    var pend = isAgent() ? 0 : core.requestsFor(st, ui.role).filter(function (r) { return r.status === 'pending'; }).length;
    var active = { fund: 'funds', request: 'requests' }[ui.view] || ui.view;
    document.getElementById('nav').innerHTML = '<ul>' + items.map(function (it) {
      var badge = it[0] === 'requests' && pend ? '<span class="badge">' + pend + '</span>' : '';
      return '<li><button class="nav-b' + (active === it[0] ? ' on' : '') + '" data-act="go" data-view="' + it[0] + '"' + (active === it[0] ? ' aria-current="page"' : '') + '>' + esc(it[1]) + badge + '</button></li>';
    }).join('') + '</ul>';
  }

  // ---------- human views ----------
  function greeting() { var h = new Date(st.now).getUTCHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }

  function fundCard(f) {
    var holder = ui.role === f.keyHolder, state = fundState(f);
    var pendingSum = st.requests.filter(function (r) { return r.fundId === f.id && r.status === 'pending'; }).reduce(function (s, r) { return s + r.amount; }, 0);
    var c = core.outcomeCounts(st, f.id);
    var body;
    if (f.status === 'invited') {
      body = '<div class="amts"><div><span class="k">Committed</span><b class="big">' + inr(f.committed) + '</b></div><div><span class="k">Held</span><b>' + inr(0) + '</b></div></div>' +
        '<p class="note">' + ic('info') + '<span>Nothing is protected until ' + esc(who(f.keyHolder).split(' ')[0]) + ' accepts. Invitation open until ' + dt(f.inviteExpiresAt) + '.</span></p>';
    } else if (f.status !== 'active') {
      body = '<p class="note">' + ic('info') + '<span>No money is held in this fund.</span></p>';
    } else if (holder) {
      var spent = f.committed - f.available;
      body = '<div class="amts"><div><span class="k">Available</span><b class="big">' + inr(f.available) + '</b></div><div><span class="k">Committed</span><b>' + inr(f.committed) + '</b></div></div>' +
        '<div class="bar" aria-hidden="true"><i style="width:' + Math.round(spent / f.committed * 100) + '%"></i></div>' +
        '<p class="fine">' + inr(spent) + ' paid out' + (pendingSum ? ' · ' + inr(pendingSum) + ' requested, not debited' : '') + '</p>';
    } else {
      body = '<div class="amts"><div><span class="k">Balance</span><b class="hidden-v">' + ic('eye') + 'Visible to ' + esc(who(f.keyHolder).split(' ')[0]) + ' only</b></div><div><span class="k">Committed</span><b>' + inr(f.committed) + '</b></div></div>' +
        '<p class="fine">Pending ' + c.pending + ' · Paid ' + c.paid + ' · Refused ' + c.refused + ' · Expired ' + c.expired + '</p>';
    }
    return '<button class="fund" data-act="go" data-view="fund" data-id="' + f.id + '">' +
      '<div class="fund-h"><b>' + esc(f.name) + '</b>' + pill(state) + '</div>' +
      '<p class="muted">' + esc(f.purpose) + '</p>' + body +
      '<div class="fund-f">' + ic('key') + 'Key-holder: ' + (holder ? 'you' : esc(who(f.keyHolder))) + (f.status === 'active' ? '<span class="prot">' + ic('shield') + 'Agents cannot spend</span>' : '') + '</div></button>';
  }

  function inviteCard(f) {
    return '<div class="card invite"><div class="invite-h">' + ic('key') + '<div><b>' + esc(who(f.createdBy)) + ' wants you to hold the key to “' + esc(f.name) + '”</b>' +
      '<p>' + inr(f.committed) + ' for: ' + esc(f.purpose) + '. If you accept, only you can pay from it. Rohan will not be able to see the balance or withdraw alone.</p></div></div>' +
      '<div class="row-actions"><button class="btn ghost" data-act="decline" data-id="' + f.id + '">Decline</button><button class="btn primary" data-act="accept" data-id="' + f.id + '">Accept the key</button></div></div>';
  }

  function reqRow(r) {
    var v = core.requestView(st, ui.role, r);
    var amount = v.amountHidden ? '<span class="hidden-v">' + ic('eye') + 'Hidden</span>' : inr(v.amount);
    var when = r.status === 'pending' ? '<span class="' + (r.expiresAt - st.now < 3 * core.HOUR ? 'warn' : 'muted') + '">' + left(r.expiresAt - st.now) + '</span>' : '<span class="muted">' + day(r.decidedAt || r.createdAt) + '</span>';
    return '<button class="row" data-act="go" data-view="request" data-id="' + r.id + '">' + avatar(r.requester) +
      '<span class="row-main"><b>' + esc(r.recipient) + '</b><span class="muted">' + esc(who(r.requester)) + ' · ' + esc(r.purpose) + '</span></span>' +
      '<span class="row-amt">' + amount + (v.overBalance ? '<span class="flag">Exceeds balance</span>' : '') + '</span>' +
      '<span class="row-st">' + pill(r.status) + when + '</span></button>';
  }

  function activityList(events, limit) {
    if (!events.length) return emptyState('No activity yet', 'Requests, decisions and blocked attempts will appear here.');
    return '<ul class="mini-log">' + events.slice(0, limit).map(function (e) {
      var def = core.EVENTS[e.type];
      var r = e.requestId && core.reqById(st, e.requestId), f = e.fundId && core.fundById(st, e.fundId);
      return '<li>' + avatar(e.actor) + '<div><b>' + esc(def.label) + '</b><span class="muted">' + esc(who(e.actor)) + ' · ' + (r ? esc(r.recipient) : f ? esc(f.name) : '') + ' · ' + dt(e.at) + '</span></div>' +
        (def.tone === 'blocked' ? pill('blocked') : '') + '</li>';
    }).join('') + '</ul>';
  }

  function vOverview() {
    var funds = core.fundsFor(st, ui.role);
    var reqs = core.requestsFor(st, ui.role);
    var pending = reqs.filter(function (r) { return r.status === 'pending'; }).sort(function (a, b) { return a.expiresAt - b.expiresAt; });
    var html = '<section class="hello"><p class="eyebrow">Sharma household · Ludhiana · 2 adults, 2 AI agents</p><h1>' + greeting() + ', ' + esc(who(ui.role).split(' ')[0]) + '</h1>';
    if (ui.role === 'sunita') {
      var held = funds.filter(function (f) { return f.keyHolder === 'sunita' && f.status === 'active'; }).length;
      html += '<p class="lede">You hold the key to ' + held + ' fund' + (held === 1 ? '' : 's') + '. Agents can ask. Only you can pay.</p></section>';
      html += funds.filter(function (f) { return f.keyHolder === 'sunita' && f.status === 'invited'; }).map(inviteCard).join('');
      html += '<div class="grid-2"><section class="card focus"><h2>' + (pending.length ? pending.length + ' request' + (pending.length === 1 ? '' : 's') + ' waiting for you' : 'Nothing waiting for you') + '</h2>' +
        (pending.length ? '<div class="rows">' + pending.slice(0, 3).map(reqRow).join('') + '</div><button class="btn primary wide" data-act="go" data-view="requests">Review requests' + ic('arrow') + '</button>'
          : emptyState('All decided', 'When an agent asks for money from one of your funds, the request appears here for you to pay or refuse.')) + '</section>';
    } else {
      html += '<p class="lede">You created ' + funds.length + ' fund' + (funds.length === 1 ? '' : 's') + '. Sunita holds the key. You see status and outcomes, not balances or amounts.</p></section>';
      html += '<div class="grid-2"><section class="card focus"><h2>Commit money for a purpose</h2><p class="muted">Lock an amount so that neither your agent nor you on a weak day can spend it. Sunita decides every payment.</p>' +
        '<button class="btn primary wide" data-act="go" data-view="funds">' + ic('plus') + 'Create a held fund</button>' +
        '<p class="fine">' + pending.length + ' request' + (pending.length === 1 ? ' is' : 's are') + ' waiting for Sunita.</p></section>';
    }
    html += '<section class="card"><div class="card-h"><h2>Recent activity</h2><button class="link" data-act="go" data-view="activity">Open activity log</button></div>' + activityList(core.logFor(st, ui.role), 5) + '</section></div>';
    html += '<h2 class="sec">' + (ui.role === 'sunita' ? 'Your held funds' : 'Funds you created') + '</h2><div class="funds">' + funds.map(fundCard).join('') + '</div>';
    return html;
  }

  function fundForm() {
    var v = tmp.fundForm, e = tmp.fundErrors;
    return '<section class="card"><h2>' + ic('plus') + 'Commit money to a new held fund</h2>' +
      '<p class="muted">Step 1 of 2, Commit. Step 2, Accept: Sunita must accept before anything is protected. If she declines or does not answer in 7 days, no money is held.</p>' +
      '<form class="form" data-form="fund" novalidate>' +
      field('fund', 'name', 'Fund name', 'text', v.name, 'Lohri Fund') +
      field('fund', 'purpose', 'Purpose', 'text', v.purpose, 'Lohri bonfire, rewari and gifts') +
      field('fund', 'amount', 'Amount to commit (₹)', 'number', v.amount, '3000') +
      '<label class="fld"><span>Key-holder</span><select name="keyHolder" data-form-field="fund"><option value="sunita">Sunita Sharma</option><option value="rohan"' + (v.keyHolder === 'rohan' ? ' selected' : '') + '>Rohan Sharma (you)</option></select>' +
      '<small class="help">The key-holder alone decides payments. You cannot hold your own fund.</small></label>' +
      (e ? '<p class="err" role="alert">' + ic('ban') + esc(e) + '</p>' : '') +
      '<div class="row-actions"><button type="button" class="btn ghost" data-act="fund-example">Fill an example</button><button type="submit" class="btn primary">Commit and invite key-holder</button></div></form></section>';
  }

  function field(form, name, label, type, value, ph, err, help) {
    return '<label class="fld' + (err ? ' has-err' : '') + '"><span>' + esc(label) + '</span><input name="' + name + '" type="' + type + '" value="' + esc(value || '') + '" placeholder="' + esc(ph) + '" data-form-field="' + form + '"' +
      (type === 'number' ? ' inputmode="numeric" min="1" step="1"' : '') + (err ? ' aria-invalid="true"' : '') + '>' +
      (err ? '<small class="err-t">' + esc(core.CODES[err]) + '</small>' : help ? '<small class="help">' + esc(help) + '</small>' : '') + '</label>';
  }

  function vFunds() {
    var funds = core.fundsFor(st, ui.role);
    var html = '<header class="ph"><h1>Funds</h1><p class="lede">' + (ui.role === 'sunita' ? 'Money set aside for a purpose. You hold the key to each one.' : 'Funds you created. Sunita holds the key.') + '</p></header>';
    if (ui.role === 'sunita') html += funds.filter(function (f) { return f.keyHolder === 'sunita' && f.status === 'invited'; }).map(inviteCard).join('');
    html += '<div class="funds">' + funds.map(fundCard).join('') + '</div>';
    if (ui.role === 'rohan') html += fundForm();
    return html;
  }

  function vFund() {
    var f = core.fundById(st, ui.param);
    if (!f || core.fundsFor(st, ui.role).indexOf(f) === -1) return backLink('funds', 'Funds') + emptyState('Fund not available', 'This fund does not exist or is not visible to this user.');
    var holder = ui.role === f.keyHolder;
    var reqs = st.requests.filter(function (r) { return r.fundId === f.id; }).sort(function (a, b) { return b.createdAt - a.createdAt; });
    var pending = reqs.filter(function (r) { return r.status === 'pending'; });
    var done = reqs.filter(function (r) { return r.status !== 'pending'; });
    var pendingSum = pending.reduce(function (s, r) { return s + r.amount; }, 0);
    var html = backLink('funds', 'Funds') + '<header class="ph"><div class="ph-row"><h1>' + esc(f.name) + '</h1>' + pill(fundState(f)) + '</div><p class="lede">' + esc(f.purpose) + '</p></header>';
    if (f.status === 'active') {
      html += '<div class="stats">';
      if (holder) {
        html += stat('Available to pay', inr(f.available), 'big') + stat('Committed', inr(f.committed)) + stat('Paid out', inr(f.committed - f.available)) + stat('Requested, not debited', inr(pendingSum), '', 'Pending requests do not reduce the balance until you pay.');
      } else {
        var c = core.outcomeCounts(st, f.id);
        html += '<div class="stat"><span class="k">Balance</span><b class="hidden-v">' + ic('eye') + 'Visible to Sunita only</b><button class="link" data-act="read-balance" data-id="' + f.id + '">Try to view balance</button></div>' +
          stat('Committed', inr(f.committed)) + stat('Paid / refused / expired', c.paid + ' / ' + c.refused + ' / ' + c.expired) + stat('Pending', String(c.pending));
      }
      html += '</div>' + inlineResult('bal-' + f.id);
      html += '<div class="shield-note">' + ic('shield') + '<p><b>Protected from direct AI spending.</b> Agents see only “' + esc(f.name) + ' · held”. They can ask; they cannot see the balance, change a request or pay.</p></div>';
    } else {
      html += '<div class="shield-note">' + ic('info') + '<p>' + (f.status === 'invited' ? 'Waiting for ' + esc(who(f.keyHolder)) + ' to accept. Nothing is protected yet and no money is held.' : 'No money is held in this fund.') + '</p></div>';
    }
    html += '<dl class="meta">' + kv('Key-holder', who(f.keyHolder) + (holder ? ' (you)' : '')) + kv('Created by', who(f.createdBy) + ', ' + dt(f.createdAt, true)) +
      (f.acceptedAt ? kv('Key accepted', dt(f.acceptedAt, true)) : '') + (f.useBy ? kv('Use by', dt(f.useBy, true)) : '') + '</dl>';
    if (f.status === 'active') {
      html += '<h2 class="sec">Waiting for a decision</h2>' + (pending.length ? '<div class="rows">' + pending.map(reqRow).join('') + '</div>'
        : emptyState('No requests waiting', 'When an agent asks for money from ' + f.name + ', the request will appear here for ' + (holder ? 'you' : 'Sunita') + ' to decide.'));
      html += '<h2 class="sec">Decided</h2>' + (done.length ? '<div class="rows">' + done.map(reqRow).join('') + '</div>' : emptyState('Nothing decided yet', 'Paid, refused and expired requests will be listed here.'));
    }
    return html;
  }
  function stat(k, v, cls, help) { return '<div class="stat"><span class="k">' + esc(k) + '</span><b class="' + (cls || '') + '">' + v + '</b>' + (help ? '<small class="muted">' + esc(help) + '</small>' : '') + '</div>'; }
  function kv(k, v) { return '<div><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>'; }

  function vRequests() {
    var all = core.requestsFor(st, ui.role).slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
    var pending = all.filter(function (r) { return r.status === 'pending'; }).sort(function (a, b) { return a.expiresAt - b.expiresAt; });
    var decided = all.filter(function (r) { return r.status !== 'pending'; });
    var tabs = [['pending', 'Waiting', pending], ['decided', 'Decided', decided], ['all', 'All', all]];
    var cur = tabs.filter(function (t) { return t[0] === tmp.reqTab; })[0] || tabs[0];
    var html = '<header class="ph"><h1>Requests</h1><p class="lede">' + (ui.role === 'sunita' ? 'Every payment an agent has asked for. Open one to pay or refuse.' : 'Requests on your funds. Only Sunita can decide them; amounts are hidden from you.') + '</p></header>';
    html += '<div class="tabs" role="tablist">' + tabs.map(function (t) { return '<button role="tab" class="tab' + (t === cur ? ' on' : '') + '" aria-selected="' + (t === cur) + '" data-act="req-tab" data-id="' + t[0] + '">' + t[1] + ' <span>' + t[2].length + '</span></button>'; }).join('') + '</div>';
    var list = cur === tabs[0] ? pending : cur[2];
    html += list.length ? '<div class="rows">' + list.map(reqRow).join('') + '</div>' :
      emptyState(cur[0] === 'pending' ? 'Nothing waiting' : 'Nothing here yet', cur[0] === 'pending' ? 'No agent is waiting on a decision. New requests appear here and expire after 24 hours if nobody answers.' : 'Decided requests will be listed here.');
    return html;
  }

  function vRequest() {
    var r = core.reqById(st, ui.param);
    if (!r || core.requestsFor(st, ui.role).indexOf(r) === -1) return backLink('requests', 'Requests') + emptyState('Request not available', 'This request does not exist or is not visible to this user.');
    var f = core.fundById(st, r.fundId), v = core.requestView(st, ui.role, r), holder = ui.role === f.keyHolder;
    var amountHtml = v.amountHidden ? '<span class="hidden-v">' + ic('eye') + 'Amount visible to Sunita only</span>' : inr(r.amount);
    var html = backLink('requests', 'Requests') + '<div class="req-layout"><article class="req-card" aria-labelledby="req-title">' +
      '<header class="req-h">' + avatar(r.requester) + '<div><p class="pa" lang="pa">' + (r.requester === 'agent:rohan' ? 'ਰੋਹਨ ਦਾ ਏਜੰਟ ਪੁੱਛ ਰਿਹਾ ਹੈ' : 'ਆਰਵ ਦਾ ਏਜੰਟ ਪੁੱਛ ਰਿਹਾ ਹੈ') + '</p>' +
      '<h1 id="req-title"><b>' + esc(who(r.requester)) + '</b> is asking</h1></div>' + pill(r.status) + '</header>' +
      '<div class="req-amt">' + amountHtml + '</div><p class="req-to">to <b>' + esc(r.recipient) + '</b> · account ••' + esc(r.recipientRef) + '</p>' +
      '<div class="purpose"><span class="k">Agent’s stated purpose</span><q>' + esc(r.purpose) + '</q><small>These are the agent’s words. SaySo shows them; it does not verify them.</small></div>' +
      '<dl class="meta">' + kv('From fund', f.name) + '<div><dt>Request code</dt><dd><code>' + esc(r.code) + '</code></dd></div>' + kv('Submitted', dt(r.createdAt, true)) +
      kv(r.status === 'pending' ? 'Expires' : 'Expiry was', dt(r.expiresAt, true) + (r.status === 'pending' ? ' (' + left(r.expiresAt - st.now) + ')' : '')) + '</dl>';

    if (r.status === 'pending' && holder) {
      if (v.overBalance) html += '<div class="warnbox">' + ic('ban') + '<p><b>This is more than the fund holds.</b> ' + esc(f.name) + ' has ' + inr(f.available) + ' available, so this request cannot be paid. Refuse it, or let it expire. The agent was not told the balance.</p></div>';
      html += '<p class="scope">' + ic('info') + '<span>Paying authorises this one payment only: ' + inr(r.amount) + ' to ' + esc(r.recipient) + '. It gives no agent any ongoing permission.</span></p>' +
        '<div class="decide"><button class="btn refuse" data-act="refuse" data-id="' + r.id + '">' + ic('x') + 'Refuse</button>' +
        '<button class="btn pay" data-act="pay" data-id="' + r.id + '"' + (v.overBalance ? ' disabled aria-disabled="true"' : '') + '>' + ic('check') + 'Pay ' + inr(r.amount) + '</button></div>' +
        '<p class="fine center">No answer by ' + dt(r.expiresAt) + ' means no payment. Silence is never a yes.</p>';
    } else if (r.status === 'pending') {
      html += '<div class="lockbox">' + ic('key') + '<p><b>Only Sunita, the key-holder, can decide this request.</b> You own the account, but ownership is not authority.</p></div>' +
        '<button class="btn ghost wide" data-act="try-approve" data-id="' + r.id + '">' + ic('flask') + 'Test: try to approve as Rohan</button>' + inlineResult('approve-' + r.id);
    } else {
      html += outcomeBlock(r, f, holder);
    }
    html += '</article><aside class="side">' + historyCard(r) + whoSeesCard(r) + '</aside></div>';
    return html;
  }

  function outcomeBlock(r, f, holder) {
    var by = r.decidedBy ? (r.decidedBy === ui.role ? 'you' : who(r.decidedBy)) : '';
    var h = '<div class="outcome o-' + r.status + '">';
    if (r.status === 'paid') {
      h += ic('check') + '<div><b>Paid by ' + esc(by) + ' on ' + dt(r.decidedAt, true) + '.</b><p>' + (holder ? 'Receipt ' + esc(r.receipt.no) + '. ' + esc(f.name) + ' now has ' + inr(f.available) + ' available.' : 'Amount and receipt are visible to Sunita only.') + '</p></div></div>';
      if (holder) h += '<div class="row-actions"><button class="btn ghost" data-act="try-pay-again" data-id="' + r.id + '">' + ic('flask') + 'Test: pay it again</button><button class="btn primary" data-act="receipt" data-id="' + r.id + '">' + ic('receipt') + 'View receipt</button></div>' + inlineResult('again-' + r.id);
    } else if (r.status === 'refused') {
      h += ic('x') + '<div><b>Refused by ' + esc(by) + ' on ' + dt(r.decidedAt, true) + '.</b><p>Nothing was paid. The fund balance did not change.</p></div></div>';
      if (holder) h += '<div class="private">' + ic('eye') + '<div><span class="k">Your private note · only you can see this</span><p>' + (r.privateReason ? esc(r.privateReason) : 'No reason given. None is needed.') + '</p></div></div>';
      else h += '<button class="btn ghost wide" data-act="try-reason" data-id="' + r.id + '">' + ic('flask') + 'Test: try to read why it was refused</button>' + inlineResult('reason-' + r.id);
    } else if (r.status === 'expired') {
      h += ic('clock') + '<div><b>Expired on ' + dt(r.decidedAt, true) + ' with no decision.</b><p>Nothing was paid. An expired request can never be paid.</p></div></div>';
      if (holder) h += '<button class="btn ghost wide" data-act="try-pay-expired" data-id="' + r.id + '">' + ic('flask') + 'Test: try to pay it anyway</button>' + inlineResult('expired-' + r.id);
    } else if (r.status === 'withdrawn') {
      h += ic('undo') + '<div><b>Withdrawn by ' + esc(who(r.requester)) + ' on ' + dt(r.decidedAt, true) + '.</b><p>Nothing was paid.</p></div></div>';
    }
    return h;
  }

  function historyCard(r) {
    var ev = core.logFor(st, ui.role).filter(function (e) { return e.requestId === r.id; }).reverse();
    return '<section class="card"><h2>This request’s history</h2><ol class="timeline">' + ev.map(function (e) {
      var def = core.EVENTS[e.type];
      return '<li class="t-' + def.tone + '"><span class="dotm"></span><div><b>' + esc(def.label) + '</b><span class="muted">' + esc(who(e.actor)) + ' · ' + dt(e.at) + '</span>' +
        (def.tone === 'blocked' ? '<code class="code">' + esc(e.outcome) + '</code>' : '') + '</div></li>';
    }).join('') + '</ol></section>';
  }

  function whoSeesCard(r) {
    var rows = [
      ['Sunita', 'Everything: amount, recipient, purpose, her private note'],
      ['Rohan', 'Recipient, purpose and status. Not the amount, the balance or any reason'],
      [who(r.requester), 'Its own request and its status. Not the balance or any reason']
    ];
    return '<section class="card"><h2>Who sees what</h2><ul class="whosees">' + rows.map(function (x) { return '<li><b>' + esc(x[0]) + '</b><span>' + esc(x[1]) + '</span></li>'; }).join('') + '</ul></section>';
  }

  // ---------- activity ----------
  function vActivity() {
    var events = core.logFor(st, ui.role);
    var filters = [['all', 'All'], ['decision', 'Requests and decisions'], ['blocked', 'Blocked attempts'], ['setup', 'Fund setup']];
    var list = tmp.logFilter === 'all' ? events : events.filter(function (e) { return core.EVENTS[e.type].group === tmp.logFilter; });
    var note = ui.role === 'rohan' ? 'You see events on funds you created. Amounts of requests and payments are hidden from you. Refusal reasons are never written to the log.'
      : isAgent() ? 'An agent sees only events about its own requests and actions.' : 'Every request, decision and blocked attempt on your funds. Refusal reasons stay private and are never written here.';
    var html = '<header class="ph"><h1>Activity log</h1><p class="lede">What happened, who did it, and what the result was.</p><p class="fine">' + esc(note) + '</p></header>';
    html += '<div class="chips">' + filters.map(function (fl) {
      var n = fl[0] === 'all' ? events.length : events.filter(function (e) { return core.EVENTS[e.type].group === fl[0]; }).length;
      return '<button class="chip' + (tmp.logFilter === fl[0] ? ' on' : '') + '" data-act="log-filter" data-id="' + fl[0] + '" aria-pressed="' + (tmp.logFilter === fl[0]) + '">' + fl[1] + ' <span>' + n + '</span></button>';
    }).join('') + '</div>';
    if (!list.length) return html + emptyState('Nothing in this view', 'Try another filter.');
    html += '<div class="table-wrap"><table class="log"><thead><tr><th>When (IST, simulated)</th><th>Who</th><th>What happened</th><th>Request or fund</th><th>Result</th></tr></thead><tbody>' +
      list.map(function (e) {
        var def = core.EVENTS[e.type], r = e.requestId && core.reqById(st, e.requestId), f = e.fundId && core.fundById(st, e.fundId);
        var ref = r ? '<code>' + esc(r.code) + '</code> ' + esc(r.recipient) : f ? esc(f.name) : '';
        var amt = e.meta && e.meta.amountHidden ? ' · <span class="muted">amount hidden</span>' : e.meta && e.meta.amount ? ' · ' + inr(e.meta.amount) : '';
        var extra = e.meta && e.meta.tried ? ' <span class="muted">(tried to change ' + esc(e.meta.tried) + ')</span>' : '';
        var res = def.tone === 'blocked' ? pill('blocked') + '<code class="code">' + esc(e.outcome) + '</code>' : pill(statusFor(e), e.outcome);
        return '<tr class="tone-' + def.tone + '"><td data-l="When">' + dt(e.at) + '</td><td data-l="Who"><span class="who-c">' + avatar(e.actor) + esc(who(e.actor)) + '</span></td>' +
          '<td data-l="What happened"><b>' + esc(def.label) + '</b>' + extra + '</td><td data-l="Request or fund">' + ref + amt + '</td><td data-l="Result">' + res + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return html;
  }
  function statusFor(e) {
    var m = { REQUEST_SUBMITTED: 'pending', REQUEST_PAID: 'paid', REQUEST_REFUSED: 'refused', REQUEST_EXPIRED: 'expired', REQUEST_WITHDRAWN: 'withdrawn',
      HOLDER_ACCEPTED: 'held', FUND_CREATED: 'invited', HOLDER_INVITED: 'invited', HOLDER_DECLINED: 'declined', INVITE_EXPIRED: 'invite_expired' };
    return m[e.type] || 'info';
  }

  // ---------- access ----------
  function vAccess() {
    var cols = [['sunita', 'Sunita', 'key-holder'], ['rohan', 'Rohan', 'account owner'], ['agent', 'Any agent', 'AI']];
    var rows = [
      ['See a fund’s balance', [1, 0, 0]], ['See request amounts', [1, 0, '*']], ['Pay or refuse a request', [1, 0, 0]],
      ['Read a refusal reason', [1, 0, 0]], ['Ask for a payment', [0, 0, 1]], ['Change a submitted request', [0, 0, 0]],
      ['Pay directly, skipping the key-holder', [0, 0, 0]], ['Create a fund and invite a key-holder', [1, 1, 0]], ['See the activity log', [1, '†', '*']]
    ];
    var me = isAgent() ? 'agent' : ui.role;
    var mark = function (v) {
      if (v === 1) return '<span class="yes">' + ic('check') + '<span class="sr">Yes</span></span>';
      if (v === 0) return '<span class="no">' + ic('x') + '<span class="sr">No</span></span>';
      return '<span class="part">' + v + '</span>';
    };
    var html = '<header class="ph"><h1>Access and rules</h1><p class="lede">Ownership is not authority. Here is what each role can see and do in SaySo.</p></header>';
    html += '<div class="table-wrap"><table class="matrix"><thead><tr><th>Action</th>' + cols.map(function (c) { return '<th class="' + (c[0] === me ? 'me' : '') + '">' + c[1] + '<small>' + c[2] + (c[0] === me ? ' · you' : '') + '</small></th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td>' + r[0] + '</td>' + r[1].map(function (v, i) { return '<td class="' + (cols[i][0] === me ? 'me' : '') + '">' + mark(v) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div><p class="fine">* Only for its own requests. † Only for funds he created, with amounts hidden.</p>';
    html += '<div class="grid-2"><section class="card"><h2>Rules SaySo enforces</h2><ol class="rules">' + [
      'Only the fund’s named key-holder can authorise a payment.',
      'An agent may ask for a payment. It can never make one.',
      'Recipient, amount, purpose and request code are sealed when a request is submitted.',
      'Silence is never consent: an undecided request expires after 24 hours, unpaid.',
      'Refusing is one step, the same size as paying. No reason is required.',
      'A refusal reason is private to the key-holder. It is never shown or logged.',
      'Agents see that a fund is held. They never see its balance or history.',
      'Money moves only after the key-holder confirms the exact request. A request is paid at most once.',
      'Every request, decision, expiry and blocked attempt is written to the activity log.'
    ].map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol></section>' +
      '<section class="card"><h2>What is simulated</h2><ul class="plain">' +
      '<li><b>No real money moves.</b> Balances are numbers in this browser.</li>' +
      '<li><b>The PIN is not authentication.</b> Demo PIN 2040. A PIN cannot prove that a human pressed the button.</li>' +
      '<li><b>Agents are scripted.</b> Their requests come from this page, not a real AI.</li>' +
      '<li><b>Rules run in the browser.</b> In production they would run on a server, so an agent could not bypass them.</li>' +
      '<li><b>Time is simulated.</b> Use Demo controls to move the clock and see requests expire.</li></ul></section></div>';
    return html;
  }

  // ---------- agent views ----------
  function agentConsole() {
    var o = tmp.agentOut;
    if (!o) return '<section class="card console"><h2>SaySo’s reply to this agent</h2><pre>// Actions this agent takes, and SaySo’s answers, appear here.\n// Simulated interface. No real network calls.</pre></section>';
    return '<section class="card console ' + (o.ok ? 'ok' : 'bad') + '" aria-live="polite"><h2>SaySo’s reply to this agent</h2><pre>' +
      esc('→ ' + o.req + '\n← ' + (o.ok ? '200 OK' : '403 ' + o.code) + '\n' + JSON.stringify(o.body, null, 2)) + '</pre>' +
      (o.ok ? '' : '<p class="fine">' + esc(o.message) + ' This attempt was written to the activity log.</p>') + '</section>';
  }
  function agentOut(req, res, okBody) {
    tmp.agentOut = { req: req, ok: res.ok, code: res.code, message: res.message, body: res.ok ? okBody : { error: res.code, message: res.message } };
  }

  function vAsk() {
    var funds = core.fundsFor(st, ui.role).map(function (f) { return core.fundView(st, ui.role, f); });
    var v = tmp.agentForm, e = tmp.agentErrors;
    if (!v.fundId && funds[0]) v.fundId = funds[0].id;
    var html = '<header class="ph"><h1>Ask for money</h1><p class="lede">You are ' + esc(who(ui.role)) + '. You can ask SaySo for money from a held fund. A person decides.</p></header>';
    html += '<div class="grid-2"><section class="card"><h2>Funds you can ask from</h2><ul class="agent-funds">' + funds.map(function (f) {
      return '<li><div><b>' + esc(f.name) + '</b>' + pill('held') + '</div><p class="muted">' + ic('eye') + 'Balance: not shared with agents</p>' +
        '<button class="btn ghost sm" data-act="agent-balance" data-id="' + f.id + '">' + ic('flask') + 'Test: try to read balance</button></li>';
    }).join('') + '</ul><p class="fine">This list is everything an agent can learn about a fund: its name and that it is held.</p></section>';
    html += '<section class="card"><h2>New payment request</h2><form class="form" data-form="agent" novalidate>' +
      '<label class="fld"><span>From fund</span><select name="fundId" data-form-field="agent">' + funds.map(function (f) { return '<option value="' + f.id + '"' + (v.fundId === f.id ? ' selected' : '') + '>' + esc(f.name) + '</option>'; }).join('') + '</select></label>' +
      field('agent', 'recipient', 'Pay to', 'text', v.recipient, 'Gupta Electricals', e.recipient) +
      field('agent', 'recipientRef', 'Recipient account, last 4 digits', 'text', v.recipientRef, '3391', e.recipientRef) +
      field('agent', 'amount', 'Amount (₹, whole rupees)', 'number', v.amount, '3500', e.amount) +
      field('agent', 'purpose', 'Stated purpose', 'text', v.purpose, 'Diwali lights for the balcony', e.purpose, 'The key-holder sees these exact words. They cannot be changed after you send.') +
      '<div class="row-actions"><button type="button" class="btn ghost" data-act="agent-example">Fill an example</button><button type="submit" class="btn primary">Send request</button></div></form></section></div>';
    html += agentConsole();
    return html;
  }

  function vMyRequests() {
    var reqs = core.requestsFor(st, ui.role).slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
    var html = '<header class="ph"><h1>My requests</h1><p class="lede">The status of every request you sent. Try the blocked actions to see the boundary.</p></header>';
    html += agentConsole();
    if (!reqs.length) return html + emptyState('No requests yet', 'Requests you send from “Ask for money” appear here with their status.');
    html += '<div class="agent-reqs">' + reqs.map(function (r) {
      var f = core.fundById(st, r.fundId);
      var acts = '';
      if (r.status === 'pending') acts += '<button class="btn ghost sm" data-act="agent-edit" data-id="' + r.id + '">' + ic('flask') + 'Change amount to ' + inr(r.amount + 1000) + '</button>';
      acts += '<button class="btn ghost sm" data-act="agent-pay" data-id="' + r.id + '">' + ic('flask') + 'Pay it myself</button>';
      if (r.status === 'refused') acts += '<button class="btn ghost sm" data-act="agent-reason" data-id="' + r.id + '">' + ic('flask') + 'Ask why it was refused</button>';
      if (r.status === 'pending') acts += '<button class="btn ghost sm" data-act="agent-withdraw" data-id="' + r.id + '">' + ic('undo') + 'Withdraw</button>';
      return '<article class="card areq"><div class="areq-h"><div><b>' + inr(r.amount) + ' to ' + esc(r.recipient) + '</b><span class="muted">' + esc(f.name) + ' · <code>' + esc(r.code) + '</code> · sent ' + dt(r.createdAt) + '</span></div>' + pill(r.status) + '</div>' +
        '<p class="muted">“' + esc(r.purpose) + '”' + (r.status === 'pending' ? ' · ' + left(r.expiresAt - st.now) : '') + '</p><div class="areq-a">' + acts + '</div></article>';
    }).join('') + '</div>';
    return html;
  }

  // ---------- main render ----------
  function renderMain() {
    var views = isAgent() ? { ask: vAsk, myrequests: vMyRequests, activity: vActivity, access: vAccess }
      : { overview: vOverview, funds: vFunds, fund: vFund, requests: vRequests, request: vRequest, activity: vActivity, access: vAccess };
    var fn = views[ui.view];
    if (!fn) { ui.view = isAgent() ? 'ask' : 'overview'; fn = views[ui.view]; }
    document.getElementById('main').innerHTML = fn();
  }

  // ---------- modals ----------
  function pinPad(pin) {
    var dots = '';
    for (var i = 0; i < 4; i++) dots += '<i class="' + (i < pin.length ? 'on' : '') + '"></i>';
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
    return '<div class="pin" aria-label="PIN, ' + pin.length + ' of 4 digits entered">' + dots + '</div><div class="pad">' + keys.map(function (k) {
      if (!k) return '<span></span>';
      return '<button type="button" class="key" data-act="pin" data-id="' + (k === '⌫' ? 'del' : k) + '" aria-label="' + (k === '⌫' ? 'Delete' : k) + '">' + k + '</button>';
    }).join('') + '</div><p class="demo-n">' + ic('info') + '<span>Demo PIN <b>2040</b>. This is a simulation, not real authentication. A PIN cannot prove a human pressed the button.</span></p>';
  }

  function receiptHtml(r, f) {
    return '<div class="receipt"><div class="tick">' + ic('check') + '</div><p class="r-amt">' + inr(r.amount, true) + '</p><p class="r-to">paid to <b>' + esc(r.recipient) + '</b> · ••' + esc(r.recipientRef) + '</p>' +
      '<dl class="meta">' + kv('Receipt', r.receipt.no) + '<div><dt>Request code</dt><dd><code>' + esc(r.code) + '</code></dd></div>' + kv('Decided by', who(r.decidedBy) + ', key-holder') +
      kv('Time', dt(r.decidedAt, true) + ' IST (simulated)') + kv('From', f.name) + kv('Balance after', inr(r.receipt.balanceAfter) + ' of ' + inr(f.committed) + ' committed') + '</dl>' +
      '<ul class="tells"><li><b>Rohan sees:</b> “A payment was made from ' + esc(f.name) + '.” No amount.</li><li><b>' + esc(who(r.requester)) + ' sees:</b> <code>paid</code></li></ul></div>';
  }

  function renderModal() {
    var m = tmp.modal, el = document.getElementById('modal');
    if (!m) { el.hidden = true; el.innerHTML = ''; return; }
    var html = '';
    if (m.type === 'pay') {
      var r = core.reqById(st, m.reqId), f = core.fundById(st, r.fundId);
      if (m.step === 'confirm') {
        var sealOk = core.sealOf(r) === r.seal;
        html = '<h2 id="m-title">Confirm this payment</h2>' +
          '<div class="sum"><span class="k">You are paying</span><b class="r-amt">' + inr(r.amount, true) + '</b><span>to <b>' + esc(r.recipient) + '</b> · ••' + esc(r.recipientRef) + '</span><span class="muted">from ' + esc(f.name) + ' · request <code>' + esc(r.code) + '</code></span></div>' +
          '<p class="seal ' + (sealOk ? 'ok' : 'bad') + '">' + ic(sealOk ? 'check' : 'ban') + '<span>' + (sealOk ? 'Matches the request exactly as submitted on ' + dt(r.createdAt) + '. Seal <code>' + r.seal + '</code>.' : 'Details changed since submission. Payment blocked.') + '</span></p>' +
          '<p class="scope">' + ic('info') + '<span>This pays this one request only. It gives no agent any ongoing permission.</span></p>' +
          '<p class="k center">Enter your 4-digit PIN</p>' + pinPad(m.pin) +
          (m.error ? '<p class="err" role="alert">' + ic('ban') + esc(m.error) + '</p>' : '') +
          '<div class="m-actions"><button class="btn ghost" data-act="close">Cancel</button><button class="btn pay" data-act="confirm-pay"' + (m.pin.length < 4 || m.busy || !sealOk ? ' disabled' : '') + '>' + ic('check') + 'Pay ' + inr(r.amount) + '</button></div>';
      } else {
        html = '<h2 id="m-title" class="sr">Payment receipt</h2>' + receiptHtml(r, f) +
          '<div class="m-actions"><button class="btn ghost" data-act="go-log">View activity log</button><button class="btn primary" data-act="close">Done</button></div>';
      }
    } else if (m.type === 'receipt') {
      var rr = core.reqById(st, m.reqId);
      html = '<h2 id="m-title" class="sr">Payment receipt</h2>' + receiptHtml(rr, core.fundById(st, rr.fundId)) + '<div class="m-actions"><button class="btn primary" data-act="close">Close</button></div>';
    } else if (m.type === 'refuse') {
      var q = core.reqById(st, m.reqId), qf = core.fundById(st, q.fundId);
      if (m.step === 'confirm') {
        html = '<h2 id="m-title">Refuse ' + inr(q.amount) + ' to ' + esc(q.recipient) + '?</h2>' +
          '<p>Nothing will be paid. ' + esc(qf.name) + ' stays at ' + inr(qf.available) + '.</p>' +
          '<label class="fld"><span>Private note (optional)</span><textarea id="refuse-note" rows="3" maxlength="200" placeholder="Only you will ever see this.">' + esc(m.note || '') + '</textarea>' +
          '<small class="help">No reason is needed. Rohan and the agent see only “refused”.</small></label>' +
          '<div class="m-actions"><button class="btn ghost" data-act="close">Cancel</button><button class="btn refuse solid" data-act="confirm-refuse"' + (m.busy ? ' disabled' : '') + '>' + ic('x') + 'Refuse request</button></div>';
      } else {
        html = '<div class="receipt"><div class="tick bad">' + ic('x') + '</div><p class="r-amt">Refused</p><p class="r-to">' + inr(q.amount) + ' to ' + esc(q.recipient) + ' was not paid.</p>' +
          '<p class="center">' + esc(qf.name) + ' still holds <b>' + inr(qf.available) + '</b>.</p><ul class="tells"><li><b>Rohan and ' + esc(who(q.requester)) + ' see:</b> <code>refused</code>. No reason.</li></ul></div>' +
          '<div class="m-actions"><button class="btn ghost" data-act="go-log">View activity log</button><button class="btn primary" data-act="close">Done</button></div>';
      }
    } else if (m.type === 'accept') {
      var af = core.fundById(st, m.fundId);
      html = '<h2 id="m-title">Accept the key to “' + esc(af.name) + '”</h2><p>' + esc(who(af.createdBy)) + ' is committing <b>' + inr(af.committed) + '</b> for: ' + esc(af.purpose) + '.</p>' +
        '<ul class="plain"><li>Only you will be able to pay from it.</li><li>Agents can ask; you decide every request.</li><li>Rohan will not see the balance or be able to withdraw alone.</li></ul>' +
        '<p class="k center">Enter your PIN to accept</p>' + pinPad(m.pin) + (m.error ? '<p class="err" role="alert">' + ic('ban') + esc(m.error) + '</p>' : '') +
        '<div class="m-actions"><button class="btn ghost" data-act="close">Not now</button><button class="btn primary" data-act="confirm-accept"' + (m.pin.length < 4 ? ' disabled' : '') + '>' + ic('key') + 'Accept the key</button></div>';
    }
    el.innerHTML = '<div class="m-back" data-act="close"></div><div class="m-box" role="dialog" aria-modal="true" aria-labelledby="m-title">' + html + '</div>';
    el.hidden = false;
    var focusEl = el.querySelector('#refuse-note') || el.querySelector('.m-actions .btn:not([disabled]):last-child') || el.querySelector('.key');
    if (focusEl && !m.focused) { focusEl.focus(); m.focused = true; }
  }

  // ---------- demo drawer ----------
  var STEPS = [
    ['Meet Sunita, the key-holder', 'sunita', 'overview'],
    ['Open the ₹2,100 request from Rohan’s agent', 'sunita', 'request', '7F3A2C'],
    ['Pay it with demo PIN 2040 and read the receipt', 'sunita', 'request', '7F3A2C'],
    ['Check the activity log', 'sunita', 'activity'],
    ['Switch to Rohan’s agent: try to pay, edit, read the balance', 'agent:rohan', 'myrequests'],
    ['Switch to Rohan: owner, but no key', 'rohan', 'request', '7F3A2C'],
    ['Back as Sunita, refuse the ₹1,800 kurta request', 'sunita', 'request', '2A6B9E'],
    ['As Aarav’s agent, send a new request', 'agent:aarav', 'ask'],
    ['Move the clock 24 hours and watch it expire', 'sunita', 'requests', null, 'advance'],
    ['As Rohan, commit money to a new fund; then accept it as Sunita', 'rohan', 'funds']
  ];

  function renderDrawer() {
    var el = document.getElementById('drawer');
    if (!tmp.drawer) { el.hidden = true; el.innerHTML = ''; return; }
    var checks = tmp.checks ? '<ul class="checks">' + tmp.checks.map(function (c) { return '<li class="' + (c.pass ? 'pass' : 'fail') + '">' + ic(c.pass ? 'check' : 'x') + '<span>' + esc(c.name) + (c.pass ? '' : '<small>' + esc(c.detail) + '</small>') + '</span></li>'; }).join('') + '</ul>' +
      '<p class="fine">' + tmp.checks.filter(function (c) { return c.pass; }).length + ' of ' + tmp.checks.length + ' passed. Checks run on a separate copy and do not change your demo.</p>' : '';
    el.innerHTML = '<div class="d-head"><h2>Demo controls</h2><button class="btn ghost sm" data-act="drawer" aria-label="Close demo controls">' + ic('x') + 'Close</button></div>' +
      '<section><h3>Simulated clock</h3><p class="clock-big">' + dt(st.now, true) + ' IST</p><div class="btn-row">' +
      '<button class="btn ghost sm" data-act="advance" data-id="60">+1 hour</button><button class="btn ghost sm" data-act="advance" data-id="360">+6 hours</button><button class="btn ghost sm" data-act="advance" data-id="1440">+24 hours</button></div>' +
      '<p class="fine">Requests expire 24 hours after they are sent. Moving the clock is how you see that without waiting.</p></section>' +
      '<section><h3>Guided walkthrough</h3><ol class="steps">' + STEPS.map(function (s, i) { return '<li><span>' + esc(s[0]) + '</span><button class="btn ghost sm" data-act="step" data-id="' + i + '">Go</button></li>'; }).join('') + '</ol></section>' +
      '<section><h3>Rule checks</h3><p class="fine">Runs the acceptance criteria against a fresh copy of the demo data.</p><button class="btn primary sm" data-act="run-checks">' + ic('flask') + 'Run all rule checks</button>' + checks + '</section>' +
      '<section><h3>Reset</h3>' + (tmp.resetArm ? '<p>Restore the starting story? Your payments, refusals and new funds will be cleared.</p><div class="btn-row"><button class="btn ghost sm" data-act="reset-cancel">Cancel</button><button class="btn refuse solid sm" data-act="reset-go">Yes, reset demo</button></div>'
        : '<button class="btn ghost sm" data-act="reset-arm">Reset demo data</button>') + '</section>';
    el.hidden = false;
  }

  // ---------- toasts ----------
  function toast(msg, tone) {
    var box = document.getElementById('toast');
    while (box.children.length > 1) box.removeChild(box.firstChild);
    var t = document.createElement('div');
    t.className = 'toast ' + (tone || '');
    t.innerHTML = ic(tone === 'bad' ? 'ban' : 'check') + '<span>' + esc(msg) + '</span>';
    box.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300); }, 4200);
  }

  function render() { renderTop(); renderNav(); renderMain(); renderModal(); renderDrawer(); }
  function commit() { persist(); render(); }
  function go(view, param) {
    ui.view = view; ui.param = param || null; tmp.inline = {};
    persist(); render();
    var main = document.getElementById('main');
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  // ---------- actions ----------
  var A = {
    role: function (id) { ui.role = id; ui.view = core.isAgent(id) ? 'ask' : 'overview'; ui.param = null; tmp.modal = null; tmp.agentOut = null; tmp.agentErrors = {}; tmp.agentForm = {}; tmp.inline = {}; document.getElementById('toast').innerHTML = ''; commit(); window.scrollTo(0, 0); },
    go: function (id, el) { go(el.getAttribute('data-view'), id); },
    drawer: function () { tmp.drawer = !tmp.drawer; tmp.resetArm = false; renderDrawer(); },
    'req-tab': function (id) { tmp.reqTab = id; renderMain(); },
    'log-filter': function (id) { tmp.logFilter = id; renderMain(); },
    advance: function (id) {
      var before = st.requests.filter(function (r) { return r.status === 'expired'; }).length;
      core.advance(st, Number(id));
      var n = st.requests.filter(function (r) { return r.status === 'expired'; }).length - before;
      if (tmp.modal && tmp.modal.reqId && core.reqById(st, tmp.modal.reqId).status === 'expired') tmp.modal = null;
      commit();
      toast('Clock moved to ' + dt(st.now) + '.' + (n ? ' ' + n + ' request' + (n === 1 ? '' : 's') + ' expired with no payment.' : ''), n ? 'bad' : '');
    },
    step: function (id) {
      var s = STEPS[Number(id)];
      ui.role = s[1]; tmp.agentOut = null; tmp.modal = null; tmp.inline = {};
      if (s[4] === 'advance') { core.advance(st, 1440); tmp.reqTab = 'decided'; toast('Clock moved 24 hours. Undecided requests expired, unpaid.', 'bad'); }
      var param = s[3] ? (core.reqByCode(st, s[3]) || {}).id : null;
      tmp.drawer = window.innerWidth > 1100;
      go(s[2], param);
    },
    'run-checks': function () { tmp.checks = S.checks.run(); renderDrawer(); },
    'reset-arm': function () { tmp.resetArm = true; renderDrawer(); },
    'reset-cancel': function () { tmp.resetArm = false; renderDrawer(); },
    'reset-go': function () {
      S.store.clear(); data = freshData(); st = data.st; ui = data.ui;
      tmp.modal = null; tmp.resetArm = false; tmp.checks = null; tmp.agentOut = null; tmp.inline = {}; tmp.reqTab = 'pending'; tmp.logFilter = 'all';
      commit(); toast('Demo reset to the starting story.');
    },
    pay: function (id) { tmp.modal = { type: 'pay', reqId: id, step: 'confirm', pin: '', busy: false }; renderModal(); },
    refuse: function (id) { tmp.modal = { type: 'refuse', reqId: id, step: 'confirm', note: '' }; renderModal(); },
    receipt: function (id) { tmp.modal = { type: 'receipt', reqId: id }; renderModal(); },
    accept: function (id) { tmp.modal = { type: 'accept', fundId: id, pin: '' }; renderModal(); },
    decline: function (id) { var res = core.declineFund(st, ui.role, id); commit(); toast(res.ok ? 'Declined. No money is held in this fund.' : res.message, res.ok ? '' : 'bad'); },
    close: function () { tmp.modal = null; render(); },
    'go-log': function () { tmp.modal = null; tmp.logFilter = 'all'; go('activity'); },
    pin: function (id) {
      var m = tmp.modal; if (!m || m.busy) return;
      if (id === 'del') m.pin = m.pin.slice(0, -1); else if (m.pin.length < 4) m.pin += id;
      m.error = null; renderModal();
    },
    'confirm-pay': function () {
      var m = tmp.modal;
      if (!m || m.busy) return;      // guards a double click
      m.busy = true; renderModal();
      var res = core.pay(st, ui.role, m.reqId, m.pin);
      m.busy = false;
      if (res.ok) { m.step = 'receipt'; m.focused = false; commit(); toast('Paid ' + inr(res.request.amount) + ' to ' + res.request.recipient + '.'); }
      else if (res.code === 'PIN_MISMATCH') { m.pin = ''; m.error = res.message; commit(); }
      else { tmp.modal = null; commit(); toast(res.message, 'bad'); }
    },
    'confirm-refuse': function () {
      var m = tmp.modal; if (!m || m.busy) return;
      m.busy = true;
      var note = document.getElementById('refuse-note');
      var res = core.refuse(st, ui.role, m.reqId, note ? note.value : '');
      m.busy = false;
      if (res.ok) { m.step = 'done'; m.focused = false; commit(); }
      else { tmp.modal = null; commit(); toast(res.message, 'bad'); }
    },
    'confirm-accept': function () {
      var m = tmp.modal;
      var res = core.acceptFund(st, ui.role, m.fundId, m.pin);
      if (res.ok) { tmp.modal = null; commit(); toast('You now hold the key to ' + res.fund.name + '. ' + inr(res.fund.committed) + ' is protected.'); }
      else if (res.code === 'PIN_MISMATCH') { m.pin = ''; m.error = res.message; commit(); }
      else { tmp.modal = null; commit(); toast(res.message, 'bad'); }
    },
    'try-approve': function (id) { tmp.inline['approve-' + id] = core.pay(st, ui.role, id, ''); commit(); },
    'try-pay-again': function (id) { tmp.inline['again-' + id] = core.pay(st, ui.role, id, core.DEMO_PIN); commit(); },
    'try-pay-expired': function (id) { tmp.inline['expired-' + id] = core.pay(st, ui.role, id, core.DEMO_PIN); commit(); },
    'try-reason': function (id) { tmp.inline['reason-' + id] = core.readReason(st, ui.role, id); commit(); },
    'read-balance': function (id) { tmp.inline['bal-' + id] = core.readBalance(st, ui.role, id); commit(); },
    'agent-balance': function (id) { var f = core.fundById(st, id); agentOut('GET /funds/' + f.name.replace(/\s+/g, '-').toLowerCase() + '/balance', core.readBalance(st, ui.role, id)); commit(); },
    'agent-pay': function (id) { var r = core.reqById(st, id); agentOut('POST /requests/' + r.code + '/pay', core.attemptDirectPay(st, ui.role, id)); commit(); },
    'agent-edit': function (id) { var r = core.reqById(st, id); agentOut('PATCH /requests/' + r.code + '  { "amount": ' + (r.amount + 1000) + ' }', core.attemptEdit(st, ui.role, id, { amount: r.amount + 1000 })); commit(); },
    'agent-reason': function (id) { var r = core.reqById(st, id); agentOut('GET /requests/' + r.code + '/reason', core.readReason(st, ui.role, id)); commit(); },
    'agent-withdraw': function (id) { var r = core.reqById(st, id); var res = core.withdrawRequest(st, ui.role, id); agentOut('POST /requests/' + r.code + '/withdraw', res, { code: r.code, status: 'withdrawn' }); commit(); },
    'agent-example': function () {
      var ex = ui.role === 'agent:aarav'
        ? { recipient: 'Sharma Fireworks', recipientRef: '4410', amount: '1200', purpose: 'Green crackers for Diwali night' }
        : { recipient: 'Gupta Electricals', recipientRef: '3391', amount: '3500', purpose: 'Diwali lights for the balcony' };
      for (var k in ex) tmp.agentForm[k] = ex[k];
      tmp.agentErrors = {}; renderMain();
    },
    'fund-example': function () { tmp.fundForm = { name: 'Lohri Fund', purpose: 'Lohri bonfire, rewari and gifts', amount: '3000', keyHolder: 'sunita' }; tmp.fundErrors = null; renderMain(); }
  };

  function submitForm(kind) {
    if (kind === 'agent') {
      var v = tmp.agentForm;
      var res = core.submitRequest(st, ui.role, { fundId: v.fundId, recipient: v.recipient, recipientRef: v.recipientRef, amount: v.amount, purpose: v.purpose });
      if (res.ok) {
        tmp.agentErrors = {}; tmp.agentForm = { fundId: v.fundId };
        agentOut('POST /requests  { fund, recipient, amount, purpose }', res, res.agentReply && { code: res.agentReply.code, status: 'pending', expires: dt(res.agentReply.expires, true) });
        commit(); toast('Request ' + res.request.code + ' sent. The key-holder decides; it expires in 24 hours.');
      } else {
        tmp.agentErrors = res.fieldErrors || {};
        agentOut('POST /requests', res);
        renderMain();
        var bad = document.querySelector('[aria-invalid="true"]'); if (bad) bad.focus();
      }
    } else if (kind === 'fund') {
      var fv = tmp.fundForm;
      var r2 = core.commitFund(st, ui.role, fv);
      if (r2.ok) { tmp.fundForm = { keyHolder: 'sunita' }; tmp.fundErrors = null; commit(); toast(r2.fund.name + ' created. Waiting for Sunita to accept; nothing is protected yet.'); }
      else { tmp.fundErrors = r2.message; renderMain(); }
    }
  }

  // ---------- events ----------
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-act]');
    if (!el || el.disabled) return;
    var act = el.getAttribute('data-act');
    if (A[act]) { ev.preventDefault(); A[act](el.getAttribute('data-id'), el); }
  });
  document.addEventListener('submit', function (ev) {
    var f = ev.target.closest('[data-form]');
    if (f) { ev.preventDefault(); submitForm(f.getAttribute('data-form')); }
  });
  document.addEventListener('input', function (ev) {
    var t = ev.target, form = t.getAttribute && t.getAttribute('data-form-field');
    if (form === 'agent') tmp.agentForm[t.name] = t.value;
    if (form === 'fund') tmp.fundForm[t.name] = t.value;
    if (t.id === 'refuse-note' && tmp.modal) tmp.modal.note = t.value;
  });
  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.id === 'roleSel') A.role(t.value);
    var form = t.getAttribute && t.getAttribute('data-form-field');
    if (form === 'agent') tmp.agentForm[t.name] = t.value;
    if (form === 'fund') tmp.fundForm[t.name] = t.value;
  });
  document.addEventListener('keydown', function (ev) {
    var m = tmp.modal;
    if (ev.key === 'Escape') { if (m) A.close(); else if (tmp.drawer) A.drawer(); return; }
    if (m && (m.type === 'pay' && m.step === 'confirm' || m.type === 'accept')) {
      if (/^[0-9]$/.test(ev.key)) { ev.preventDefault(); A.pin(ev.key); }
      else if (ev.key === 'Backspace') { ev.preventDefault(); A.pin('del'); }
      else if (ev.key === 'Enter' && m.pin.length === 4) { ev.preventDefault(); A[m.type === 'pay' ? 'confirm-pay' : 'confirm-accept'](); }
    }
  });

  core.tick(st);
  render();
})();
