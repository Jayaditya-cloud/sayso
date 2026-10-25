/*
 * SaySo core: the single place where product rules live.
 * Every screen calls these functions; no screen changes state directly.
 * Pure data in, result out. No DOM access here.
 */
(function (root) {
  'use strict';

  var HOUR = 3600000;
  var DAY = 24 * HOUR;
  var REQUEST_TTL = DAY;        // silence is never consent: undecided requests expire after 24h
  var INVITE_TTL = 7 * DAY;     // a key-holder invitation lapses after 7 days
  var MAX_AMOUNT = 1000000;     // ₹10,00,000 per request in this demo
  var DEMO_PIN = '2040';        // simulated confirmation only

  var PEOPLE = {
    sunita: { id: 'sunita', name: 'Sunita Sharma', short: 'Sunita', kind: 'human' },
    rohan: { id: 'rohan', name: 'Rohan Sharma', short: 'Rohan', kind: 'human' },
    'agent:rohan': { id: 'agent:rohan', name: "Rohan's agent", short: "Rohan's agent", kind: 'agent', owner: 'rohan' },
    'agent:aarav': { id: 'agent:aarav', name: "Aarav's agent", short: "Aarav's agent", kind: 'agent', owner: 'aarav' },
    system: { id: 'system', name: 'SaySo', short: 'SaySo', kind: 'system' }
  };

  // Explicit request state machine.
  var TRANSITIONS = {
    pending: ['paid', 'refused', 'expired', 'withdrawn'],
    paid: [], refused: [], expired: [], withdrawn: []
  };

  var EVENTS = {
    FUND_CREATED: { label: 'Fund created', group: 'setup', tone: 'info' },
    HOLDER_INVITED: { label: 'Key-holder invited', group: 'setup', tone: 'info' },
    HOLDER_ACCEPTED: { label: 'Key-holder accepted', group: 'setup', tone: 'ok' },
    HOLDER_DECLINED: { label: 'Key-holder declined', group: 'setup', tone: 'muted' },
    INVITE_EXPIRED: { label: 'Invitation lapsed', group: 'setup', tone: 'muted' },
    REQUEST_SUBMITTED: { label: 'Payment requested', group: 'decision', tone: 'pending' },
    REQUEST_PAID: { label: 'Paid', group: 'decision', tone: 'ok' },
    REQUEST_REFUSED: { label: 'Refused', group: 'decision', tone: 'bad' },
    REQUEST_EXPIRED: { label: 'Expired with no decision', group: 'decision', tone: 'muted' },
    REQUEST_WITHDRAWN: { label: 'Withdrawn by requester', group: 'decision', tone: 'muted' },
    EDIT_BLOCKED: { label: 'Tried to change a submitted request', group: 'blocked', tone: 'blocked' },
    DIRECT_PAY_BLOCKED: { label: 'Tried to pay directly', group: 'blocked', tone: 'blocked' },
    BALANCE_BLOCKED: { label: 'Tried to read the balance', group: 'blocked', tone: 'blocked' },
    REASON_BLOCKED: { label: 'Tried to read a refusal reason', group: 'blocked', tone: 'blocked' },
    ROLE_BLOCKED: { label: 'Tried to decide without the key', group: 'blocked', tone: 'blocked' },
    DUPLICATE_BLOCKED: { label: 'Second payment attempt stopped', group: 'blocked', tone: 'blocked' },
    EXPIRED_PAY_BLOCKED: { label: 'Tried to pay an expired request', group: 'blocked', tone: 'blocked' },
    CONFIRMATION_FAILED: { label: 'Confirmation failed (wrong PIN)', group: 'blocked', tone: 'blocked' },
    BALANCE_SHORT_BLOCKED: { label: 'Payment stopped: fund holds too little', group: 'blocked', tone: 'blocked' }
  };

  var CODES = {
    AGENT_CANNOT_PAY: 'Agents can ask for a payment but can never make one. Only the fund’s key-holder can pay.',
    REQUEST_IMMUTABLE: 'A request cannot be changed after it is submitted. Withdraw it and send a new one instead.',
    BALANCE_HIDDEN: 'Only the fund’s key-holder can see its balance.',
    REASON_PRIVATE: 'Refusal reasons are private to the key-holder.',
    NOT_KEY_HOLDER: 'Only the fund’s key-holder can decide this request.',
    ALREADY_PAID: 'This request is already paid. It cannot be paid twice.',
    ALREADY_DECIDED: 'This request has already been decided and can no longer change.',
    REQUEST_EXPIRED: 'This request expired without a decision. Expired requests can never be paid.',
    PIN_MISMATCH: 'That PIN does not match. Nothing was paid.',
    DETAILS_CHANGED: 'The details no longer match what was submitted. Nothing was paid.',
    INSUFFICIENT_HELD_BALANCE: 'The fund does not hold enough to pay this request. Nothing was paid.',
    INVALID_AMOUNT: 'Enter a whole-rupee amount from ₹1 to ₹10,00,000.',
    INVALID_RECIPIENT: 'Enter who should be paid (2 to 40 characters).',
    INVALID_REF: 'Enter the last four digits of the recipient’s account.',
    INVALID_PURPOSE: 'Describe the purpose in 3 to 80 characters.',
    INVALID_NAME: 'Give the fund a name (2 to 30 characters).',
    INVALID_HOLDER: 'Choose someone else as key-holder. You cannot hold the key to a fund you created.',
    FUND_NOT_ACTIVE: 'This fund is not active, so it cannot take requests or payments.',
    NOT_INVITED: 'Only the invited key-holder can answer this invitation.',
    INVITE_CLOSED: 'This invitation is no longer open.',
    NOT_ALLOWED: 'This role cannot do that.',
    NOT_YOURS: 'An agent can only act on its own requests.',
    NOT_FOUND: 'That item does not exist.'
  };

  // ---------- helpers ----------
  function isAgent(actor) { return !!PEOPLE[actor] && PEOPLE[actor].kind === 'agent'; }
  function isHuman(actor) { return !!PEOPLE[actor] && PEOPLE[actor].kind === 'human'; }
  function fnv(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  function hex(n, len) { var s = n.toString(16).toUpperCase(); while (s.length < len) s = '0' + s; return s.slice(-len); }
  function sealOf(r) {
    return hex(fnv([r.fundId, r.requester, r.recipient, r.recipientRef, r.amount, r.purpose, r.createdAt, r.code].join('|')), 8);
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function blank(now) {
    return { version: 1, now: now, seq: { f: 0, r: 0, e: 0, rc: 0 }, funds: [], requests: [], log: [] };
  }
  function fundById(st, id) { for (var i = 0; i < st.funds.length; i++) if (st.funds[i].id === id) return st.funds[i]; return null; }
  function reqById(st, id) { for (var i = 0; i < st.requests.length; i++) if (st.requests[i].id === id) return st.requests[i]; return null; }
  function reqByCode(st, code) { for (var i = 0; i < st.requests.length; i++) if (st.requests[i].code === code) return st.requests[i]; return null; }

  function log(st, at, actor, type, refs, outcome, meta) {
    st.seq.e += 1;
    var e = { id: 'e' + st.seq.e, n: st.seq.e, at: at, actor: actor, type: type,
      fundId: refs && refs.fundId || null, requestId: refs && refs.requestId || null,
      outcome: outcome, meta: meta || {} };
    st.log.push(e);
    return e;
  }
  function ok(extra) { var o = { ok: true }; for (var k in extra) o[k] = extra[k]; return o; }
  function fail(st, actor, code, eventType, refs, meta) {
    if (eventType) log(st, st.now, actor, eventType, refs, code, meta);
    return { ok: false, code: code, message: CODES[code] || code };
  }
  function canMove(r, to) { return (TRANSITIONS[r.status] || []).indexOf(to) !== -1; }
  function move(r, to) {
    if (!canMove(r, to)) throw new Error('Illegal transition ' + r.status + ' -> ' + to);
    r.status = to;
  }

  // ---------- time ----------
  function tick(st) {
    st.requests.forEach(function (r) {
      if (r.status === 'pending' && st.now >= r.expiresAt) {
        move(r, 'expired');
        r.decidedAt = r.expiresAt;
        log(st, r.expiresAt, 'system', 'REQUEST_EXPIRED', { fundId: r.fundId, requestId: r.id }, 'expired', { amount: r.amount });
      }
    });
    st.funds.forEach(function (f) {
      if (f.status === 'invited' && st.now >= f.inviteExpiresAt) {
        f.status = 'invite_expired';
        log(st, f.inviteExpiresAt, 'system', 'INVITE_EXPIRED', { fundId: f.id }, 'no money held');
      }
    });
  }
  function setNow(st, t) { if (t > st.now) st.now = t; tick(st); }
  function advance(st, minutes) { st.now += minutes * 60000; tick(st); return ok({ now: st.now }); }

  // ---------- Commit and Accept ----------
  function commitFund(st, actor, input) {
    tick(st);
    if (!isHuman(actor)) return fail(st, actor, 'NOT_ALLOWED');
    var name = String(input.name || '').trim();
    var purpose = String(input.purpose || '').trim();
    var amount = Number(input.amount);
    if (name.length < 2 || name.length > 30) return fail(st, actor, 'INVALID_NAME');
    if (purpose.length < 3 || purpose.length > 80) return fail(st, actor, 'INVALID_PURPOSE');
    if (!isFinite(amount) || amount < 1 || amount > MAX_AMOUNT || Math.floor(amount) !== amount) return fail(st, actor, 'INVALID_AMOUNT');
    if (!isHuman(input.keyHolder) || input.keyHolder === actor) return fail(st, actor, 'INVALID_HOLDER');
    st.seq.f += 1;
    var f = { id: 'f' + st.seq.f, name: name, purpose: purpose, committed: amount, available: 0,
      keyHolder: input.keyHolder, createdBy: actor, status: 'invited', createdAt: st.now,
      inviteExpiresAt: st.now + INVITE_TTL, acceptedAt: null, useBy: input.useBy || null };
    st.funds.push(f);
    log(st, st.now, actor, 'FUND_CREATED', { fundId: f.id }, 'awaiting key-holder', { amount: amount });
    log(st, st.now, actor, 'HOLDER_INVITED', { fundId: f.id }, 'invited', { holder: f.keyHolder });
    return ok({ fund: f });
  }

  function acceptFund(st, actor, fundId, pin) {
    tick(st);
    var f = fundById(st, fundId);
    if (!f) return fail(st, actor, 'NOT_FOUND');
    if (actor !== f.keyHolder) return fail(st, actor, 'NOT_INVITED');
    if (f.status !== 'invited') return fail(st, actor, 'INVITE_CLOSED');
    if (String(pin) !== DEMO_PIN) return fail(st, actor, 'PIN_MISMATCH', 'CONFIRMATION_FAILED', { fundId: f.id }, {});
    f.status = 'active';
    f.available = f.committed;
    f.acceptedAt = st.now;
    log(st, st.now, actor, 'HOLDER_ACCEPTED', { fundId: f.id }, 'active', { amount: f.committed });
    return ok({ fund: f });
  }

  function declineFund(st, actor, fundId) {
    tick(st);
    var f = fundById(st, fundId);
    if (!f) return fail(st, actor, 'NOT_FOUND');
    if (actor !== f.keyHolder) return fail(st, actor, 'NOT_INVITED');
    if (f.status !== 'invited') return fail(st, actor, 'INVITE_CLOSED');
    f.status = 'declined';
    log(st, st.now, actor, 'HOLDER_DECLINED', { fundId: f.id }, 'no money held');
    return ok({ fund: f });
  }

  // ---------- Ask ----------
  function nextCode(st) {
    var code;
    do { st.seq.rc += 1; code = hex(fnv('sayso-request-' + st.seq.rc), 6); } while (reqByCode(st, code));
    return code;
  }

  function validateRequest(input) {
    var amount = Number(input.amount);
    var recipient = String(input.recipient || '').trim();
    var ref = String(input.recipientRef || '').trim();
    var purpose = String(input.purpose || '').trim();
    var errors = {};
    if (input.amount === '' || input.amount == null || !isFinite(amount) || amount < 1 || amount > MAX_AMOUNT || Math.floor(amount) !== amount) errors.amount = 'INVALID_AMOUNT';
    if (recipient.length < 2 || recipient.length > 40) errors.recipient = 'INVALID_RECIPIENT';
    if (!/^\d{4}$/.test(ref)) errors.recipientRef = 'INVALID_REF';
    if (purpose.length < 3 || purpose.length > 80) errors.purpose = 'INVALID_PURPOSE';
    return { errors: errors, clean: { amount: amount, recipient: recipient, recipientRef: ref, purpose: purpose } };
  }

  function submitRequest(st, actor, input) {
    tick(st);
    if (!isAgent(actor)) return fail(st, actor, 'NOT_ALLOWED');
    var f = fundById(st, input.fundId);
    if (!f) return fail(st, actor, 'NOT_FOUND');
    if (f.status !== 'active') return fail(st, actor, 'FUND_NOT_ACTIVE');
    var v = validateRequest(input);
    var keys = Object.keys(v.errors);
    if (keys.length) {
      var first = v.errors[keys[0]];
      return { ok: false, code: first, message: CODES[first], fieldErrors: v.errors };
    }
    st.seq.r += 1;
    var r = { id: 'r' + st.seq.r, code: input.code || nextCode(st), fundId: f.id, requester: actor,
      recipient: v.clean.recipient, recipientRef: v.clean.recipientRef, amount: v.clean.amount, purpose: v.clean.purpose,
      createdAt: st.now, expiresAt: st.now + REQUEST_TTL, status: 'pending',
      decidedBy: null, decidedAt: null, privateReason: null, receipt: null, seal: null };
    r.seal = sealOf(r);
    st.requests.push(r);
    log(st, st.now, actor, 'REQUEST_SUBMITTED', { fundId: f.id, requestId: r.id }, 'pending', { amount: r.amount });
    // The agent learns only the code and status. It is not told whether the fund can cover it.
    return ok({ request: r, agentReply: { status: 'pending', code: r.code, expires: r.expiresAt } });
  }

  function withdrawRequest(st, actor, reqId) {
    tick(st);
    var r = reqById(st, reqId);
    if (!r) return fail(st, actor, 'NOT_FOUND');
    if (r.requester !== actor) return fail(st, actor, 'NOT_YOURS');
    if (r.status !== 'pending') return fail(st, actor, 'ALREADY_DECIDED');
    move(r, 'withdrawn');
    r.decidedAt = st.now;
    log(st, st.now, actor, 'REQUEST_WITHDRAWN', { fundId: r.fundId, requestId: r.id }, 'withdrawn', { amount: r.amount });
    return ok({ request: r });
  }

  // ---------- Blocked attempts (always refused, always recorded) ----------
  function attemptEdit(st, actor, reqId, changes) {
    tick(st);
    var r = reqById(st, reqId);
    if (!r) return fail(st, actor, 'NOT_FOUND');
    var tried = Object.keys(changes || {}).join(', ') || 'details';
    return fail(st, actor, 'REQUEST_IMMUTABLE', 'EDIT_BLOCKED', { fundId: r.fundId, requestId: r.id }, { tried: tried });
  }

  function attemptDirectPay(st, actor, reqId) {
    tick(st);
    var r = reqById(st, reqId);
    if (!r) return fail(st, actor, 'NOT_FOUND');
    if (isAgent(actor)) return fail(st, actor, 'AGENT_CANNOT_PAY', 'DIRECT_PAY_BLOCKED', { fundId: r.fundId, requestId: r.id });
    return fail(st, actor, 'NOT_ALLOWED');
  }

  function readBalance(st, actor, fundId) {
    tick(st);
    var f = fundById(st, fundId);
    if (!f) return fail(st, actor, 'NOT_FOUND');
    if (actor === f.keyHolder) return ok({ balance: f.available });
    return fail(st, actor, 'BALANCE_HIDDEN', 'BALANCE_BLOCKED', { fundId: f.id });
  }

  function readReason(st, actor, reqId) {
    tick(st);
    var r = reqById(st, reqId);
    if (!r) return fail(st, actor, 'NOT_FOUND');
    var f = fundById(st, r.fundId);
    if (actor === f.keyHolder) return ok({ reason: r.privateReason });
    return fail(st, actor, 'REASON_PRIVATE', 'REASON_BLOCKED', { fundId: r.fundId, requestId: r.id });
  }

  // ---------- Decide ----------
  function guardDecision(st, actor, r, f) {
    if (isAgent(actor)) return fail(st, actor, 'AGENT_CANNOT_PAY', 'DIRECT_PAY_BLOCKED', { fundId: r.fundId, requestId: r.id });
    if (actor !== f.keyHolder) return fail(st, actor, 'NOT_KEY_HOLDER', 'ROLE_BLOCKED', { fundId: r.fundId, requestId: r.id });
    if (r.status === 'paid') return fail(st, actor, 'ALREADY_PAID', 'DUPLICATE_BLOCKED', { fundId: r.fundId, requestId: r.id });
    if (r.status === 'expired') return fail(st, actor, 'REQUEST_EXPIRED', 'EXPIRED_PAY_BLOCKED', { fundId: r.fundId, requestId: r.id });
    if (r.status !== 'pending') return fail(st, actor, 'ALREADY_DECIDED');
    if (f.status !== 'active') return fail(st, actor, 'FUND_NOT_ACTIVE');
    return null;
  }

  function pay(st, actor, reqId, pin) {
    tick(st);
    var r = reqById(st, reqId);
    if (!r) return fail(st, actor, 'NOT_FOUND');
    var f = fundById(st, r.fundId);
    var blocked = guardDecision(st, actor, r, f);
    if (blocked) return blocked;
    if (String(pin) !== DEMO_PIN) return fail(st, actor, 'PIN_MISMATCH', 'CONFIRMATION_FAILED', { fundId: r.fundId, requestId: r.id });
    if (sealOf(r) !== r.seal) return fail(st, actor, 'DETAILS_CHANGED');
    if (f.available < r.amount) return fail(st, actor, 'INSUFFICIENT_HELD_BALANCE', 'BALANCE_SHORT_BLOCKED', { fundId: r.fundId, requestId: r.id });
    // The only line in the product that reduces a balance.
    f.available -= r.amount;
    move(r, 'paid');
    r.decidedBy = actor;
    r.decidedAt = st.now;
    r.receipt = { no: 'RCPT-' + hex(fnv('receipt-' + r.code), 6), at: st.now, balanceAfter: f.available };
    log(st, st.now, actor, 'REQUEST_PAID', { fundId: f.id, requestId: r.id }, 'paid', { amount: r.amount });
    return ok({ request: r, fund: f });
  }

  function refuse(st, actor, reqId, reason) {
    tick(st);
    var r = reqById(st, reqId);
    if (!r) return fail(st, actor, 'NOT_FOUND');
    var f = fundById(st, r.fundId);
    var blocked = guardDecision(st, actor, r, f);
    if (blocked) return blocked;
    move(r, 'refused');
    r.decidedBy = actor;
    r.decidedAt = st.now;
    r.privateReason = (reason && String(reason).trim()) ? String(reason).trim().slice(0, 200) : null;
    // The reason is never written to the shared log.
    log(st, st.now, actor, 'REQUEST_REFUSED', { fundId: f.id, requestId: r.id }, 'refused', { amount: r.amount });
    return ok({ request: r, fund: f });
  }

  // ---------- What each role is allowed to see ----------
  function fundsFor(st, actor) {
    if (actor === 'sunita' || actor === 'rohan') {
      return st.funds.filter(function (f) { return f.keyHolder === actor || f.createdBy === actor; });
    }
    if (isAgent(actor)) return st.funds.filter(function (f) { return f.status === 'active'; });
    return [];
  }

  function fundView(st, actor, f) {
    if (isAgent(actor)) return { id: f.id, name: f.name, status: f.status === 'active' ? 'held' : f.status };
    var v = clone(f);
    if (actor !== f.keyHolder) { delete v.available; v.balanceHidden = true; }
    return v;
  }

  function requestsFor(st, actor) {
    if (isAgent(actor)) return st.requests.filter(function (r) { return r.requester === actor; });
    var ids = fundsFor(st, actor).map(function (f) { return f.id; });
    return st.requests.filter(function (r) { return ids.indexOf(r.fundId) !== -1; });
  }

  function requestView(st, actor, r) {
    var f = fundById(st, r.fundId);
    var v = clone(r);
    if (actor !== f.keyHolder) { delete v.privateReason; v.reasonHidden = r.status === 'refused'; }
    if (isHuman(actor) && actor !== f.keyHolder) { delete v.amount; v.amountHidden = true; delete v.receipt; }
    if (isAgent(actor)) { delete v.decidedBy; delete v.receipt; delete v.seal; }
    v.overBalance = actor === f.keyHolder && r.status === 'pending' && r.amount > f.available;
    return v;
  }

  function logFor(st, actor) {
    var events;
    if (isAgent(actor)) {
      var mine = st.requests.filter(function (r) { return r.requester === actor; }).map(function (r) { return r.id; });
      events = st.log.filter(function (e) { return e.actor === actor || (e.requestId && mine.indexOf(e.requestId) !== -1); });
    } else {
      var ids = fundsFor(st, actor).map(function (f) { return f.id; });
      events = st.log.filter(function (e) { return e.fundId && ids.indexOf(e.fundId) !== -1; });
    }
    return events.map(function (e) {
      var v = clone(e);
      var f = e.fundId && fundById(st, e.fundId);
      if (isHuman(actor) && f && actor !== f.keyHolder && v.meta && 'amount' in v.meta && e.type !== 'FUND_CREATED' && e.type !== 'HOLDER_ACCEPTED') {
        delete v.meta.amount; v.meta.amountHidden = true;
      }
      return v;
    }).sort(function (a, b) { return b.at - a.at || b.n - a.n; });
  }

  function outcomeCounts(st, fundId) {
    var c = { pending: 0, paid: 0, refused: 0, expired: 0, withdrawn: 0 };
    st.requests.forEach(function (r) { if (r.fundId === fundId) c[r.status] += 1; });
    return c;
  }

  root.SaySo = root.SaySo || {};
  root.SaySo.core = {
    HOUR: HOUR, DAY: DAY, REQUEST_TTL: REQUEST_TTL, INVITE_TTL: INVITE_TTL, MAX_AMOUNT: MAX_AMOUNT, DEMO_PIN: DEMO_PIN,
    PEOPLE: PEOPLE, EVENTS: EVENTS, CODES: CODES, TRANSITIONS: TRANSITIONS,
    blank: blank, clone: clone, tick: tick, setNow: setNow, advance: advance, sealOf: sealOf,
    fundById: fundById, reqById: reqById, reqByCode: reqByCode, isAgent: isAgent, isHuman: isHuman,
    commitFund: commitFund, acceptFund: acceptFund, declineFund: declineFund,
    validateRequest: validateRequest, submitRequest: submitRequest, withdrawRequest: withdrawRequest,
    attemptEdit: attemptEdit, attemptDirectPay: attemptDirectPay, readBalance: readBalance, readReason: readReason,
    pay: pay, refuse: refuse,
    fundsFor: fundsFor, fundView: fundView, requestsFor: requestsFor, requestView: requestView, logFor: logFor,
    outcomeCounts: outcomeCounts
  };
})(typeof window !== 'undefined' ? window : globalThis);
