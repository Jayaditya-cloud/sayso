/*
 * Deterministic demo history for the Sharma household, Ludhiana.
 * Built by replaying real actions through the core, so the seed obeys the same rules as the live demo.
 * Times are IST wall-clock values stored as UTC numbers, so every machine shows the same times.
 */
(function (root) {
  'use strict';
  var core = root.SaySo.core;
  function T(month, day, h, m) { return Date.UTC(2040, month - 1, day, h, m); } // month is 1-based

  function must(res, what) { if (!res.ok) throw new Error('Seed step failed: ' + what + ' -> ' + res.code); return res; }

  function build() {
    var st = core.blank(T(10, 14, 9, 0));

    // Diwali Fund: Rohan commits, Sunita accepts.
    var diwali = must(core.commitFund(st, 'rohan', {
      name: 'Diwali Fund', amount: 8000, keyHolder: 'sunita', useBy: T(11, 5, 23, 59),
      purpose: 'Diwali sweets, clothes and puja items for the household'
    }), 'commit diwali').fund;
    core.setNow(st, T(10, 14, 9, 10));
    must(core.acceptFund(st, 'sunita', diwali.id, core.DEMO_PIN), 'accept diwali');

    // Tue 16 Oct: grocery request, an edit attempt, then a refusal with a private reason.
    core.setNow(st, T(10, 16, 11, 4));
    var kirana = must(core.submitRequest(st, 'agent:rohan', {
      fundId: diwali.id, recipient: 'Panchavati Kirana', recipientRef: '4471', amount: 2400,
      purpose: 'Weekly groceries and Diwali sweets ingredients', code: '9C4E11'
    }), 'kirana').request;
    core.setNow(st, T(10, 16, 11, 10));
    core.attemptEdit(st, 'agent:rohan', kirana.id, { amount: 3100 });
    core.setNow(st, T(10, 16, 11, 20));
    must(core.refuse(st, 'sunita', kirana.id, 'Groceries come from the monthly budget, not this fund.'), 'refuse kirana');

    // Wed 17 Oct: a late-night subscription request nobody answers.
    core.setNow(st, T(10, 17, 23, 40));
    must(core.submitRequest(st, 'agent:aarav', {
      fundId: diwali.id, recipient: 'StreamBox', recipientRef: '9020', amount: 999,
      purpose: 'Festival movie subscription, one year', code: '5D20AF'
    }), 'streambox');

    // Thu 18 Oct: Rohan's agent tries to pay directly.
    core.setNow(st, T(10, 18, 10, 2));
    core.attemptDirectPay(st, 'agent:rohan', kirana.id);

    // School Fee Fund: committed, accepted, paid in full. Purpose met.
    core.setNow(st, T(10, 20, 18, 0));
    var school = must(core.commitFund(st, 'rohan', {
      name: 'School Fee Fund', amount: 12500, keyHolder: 'sunita', useBy: T(11, 5, 17, 0),
      purpose: 'Aarav’s term fee, due Mon 5 Nov'
    }), 'commit school').fund;
    core.setNow(st, T(10, 20, 18, 30));
    must(core.acceptFund(st, 'sunita', school.id, core.DEMO_PIN), 'accept school');
    core.setNow(st, T(10, 22, 10, 0));
    var fee = must(core.submitRequest(st, 'agent:aarav', {
      fundId: school.id, recipient: 'Green Valley School', recipientRef: '5531', amount: 12500,
      purpose: 'Term 2 tuition fee', code: '3B91D0'
    }), 'fee').request;
    core.setNow(st, T(10, 22, 10, 6));
    must(core.pay(st, 'sunita', fee.id, core.DEMO_PIN), 'pay fee');

    // Fri 26 Oct: Rohan asks to see the Diwali balance and is refused.
    core.setNow(st, T(10, 26, 20, 15));
    core.readBalance(st, 'rohan', diwali.id);

    // Tue 30 Oct: two requests waiting for Sunita.
    core.setNow(st, T(10, 30, 16, 20));
    must(core.submitRequest(st, 'agent:aarav', {
      fundId: diwali.id, recipient: 'Lakshmi Garments', recipientRef: '6612', amount: 1800,
      purpose: 'Kurta for Aarav for Diwali', code: '2A6B9E'
    }), 'garments');
    core.setNow(st, T(10, 30, 17, 10));
    must(core.submitRequest(st, 'agent:rohan', {
      fundId: diwali.id, recipient: 'Shree Sweets', recipientRef: '2087', amount: 2100,
      purpose: 'Diwali sweets order', code: '7F3A2C'
    }), 'sweets');

    core.setNow(st, T(10, 30, 17, 15));
    return st;
  }

  root.SaySo.seed = { build: build, T: T };
})(typeof window !== 'undefined' ? window : globalThis);
