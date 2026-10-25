/*
 * Rule checks: the acceptance criteria, run against a fresh copy of the seed.
 * Runs in the browser (Demo controls > Run rule checks) and in Node. Never touches the live demo.
 */
(function (root) {
  'use strict';
  var S = root.SaySo;

  function run() {
    var core = S.core, results = [];
    function check(name, fn) {
      try { var detail = fn(); results.push({ name: name, pass: true, detail: detail || '' }); }
      catch (e) { results.push({ name: name, pass: false, detail: e.message }); }
    }
    function expect(cond, msg) { if (!cond) throw new Error(msg); }
    function fresh() { return S.seed.build(); }
    function diwali(st) { return st.funds.filter(function (f) { return f.name === 'Diwali Fund'; })[0]; }
    function byCode(st, c) { return core.reqByCode(st, c); }

    check('Sunita sees a pending ₹2,100 request to Shree Sweets (7F3A2C)', function () {
      var st = fresh(), r = byCode(st, '7F3A2C');
      var mine = core.requestsFor(st, 'sunita').map(function (x) { return x.code; });
      expect(r && r.status === 'pending' && r.amount === 2100 && r.recipient === 'Shree Sweets', 'request missing or wrong');
      expect(mine.indexOf('7F3A2C') !== -1, 'not visible to Sunita');
    });

    check('Paying it moves the balance from ₹8,000 to ₹5,900 exactly once', function () {
      var st = fresh(), f = diwali(st), r = byCode(st, '7F3A2C');
      expect(f.available === 8000, 'start balance ' + f.available);
      var a = core.pay(st, 'sunita', r.id, core.DEMO_PIN);
      var b = core.pay(st, 'sunita', r.id, core.DEMO_PIN);
      expect(a.ok && !b.ok && b.code === 'ALREADY_PAID', 'second payment was not stopped');
      expect(f.available === 5900, 'balance is ' + f.available);
      return 'second attempt returned ALREADY_PAID';
    });

    check('A receipt is created and the payment is in the activity log', function () {
      var st = fresh(), r = byCode(st, '7F3A2C');
      core.pay(st, 'sunita', r.id, core.DEMO_PIN);
      expect(r.receipt && r.receipt.no && r.receipt.balanceAfter === 5900, 'no receipt');
      expect(st.log.some(function (e) { return e.type === 'REQUEST_PAID' && e.requestId === r.id; }), 'not logged');
    });

    check('A wrong PIN pays nothing', function () {
      var st = fresh(), f = diwali(st), r = byCode(st, '7F3A2C');
      var res = core.pay(st, 'sunita', r.id, '1111');
      expect(!res.ok && res.code === 'PIN_MISMATCH' && f.available === 8000 && r.status === 'pending', 'debit or state change on wrong PIN');
    });

    check('Refusing needs no reason and does not change the balance', function () {
      var st = fresh(), f = diwali(st), r = byCode(st, '2A6B9E');
      var res = core.refuse(st, 'sunita', r.id);
      expect(res.ok && r.status === 'refused' && f.available === 8000, 'refusal failed or debited');
    });

    check('A refused request can never be paid', function () {
      var st = fresh(), r = byCode(st, '9C4E11');
      var res = core.pay(st, 'sunita', r.id, core.DEMO_PIN);
      expect(!res.ok && res.code === 'ALREADY_DECIDED', 'refused request was payable');
    });

    check('An unanswered request expires after 24 simulated hours and cannot be paid', function () {
      var st = fresh(), f = diwali(st), r = byCode(st, '7F3A2C');
      core.advance(st, (r.expiresAt - st.now) / 60000 - 1);
      expect(r.status === 'pending', 'expired too early');
      core.advance(st, 2);
      expect(r.status === 'expired', 'did not expire');
      var res = core.pay(st, 'sunita', r.id, core.DEMO_PIN);
      expect(!res.ok && res.code === 'REQUEST_EXPIRED' && f.available === 8000, 'expired request was payable');
    });

    check('An agent cannot pay directly', function () {
      var st = fresh(), r = byCode(st, '7F3A2C');
      var a = core.attemptDirectPay(st, 'agent:rohan', r.id);
      var b = core.pay(st, 'agent:rohan', r.id, core.DEMO_PIN);
      expect(!a.ok && !b.ok && a.code === 'AGENT_CANNOT_PAY' && b.code === 'AGENT_CANNOT_PAY' && diwali(st).available === 8000, 'agent payment possible');
    });

    check('An agent cannot change a submitted request', function () {
      var st = fresh(), r = byCode(st, '7F3A2C');
      var res = core.attemptEdit(st, 'agent:rohan', r.id, { amount: 3100 });
      expect(!res.ok && res.code === 'REQUEST_IMMUTABLE' && r.amount === 2100 && core.sealOf(r) === r.seal, 'request changed');
    });

    check('An agent cannot see the held balance', function () {
      var st = fresh(), f = diwali(st);
      var view = core.fundView(st, 'agent:rohan', f);
      var res = core.readBalance(st, 'agent:rohan', f.id);
      expect(!('available' in view) && !('committed' in view) && !res.ok && res.code === 'BALANCE_HIDDEN', 'balance leaked');
    });

    check('Rohan owns the account but cannot approve or see the balance', function () {
      var st = fresh(), f = diwali(st), r = byCode(st, '7F3A2C');
      var res = core.pay(st, 'rohan', r.id, core.DEMO_PIN);
      expect(!res.ok && res.code === 'NOT_KEY_HOLDER', 'Rohan could approve');
      expect(!('available' in core.fundView(st, 'rohan', f)), 'Rohan sees balance');
    });

    check('Refusal reasons stay private from Rohan and the agent', function () {
      var st = fresh(), r = byCode(st, '9C4E11');
      expect(!core.readReason(st, 'rohan', r.id).ok && !core.readReason(st, 'agent:rohan', r.id).ok, 'reason leaked');
      expect(!('privateReason' in core.requestView(st, 'rohan', r)), 'reason in Rohan view');
      expect(JSON.stringify(st.log).indexOf('monthly budget') === -1, 'reason written to log');
    });

    check('Invalid amounts are rejected with a clear message', function () {
      var st = fresh(), f = diwali(st);
      ['', '0', '-5', 'abc', '2.5', '2000000'].forEach(function (amt) {
        var res = core.submitRequest(st, 'agent:rohan', { fundId: f.id, recipient: 'Test Shop', recipientRef: '1234', amount: amt, purpose: 'Test purpose' });
        expect(!res.ok && res.code === 'INVALID_AMOUNT', 'accepted amount "' + amt + '"');
      });
    });

    check('A request larger than the held balance is flagged and cannot be paid', function () {
      var st = fresh(), f = diwali(st);
      var res = core.submitRequest(st, 'agent:rohan', { fundId: f.id, recipient: 'Gold Jewellers', recipientRef: '7788', amount: 9000, purpose: 'Diwali gold coin' });
      expect(res.ok && res.agentReply.status === 'pending', 'submit failed');
      expect(core.requestView(st, 'sunita', res.request).overBalance === true, 'not flagged for Sunita');
      expect(core.requestView(st, 'agent:rohan', res.request).overBalance === false, 'agent learned about the balance');
      var p = core.pay(st, 'sunita', res.request.id, core.DEMO_PIN);
      expect(!p.ok && p.code === 'INSUFFICIENT_HELD_BALANCE' && f.available === 8000, 'over-balance payment went through');
    });

    check('Commit and Accept: nothing is held until the key-holder accepts', function () {
      var st = fresh();
      expect(core.commitFund(st, 'rohan', { name: 'Self fund', purpose: 'Test', amount: 100, keyHolder: 'rohan' }).code === 'INVALID_HOLDER', 'creator could hold own key');
      var f = core.commitFund(st, 'rohan', { name: 'Lohri Fund', purpose: 'Lohri bonfire and gifts', amount: 3000, keyHolder: 'sunita' }).fund;
      expect(f.status === 'invited' && f.available === 0, 'money held before acceptance');
      expect(core.acceptFund(st, 'rohan', f.id, core.DEMO_PIN).code === 'NOT_INVITED', 'Rohan accepted for Sunita');
      expect(core.acceptFund(st, 'sunita', f.id, core.DEMO_PIN).ok && f.available === 3000 && f.status === 'active', 'acceptance failed');
    });

    check('A fund with nothing pending shows an empty state (School Fee Fund)', function () {
      var st = fresh(), school = st.funds.filter(function (f) { return f.name === 'School Fee Fund'; })[0];
      expect(core.outcomeCounts(st, school.id).pending === 0, 'school fund has pending requests');
    });

    check('Every balance equals committed minus paid requests', function () {
      var st = fresh(), r = byCode(st, '7F3A2C');
      core.pay(st, 'sunita', r.id, core.DEMO_PIN); core.pay(st, 'sunita', r.id, core.DEMO_PIN);
      core.refuse(st, 'sunita', byCode(st, '2A6B9E').id); core.advance(st, 48 * 60);
      st.funds.forEach(function (f) {
        if (f.status !== 'active') return;
        var paid = st.requests.filter(function (x) { return x.fundId === f.id && x.status === 'paid'; }).reduce(function (s, x) { return s + x.amount; }, 0);
        expect(f.committed - paid === f.available, f.name + ' ledger mismatch');
      });
    });

    return results;
  }

  root.SaySo = root.SaySo || {};
  root.SaySo.checks = { run: run };
})(typeof window !== 'undefined' ? window : globalThis);
