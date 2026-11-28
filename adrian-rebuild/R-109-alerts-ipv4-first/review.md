<!-- PL: Recenzja ticketu R-109 (unit alertów wysyła najpierw przez IPv4). Runda 1 (28.11, noc): PASS, kryteria
AC-1–AC-8 spełnione, jedna uwaga „guessed” o autoselekcji rodziny adresów w Node, przeniesiona do punktów otwartych
`outcome.md` na krok 4.11 seata. Stan: recenzja zamknięta po jednej rundzie. -->

# R-109 review

## Round 1 (2026-11-28, night run)

- Before: the implementer's run → `review-guard.mjs compare --git` → "within its limits", exit 0. The main session's
  `gate.mjs --out node_modules/.rebuild-review/R-109.gate` → exit 0, 1562/1562 (356.5 s); `fails-before.mjs` → exit 0
  (`test/seat/units.test.ts`).
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-109.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-8 met; one note, no blocking finding. Taste questions: T-29 and T-30 yes; T-40 no; T-41
  not applicable.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · guessed: `--dns-result-order=ipv4first` orders the attempts only; with Node's family autoselection a slow IPv4 connect may fall over to IPv6 and meet the relay's quota | no change: D-108 chose this setting, which the seat's drop-in has carried since `limen-rebuild-33`; the repository cannot test it, and step 4.11 checks "no HTTP 429" on the seat; `outcome.md` → Open points names it for gate 5.4 |

No round of fixes; the review is closed.
