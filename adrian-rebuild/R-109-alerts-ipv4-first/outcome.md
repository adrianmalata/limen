<!-- PL: Wynik R-109 (28.11 w nocy, przy `3d2d3f4`; recenzja PASS w rundzie 1): serwis `limen-alerts.service` dostaje w
`seat/units.ts` linię `Environment=NODE_OPTIONS=--dns-result-order=ipv4first` zaraz po `ExecStart=`, ze stałej, której
komentarz cytuje D-108, bez cudzysłowów. Złoty test unitu w `test/seat/units.test.ts` trzyma tę linię z komentarzem
`// D-108:` i padał przed zmianą; dokument seata dostaje jedno zdanie. Bramka 1562/1562, `check.mjs` i Biome
przechodzą; weryfikacja `systemd-analyze verify` i brak HTTP 429 zostają do kroku 4.11 na seacie. -->

# R-109 outcome

## Done

1. `seat/units.ts` (Change 1):
   - New constant `ALERTS_NODE_OPTIONS` (`:21-26`) with the value `NODE_OPTIONS=--dns-result-order=ipv4first`. Its
     comment cites D-108: the ntfy relay refuses the seat's IPv6 sender for its daily quota and takes IPv4, so the
     run's Node tries a name's IPv4 address first. The comment also says why the value is unquoted: it holds no white
     space, quote, backslash or `%`, which is what systemd's quoting is for (fact 2).
   - The service's `[Service]` section gets `["Environment", ALERTS_NODE_OPTIONS]` (`:62`), right after `ExecStart=`
     and before the two `LoadCredential=` lines. The renderer (`src/platform/systemd-units.ts`) is unchanged. The
     line is `Environment=NODE_OPTIONS=--dns-result-order=ipv4first`, 53 characters.
   - The timer is unchanged.
2. `test/seat/units.test.ts` (Change 2): the golden text of `limen-alerts.service` holds
   `"Environment=NODE_OPTIONS=--dns-result-order=ipv4first"` right after the `ExecStart=` line (`:30`), with the
   comment `// D-108: the relay refuses the seat's IPv6 sender for its daily quota, so Node tries its IPv4 address
   first.` above it (`:29`). The timer's golden text, the T-10 width test and the other tests are unchanged.
3. `docs/seat/README.md` (Change 3): one sentence at the service's settings (`:29`), after the sentence about the
   `topic` credential: "The service sets `NODE_OPTIONS=--dns-result-order=ipv4first`, so Node tries the relay's IPv4
   address first, since the relay refuses the seat's IPv6 sender for its daily quota." No address is named.

`test/seat/alerts.test.ts` is unchanged. It reads the expected unit text from the code (`unitText`, `:851-852`), so
its install tests now expect the new line, and they pass (AC-2).

## Proof

All commands ran from the repository root at `3d2d3f4`, with the change in the working tree.

| Command | Exit | Tests |
|---|---|---|
| `node --test test/seat/units.test.ts` (AC-1) | 0 | 5/5 |
| `node --test test/seat/alerts.test.ts` (AC-2) | 0 | 64/64 |
| `git grep -q 'NODE_OPTIONS=--dns-result-order=ipv4first' -- seat/units.ts test/seat/units.test.ts` (AC-3) | 0 | — (exit 1 at HEAD, Decision 5) |
| `git grep -q 'D-108' -- seat/units.ts` (AC-4) | 0 | — (exit 1 at HEAD, Decision 5) |
| `git grep -q 'ipv4first' -- docs/seat/README.md` (AC-5) | 0 | — (exit 1 at HEAD, Decision 5) |
| `node adrian-rebuild/tools/fails-before.mjs` (AC-6) | 0 | `test/seat/units.test.ts` fails at HEAD (below) |
| `node adrian-rebuild/tools/gate.mjs --out node_modules/.rebuild-review/R-109.gate` (AC-7) | 0 | 1562/1562, `fail 0`, `duration_ms 353256` |
| `npx biome check --error-on-warnings .` (AC-8) | 0 | 310 files |
| `node adrian-rebuild/tools/check.mjs` (AC-8) | 0 | "0 errors" |
| `npx biome check --error-on-warnings adrian-rebuild` | 0 | 36 files |

The gate ran once, on the final tree: `ℹ tests 1562`, `ℹ pass 1562`, `ℹ fail 0`, `ℹ cancelled 0`, `ℹ skipped 0`. The
ticket adds no test; it changes one golden text. No test failed in any run of this ticket, except the changed test,
before the change and at HEAD.

## Fails before

The main session's run of protocol step 4 after its gate (1562/1562, 356.5 s): `node
adrian-rebuild/tools/fails-before.mjs` → exit 0, "test/seat/units.test.ts fail at HEAD (exit 1)", on the missing
`Environment=` line alone.

The test was written first. Before `seat/units.ts` changed, `node --test test/seat/units.test.ts` exited 1 with 4 of
5 passing. The one failure was the service's golden test, and its diff named only the missing line.

AC-6 on the final tree, `node adrian-rebuild/tools/fails-before.mjs` → exit 0. The tool prints the tail of the run;
the gate's private temporary folder is shown as `<gate TMPDIR>`:

```
fails-before: test/seat/units.test.ts fail at HEAD (exit 1)
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 134.309038

✖ failing tests:

test at test/seat/units.test.ts:17:1
✖ limen-alerts.service renders as its golden text: a oneshot run of /usr/bin/node on the alerts account (7.929923ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  ... Skipped lines

    '# Written by /opt/limen/seat/alerts.ts install; seat/deploy.ts rewrites it at each deployment.\n' +
      '[Unit]\n' +
      'Description=Limen alerts: one ntfy line for each failed job and long start-queue wait\n' +
      '\n' +
      '[Service]\n' +
  ...
      'ExecStart=/usr/bin/node /opt/limen/seat/alerts.ts run\n' +
  -   'Environment=NODE_OPTIONS=--dns-result-order=ipv4first\n' +
      'LoadCredential=topic:/etc/limen/alerts-topic\n' +
      'LoadCredential=watch:/etc/limen/watch\n' +
      'StateDirectory=limen-alerts\n' +
      'StateDirectoryMode=0700\n' +
      'TimeoutStartSec=120\n' +

      at TestContext.<anonymous> (file://<gate TMPDIR>/fails-before-7rrTh4/test/seat/units.test.ts:18:9)
  …
    operator: 'strictEqual',
    diff: 'simple'
  }
```

## Deviations from the ticket

None. One reading of Change 2: "with a `// D-108:` comment above it" is read as a comment above the new line inside
the golden array, not above the test. The test already has a `// D-117 (3):` comment above it, and the D-108 comment
explains that one line.

## Unmeasured

- `unmeasured`: no M-NN in `plan.md` → `## Measurement` covers it. Two things are checked only on the seat. First,
  `systemd-analyze verify` of the new service, at 4.0's deployment and at step 4.11 (fact 4). Second, the effect
  itself: with the drop-in removed, `systemctl show -p Environment limen-alerts.service` names
  `NODE_OPTIONS=--dns-result-order=ipv4first`, the next runs log no HTTP 429, and the next alert reaches the phone
  (`## Deployment` 4.11, D-118 (2)). The repository checks only the rendered text.

## Open points

1. The Risk stands as the ticket names it: until step 4.11 removes the drop-in, the unit and the drop-in set the same
   value. If the verification fails on the seat, the deployment returns the checkout, and the alerts keep the old unit
   and the drop-in.
2. Review round 1, note 1 (guessed): `--dns-result-order=ipv4first` orders Node's connection attempts only; with its
   family autoselection a slow IPv4 connect may fall over to IPv6 and meet the relay's quota. D-108 chose this setting
   (the seat's drop-in carries it), and step 4.11's "no HTTP 429" is where it would show; for Adrian at gate 5.4.
