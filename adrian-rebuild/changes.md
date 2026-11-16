<!-- PL: Dziennik zmian przebudowy Limena: jeden wpis na zamknięty ticket R-NNN, tylko dopisywany, najnowszy na dole.
Każdy wpis wskazuje pliki, źródła (A-NNN, T-NN), dowód, status pomiaru, commit i sposób wycofania.
Stan: pusty — pierwsze wpisy powstaną w etapie 5 (przebudowa). -->

# Changes

Append-only log of the rebuild, newest entry last. One entry per closed ticket, in this format:

```
## YYYY-MM-DD R-NNN <title>
- What: <files, modules>
- Why: <A-NNN, T-NN>
- Proof: <command → exit 0>
- Measurement: measured | unmeasured (plan.md → Measurement: <metric>)
- Commit: <sha>
- Rollback: git revert <sha> (+ reverse migration, if any)
```
