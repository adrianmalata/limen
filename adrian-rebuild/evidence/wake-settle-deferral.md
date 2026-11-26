<!-- PL: Diagnoza (26.11, D-128) jednorazowego zawieszenia testu `test/s3-finish-wake.test.ts` przy fake'u z R-038.
Subagent tylko do odczytu (strażnik review-guard: bez zmian) ustalił ze źródeł Pi 1.5.1, że wiadomość wysłana w trakcie
`agent_settled` jest odraczana i uruchamiana jako osobny bieg, tak jak w fake'u, więc hook budzenia oznacza czekające
budzenie jako „settled” przed jego biegiem i wysyła je ponownie. To dowód znaleziska A-089 i ticketu R-111. -->

# Wake delivery and Pi's settle deferral (2026-11-26, D-128)

The observation: `test/s3-finish-wake.test.ts`, test "a held gate starts its queued jobs …", run alone with R-038's fake
during R-038's last fix round, hung at `await delivered([urgent, early, later])` until its 500 s bound; the coordinator
noted "q urgent wake was unconfirmed twice; automatic delivery stopped", and in the transcript the wake's re-send entered
first and its first send entered last, after five later wakes. The same file passed alone once on the round-2 tree, and
the implementer's gate after the fixes passed (1282/1282). Not run again to get a green gate (D-029).

The diagnosis: a read-only `general-purpose` subagent, guarded by `review-guard.mjs snapshot` and `compare` ("unchanged",
exit 0), read Pi 1.5.1 (`adrian-rebuild/input/vendor/pi-coding-agent/package/dist/`), `hook/wake.ts`,
`src/job/wake-delivery.ts` and `test/fake-engine.mjs` at the working tree of R-038 (product code as at `8de6fd7`).
Verdict: **Pi defers as the fake does; the hook defect is real.**

## Pi 1.5.1

- A hook's `sendUserMessage` is fire-and-forget (`core/agent-session.js:2870-2877`) and calls `prompt` with the
  `deliverAs` option as its streaming behaviour (`:2012-2039`).
- `prompt` first checks `if (this._isEmittingAgentSettled) { this._deferredSettledActions.push(async () => await
  this.prompt(text, options)); return; }` (`:1695-1698`), before any streaming or follow-up check, so both of the hook's
  forms (no options, and `deliverAs: "followUp"`) are deferred. `sendCustomMessage` with `triggerTurn` does the same
  (`:1967-1970`).
- `_emitAgentSettled` (`:738-760`) holds the flag only while the event is emitted (`:741-748`), then takes
  `this._deferredSettledActions.splice(0)` and runs `for (const action of deferred) await action();` (`:750-753`). Each
  action finds the session idle and starts its own run; `_startRun` ends with `await this._emitAgentSettled()`
  (`:1528-1535`), so each deferred run emits its own `agent_settled` while the later ones still wait in the local array,
  where no hook can see them. Messages sent during a nested settle run at its end, before the outer list goes on
  (depth first), so a re-send can enter before its own first send.

## The fake

`test/fake-engine.mjs` defers the same way: `promptMessage` checks `emittingSettled` first (`:220-223`), `settle` fires
the event with the flag set and then runs the deferred actions in order (`:355-366`), and each one runs inline and ends
with its own settle (`:257-260`, `:349-351`). Two differences off this path: a deferred action that throws stops Pi's
loop (`:753`) while the fake logs and goes on; Pi's re-entered `prompt` stays idle for a few microtasks before
`_startRun` marks it busy, while the fake reserves at once.

## The hook

1. In a settle, the hook's `agent_settled` handler marks every pending delivery settled, runs `confirmDeliveries`, then
   `sweep()`, which sends the waiting wakes inside the emit window, so Pi defers them all (`hook/wake.ts:1023-1034` at
   `8de6fd7`; `:1001-1009` at `rebuild-base`).
2. Each send creates a delivery with every flag false and sets `accepted` one microtask later, because the send returns
   nothing (`hook/wake.ts:436-452`; `src/job/wake-delivery.ts:98`, `:111-119`).
3. The first deferred run sets `entered` and `answered` on its own delivery only (`hook/wake.ts:986-993`, `:1010-1019`)
   and ends with its own settle, whose handler sets `settled` on every pending delivery, those still deferred included.
4. `confirmDeliveries` (`:730-744` at `8de6fd7`; `:753-764` at `rebuild-base`) then finds them accepted and settled but
   not entered and records them unconfirmed (`src/job/wake-delivery.ts:174-210`); the same handler's `sweep()` re-sends,
   and a second unconfirmed attempt blocks the claim with "wake was unconfirmed twice; automatic delivery stopped"
   (`hook/wake.ts:485`). When the first send finally enters, it matches another delivery by text or none.

## Related, traced only in part

With the session idle, two wakes of one sweep sent back to back may both pass Pi's streaming check before either
`_startRun` marks the session busy (`core/agent-session.js:1725`, `:1735`, `:1748`, `:1488`); pi-agent-core's `prompt`
then throws "Agent is already processing a prompt" (`pi-agent-core/package/dist/agent.js:246-248`), and that run's
`finally` would emit an `agent_settled` inside the other run. The fake cannot show it, since it reserves the session at
once. For R-111's inventory to settle.
