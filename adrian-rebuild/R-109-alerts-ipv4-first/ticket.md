<!-- PL: Ticket R-109 (D-108, D-112 (3), A-066): przekaźnik alertów odrzuca nadawcę IPv6 seata z powodu dziennego
limitu, a Node wybiera IPv6, więc serwis `limen-alerts.service` dostaje w swoim typowanym unicie
`Environment=NODE_OPTIONS=--dns-result-order=ipv4first`, tak jak robi to dziś tymczasowy drop-in na seacie. Złoty test
unitu pada przed zmianą; dokument seata dostaje jedno zdanie. Stan: napisany 26.11 przy `cbe6f1a` z inwentarza
`evidence/inventories/R-109.md`; `ready` na noc. -->

# R-109 The alerts' unit sends over IPv4 first

## Problem

D-108, quoted: "the relay refuses the seat's IPv6 sender for its daily quota and takes IPv4 (`## State`,
"`limen-rebuild-33`"), so the alerts run now with a temporary systemd drop-in on the seat that sets
`NODE_OPTIONS=--dns-result-order=ipv4first` for `limen-alerts.service` only, and a fix ticket puts that setting into
the alerts' unit (`seat/units.ts`); once a tag with it is deployed, Adrian removes the drop-in." D-112 (3): "D-108's fix
ticket → R-109, with seat step 4.11 that removes the drop-in". The note in `## Tickets`: "the alerts' service carries
`NODE_OPTIONS=--dns-result-order=ipv4first`, as the seat's temporary drop-in does, and still passes `systemd-analyze
verify`." A-066's Decision: the bell "is part of the seat core, not a module, because it is the only escalation path to
me". D-118 (2): step 4.11 drops the second install, removes the drop-in and checks the unit's environment. T-10: every
line of a unit is at most 100 characters (`test/seat/units.test.ts:62-68`).

Facts at `c3bbc5c` (the read-only inventory `evidence/inventories/R-109.md`):
1. `alertsUnits(account)` (`seat/units.ts:30-79`) renders the service's `[Service]` with `Type=oneshot`, `User=`,
   `ExecStart=/usr/bin/node /opt/limen/seat/alerts.ts run` (`ALERTS_RUN`, `:14`), `LoadCredential=`,
   `StateDirectory=`, `StateDirectoryMode=0700`, `TimeoutStartSec=120` and the protections (`:43-57`), and no
   `Environment=` line. The send is Node's `fetch` (`seat/alerts.ts:474-487`); nothing sets a DNS order.
2. The one renderer (`src/platform/systemd-units.ts`, `directiveLine` `:123-129`) writes `Key=value` as given; it
   refuses a bad key, an empty value and a control character, and quotes nothing. The only quoting is the sweep's `PATH`
   (`pathAssignment`, `:99-108`), for white space, `\`, `"` and `%`, none of which the new value holds; the line is 53
   characters.
3. `test/seat/units.test.ts:16-39` compares the service's whole text with `assert.equal`, so the new line makes it fail
   at HEAD. `test/seat/alerts.test.ts:727-740` reads the expected text from the code and passes unchanged.
4. `systemd-analyze verify` of the alerts' units runs only on the seat: at the install (`placeUnits`,
   `seat/alerts.ts:714-744`) and at each deployment, which writes the units of the new release again
   (`seat/deploy.ts:396`, `:501-505`) and returns the checkout on a failed verification (`:374-377`).
5. `docs/seat/README.md:29` lists the service's settings and does not name the address order.

## Change

1. `seat/units.ts`: the alerts' service gets `Environment=NODE_OPTIONS=--dns-result-order=ipv4first`, right after
   `ExecStart=`, from a named constant whose comment cites D-108 (the relay refuses the seat's IPv6 sender for its
   daily quota); unquoted, since the value holds none of the characters that systemd's quoting is for.
2. `test/seat/units.test.ts`: the golden text of the service holds the line (the test fails at HEAD), with a `// D-108:`
   comment above it; the timer's golden text does not change.
3. `docs/seat/README.md`: one sentence at the service's settings: the service sets that variable, so Node tries the
   relay's IPv4 address first, since the relay refuses the seat's IPv6 sender for its daily quota; no address named.

## Out of scope

- Other outbound requests: the sweep's service sends none; the doorbell's poller (`src/integrations/github-poller.ts`)
  talks to GitHub, not to the relay, and D-108 does not name it. R-106's watcher runs inside the alerts' run (D-117 (2)),
  so this line covers it.
- `dns.setDefaultResultOrder` in the code: D-108 names the unit.
- Removing the drop-in on the seat: step 4.11 (Adrian's).

## Acceptance

- AC-1: `node --test test/seat/units.test.ts` → exit 0.
- AC-2: `node --test test/seat/alerts.test.ts` → exit 0.
- AC-3: `git grep -q 'NODE_OPTIONS=--dns-result-order=ipv4first' -- seat/units.ts test/seat/units.test.ts` → exit 0.
- AC-4: `git grep -q 'D-108' -- seat/units.ts` → exit 0.
- AC-5: `git grep -q 'ipv4first' -- docs/seat/README.md` → exit 0.
- AC-6: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-7: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-8: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.

## Migration

None in the repository: 4.0's deployment writes the alerts' units again for the account in their `User=` (fact 4);
step 4.11 removes the drop-in (D-118 (2)).

## Risk

- Until 4.11, the unit and the drop-in both set the same value, so the result is the same.
- `systemd-analyze verify` of the new service runs only on the seat (4.0, 4.11); a failure there returns the checkout
  (fact 4), so the alerts keep the old unit and the drop-in. `outcome.md` marks it `unmeasured`.

## Rollback

`git revert $(git log --format=%H --grep='^R-109:' adrian-rebuild --)`; after a deployment of the revert, the drop-in
must be in place again before the alerts send (D-108).

## Decisions

Settled by the documents when the ticket was written (2026-11-26, the main session's reading, not a night default; the
inventory's questions in `evidence/inventories/R-109.md` → section 9):
1. The line is an unquoted constant in `seat/units.ts` with a comment citing D-108 (Q1 (a)): the value needs no
   quoting (fact 2), and T-25 (2) keeps a function without a policy local until a second module needs it.
2. The golden test holds the line (Q2 (a)): the rendered text is the one mechanism (T-29 (3)); a second test would
   assert the same line twice.
3. One sentence in `docs/seat/README.md` (Q3 (a)).
4. Step 4.11 follows D-118 (2) (Q4); `## Deployment` 4.11 is already amended.
