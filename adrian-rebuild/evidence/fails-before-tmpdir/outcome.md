<!-- PL: Wynik poprawki fails-before.mjs (punkt otwarty 3 R-018): kopia HEAD powstaje w prywatnym TMPDIR bramki,
w którym biegną testy, a jej katalog jest wypełniany wewnątrz `try`, którego `finally` go usuwa. Dwa nowe testy w
tools/test-fails-before.mjs (miejsce kopii i sprzątanie kopii, której nie dało się zrobić) padają na wersji narzędzia
z HEAD i przechodzą po zmianie; Biome i check.mjs kończą się kodem 0. Stan: zrealizowane; recenzja PASS w trzech
rundach, w review.md. -->

# Outcome: `fails-before.mjs` makes its copy of HEAD under the gate's private TMPDIR

## Done

- `adrian-rebuild/tools/fails-before.mjs`: the gate's environment is built once; the copy's folder is made with
  `mkdtempSync` in its `TMPDIR` and filled by `fillWithHead` (was `headWith`, which made the folder itself) inside the
  `try` whose `finally` removes it; the same environment runs the tests; the comment at the copy names why (the GitHub
  poller's `privatePath` refuses a module path below a folder other users can write); `tmpdir` is no longer imported;
  the Polish summary names the private TMPDIR.
- `adrian-rebuild/tools/test-fails-before.mjs`: the test "R-018 open point 3: the copy of HEAD lies in the gate's
  private TMPDIR, where the tests run" (a fixture test records its working directory and its `TMPDIR`, then fails on
  purpose; the outer test compares the real path of the folder that held the copy with the real path of that
  `TMPDIR`), and "R-018 open point 3: a copy that cannot be made is removed, so the private folder keeps no leftover"
  (a listed test path missing from the working tree makes `copyFileSync` throw; the OS temporary folder is the gate's
  private folder, so a copy made outside the cleanup would stay in sight); the Polish summary names them.

## Proof

- `node --test adrian-rebuild/tools/test-fails-before.mjs` → exit 0 (tests 5, pass 5, fail 0).
- `npx biome check --error-on-warnings .` → exit 0.
- `node adrian-rebuild/tools/check.mjs` → exit 0.

## Fails before

`fails-before.mjs` selects only test files under `test/`, so it cannot run on its own test (review round 1, note 1).
The new test ran instead against HEAD's tool: `git show HEAD:adrian-rebuild/tools/fails-before.mjs`, `gate-env.mjs` and
`git-worktree-z-shim.sh` copied into a folder of the session's scratchpad beside the new `test-fails-before.mjs`, then
`node --test <that folder>/test-fails-before.mjs` → exit 1, tests 4, pass 3, fail 1; only the new test failed:

```
AssertionError [ERR_ASSERTION]: the copy ran in /tmp/fails-before-ciXSId
+ actual - expected
  actual: '/tmp',
  expected: '/tmp/fails-before-fixture-Tzund1/.cache-home/limen-rebuild-gate',
```

The first form of the test (a prefix check, before review round 1's note 3) failed at HEAD the same way: `the copy ran
in /tmp/fails-before-fznfQE`. After review round 2 the same run with both new tests → exit 1, tests 5, pass 3, fail
2: the first as above (`the copy ran in /tmp/fails-before-RVlLLR`), the second because HEAD's tool left its copy
behind (`+ 'fails-before-IRTJek'` against the expected `[]`).

## Deviations

- `headWith` became `fillWithHead`, which fills a folder the caller made, so that the folder exists before the `try`
  and every failure after it is removed (review round 1, note 2); the ticket's `## Change` says so.

## Measurement

measured (the tool's own test).
