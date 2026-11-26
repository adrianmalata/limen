<!-- PL: Plan przebudowy Limena i punkt wznowienia każdej sesji: wizja, słownik, decyzje Adriana (kopia §2 bramki 2,
D-008–D-032 z bramki 4 i po niej: wdrożenie po SHA, format changes.md, narzędzia seata w TypeScript, praca nocna,
wznowienie projektów po a0.3.0 jako ryzyko z terminem 21.11.2026, limit tygodniowy, akceptacja planu i definicji,
uprawnienia w settings.local.json, Claude Code instalowany przez roota, zapis narzędzi przez --out, nocny przebieg
tools/night.mjs, odpowiedzi na nocne pytania Q-1–Q-7: kryteria tylko w zakresie ticketu, nocą subagenci tylko na
pierwszym planie, ticket R-088, kod wyjścia tylko we wspólnym opakowaniu i R-013 po cięciach; A-087 w R-019 i zakaz
ponownego uruchamiania testu, który raz padł), fakty o silniku,
wymagania systemowe, 9 etapów z kosztem i efektem, 88 ticketów R-NNN, wdrożenie, pomiary, protokół subagentów
i polecenia na allow-listę. Stan: etap 5 (przebudowa) w toku, etap planu 1; R-001–R-006, R-008, R-010,
R-011 i R-088 zamknięte, 19.11 także R-007 i (nocą) R-009, R-012 i R-013; 18.11 w dzień doszły decyzje D-025–D-035
(m.in. zasady komunikacji z Adrianem, wyjątek dla testu A-087, przekazywanie sesji, poprawka helpera testów A-088
w R-007 i nowy snapshot po edycji w trakcie BLOCKED); w etapie 1 został R-014 (pair, w dzień), a `## State` ma gotowe
podsumowanie bramki 5.1; Q-8 rozstrzygnięte (D-036: `seat/deploy.ts` poza allow-listą); 19.11 w dzień D-037–D-044
(pytania R-014: tryb, `status --all`, `movedBy`, nagłówek modułów, teksty helpu, `group wait`, wymagane flagi trasy
`spawn`, trzecia runda poprawek) i R-014 zamknięty, więc etap 1 jest kompletny; 19.11 po południu etap 1 zamknięty
(bramka 244/244, M-10 77,1 s, lokalny tag a0.1.0); decyzje bramki 5.1 to D-045 i D-046 (zmiany linii końcowej,
odmów, runnera, skryptu wdrożenia i `kind`; tickety R-089 w etapie 2 oraz poprawkowe R-090 i R-091 w etapie 1, po
których tag a0.1.1 jest pierwszym wdrożeniem); R-090 zamknięty 19.11 (lista sprawdzonych rejestrów, odmowa bez
projektu, test nazw liczy tylko pliki znane gitowi); R-091 zamknięty 19.11 (oznaczenia typów Pi, odmowa bez
oznaczenia, koniec przebiegu na agent_settled, definicja touchpoints); D-047: narzędzie przekazania sesji
tools/handover.mjs (start nowej sesji w tmux i zamykanie poprzednich sesji przebudowy); 19.11 wieczorem
limen-rebuild-8 zamknęła etap 1 ponownie (bramka 253/253, M-10 82,2 s, lokalny tag a0.1.1, pierwsze wdrożenie);
D-048: B.2 tego samego wieczoru zamiast nocy, etap 2 w dzień 20.11; D-049 i D-050: B.2 zamknięte z K = 2
(seat check R-011 zaliczony, dwie ważne próby F013 bez kandydata, dwie unieważnione, raport w evidence/);
D-051: koordynatory używają /opt/limen; a0.1.1 wdrożony 20.11 (1.0–1.3 i próbna trasa 0.6 na ledgerze:
F009 i F010, land bez „land”); projekty stoją do a0.3.0 (D-012); przekazanie do limen-rebuild-9, które zaczyna
etap 2 w dzień; 20.11 D-052 (wyjątki zmiennych LIMEN_* i miejsca ustawień) i R-015 zamknięty (jeden moduł
konfiguracji src/config.ts, bramka 277/277); R-016 zamknięty (moduł granicy src/boundary.ts, zapadki JSON.parse
i rzutowań, bramka 310/310); D-053 i D-054: praca pod nieobecność Adriana 21–23.11 (push przy 98 % limitu, tańsza
recenzja, status ready dla nocy, domyślne decyzje techniczne nocą, arkusz wariantów dla ticketów pair); przekazanie
do limen-rebuild-10, która zrobiła D-054 w check.mjs (moduł tools/ticket-rules.mjs: status ready, nocny ticket pair
z zapisanymi wyborami, polecenia kryteriów sprawdzane z allow-listą); R-018 i R-020 gotowe do nocy (ready); R-017
gotowy po D-055 (kontrakt typów Pi tylko jako test w repo, błędy kształtu zdarzeń jako BAD_DATA), R-089 gotowy;
R-019 czekał na trzecią odpowiedź; przekazanie do limen-rebuild-11, która zapisała D-056 (R-019 zależy też
od R-020, ograniczone 60 s oczekiwanie na blokadę), więc R-019 jest gotowy do nocy; D-057 (rekord i migracja
R-021: `limen migrate`, foldery nieprzenoszalne do `.limen/unmigrated/`, zmigrowane rekordy tylko jako historia),
więc R-021 też jest gotowy; R-018 zamknięty w dzień (moduł zapisu atomowego, bramka 340/340); przekazanie do
limen-rebuild-12; D-059: sesja główna uruchamia bramkę po raporcie końcowym subagenta, bez czekania na powiadomienie
o zakończeniu zadania; D-060: git 2.56.1 z Linuxbrew na laptopie zamiast 2.34 (bez sudo); D-058 (usunięcie martwego kodu, którego Pi 1.5.1 nie ma) i R-017 zamknięty w dzień (adapter API
Pi `src/runtime/pi-api.ts` ze strażnikami, kontrakt typów na prawdziwych typach Pi 1.5.1, bramka 377/377); R-020
zamknięty w dzień (adapter platformy src/platform/ i wymagania systemowe przy limen init, bramka 401/401); R-022 i
R-023 gotowe do nocy po D-061 (odpowiedzi zgodne z rekomendacjami; nowy ticket R-092 dla T-38), ticket.md R-019 napisany
w dzień; przekazanie do limen-rebuild-13, która uruchomiła noc na hasło Adriana; nocą 20/21.11 R-019 zamknięty
(jeden moduł blokad src/lock.ts, bramka 429/429, trzy uwagi rundy 3 czekają na pytanie nocne Q-9); implementera
R-021 przerwał limit 5 h, przebieg 3 dokończył go świeżym implementerem i R-021 zamknięty (jeden record.json na job,
`limen migrate`, bramka 484/484, cztery uwagi rundy 3 czekają na pytanie nocne Q-10; limit tygodniowy 98 %); limit
tygodniowy zatrzymał noc o 06:15 w R-022 po rundzie 1 recenzji; rano 21.11 Adrian zresetował limit i zapisał D-062
(jeden ticket poprawek R-093 dla uwag Q-9 i Q-10, przed tagiem a0.2.0), a sesja dzienna wznawia R-022; D-063: punkt (8) R-093 (atomowy zapis rekordu w test/plant.ts), nowy R-094 (wrapper
w kolejce kończy się, gdy znika folder joba) i autopilot do 13:00; D-064 usuwa push przy 98 %; R-022 zamknięty (jeden resolver odwołań do jobów
src/job/reference.ts, bramka 504/504, dwie uwagi rundy 3 czekają na pytanie Q-11);
ticket.md R-093 napisany i przekazanie do limen-rebuild-14, która prowadzi autopilota do 13:00; R-093 zamknięty
(jeden helper kodu błędu src/system-error.ts, migracja zachowuje `born`, strzeżone odczyty hooka, atomowy zapis
rekordu w test/plant.ts, bramka 511/511); R-094 zamknięty (wrapper w kolejce kończy się bez rekordu joba,
sprzątanie testów zatrzymuje wszystkie procesy plant, test kolejki odporny na obciążenie, bramka 515/515; trzy uwagi
rundy 3 czekają na pytanie Q-12, zatrzymany proces 1509615 na Q-13); D-065: odpowiedzi Q-11–Q-13 zgodnie
z rekomendacjami (nowy ticket poprawek R-095, proces zakończony); R-089 zamknięty (w linii końcowej `code` i `next`
są wartością albo null, `next` zawsze poleceniem, czytnik testów i skan importów przez drzewo składni, bramka
572/572; dwie uwagi o skanie czekają na pytanie Q-14); ticket.md R-023 napisany i przekazanie do
limen-rebuild-15, która zaczyna R-023 w dzień; D-066: Q-14 jako punkt (f) R-095; D-067: jednorazowa porażka testu
s3-finish-wake w bramce R-023 mierzona jak w D-063 (2), nowy ticket R-096 (przyczyna nadmiarowego wake'a), stara
sesja limen-rebuild-9 zatrzymana; R-023 zamknięty (komendy jako cienkie adaptery nad modułami domeny, tekst
komendy drukowany na końcu, jeden moduł uruchamiający CLI Limena, słowa komend tylko w parserze; bramka 588/588,
runda 3 recenzji bez uwag); R-095 zamknięty (raport migracji o tokenie wspólnym z .limen/unmigrated/, `keeper` czyta
job raz, błąd sprawdzenia rekordu w kolejce z przyczyną w logu, `fileOf` jak Node; bramka 598/598; dwie uwagi
o pliku testu czekają na pytanie Q-17); limen-rebuild-16: Q-17 → D-068 (dwa punkty R-096), Q-18 → D-069 (przyczyna
nadmiarowego wake'a w fałszywym silniku testów, który emitował agent_settled po każdej turze; Pi robi to raz na
przebieg) i R-096 zamknięty (jeden agent_settled na przebieg w test/fake-engine.mjs, nowy test deterministyczny,
bramka 599/599); Q-19 → D-070 (R-092 przestawia dziewięć poleceń zapisujących przed odmową, reszta na zapadce do
R-082), ticket.md R-092 napisany i przekazanie do limen-rebuild-17; limen-rebuild-17: R-092 zamknięty (wspólny kształt
validate/apply w src/operation.ts, dziewięć poleceń przez runner, odmowy z własnymi kodami, UNTYPED 218 → 106,
wspólna migawka stanu w testach; bramka 676/676 po trzech rundach recenzji; cztery uwagi rundy 3 czekają na Q-26);
D-071–D-076 (R-097: limit subskrypcji jako `quota`; zakres i wygląd `limen stats`, R-098 po R-031; deklaracje odmów
w rejestrze i testy sukcesu `limen <polecenie>:`; noc tylko w etapie 2 do 9:00), R-097, R-024 i R-025 gotowe na noc;
noc 22.11: R-024 zamknięty (`limen stats` i jeden czytnik transkryptów przez walidatory; bramka 690/690, trzy rundy
recenzji z PASS); limit 5 h przerwał przebieg 1 w R-025, przebieg 2 zamknął R-025 (deklaracje odmów `refuses`
w rejestrze, skany kodów i testów przez drzewo składni, zapadki 70/35/29, test T-04 dla poleceń `read`; bramka
710/710, trzy rundy recenzji: FAIL, PASS, PASS) i R-097 (awaria na limicie subskrypcji jako `quota`; bramka
714/714), więc etap 2 ma wszystkie 18 ticketów zamknięte, a w `## State` czeka gotowe podsumowanie bramki 5.2;
Q-26 → D-077: nowy ticket naprawczy R-099 (uwagi rundy 3 R-092) gotowy i drugi przebieg runnera do 9:00 za zgodą
Adriana; R-099 zamknięty w nocy (przejęcie osieroconej bramki przekazania GitHub pod blokadą jobów, gałąź recenzji po
rekordzie joba, `github resolve` pod tą blokadą, klasa `GROUP_STOP_INCOMPLETE` według przyczyny, `git()` migawki
zgłasza błędy; bramka 733/733, recenzja FAIL, PASS, PASS), więc etap 2 ma 19 z 19 ticketów zamkniętych;
przekazanie do limen-rebuild-18, która zamknęła etap 2 (bramka 733/733 dwukrotnie, M-10 150,8 s, lokalny tag
a0.2.0 na commicie `Stage 2: close`; `check.mjs` na tym commicie zgłaszał dwa błędy tekstu planu, poprawione
w następnym commicie); bramka 5.2 rozstrzygnięta (D-078–D-082: domyślne decyzje nocne etapu 2 potwierdzone, rekord
dalej odrzuca nieznane pole, nowy ticket R-100 w etapie 3 przed R-029 i notatki dla siedmiu ticketów, tag a0.2.0
zostaje na 56f8168); etap 3 zaczęła limen-rebuild-19: cztery inwentarze tylko do odczytu (R-026, R-030, R-033,
R-100), cztery tickety gotowe na noc (R-026, R-030, R-033, R-100); Q-33 wycofane, bo gate 2 §0.5 trzyma nazwy kont
poza repo; D-083 (przed pytaniem o decyzję sesja przeszukuje cztery źródła, wymusza to hook), D-084
(jedna linia powiadomienia), D-085 (powiadomienia jako jednostka systemowa instalowana przez roota); przekazanie do
limen-rebuild-20, która zbudowała hook D-083 (tools/decision-guard.mjs, 63 testy, trzy rundy recenzji PASS; uwagi
rundy 3 poprawione bez czwartej rundy, D-086); blok hooks do .claude/settings.local.json dopisuje Adrian po powrocie
z wyjazdu, a sesja dzienna bierze tymczasem tickety etapu 3: R-026 zamknięty za dnia (każdy job we własnym scope
systemd, bramka 752/752, trzy rundy recenzji PASS); przekazanie do limen-rebuild-21, która zamknęła R-030 za dnia
(limen abandon, prune bez utraty niewylądowanej pracy, odmowa spawnu UNLANDED_WORK; pięć rund recenzji, trzecia i
czwarta runda poprawek z decyzji Adriana D-087 i D-088, bramka 787/787) i R-033 (powiadomienia z własnego konta
zamiast dzwonka, trzy rundy recenzji PASS, bramka 834/834; dwie uwagi do R-035, D-090); noc do 9:00 z pięcioma
ticketami (D-091) przygotowuje limen-rebuild-22; noc 22/23.11: R-027 zamknięty (żniwiarz zapisuje `failed` dopiero
po zniknięciu scope albo grupy, jedna łaska i jedno czekanie po KILL; bramka 846/846, recenzja PASS i PASS z jedną
rundą poprawek) i R-028 (TERM dociera do silnika, `stopped` tylko z zapisaną prośbą o stop, inny sygnał to `failed`
rodzaju `signal` albo `oom`, łaska 10 s; bramka 858/858, trzy rundy recenzji PASS z dwiema rundami poprawek); limit
5 h przerwał przebieg 1 w R-031, a przebieg 2 zamknął R-031 (znaczniki `landed` i `abandoned`, retire do archiwum
jobów jednym `rename`; bramka 900/900, recenzja FAIL, PASS, PASS z dwiema rundami poprawek; dwie uwagi rundy 3 to
pytanie Q-42); potem R-035 (progi kolejki: diagnoza po 30 min, porażka `queue` po 2 h; bramka 926/926; uwaga o
`advisory` to pytanie Q-43) i R-100 (jedna definicja czasu ISO, reguły 429, sprawdzenia kodu i listy jobów; bramka
946/946); noc skończyła się o 7:56 powodem `no-ticket`; rano 23.11 D-092: reguła D-087 dla uwag po wyczerpaniu rund
poprawek staje się ogólna, więc Q-42 idzie do notatek R-032, a Q-43 do notatek R-036; przekazanie do limen-rebuild-23.
Tam D-093: Adrian zatwierdził wszystkie domyślne decyzje tej nocy (Q-44), punkty otwarte wymagające kodu trafiły do
notatek R-029, R-032, R-037 i R-087, a sześć inwentarzy (R-029, R-032, R-034, R-036, R-037, R-087) leży w
`evidence/inventories/` jako podstawa ich `ticket.md`. D-094: R-032, R-034 i R-037 podzielone (nowe R-101, R-102,
R-103); D-095: nowe rodzaje porażki `launch` i `internal`; R-029 i R-036 gotowe na noc. limen-rebuild-24: R-087
(allow-lista środowiska joba, tryb testowy `LIMEN_TEST_MODE`) gotowy na noc, z krokiem 3.10 przepisanym; R-032
(`limen seat sweep` na timerze użytkownika co minutę, `status` i `show` tylko do odczytu, eskalacja `stuck`) gotowy na
noc, z krokiem 3.1 przepisanym. limen-rebuild-25: R-037 (commit zamknięcia land i `ticket done` budowany w
tymczasowym indeksie z oczekiwanego commita, hooki `git commit -m`, compare-and-swap gałęzi, blokada ticket-lanes,
odmowa brudnego ticketu przed merge'em) gotowy na noc; D-096: sprzątanie pozostałych kart Herdra i usunięcie `limen
close` idą do R-101, `diff` i `open` stają się poleceniami zmiany (T-04 bez `diff`), R-103 gotowy na noc za R-037.
limen-rebuild-26: D-097 (Q-51–Q-53): wznowienie po limicie to krok `seat sweep` bez własnego polecenia, wyścig
wznowienia z wdrożeniem to przyjęte ryzyko, stary folder reguł seata usuwa ręcznie Adrian; z rozstrzygnięciami
dokumentów R-034, R-101 i R-102 są gotowe na noc za swoimi zależnościami; D-098 (Q-54–Q-57): `limen stats` liczy
lądowania i tury koordynatora (flaga `--sessions`, wariant A wyjścia), R-098 gotowy z ticket.md, więc każdy ticket
etapu 3 jest `done` albo `ready`. limen-rebuild-29: R-034 zamknięty (wznowienie po limicie subskrypcji jako krok
`seat sweep`); D-099: przebieg implementera przyjęty mimo formy ticketu, a reguła D-089 staje się kontrolą w
`check.mjs`; D-100: alert `failed:quota` dzwoni też przy znanym resecie po 15 min spóźnienia wznowienia; R-102 ma
ticket.md. limen-rebuild-30: D-101: reguła jednej linii na kryterium w definicji recenzenta; R-036 zamknięty
(zawieszenie narzędzia mierzone na całym scope'ie joba, szczyt CPU w rekordzie, advisory ze źródłem); R-037 zamknięty
(atomowy commit zamknięcia ticketów, wspólny dla land i ticket done); noc do 08:00 po D-102 i strażniku blokady nocy.
limen-rebuild-31: R-103 gotowy (ticket.md z inwentarza, 18 pytań rozstrzygniętych dokumentami); D-102: przy żywej
blokadzie nocy sesja dzienna tylko czyta, biegacz nocny startuje jako śledzone zadanie w tle, reguła wznowienia
przerwanego przebiegu w `## Agents`. Noc 24/25.11: R-087 i R-098 zamknięte w przebiegu 1 (urwanym limitem 5 h o
03:37); przebieg 2 wznowił R-101 po regule D-102 (4) i go zamknął (dzienne kroki `seat sweep`: prune, retire i
zamykanie kart Herdr; nic, czego Git nie trzyma gdzie indziej, nie jest kasowane). R-102 zamknięty (reguły seata wycięte). limen-rebuild-32: R-103
zamknięty (land jako zapisane kroki merged, closed, cleaned; wspólne zamykanie kart Herdr; diff i open jako polecenia
zmiany), więc wszystkie 18 ticketów etapu 3 są zamknięte; etap 3 zamknięty przy lokalnym tagu a0.3.0
(bramka 1237/1237, M-10 317,2 s); bramka 5.3 częściowo rozstrzygnięta
(D-103–D-106: noc potwierdzona, pozycje (A) zostają, dwa commity Tools:, etap 4 czeka na zamknięcie etapu 3 na
seacie); potem D-107: przydział punktów otwartych
(notatki dla 10 ticketów, nowe R-104 i R-105 w etapie 4), „refusal” bez zmian, odczyt z limitem w T-04, archiwum
każdego niezarejestrowanego folderu i żywy wpis kolejki tylko dla joba projektu; przekazanie do limen-rebuild-33,
która z Adrianem wdrożyła a0.3.0 na seacie i przeszła kroki 0.1–0.3, 3.1–3.3, 3.5–3.8 i 3.10 (D-108: alerty przez
IPv4); limen-rebuild-34: D-109 (artefakty prób dozwolone tylko w trakcie przebudowy), D-110 (ruleset nie działa na
prywatnych repo projektów, więc zamiast kroku 3.11 obserwator `main` R-106 w etapie 4), D-111 (projekt zawodowy
korzysta z Limena najwcześniej od a1.0.0), D-112 (cztery znaleziska zamknięcia etapu 3: R-107–R-109 w etapie 4 i
notatka do R-051); próbna trasa F012 na ledgerze i krok 3.9 zaliczone; D-113: projekty na seacie dalej stoją, a limity
subskrypcji idą na przebudowę; artefakty prób usunięte z seata, zamknięcie etapu 3 na seacie (D-106) skończone,
przekazanie do limen-rebuild-35 (dwa commity Tools: z D-105); tam pierwszy z nich: bramka pada na nowym pliku
ignorowanym w checkoucie (D-105 (1)). -->










# Rebuild plan

## Vision

Derived from `taste.md` → Part B and the gate-2 decisions.

Limen after the rebuild is a harness in which code decides every transition and holds every guarantee, and prose is
left only for judgment (T-09, T-10, T-22). The owner talks to one coordinator session in his own language, that
session drives the whole workflow through Limen commands, and he is asked only for decisions and requests with options
and a recommendation, never for a permission that code can decide (T-05, T-13, T-40, T-41). No work is lost: nothing
that is not landed or abandoned is deleted, every failure has a recorded kind, and a limit, a timeout or a restart ends
in an automatic resume or a visible alert (A-001, A-002, A-016, T-01). A job lands when code-checked conditions hold on
the exact tip, namely Limen's own checks, a parsed review verdict, every judgment met and the round limit, and `main`
is published by a separate owner channel under a coverage rule (G3, G4, A-006). Agents run with an allow-listed
environment, no write credential and only root-owned code, and text written by a job or on GitHub reaches the
coordinator only as data in a tool result (G2, A-004, A-008, A-025). Every instruction Limen needs a model to read
arrives in one frozen context message per session, within a token budget per role, next to a turn cue of variable
parts only (A-086, A-037, A-077, T-09). The CLI is one registry of commands with plain names, exact job references,
exit codes as failure classes and a final JSON line for machines (T-02, T-18, T-19, T-20, T-37). Optional features are
modules, off by default, and what the seat does not use is cut (G1). Every change is a ticket with a test that failed
before it, one commit, a review and a recorded outcome, and every claim about model behaviour is measured on the seat
before and after by the same-task method (T-28, z. 40).

## Terms

Stage numbers. The rebuild prompt (`input/prompt.md`, local) has rebuild stages 0–6 with gates 0, 2, 3, 4 and 5.N;
rebuild stage 1 has no gate. Rebuild stage 5 carries out this plan's stages 1–9, and gate 5.N follows plan stage N.
`## Decisions`, `## Engine facts` and the copy of §2 were written in rebuild stages 0–3, so "stage N" there means
rebuild stage N; from `## Stages` on, "stage N" means plan stage N, and a rebuild stage is written "rebuild stage N".

- **seat**: the VPS that runs Limen for Adrian's two projects, `synchronizer` (Node, milestone M1 closed) and `ledger`
  (Java), with its accounts, timers and start queue.
- **Pi**, **bridge**, **Herdr**: the coding-agent engine (Pi 1.5.1); its provider `@vanillagreen/pi-claude-bridge`
  5.0.3, which runs Claude Code on the Claude Max subscription; the terminal multiplexer whose panes and tabs hold the
  coordinator and the job logs.
- **Max window**: the 5-hour and the weekly usage limits of that one subscription, shared by every session on the seat
  and by the rebuild's sessions on Adrian's laptop.
- **`rebuild-base`**: the local tag of the commit `3b5edd7` the rebuild starts from; every `path:line` reference in this
  file points there.
- **IDs**: A-NNN findings and the gate-2 items G1–G4, S1+, §N and H-NN (`audit.md`); T-NN taste rules (`taste.md`);
  AU-NNN items of `taste.md` → Part A (the author's taste); D-NNN decisions and E-N engine facts (this file); R-NNN
  tickets; M-NN metrics; "z. N" a rule of Adrian's harness
  principles (`input/zasady-budowy-harnessu.md`, local, Polish). "§7 D1" is item D1 of gate 2 §7; "A-030′" in the copy
  of §2 is the route part of A-030; "Q9", "cost 2" and "security 1" in `## Engine facts` are question numbers of
  `audit.md` → `## To verify`; the decision "rejected / fix" (A-046) rejects one part of a finding and fixes another.
- **T1**: the job environment as an allow-list (A-004).
- **owner**, **owner files**, **owner channel**, **published copy**, **coverage rule**: Adrian's role; the files that
  only the owner channel changes; the separate account that alone holds a GitHub write token and publishes `main`; the
  read-only copy of the published `main` that feeds prompts (A-011); the rule that publishes only covered commits
  (A-006). The copy of §2 and the findings named hold the details.
- **registers**: the three audiences of Limen's text: owner (the conversation with Adrian), agent (every role) and
  specs (tickets and the board) (A-038). The **audience line** of the turn cue names the register and its language
  (A-077, T-13).
- **fixed judgment**: a `Judgment` Limen adds to every ticket (A-031 (5)).
- **survey ticket**: a ticket whose deliverable is notes in its folder, for a question too long for the coordinator
  (T-34).
- **keeper**: the author's model job that fixed spec links and the board; `limen spec fix` replaces it (A-045).
- **`jg` cue**: the author's cue that recommends the `jg` search tool when it is on PATH; `jg` is not on the seat (T-36).
- **`needs-adam`**: the author's front-matter key for a ticket that waits for him (T-21).
- **alerts**: gate 2's "bell", notifications to Adrian's phone through ntfy, renamed by T-18; the **GitHub module** is
  gate 2's "doorbell".
- **`limen replay`** (T-22) puts held commits back on `main`; the **same-task runner** (R-011) is a measurement tool.

## Decisions

Adrian's decisions, dated. The hard constraints of `input/prompt.md` hold until a decision here changes them.

- 2026-11-16 D-001 (gate 0): the rebuild's test gate is `sh adrian-rebuild/tools/gate.sh` — `npm run check` with a
  private `TMPDIR`, plus the `git worktree list -z` shim only while the local git lacks that flag. A ticket's gate run
  must exit 0 with no new failure against `evidence/baseline.md` (83/83).
- 2026-11-16 D-002 (gate 0): commits on `adrian-rebuild` use the repo-local GitHub noreply identity of `2b8006f`, not the
  laptop's global identity.
- 2026-11-17 D-003 (gate 2, final form: revision 4 of Adrian's file): Adrian's decision on each of the 86 findings is
  the `Decision` field in `audit.md` (fix 76, rejected 9, rejected / fix 1; A-086 added in revision 2, A-008, A-009 and
  A-078 changed in revision 3, A-034, A-077 and A-086 in revision 4). The cross-cutting decisions are in `audit.md` → `## Gate 2: decisions` → §2: G1 features
  and module switches (optional modules off by default), G2 isolation (T1 in code; owner channel B1″, egress allow-list
  and research account B2c on the seat), G3 land by conditions in code with no human gate, G4 review verdict parsed in
  code and required for every change outside `spec/`, S seat tooling in this repo, S1+ one `record.json` per job, the
  owner files, the registered coordinator, and the measurement method. They bind this plan; stage 4 copies §2 and its
  constraints into this section, and every `fix` gets a ticket.
- 2026-11-17 D-004 (gate 2, §8): corrections to the target environment of `input/prompt.md`; where the prompt and this
  entry disagree, this entry wins.
  - Pi on the seat is 1.5.1, not 1.2.0 (bridge `@vanillagreen/pi-claude-bridge` 5.0.3).
  - "`limen land` only after Adrian's 'land'" is replaced by G3 (A-012): conditions in code, no human gate.
  - "Only Adrian pushes `main` (pre-push hook)" is replaced by A-006 + B1″: automatic publication by the owner channel
    under the coverage rule; agents hold no write credential.
  - "Adrian overrides `.agents/limen/communication.md` so the coordinator answers in Polish" is untrue (gate 2 §1); the
    register override is cut (A-039). The coordinator keeps answering in Adrian's language through normal conversation.
  - "Only Adrian changes `docs/` of the projects" is replaced by the owner-files decision (gate 2 §2): tickets change
    `docs/`; review and a fixed judgment protect it.
  - Coordinator, worker and reviewer reasoning levels come from `routes.json` (A-030), set at `limen init`; the
    prompt's values are examples, not constraints.
- 2026-11-17 D-005 (gate 2 accepted): Adrian accepted gate 2 as applied in `037f791`. Clarification: jobs run the bridge
  in isolated mode, so the A-042 fallback applies to them: the project's `AGENTS.md`, if it exists, goes into the
  Limen context message; the job launcher passes the Claude Code executable path and the bridge settings explicitly
  (E-15).
- 2026-11-17 D-006 (stage 3; in force since gate 3, D-007): the taste rules T-01–T-43 in `taste.md` → Part B are
  Adrian's decisions from the interview; where they
  change a gate-2 decision, the list "Changes to gate 2 decisions made in stage 3" in `taste.md` names each one, and
  the rule holds over the gate-2 wording. Stage 4 builds the tickets from both.
- 2026-11-17 D-007 (gate 3): Adrian accepted `taste.md` (commit `5e3b97b`). From now on it is a rubric next to the
  harness principles in `input/`; new taste decisions are added to it with their date and source.
- 2026-11-17 D-008 (gate 4, Q1): tags stay local and the pre-push hook is unchanged. `/opt/limen` gets a stage's
  commit by its pinned full SHA, through a root deployment script that the rebuild writes as seat tooling with tests
  (S, §7 D3; R-012). The script (1) refuses, listing the running jobs, while any job runs (D3); (2) runs `git fetch
  origin adrian-rebuild`; (3) checks that the SHA is an ancestor of `origin/adrian-rebuild`; (4) checks it out
  detached and creates a local tag on the seat for readability; (5) compares `git rev-parse HEAD` with the SHA; (6)
  runs the Pi type contract (T-32, AU-220) and on a mismatch returns to the previous SHA and exits with code 4. Gate
  5.N gives the tag and its full SHA; each stage's part of `## Deployment` holds one call of the script, then
  `/reload` and the further steps (the bridge contract of T-31, AU-225; migrations). Reason: "push the tag" in the
  rebuild prompt assumed that Adrian pushes it, but the stage-0 hook lets only `adrian-rebuild` through; a SHA cannot
  change, so root runs exactly the commit that passed the gate (z. 14). Check: tests of the script on a fixture repo
  (refusal while a job runs, refusal of a SHA off the branch, a checkout whose `rev-parse HEAD` equals the SHA, return
  to the previous SHA when the contract fails); `check.mjs`: every stage in `## Deployment` calls the script with a
  SHA.
- 2026-11-17 D-009 (gate 4, Q2; changes the `changes.md` format of the rebuild prompt): a `changes.md` entry is keyed
  by the commit subject, not by a SHA. The entry and the ticket's status in `plan.md` go into the ticket's own commit,
  so one commit per ticket stays. Format: `- Commit: R-NNN` instead of `<sha>`, and `- Rollback: git revert $(git log
  --format=%H --grep='^R-NNN:' adrian-rebuild --)` (+ the reverse migration, if any). The final `--` is the main
  session's correction of Adrian's wording: `adrian-rebuild` is also a directory of the repo, so without it `git log`
  exits with 128 ("ambiguous argument 'adrian-rebuild': both revision and filename"), found by the fixture test. `check.mjs` checks that
  `adrian-rebuild` has exactly one commit with the subject `R-NNN:`; a fix after the push gets a new R number. The SHA
  is computed when it is read (z. 22). Rejected: a separate commit for the entry (two commits per ticket), the entry in
  the next ticket's commit (the last ticket would have none), git notes (one more mechanism). Check: every
  `changes.md` entry has `Commit: R-NNN` with an existing ticket folder and exactly one commit with the subject
  `R-NNN:`; a test of `check.mjs` on a fixture with zero, one and two such commits.
- 2026-11-17 D-010 (gate 4, Q3; changes A-047): the seat tools are TypeScript, not shell (S: the same checks, tsc,
  Biome and tests; KISS). Node on the seat runs `.ts` directly (`erasableSyntaxOnly`, `allowImportingTsExtensions`);
  systemd units, the owner channel's forced command and the deployment script of D-008 call `node
  /opt/limen/seat/<tool>.ts` by absolute path (A-025). No `.sh` files in `seat/` and `bin/`; the only exception is the
  stage-0 pre-push hook in `adrian-rebuild/tools/` with its own test. The condition "no shell scripts" replaces
  A-047's shellcheck requirement. Systemd units and nftables rules are generated from typed definitions, with golden
  tests in `npm run check`; the deployment script runs `systemd-analyze verify` and `nft -c -f` on the seat before it
  enables them, and on an error returns to the previous SHA with code 4 (no test is skipped silently when a tool is
  missing). Rejected: `shellcheck` from npm (a binary downloaded at install, a new dev dependency, AU-214) and
  `shellcheck` only on the seat. Check: a scan finds no `.sh` file in `seat/` and `bin/` beyond the exception list;
  golden tests of the generated units and nftables rules; a test of the deployment script: a failed verification
  returns to the previous SHA with code 4.
- 2026-11-17 D-011 (gate 4, Adrian's additions before he accepts the plan): no delegated ticket depends, directly or
  through other tickets, on a pair ticket of its own stage, so the delegated tickets of every stage can run in a night
  run without Adrian, and the pair tickets run by day, before or after it (`## Tickets` → `Run`, checked by
  `check.mjs`). To get there, R-013 and R-014 move to stage 1, and R-067, R-069, R-070 and R-071 to stage 7; no ticket
  changes its scope, and none is merged. The arrangement exposed two missing dependencies, now in the table: R-067 on
  R-069 (the label's round, T-24) and R-081 on R-082–R-086 (docs from the final code, A-084). The plan also states the cost and the effect of each stage, the earliest
  stage after which the projects can resume on the seat, and the commands each stage needs for the allow-list in the
  repo's `.claude/settings.json`. The night mode itself (questions in `adrian-rebuild/questions.md` instead of a stop,
  hard exits, resume after a limit) is Adrian's addition to the rebuild prompt before rebuild stage 5.
- 2026-11-17 D-012 (gate 4, Q4): the projects resume on the seat after a0.3.0. Until a0.5.0 the risks that stage 5
  closes stay open (the agents' account holds the GitHub token and has an open network; harness code loads from
  worker-writable places; GitHub text and worker-writable files reach the coordinator; A-006, A-007, A-009, A-025,
  A-028): `accepted-risk` with a deadline. If a0.5.0 is not deployed by 2026-11-21 (Adrian, gate 4), Adrian
  takes the decision again (z. 26). What narrows the risk: T1 of A-004 (the job environment as an allow-list;
  git and gh in a job without a credential) moves to stage 3 as R-087, split from R-048 without a change of scope;
  before the projects resume, a GitHub ruleset on `main` of both projects forbids force pushes and deletion (part of
  §7 D1, step 3.11); the seat's GitHub token is fine-grained, with Contents read and write on `synchronizer` and
  `ledger` only (Adrian, 2026-11-17).
- 2026-11-17 D-013 (gate 4, Q5): at the weekly limit, until a0.5.0 the projects yield, which shortens the risk window
  of D-012; from a0.5.0 the rebuild yields. The threshold is manual, at about 80 % of the weekly usage.
- 2026-11-17 D-014 (gate 4): Adrian accepts the plan after two corrections: `### Resuming the projects on the seat`
  states the land rule of stages 3–6, and files are deleted and moved with `git rm` and `git mv`, so the allow-list of
  `## Commands` does not change every night. He accepts the subagent definitions separately, after reading them in
  full.
- 2026-11-17 D-015 (gate 4): Adrian accepts the subagent definitions after these corrections, each guaranteed by a tool
  with a test (z. 14). Implementer: HEAD and refs stay unchanged, and the index holds only deletions and moves of the
  paths the ticket's `## Change` names (`review-guard.mjs compare --git`, which also compares git's config and hooks,
  `input/` and the reserved paths: `plan.md`, `changes.md`, `audit.md`, `taste.md`, every `ticket.md` and
  `review.md`, `.claude/agents/`, and `tools/` beyond the paths `## Change` names; a violation voids the work); it
  reads `taste.md` → Part B in full (A-085); network only as the stage's allow-list permits. Reviewer: the main
  session's `fails-before.mjs` shows that new and changed tests fail at HEAD (a copy of HEAD from `git archive` with
  the tests laid over it), and the reviewer judges only whether a test checks its mechanism and fails for one reason;
  it answers the reviewer questions in the `Check` of every rule the diff touches (A-085); `review-verdict.mjs`
  rejects a reply whose verdict is inconsistent, and the review runs again (AU-126); it runs single tests, never the
  full gate. The gate itself moves from `gate.sh` to `node adrian-rebuild/tools/gate.mjs` with the same behaviour
  (D-001's command changes; no shell where Node does, D-010). Checks: `tools/test-review-guard.mjs`,
  `tools/test-fails-before.mjs`, `tools/test-review-verdict.mjs`.
- 2026-11-17 D-016 (Adrian, after gate 4): the permissions of rebuild stage 5 live in `.claude/settings.local.json`,
  untracked and excluded in `.git/info/exclude`, not in `.claude/settings.json`: per the Claude Code docs, `claude -p`
  does not apply the allow rules of a project's `.claude/settings.json` in a folder without trust, but it applies the
  untracked `settings.local.json`. The file sets `disableBypassPermissionsMode` to `disable`; its allow rules follow
  `## Commands` → "Every stage" (a push only as `git push origin adrian-rebuild`), its deny rules the "never" list
  there, plus Edit on `.claude/**` and `adrian-rebuild/input/**`. Adrian writes the file and adds the commands of R-011
  and R-017 after their `outcome.md`, and the stage-2 commands at the start of stage 2. Requirements: (1)
  `tools/night.mjs` runs `claude -p` with `--permission-mode dontAsk`, so a command off the list is refused and a write
  to a protected path is denied, whatever the mode would otherwise do; (2) every part of a compound command (`&&`, `;`,
  `|`) must match a rule, so no `cd` and no uncovered command in a pipe; (3) a variable assignment before a command
  (e.g. `TMPDIR=… node …`) breaks the match of an allow rule, so the tools set their environment themselves. The file
  joins the implementer's reserved paths, and `review-guard.mjs` checks its digest in both modes (with
  `.git/info/`).
- 2026-11-17 D-017 (Adrian; extends A-025): today the bridge runs Claude Code from the agents' home directory, which the
  agents can write and which updates itself. Instead, root installs Claude Code in a root directory in a pinned
  version, and only the seat script updates it, after the type contract (T-32, AU-220) and the bridge contract (T-31,
  AU-225) pass (z. 18). The version is a system requirement (T-12, AU-214, `## System requirements`); a mismatch
  exits with code 4 at coordinator start and at spawn. The bridge gets the explicit path to that binary.
  `DISABLE_UPDATES=1` is set in the environment of the coordinator and of every job, but the boundary is the file's
  owner (z. 14). The copy in the agents' directory is removed after the migration. Tickets: R-049 (install, version,
  refusal), R-048 (explicit path), R-087 (`DISABLE_UPDATES` in the job allow-list), R-050 (the start script sets it for
  the coordinator); steps 3.10, 5.3, 5.9 and 5.20.
- 2026-11-17 D-018 (Adrian, Q7): the tools of `tools/` that wrote their result through `>` take `--out <file>` and
  write it atomically, as in A-022 (`atomic-write.mjs`: a temporary file, fsync, rename, fsync of the directory, the
  directory created); stdout stays for the result. Reason: per the Claude Code docs the target of a `>` is checked on
  its own against the Edit rules (with `Edit(/**)` a write to `node_modules/.rebuild-review/` would pass), but that
  analysis changes between versions, so the protocol must not rely on it; it uses no `>` in the guard's commands.
  `context-size.mjs` and `spec-index.mjs`, which write their files themselves, use the same atomic write. Checks: a
  scan in `check.mjs` (no `>` in a command of a `tools/` tool in `## Agents`, `## Commands` and the subagent
  definitions); the `--out` tests in `tools/test-review-guard.mjs`. The scan exposed that `check.mjs` read `## Agents`
  only up to the template's first `## ` line inside a code block; `section()` now skips headings inside code fences.
- 2026-11-17 D-019 (Adrian, before the first night run; the night mode of the rebuild prompt v6 and D-016 (1)): the
  night runner `tools/night.mjs` and a supplement to the night mode. Specification and review:
  `evidence/night-runner/`.
  - Adrian starts `node adrian-rebuild/tools/night.mjs --until HH:MM` in a terminal; no session runs it, and it is not
    on the allow-list. `--until` is local time: the end is the next HH:MM, and an HH:MM more than 18 hours ahead counts
    as passed (it was at most 6 hours ago; Adrian, 2026-11-17).
  - Before the first run it refuses with exit 1: no or a passed `--until`; `input/prompt.md` lacks the first message
    word for word (the constant `FIRST_MESSAGE` in `night.mjs`); the `claude` command is not an executable file; a
    live runner holds `.night/lock`. The lock holds the pid, the process start time and the boot id; any mismatch
    makes it abandoned, and it is taken over (A-017).
  - Each run: `claude -p "<first message> Tryb nocny do HH:MM." --permission-mode dontAsk --output-format json` from
    the repository root, stdin on `/dev/null`, stdout and stderr appended to `.night/<date>-run-<n>.log`, never
    `--dangerously-skip-permissions`.
  - The end is decided by one field (z. 2). Before it ends, a night session writes `adrian-rebuild/.night/status.json`
    with the Write tool as `{"reason": "<reason>"}`, the reason one of `done`, `no-ticket`, `failed-twice`, `end-time`
    and `dirty-tree`. The time of the status is the file's modification time, which the kernel sets: no session has a
    clock command (`date` is not on the allow-list), so a time written by the model would be a guess (z. 14). A known
    reason in a file modified after the run started ends the night with exit 0. Otherwise the runner retries after 30,
    then 60, then 120 minutes, at most 3 retries a night, and never starts a run at or after the end; a night that ends
    without a reason exits 3 with a line in the last run's log. A failure of the runner itself exits 4, so that a crash
    never reads as a refusal.
  - The runner runs no git command and writes nothing outside `adrian-rebuild/.night/`, which `.gitignore` excludes.
  - Supplement to the night mode (Adrian): a run resumed after an interruption in the middle of a ticket finds
    uncommitted changes. The session then continues the ticket that `## State` names, from the step where it stopped
    (the gate, the review), and never reverts work silently. When it cannot tell which ticket the changes belong to, it
    writes an entry in `.night/questions.md` and ends with the reason `dirty-tree`. The questions file is
    `adrian-rebuild/.night/questions.md`, as in the prompt; D-011's `adrian-rebuild/questions.md` names the same file.
  - Check: `node --test adrian-rebuild/tools/test-night.mjs` (a fake `claude` and an artificial clock, no real wait).
- 2026-11-18 D-020 (Adrian, night question Q-1): R-001 depends on R-010. The 3,500-line cap of `test/`, which R-010
  removes (T-11), left one line, so R-001's tests could not pass the gate before R-010. It is an exposed dependency,
  like R-067 on R-069 in D-011; no ticket changes its scope. R-010 is done, so R-001 runs as written.
- 2026-11-18 D-021 (Adrian, night question Q-2; changes R-011 and the same-task method of `## Measurement`): one
  same-task attempt is a whole coordinator session, not one worker job.
  - The runner starts the tested Limen's coordinator headless through Pi's RPC mode, sends one fixed owner message
    (Q-2's proposal: "Implement <ticket>; decide engineering questions yourself") and answers every question
    addressed to the owner with the fixed reply "Decide this yourself; I am not available." The attempt ends when the
    coordinator is idle with no running job, or at the time limit; the reference tests and the project gate then run
    on the tip of the newest `done` worker job, and M-05 is counted from the coordinator's session file.
  - (1) Every question addressed to the owner counts as a touchpoint (T-40, z. 37), also when it gets the fixed reply.
    In the "after" version an escalation is the final result `escalated`, which only the owner channel closes (T-05
    (3)).
  - (2) The time limit of an attempt is 1.5 times the candidate ticket's real time from the M1 records, at least 3
    hours, the same for both versions; Adrian gives the time from the records in step B.2.
  - (3) An attempt interrupted by the subscription limit is void and runs again; it does not count as a failure
    (`rebuild-base` has no resume after a limit; that mechanism has its own test, gate 2 §2).
  - (4) The attempt runs in a clean copy of the project without `origin` (at `rebuild-base` jobs hold the GitHub
    credential, A-004). The hidden tests of the merged M1 change stay out of the agents' reach and are laid over only
    after the attempt. The final state is evaluated by: the tests, landed or not, rounds, tokens by class, time, and
    owner touchpoints.
  - Plan changes: R-011 becomes size L with API `pi`, and B.2 starts with its seat check (the headless coordinator
    loads Limen's hooks and receives a wake).
- 2026-11-18 D-022 (Adrian, night question Q-3; taste, added to T-37): the final JSON line gets an optional field
  `ids` with the identifiers of what the command created or changed, and no data (AU-210 stays: the full data come
  from the records). `spawn` ends with `{"class":"ok","code":0,"next":"End your turn; Limen wakes you when the job
  ends.","ids":{"job":"<full id>"}}`; the token of AU-211 is the last 8 characters of the id, with no field of its
  own. Every command declares its `ids` keys in the registry (T-19): `job`, `ticket` (FNNN), `question` (Q-NNN). The
  poller and the other processes that call the CLI read `ids` only through the client function (AU-217); an id is not
  part of `next` or of a text line as a contract (z. 2). The text for people gives the label and the token. Check: a
  test of the client function that returns `ids.job` after `spawn`; a test that every command returns only the `ids`
  keys its registry entry declares, with values in the format of a job id, FNNN or Q-NNN; a golden test of `spawn`'s
  final line. R-013 builds the field with the final line; the declaration of the keys is part of the registry (R-014,
  T-19).
- 2026-11-18 D-023 (Adrian): R-008 leaves the LaunchAgent installer (`limen sweep --install`, `--uninstall`) to
  R-032, which replaces it with the systemd installer, as the night run proposed (R-008 → `ticket.md` →
  `## Decisions`).
- 2026-11-18 D-024 (Adrian; amends D-019): the main session may start the night runner when Adrian asks for it in the
  conversation, never on its own. Before the start it shows the runner's tests, the reviewer's verdict, the pushed SHA
  and a clean tree, and checks that a new `claude -p` session lists both subagent definitions. It runs `mkdir -p
  adrian-rebuild/.night` and `nohup node adrian-rebuild/tools/night.mjs --until HH:MM` with stdout and stderr to
  `adrian-rebuild/.night/launcher.log`, in the background; from then on it changes nothing in the repository until
  Adrian writes, and on "sprawdź" it only reads the runner's processes, logs and `status.json`. First used on
  2026-11-17 at 22:09.
- 2026-11-18 D-025 (Adrian, night question Q-4; the shape of acceptance criteria): a criterion checks only the
  ticket's scope; a global property is closed by the ticket that makes it true. R-001's AC-6 becomes `git grep -q
  '"templates/agents.md"' -- <the paths of R-001's ## Change>` → exit 1 (no match); the full check `git grep -q
  '"templates/agents.md"' -- src hook` → exit 1 joins R-040's criteria, because R-040 removes
  `hook/communication.ts:307`. The expected result is an exit code, with no `!` before the command (the rules of the
  allow-list, D-016). Rejected: excluding a file (it would hide a new reference) and expecting a given line (it moves
  with an edit). Every criterion of stage 1 is checked the same way: a global grep or scan that only a subsequent ticket
  makes true moves to that ticket (`## Tickets` → notes; the R-013 scan of D-028 is closed by R-013's dependency on
  the cuts). Check: `check.mjs` rejects a criterion whose command starts with `!`; when the main session writes
  `ticket.md` (protocol step 2), it runs every grep and scan criterion at HEAD and confines it to the paths of
  `## Change` unless every match it finds is one the ticket removes.
- 2026-11-18 D-026 (Adrian, night question Q-5; changes the night mode and `## Agents`): in a night run subagents run
  only in the foreground.
  - (1) `night.mjs` sets `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` in the environment of `claude -p` (per the Claude
    Code docs, Claude then waits for every subagent; it also disables background commands, which a night run should
    not have). The variable is not in `.claude/settings.local.json`, so that by day background work runs as before.
  - (2) No resumption through `SendMessage` at night (a resumed subagent works in the background): a fix round is a
    fresh foreground `rebuild-implementer` with the paths of `ticket.md` and `review.md` (z. 19); by day `SendMessage`
    stays.
  - (3) No command stands in for waiting. When waiting is impossible, the session updates `## State` and ends with the
    reason `cannot-wait` in `status.json` (Adrian, a follow-up of the same day), which `night.mjs` accepts as a known
    reason.
  - (4) The morning summary gives the main session's tool calls per ticket. `night.mjs` counts them (Adrian, a
    follow-up of the same day): a run uses `--output-format stream-json --verbose`, and after the run the runner
    appends to its log one line per commit with the number of the main session's tool calls (events without a parent
    tool call) since the previous commit, and the commit's subject; calls after the last commit form one more line.
    The day session copies the lines into `## State`. The stream's format is the one of the Claude Code docs; the
    first night run with it confirms it.
  - Check: `tools/test-night.mjs` asserts that the environment of `claude -p` holds
    `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`, that `.claude/settings.local.json` and `.claude/settings.json` do not,
    that `cannot-wait` ends the night with exit 0, and the count per commit on a fake stream.
- 2026-11-18 D-027 (Adrian, night question Q-6): the four round-3 notes of R-011's review get a fix ticket before B.2:
  R-088, stage 1, size S, by day: `pair`, so it runs in a day session and never in a night run; its `Run` is
  `day-after` because it depends on R-011, a `night` ticket of stage 1 that is done.
- 2026-11-18 D-028 (Adrian, night question Q-7; changes R-013 and adds to T-02): only the shared wrapper sets the exit
  code and prints the final line; a command returns its result or throws an error with its type and class (T-01, T-03,
  AU-209). `process.exitCode` and `process.exit` appear only in the wrapper and in the entry point `bin/limen` (a
  scan).
  - Classes: `ticket check` and `picture build --strict` with problems found are a refusal (1) with the list in the
    text and the fix in `next`; `github poll` by its cause (the network 3; a missing configuration or credential 4);
    `webhook test` is cut by R-002 before R-013, so R-013 leaves it alone.
  - `group wait`: in R-013 its time limit rejects the operation with a typed error through the wrapper, with no
    `process.exit` from a timer; the command itself is cut by the registry ticket (R-014; T-19 names `group start`,
    `status`, `stop` and `land`, and `wait` is rejected).
  - `ids.job` also for `github review` and `github work` (the rule of D-022). `docs/jobs.md:96` and
    `docs/seat/agent-setup.md:254` change in R-013 when they describe the output contract it changes.
  - Order (Adrian, a follow-up of the same day): R-013 depends on every cut of stage 1 (R-002–R-007, R-009), so it
    reworks no code that a cut removes (`webhook test` and `bin/tony-finish-ping.sh` in R-002, `picture tick` with
    `src/project/picture-tick.ts:134` in R-007, the hosted tests in R-005), and its `process.exit` scan holds over
    `src`, `hook` and `bin` at its own commit (D-025).
  - Check: the scan for `process.exitCode` and `process.exit` outside the wrapper and `bin/limen`; a refusal test for
    each reworked command (the code, the class and `next` in the final line); a test that `group wait`'s time limit
    gives exactly one final line with its code.
- 2026-11-18 D-029 (Adrian, after R-001's gate runs; adds A-087 and changes `## Agents`):
  - A-087 (`audit.md`): seat registrations vanish when processes take over an abandoned registry lock together; high,
    decision fix. The fix belongs to the ticket of the shared lock module (A-018), R-019, which is still open: the
    takeover renames the dead lock to a unique name (exactly one process wins), then creates the new lock with `wx`;
    the registry is a read, change and write under the lock through `atomicWrite` (A-022). A deterministic test uses
    an injection point in the lock module between "found dead" and "taken over", forces the interleaving of two
    processes and fails before the fix every time; `test/s9-housekeeping.test.ts:135` stays.
  - A test that failed even once without a change of the code it runs is a finding; nobody runs it again to get a
    green gate (z. 17). By day the main session asks Adrian; at night it writes a question in `.night/questions.md`
    and the ticket waits (`## Agents`, protocol step 4). The same rule goes into the definition of
    `rebuild-implementer`; the rebuild sessions cannot write `.claude/**`, so Adrian adds it there.
  - Check: the interleaving test (fails before, passes after); a registry test with 41 concurrent registrations and a
    dead lock owner → 41 entries; `check.mjs`: A-087 has every field and a ticket.
- 2026-11-18 D-030 (Adrian; how the day session talks to him, amends the rebuild prompt's use of `AskUserQuestion`):
  (1) a message that needs Adrian's action carries everything the action needs (the exact text, the file and the place
  in it, the command), never a pointer to an earlier message; (2) a decision is asked in a plain message (one matter,
  the options, the recommendation with its reason, what counts as a full answer), never through `AskUserQuestion`.
  Night runs keep their questions in `.night/questions.md`. Check: none.
- 2026-11-18 D-031 (Adrian; an exception to D-029 until R-019): when the gate fails only on the lock-contention test
  of A-087 (`test/s9-housekeeping.test.ts:135`), the main session records the failure in the ticket's `outcome.md` as
  an occurrence of A-087 (the gate's output line and the count it reports) and runs the gate once more; any other
  failure, or a second failure of that test in the same ticket, follows D-029. The failure already has a finding, a
  decision and a ticket, so the run hides nothing, and the records give R-019 the rate. R-019's commit removes the
  exception from `## Agents`. Check: none (the outcome records each occurrence).
- 2026-11-18 D-032 (Adrian): editor swap files (`.*.swp`) are ignored by `.gitignore`, so an open editor in
  `adrian-rebuild/` no longer fails `check.mjs` (which reads untracked files with `--exclude-standard`) or the review
  guard. Added in R-002's commit. Check: none.
- 2026-11-18 D-033 (Adrian; the handover of a day session): at a safe point (a ticket committed and pushed, no
  subagent running, a clean tree, `## State` current) and with the context window 30–50 % used, the day session hands
  over to a new interactive session in remote-control mode started with the first message of the rebuild prompt, and
  ends; 50 % is a hard limit, at which it hands over even mid-ticket (after a running subagent returns, with the
  active ticket and its step in `## State`). The new session's first act is a push notification to Adrian that it
  takes over. Facts behind it (the Claude Code docs, 2026-11-18): the model cannot read its context share by itself,
  so Adrian's status line script writes it to a file outside the repository that the session reads; a remote-control
  session needs a terminal, so it is started in `tmux`; a push reaches the phone only with Remote Control connected
  and "Push when Claude decides" on; the old session ends through EndConversation only when Adrian confirms at that
  moment, otherwise he closes it. Check: none.
- 2026-11-18 D-034 (Adrian, R-007's `BLOCKED`; adds A-088 and widens R-007): `test/s6-keeper.test.ts` ("keeper
  refuses a running job, then starts on a new branch at the candidate tip") failed once in R-007's implementer run
  before any source change; read from the code, `waitJob` (`test/plant.ts`, rewritten in R-006) returns at a terminal
  `state` while the wrapper still holds `pid` and `born`, and the keeper refuses a job whose owner is alive. A-088
  (`audit.md`), medium, decision fix in R-007, as an explicit addition to its scope (the main session's option c,
  recommended over a ticket of its own first, which would need R-007's tests set aside, and over the D-031 allowance):
  `waitJob` waits, with a bound, for a terminal `state` and for `pid` and `born` to be gone. Check: a test of the
  helper that fails before the fix every time; R-007's gate.
  - Corrected the same day (Adrian's second answer, option 1): the failure was not the race. The implementer had
    run the test outside the gate's environment, where the laptop's git 2.34.1 lacks `git worktree list --porcelain
    -z` and only the gate's shim supplies it (D-001); it fails so every time outside the gate, at `a5767dd` too, so
    D-029 did not apply. The window itself is in the code (`finalizeJob` writes `state` before it removes `pid`), so
    A-088 stays, low, with the evidence from the code, and `waitJob` waits for a terminal `state` and for `pid` alone
    to be gone: `recordBorn` reads `state` and then writes `born`, so a wait for `born` could hang until its bound.
    The lesson for the protocol: a test run outside `gate.mjs` on this laptop is not evidence of a failure.
- 2026-11-18 D-035 (Adrian, R-007; changes `## Agents`, step 3): `compare --git` voided R-007's implementer run
  because the main session had changed three reserved paths (`plan.md`, `audit.md`, R-007's `ticket.md`) while the
  implementer stood at `BLOCKED`, after the snapshot; HEAD, the refs, the index, git's config and hooks were
  unchanged, and the diffs of the two tracked files hold only the main session's entries. Adrian accepted the run.
  Rule: when the main session changes a reserved path while the implementer waits on `BLOCKED`, it takes a new
  `snapshot --git` before it resumes the implementer, so `compare --git` sees only the implementer's changes.
  Check: none (protocol).
- 2026-11-19 D-036 (Adrian, night question Q-8; changes `## Agents`, step 2): `node seat/deploy.ts <args>` stays off
  the allow-list. The script runs only as root on the seat, and a run with a real SHA would check out a commit in the
  laptop's own repository; on the laptop it is checked through `node --test` on fixtures, which is on the list. A
  ticket's criterion names only commands on the list of `## Commands`; the main session checks that when it writes
  `## Acceptance`. R-012's AC-6 stays judged by its test 11, which runs exactly that command (R-017, R-032 and R-056
  check their additions to the script the same way). Check: none (protocol).
- 2026-11-19 D-037 (Adrian, R-014 Q1; changes R-014's mode): R-014 is split by its nature. Its taste part (the golden
  help texts, the names, the parser's messages) is settled in `pair` and written into its `ticket.md`; the
  implementation, which is checkable by commands once those texts are fixed, is done by `rebuild-implementer` and
  reviewed as usual. The row keeps `pair` and `day-after`, because the ticket runs by day with Adrian. Check: none
  (protocol).
- 2026-11-19 D-038 (Adrian, R-014 Q2; taste, T-18 conflict (3)): `limen status --all` prints today's summary without
  the 7-day window and, under it, one row per job (the rows of today's `limen jobs`). Old forms exit with code 2:
  `limen jobs <ref>` names `limen show <ref>` in `next`, every other form of `limen jobs` names `limen status --all`.
  Check: R-014's migration tests.
- 2026-11-19 D-039 (Adrian, R-014 Q3; amends the accepted plan): a command that a subsequent ticket moves or cuts (`close`
  R-037, `keeper` R-066, `sweep` and `prune` R-032, `rule` R-034) stays under today's name in the help group of what it
  acts on now, with a line that can be copied and run. Its registry entry carries `movedBy: "R-0NN"`, which the help
  does not show. R-014's tests: a top-level command acts on `job`, `owner` or `project` unless its entry has `movedBy`,
  and the entries with `movedBy` are exactly those of this list (so `rule` is covered whichever group shows it). Each
  of R-032, R-034, R-037 and R-066 gets the criterion "the registry holds no entry with `movedBy` naming this ticket"
  (`## Tickets` → notes). The last of them, R-066 (it depends on the other three through R-065), removes the field
  and the exception, and the test becomes the plain rule: a top-level command acts only on `job`, `owner` or
  `project`. Check: R-014's registry tests; the four criteria.
- 2026-11-19 D-040 (Adrian, R-014 Q4; taste, until R-044): until module switches exist, the help's modules header says
  only what is true now: "Modules", with no state marker. R-044 gets the criterion: the modules header has the text of
  T-19 and each module line's `[on]` or `[off]` is built from that module's switch (`## Tickets` → notes). Check:
  R-014's golden help; R-044's criterion.
- 2026-11-19 D-041 (Adrian, R-014 Q5; taste, the texts of the help): variant A with corrections. (1) The help line
  about the final JSON line is built from the key list of `src/outcome.ts` that the wrapper uses, so it names `ids`.
  (2) The example of `limen land --help` is `limen land a1b2c3d4` (a suffix today, the token of AU-211 after R-022);
  every example in the registry goes through the real parser in a test. (3) R-014's `## Acceptance` has the judgment
  "every help line describes behaviour present in this commit". (4) A parser error carries the command's usage line
  from the registry in its message, and `next` stays `limen <command> --help`. (5) `--help` works for internal
  commands too; the internal section of `docs/commands.md` is generated from the registry, with the staleness test of
  A-084. (6) The kind is not shown by `limen <command> --help` until read commands write nothing (T-04, R-032):
  "(change)" was not named, and "read" would be false while `status` reaps. (7) The Jobs header does not say every
  command takes an id (`--running`, `--all`); the general line and `limen <command> --help` come from the same schema,
  so they show the same flags; `--drop-leftovers` is described by its files. The advice to the coordinator at the end
  of today's help goes (the `spawn` line says the same). Check: R-014's golden tests and its judgment.
- 2026-11-19 D-042 (Adrian, R-014's question on `group wait`; amends D-028 and D-039): `group wait` stays, as an
  internal command for team members with a worker allowance, because a member is itself a job, whose job ends with its
  turn, so it keeps its turn open with `group wait` while its workers run (`templates/group-member.md:5`,
  `docs/groups.md:69`); cutting it would break groups with `--workers N`. Its entry carries `movedBy: "R-077"`. It
  refuses a caller outside a team (the lead, with the group id) with a typed refusal and a message; this is a guard
  against mistakes, keyed on the job's environment, not a security boundary, and the code and `docs/groups.md` say so
  (A-029). R-077's criteria do not check only the removal: the cause stays after R-077, so they also check that a team
  member with a worker allowance gets its workers' results without `group wait` (`## Tickets` → notes). Consequence for
  D-039 (the main session's resolution, for Adrian to confirm): R-077 does not depend on R-066, so R-066 cannot be the
  last ticket with a `movedBy` entry; instead R-014's test fails once no entry has `movedBy` any more, with the message
  to remove the field and the exception, so whichever ticket removes the last entry also removes the field (Adrian
  confirmed this resolution on 2026-11-19). Check: R-014's registry and group tests; R-077's criteria.
- 2026-11-19 D-043 (Adrian, R-014's `BLOCKED` on two golden lines; changes R-014's golden text and `spawn`): (1)
  `spawn` requires `--engine`, `--provider`, `--model` and `--thinking`; a spawn without one of them exits 2, and the
  refusal names every missing flag. The basis is A-030 (a missing field refuses, and the fallback model is cut) and
  the author's intent #2 of gate 2 §5 ("never swap a model"), with Adrian's agreement. Today the engine falls back to
  `LIMEN_ENGINE` or `pi` (`src/runtime/engine.ts:48-54`) and the model to `defaultModel` (`src/commands/spawn.ts:169`);
  whether the coordinator on the seat passes all four is unknown, because its manual sits in the system prompt that
  does not reach the model under the bridge (A-086). `continue` keeps `model ?? defaultModel` until R-062. (2) The
  line of `ticket done` shows its flag: `limen ticket done <FNNN> … [--on <date>]`. Adrian accepts the implementer's
  technical choices listed in `R-014-command-registry/ticket.md` → `## Decisions`. Check: R-014's parser and help tests.
- 2026-11-19 D-044 (Adrian, R-014's review round 3; an exception to `## Agents`, step 6, for R-014 only): a third
  round of fixes for round 3's notes 2–5. Review round 4 checks only those notes and the absence of regressions; a new
  non-blocking note means the commit, and the note goes to the ticket that option (b) named (the refusal wording to
  gate 5.1, the docs to R-081, the scan of words outside the parser to R-023, the help to R-085); a new blocking note
  goes to Adrian; there is no fifth round. The fix of note 5 has a test that fails before it (the static scan stays
  in R-023). Note 1: the shared parser's strict rule stays (a value flag given twice exits 2), `continue --label`
  included, which closes note 2 without a "last wins" exception; `outcome.md` records it as a departure from Change 2.
  Check: R-014's parser and old-name tests.
- 2026-11-19 D-045 (Adrian, gate 5.1; amends D-022 and D-028): (1) Go on to stage 2, with no `a0.1.1`. (2) Every
  stderr line of a refusal stays as it is. A refusal with no successor has `"next": null` in its final line, and its
  sentence stays on stderr; the type of R-013 admits `null`, and the help line that shows the final line's shape
  follows the type. The `jobs` defect (R-014 review round 4, note 1) goes to R-023 by D-044, with the criterion "a
  flag present names `limen status --all`; only `limen jobs <ref>` names `limen show <ref>`" and one more: every
  non-empty `next` of a refusal passes the shared parser and is not itself a usage error. Adrian's "six refusals with
  no successor" took the main session's count, which was wrong: 16 of the 20 refusal lines carry a sentence or a
  placeholder in `next`, so which of them get `null` is open (asked in the gate reply of 2026-11-19). (3) R-011's
  choices are accepted with two additions, unless already done: (3.2) an RPC message outside the declared subset ends
  the attempt with an error and records the raw message instead of passing it on; (3.4) the attempt's report states
  the definition ("touchpoints = answered owner turns; questions asked while a job runs are not counted") and keeps
  the coordinator session's transcript. At `ed7f06e` 3.2 is not done (`adrian-rebuild/tools/pi-rpc.mjs` passes every
  other object on); of 3.4 the transcript is kept (Pi's session file in `<out>/session/`) and the definition is not
  stated. (4) R-012's choices are accepted with one condition, unless already true: zero registries found, or a home
  whose registry cannot be read, refuses instead of assuming that nothing runs, and the script prints the registries
  and projects it checked. At `ed7f06e` both refusals hold (exit 4, `seat/deploy.ts` → `registeredRoots`,
  `optionalText`); the listing does not. (5) R-013's codes, changed: (5.1) `next` is the command alone with concrete
  values (the branch, the group id), never a placeholder, and the prose ("fix the … listed above") goes to the stderr
  line; every non-empty `next` passes the parser. (5.2) `GITHUB_NETWORK`: `next` is the same command, because `limen
  github doctor` checks only local settings, which are fine on a 429 or a 5xx; the limit's reset time, when GitHub
  gives one, goes to stderr. (5.3) `group wait`'s time limit stays exit 0, an explicit `--timeout` included, and `next`
  is `limen group wait` in the form it was called: it is a team member's normal loop, kept until R-077 (amends D-028).
  (5.4) `UNTYPED` is class `refused`, exit 1, as today; `code` on success is `null` instead of `0` (amends D-022), so
  that the field has one type. (6) R-014's `kind`, changed: (6.1) `rule` is `change`, since its entry covers `set` and
  `end`, which write; (6.2) `status` and `show` are `change` while they reap dead jobs, and R-032 makes them `read`;
  (6.3) a test: every `read` command run on a test project leaves the project's files and `.limen/` unchanged, and
  after R-032 it passes for `status` and `show`. Open: the `null` list of (2) and the tickets that carry (2)–(6)
  (asked in the gate reply of 2026-11-19; settled by D-046). Check: the criteria of those tickets.
- 2026-11-19 D-046 (Adrian, the two open points of D-045; amends D-022 and D-045 (1)): (1) The `null` list, variant
  (a) of the gate reply: a refusal's `next` is a Limen command only when its successor is a fixed command or is built
  from identifiers of the call (a job, a branch, a group id); otherwise it is `null`, and the sentence stays on
  stderr. So `picture tick` names `limen picture build`, `picture watch` names `limen status`, `group status --json`
  names `limen group status` (with the group id when one was given), `queue` names `limen seat queue`, `jobs`
  follows D-045 (2) in R-023, and every other refusal of `src/old-names.ts` has `null`. (2) Every `next: ""` becomes
  `null`: a success with no next step, `UNTYPED`, `INTERNAL`. (3) The sentence of a successful `spawn` (D-022: "End
  your turn; Limen wakes you when the job ends.") moves to the text line before the final line, with `next: null`; its
  wording stays. So `next` is always a Limen command or `null`, and the parser test covers every `next`, not only
  those of failures. (4) The placement, with changes. R-089 (stage 2) carries D-045 (2) and (5) and items (1)–(3)
  here; R-023 the `jobs` defect and its criteria (D-045 (2)); R-025 D-045 (6.1)–(6.3); R-032 the criterion that
  `status` and `show` are `read` and pass the test of D-045 (6.3). R-090 and R-091 are fix tickets of stage 1
  (amends D-045 (1)), so the first deployment is the tag `a0.1.1` on their last commit, not `a0.1.0`. R-090 carries
  D-045 (4), and a registry that holds no project refuses too: that is the gap of §7 D3, and the condition is one
  line. R-091 carries D-045 (3): each event type of Pi 1.5.1's list (from the package sources of `## Commands`, stage
  2 row) is marked in the code as handled or skipped; a type on which Pi waits for an answer (such as an extension's
  request for one) is never skipped; a type with no mark ends the attempt with an error that records the raw event.
  B.2 runs with R-091's runner, and the deployment of `a0.1.1` waits for B.2 and R-090. (5) Confirmed for R-089:
  `group wait` past its limit, an explicit `--timeout` included, exits 0 with class `ok`, `code` `null` and `next`
  the `limen group wait` call as it was made, so the code `GROUP_WAIT_TIMEOUT` leaves the final line and the text line
  says that the limit passed; the code `TICKET_CHECK_FAILED` is already spelled so (`src/commands/ticket.ts:133`), and
  nothing changes there. Check: the criteria of R-089, R-090, R-091, R-023, R-025 and R-032.
- 2026-11-19 D-047 (Adrian, the handover; amends D-033): the handover closes the previous session by a tool, not by
  prose or by hand. `node adrian-rebuild/tools/handover.mjs start <n>` starts `limen-rebuild-<n>` in `tmux` with the
  first message of the rebuild prompt (`FIRST_MESSAGE` of `night.mjs`), without the variables Claude Code sets for
  its Bash tool, and checks that it still exists after 2 s; `node adrian-rebuild/tools/handover.mjs close-previous`,
  the new session's first command after its push notification, closes every older rebuild session: each `tmux`
  session `limen-rebuild-<digits>` in the repository whose panes all started before the caller's own session and
  none of which runs the caller, and each `claude` process in the repository that started before the caller's own
  session and is not its ancestor, so a process the session started, being younger, is kept (SIGTERM; a process
  alive 5 s after the signal is named, exit 1). Both refuse unless the branch is `adrian-rebuild`, the tree is
  clean and `HEAD` is `origin/adrian-rebuild`. The old session no longer ends itself: `EndConversation` ended `limen-rebuild-6`'s
  conversation but not its process, and a conversation resumed with `claude -r` while its first process lived ran in
  two processes (both on 2026-11-19). Any older `claude` in the repository counts as a previous session. Adrian put
  `Bash(node adrian-rebuild/tools/handover.mjs *)` on the allow-list. Spec, review and outcome:
  `evidence/handover/`. Check: `node --test adrian-rebuild/tools/test-handover.mjs`.
- 2026-11-19 D-048 (Adrian, after the close of a0.1.1): B.2 runs at once, on the evening of 2026-11-19, guided step
  by step by the main session, instead of a night run of stage 2, because the deployment of `a0.1.1` waits for B.2
  (D-046) and B.2 must not share the Max window with a rebuild run (a void attempt at a limit runs again, D-021 (3)).
  Stage 2 starts by day on 2026-11-20 in `limen-rebuild-9`. Check: `## State` → B.2.
- 2026-11-19 D-049 (Adrian, B.2's count; keeps D-021): an attempt with no job has no candidate, and an attempt with no
  candidate does not pass. In the rebuilt Limen a coordinator's own commit of code is not covered by the publication
  rule (A-006) and skips the Checks and the review (A-012, A-013, A-070), so inline work is no delivery. (1) The
  coordinator's own branch is evaluated as a diagnostic beside pass^k, not in it: `evaluate` takes its candidate only
  from `result.json` and its `evaluation.json` would enter the report, so the main session's procedure repeats its
  steps by hand in a separate clone (the hidden tests over the tip, `npm ci --silent`, `npm run verify`). (2) B.2's
  report states that at `rebuild-base` the coordinator does not delegate under the fixed input (A-086) and gives the
  number of void attempts. (3) The owner message stays as D-021 has it; C (a message that asks for delegation) is
  rejected, because it would move a rule of Limen into the test's input and hide the gap the rebuild closes. (4) The
  void attempt runs again, then B.2 closes and the deployment follows the plan. Check: `## State` → B.2.
- 2026-11-20 D-050 (Adrian, B.2's shortfall): B.2 closes with K = 2. Its report gives the missing third attempt, the
  two void attempts with their cause, and that the coordinator under the fixed input usually does not delegate
  (A-086); the diagnostic of the coordinators' branches says that the hidden tests failed at `tsc` on names of the
  reference, so the behaviour is not verified. Before 4.8 the main session proposes together a name-independent
  evaluator and a way to keep the attempts out of the production checkout. Every change of the task after B.2 leaves
  B.2's result unchanged (z. 40): a new evaluator does, because B.2 has no candidate; a change of the input, such as
  the project's notes, needs its own justification. At the start of the deployment the main session confirms the full
  snapshot of `.limen/` (gate 2 §9 item 15, step 0.1), that no job runs (§7 D3) and that the deployed commit holds
  R-090. Check: `evidence/b2-same-task.md`.
- 2026-11-20 D-051 (Adrian, at step 1.0; brings part of 5.6 forward): the coordinators use the deployed Limen from
  `a0.1.1` on. The agents' account's `limen` on `PATH` is a link of that account, which pointed at the extra checkout
  in its home (gate 2 §9 item 6), so `/opt/limen` reached no coordinator; the project stub, with `LIMEN_PACKAGE`
  unset, loads the hooks of the package that `limen` resolves to. The link now points at `/opt/limen/bin/limen`; the
  extra checkout stays untouched as the rollback (the link back to it) until 5.5 removes it, and 5.6 still makes the
  link and `node` root-owned. B.2's attempts had also registered their clones in the seat's project registry (the
  wake hook registers the root of every coordinator session, `hook/wake.ts:906` at `rebuild-base`); the six lines are
  removed by hand at 1.0, and the "after" runs give each attempt its own `LIMEN_HOME` (part of D-050's isolation
  proposal). Check: `readlink -f` of the link, and `limen --help` ends with the final line of R-013.
- 2026-11-20 D-052 (Adrian, R-015's three questions, answered "1. A", "3. A" and with the seat output of 2; amends
  the R-015 note of `## Tickets`): (1) Besides `LIMEN_WORKER_MODEL` (until R-062; `LIMEN_REVIEWER_MODEL` of the note
  has no read site), the environment stays readable for `LIMEN_COORDINATOR` (until R-050), the six `LIMEN_GITHUB_*`
  names of the poller (until R-059) and `LIMEN_PACKAGE` (until R-049); each is an exception with its end ticket in
  the registry of `src/config.ts`, and `limen status` names it. (2) The seat's agents' account sets no `LIMEN_*` name in
  `~/.bashrc` or `~/.profile`, and a login shell holds none; the Herdr pane's environment is left to step 2.4.
  (3) `prepare`, `toolStall` and the new `toolCalls` come from `limits.json` only, the start gate from the seat's
  `start-gate.json` only; `LIMEN_PREPARE`, `LIMEN_PREFLIGHT`, `LIMEN_VIEW`, `LIMEN_WAKE` and `LIMEN_PI` are no longer
  read; the three waits with no setter become constants; `LIMEN_HOME` and the six other knobs of the tests are test
  knobs. Check: R-015's criteria (`R-015-one-config-reader/ticket.md`).
- 2026-11-20 D-053 (Adrian, before three days away, 2026-11-21 to 2026-11-23, with only his phone: no terminal and no
  seat access; work goes on by day through Remote Control and push notifications and by night through `night.mjs`):
  (1) His weekly limit resets on Mondays at 17:00, and he has one free reset of the limits: by day the session reads
  `seven_day_used_percentage` at every safe point and before it starts a subagent, and at 98 % or more it sends the
  push "Hej, mamy 98% limitu tygodniowego, zresetuj licznik" and keeps working; there is no other stop threshold by
  day or by night (a night run cannot read its use; the morning session reports a night that hit the limit); item (1)
  removed on 2026-11-21 by D-064. (2) A
  cheaper review (amends `## Agents` step 6): a round whose verdict is PASS and whose findings to fix touch only
  `docs/`, `outcome.md` or `review.md` is closed by the main session's own fixes, with no further review round; a fix
  of code or tests still gets a round. (3) A rehearsal of the night mode on the night of 2026-11-20: he asks for it from
  his phone, and the main session starts `night.mjs` by D-024. (4) Before he leaves: Windows Update paused, sleep
  "Never" on mains power, the lid action "Do nothing", power and network kept (an automatic Windows update shut the
  laptop down in the night of 2026-11-19, which restarted WSL at 06:14 on 2026-11-20). The seat steps, edits of
  `.claude/settings.local.json` and `.claude/agents/*`, and a void review that leaves a file the reviewer created wait
  for his return. Check: the memory note on the weekly limit; `review.md` of each ticket.
- 2026-11-20 D-054 (Adrian, three proposals of the main session against night blocks and slow pair tickets, each
  accepted as recommended; amends the night mode of the rebuild prompt and `## Agents`): (1) **`ready`**: a status of
  `## Tickets` that the day session sets once a ticket can run at night without Adrian: a ticket whose dependencies
  are `done` has its full `ticket.md`, its criteria run at HEAD (D-025) and naming only commands of the allow-list
  (D-036); a ticket whose dependencies are not yet `done` has every decision it needs recorded (in `plan.md` →
  `## Decisions` or its `ticket.md` → `## Decisions`), and the night writes its `ticket.md` at the HEAD it starts from.
  A night run takes only `ready` tickets. The day session makes tickets of at least two independent branches of the
  dependency graph `ready`, so that one block does not end the night. `check.mjs` accepts `ready`, requires for it a
  `ticket.md` or a recorded decision entry, and checks that every criterion command matches the allow-list of
  `.claude/settings.local.json` when that file exists (a change of `adrian-rebuild/tools/`, with its test and a review
  by `rebuild-reviewer`, outside the ticket list, as D-047 was). (2) **Night defaults, category A**: in a night run the
  session decides a question of category A itself, with its own recommendation, records it in `ticket.md` →
  `## Decisions` as "night default, for Adrian to confirm in the morning", and goes on; category A is (a) a criterion
  of the ticket that contradicts its own `## Change` or D-025, which is narrowed to the ticket's scope, and (b) a
  technical choice inside `## Change` that `taste.md` does not settle (an internal name, the place of a test by
  T-29). Every other question (taste, a departure from the plan, an irreversible step, security, an on-disk format
  beyond the ticket, a refused permission, the same step failed twice) stays a question in `.night/questions.md`.
  The morning session lists the night defaults for Adrian; a wrong one is fixed by the next ticket. (3) **Pair
  tickets by a variants sheet**: once the tickets a pair ticket depends on are `done`, the main session sends Adrian
  every choice of the ticket (texts, names, UX) in two variants on the real fragment, with its recommendation, as one
  numbered message with a push; his answers ("1a 2b …" or his own text) go to `ticket.md` → `## Decisions`; the
  ticket keeps the mode `pair` and its `Run` becomes `night`, and `rebuild-implementer` implements it, as D-037 did for
  R-014. Check: `check.mjs` once (1) is built; the night defaults in each `ticket.md`.
- 2026-11-20 D-055 (Adrian, R-017's two questions, answered "1c 2a" as recommended; amends D-008 (6) and T-32 (2)):
  (1) The Pi type contract of R-017 runs only in the repository, as a test inside `node --test` on the copy of the
  Pi packages in `adrian-rebuild/input/vendor/` (the same npm tarballs the seat installs, checked by their integrity
  hashes), and again in every ticket that updates Pi or the bridge; `seat/deploy.ts` does not run it, because the seat
  has no `tsc` and root would need the network for one. Until R-049 refuses another Pi version, Pi on the seat is not
  updated without a ticket. (2) A Pi event of the wrong shape: R-017's type guards throw a typed `BAD_DATA` error
  (`src/boundary.ts`) that names the event and the field, which Pi reports as an extension error; the job's failure
  with kind `engine-error` and the warning in the coordinator's `limen status` (T-32 (4)) are R-029's, which gets T-32
  and D-055 as sources. Check: R-017's and R-029's criteria; `## Deployment` 2.2.
- 2026-11-20 D-056 (Adrian, R-019's question 3, answered "as recommended" with consent to the technical defaults):
  (1) R-019 depends on R-020 as well as R-018: the lock's owner identity (pid, process start time, boot id) comes from
  the platform adapter `src/platform/`, because R-020's AC-4 bans `/proc/` paths outside it; R-019 adds the boot-id
  reading to the adapter. (2) A lock is waited for at most 60 s; then a typed error names the lock file, its owner and
  a hint. (3) An old owner file that holds only a pid is abandoned only when that pid is gone. (4) The `TimeoutStartSec`
  of the systemd units goes to R-032. Check: R-019's criteria; R-020's AC-4 at R-019's HEAD.
- 2026-11-20 D-057 (Adrian, R-021's seven questions, answered "all as recommended, and consent to 7"; refines S1+ and
  T-20 (6) for R-021): (1) The migration is a registry command, `limen migrate [--dry-run]` (T-19), of kind `change`
  and marked irreversible (T-28 (3)), run from the project's root on the agents' account (never from
  `seat/deploy.ts`, which runs as root, D-008); a second run has nothing to do and exits 0 (T-02). (2) A folder with no
  valid `state` (ORPHAN, or a value `parseJob` does not know) is moved unchanged to `.limen/unmigrated/<id>/` and
  listed in the report with its reason (z. 29); a folder with a state but no `task.md` or `log` migrates, and the
  report notes the missing content; old `engine` values stay as they are. (3) The migration removes the one-value files
  it moved into `record.json` and the files of removed features that nothing reads, listing them in the report; the
  content files (`task.md`, `log`, `result`, `note.md`, `note.first.md`, `start-notice`, `session/`) and the
  directories `notify/`, `steer/` and `recovery/` stay; the rollback is the snapshot of `## Deployment` 0.1;
  `docs/jobs.md` names `limen show` instead of a hand edit. (4) The migration fills in only the failure kind, in A-016's
  vocabulary, from today's patterns (`stop-reason`, the last `failed:` log line), with the original text as the detail
  and the reset time `null`; everything else it cannot establish is `null`, never guessed (z. 10); transitions come
  only from `started-at` and `finished-at`. A migrated record carries a `migrated` marker with its date and is history
  only: `status`, `show` and `stats` read it, and resume (R-034), owed wakes and the bell skip it. `landed` and the
  archiving of old records are R-031's, in its own migration (A-002: never from the git graph). (5) No mirror `state`
  file: R-021 moves every reader to `record.json` through the record module (T-25): `docs/seat/bell.sh`, the GitHub
  poller, `seat/deploy.ts`, the group mirrors, `templates/agents.md:205` (to `limen show <id>`) and `docs/jobs.md`; a
  scan finds no read of `state` or another old job file. (6) On a project that is not migrated, every command that
  reads jobs refuses with exit code 4 and `next` `limen migrate --dry-run`; the hooks do nothing there and report the
  reason once. (7) Technical defaults: (7.1) `activity`, `last-tool` and `tool-calls` go into a separate
  `progress.json`, outside the transition function, which the coordinator's watcher ignores; (7.2) the delivery
  receipts of `notify/`, `steer/` and `recovery/` stay directories with their `wx` protocols (A-058), and the owed-wake
  list of S1+ and A-016 (2) is a field R-034 adds; (7.3) one writer: the per-job lock of R-019 (D-056),
  compare-and-swap (A-019), `wx` at the terminal transition (S1+), and side failures in `sideFailures` written with
  the terminal state (T-01); `stop`, `watch`, the group's reserved slot, the finish hook and the reaper move onto it;
  (7.4) the facts written once at publication (`label`, `branch`, `worktree`, `base`, `role`, `repo`, the origin
  fields, `group`, `team`, `parent`, `spawner`, `candidate`, `priority`) and a new job's route (the four flags of
  D-043) are record fields; the unread `deadline` and `tip` go; (7.5) a missing process identity means "unknown",
  never "alive" (A-056), with the boot id from the platform adapter (D-056); (7.6) the migration refuses while any job
  runs or is starting, like the gate of `seat/deploy.ts`; (7.7) the finish time is a field (`finished-at`, else the
  modification time of `state`), which the sweep's event key and the fallbacks read, so the migration does not ring
  the bell again; (7.8) schema version 1; a field unknown at write time is `null`, a missing field means "added after
  this record's version" (`## Stages` conventions); writes through R-018's `atomicWrite`; file modes as today;
  (7.9) the migration checks the uniqueness of the tokens (T-20 (6)) and lists collisions in its report
  (`## Deployment` 2.1); the resolver that relies on it is R-022. Check: R-021's criteria; `## Deployment` 2.1 and 2.3.
- 2026-11-20 D-058 (Adrian, R-017's `BLOCKED` question, answered "a" as recommended): Pi 1.5.1 has no
  `before_subagent_spawn` event and no `agent` member of `ExtensionContext` (none of the three vendored packages holds
  the string; `ExtensionAPI.on` and `ExtensionContext` in `dist/core/extensions/types.d.ts`), and under the bridge
  Claude Code's subagent tools are always denied (E-5). R-017 removes the dead code instead of declaring it: the
  `before_subagent_spawn` handler of `hook/group-peer.ts` and the three `context.agent?.kind === "sub"` checks (two in
  `hook/group-peer.ts`, one in `src/integrations/coordinator-registration.ts`); `CoordinatorSession` takes its
  fields from the adapter's context type, so `src/integrations/coordinator-registration.ts` joins R-017's
  `## Change`. Behaviour on Pi 1.5.1 is unchanged, since Pi never emits that event nor sets `agent`. Check: R-017's
  AC-2 and AC-9 (the contract on the real types), its scan of Change 5.
- 2026-11-20 D-059 (Adrian, "zrezygnuj z czekania na to powiadomienie, bo ten mechanizm coś nie działa"; amends
  protocol step 4): by day the main session starts the gate once the subagent's final report (its hand-back) has
  arrived and `compare --git` exits 0; it no longer waits for the task's completion notification, which it found
  unreliable. The final report ends the subagent's run, so the rule's purpose, no two gates at once, still holds.
  Check: none (protocol).
- 2026-11-20 D-060 (Adrian, R-020's question on single test runs, answered "A": "masz teraz sam podnieść wersję gita
  na tym WSL, ponieważ ja fizycznie nie mogę"; an exception to the prompt's hard constraint of no install outside the
  repository, for git alone): the session upgrades the laptop's git itself. `sudo` is on the deny list, so it uses
  Linuxbrew, which is user-owned and already on PATH before `/usr/bin`: `brew install git` → git 2.56.1, with 36
  kegs of its dependencies installed or upgraded (among them gcc 16.2.0, glibc 2.39, curl and openssl@4); Maven, zsh
  and tldr are unchanged; `/usr/bin/git` stays 2.34.1. Consequences: (1) a test plant's PATH is fixed and reaches only
  `/usr/bin`'s git, so R-020 makes a plant link the runner's `git` (the first on its PATH) unless that git sits beside
  the node that runs the tests, as the gate's shim does; (2) the gate's shim (D-001) stays unused while the PATH's git
  has `-z`; (3) a copy of a HEAD before R-020 that `fails-before.mjs` builds still plants with `/usr/bin`'s git and no
  shim, so a worktree test at such a HEAD can fail for that reason alone (R-020's run before the upgrade stands).
  Check: `git --version` → 2.56.1; R-020's AC-2 as written.
- 2026-11-20 D-061 (Adrian, "Pytania zgodnie z twoimi rekomendacjami", after he had the session read
  `gate-2-decisions.md`, `taste.md`, the harness principles and this plan and ask again; R-022's and R-023's
  questions): (1) R-022: a well-formed id or token that names no job exits with code 2, class `usage`, code
  `JOB_NOT_FOUND`, so one resolver gives one class to every reference that does not name exactly one job. (2) R-023
  is split by rule: R-023 keeps T-26 and the notes of D-044 and D-045 (2), size M; the new R-092 takes T-38 (the
  `validate`/`apply` shape, the type test, the race test, the shared snapshot), depends on R-021 and R-023, and R-025,
  R-030 and R-037 depend on it. (3) The shared wrapper prints all of a command's text at its end (T-26 (1)); `spawn`'s
  early id line goes, the id stays in `ids.job` and in `limen status`; `picture serve` is the one streaming command.
  (4) Limen starts its own CLI from one launcher module with the client function of the final line (T-25 (1),
  T-26 (4), T-37 (2)); a scan bans launches elsewhere; the rule timer and `group advance` use it until R-034 and
  R-077. Settled by the documents, not asked (the session's reading, recorded here): in R-022 a hint's `next` is the
  command with the one candidate's token, or `limen status --all` for several or none (T-20 (3), D-046 (1), D-045
  (2)); `status --ticket` belongs to the ticket that first records the job's ticket (T-20 (2), T-24); the token is
  checked against the records and `.limen/unmigrated/` until R-031 adds the archive. In R-023 and R-092: `ticket
  done` refuses before any move and `picture build --strict` writes nothing on a refusal (T-38 (1), T-01); a partial
  group roster is a sequence of recorded steps a rerun continues (T-38 (3)); commands with `movedBy` (including
  `group wait`) are exempt from the T-26 scans by that field (D-039, R-018's exception-list precedent), while the logic
  other commands use moves to domain modules; ticket operations stay in `src/project/` until R-061 creates
  `src/spec/`; a converted refusal carries its own code (T-01, T-28 (1)). Check: R-022's, R-023's and R-092's criteria.
- 2026-11-21 D-062 (Adrian, night questions Q-9 and Q-10, "Zgoda na rekomendację" to both; the precedent is D-027):
  the three round-3 notes of R-019's review and the four of R-021's get one fix ticket, R-093, stage 2, size S,
  `delegated`, `night` (a night run may take it), depending on R-019, R-021 and R-022 (whose round-1 fixes change
  `src/job/migration.ts` and `templates/agents.md` too). It is done before the tag `a0.2.0`, because `## Deployment`
  2.1 runs R-021's migration on the seat. Its `ticket.md` is written at the HEAD it starts from, from this entry and
  the two `review.md` → Round 3. The changes (lines at `0e4e588`):
  (1) one helper that reads an error's `code`: `hasCode` in `src/lock.ts` is a renamed copy of `isCode` in
  `src/platform/linux.ts`, so one definition lives in the module that owns it (T-25 (2)).
  (2) The `LOCK_LOST` test in `test/lock.test.ts` asserts the class `environment` (exit 4) besides the code (T-02's
  Check).
  (3) The comment in `test/lock.test.ts` that points to "the ticket's Migration" names R-019 (T-30 (2)).
  (4) The migration keeps a `born` value its field cannot hold, as it keeps any such value: the file stays and the
  migration reports a `kept born` line, with a fixture test of a finished folder that has `born` and no usable `pid`
  (`src/job/migration.ts`, lines 413–421; before R-021, `finalizeJob` removed `pid` before `born`, so such folders
  exist on the seat).
  (5) The coordinator hook's map of damaged records is cleared with `reportedDamage` at a session start and keyed by
  the job folder rather than the bare job id (`hook/wake.ts`, line 1061).
  (6) The hook's per-tick reads of `progress.json` for the status line, and the one unguarded advisory read, go
  through the hook's damage guard, with a test of a damaged `progress.json` (`hook/wake.ts`, lines 1109 and 1213;
  `src/job/wake-text.ts`, lines 20 and 149).
  (7) The coordinator manual's pulse `starting` loses "or no pid yet", since a running record without a pid shows
  `unknown` (`templates/agents.md`, line 142, with its history hash).
  Check: R-093's criteria.
- 2026-11-21 D-063 (Adrian, "rekomendacja" and "zgoda na rekomendacje", by phone; after R-022's review round 2 and the
  `BLOCKED` of its round-2 implementer under D-029):
  (1) R-093 gets item (8): the test plant's `writeRecord` and `editRecord` (`test/plant.ts`) write `record.json`
  through the atomic-write module, with a test that a read during the plant's write never sees a partial file. The
  race test of `test/cli/stop.test.ts` (R-021's; two of six runs failed in R-022's review round 2, on `BAD_DATA` from
  `finalizeJob`'s read) passes then. R-093 runs right after R-022, before R-089 and R-023.
  (2) The one failure of "a held gate queues jobs by priority …" (`test/s3-finish-wake.test.ts`, the job `timed` ended
  `failed`) in the gate of R-022's round 2 was measured, not rerun for a green result: 10 of 10 runs passed alone on
  R-022's tree and 10 of 10 at `HEAD` (through `fails-before.mjs`), so the trees do not differ. Five orphaned
  wrappers from the night's gate runs (started at 03:55, queued, their plants deleted, polling every 50 ms, about 7 %
  CPU each; labels `late`, `old`, `say half`, `orphan`, `f owned`) were stopped by the session with his consent. R-022's
  gate runs once more; a failure of it is again a D-029 finding.
  (3) A new ticket R-094, stage 2, size S, `delegated`, `night`, after R-093 (both change `test/plant.ts`): a queued
  wrapper's `waitForStart` (`src/runtime/start-queue.ts`) ends when its job folder is gone, with a fixture test; the
  tests stop the wrappers they start even when they fail midway; the 2 s budget of the queue test does not depend on
  the machine's load.
  (4) Autopilot by day until 13:00 on 2026-11-21 (he is driving): the session works by the night mode's rules (D-011,
  D-054): only `ready` tickets of stage 2 in dependency order, no new ticket after 13:00, a question goes to
  `.night/questions.md` and its ticket becomes `blocked`, category A defaults by D-054 (2). No decision push while he
  drives, except D-053's at 98 %. A handover by D-047 carries the mode in `## State`.
  Check: R-093's and R-094's criteria; R-022's gate run in its `outcome.md`.
- 2026-11-21 D-064 (Adrian: "Usuń proszę tę zasadę o 98% i resecie, bo reset miałem jednorazowy"): D-053 (1) is
  removed, and with it the 98 % exception of D-063 (4). His one free reset of the limits was used on the morning of
  2026-11-21. No session sends a push at any weekly use or asks for a reset; the weekly limit resets on Mondays at
  17:00, and there is still no stop threshold by day or by night. A run that the limit cuts is reported as before (a
  night's by the morning session). Check: none (a rule for the sessions' conduct).
- 2026-11-21 D-065 (Adrian, about 13:40: "Pytania Q11-Q13 zgodnie z rekomendacjami"; `.night/questions.md`):
  (1) Q-11 and Q-12, option 1 each: one fix ticket R-095, stage 2, size S, `delegated`, `night` (a night run may take
  it), depending on R-022 and R-094, before the tag `a0.2.0`. Its `ticket.md` is written at the HEAD it starts from,
  from this entry and the two `review.md` → Round 3. The changes: (a) R-022's note 1: the report of `limen migrate`
  and R-022's `## Migration` say what the resolver does with a token shared by a job in `.limen/jobs/` and a folder in
  `.limen/unmigrated/` (the token names the job; the unmigrated folder has no reference until R-031); (b) R-022's note
  2: `keeper` de-duplicates by the resolved job id, so its comment "A job named twice is read once" holds, with a test
  of a job given by token and by its group; (c) R-094's note 1: an in-process test of the two "gone" checks of
  `waitForStart` after the poll's decision and after its record change (the test holds the job's lock with `withLock`);
  (d) R-094's note 2 (T-01): absence means `ENOENT` only, and any other error of the record check ends the wait as an
  environment failure with its cause in the log; (e) R-094's note 3: the plant test's `after` hook signals through
  `platform.signalProcess`. (2) Q-13, option 1: the session ended the stopped process 1509615 (`kill -KILL`, exit 0;
  the `coord` session of a plant whose folder was gone, state `T`). Check: R-095's criteria; for (2), `/proc/1509615`
  is gone.
- 2026-11-21 D-066 (Adrian, between 14:23 and 15:14: "1"; Q-14, asked again in the conversation by
  `limen-rebuild-15` while R-023's implementer ran): R-089's
  round-3 notes 1 and A go to R-095 as item (f): `fileOf` (`test/final-line.test.ts`) resolves an import as Node's
  own resolver does (the path normalized, so `../src//outcome.ts` names `src/outcome.ts`; a `file:` URL by the URL
  rules, so one with no `//` names a path from the filesystem root), with a fixture case for each form, and its
  comment says what it does. R-095 keeps size S. Check: R-095's criteria.
- 2026-11-21 D-067 (Adrian, about 15:18: "zgoda na obie rekomendacje"; Q-15 and Q-16, asked in the conversation with
  a push): (1) Q-15, option 2: the one failure of "a held gate queues jobs by priority …"
  (`test/s3-finish-wake.test.ts`, one wake too many) in the gate of R-023's implementer is measured as in D-063 (2),
  not rerun for a green result: 10 runs of the file alone on R-023's tree and 10 at `HEAD` through `fails-before.mjs`,
  recorded in R-023's `ticket.md` → `## Decisions`; then R-023's gate runs once more, and a failure of it is again a
  D-029 finding. A new ticket R-096, stage 2, size S, `delegated`, `night`, after R-023 and R-095 (R-095 changes the
  queue's and the plant's tests), before the tag `a0.2.0`: the cause of the extra wake in this test, found and removed,
  whether a coordinator really hears an event twice (the wake delivery) or only the test's timing fails, with a
  reproduction under the gate's load that fails before the change; the third symptom of the same test (D-063 (2):
  `timed` ended `failed`; R-094's `outcome.md` → Open points: `wokeOnce` `1 !== 0`). (2) Q-16, option 1: the session
  stopped a `claude` process in the repository that `close-previous` does not match (a `claude bg-pty-host` and its
  `--fork-session --resume` of `limen-rebuild-9`'s conversation, running since 2026-11-20 12:36; `kill`, exit 0), since
  a message waking it would have worked on the same tree with a day-old context. Check: R-096's criteria; for (2),
  `ps` lists neither process.
- 2026-11-21 D-068 (Adrian, before 18:23: "Zgodnie z rekomendacją"; Q-17, asked in the conversation with a push):
  option 1: R-095's round-3 notes 2 and 3 (`R-095-round-3-notes-r022-r094/review.md` → Round 3) are items (d) and (e)
  of R-096, which keeps size S. (d) `waitFailure` (`test/runtime/start-queue.test.ts`) reports how a wait ended that
  did not reject (its resolved value, e.g. `"gone"`), not "the wait ended with undefined"; (e) the file's opening
  line names its third mechanism, a record check that fails (T-29 (5)). Check: R-096's criteria.
- 2026-11-21 D-069 (Adrian, about 19:28: "zgodnie z rekomendacjami"; Q-18, R-096's `BLOCKED`, asked in the
  conversation with a push): option 1. R-096 goes on without a failing run under load, on the deterministic proof:
  the cause is the test's fake engine (`test/fake-engine.mjs` fires `agent_settled` after every turn, while Pi 1.5.1
  drains its follow-ups inside one run and emits it once after the run), not the wake delivery. The fake engine
  emits one `agent_settled` per run, as Pi does; a new `test/fake-engine.test.ts` makes the sequence happen; AC-4
  runs as `node adrian-rebuild/tools/fails-before.mjs test/fake-engine.test.ts`; AC-7's load evidence is the runs
  of (a) with no failure, repeated after the change. This departs from D-067's "a reproduction under the gate's
  load" by the deterministic test. Check: R-096's criteria.
- 2026-11-21 D-070 (Adrian: "1"; Q-19, asked again after he had the session read `plan.md`, `gate-2-decisions.md`,
  `taste.md` and the harness principles, as for D-061; inventory: `evidence/inventories/R-092.md`): R-092's scope.
  (1) Option 1: R-092 builds the mechanism of T-38 (1)–(4) and converts the nine change commands that write before a
  refusal today and have no `movedBy`, except `github poll`, whose state R-057 rewrites: spawn, continue, stop,
  ticket done, picture build, group start, group stop, github review and github work. R-092 stays size L.
  (2) Settled by the documents, not asked (the session's reading): `ticket done`, `picture build` and the group
  roster are D-061's; a converted refusal carries its own code, so the `UNTYPED` ratchet of `test/structure.test.ts`
  falls and R-082 types the rest; argument errors of a converted command are usage, exit 2 (T-02); a state changed
  since `validate` ends with exit 3 before the first write (T-38 (2)); commands with `movedBy` are exempt (D-061);
  the wrapper's `endDueRules` goes with seat rules (A-010, R-034) and T-04's housekeeping with R-032; the shape check
  over the other 18 change commands without `movedBy` starts as a ratchet, a list that may only shrink, which R-082
  brings to zero (`## Stages` → conventions), and a ticket that rewrites such a command converts it (the reviewer
  question of T-38). Check: R-092's criteria; R-082's note in `## Tickets`.
- 2026-11-21 D-071 (Adrian: "zgoda na rekomendacje z pytań oprócz Q20"; Q-21, found by the main session in R-024's
  inventory `evidence/inventories/R-024.md`): a new ticket R-097 (S, stage 2, delegated, night, depending on R-021): an
  engine error that says the subscription limit was hit ("hit your … limit") is the failure kind `quota` in
  `failureKind` (`src/job/record.ts`), the one function the migration and `finalize` share; `resetAt` stays `null`,
  because the text gives an hour without a date (D-057 (4)); a fixture with the text of `audit.md` gate 2 §1 Q1; a
  test that fails before the change. The cause: `failureKind` calls an engine error `quota` only with `429` and "rate
  limit", so the 12 limit failures of the M1 history would migrate as `engine-error`, once, at the deployment of
  a0.2.0, and `## Deployment` 2.3 would not match. Check: R-097's criteria.
- 2026-11-21 D-072 (Adrian, the same message; Q-22, option 1): R-024 reads the job records and the job transcripts:
  counts of jobs by role, state, failure kind and route; run time from the transitions; tokens by class (input, cache
  write, cache read, output) from every transcript entry that carries usage, compaction included (E-13). Per landed
  ticket (M-03, M-06, M-07) and coordinator turns (M-03, M-04) go to a new ticket R-098 after R-031 in stage 3, because
  `landed` exists only from R-031 (D-057 (4): never from the git graph); `## Deployment` B.3 for those metrics follows
  a0.3.0, and a seat step copies the coordinators' Pi session directories before a0.4.0 changes what the coordinator
  reads (the "before" of M-03 and M-04); 2.3 stays with a0.2.0. Settled by the documents: `stats` counts one project
  (T-18 (3)), so 2.3 is two runs; it reads only records and transcripts, never the prose of `log` or `result` (T-37
  (1), z. 2); fields the record does not hold yet come with the tickets that record them (queue R-026 and R-035,
  verdict R-064, owner touchpoints R-076); no time filter (B.3 runs on the snapshot copy, the window of 9.1 is stage
  9's; YAGNI); the folders of `.limen/unmigrated/` get one line with their count, a null role its own row (z. 10).
  Check: R-024's and R-098's criteria; `## Deployment` B.3.
- 2026-11-21 D-073 (Adrian, the same message; Q-23, variant b; its last line corrected at his word "Napraw błędny
  zakres Q23", after the main session named the pointer "(limen migrate)" wrong, since a second `limen migrate` has
  nothing to do): `limen stats` prints a table by route and role (jobs, done, failed, run time, input, cache write,
  cache read, output), then `Failed by kind: …`, then `Not read: …` with the folders of `.limen/unmigrated/` and no
  pointer, and a record that does not parse named with `limen status --all`. Check: R-024's golden test.
- 2026-11-21 D-074 (Adrian: "Q20 opcja 2, noc zacznij jak tylko będzie taka możliwość, do 9:00"; Q-20): a night run
  stays within its stage, as the rebuild prompt says; this night takes the `ready` tickets of stage 2 (R-097, R-024,
  R-025) until 09:00, gate 5.2 follows in the morning by phone, and the day after it makes the tickets of stage 3
  `ready` for the next night. The main session starts the runner by D-024 as soon as the preflight passes. The option
  not taken: the night closes the stage without its tag and goes on into stage 3. Check: `.night/status.json`; the
  night's entries in `## State`.
- 2026-11-21 D-075 (Adrian: "Zgodnie z rekomendacjami"; Q-24, from R-025's inventory `evidence/inventories/R-025.md`):
  refusals are declared in the registry (T-28 (1)). Each entry gets `refuses`, the codes of class `refused` and
  `usage` its own path throws; the runner's shared codes (`STATE_CHANGED`, `LOCK_TIMEOUT`, `STEP_FAILED`,
  `REFUSED_AFTER_VALIDATE`, `BAD_ARGUMENT`) are declared once in `src/operation.ts`; a command that runs another's
  operation (`github work` through spawn's) declares only its own. Two scans: every `refused` and `usage` code in
  `src/` is declared, and every declared code has a test named `CODE: …`; the codes without such a test start as a
  ratchet list that may only shrink, which R-082 brings to zero. Settled by the documents, not asked (the session's
  reading): a refusal test is recognised by its `CODE:` prefix (T-29 (2)); a refusal test of a `change` command
  compares the shared snapshot, which a scan checks (T-38's Check); the scans are a test file `npm run check` runs;
  `status` and `show` are `change` until R-032 (D-045 (6.2)); `rule` stays `read`, since `rule set` and `rule end`
  are their own `change` entries and the reason of D-045 (6.1) no longer holds; the `irreversible` marks of `ticket
  done` and land's closing commit come with R-065 and R-037; the read test runs every `read` command on a plant with
  a finished job, `picture serve` and `open` named exceptions with their reason; the scans of both test files go
  through `knownFiles`; the two headers have one line each. Check: R-025's criteria.
- 2026-11-21 D-076 (Adrian, the same message; Q-25, option 1): a success test of a registry command is recognised by
  its name, which starts with the command: `limen <command words>: …`; a scan requires one for every registry command,
  and for a `read` command it is its golden test of the whole output; the commands without one start as a ratchet list
  that may only shrink, which R-083 brings to zero. Check: R-025's criteria.
- 2026-11-22 D-077 (Adrian: "Zgadzam się na nowy ticket nocny R-099"; Q-26, option 1, from R-092's review round 3):
  a new fix ticket R-099 (S, stage 2, delegated, night, after R-092) for R-092's round-3 notes 1, 2, 6 and the
  template line of note 3: a rerun under the jobs lock removes a GitHub handoff gate with no job record;
  `GROUP_STOP_INCOMPLETE` takes its cause's class (T-02); the template's sentence on a refused `--strict` build; the
  snapshot's `git()` reports a git failure except `symbolic-ref` on a detached HEAD; each with a test that fails
  before. With his consent ("tak", 2026-11-22 about 00:20), the main session started the night runner a second time
  for R-099 once the first had ended with `done` (D-024, D-074). Check: R-099's criteria.
- 2026-11-22 D-078 (gate 5.2, Adrian: "Q27 potwierdzam"; Q-27, option 1): every night default of stage 2 stands as
  recorded: R-019's `outcome.md` → `## Night defaults` 1–17 (among them `LOCK_TIMEOUT`'s empty `next` with the hint
  in the message, and the code `LOCK_LOST`), R-021's and R-022's `## Night defaults` and R-021's two deviations
  (`cleanup` a content file; the reaper may end a migrated `running` record), R-024's direct test of
  `projectStatistics` in `test/job/statistics.test.ts`, R-025's `SHARED_CODES` with `UNKNOWN_COMMAND`, `REMOVED` and
  `UNTYPED` and its Deviations 6–11, and R-099's F1, F2, F3 and G1 (`ticket.md` → `## Decisions`). Check: none (a
  record of confirmed choices).
- 2026-11-22 D-079 (gate 5.2, Adrian: "Q28 rekomendacja"; Q-28, option 1, from R-021's review round 2, finding 4): a
  record keeps refusing a field it does not know, as `BAD_DATA` (T-27 (2)). A deployment runs with no job running and
  `/reload` follows at once (`## Deployment` 0.2, 0.3), so no record of the new code meets an older hook; a change a
  reader older than the record cannot read raises the schema version (`## Stages` → conventions). Check: R-021's
  record tests (a record with an unknown field refuses).
- 2026-11-22 D-080 (gate 5.2, Adrian: "Q29 rekomendacja"; Q-29, option 1): the open points of stage 2 go where
  `## State` → "Close of stage 2" proposes: a new fix ticket R-100 (S, stage 3, delegated, night, before R-029; T-25
  (2)): one definition of the ISO-time pattern of `src/job/record.ts`, `src/lock.ts`, `src/job/migration.ts` and
  `src/job/usage.ts`, which also checks the ranges; the older copy of the 429 rule in `src/job/listing.ts` through
  `isRateLimit`; the eight inline error-code checks of R-093's open point through `hasCode`; `seat/deploy.ts`'s own
  `jobFolders` through the resolver's listing; each with a test that fails before. The other points are notes for
  R-031, R-032, R-033, R-038, R-051, R-058 and R-082 in `## Tickets`; the rest stay as each `outcome.md` records them.
  Check: R-100's criteria; the notes in `## Tickets`.
- 2026-11-22 D-081 (gate 5.2, Adrian: "Q30 rekomendacja"; Q-30, option 1): stage 3 starts in a new session, which
  makes its tickets `ready` by day (D-074) for the next night. Check: `## State`.
- 2026-11-22 D-082 (gate 5.2, Adrian: "Q31 rekomendacja"; Q-31, option 1): the tag `a0.2.0` stays on `56f8168`
  (`Stage 2: close`), whose code is that of the gated `224afe6`; its two text errors of `check.mjs` are fixed in
  `1bdad58`, and `## Deployment` 2.0 deploys `56f816820786d77e7cd13485ea20bb7fc78dd9d3`. Check: `git rev-parse
  a0.2.0^{commit}`.
- 2026-11-22 D-083 (Adrian: "wszystko zgodnie z rekomendacjami"; Q-35, option 1; his request after Q-33, which the
  documents settled): before any decision question the session searches `input/gate-2-decisions.md`, `taste.md`,
  `input/zasady-budowy-harnessu.md` and `plan.md` → `## Decisions`, asks only what none of them settles, and names in
  the question what it checked. A hook enforces the search: `adrian-rebuild/tools/decision-guard.mjs` as a
  `PreToolUse` hook on `PushNotification` whose message names a question id (`Q-NN`) and on `Write` or `Edit` of
  `adrian-rebuild/.night/questions.md`; it reads the session transcript (`transcript_path` of the hook input) and exits
  2, naming what is missing, unless the session has read (`Read`) or searched (`Grep`, or a Bash `grep`, `sed -n`,
  `cat` naming the path) each of the four files since the previous decision question of the session; a push without a
  `Q-NN` passes. It proves the search, not its use (z. 14); the content rule lives in the session's memory. Its test
  `adrian-rebuild/tools/test-decision-guard.mjs` (fixture transcripts: no search blocks; a search before the previous
  question does not count; a search of all four passes; a push without `Q-NN` passes; a `questions.md` write without a
  search blocks), a review by `rebuild-reviewer`, outside the ticket list, as D-047 and D-054 were; then the session
  gives Adrian the exact `hooks` block for `.claude/settings.local.json`, which only he writes (D-016), and night runs
  load it too. Check: `node --test adrian-rebuild/tools/test-decision-guard.mjs`.
- 2026-11-22 D-084 (Adrian, the same message; Q-32, variant a): an alert is one line with no ntfy title,
  `<project's folder base name> failed:<kind> <job id>`, e.g. `synchronizer failed:quota
  2026-11-16-f001-work-a-37c02ed6`; plain English (T-13), at most 100 characters (T-10), no path, label or job text
  (A-066). Check: R-033's golden test of the line.
- 2026-11-22 D-085 (Adrian, the same message; Q-34, option 1): the alerts run as a system service and timer on their
  own account (`User=` that account), installed by root with `node /opt/limen/seat/alerts.ts install --account <name>`,
  so the account name stays on the seat (gate 2 §0.5); the units are generated from typed definitions and verified with
  `systemd-analyze verify` before they are enabled (D-010); the ntfy topic reaches the service by `LoadCredential=` from
  a root-owned 0600 file; `limen status` warns when the timer is not active or the service failed (A-066);
  `seat/deploy.ts` re-renders installed units at each tag with the account they hold, and returns to the previous SHA
  with exit 4 when the verification fails. R-033 grows from M to L. Check: R-033's criteria; `## Deployment` 3.3.
- 2026-11-22 D-086 (Adrian: "zgodnie z rekomendacjami"; Q-36 a and Q-37 a, after review round 3 of D-083's decision
  guard, with both rounds of fixes spent): round 3's two notes are fixed by the main session without a fourth review,
  as D-047 (a) was. (1) In the guard, any long option without `=` takes the next word as its argument, a reading that
  can only miss a search, never count one that did not happen; (2) the wide line of its `ticket.md` is wrapped
  (D-053 (2) applied to a rebuild tool's `ticket.md`). Check: `node --test adrian-rebuild/tools/test-decision-guard.mjs`;
  `evidence/decision-guard/review.md` → Round 3.
- 2026-11-22 D-087 (Adrian: "rekomendacja"; Q-38, option 1, after R-030's review round 3 with both rounds of fixes
  spent; an exception to `## Agents`, step 6, for R-030 only, on D-044's pattern): a third round of fixes by the
  resumed implementer. H1: `limen abandon` keeps and names the worktree when a gitlink of the saved tree points to a
  commit that the project repository's object store lacks (`git cat-file -e`), with the reviewer's probe of round 3 as
  a test that fails before the fix; H2: `docs/commands.md:158` states G5's condition; H3: `outcome.md`'s test count.
  Review round 4 checks only H1–H3 and the absence of regressions; a new non-blocking note is fixed by the main session
  when it touches only text, or goes to the notes of the ticket that rewrites that part; a new blocking finding goes
  to Adrian; there is no
  fifth round. Check: `node --test test/cli/abandon.test.ts`; `R-030-unlanded-work-survives/review.md` → Round 4.
- 2026-11-22 D-089 (Adrian: "rekomendowane"; Q-40, option 1; the precedent is D-035): `compare --git` voided R-033's
  implementer run only because `## Change` (f) named its five `git rm` deletions in one backtick span with spaces,
  which `changePaths` does not read; HEAD, the refs, git's config, hooks and the reserved paths were unchanged. Adrian
  accepted the run. The main session writes each path in its own backticks in (f), takes a new `snapshot --git` and
  runs `compare --git` again, which must exit 0. Rule: `## Change` names every deleted or moved path in its own
  backtick span, with no spaces. Check: `node adrian-rebuild/tools/review-guard.mjs compare --git
  node_modules/.rebuild-review/R-033.git adrian-rebuild/R-033-alerts/ticket.md`.
- 2026-11-22 D-090 (Adrian: "uwagi do R-035"; Q-41, option 1): R-033's review round 3 notes 2 and 3 become two items
  of R-035, which changes `seat/alerts.ts` in stage 3, before `a0.3.0` and the alerts' install (3.3): (1) a project
  the alerts first read after their first run, and the install run again after `limen init`, mark that project's
  existing failures as reported without sending them (A-054); (2) the summary of a run that reads no project counts
  an unreadable project once, however many registries list it. R-033 is committed without them. Check: R-035's
  `ticket.md` → `## Change`; `R-033-alerts/review.md` → Round 3.
- 2026-11-22 D-091 (Adrian: "na noc pięć ticketów, potwierdzam godzinę 9:00"): the night of 2026-11-22/23 runs until
  09:00 with five tickets of stage 3 made `ready` by day: R-027, R-028, R-031, R-035 (with D-090's items) and R-100,
  whose `ticket.md` is checked again at `HEAD` after R-033 (D-025); R-036 and R-087 stay for the day. This is Adrian's
  request of D-024: the day session that prepares the tickets runs the D-024 preflight, shows its results, and starts
  `night.mjs --until 09:00`. Check: `## State`; `.night/status.json` in the morning.
- 2026-11-22 D-088 (Adrian: "zgodnie z rekomendacją"; Q-39, option 1, after R-030's review round 4 found a new
  blocking finding; a further exception to `## Agents`, step 6, for R-030 only): a fourth round of fixes by the resumed
  implementer with one item, I1: one function decides whether a worktree holds state the project's repository cannot
  hold, and prune, the setup prune, land, `prune --retire` and abandon all use it; a worktree whose `HEAD`, index or
  working tree holds a gitlink to a commit that the project's object store lacks is kept like a dirty one, whatever job
  names it, with a `kept` line naming the nested path. Tests: round 4's probe (abandon, then `limen prune`) and the same
  worktree through `limen land`, each failing before the fix. Review round 5 checks only I1 and the absence of
  regressions; a new blocking finding goes to Adrian. Round 4's note 2 (a nested repository's other branches, stash and
  reflog) goes to R-031's notes in `## Tickets`. Check: `node --test test/s9-housekeeping.test.ts`; `node --test
  test/cli/land.test.ts`; `R-030-unlanded-work-survives/review.md` → Round 5.
- 2026-11-23 D-092 (Adrian: "tak", after the night's Q-42 and Q-43 were found settled by D-087's rule; makes that
  rule general and amends `## Agents`, step 6): once a ticket's rounds of fixes are spent, a non-blocking review note
  that touches only text (`docs/`, `outcome.md`, `review.md`, comments) is fixed by the main session; a non-blocking
  note that needs code or tests goes to the notes of the ticket that rewrites that part, in `## Tickets`, or, when no
  ticket does, to the outcome's open points for the stage's gate; a blocking finding still goes to Adrian. A night
  does this itself and lists each note's destination among its night defaults, rather than writing a question. By it,
  Q-42 (R-031's round-3 notes: the GitHub poller's lockless reads around a retire, the two `abandonedOf`) goes to
  R-032's notes and Q-43 (R-035's queue diagnosis uses the advisory's one receipt per job and session) to R-036's.
  Check: `## Tickets` → the R-032 and R-036 notes; `.night/questions.md` → Q-42 and Q-43 resolved.
- 2026-11-23 D-093 (Adrian: "Zgodnie z rekomendacjami"; Q-44, option 1, asked in the conversation with a push after
  the sources were searched): every night default of the night of D-091 stands as recorded: R-027's `outcome.md` →
  `## Night defaults` 1–7 (among them 2, which reads A-056's "unknown" for a record with no `scope`, a pid with no
  start time and a live process on that pid as "its state cannot be read": no signal, the job stays `running` with a
  log line per attempt, and the sweep escalates it, R-032's note), R-028's 1–19 and its reading of AC-9 within (a)'s
  scope (a stop of a `starting` job and a group's reserved slot write `stopped` with no `stopRequested`), R-031's 1–26
  and its two review-round defaults (AC-12's first clause within the ticket's scope, `removeUnstartedRecords` going to
  R-032's note by z. 29; the workspace's abandon branches), R-035's 1–13 and R-100's 1–6. The open points of those
  tickets that need code go to the notes of the tickets that rewrite those parts (D-092): R-029, R-032, R-037 and R-087
  in `## Tickets`. Check: none (a record of confirmed choices).
- 2026-11-23 D-094 (Adrian: "rekomendacje"; Q-45, Q-46 and Q-47, option 1 each, asked in the conversation with a push
  after the sources were searched; splits are his, as at D-037 and D-061): three L tickets of stage 3 are split along
  the seams their inventories found (`evidence/inventories/R-032.md` → question 19, `R-034.md` → question 21,
  `R-037.md` → section 9). (1) R-032 keeps the minute sweep: `limen seat sweep` on a user timer, the reap moved out of
  `status`, `show` and the wake hook, `status` and `show` read only, the reaper's notes (a `deactivating` scope, a
  reaper inside the reaped scope, the escalation of a job that cannot be reaped, the `liveJob` callers), the systemd
  installer with lingering and `TimeoutStartSec`, deploy's verification, step 3.1; the new R-101 takes the daily
  steps: prune and retire as steps of the sweep, the `prune` command's removal (its old name), the archive instead of
  deletion (z. 29), the gitlink notes (D-088), `.publishing-<id>`, `jobKeeps`, the retire races (the poller's reads,
  the job's own lock, after owed wakes and alerts) and `abandonedOf`; so R-032's notes in `## Tickets` on those
  subjects are R-101's. (2) R-034 keeps the resume after the quota limit (A-016 (2)–(6), A-068, §6, step 3.4); the
  new R-102 cuts the seat rules (A-010, T-42 (1), step 3.5) and depends on R-034, since A-010 cuts them only once the
  resume holds; R-034's note on `limen rule`'s timer path is R-102's. (3) R-037 keeps the atomic closing commit
  (`applyTicketClose`, shared by land and `ticket done`: a temporary index, `main` moved from the expected value, the
  project's hooks, the ticket-lanes lock for every close, the refusals before the first write; R-092's finding 12);
  the new R-103 takes land as recorded steps (`merged`, `closed`, `cleaned`, a rerun that continues), the `cleaned`
  step's Herdr close, the `close` cut, `ticket done`'s markers as a step (the D-092 note) and step 3.9, depends on
  R-037, and R-054 depends on it in R-037's place. Check: `## Tickets` rows R-032, R-034, R-037, R-101–R-103, R-054;
  steps 3.5 and 3.9.
- 2026-11-23 D-095 (Adrian: "rekomendacje"; Q-48, option 1; amends A-016 (1)'s list of kinds): two failure kinds
  join A-016's twelve: `launch`, an end where the job's engine did not start (the wrapper outside its scope, a missing
  worktree, the engine's spawn error, a failed spawn or group launch, a failed wrapper launch, the wrapper's
  handshake), and `internal`, an error the wrapper itself throws (the class `internal` of T-02); a group's deadline
  before launch is `timeout`. No end that new code writes keeps a `null` kind. Check: R-029's criteria.
- 2026-11-23 D-096 (Adrian: "rekomendacje"; Q-49 and Q-50, option 1 each, asked in the conversation with a push after
  the sources were searched: T-04, T-18 (1), D-041 (6), D-070 (2), D-075, D-094 (3), R-030 Decision 6, R-031 Decisions
  1 and 4, `evidence/inventories/R-037.md`; amends D-094 (3) and T-04). (1) Q-49: the daily step of `limen seat sweep`
  that closes leftover Herdr tabs (T-18 (1)) is R-101's: it closes the recorded tabs (`herdr/`, `herdr/diff/`) of the
  finished jobs whose features are all closed (the rule of today's `limen close FNNN`, for every closed feature), the
  coordinator's own tab skipped; R-101 cuts `limen close` (exit 2, `next: limen seat sweep`; `movedBy: "R-101"` until
  then), gains API `herdr`, and step 3.9 checks that the sweep's unit reaches Herdr; R-103 keeps the `cleaned` step.
  (2) Q-50: `limen diff` and `limen open` become `change` commands, since each opens a Herdr tab and records its place
  so that Limen can close it; T-04's list drops `diff` (`taste.md`, dated); R-103 changes their kind. (3) Settled by
  the documents for R-103 (the session's reading; (i) and (j) named for Adrian's attention): (a) the steps are in
  `record.json` (A-021, gate 2 S1+): `merged` is R-031's `landed` marker, written in the same write as a new optional
  field `land` (D-079) that then records `closed` (the closing commit, or `null` when nothing closed) and `cleaned`,
  each once under the job's lock through the marker writer; (b) the order is merged, closed, cleaned, and the branch
  and worktree go in `cleaned` (A-021); (c) land runs through the runner with typed refusals (D-070 (2)), the terminal
  question between `validated` and `apply`, apply under a land lock of the job; (d) a failed step keeps its class with
  `next` `limen land <id>`, which replaces R-037's `limen ticket done <codes>`; (e) a rerun continues from the first
  step not recorded, never merges again after `merged`, deletes the branch only while its tip is in the target's
  history (z. 29), and after all steps exits 0 with the steps' line, as abandon's marked line; (f) after a kill that
  followed R-037's branch move, the rerun finds `Close <codes>: landed by <id>` in the target's history, finishes the
  checkout and records `closed`; (g) an older record (`landed`, no `land`) is continued from Git, as abandon's steps
  are (R-030 Decision 6), with no migration script (R-031 Decision 1); (h) retire keeps a record whose `land` lacks
  `cleaned`; (i) `cleaned` closes the job's `herdr/` and `herdr/diff/` tabs, the coordinator's own skipped,
  synchronously with `closeJobTab`'s bound and one retry, the result in the output and the job's log; a tab that does
  not close is a line and the step is recorded (T-18 (1): the sweep closes leftovers; T-01); the same close in `ticket
  done` (the finished jobs of its tickets) and in `abandon` (after its marker, still found from Git); (j) a rerun of
  `ticket done` on a ticket its own closing commit closed continues the marker step and, with nothing left, exits 0
  (T-02, the D-092 note), while a number with no ticket stays `NO_ACTIVE_TICKET`; (k) land's `irreversible` mark
  (D-075); (l) the watch tab's close at a job's end (`settleJobTab`, A-029) stays. R-103 is `ready (D-096)`: the night
  writes its `ticket.md` once R-037 is `done`. Check: `## Tickets` rows R-101 and R-103; step 3.9; T-04 in `taste.md`;
  R-101's and R-103's criteria.
- 2026-11-23 D-097 (Adrian: "zgodnie z rekomendacjami"; Q-51, Q-52 and Q-53, option 1 each, asked in the
  conversation with a push after the sources were searched: `evidence/inventories/R-032.md` → section 9 (the daily
  half, D-094 (1)), `R-034.md` → section 9, A-001, A-002, A-010, A-016, A-024, A-030, A-066, A-068, A-079, T-04, T-07,
  T-13, T-18, T-25, T-26, T-28, T-42, D-046 (1), D-057, D-079, D-088, D-092, D-094, D-096, R-029's and R-032's
  `ticket.md`, R-031's open points; the items marked (A) were named for Adrian's attention and stand as recommended).
  (1) Q-51: the resume after the quota limit is a step of `limen seat sweep` with no command of its own (T-18: prune
  and retire are steps with no command; A-024 puts the resume in the sweep); a resume at once is `limen continue
  <id>`, a manual run `limen seat sweep`, and T-26 (2)'s `resume --quota` names the operation. (2) Q-52: the race of
  a resume with `seat/deploy.ts` (its running-job check, then a checkout in place, so a resume in those seconds starts
  a job on mixed code: a `launch` or `internal` failure, nothing lost; a record with a new field is `BAD_DATA` for the
  old code after a rollback) is an accepted risk, named in R-034's `## Risk`. (3) Q-53: the seat's old
  `~/.limen/rules/` on the agents' account lies outside every project, so it is no LEFTOVERS entry: step 3.5 has
  Adrian check it and delete it by hand if he wants (no code reads it), as the seat folders after R-006.
  (4) Settled by the documents for R-101 (the daily half of R-032's inventory):
  (a) the daily steps (prune, retire, the leftover Herdr tabs) run inside the minute run of `limen seat sweep`, per
  project, when that project's last successful daily run is more than 24 h old, from a time stamp in the project's
  `.limen/` written after its daily steps succeed (absent: due; a failed step writes none, so the next minute tries
  again, T-02); a manual run runs what the timer runs (R-032 Decision 2);
  (b) `limen prune` exits 2 with `next: limen seat sweep` (its `movedBy` goes); `--dry-run` goes with the command,
  since an archive move can be undone (z. 29); `abandon`'s `NO_UNLANDED_WORK` names `limen seat sweep`;
  (c) (A) the setup prune at a job's start (`src/runtime/job-setup.ts`, `pruneForJob`, `LIMEN_SETUP_KEEP`) goes, so
  the sweep is prune's one caller (T-26 (2), T-04); R-103's `cleaned` step removes a landed job's worktree, so
  between daily runs only worktrees of jobs without unlanded work wait;
  (d) (A) "nothing is deleted" means nothing Git does not hold elsewhere: a clean worktree (its tracked files are in
  its branch; ignored files as A-001's Decision) and a landed branch whose tip is in the target's history (D-096 (3)
  (e)) are removed as today; a record that never started, a folder with no record and `.limen/.publishing-<id>` (past
  the 10-minute grace, its spawner gone, under the worktree lock) move to `.limen/archive/<YYYY-MM>/<id>/` (the month
  of `startedAt`, else of the move) under the jobs lock with a read again, as retire moves; and a folder in the
  worktree root that Git does not register and that has no `.git`, which `prunePass` deletes today with all it holds
  (`worktreeChanges` returns nothing for it), moves into the project's archive under a folder whose name is no month,
  so no reader takes it for a job;
  (e) `jobKeeps` keeps a terminal job's worktree while its scope is not ended, the question R-032 (c) gives the other
  `liveJob` callers (T-25);
  (f) the gitlink notes (D-088) change the shared `unsavedGitlink` for every caller (T-25): a gitlink counts only
  where a nested `.git` is there, a candidate whose `HEAD` has no commit is named in the failure, and `-z` entries are
  read whole;
  (g) (A) retire takes a job whose `landed` or `abandoned` marker is at least 24 h old, so the owed wakes and alerts
  of a job's end go out first (R-031 open point 4), with no new state;
  (h) retire also takes the job's own lock (R-031 open point 3); the GitHub poller, when its read of `result` or
  `log` misses, finds the job once more, in the archive too, so its reply does not say "No result" (Q-42's note);
  (i) the two `abandonedOf` functions get two names (T-25, T-18), chosen by the ticket;
  (j) `seat sweep` is not `irreversible` (a timer answers no terminal question, D-075); retire and the archive moves
  get tests of running again and of nothing lost (T-28 (3));
  (k) the leftover Herdr tabs as D-096 (1), closed synchronously with `closeJobTab`'s bound and one retry, a tab that
  does not close a line and the step recorded (as D-096 (3) (i)); `limen close` exits 2 with `next: limen seat
  sweep`;
  (l) `docs/seat/limen-prune.*` go, and the prune text of the docs and of `templates/agents.md` (its new first hash
  in `templates/.history/agents.md`) follows.
  (5) Settled by the documents for R-034:
  (a) the resume is a minute step, due once `now ≥ resetAt + 5 min`, with no timer per reset (T-42); the reset is
  R-029's;
  (b) (A) a `quota` job with `resetAt` `null` is not resumed until R-059's hourly reading (A-016 (4) needs the usage
  endpoint), and A-016 (4)'s "notify me once" is the existing alert `failed:quota`; (A) that alert rings only for
  `resetAt` `null`, and with a known reset the bell waits for `quota-exhausted` (A-016 (5)); it rang for 12 of the 18
  failures of M1 (gate 2 §1);
  (c) a resume takes a `failed` job of kind `quota` with a known `resetAt`, not `migrated` (D-057 (4)), with no
  `landed` or `abandoned` marker, that is the newest record on its worktree, with no age bound (z. 19); a group member
  is skipped and named in the run's output (`continue` refuses outside its team);
  (d) (A) exactly one resume: the newest-record check under the jobs lock, the one function `limen continue` also
  calls, so `LIVE_CONTINUATION` covers every job, not only group workers (today two continuations of one ordinary job
  can both start; z. 14);
  (e) the resumed job gets the parent's recorded route (A-030) and the default timeout of 90 min (the record holds no
  timeout); its context is the copied transcript until R-039 (A-079);
  (f) (A) code builds the resume's task from record fields (T-07, A-068), in English (T-13), with no provider text;
  its words for gate 5.3;
  (g) the cap of 3: the resumed job gets an optional record field with its attempt number (D-079); a job with
  attempt 3 that ends on the limit again is written `quota-exhausted` by finalize, so no terminal record is written
  twice; the alert `failed:quota-exhausted` exists;
  (h) owed wakes are a record field (D-057 (7.2), S1+), written as `advisory` and R-032's `stuck` are; the wake hook
  tells a coordinator turn that ended on the limit from its `errorMessage` by the one definition (T-25), and such a
  turn spends neither of the 2 attempts; the mark holds the reset read by R-029's reader; the sweep releases it at the
  reset + 5 min (with a `null` reset, after one hour, A-016 (4)), and the hook delivers it as today;
  (i) (A) the completion wake of a `quota` job says, from record fields, when Limen resumes it and that the
  coordinator does not continue it, instead of `Stop reason: <provider text>`; `templates/agents.md:68` changes; a
  coordinator turn of its own that ends on the limit, with no owed wake, wakes nothing (the extension that did goes,
  A-068);
  (j) the ticket sets what the sweep's unit needs so that a resumed job's launch finds `pi`, `node` and the bridge;
  the API is `pi, systemd`, and step 3.4 checks that the resumed job started and that an owed wake arrived;
  (k) (A) `docs/seat/quota-resume.ts` is cut, and step 3.4 has its link removed from the seat's Pi extensions before
  a0.3.0, which would otherwise point at a file that is gone;
  (l) the `movedBy` of the four `rule` entries becomes `"R-102"`, as R-032 and R-037 moved theirs to R-101.
  (6) Settled by the documents for R-102 (A-010):
  (a) the cut: the four `rule` entries, `src/commands/rule.ts`, `src/project/seat-rules.ts`, `endDueRules`, the
  start queue's rule hold, the cue's block, the board's header, the rule lines of `seat queue`, the decision kind
  `rules`, the subcommand branch of `src/help.ts` whose only case is `rule`, the ISO exception and the `ERRNO_TYPED`
  entry;
  (b) the coordinator registration (`.limen/coordinators/`, `liveCoordinators`, the sweep's `removeDeadCoordinators`)
  goes, since only `rule` reads it (R-002 kept it "for `limen rule` until R-034"); R-050 builds its own registered
  coordinator; the folder is a LEFTOVERS entry;
  (c) (A) the refusal is an `OLD_NAMES` entry with `next` `null` (D-046 (1); `limen decide` comes at a0.7.0), its
  sentence naming the automatic resume; its words for gate 5.3;
  (d) the start priority goes with no replacement (A-010), and D-013's weekly threshold stays manual; step 3.5 checks
  that no `limen rule timer` process runs (a live one sleeps at most 60 s and writes only `ended.<version>`).
  R-101, R-034 and R-102 are `ready (D-097)`: a night writes each one's `ticket.md` once its dependencies are `done`.
  Check: `## Tickets` rows R-034, R-101 and R-102; steps 3.4 and 3.5; the three tickets' criteria.
- 2026-11-23 D-098 (Adrian: "zgodnie z rekomendacjami"; Q-54–Q-57, option 1, 1, 1 and variant A, asked in the
  conversation with a push after the sources were searched: `evidence/inventories/R-098.md` → section 8, D-057 (4),
  D-072, D-073, A-037, A-078, gate 2 §2, T-03, T-18, T-25, T-27, T-37): `limen stats` per landed ticket and per
  coordinator turn (R-098). (1) Q-54: the unit "landed ticket" is a land: a job with a `landed` marker, its `parent`
  chain and the reviewers of its branch, from records; no ticket codes in the marker, so no on-disk change. (2) Q-55:
  M-03 is the coordinator sessions' total cache read divided by the lands whose `landed.at` lies in the sessions' time
  span. (3) Q-56: the coordinator sessions are read only from a new flag `--sessions <dir>`; without it `stats` prints
  no coordinator line; a directory that does not exist is a declared refusal. (4) Q-57: variant A of the output, four
  lines after the jobs table (`Lands …, per land: …`, `Lead time per land (median): …`, `Coordinator (…): …`,
  `Coordinator cache read: … per turn · … per land · first turn after a land: …`). (5) Settled by the documents, as
  R-098's `ticket.md` → `## Decisions` 5–7 records them: (a) a turn is one assistant message, a compaction adds tokens
  and is no turn; (b) no time filter; (c) M-04's land is the `limen land` or `limen ticket done` tool call in the
  session, its turn the first of the next run (A-037); (d) M-06 from the land's first queue entry or start to
  `landed.at`, with a part the records lack shown `—` and a `ticket done` land (its `at` a day) named on `Not read`;
  (e) M-07 counts the land's jobs only; (f) one transcript reader; and, correcting the reading sent with the questions,
  every session file of the `--sessions` directory counts, with no filter on the recorded `cwd`, since B.3 runs on a
  copy in another folder. R-098 is `ready` with its `ticket.md`. Check: R-098's criteria; `## Deployment` B.3 and B.4;
  the paragraph after the `## Measurement` table.
- 2026-11-24 D-099 (Adrian: "oba zgodnie z rekomendacjami"; Q-58 and Q-59, option 1 each, asked in the conversation
  with a push as "Q-51" and "Q-52", numbers D-097 and D-098 had already used; the precedent is D-089): (1) Q-58:
  `compare --git` voided R-034's implementer run only because `## Change` (h) wrote its one deletion as the span
  `git rm docs/seat/quota-resume.ts`, with spaces, which D-089's rule forbids and `changePaths` does not read; HEAD, the
  refs, git's config, hooks and the reserved paths were unchanged. Adrian accepted the run: (h) names the path in its
  own backticks, the main session takes a new `snapshot --git` and runs `compare --git` again, which must exit 0. (2)
  Q-59: the second occurrence of the slip makes D-089's rule code (z. 38): `check.mjs` rejects, in `## Change` of a
  ticket that is `ready` or `active` (the tickets an implementer gets; the `done` R-007 and R-023 keep the form in their
  history), a backtick span that holds `git rm` or `git mv` together with a path; a commit `Tools: …` with its test,
  after the commit `R-034:`. Check: `node --test adrian-rebuild/tools/test-ticket-rules.mjs`;
  `node adrian-rebuild/tools/check.mjs`.
- 2026-11-24 D-100 (Adrian: "rekomendowane, może być 15 min"; Q-60, option 1, asked in the conversation with a push
  after R-034's review round 1; amends D-097 (5) (b)): the alert `failed:quota` also rings for a `quota` failure with a
  known `resetAt` once the job is overdue, 15 minutes after its due time (`resetAt` + 5 min + 15 min), while it has no
  continuation (it is still the newest record on its worktree, with no `landed` or `abandoned` marker), once per job as
  every alert. One rule on record fields covers a group member (which the sweep never resumes) and a resume refused at
  every run (`ENGINE_MISSING`, `JOB_TREE_GONE`, `BAD_DATA`), with no counter and no new state (z. 1, T-01; the 15-minute
  grace is A-033's pattern); a resume that succeeds rings nothing, as D-097 (5) (b) intends. Check: R-034's
  `test/seat/alerts.test.ts`.
- 2026-11-24 D-101 (Adrian: "zmodyfikowałem", then "wkleiłem, przebieg się liczy o ile będzie spełniony warunek";
  asked in the conversation with a push, proposed by `limen-rebuild-29` after R-034): (1)
  `.claude/agents/rebuild-reviewer.md` → `## Reply format` gets one rule, written by Adrian with its Polish summary:
  each criterion is exactly one line, `AC-N: met: <evidence>`, with no bullet or continuation line below it and no other line in
  `## Criteria`, since nine replies of the rebuild were rejected by `review-verdict.mjs` for that form; the rule states
  what the script already checks. (2) Adrian wrote it while R-036's implementer ran, so `compare --git` voided that run
  for the reserved path alone; the run counts because `compare --git` named only that file and its blob was `0426fed`,
  the one the main session read after his edit (the pattern of D-099 (1)); a new `snapshot --git` follows the commit.
  Check: `node --test adrian-rebuild/tools/test-review-verdict.mjs`; the next replies of `rebuild-reviewer`.
- 2026-11-24 D-102 (Adrian: "wszystko dziś, rozpoczęcie przebiegu nocnego po zakończeniu otwartej pracy, przebieg
  nocny do 8:00", on `limen-rebuild-30`'s proposal in the conversation; amends D-024): (1) while
  `adrian-rebuild/.night/lock` is held by a live `night.mjs` (the owner's pid, start time and boot id match a running
  process), a day session only reads, whatever Adrian writes, and changes nothing in the repository; (2) the main
  session starts the runner as a background task that Claude Code tracks (`run_in_background`), as `nohup node
  adrian-rebuild/tools/night.mjs --until HH:MM` with stdout and stderr appended to `adrian-rebuild/.night/launcher.log`,
  so the runner's end wakes the session that started it; D-024's preflight stays; (3) at that wake the session sends
  Adrian a push, reads `## State` and `.night/status.json`, and takes over by day (a handover by D-047 when at 30–50 %
  context); (4) the resume rule, in `## Agents` → protocol: a session that finds a ticket `active` with a changed
  working tree first runs `review-guard.mjs compare --git` on that ticket's snapshot (exit 1 voids the run, and Adrian
  decides); on exit 0 it starts a fresh `rebuild-implementer` with the ticket's path and "the previous run was cut;
  finish from the working tree", then protocol steps 4–7; a review cut before its reply was saved runs again; (5) the
  guarantee of (1) in code: `night.mjs` exports the liveness check of `.night/lock` (as its takeover of an abandoned
  lock reads it; a lock whose text is no owner record is not live), and `handover.mjs start` and `close-previous`
  refuse with exit 1 and the lock's owner while it is live, since a `close-previous` during a night would stop the
  night's `claude -p`, which is older than the new session and runs in the repository, at a clean moment between its
  commits; built by the main session and reviewed by `rebuild-reviewer` as D-026 was, in the commit `Tools: …` after
  this one. Check: `node --test adrian-rebuild/tools/test-handover.mjs` (from that commit); `## Agents` → protocol.
- 2026-11-25 D-103 (Adrian: "Q-51 - rekomendacja"; gate 5.3, asked in the conversation): the three night defaults of
  the night of D-102 stand as recorded: R-087 F2 (an empty `GIT_ASKPASS` in the job's environment), R-098 F5 (the run
  parts less each job's queue wait), R-101 Decision 7 (the transport name `LIMEN_SETUP`). Check: the three tickets'
  `ticket.md` → `## Decisions`.
- 2026-11-25 D-104 (Adrian: "Q-52 - rekomendacja"): the items for gate 5.3 and those marked (A) in stage 3's
  `ticket.md` → `## Decisions` (69 in 14 tickets, `evidence/gate-5.3-inventory.md` → section 2) and the 41 new codes
  and wordings of R-034, R-037, R-102 and R-103 stand as written; R-065 and R-085 write the final texts and help.
  Check: the inventory's sections 2 and 5.
- 2026-11-25 D-105 (Adrian: "Q-54 - rekomendacja"): two `Tools:` commits before stage 4, each with its test and a
  review by `rebuild-reviewer` as for D-026: (1) the gate checks that it leaves no new ignored file in the checkout
  (R-102 `outcome.md` → Open point 6); (2) `check.mjs` checks that every test file a `ready` or `active` criterion
  names exists (R-103 `ticket.md` → Decision 24). Check: `git log --grep='^Tools:'`.
- 2026-11-25 D-106 (Adrian: "Q-55 - najpierw ja zamknę etap 3 po swojej stronie. W nowej sesji przejdziemy razem
  krok po kroku zamknięcie etapu 3 po mojej stronie."): stage 4 waits for Adrian's close of stage 3 on the seat: the
  deployment of `a0.3.0` and the seat steps 3.0–3.11 of `## Deployment`, with the projects' resumption (D-012); a new
  day session goes through them with Adrian one step at a time (he runs them; the session states each step, reads
  his results and records them in `## State`). Q-53 waits for its proposal. Check: `## State` → Next.
- 2026-11-25 D-107 (Adrian: "Q-53 - rekomendacja, Q-56 - rekomendacja, Q-57 - rekomendacja, Q-58 - rekomendacja,
  Q-59 - rekomendacja"; gate 5.3): (1) Q-53: stage 3's open points go as `evidence/gate-5.3-placement.md` proposes:
  notes for R-049, R-050, R-051, R-054, R-059, R-060, R-062, R-073, R-076 and R-085 in `## Tickets`, two new fix tickets
  of stage 4, R-104 and R-105, and no change for the rest; (2) Q-56: "refusal" keeps both meanings, a command's exit-1
  refusal and a guard's `BAD_DATA` of a Pi value (T-32 (4), D-055); (3) Q-57: a read command may take a bounded reading
  of an outside system, each bound named in T-04 by a dated line (`taste.md`), and the read test keeps its exceptions;
  (4) Q-58: the daily prune moves every folder of the worktree root that Git does not register into
  `.limen/archive/unregistered/`, `.git` or not, so nothing Git does not hold elsewhere is deleted (z. 29); this amends
  D-097 (4) (d) and is R-104's; (5) Q-59: a start-queue entry counts as live only when its job folder is one of the
  project's jobs, in R-104, which is M. Check: `## Tickets` rows R-104 and R-105 and their notes; T-04 in `taste.md`.
- 2026-11-25 D-108 (Adrian: "rekomendacja", to the session's option 1 for the alerts at step 3.3): the relay refuses
  the seat's IPv6 sender for its daily quota and takes IPv4 (`## State`, "`limen-rebuild-33`"), so the alerts run now
  with a temporary systemd drop-in on the seat that sets `NODE_OPTIONS=--dns-result-order=ipv4first` for
  `limen-alerts.service` only, and a fix ticket puts that setting into the alerts' unit (`seat/units.ts`); once a tag
  with it is deployed, Adrian removes the drop-in. The ticket's place is decided with the other engine facts this
  close refuted. Check: `## Tickets`, the fix ticket's row; `## Deployment`, the step that removes the drop-in.
- 2026-11-25 D-109 (Adrian, on finding (4) of the close of stage 3, the fallback wakes of the seat's trial jobs:
  "Jestem w stanie pogodzić się z testowymi artefaktami tego pokroju wynikającymi z przebudowy, ale nie powinno się
  to dziać na produkcyjnej wersji"): artefacts of this kind that the rebuild's own seat trials leave are accepted
  while the rebuild runs; the version the rebuild ends with (the session's reading of "produkcyjna wersja": a1.0.0)
  must not produce them, so a wake the coordinator answered is not delivered again, and the end of a job that no
  coordinator spawned does not reach a coordinator as a wake that names a subscriber. Finding (4) is `fix` before
  a1.0.0; its ticket and stage are decided with the other findings of this close (`## State`, "`limen-rebuild-34`").
  Check: `## Tickets`, the ticket's row.
- 2026-11-25 D-110 (Adrian: "Q-60 zgodnie z rekomendacją"; Q-60 asked at step 3.11, `## State`,
  "`limen-rebuild-34`"): GitHub enforces no ruleset on the private repositories of `synchronizer` and `ledger` on
  their account's plan, and Adrian keeps that plan (no GitHub Pro for two personal projects). §7 D1 becomes a rule per
  project: (1) in every project a watcher outside the agents' account keeps its own clone, fetches `main` with no
  forced update every minute, and alerts the phone on a forced update or a deletion of `main` on GitHub, keeping the
  history it held (R-106, stage 4, deployed with a0.4.0, with a read-only deploy key per repository as seat step 4.10);
  (2) a ruleset on `main` (no force push, no deletion, and from a0.5.0 push only from the owner channel's identity)
  where the plan of the repository's owner account enforces one, set by that account's owner; `synchronizer` and
  `ledger` have none. Steps 3.11 and 5.2 change accordingly, `### Resuming the projects on the seat` condition 6 goes
  (the resumption waits for neither), and among what narrows D-012's accepted risk the ruleset of 3.11 is replaced by
  T1 (R-087, verified at step 3.10: no job holds a credential) and, from a0.4.0, the watcher; until a0.5.0 the
  coordinator session still holds the write token, which B1″ (step 5.1, R-055) removes. Check: `## Tickets`, R-106's
  row; `## Deployment`, 3.11, 4.10 and 5.2.
- 2026-11-25 D-111 (Adrian, Q-61: "projekt zawodowy to nie jest cel przebudowy, cel przebudowy to budowa
  `limen-adrian`, projekt zawodowy to beneficjent przebudowy, projekt zawodowy skorzysta z `limen-adrian` najwcześniej
  w wersji a1.0.0"): the rebuild's goal is Adrian's Limen; a professional project of his, on a dedicated GitHub
  account of which his own account is a collaborator, with private repositories, is a beneficiary that uses it at the
  earliest from a1.0.0. Its onboarding is not part of the rebuild, and no ticket is added for it. Its name stays out of
  this public repository. Check: none (a statement of scope).
- 2026-11-25 D-112 (Adrian, Q-62: "Q-62 zgodnie z rekomendacjami"; the four findings of the close of stage 3, `## State`,
  "`limen-rebuild-33`" and "`limen-rebuild-34`"): (1) the exit 4 of systemd 259's `is-active` (E-18) → R-107; (2) the
  stall rule beside a message's parallel tool calls (E-19) → R-108; (3) D-108's fix ticket → R-109, with seat step
  4.11 that removes the drop-in; each S, `delegated`, `night`, in stage 4 with no dependency inside it, so a night can
  take them first. (4) (D-109) is a note with its criterion for R-051, which rewrites the wakes' delivery and text
  (A-008): the read of 2026-11-25 shows each of F012's 15 jobs delivered once to its coordinator's session with no
  unconfirmed attempt, so only fallback wakes are affected. The projects' resumption waits for none of them: a job's
  time limit bounds (2), (1) is a false alarm that loses nothing, and the drop-in covers (3). Check: `## Tickets`, the
  rows R-107–R-109 and the note for R-051.
- 2026-11-25 D-113 (Adrian, at the end of the close of stage 3 on the seat: "nie wznawiam jeszcze pracy na seacie, niech
  limity subskrypcji skupiają się na przebudowie limen"): the projects stay paused after the close; the Max window
  goes to the rebuild, and stage 4 starts without them. The resumption (D-012) is Adrian's word at a time he picks,
  with no date; until then no coordinator or job runs on the seat, so D-012's accepted risk is not live and D-013's
  yield has nothing to yield. The trial leftovers of the close are cleaned by Adrian first (a job's record is deleted
  only by a person, R-031 Decision 6). Check: `## State`, the resumption's entry when it comes.

### Gate 2 §2, copied

A verbatim copy of `audit.md` → `## Gate 2: decisions` → `### §2 Cross-cutting decisions` (D-003); `check.mjs` fails
when the two differ. Where a rule of `taste.md` changes one of these decisions, the list "Changes to gate 2 decisions
made in stage 3" in `taste.md` names it, and the rule holds (D-006).

<!-- gate2-s2:begin -->
**G1 — features.**

| ID | Feature | Decision |
|---|---|---|
| G1.1 | GitHub doorbell | keep, as a module (G1.10) |
| G1.2 | Groups | keep, as a module (G1.10) |
| G1.3 | Finish webhooks, coordinator signals, `bin/tony-finish-ping.sh` | cut |
| G1.4 | Picture | cut the UI (viewer, `/`, `map.html`); keep `/activity.json`, `/events` and the data model for a future UI of mine; module (G1.10) |
| G1.5 | Linear mirror | cut |
| G1.6 | Devin | cut |
| G1.7 | OMP | cut |
| G1.8 | Hosted `--tab` | cut; the doorbell moves to detached jobs, groups are detached only |
| G1.9 | Non-Git workspace | keep, as a module (G1.10) |
| G1.10 | Module switches | optional modules (Picture, doorbell, groups, non-Git workspace, research, quality pass) have switches in a project file (e.g. `.agents/limen/limits.json`), **off by default**; a disabled module contributes no prompt text and no hook, and its commands refuse with a message |
| G1.11 | Research (researcher + judge) | module, off by default; the research account, queue and scanner (B2c) belong to it: the rebuild writes them, I install them only when I enable it |
| G1.12 | Private planning | cut; only `committed` stays |
| G1.13 | Quality pass | module, off by default; when on, triggered **by code** after N landings since the last findings file (N in `limits.json`, asked at `limen init`, default 10) and by `limen quality`; the prose trigger goes |
| — | `limen highlight` | cut |
| — | macOS branches | cut (A-083) |

**G2 — isolation (A-004).** In code: T1 (§3, A-004). On the seat, as separate accounts I set up with tooling the
rebuild writes (decision S):
- **B1″ owner channel:** a separate SSH key only on my own machines (no agent forwarding); a separate account accepts
  it only with a forced command. Its timer publishes `main` by the coverage rule (A-006) from its own clone (`git
  fetch` from the agents' repo as data, fast-forward only). It holds the only GitHub token with write access; the
  agents' account gets a read-only token. It does not start research.
- **B2c:** the agents' account has outbound traffic only to an allow-list of domains (nftables per UID + proxy:
  Claude and Anthropic, GitHub read, npm, Maven Central and whatever Claude Code under the bridge needs; the list is
  set by measurement). It does not talk to the DNS resolver; the proxy resolves names. A separate research account
  has an open network and its own Claude login, no access to the repos or the agents' home, and writes results to a
  results directory. Agents only queue a research request; a service outside the agents' account scans it (length
  limit; refusal on known token formats such as `github_pat_`, `sk-ant-`, OAuth tokens, and on high-entropy strings;
  the refusal goes to the coordinator with a reason) and starts the research job. No approval by me.
  `accepted-risk`: a token deliberately encoded by an attack written against Limen.
- **Bell:** runs on its own account, outside the agents' account (A-066).
- **Condition:** if a project managed by Limen becomes public, publishing `main` becomes an exit path and this decision
  must be revisited.
- **Accepted-risk (same account):** deliberate tampering by a job with Limen's own files on the agents' account
  (records, markers, another job's `result`, inbox, transcripts, cgroup moves, shell start-up files). Typical
  injections lose their point because there is no push credential and no open network; local damage is reversible
  (git, archive) and stopped by the land conditions and the publication rule.
- Account names used today are misleading; new names are chosen before the seat changes.

**S — seat tooling lives in the Limen repo.** Owner channel, research launcher and queue scanner, network-rule and
proxy templates, bell, coordinator start script, Pi extensions of the seat: all under the same checks (tsc, biome,
tests). The rebuild writes them; I deploy them. No secrets in tracked files.

**S1+ — one structured record per job.** `record.json` with a schema version: state, transitions, verdict, judgments,
check results, rounds, markers `landed`/`abandoned`, failure kind and detail, quota reset time, owed wakes,
`doneBy`, route, process identity, land steps, `filed`. Writes only through the transition function (A-019): temporary
file + `rename`, a `wx` claim at the terminal transition. Content (result, transcripts, logs) stays in separate files.
Migration of existing records by a script with a fixture test. Earlier wording such as "the `verdict` file" means a
field of `record.json`. Not SQLite: it would not cover the git step of land and adds migrations, harder rollback and
WAL reads across accounts.

**Owner files (final form, replaces the list in A-011 and A-006).** `.agents/limen/**` (`limits.json`,
`routes.json`, `styleguide.md`), `CLAUDE.md`, `AGENTS.md`, `spec/vision.md`. Changed only by `limen land --owner`,
accepted **only through the owner channel**. `land` refuses a job branch that touches them or `spec/build.md`.
`docs/**` is **not** an owner file: tickets change it (41 of 49 such commits in synchronizer M1), review covers it, and
a second fixed judgment checks it (A-031). Reason for the owner channel: a coordinator able to run `land --owner` could
raise its own limits and change its own routes and rules (z. 16).

**Registered coordinator.** One function, "the caller is the registered coordinator", used by every coordinator-only
command (`limen steer`, `limen decide`, `limen github resolve`, `limen github work`, and others): the caller's process
is in no job's systemd scope (`/proc/self/cgroup`) and descends from the PID of the registered coordinator (A-033).
Environment variables (`LIMEN_JOB`, `LIMEN_COORDINATOR`, `HERDR_PANE_ID`) no longer decide. `land --owner` is not
a coordinator command.

**Measurement (for `plan.md` → `## Measurement`).**
- Baseline caveat (A-086): today's seat runs without Limen's system-prompt prose but with the per-turn cue (§1), so a
  before/after comparison of prompt-driven behaviour compares "cue only" with "Limen context message plus the A-077
  cue"; record this in every such measurement.
- Method (z. 40, z. 41): compare Limen before and after the rebuild on the **same task** (identical input: commit and
  task file; same model and reasoning; clean state), several attempts (z. 17), result as pass^k. Candidate: a closed
  synchronizer M1 ticket that went through several review rounds, replayed from its parent commit, the merged change
  as the reference solution. Mechanisms (resume after limit, stall, queue) get their own mechanism tests.
- `limen stats` (S1+) over all records including the archive: verdict, judgments per ID, check results and times,
  rounds, failure kind, `doneBy`, number and origin of steers, route, queue time, and tokens by class (input, cache
  write, cache read, output) from the transcript, per job and per coordinator turn; grouped by route (A-030′).
- Named seat measurements: coordinator cache-read tokens per landed ticket (A-078); cache-write tokens in the turn
  after a land (A-037); fixed context per role, before and after (stage 1 script and one raw request on the seat).
<!-- gate2-s2:end -->

## Engine facts

Answers to gate 2 §7 B, read on 2026-11-17 from the npm tarballs of Pi 1.5.1 (`@earendil-works/pi-coding-agent`, with
`pi-ai` and `pi-agent-core` 1.5.1) and `@vanillagreen/pi-claude-bridge` 5.0.3, as data, nothing executed. Detail, quotes
and source lines: `evidence/engine-sources/pi-1.5.1.md` and `evidence/engine-sources/bridge-5.0.3.md`. The bridge
inlines its own Agent SDK (0.3.261) and spawns the `claude` binary found at run time; what Claude Code itself decides is
not in these sources and is a seat check (`## Deployment` item 12). The main session checked E-1, E-3 and E-12 against
the sources itself.

| # | Question | Answer | Feeds | Settled |
|---|---|---|---|---|
| E-1 | How the bridge maps the system prompt and messages (Q9, cost 2) | One SDK `query()` per Pi prompt, continuing Claude Code's own session file with `resume`; when Pi's history diverges (compaction, a `system` entry after the cursor, an abort) the bridge rewrites that file from Pi's history. The system prompt is Claude Code's `claude_code` preset plus an append of exactly three parts: the nearest `AGENTS.override.md`/`AGENTS.md`/`AGENTS.MD` walking up from the cwd, Pi's skills block, and four opt-in blocks that are off by default. **Pi's system prompt is not forwarded**, so Limen's role preamble (`--append-system-prompt`, `src/runtime/engine.ts:248` at `rebuild-base`) and the hook's system block (`hook/communication.ts:104`) never reach the model on the `pi-claude` route. Pi user messages (the task, and at `rebuild-base` the wakes and steers sent with `pi.sendUserMessage`) and Pi custom messages (the per-turn cue, reminders) all arrive as `user`; Pi's `role: "system"` patch entries are dropped. So the per-turn cue, with its register lines, reaches the model every turn (gate 2 §1, revision 4). | A-037, A-042, A-051, A-079, A-008, A-038, A-040, A-043, A-077; new finding (below) | yes (code and the bridge README); seat B.1 (2026-11-17): a Pi turn resumes the same Claude Code session (turns 2 and 3), and a job starts in a new one |
| E-2 | Cache breakpoints and TTL (Q9, cost 2) | The bridge sets no `cache_control`, breakpoint, TTL or caching variable; Claude Code decides all three. It reports `cacheRead` and `cacheWrite` per Pi turn (summed over the child's API calls; cost 0, no 5m/1h split). Claude Code's auto-compaction is switched off (`DISABLE_AUTO_COMPACT=1`); Pi compaction forces a session rewrite. | A-037, A-078, A-079, Measurement | yes; seat B.1 (2026-11-17): cache TTL 1 h for the coordinator and for a job (`ephemeral_5m` = 0 everywhere); a Pi compaction rewrites the session (next turn: cache read 3,272, cache write 27,578 tokens) |
| E-3 | What `--approve` enables (Q6, security 1) | Only project trust for the run: Pi then reads `<cwd>/.pi/settings.json` (which can install packages and change `npmCommand`, `shellPath`, `shellCommandPrefix`), `.pi/skills`, `.agents/skills` and `.pi/SYSTEM.md`, and the bridge reads `.pi/claude-bridge.json` (which can set the Claude Code executable path). Pi has no tool-call approvals and no `--auto-approve` (OMP had it). Without `--approve`, JSON mode resolves trust to "untrusted". | A-004, A-025, A-003 | yes |
| E-4 | What a job loads from its worktree (Q5) | Pi: context files (`AGENTS.override.md`, `AGENTS.md`, `CLAUDE.md`, case variants) from the cwd up to `/` and from `~/.pi/agent`, never trust-gated (off only with `--no-context-files`); under the bridge these sit in Pi's prompt and do not reach Claude. Bridge: the nearest `AGENTS*` file, re-read every query (none in isolated mode, E-15). Claude Code: `CLAUDE.md` and `.claude/settings*.json` per its default setting sources (E-7). `--no-extensions` keeps the project stub `.pi/extensions/limen.ts` out of jobs but does not stop settings-listed package installs (`--offline` does). Extensions given with `-e` go through jiti's transpile cache in the OS temp directory, shared by every process of the account (`JITI_FS_CACHE=0` or a private `TMPDIR` avoids it). The whole Pi environment is forwarded to Claude Code. | A-025, A-004 (T1), A-003 | partly: jiti cache path, `-e` module resolution and Node's compile cache are seat checks |
| E-5 | Tool restrictions and the subagent tool (A-081, A-029) | Claude Code's built-in tools are disabled; Pi's tools are served to it as `mcp__custom-tools__<name>` under `bypassPermissions`, so Pi's `--tools` allowlist (e.g. `read,grep,find,ls`) reaches Claude exactly. `Agent`, `Task`, `Skill`, `AskUserQuestion` and other Claude Code tools are always denied; Pi's `tool_call` event sees only Pi tool names. Exception: a session with zero Pi tools gets Claude Code's own Bash/Read/Write back, so no role may run with an empty tool list. | A-081, A-029 | yes for the bridge; seat B.1 (2026-11-17): the coordinator has 4 tools and a job 5; tools loaded on demand: step 4.3 |
| E-6 | Skills (Q10, H-11) | Pi lists every loaded skill (name, description, path) when `read` or `bash` is active; `disable-model-invocation: true` hides one; `--no-skills` plus `--skill <path>` restricts a session. The bridge forwards that block into Claude's append. | A-081 | yes |
| E-7 | Is `CLAUDE.md` loaded under the bridge (A-042) | The bridge passes no `settingSources`; the SDK documents that all sources (user, project, local, `CLAUDE.md`) then load. The bridge's own append reads only `AGENTS*`, not `CLAUDE.md`. | A-042 | partly: seat check (item 12) |
| E-8 | Context window (cost 8, A-034 thresholds) | Pi takes 1,000,000 input / 128,000 output for `claude-opus-5-5` from pi-ai's catalog; the bridge passes neither to Claude Code. Pi auto-compacts above window − 16,384 tokens and keeps a summary plus about the last 20,000 tokens. `ctx.getContextUsage()` = the last assistant usage plus a chars/4 estimate. Claude Code's real window on the Max login is unknown, and its own auto-compaction is off. | A-034, A-033 | yes; seat B.1 (2026-11-17): the window of `claude-opus-5-5` on the Max login is 1,000,000 tokens |
| E-9 | Limit errors (A-016) | A usage-limit result ends the Pi turn with `stopReason: "error"` and the Claude Code text in `errorMessage` (provider text, not model text). A structured reset time (`resetAtMs`, `rateLimitType`) appears only on Pi's event bus as `kendex:rate-limit`, and only if the binary sends a `rate_limit_event`. A 90 s silent stream ends the turn as `error` with `rateLimitType: "stream_idle"`. | A-016 | partly: whether the event fires for the 5-hour and weekly limits is a seat check |
| E-10 | Reasoning level (A-030) | Pi's level maps through the model's own table: for Opus 5.5 `high` → `--effort high`, `xhigh` → `--effort xhigh`; no level → Claude Code's default. | A-030 | yes; seat B.1 (2026-11-17): `--thinking` reaches Claude Code as `effort` |
| E-11 | Extension API Limen relies on | `before_agent_start` runs once per run (each prompt sent while idle), not per LLM turn; a returned `systemPrompt` applies to that run only. `sendMessage` custom messages reach the model as `user` (`display: false` hides them from the TUI only); `appendEntry` stays out of the context. `/new` and `ctx.newSession()` give a new session ID, re-run extension factories and keep the CLI options. | A-009, A-033, A-037, A-008 | yes |
| E-12 | `--append-system-prompt` text or path | Text, or the file's contents when the value names an existing file relative to the cwd. | (hosted mode, cut) | yes |
| E-13 | Pi compaction vs the resumed Claude Code session (§7 B, revision 2; A-086) | Every Pi compaction path writes the compaction entry, rebuilds Pi's context and awaits `session_compact` before the next model call; the bridge listens to the same event. With no bridge query running (before a prompt, after a run, overflow, manual `/compact`), the next query rewrites the Claude Code session in place; between turns of a run, the bridge kills the query and restarts it under a new session id, re-sending the pending request and a "history replaced" notice. The rewritten session holds Pi's summary as one user record plus the kept entries; system entries are dropped. The hook re-sends the context message on `session_compact`, but no single `sendMessage` option fits every trigger: the default (steer) lands in the next request except after a run, where it starts an extra turn; there `triggerTurn: false` is right (between `agent_end` and `agent_settled`, `willRetry` false). Keeping the message through compaction instead is not simpler (Pi keeps one contiguous range). Claude Code's own auto-compaction is off; whether settings can turn it back on is engine-side. | A-086, A-037, A-079 | partly: end-to-end order is a seat check (4.2); seat B.1 (2026-11-17): a compaction is two requests without tools in new sessions (cache writes of about 4k and 24k tokens, TTL 1 h), and the next turn resumes a new transcript built from Pi's history |
| E-14 | Does each Pi user message reach the request intact (§7 B, revision 2; A-086) | Yes, as far as the bridge goes: no truncation, length cap, escaping or rewriting of user or custom text (its rewrites touch only the AGENTS text, the skills hint and tool names). When the session is reused, consecutive user messages are joined in order with a blank line into one prompt (text blocks of one message joined with a newline); on a rewrite each message is its own record, stored unchanged. The bridge has no size limit; a Claude Code limit on one prompt, and whether a leading `/` is parsed as a command, are engine-side. Until settled, the context message never starts with `/`. | A-086, A-051 | partly: size limit and verbatim delivery of a ~100 KB message are seat checks |
| E-15 | What `CLAUDE_BRIDGE_ISOLATED=1` turns off (Adrian, 2026-11-17; D-005) | In isolated mode the bridge forwards no `AGENTS*` file at all (`bridge@5.0.3/src/agents-md.ts#L75`), reads no project `.pi/` settings, no `.pi/claude-bridge.json` and no project `APPEND_SYSTEM.md`, and never searches `PATH` for `claude` (`bridge@5.0.3/src/claude-executable.ts#L25-L28`). Its only configuration is `claude-bridge.json` in the Pi agent directory (`bridge@5.0.3/src/config.ts#L322-L328`), plus an explicitly configured executable; with none, it falls back to the SDK's bundled default binary. It does not change Claude Code's own setting sources, so Claude Code is still expected to load `CLAUDE.md` (E-7). Consequences for jobs: the A-042 fallback applies (the project's `AGENTS.md`, if present, goes into the Limen context message), and the launcher passes the Claude Code path and the bridge settings explicitly, from a location the agents' account cannot write (A-025). | A-042, A-086, A-025 | yes for the bridge; `CLAUDE.md` in isolated mode is a seat check (item 12) |
| E-16 | How a Limen custom message reaches the coordinator (A-034, revision 4) | `pi.sendMessage(msg, { deliverAs: "followUp", triggerTurn: true })`: when the session is idle, Pi starts a new run with the message (`pi-coding-agent@1.5.1/dist/core/agent-session.js#L1946-L1972`, `sendCustomMessage` → `_startRun`; held until `agent_settled` has been emitted when it arrives during that event); when a run is active, the message goes to the follow-up queue (`agent.followUp`) and enters only when the agent would otherwise stop, i.e. after the current turn's tool calls and steers (`pi-agent-core@1.5.1/dist/agent-loop.js#L196-L202`), in the same run. This matches today's wake semantics (`hook/wake.ts:442-446`: `sendUserMessage` when idle, `deliverAs: "followUp"` when busy) and the pattern of `hook/group-peer.ts:132-135`. The message is stored with role `custom`, so the session's `user` entries stay Adrian's own. | A-034, T-16, T-05 | yes (code) |
| E-17 | What Pi does on SIGTERM and SIGHUP in the mode Limen runs (R-028; the main session, 2026-11-22) | Limen runs Pi with `--mode json`, its print mode, which handles SIGTERM and SIGHUP (`pi-coding-agent@1.5.1/dist/modes/print-mode.js#L34-L54`): each signal first kills Pi's tracked detached children; the first one then disposes the runtime and exits 143 (TERM) or 129 (HUP), and a second one exits at once. Print mode has no SIGINT handler. The bash tool starts each command detached on Linux (`pi-coding-agent@1.5.1/dist/core/tools/bash.js#L77`), so a TERM to Pi's process group does not reach a tool's group, and Pi's handler kills it. The wrapper therefore sees the engine end with code 143 and no signal after a TERM, while a SIGKILL (an OOM kill) arrives as the signal. | A-020, A-052 | yes (code) |
| E-18 | What `systemctl --user is-active` exits with for a unit that is not loaded (R-026; the seat, 2026-11-25) | On the seat's systemd 259 (259.9-0ubuntu0.1), `is-active` of a name that never existed, and of a transient scope that ended and was collected, prints `inactive` and exits 4, not 3 as `src/platform/linux.ts` (`NOT_ACTIVE = 3`, line 52 at `a0.3.0`) assumes. | A-029, A-005 | yes (seat steps 3.1 and 3.2, `## State`, "`limen-rebuild-33`") |
| E-19 | How Pi runs the tool calls of one assistant message (R-036; the seat and the package source, 2026-11-25) | In parallel by default (`toolExecution ?? "parallel"`, `pi-agent-core@1.5.1/dist/agent.js#L147`): `executeToolCallsParallel` (`dist/agent-loop.js`) emits every `tool_execution_start` first, then each `tool_execution_end` as its tool finishes, so a tool can end while another of its message still runs. | A-059 | yes (code; the seat's first stall trial, `## State`, "`limen-rebuild-33`") |

**Consequences (main session, 2026-11-17).**
- **A-086 (critical, `fix`; Adrian, gate 2 revision 2):** E-1 means that on the seat's only route Limen's role
  prompts and coordinator manual are silently absent, while the fake-engine tests pass. Limen's standing instructions
  move to the **Limen context message**: one user-role message at session start, frozen for the session, saved in the
  job directory and re-sent after every compaction (E-13, E-14). Limen stops appending to Pi's system prompt. A-037,
  A-038, A-042, A-051 and A-079 changed with it.
- **Job text and the handoff note (Adrian, gate 2 revision 3):** every injected message arrives as `user`; only tool
  results have another role. So a wake carries only a header computed by Limen, and the coordinator fetches job
  content and the handoff note with a command, as a tool result (A-008, A-009, A-078).
- The stage 1 measurement of fixed context counts system-prompt text that the seat's model never receives; the
  per-turn cue (E-1) does reach it. Today's baseline is "no system-prompt prose, per-turn cue": every before/after
  comparison of prompt-driven behaviour compares it with "Limen context message plus the A-077 cue" and says so (gate
  2 §2, Measurement; revision 4).
- **Owner messages (Adrian, gate 2 revision 4):** every message Limen injects into the coordinator's session (wakes,
  the context message, digests, notices) is a Pi custom message (`limen-*` type, `followUp`, `triggerTurn`, E-16),
  never `sendUserMessage`; an owner message is a Pi session entry with role `user`, decided by one function for A-034,
  T-05 and T-16.
- Within decisions already taken (no new choice): jobs drop `--approve` and add `--offline`, `CLAUDE_BRIDGE_ISOLATED=1`
  (with its consequences in E-15 and D-005) and a private `TMPDIR` or `JITI_FS_CACHE=0` (A-025, E-3, E-4); the T1 allow-list is the only environment filter,
  because the bridge forwards everything (A-004, E-4); read-only roles get a non-empty Pi `--tools` allowlist (A-081,
  E-5); the reset time is taken from `kendex:rate-limit` when present, otherwise from `errorMessage` (A-016, E-9).

**Seat measurement B.1 (Adrian, 2026-11-17, on `rebuild-base`; raw logs stay on the seat).** E-1, E-2, E-5, E-8, E-10
and E-13 above carry its results. Consequences: a Pi compaction rewrites the Claude Code session anyway, so sending the
Limen context message again after a compaction (A-086, E-13) costs only its own length; the thresholds of A-034 use
the window of 1,000,000 tokens; the reference for A-078 (M-03) is a coordinator cache read of about 297k–313k tokens
per request in the M1 transcripts.

## System requirements

What the seat must provide; R-020 declares it in the platform adapter (T-12), `limen init` and the coordinator start
check it, and a missing tool or another version exits with code 4 naming both versions (T-32 (3), D-017).

| Requirement | Version or check | Declared and checked by | Installed by |
|---|---|---|---|
| Node.js | ≥ 24 (root 24, agents' account 26 on the seat) | R-020 | the seat |
| git | supports `git worktree list --porcelain -z` (git ≥ 2.36), checked as a feature (note R-020) | R-020 | the seat |
| tar, ps and the other tools R-020 finds in use | present | R-020 | the seat |
| Pi (`@earendil-works/pi-coding-agent`) | 1.5.1 | R-020; another version refused at coordinator start and spawn by R-049 | root, seat script (5.3) |
| Claude bridge (`@vanillagreen/pi-claude-bridge`) | 5.0.3 | R-020; R-049 | root, seat script (5.3) |
| Claude Code | the version Adrian pins at installation (5.3), recorded here then; updated only by the seat script after the contracts pass | R-049 (D-017); the bridge gets its path (R-048) | root, in a root directory (5.3); the agents' copy removed (5.20) |
| systemd user instance with lingering | scopes and timers work (`systemd-run --user --scope true`); `systemd-analyze` present, which verifies the sweep's units at `--install` (R-032 F9) | R-026, R-032 | root enables lingering (3.1) |
| Herdr | 0.9.3 on the seat | R-020 (T-12: tools found in use) | the seat |
| setfacl, systemd-analyze, systemctl (system manager) | present for root: the alerts' install grants ACLs, verifies and enables system units | R-033 (`SEAT_TOOLS` in `seat/alerts.ts`) | the seat (Ubuntu's `acl` and `systemd`) |

## Stages

Nine stages. Each ends with a working Limen and a local tag `aMAJOR.MINOR.PATCH`: the main session closes the stage
(below) and creates the tag in its clone; Adrian deploys it by `## Deployment`, where root tags the same commit in
`/opt/limen`. A fix after gate 5.N is a PATCH tag of the same stage. The order follows the priorities and the
dependencies:
- what the seat does not use goes first (G1), so that no ticket rebuilds code that is then cut;
- the foundations every subsequent ticket uses (errors, the command registry, the record);
- priority 1 by harm: loss of work (stage 3), instructions that never reach the model (stage 4, A-086), the trust
  boundary (stage 5);
- determinism (stage 6), autonomy (stage 7), the optional modules (stage 8), the cross-cutting cleanup (stage 9).

Stage 4 comes after stage 3 because it changes prompt-driven behaviour, which is measured on the seat (M-05) against
today's baseline "no system-prompt prose, per-turn cue". Stages 1–3 change no standing instruction that reaches the
model on the seat: the `jg` cue that R-009 cuts never fired there (no `jg` on the seat, T-36), and their edits of role
texts sit in Pi's system prompt, which the bridge drops (E-1). The wake and refusal texts they add are outputs of
mechanisms and are checked by the mechanisms' tests.

Conventions for every ticket:
- One commit `R-NNN: <title>` per ticket on `adrian-rebuild`, pushed at once; it also holds the ticket's `changes.md`
  entry and its status `done` (D-009). A fix after the push is a new ticket with a new number.
- A change of mechanism starts with a test that fails before it (T-28 (4)).
- `Mig. yes`: an on-disk change (`spec/`, `.limen/`, file names, hooks loaded by projects) comes with a script and a
  test on a fixture; a CLI change makes the old form exit with code 2 and name the new form in `next`, tested on a
  fixture (T-18; before R-013, a non-zero exit with the replacement in the message). The rollback of a format change is
  the snapshot of `## Deployment` 0.1, not a reverse script.
- From R-021, `record.json` changes additively: a new field is optional for older records; only a breaking change
  raises the schema version, and then the migration upgrades every older version (one fixture per version).
- A scan that cannot hold at once over the author's code (`catch`, casts, `biome-ignore`, test file names) starts as a
  ratchet: a baseline count in the repo that may only fall; R-082 and R-083 bring the counts to zero (T-27).
- Tests removed together with a cut feature are named in the outcome; the gate condition is "no new failure", not a
  fixed test count.
- Role prompt text changes in the ticket whose mechanism it describes (A-085: one copy of each fact); R-046 sets the
  shape, and the tickets after it keep that shape.
- A ticket whose `API` column is not `—` has a step in `## Deployment` that names it (T-28 (5)).

### Closing a stage

When every ticket of the stage is `done` or `dropped`, the main session:
1. runs the gate (D-001) and `check.mjs` on the last commit; both exit 0;
2. records M-10 (the gate's run time) and, from stage 4 on, M-01 (fixed context per role) in `evidence/`;
3. updates `## State`, commits `Stage N: close` and pushes;
4. creates the local tag (`a0.N.0`, `a1.0.0` for stage 9) on that commit;
5. writes the gate summary in its reply to Adrian: the verdict, the decisions he has to take, the tickets, the findings
   closed, the changes marked `unmeasured`, the fixed context before and after, the tag with its full SHA (the argument of `## Deployment` 0.2), and
   the deployment steps of the stage.

Adrian decides: go on, a fix, or a change of the plan. A fix is a ticket in the same stage and a PATCH tag. The seat
steps and the seat measurements are Adrian's; the next stage does not wait for them unless he says so. When a seat
step fails, Adrian chooses the rollback of 0.7 or a fix. The next stage starts in a new session.

### Cost and effect per stage

Adrian's cost per stage: the pair tickets he works on by day, the decisions the plan already expects from him, and
the seat steps of `## Deployment`: the stage's own steps N.0–N.k, where N.0 is the deployment by 0.1–0.3, plus the
measurements before (B.1 and B.2 before a0.1.0, B.3 after a0.2.0). Delegated tickets may also stop with `BLOCKED`
questions; their number cannot be known in advance.

| Stage | Tag | Tickets: S / M / L | Pair (Run) | Expected decisions | Seat steps |
|---|---|---|---|---|---|
| 1 | a0.1.0 | 17: 6 / 4 / 7 | 2: R-014, R-088 (day-after) | 4: gate 5.1; the golden help of R-014 (the wording is set by T-19, Adrian confirms the output); the same-task ticket before B.2 (R-011); the leftover list before `--drop-leftovers` (1.1) | 4 (1.0 bootstrap), plus B.1 and B.2 before it |
| 2 | a0.2.0 | 12: 0 / 10 / 2 | 0 | 3: gate 5.2; id collisions in the record migration report (2.1); the `LIMEN_*` variables to remove (2.4) | 5, plus B.3 |
| 3 | a0.3.0 | 13: 0 / 9 / 4 | 0 | 3, plus one per unlanded job: gate 5.3; the account names (3.3); `continue` or `abandon` for each finished job with unlanded work (3.6) | 12 |
| 4 | a0.4.0 | 16: 6 / 8 / 2 | 2: R-041, R-046 (day-after) | 4: gate 5.4; the cue wording (R-041); the role prompt texts and their glossary of terms (T-14, R-046); the modules to switch on (4.9) | 14 |
| 5 | a0.5.0 | 13: 0 / 9 / 4 | 0 | 3: gate 5.5; the owner channel's key, forced command and tokens (5.1); the domains added to the egress list (5.16) | 21 |
| 6 | a0.6.0 | 7: 0 / 1 / 6 | 3: R-065, R-066, R-068 (day-after) | 5: gate 5.6; the refusal and message texts of the ticket commands (R-065); the board, and which old prose sections go to `docs/` (R-066, 6.4); the question blocks (R-068); the `limen init` values (6.1) | 5 |
| 7 | a0.7.0 | 9: 3 / 4 / 2 | 1: R-073 (day-after) | 2: gate 5.7; the footer wording (R-073) | 6 |
| 8 | a0.8.0 | 4: 1 / 1 / 2 | 0 | 2: gate 5.8; whether to switch on groups and research (8.1, 8.2) | 3 |
| 9 | a1.0.0 | 6: 2 / 3 / 1 | 2: R-081 (day-after), R-085 (day) | 3: gate 5.9; the docs and `SECURITY.md` text (R-081); the final help (R-085) | 2 |

What changes in daily work on the seat once the stage's tag is deployed:

| Stage | Change |
|---|---|
| 1 | Cut commands and flags refuse with a pointer (`--tab`, `highlight`, `ticket-author`, `wait`, `ticket series`, `continue --review`, webhooks, Devin, Linear, OMP, scout). Every command ends with a JSON line and exits with a failure-class code; `limen --help` is the grouped help; `limen jobs` is `limen status --all` and `limen show <id>`, `limen queue` is `limen seat queue`. Tags deploy through `seat/deploy.ts`. |
| 2 | Job records live in `record.json` (migrated once). A job is named by its full id or its final token of 8 hex characters, never by a label (T-20, R-022). `LIMEN_*` settings in the environment no longer apply, except the exceptions of D-052, which `limen status` names with the ticket that ends each (R-015). `limen stats` reports from the records. |
| 3 | Unlanded work is never pruned or retired: `limen abandon <id>` keeps it on a branch, and spawn refuses while such a job is unresolved. Reads never reap; `limen seat sweep` on a timer finalises dead jobs every minute (A-024, R-032). After a 5-hour limit, jobs resume by themselves 5 minutes after the reset, with no seat rule and no manual resume. Job failures and long start-queue waits ring the phone (escalations from stage 7). A `limen land` that stopped half-way continues when it runs again. Jobs see only allow-listed environment variables, and git and gh in a job hold no credential (T1, R-087). |
| 4 | The models get Limen's instructions for the first time (coordinator manual, role prompts), so their behaviour changes (measured by M-05). The turn cue no longer demands English: its audience line names the language (T-13). Jobs end without the task-note turn; a read-only role that writes fails; a `sleep` of 30 s or more is refused in the coordinator (T-34, R-047); modules are off unless switched on in `limits.json`. |
| 5 | Coordinators start only through the root start script. Jobs run the bridge isolated and reach only allow-listed domains. The owner channel publishes `main`, so Adrian stops pushing; owner files change only through the owner channel. Wakes carry a header, and the coordinator reads a result with `limen show <id> --result` (A-008, R-051); the handoff note goes through a tool; a hand commit on `main` is refused. |
| 6 | Tickets move through `limen ticket start`, `drop` and `commit`; the board is generated, with no hand edits; `limen ticket check` is strict. `maxJobs`, the routes and the gate command come from `limits.json` and `routes.json`; the round limit is stored there and used from stage 7. Limen runs every `Check` when a job ends; the review verdict is parsed; questions go through `limen ask` and `limen answer`. Land itself is as before. |
| 7 | `limen spawn <role> <FNNN>` (`FNNN`: the ticket's number) builds the task and the label (`--label` and free task text refuse). Review rounds are bounded and end in `limen escalate`; Limen files the review reports; land happens only when the conditions in code hold, with no "land" from Adrian. `limen decide` records his decisions; a footer follows every coordinator reply; `needs-adam` is gone. |
| 8 | Groups, research, the quality pass and the Picture data exist only when switched on. |
| 9 | The docs and `SECURITY.md` describe the code; old command names are unknown commands (exit code 2, with no pointer). |

### Stage 1 — Cut, then one error type and one command registry (a0.1.0)

Remove the features cut at gate 2 (G1, §6) and the author's working history (T-39) before any rewrite. The seat flow
(detached jobs, review, land, the GitHub module) works as before; cut commands refuse with a pointer, and `limen status`
lists the leftover files of cut features. The root deployment script (D-008) deploys every tag from a0.1.0 on. The
same-task runner can run the "before" measurement on `rebuild-base`. Then the two foundations the registry needs: one
error type with exit codes as failure classes and a final JSON line (R-013), and one command registry with the help in
groups (R-014, `pair`, by day after the night run of the cuts, D-011); R-013 comes after the cuts (D-028). R-088
fixes the same-task runner before B.2 (D-027). After gate 5.1, two fix tickets (D-046): R-091 marks every Pi event
type in the runner before B.2, and R-090 makes the deployment script name what it checked and refuse a registry
without a project; the first deployment is their tag `a0.1.1`. Tickets R-001–R-014, R-088, R-090 and R-091.

### Stage 2 — Foundations (a0.2.0)

The shared mechanisms every subsequent ticket builds on, next to the error type and the registry of stage 1: one
configuration reader, validated boundary data, one Pi API adapter, atomic writes, one lock
module, a Linux platform adapter, one `record.json` per job written only by the transition function, exact job
references, thin commands over domain operations, `limen stats`, and test coverage derived from the registry. The
records of both projects migrate; `limen stats` reads the migrated history. The final line's `code` and `next` take
`null` (R-089, D-045, D-046). Tickets R-015–R-025 and R-089.

### Stage 3 — Work is never lost (a0.3.0)

No unlanded work is deleted; every job runs in its own scope; every failure has a recorded kind; a seat timer finds and
finishes dead jobs; a quota limit ends in one automatic resume; land is a sequence of recorded, repeatable steps; the
owner gets alerts for failures and escalations only; jobs run with an allow-listed environment and no credential (T1,
moved here from stage 5 by D-012). Tickets R-026–R-037, R-087, R-098 and R-100 (D-072, D-080).

### Stage 4 — Limen's instructions reach the model (a0.4.0)

Closes A-086: one Limen context message per session, frozen, saved and sent again after compaction, tested on a fake
engine that shows the model's view under the bridge; the turn cue keeps only variable parts; role texts come from the
package and are literal, sourced and budgeted per role. Tickets R-038–R-047, and from gate 5.3 (D-107) the fixes
R-104 (the daily prune and the start queue) and R-105 (the T-04 and T-26 scans), from D-110 R-106 (the `main` watcher,
§7 D1 per project), and from D-112 the fixes R-107–R-109 of the close of stage 3 on the seat.

### Stage 5 — The trust boundary (a0.5.0)

G2 in code and in seat tooling (T1 came in stage 3): jobs run the bridge isolated, only root-owned code for agents,
one registered coordinator, Limen's messages as custom messages and job or GitHub text only as tool results, the owner
files and the published copy, publication of `main` by the owner channel, egress allow-list templates, and seat code
under the same checks as the rest. Until R-071, land is decided as at `rebuild-base` (the coordinator lands after
Adrian's word, D-004); the owner channel publishes those lands under the coverage rule, which is no weaker than today,
where Adrian pushes them by hand without reviewing them (gate 2 §1). Tickets R-048–R-060.

### Stage 6 — The parts of land by conditions (a0.6.0)

The parts that G3 and G4 need: tickets and the board in a core spec module; owner settings in `limits.json` and
`routes.json`; typed acceptance that Limen runs; a parsed verdict on the exact tip; ticket commands and a generated
board; typed questions. Land itself stays as at `rebuild-base` until stage 7. Tickets R-061–R-066 and R-068.

### Stage 7 — Land by conditions and the owner's conversation (a0.7.0)

G3 and G4 complete: bounded review rounds with escalation, reports filed by Limen, the task and the label built by
code, and land only on code-checked conditions. Then owner decisions with a checked quote, the footer and `limen
status` from one renderer, the ticket that records an answered question in `docs/`, the migration of `needs-adam`, and
owner touchpoints in `limen stats`. Tickets R-067 and R-069–R-076.

### Stage 8 — Optional modules (a0.8.0)

Groups, research, the quality pass and the Picture data, each with its gate-2 changes, off by default. Tickets
R-077–R-080.

### Stage 9 — Names, docs and debt (a1.0.0)

Docs and `SECURITY.md` written from the code, the ratchets at zero, test files named after their subject, comments that
resolve, the table of old command names removed, and the context-message budgets set by the final measurement. a1.0.0
is the tag of the finished rebuild (stage 6 of the rebuild prompt). Tickets R-081–R-086.

## Tickets

Columns:
- **Stage**: the stage of `## Stages`.
- **Sources**: findings (A-NNN), taste rules (T-NN), gate-2 items (G1.N, G2–G4, §N, S1+, H-NN), engine facts (E-N) and
  decisions (D-NNN).
- **Depends**: tickets that must be done first, of the same or an earlier stage; `check.mjs` rejects a cycle.
- **Size**: S (one module), M (a few modules), L (a subsystem).
- **Mode**: `delegated` (the `rebuild-implementer` subagent) or `pair` (the main session with Adrian), see
  `## Agents`.
- **Run**: `night` for a delegated ticket, which a night run can take without Adrian; `day-after` for a pair ticket
  that depends, directly or through other tickets, on a night ticket of its stage, so it runs by day after that night run; `day` for a pair ticket with no
  such dependency, by day before or after the night run; `night` also for a pair ticket whose `ticket.md` → `## Decisions`
  holds Adrian's dated answers to its variants sheet (D-054 (3)). No delegated ticket depends on a pair ticket of its own
  stage (D-011); `check.mjs` checks the column against the dependencies and, for a night pair ticket, the dated entry.
- **Mig.**: `yes` when the ticket needs a migration path (`## Stages` → conventions).
- **API**: Pi, bridge, Herdr or systemd behaviour that the fake engine cannot prove.
- **Seat**: the `## Deployment` steps that verify it on the seat.
- **Status**: `planned`, `ready` (a night run may take it, D-054 (1): its `ticket.md` exists, or, while a dependency
  is not `done`, the status is `ready (D-NNN, …)` and names the entries of `## Decisions` that hold what it needs, each
  naming the ticket), `active`, `blocked` (a night run's question waits for Adrian in `.night/questions.md`, the night
  mode of the rebuild prompt v6; the day session resumes the ticket), `done`, or `dropped (<reason>)` by Adrian's
  decision. `check.mjs` checks the record of `ready`, and that every criterion of a `ready` or `active` ticket that is
  no judgment names a command with its exit code that the allow-list of `.claude/settings.local.json` passes
  (`tools/ticket-rules.mjs`).

| ID | Title | Stage | Sources | Depends | Size | Mode | Run | Mig. | API | Seat | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| R-001 | Leftover files of cut features are listed and can be dropped | 1 | A-042 | R-010 | S | delegated | night | — | — | — | done |
| R-002 | Cut finish webhooks, coordinator signals and the finish ping | 1 | G1.3, A-027, A-060, A-076 | R-001 | L | delegated | night | yes | — | — | done |
| R-003 | Cut Devin and the Linear mirror | 1 | G1.5, G1.6, A-049 | R-001 | M | delegated | night | yes | — | — | done |
| R-004 | Cut the OMP engine | 1 | G1.7, A-049 | R-001 | L | delegated | night | yes | — | — | done |
| R-005 | Cut hosted `--tab` jobs; the GitHub module and groups run detached | 1 | G1.8, A-023 | R-001 | L | delegated | night | yes | herdr | 1.2, 1.3 | done |
| R-006 | Cut private planning, `highlight`, `ticket-author`, `wait`, `ticket series`, `continue --review` and `group status --json` | 1 | G1.12, T-18, T-37, A-079 | R-001 | M | delegated | night | yes | — | — | done |
| R-007 | Cut the Picture viewer and the map jobs | 1 | G1.4, §6, A-048, A-088, D-034 | R-001 | L | delegated | night | yes | — | — | done |
| R-008 | Cut the macOS branches | 1 | A-083 | — | S | delegated | night | — | — | — | done |
| R-009 | Cut the scout role and the `jg` cue | 1 | T-33, T-36, A-081 | R-001 | S | delegated | night | yes | — | — | done |
| R-010 | The author's working history leaves the tree; Limen's own test-line cap goes | 1 | T-39, T-11, §6 | — | M | delegated | night | — | — | — | done |
| R-011 | The same-task runner and the gate-time tool | 1 | H-21, T-11, T-41, §2, D-021 | — | L | delegated | night | — | pi | B.2 | done |
| R-012 | A root deployment script for a pinned SHA | 1 | D-008, D-010, §7 | R-002 | M | delegated | night | — | — | 1.0 | done |
| R-013 | One error type, exit codes as failure classes, a final JSON line | 1 | T-01, T-02, D-022, D-028 | R-002, R-003, R-004, R-005, R-006, R-007, R-009 | L | delegated | night | yes | — | — | done |
| R-014 | One command registry, a shared parser and generated help | 1 | T-19, T-18, T-26, T-37, D-028, D-037, D-038, D-039, D-040, D-041, D-042, D-043, D-044 | R-002, R-003, R-004, R-005, R-006, R-007, R-009, R-013 | L | pair | day-after | yes | — | — | done |
| R-088 | The same-task runner leaves no job running after an attempt | 1 | D-027, D-021 | R-011 | S | pair | day-after | — | pi | B.2 | done |
| R-091 | The same-task runner refuses an unmarked Pi event and states its touchpoint definition | 1 | D-045, D-046, D-021, H-21 | R-011 | S | delegated | night | — | pi | B.2 | done |
| R-090 | The deployment script names what it checked; a registry without a project refuses | 1 | D-045, D-046, D-008, §7 | R-012 | S | delegated | night | — | — | 1.0 | done |
| R-089 | The final line's `code` and `next` are a value or `null`; `next` is always a command | 2 | T-37, T-02, D-045, D-046 | R-014 | M | delegated | night | — | — | — | done |
| R-015 | One configuration reader; settings come only from owner files | 2 | T-03 | R-014 | M | delegated | night | yes | — | — | done |
| R-016 | One boundary parsing module with validators; the cast ratchet | 2 | T-27 | R-013 | M | delegated | night | — | — | — | done |
| R-017 | One Pi API adapter with type guards, checked against Pi's real types | 2 | T-32, D-055, D-058 | R-012, R-016 | M | delegated | night | — | pi | 2.2 | done |
| R-018 | One atomic-write module | 2 | A-022, T-25 | R-013 | L | delegated | night | — | — | — | done |
| R-019 | One lock module with process identity and a bounded wait | 2 | A-017, A-018, A-055, A-058, A-087, T-25, D-029, D-056 | R-018, R-020 | M | delegated | night | yes | — | — | done |
| R-020 | A Linux platform adapter and declared system requirements | 2 | A-083, T-12, T-32, D-060 | R-013 | M | delegated | night | — | — | — | done |
| R-021 | One `record.json` per job, written only by the transition function | 2 | S1+, A-019, A-053, A-056, T-20, T-25, D-057 | R-016, R-018, R-019 | L | delegated | night | yes | — | — | done |
| R-022 | Exact job references through one resolver | 2 | T-20, D-061 | R-014, R-021 | M | delegated | night | yes | — | — | done |
| R-023 | Commands are thin adapters over domain operations | 2 | T-26, D-044, D-045, D-046, D-061 | R-014, R-021, R-089 | M | delegated | night | — | — | — | done |
| R-092 | A refusal leaves no trace: `validate` then `apply` | 2 | T-38, D-061, D-070 | R-021, R-023 | L | delegated | night | — | — | — | done |
| R-093 | The round-3 notes of R-019 and R-021: the migration keeps `born`, guarded hook reads | 2 | T-25, T-02, T-30, D-062, D-063 | R-019, R-021, R-022 | S | delegated | night | — | — | — | done |
| R-094 | A queued wrapper ends when its job folder is gone; tests stop their wrappers | 2 | T-01, T-29, D-063 | R-093 | S | delegated | night | — | — | — | done |
| R-095 | The round-3 notes of R-022 and R-094: the shared-token report, `keeper`'s de-duplication, the record check | 2 | T-01, T-29, T-30, D-065 | R-022, R-094 | S | delegated | night | — | — | — | done |
| R-096 | One wake per event: the extra wake of the held-gate queue test, found and removed | 2 | T-29, D-067 | R-023, R-095 | S | delegated | night | — | — | — | done |
| R-097 | A failure on the subscription limit is `quota`, in the migration and at finalize | 2 | A-016, D-057, D-071 | R-021 | S | delegated | night | — | — | 2.3 | done |
| R-099 | The round-3 notes of R-092: a stale handoff gate, the class of an incomplete stop, the snapshot's git | 2 | T-38, T-02, D-077 | R-092 | S | delegated | night | — | — | — | done |
| R-024 | `limen stats` over records and transcripts | 2 | H-01, H-20, §2, T-33, D-072, D-073 | R-021, R-023 | M | delegated | night | — | pi | 2.3 | done |
| R-025 | Test coverage derived from the command registry | 2 | T-28, T-29, D-045, D-046, D-075, D-076 | R-014, R-023, R-092 | M | delegated | night | — | — | — | done |
| R-026 | Every job runs in its own systemd user scope | 3 | A-029, A-052, T-43 | R-020, R-021 | L | delegated | night | — | systemd | 3.2, 3.7, 3.8 | done |
| R-027 | The reaper ends a job only after its process group is gone | 3 | A-005, A-056 | R-026 | M | delegated | night | — | systemd | 3.2 | done |
| R-028 | SIGTERM reaches the engine; a signal without a stop request is a failure | 3 | A-020, A-052 | R-026 | M | delegated | night | — | pi | 3.8 | done |
| R-029 | One recorded failure cause per job | 3 | A-016, E-9, T-31, T-32, D-055, D-095 | R-017, R-021, R-100 | M | delegated | night | — | bridge | 3.4 | done |
| R-030 | Unlanded work survives: `limen abandon`, a guarded prune, a refusing spawn | 3 | A-001 | R-023, R-092 | M | delegated | night | yes | herdr | 3.6 | done |
| R-031 | `landed` and `abandoned` markers; retire moves records to the archive | 3 | A-002, §6 | R-030 | L | delegated | night | yes | — | 3.6 | done |
| R-032 | `limen seat sweep` runs on a timer; read commands never write or wait | 3 | A-024, T-04, T-18, A-017, §6, D-045 | R-012, R-027, R-031 | L | delegated | night | yes | systemd | 3.1 | done |
| R-033 | Alerts from their own account: failures and escalations only | 3 | A-066, A-054, T-18, D-084, D-085 | R-021 | L | delegated | night | yes | systemd | 3.3 | done |
| R-034 | Resume after the quota limit in code | 3 | A-016, A-068, §6, D-094, D-097, D-100 | R-029, R-032, R-033 | L | delegated | night | yes | pi, systemd | 3.4 | done |
| R-035 | Start-queue thresholds: a diagnosis at 30 min, a failure at 2 h | 3 | A-036 | R-026, R-033 | L | delegated | night | — | systemd | 3.8 | done |
| R-036 | Stall is measured over the whole job scope | 3 | A-059 | R-026 | M | delegated | night | — | systemd | 3.8 | done |
| R-037 | The closing commit of land and `ticket done` is atomic | 3 | A-021, A-057, T-38, D-094 | R-023, R-031, R-092 | M | delegated | night | — | — | — | done |
| R-087 | The job environment is an allow-list; git and gh in a job hold no credential (T1) | 3 | A-004, A-061, E-4, D-017 | R-015, R-021, R-026 | M | delegated | night | — | pi, bridge | 3.10 | done |
| R-098 | `limen stats` per landed ticket and per coordinator turn | 3 | §2, A-078, A-037, D-072, D-098 | R-024, R-031 | M | delegated | night | — | pi | B.3, B.4 | done |
| R-100 | One definition of the ISO time, the 429 rule, the error-code check and the jobs listing | 3 | T-25, D-080 | R-022, R-093, R-097 | S | delegated | night | — | — | — | done |
| R-101 | Prune, retire and leftover Herdr tabs are steps of the sweep; nothing is deleted | 3 | A-024, A-002, T-18, T-28, D-092, D-094, D-096, D-097 | R-032 | M | delegated | night | yes | herdr | 3.9 | done |
| R-102 | Seat rules are cut | 3 | A-010, T-42, D-094, D-097 | R-034 | M | delegated | night | yes | systemd | 3.5 | done |
| R-103 | Land runs as recorded steps; its `cleaned` step closes the job's Herdr tabs | 3 | A-021, T-04, T-18, T-28, T-38, D-092, D-094, D-096 | R-037 | L | delegated | night | yes | herdr | 3.9 | done |
| R-038 | The fake engine shows the model's view under the bridge | 4 | T-31, A-051 | R-017 | M | delegated | night | — | bridge | 4.1 | planned |
| R-039 | The Limen context message: one per session, frozen, saved, sent again after compaction | 4 | A-086, A-037, A-079, A-051, T-36, E-13, E-16 | R-021, R-038 | L | delegated | night | yes | pi, bridge | 4.2 | planned |
| R-040 | Role texts come from the package, in three registers | 4 | A-038, A-039, A-042, D-005 | R-001, R-039 | M | delegated | night | yes | — | — | planned |
| R-041 | The turn cue holds only variable parts and the audience line | 4 | A-077, T-13 | R-039 | S | pair | day-after | — | pi | 4.4 | planned |
| R-042 | The task-note mechanism is cut | 4 | A-044, A-059 | R-039 | M | delegated | night | yes | — | — | planned |
| R-043 | Just-in-time reminders arrive in the triggering tool result | 4 | A-041, H-12 | R-039 | M | delegated | night | — | pi | 4.5 | planned |
| R-044 | Module switches; hooks load by role and module | 4 | G1.10, G1.1, G1.2, G1.9, A-082, A-040 | R-015, R-039 | M | delegated | night | yes | pi | 4.7, 4.9 | planned |
| R-045 | Tools and skills per role; a read-only role that writes fails | 4 | A-081, E-5 | R-044 | M | delegated | night | — | pi, bridge | 4.3 | planned |
| R-046 | Role prompts are literal, sourced and budgeted | 4 | T-09, T-14, T-15, T-08, T-10, T-21, A-043, A-085, A-040 | R-040, R-041, R-042, R-044 | L | pair | day-after | — | — | — | planned |
| R-047 | The coordinator never waits | 4 | T-34 | R-039 | S | delegated | night | — | pi | 4.6 | planned |
| R-104 | The sweep's daily prune archives every unregistered folder and waits on no job's lock; a queue entry is live only for a project's job | 4 | A-002, A-024, T-25, D-107 | R-101 | M | delegated | night | — | — | — | planned |
| R-105 | The T-04 and T-26 scans follow what their rules name | 4 | T-04, T-26, D-107 | R-032 | M | delegated | night | — | — | — | planned |
| R-106 | A watcher outside the agents' account keeps a copy of `main` and alerts on its forced update or deletion | 4 | A-006, §7, D-110 | R-033 | S | delegated | night | — | systemd | 4.10 | planned |
| R-107 | The exit 4 of systemd 259's `is-active` reads as not active | 4 | A-029, E-18, D-112 | R-026 | S | delegated | night | — | systemd | 4.13 | planned |
| R-108 | The stall rule follows every pending tool of a message | 4 | A-059, E-19, D-112 | R-036 | S | delegated | night | — | pi | 4.12 | planned |
| R-109 | The alerts' unit sends over IPv4 first | 4 | A-066, D-108, D-112 | R-033 | S | delegated | night | — | systemd | 4.11 | planned |
| R-048 | Jobs run the bridge isolated: no `--approve`, `--offline`, a private `TMPDIR`, an explicit Claude Code path | 5 | A-025, E-3, E-4, E-15, D-005, D-017 | R-040, R-087 | M | delegated | night | — | pi, bridge | 5.8, 5.9 | planned |
| R-049 | Agents run only root-owned code; Pi, bridge and Claude Code versions are declared | 5 | A-025, T-32, T-36, D-017 | R-017, R-020, R-048 | L | delegated | night | yes | pi | 5.3, 5.5, 5.6, 5.10, 5.20 | planned |
| R-050 | The registered coordinator and its start script | 5 | A-033, A-061, A-029, §2, D-017 | R-026, R-033, R-034, R-049 | L | delegated | night | yes | pi, herdr, systemd | 5.4, 5.11, 5.20 | planned |
| R-051 | Wakes carry a computed header; Limen's messages are custom messages | 5 | A-008, A-078, A-034, T-16, E-16 | R-039, R-050 | M | delegated | night | — | pi | 5.12 | planned |
| R-052 | The handoff note goes through a registered tool | 5 | A-009, A-034, A-047 | R-051 | M | delegated | night | yes | pi | 5.13 | planned |
| R-053 | Steer entries carry an envelope; only the coordinator steers | 5 | A-028 | R-050 | M | delegated | night | yes | pi | 5.14 | planned |
| R-054 | The published copy and the owner files | 5 | A-011, §2 | R-103, R-050 | L | delegated | night | yes | — | — | planned |
| R-055 | The owner channel publishes `main` by the coverage rule; `hold` and `replay` | 5 | A-006, T-22, §7 | R-031, R-054 | L | delegated | night | yes | systemd | 5.1, 5.2, 5.15 | planned |
| R-056 | Egress allow-list templates for the agents' account | 5 | G2, A-004 | R-012, R-048 | M | delegated | night | — | systemd | 5.16 | planned |
| R-057 | The GitHub poller keeps its own state and authorises fork pull requests | 5 | A-003, A-062, A-063, A-018 | R-005, R-019 | M | delegated | night | yes | systemd | 5.17 | planned |
| R-058 | GitHub text reaches the coordinator only as a tool result | 5 | A-007, A-026 | R-051, R-057 | M | delegated | night | — | — | — | planned |
| R-059 | Seat code is typed, linted and tested in `seat/`; one usage poller | 5 | A-047, A-016, A-067 | R-020, R-034 | M | delegated | night | yes | pi, systemd | 5.5, 5.18 | planned |
| R-060 | Agents create no timers; the sweep reports foreign timers and engines | 5 | T-42, A-029 | R-032, R-050 | M | delegated | night | — | pi, systemd | 5.19 | planned |
| R-061 | Tickets and the board are a core spec module with narrow parsers | 6 | A-048, T-12 | R-016, R-023 | L | delegated | night | yes | — | — | planned |
| R-062 | Owner settings in `limits.json` and `routes.json`; `limen init` asks for them | 6 | A-014, A-030, A-059, T-11, T-03 | R-015, R-054 | L | delegated | night | yes | — | — | planned |
| R-063 | Typed acceptance; Limen runs every `Check` at the tip | 6 | A-031, T-06, T-10 | R-061, R-062 | L | delegated | night | yes | — | — | planned |
| R-064 | The review verdict and findings are parsed from the reviewer's result | 6 | A-013, T-08, G4 | R-063 | M | delegated | night | — | bridge | 6.3 | planned |
| R-065 | Ticket commands: start, drop, commit, check; a generated outcome; survey tickets | 6 | A-070, A-072, T-22, T-34 | R-037, R-055, R-061 | L | pair | day-after | yes | — | — | planned |
| R-066 | The board is generated; `limen spec fix` replaces the keeper | 6 | T-23, A-045, A-072, T-18, §6 | R-065 | L | pair | day-after | yes | — | — | planned |
| R-067 | The job task and the job label are built by code | 7 | T-07, T-24, A-073, A-044 | R-063, R-065, R-069 | M | delegated | night | yes | herdr | 7.4 | planned |
| R-068 | `limen ask` and `limen answer`: typed questions in the record | 6 | T-05, T-15 | R-051, R-054, R-062 | L | pair | day-after | — | — | — | planned |
| R-069 | Review rounds per ticket and `limen escalate` | 7 | A-015, T-05 | R-055, R-064, R-068 | M | delegated | night | — | — | — | planned |
| R-070 | Limen files the review and research reports itself | 7 | A-035, A-046 | R-064, R-065 | M | delegated | night | — | — | — | planned |
| R-071 | `limen land` passes only on code-checked conditions | 7 | A-012, A-032, G3, T-40, §7 | R-063, R-064, R-069, R-070 | M | delegated | night | — | — | 7.5 | planned |
| R-072 | `limen decide`: owner decisions with a checked quote, a scope and a lifetime | 7 | A-034, T-05, T-42 | R-068 | L | delegated | night | — | pi | 7.3 | planned |
| R-073 | The footer and `limen status` share one renderer; question blocks are chat entries | 7 | T-15, T-16, T-10 | R-068, R-072 | L | pair | day-after | — | pi | 7.2 | planned |
| R-074 | An answered question opens the ticket that records it in `docs/` | 7 | T-05 | R-065, R-068 | S | delegated | night | — | — | — | planned |
| R-075 | `needs-adam` keys become open request records | 7 | T-21 | R-068 | S | delegated | night | yes | — | — | planned |
| R-076 | Owner touchpoints and questions in `limen stats` | 7 | T-40, T-05 | R-024, R-068 | S | delegated | night | — | — | — | planned |
| R-077 | Groups: state conditions, data batches, one final result, a model-free group land | 8 | G1.2, A-029, A-069, A-080, A-075, A-045, T-35 | R-044, R-071 | L | delegated | night | yes | pi | 8.1 | planned |
| R-078 | Research on its own account, with a queue scanner and quote-checked synthesis | 8 | G1.11, A-004, A-046, T-35, T-18, §6 | R-044, R-059, R-070 | L | delegated | night | — | systemd | 8.2 | planned |
| R-079 | The quality pass is a module triggered by code | 8 | G1.13, A-071 | R-044, R-071 | S | delegated | night | — | — | — | planned |
| R-080 | Picture serves record data only; `touches:` is optional | 8 | G1.4, A-048 | R-044, R-061 | M | delegated | night | yes | — | — | planned |
| R-081 | Docs from the code with generated sections; `SECURITY.md` names the boundaries and accepted risks | 9 | A-050, A-084, T-02, T-10, T-21, T-39 | R-080, R-082, R-083, R-084, R-085, R-086 | L | pair | day-after | — | — | — | planned |
| R-082 | Lint debt, casts and swallowed errors reach zero | 9 | T-27, T-01 | R-080 | M | delegated | night | — | — | — | planned |
| R-083 | Test files are named after their subject | 9 | T-29 | R-080 | M | delegated | night | — | — | — | planned |
| R-084 | Comments resolve and name no person | 9 | T-30, T-21 | R-080 | M | delegated | night | — | — | — | planned |
| R-085 | The table of old command names leaves; the final help | 9 | T-18, T-19 | R-080 | S | pair | day | yes | — | — | planned |
| R-086 | Context-message budgets from the final measurement | 9 | T-09 | R-046, R-080 | S | delegated | night | — | — | — | planned |

Taste rules with no ticket of their own:
- T-17: binds the rebuild files, not Limen; its check runs in `adrian-rebuild/tools/check.mjs` since rebuild stage 3.

Notes for the tickets (facts a ticket needs that its row cannot hold):
- R-062 (seat, 2026-11-20, trial route of `a0.1.1`): a `limen continue` started with the model `claude-opus-5-5` and
  no provider failed in 3 s with no tool call: the route counts as bridged only by its provider (`engineRoute`), so
  the job's Pi ran without the bridge and refused the model as ambiguous across providers. A continuation inherits no
  route from its parent; the same holds at `rebuild-base` (`LIMEN_PROVIDER: continuation.provider ?? ""` in both), so
  it is no regression of stage 1. Part of A-030: the routes of R-062 cover `continue`, which takes the parent's
  recorded route unless its flags name another.
- R-067, R-081: the job label carries the round from the counter of R-069 (T-24), so R-067 depends on R-069; the docs
  are written from the final code (A-084), so R-081 depends on R-082–R-086.
- R-014: it registers the commands that remain after the cuts, so it depends on the cut tickets of stage 1, and it gives
  them the names of T-18 where no other ticket's mechanism is needed: `limen jobs` becomes `limen status --all` and
  `limen show <id>`, and `limen queue` becomes `limen seat queue`.
- R-001: A-042's decision defines the mechanism ("`limen status` lists leftover template copies once; `limen init
  --drop-leftovers` removes them"); R-001 builds it once, and every cut ticket registers the leftover paths of its
  feature.
- R-010: the cap it removes is the 3,500-line cap on Limen's own `test/`, a sentence in Limen's `spec/vision.md` read by
  a test (T-11); the projects' optional `testLineCap` in `limits.json` is a different setting, built by R-062.
- R-011: the runner takes the project, the parent commit, the ticket file and the reference test paths as arguments;
  the rebuild session has no access to the projects, so Adrian picks the ticket before B.2 by the criterion of
  `## Measurement`. One attempt is a whole coordinator session, run headless through Pi's RPC mode (D-021).
- R-005: the GitHub module's review today reads the job's `hosted` file and gives up without it
  (`src/integrations/github-review.ts:146`); hosted jobs: 0 in both projects (gate 2 §1).
- R-012: the script is `seat/deploy.ts` (TypeScript, D-010), which also puts `seat/` under `tsconfig.json` and
  the scan for `.sh` files in `seat/` and `bin/`; it reads job state through the record module once R-021 exists.
  R-032 and R-056 add the unit verification and the nftables check to it; the Pi type contract runs in the repository
  (D-055). The D3 test that
  `src/` and `hook/` have no dynamic `import(` on the job-finalize path lives here (none at `rebuild-base`).
- R-009, R-046: under the bridge Claude Code's subagent tool is always denied (E-5), so the condition of T-33 for a
  subagent in the coordinator's session does not hold; the manual recommends no subagent. A short question is the
  coordinator's own, a long one is a survey ticket (T-34).
- R-029 (from R-017's review, 2026-11-20): on Pi 1.5.1 an error a hook's handler throws becomes an extension error
  for every event except `tool_call`, whose handler error Pi rethrows, and that blocks the tool call (`runner.js`
  `emitToolCall` has no try/catch). A guard's `BAD_DATA` therefore reaches the job by two paths, which R-029's
  `engine-error` must both record.
- R-013: until R-082, the `catch` scan of T-01 is a ratchet over the author's 148 sites (40 `.catch(() => {})`, 108
  `catch {`, T-01 → Why). It depends on the cuts of stage 1 (D-028), so it reworks no code a cut removes and its
  `process.exit` scan holds over `src`, `hook` and `bin` at its own commit (D-025).
- R-014: it also cuts `group wait` (T-19 names `group start`, `status`, `stop` and `land`; `wait` is rejected), whose
  time limit R-013 turns into a typed error (D-028).
- R-040: its criteria include `git grep -q '"templates/agents.md"' -- src hook` → exit 1, the global check that R-001
  confines to its own paths, because R-040 removes the `AGENTS.md` fallback of `hook/communication.ts:307` (D-025).
- R-088: the four round-3 notes of R-011's review (`R-011-same-task-runner/review.md` → Round 3): wait for `pid` as
  well before the second stop, stop Pi before the job stops (or read the job list again after them), correct the
  comment on a queued job's `state`, and give the test of the second stop a short bound (D-027).
- R-015: from a0.2.0 the settings live in the project's `.agents/limen/limits.json`, which exists at `rebuild-base`
  with `prepare` and `toolStall` (`src/project/limits.ts:7`), and the environment no longer overrides them.
  `LIMEN_WORKER_MODEL` and `LIMEN_REVIEWER_MODEL` stay readable, as the only listed exceptions, until R-062 brings
  `routes.json`; dropping them first would make the silent fallback of A-030 the default.
- R-019: it also fixes A-087 (D-029): the takeover of a dead lock renames it to a unique name, then creates the new
  lock with `wx`, and the seat registry is written under the lock through `atomicWrite`; an injection point between
  "found dead" and "taken over" lets a test force the interleaving of two processes, which fails before the fix every
  time; `test/s9-housekeeping.test.ts:135` stays, and a registry test asserts 41 entries after 41 concurrent
  registrations with a dead lock owner.
- R-020: git is declared by the feature Limen needs (`git worktree list --porcelain -z`), not by a version number, so
  the gate's shim (D-001) satisfies it on the laptop's git 2.34.
- R-050: its coordinator start script runs R-020's requirements check (T-12 (2): "checked at `limen init` and at
  coordinator start"), since no start path exists before it.
- R-021 (R-016 review round 3, notes 1-3; R-021 moves the records onto `src/boundary.ts`): the comment above
  `RAW` in `src/boundary.ts` says what `JSON.stringify` escapes (C0 included; DEL, C1, U+2028 and U+2029 are left to
  `escaped`); the 40-character cut of a shown value never splits an escape or a surrogate pair; format characters
  (category Cf, such as U+202E) are escaped too, so a record value cannot change how a terminal shows a log line.
- R-021 (R-018 review round 2, notes 1 and 3; R-021 rewrites both places): the comment at `src/job/record.ts:12`
  says every file of the job record is written by `atomicWrite`, while `log` is appended to (T-30); the comment at
  `src/job/publication.ts:154` says the transcript copy keeps the source's mode "as `copyFile` did", which holds only
  when the umask does not narrow it (the copy is never wider).
- R-022 (R-021 review round 2, note 3): after R-021 one record that reads as `BAD_DATA` makes `resolveJob` (which
  reads every folder's record for its label) and plain `limen status` fail with exit 4; only `status --all` shows such
  a record as INVALID. The one resolver decides how a record it cannot read takes part in a reference (for example:
  an exact id still resolves, a label match skips it and names it), with a test.
- R-024: `limen stats` of a0.2.0 over a migrated copy of the whole history of both projects is the "before" of the
  job counts, M-07's tokens by class per job and M-11's failure kinds; M-03, M-04, M-06 and M-07 per landed ticket and
  per coordinator turn are R-098's, after R-031 (D-072; `## Deployment` B.3, B.4).
- R-030: from R-068 on, a job in `needs-decision` does not block worker spawns for other tickets (T-05 (5)).
- R-039: `context-size.mjs` learns to measure the context message in this ticket (M-01).
- R-040, R-048: the project's `AGENTS.md` goes into the context message exactly when the job runs the bridge isolated
  (E-15, D-005); R-040 builds the rule from a launcher flag, and R-048 turns isolation on, so the file never arrives
  twice. Neither project has an `AGENTS.md` today (gate 2 §1).
- R-044: the switches go into the existing `limits.json`; its migration lists the modules each project uses (the
  GitHub module when connected, groups when a group record exists), and Adrian switches those on in step 4.9. Its
  criteria include (D-040): the modules header of `limen --help` has the text of T-19, and each module line's `[on]` or
  `[off]` is built from that module's switch (a golden test with one module on and the rest off).
- R-032, R-034, R-037, R-101, R-102, R-066 (D-039, D-096, D-097): each one's criteria include "the command registry
  holds no entry with `movedBy` naming this ticket" (R-032: `sweep`, and it moves `prune` to R-101; R-034 moves `rule`
  to R-102; R-037 moves `close` to R-101; R-101: `prune`, `close`; R-102: `rule`; R-066: `keeper`). The ticket that
  removes the last `movedBy` entry also removes the field and the exception of R-014's registry test, which fails until
  it does (D-042), so that a top-level command acts only on `job`, `owner` or `project`.
- R-023 (D-044, R-014's review round 4): the static scan that no command words are read outside `src/parser.ts`
  (R-014 moved the `--help` lookup and the `jobs` refusal's words into the parser); the test of `--help` as a flag's
  value (R-014's parser test) asserts the command's own exit 1, so a parser refusal no longer passes it; the
  import cycle between `src/parser.ts` and `src/old-names.ts` (R-014 → `outcome.md` → Open points).
- R-081 (D-044, R-014's review round 4): the caller list above the internal section of `docs/commands.md` names every
  caller the generated lines name (a rule command after its timer died, `limen group status`).
- R-077 (D-042): its criteria include "the command registry holds no entry with `movedBy` naming this ticket" (`group
  wait`) and a fake-engine test in which a team member with a worker allowance gets each worker's result although it
  no longer calls `group wait`, including a worker that ends after the member's turn would have ended.
- R-103 (D-041 (6); R-032 `ticket.md` → Out of scope, 2026-11-23): `limen diff` and `limen open` in Herdr record their
  tab's place under the job folder (`src/integrations/herdr.ts:102-133`, `:389-397`), which T-04 forbids for `diff`, a
  read command; those places serve the closing of the job's tabs, which R-103's `cleaned` step rewrites, so R-103
  makes `diff` and `open` change commands (D-096 (2)). Once read commands write nothing, `limen <command> --help`
  shows the kind of T-19 (D-041 (6)).
- R-103 (R-037 `review.md` → Round 3, note 1, D-092): two pointers of R-037 in `test/cli/land.test.ts`, "Review
  round 1, F1" and "Review round 2, G5", name no ticket beside older pointers of other tickets with the same names
  (T-30); R-103, which rewrites land and its tests, writes them as "R-037, review round 1, F1" and "R-037, review
  round 2, G5".
- R-103 (R-037 `review.md` → Round 1, note 6, D-092): when releasing the ticket-lanes lock fails after a close
  whose commit is on the branch, land wraps that error in its failure and says that nothing of the close was written,
  with `next` `limen ticket done <codes>`, which would then refuse; the recorded `closed` step reads the closing commit
  from Git, so a land that fails after its commit reports the commit and continues from it.
- R-103 (D-075, D-094 (3); R-037 `ticket.md` → Decisions 9 and Risk, 2026-11-23): land's `irreversible` mark, with
  T-28 (3)'s test that a rerun of land continues and a test that nothing is lost; and a kill between the closing
  commit's branch move and the checkout's `git read-tree -m -u` leaves the checkout behind the branch on the close's
  paths with no error printed, which the `closed` step, recorded with the commit, continues when land runs again.
- R-023 (D-045 (2), D-046): the `jobs` refusal (R-014 review round 4, note 1): a flag present names `limen status
  --all`, and only `limen jobs <ref>` names `limen show <ref>` (D-038); a test that every non-empty `next` of a refusal,
  for the mixed forms `limen jobs --all a1b2c3d4` and `limen jobs -- --all` included, passes the shared parser and is
  not itself a usage error.
- R-025 (D-045 (6)): `rule` is `change` (its entry covers `set` and `end`); `status` and `show` are `change` while they
  reap dead jobs; a test that every `read` command, run on a test project, leaves the project's files and `.limen/`
  unchanged (the snapshot function of T-38 (4)).
- R-032 (D-045 (6.2)): `status` and `show` become `read`, and R-025's test of `read` commands passes for them.
- R-032 (D-056 (4)): the systemd units it writes set `TimeoutStartSec`, so that a unit that waits on a lock (R-019's
  60 s bound) is not stopped first.
- R-025 (R-090 → `outcome.md` → Open points 1): the other scans of `test/structure.test.ts` (`filesIn` for `seat/`,
  `bin/`, `src/`, `hook/`, and `sources`) still walk ignored files; they read only the files git knows, through R-090's
  `knownFiles`, so an ignored file (an editor's swap file) cannot change a scan.
- R-082 (D-070): it brings the ratchet of T-38's shape to zero: every change command without `movedBy` follows
  `validate` then `apply`, and its refusals are typed.
- R-037 (R-092 review round 1, finding 12): only `ticket done` takes the ticket-lanes lock; `land`'s `closeTickets`
  runs its plan and apply without it, so its re-check does not exclude a concurrent `ticket done`.
- R-025 (R-018 review round 2, note 5; T-29 (5)): `test/cli/github.test.ts` opens with two header lines, and the
  header of `test/cli/continue.test.ts` does not name its transcript-mode test.
- R-059: no shell scripts (D-010; R-033 replaces the bell): `docs/seat/github-setup.sh` becomes TypeScript in `seat/`,
  and every unit calls `node /opt/limen/seat/<tool>.ts`.
- R-031 (D-080; R-099 `outcome.md` → Open point 2): a job whose record leaves `.limen/jobs/` before the poller saw it
  past `starting` leaves a GitHub handoff gate that no rule tells from a crash's, so a rerun of the claim's command
  would start a new job; the archive is where a gate can find the claim's job after a retire.
- R-031 (D-088; R-030 `review.md` → Round 4, note 2): R-030's test of a nested repository reads only the gitlink's
  commit and the nested repository's status, never its other branches, stash or reflog, so commits there go with the
  worktree after abandon; the `abandoned` marker that replaces the branch test should be set only when the save holds
  the whole worktree.
- R-032 (D-080; R-099 `outcome.md` → Open points 7 and 8): a crash between the job record and the wrapper's start
  leaves a `starting` record with no pid, which the reaper skips and prune removes only after the 10-minute grace; a
  crash before publication's rename leaves `.limen/.publishing-<id>`, which no line of `src/` removes outside
  `publishJob`'s `catch`. The sweep finds and ends both.
- R-032 (D-088; R-030 `review.md` → Round 5, notes 2–4): R-030's rule of a gitlink to a commit the project lacks
  (`unsavedGitlink`) keeps also a worktree whose gitlink folder holds no nested `.git`, so in a project with a
  registered submodule, or whose `main` records such a gitlink, no worktree and no landed branch is removed any more
  (nothing is lost; the kept lines grow); a clean candidate whose `HEAD` has no commit makes the whole prune fail with
  `GIT_FAILED` and Git's words only; a gitlink path that holds a tab is cut at it in the `kept` line. The sweep's prune
  checks a gitlink only where a nested `.git` is there, names the worktree in that failure, and reads `-z` entries
  whole.
- R-032 (R-027 `ticket.md` → Out of scope, 2026-11-22): R-027 ends a dead wrapper's scope before `failed`, but three
  paths still read the wrapper alone or trust a scope's end: the deployment gate of `seat/deploy.ts`, the
  migration's `folderLive` and the other `liveJob` callers treat a dead wrapper with a live engine as not running; a
  terminal job of any finisher whose scope end failed keeps its processes, and nothing checks it again; prune removes
  a terminal job's clean worktree while its scope may still be active (`jobKeeps`, `src/runtime/pruning.ts`). The sweep
  checks the scope of every job it reads, and escalates a job whose scope cannot be ended.
- R-032 (D-092; Q-42; R-031 `review.md` → Round 3, the two notes that need code): the GitHub poller reads a job's
  record and then its `result` and `log` without a lock, so a retire between the two reads moves the folder and the
  one terminal reply on GitHub says "No result or check evidence recorded." and names `limen show <id>`, which refuses
  an archived job (`src/integrations/github-poller.ts`); and `abandonedOf` names two functions with two meanings, the
  record field's validator (`src/job/record.ts`) and the migration's evidence of an abandon (`src/job/migration.ts`),
  against T-25 and T-18. R-032 makes retire a step of the sweep on a timer, so every reader that races a retire is
  settled there, with R-031's open points (round 1's finding 8: retire moves a folder without the job's own lock; open
  point 4: a job retired before its owed wake or alert).
- R-036 (D-092; Q-43; R-035 `review.md` → Round 1, note 1): the wake hook delivers a job's advisory once per
  coordinator session (the receipt `_advisory.<session>`, `hook/wake.ts`), and R-035 writes the queue's diagnosis into
  the same field, so a job diagnosed in the start queue gets no stall advisory after it in that session (the record and
  the log keep each one). Each advisory names its source (queue or stall), the receipt is per source and session, and
  a test shows a stall advisory after a queue diagnosis delivered.
- R-032 (D-092; R-031 `outcome.md` → Open point 1, and its `ticket.md` → `## Decisions`, AC-12 read within the
  ticket's scope): `removeUnstartedRecords` (`src/runtime/pruning.ts`) still deletes the folder of a record that never
  started whose spawner is gone, and a folder with no record. By z. 29 (archive instead of delete) the sweep's prune
  step moves both into the job archive instead, with a test that nothing is lost (T-28 (3)).
- R-032 (D-092; R-027 `outcome.md` → `## Night defaults` 2, Q-44): a `running` record with no `scope` whose pid has no
  recorded start time, while a live process holds that pid, stays `running`, since the reaper cannot attribute the
  group (z. 14); the sweep escalates such a job (an alert and a `limen status` line) rather than leaving it so.
- R-032 (D-092; R-027 `review.md` → Round 1, findings 4 and A): `scopeState` reads `is-active` exit 3 as gone, also
  for a `deactivating` scope, which may still hold processes (`src/platform/linux.ts`); and a reaper that runs inside
  the reaped job's own scope (an engine whose wrapper was killed alone runs `limen show`) gets its own TERM before any
  write, so the job stays `running`. The sweep reaps from outside every job scope and reads a `deactivating` scope as
  not yet ended.
- R-103 (D-092, D-094 (3); R-031 `outcome.md` → Open point 2): `ticket done` writes its `landed` markers after its
  commit, outside its operation, so a failed marker write leaves the jobs unmarked while a rerun refuses
  `NO_ACTIVE_TICKET`; as a recorded step of the close, the marker write is continued when the command runs again
  (T-38 (3)).
- R-087 (D-092; R-028 `review.md` → Round 3, note 1): the test knob `LIMEN_END_GATE` (`endGate`,
  `src/runtime/wrapper.ts`) holds a wrapper's end with no bound of its own, so a spawner's environment that held it
  would hold every job's end until `limen stop`; it is one of the test knobs that R-087 makes read only in test mode
  (T-03), as the R-050, R-087 note below says of `LIMEN_CGROUP`.
- R-029 (D-092; R-028 `review.md` → Round 2, finding 2, and Round 3, note 2): the exhaustion's TERM to the group
  (`exhaust`, `src/runtime/wrapper.ts`) writes `<reason>; sending TERM` before its call and drops the call's result
  (T-01); and the wrapper takes the TERM's flag in the engine's `close` handler, so a TERM between the engine's `exit`
  and `close` (a process that inherited its stdout still holds the pipe) still counts, and the job ends `failed` with
  no result written. R-029 sets each kind where its detector runs, so there the exhaustion's TERM logs its result and
  the end takes the TERM's flag at the engine's `exit`.
- R-033 (D-080; R-021 `outcome.md` → Open points): since R-021 the bell needs `node` on its service's `PATH`; the
  alerts that replace it, and seat step 3.3, name what their service runs.
- R-035 (D-090; R-033 `review.md` → Round 3, notes 2 and 3): two items in `seat/alerts.ts`: a project the alerts first
  read after their first run, and an install run again after `limen init`, mark that project's existing failures as
  reported without sending them (A-054); the summary of a run that reads no project counts an unreadable project once,
  however many registries list it. Each with a test that fails before it.
- R-038 (D-080; R-024 Open point 3, R-096 Open point 1): the fake engine writes `{"task": …}` into its transcript,
  which is no Pi entry, so `limen stats` over a fake job names it under `Not read`; and a message a hook sends while
  `agent_settled` is emitted, which starts a new run as Pi's `prompt` defers it, has no test of its own.
- R-051 (D-080; R-022 `outcome.md` → Open points): the wake's own listings of `.limen/jobs/` (three in
  `hook/wake.ts`, one in `src/job/wake-delivery.ts`) go through the resolver's listing, whose scan then covers them.
- R-058 (D-080; R-099 Open point 9): `limen github status` (`doorbellStatus`, `src/integrations/github-claims.ts`)
  prints the newest claim copy's `job` field as the copy holds it; a job can write that copy, so the field is printed
  only in the form of a job id, as R-099's G1 does for the refusal.
- R-082 (D-080; R-025 `outcome.md` → Open points): scan (b)3 holds a test by the command it runs, not by its code, so
  the unit tests that run no command (the parser's, the lock's, the runner's, the resolver's) leave
  `WITHOUT_SNAPSHOT` and their codes are proved by a command's refusal test that compares the snapshot.
- R-028, R-036, R-087, R-050, R-060 (R-026 `ticket.md` → Out of scope, 2026-11-22): every job runs in
  `limen-job-<id>.scope`, and its record's optional `scope` holds `unit`, `cgroup`, `memoryPeakBytes`,
  `cpuMicroseconds` and `oomKills`. R-028 maps a signal with `oomKills` above 0 to kind `oom` (A-052); R-036 reads the
  scope's `cpu.stat` for the stall and records the peak CPU rate from its samples (M-09); R-087's allow-list keeps the
  user-bus variables (`XDG_RUNTIME_DIR`, `DBUS_SESSION_BUS_ADDRESS`), which a job that spawns jobs needs for its
  children's scopes, and the fake scope's marker in tests; R-050's coordinator runs in no `limen-job-*` scope; R-060
  tells job scopes by that prefix.
- R-060 (R-026 review round 1, note 5): since R-026 the A-083 scan of `test/structure.test.ts` bans the literal
  `systemd-run` in `hook/`; T-42's guard, a hook that refuses `systemd-run --on-calendar`, needs its exemption there.
- R-050, R-087 (R-026 review round 1, note 6; R-026 `outcome.md` → Open points): `src/platform/linux.ts` reads the
  test knobs `LIMEN_CGROUP` and `LIMEN_CGROUP_ROOT` in production paths (the wrapper's in-scope check, the
  finisher's readings through `cgroupFolder`, the scope's end), so on the seat a spawner's environment that held them
  would make the scope's end `gone` without a kill or pass an unscoped wrapper. The fakes need both in the engine's
  environment (the fake `systemctl` finds a scope's members by them), so R-087's allow-list keeps them for tests, as
  the note above says; the guarantee is that the knobs are read only in test mode (T-03), which R-087 makes true, and
  the coordinator's start script passes neither (R-050). (Corrected after R-026 review round 3, notes 4 and 5.)
- R-102 (R-026 review round 2, note 9; D-094 (2)): since R-026 a rule's timer that cannot start writes "rule <name>:
  its timer could not start: …" to stderr after the handler may have written its final line, which then is no longer
  the last stderr line (T-02); R-102 cuts `limen rule`, and with it this path.
- R-102 (R-029 review round 1, note 2, and `outcome.md` → Open point 1): R-029 writes a coordinator session's newest
  guard refusal as `refusal.json` into its registration folder `.limen/coordinators/<session>/`, which `limen status`
  reads (T-32 (4), R-029 Decision 8); when R-102 removes that registration (D-097 (6) (b)), it keeps a per-session
  place for the file or moves it, with `limen status`'s warning and its test, and it closes the gap of a session that
  never registered (its refusals reach only Pi's chat). From R-029's review round 3 (D-092, the rounds of fixes
  spent), with a test each that fails before: (1) a registration folder with no recorded `born` still takes the
  refusal on the pid alone (`writeCoordinatorRefusal`; `born` is written fire-and-forget at registration), so a
  folder matches only on the whole identity; (2) `coordinatorRefusals` reads `refusal.json` through the guarded read
  of the record (no symlink followed, a size bound), and a directory or an unreadable file is shown as its BAD_DATA
  line instead of failing the whole `limen status`.
- R-081 (R-026 `outcome.md` → Open points): `SECURITY.md:9` still describes the escaped-descendant check of the
  removed `src/runtime/contain.ts`; the job's scope replaces it.
- R-102 (R-032 `ticket.md` → `## Decisions` 16): the T-04 import scan of `test/structure.test.ts` lists `rule` as an
  exception that names R-102; when R-102 moves `rule`, the exception goes, and the scan passes without it.
- R-087 (R-032 `ticket.md` → `## Decisions` 17): R-032 adds the test knob `LIMEN_LINGER_DIR` (the linger folder,
  `src/config.ts`), so R-087's count of 13 test knobs is 14; R-087's test mode covers it as the others.
- R-082 (R-032 `review.md` → Round 3, note 5, D-092): on the sweep's path each start-queue entry file is still read with
  `readFile(...).catch(() => undefined)` (`src/runtime/start-queue.ts`, `removeDeadEntries`), so an entry the sweep
  cannot read is neither removed nor named (T-01); R-032 made only the folder's listing strict there, and the waiting
  wrappers and `limen seat queue` keep the listing's catch-all as well.
- R-082 (R-036 `review.md` → Round 3, note 1, D-092): the sample at the engine's end (`last()` of `scopeSamples`,
  `src/runtime/wrapper.ts`) awaits its log line with no catch, so a failed `cpu.stat` read and a failed log append at
  once reject `runInternalJob`, and `src/main.ts` ends a job whose engine exited 0 `failed`, kind `internal`; a tick
  sends the same failure to `failLog`. The end's side channel goes through the one best-effort function of T-01, as the
  tick's does.
- R-087 (R-036 `outcome.md`, (g)): R-036 adds the test knob `LIMEN_STALL_TICK_MS` (the stall's tick, `src/config.ts`),
  so R-087's count of test knobs, 14 after R-032, is 15; R-087's test mode covers it as the others.
- R-101 (R-032 `review.md` → Round 3, note 7, D-092): two tests of `test/cli/sweep.test.ts` claim more than their
  mechanism: the test of an unlistable start-queue folder also asserts that the dead job is reaped, which its step
  cannot make fail, and the test that a run removes a dead queue entry and says how many registers a second project
  no assertion reads; R-101, which adds its daily steps to the sweep and these tests, makes each test check one
  mechanism (T-29).
- R-103 (R-098 `review.md` → Round 3, note 2, D-092): the time of a `ticket done` land's marker, the ticket's day at
  `T00:00:00.000Z`, is written in `src/job/landing.ts` and matched by its own regex `DAY_ONLY` in
  `src/job/statistics.ts`; R-103, which rewrites the marker steps of land and `ticket done`, gives the form one
  definition in the module that writes it, which `stats` reads (T-25 (2)).
- R-103 (R-101 `review.md` → Round 3, note 1, guessed, D-092; R-101 `outcome.md` → Open point 7): R-101's daily close
  of leftover tabs (`closeLeftoverTabs`, `src/integrations/herdr.ts`) asks Herdr on every daily run about each
  recorded tab of every finished job of closed features still in `.limen/jobs/`, through a blocking `spawnSync` with
  the 10 s bound, so a Herdr that hangs costs 10 s per tab and about 30 tabs pass the sweep unit's 300 s (the run is
  cut, writes no stamp and repeats each minute); R-103, which rewrites the tab close for its `cleaned` step, records a
  tab once it closed or Herdr no longer lists it, so it is not asked again, and bounds the step's total time.
- R-060 (D-107; R-032 `outcome.md` → Open points 5 and 6): `limen seat sweep --install` inside a job's scope is not
  refused, though the run refuses `SWEEP_IN_JOB` (agents create no timers, T-42); `--uninstall` reads `is-active` as
  unknown both for `inactive` and a failed probe, so a timer file removed by hand stops every rerun.
- R-062 (D-107; R-033 `outcome.md` → Open point 5; R-034 `outcome.md` → Open point 4): `limen init` rewrites the
  registry with `atomicWrite`, which drops the alerts' ACL until root installs again (a registry writer that keeps
  the file's ACL); a parent with a `null` model resumes on `defaultModel()`, where the routes of R-062 decide.
- R-059 (D-107; R-033 `outcome.md` → Open point 6): after `seat/deploy.ts`'s units step succeeds and the next tag fails,
  the checkout goes back but the new units stay loaded.
- R-049 (D-107; R-034 `outcome.md` → Open point 5 and `ticket.md` → Decision 2): the sweep unit's `PATH` is the
  installing process's own; a declared `PATH` is R-049's (T-12).
- R-051 (D-107; R-034 `outcome.md` → Open point 7): an owed completion wake released after the quota resume names a
  resume time already past; the wake's header from records names the resume that ran.
- R-073 (D-107; R-035 `outcome.md` → Open point 4): `limen seat queue` shows no thresholds and `limen show` no
  `queueWait`; the one renderer over records shows both.
- R-050 (D-107; R-035 `outcome.md` → Open point 2; R-102 `outcome.md` → Open point 7): units outside the user manager
  (a coordinator's `session-N.scope` from SSH) are not ranked by the start queue until the coordinator has a unit; the
  refusal writer follows a link in place of `.limen/refusals`, while both readers refuse it (the writer refuses it
  too, one place for the check).
- R-076 (D-107; R-098 `outcome.md` → Open point 6): two private `coordinatorLines` (`src/job/statistics.ts`,
  `src/project/summary.ts`), and T-25's name scan covers two files only; a rename.
- R-085 (D-107; R-101 `outcome.md` → Open point 5): the `limen seat sweep` help summary is the implementer's wording
  and omits the daily close of leftover tabs.
- R-054 (D-107; R-103 `outcome.md` → Open points 4–6): `closeStep`'s comment calls the closing-commit rule "the
  migration's rule"; G1's filter runs once per earlier land in HEAD's history (test the job's id first); a land run
  again on a record whose merged commit Git no longer holds ends exit 4 each time (a merged commit Git does not hold
  counts as no closing commit).
- R-104 (D-107; R-101 `outcome.md` → Open points 3, 4 and 6; R-102 `outcome.md` → Open point 9): the daily prune moves
  every unregistered folder of the worktree root into `.limen/archive/unregistered/`, `.git` or not (Q-58, amending
  D-097 (4) (d)); a lock taken after a retire can leave an empty `.limen/jobs/<id>/`, which fails the daily prune until
  the month changes (a test that plants the empty folder first); prune's moves take a folder's lock in one attempt
  under the jobs lock, as retire does; a start-queue entry is live only when its job folder is one of the project's
  jobs (Q-59).
- R-105 (D-107; R-032 `outcome.md` → Open point 1 and `ticket.md` → Decision 16; R-026 `outcome.md` → Open point 3):
  T-04's scan reads direct imports only, while read commands reach state-transition functions through their imports
  (`listing.ts` → `reap.ts`, `start-queue.ts`; command files that hold both kinds), so the scan follows the transitive
  closure, with `ownerState` and `queuedText` moved into modules with no transition and the mixed command files kept as
  a ratchet naming their end tickets; T-26's launch scan sees `node:child_process` only, so a start through
  `platform.startInScope` outside `launcher.ts` passes.
- R-107 (D-112; E-18): `scopeState` (`src/platform/linux.ts` line 239 at `a0.3.0`) decides by the cgroup folder first, so
  only a record with no cgroup reaches `is-active`, whose exit 4 is a call failure (`callFailure`): the end logs `scope …
  was not ended: exit code 4`, the job goes to `notEnded`, and from the third sweep it would be listed and alerted
  `stuck` (from the code, not seen). Exits 3 and 4 both read as not active; a fake `systemctl` test returns 4.
- R-108 (D-112; E-19): the wrapper keeps one activity (`recordEvents`, `src/runtime/wrapper.ts` line 501 at `a0.3.0`),
  so a tool's `tool_execution_end` sets `wait` while another tool of its message still runs, and `pendingTool` (line
  314) is undefined for the rest of that tool. Pending tools are kept by `toolCallId` (each start adds, each end
  removes), a tool is pending while one is left, and the progress key covers that set; the test plays a write and a
  `sleep` started in one message, the write ending first.
- R-109 (D-108, D-112): `seat/alerts.ts` sends with `fetch` from a unit with no address-family setting (`seat/units.ts`
  at `a0.3.0`), and Node picks IPv6, whose sender the relay refuses for its daily quota; the alerts' service carries
  `NODE_OPTIONS=--dns-result-order=ipv4first`, as the seat's temporary drop-in does, and still passes
  `systemd-analyze verify`.
- R-051 (D-109, D-112; `## State`, "`limen-rebuild-34`"): a fallback completion wake that the coordinator answered with
  a turn is recorded unconfirmed and sent again until its two attempts are spent (`hook/wake.ts` line 727 at `a0.3.0`:
  confirmation needs `accepted`, `entered`, `answered` and `settled`), while a session's own wakes confirm (F012's 15
  jobs, one delivery each); a fallback wake's text says `The subscribed coordinator is busy` for a job no coordinator
  spawned (`src/job/wake-text.ts` line 119). Criteria: a fallback wake answered by a turn is confirmed once, and its
  header names no subscriber when the job has none.
- R-081 (the session, 2026-11-25; `## State`, "`limen-rebuild-34`"): `limen diff` opens a Herdr tab only when Hunk's
  binary is on `PATH` and prints the git command otherwise (`showJobDiff`, `src/integrations/hunk.ts` line 44 at
  `a0.3.0`), and no doc names Hunk; the docs name it as optional, with what `limen diff` does without it.

## Deployment

Adrian's steps on the seat; the rebuild session runs none of them. `<project>` is a project's checkout, `<tag>` and
`<sha>` come from the gate summary of the stage. No step needs a secret from this repository.

Where the owner actions of gate 2 §9 (the 16 items recorded at gate 2) are placed:

| Item | Subject | Steps |
|---|---|---|
| 1 | Accounts: names, owner channel, research account, alerts account, egress allow-list, tokens | 3.3, 5.1, 5.16, 8.2 |
| 2 | §7 D1 per project (D-110): the `main` watcher's deploy keys; a ruleset only where the plan enforces one | 3.11, 4.10, 5.2 |
| 3 | Root-owned installs of Pi 1.5.1, the bridge, Claude Code (D-017) and the coordinator start script | 5.3, 5.20 |
| 4 | Coordinators start only through the start script | 5.4 |
| 5 | `limen seat sweep --install`, old prune units off (done on 2026-11-17), route variables out of the environment | 3.1, 6.1 |
| 6 | Old seat extensions removed; the extra Limen checkout in the agents' home | 5.5 |
| 7 | `limen` and `node` resolve to root-owned paths; `LIMEN_PACKAGE` unset | 5.6 |
| 8 | The agents' account is not in `adm` or `systemd-journal` | 5.7 |
| 9 | `limen init` answers per project | 6.1 |
| 10 | Migration of records and of ticket acceptance; the `needs-adam` count | 2.1, 6.2, 7.1 |
| 11 | Alerts: first installation and the phone app | 3.3 |
| 12 | Seat verification of what the package sources could not settle | B.1, 3.2, 3.4, 4.2, 4.3, 4.4, 5.8, 5.9, 5.10, 6.3, 7.2 |
| 13 | Reboot test | 3.7, 5.11 |
| 14 | Measurements "before" | B.1, B.2, B.3 |
| 15 | `.limen/` snapshot before each deployment | 0.1 |
| 16 | Bridge and type contracts at every tag and after a version change | 0.2, 0.5, 2.2, 4.1 |

Item 12 also asked for the subagent tool's name under the bridge: settled by the sources (always denied, E-5).

### Resuming the projects on the seat

The earliest point to resume `synchronizer` and `ledger` on the seat, with the rest of the rebuild running in
parallel, is after a0.3.0 is deployed:
- Until a0.3.0 the critical losses of A-001 and A-002 are live: prune deletes the uncommitted work of a finished job,
  `prune --retire` deletes the records of jobs that never landed, and the seat's daily `limen-prune` timer runs both.
- a0.3.0 brings what a running seat needs most: one automatic resume after the 5-hour limit (12 of the 18 failed jobs,
  gate 2 §1), a recorded cause for every failure, the sweep timer, and alerts to the phone.
- Until a0.5.0 the risks that stage 5 closes stay open: the agents' account holds the GitHub token and has an open
  network, harness code loads from worker-writable places, and GitHub text and worker-writable files reach the
  coordinator. Adrian accepts them with a deadline (D-012). Jobs already run with T1 from a0.3.0 (R-087); the seat's
  token is fine-grained, with Contents read and write on the two projects only; no ruleset is enforced on their
  private repositories, so from a0.4.0 the `main` watcher (R-106) alerts on a forced update or a deletion of `main`
  and keeps its history (D-110).
- Land in stages 3–6: today's rule stays until a0.7.0: the coordinator lands a job only after Adrian's "land". From
  a0.7.0 land happens only when the conditions in code hold (R-071), with no "land" from Adrian (D-004).
- From then on, every tag deploys onto live data the same way (0.1–0.7). Stage 4 changes how the models behave in the
  middle of the projects' work; that is the change M-05 measures, not a reason to wait.

Conditions:
1. Before the first deployment (`a0.1.1`, D-046): B.1 and B.2 run on `rebuild-base`, and the snapshot of 0.1 taken before that first
   deployment is kept as the "before" data of B.3, because resumed projects add jobs of several versions to the live
   records.
2. The old `limen-prune` timers stay disabled until a0.3.0 replaces them (A-001: they deleted the uncommitted work of
   finished jobs every day). Done on 2026-11-17; step 3.1 checks it.
3. Migrations on live data run after the snapshot of 0.1, with `--dry-run` first and the report checked before the real
   run: 2.1 (records), 3.6 (unlanded jobs, landed markers; before the first spawn), 6.2 (front matter, acceptance), 6.4
   (board), 7.1 (`needs-adam`).
4. Steps 3.1–3.3 (sweep timer, job scopes, alerts) are done before normal work resumes; the trial jobs of 0.6 and 3.2
   are the only spawns before them. 3.4 waits for a real limit.
5. Every deployment after the resumption needs a quiet window: the script refuses while a job runs (D-008), so Adrian
   stops spawning, lets the running jobs end (one per project with `maxJobs` 1, the seat's practice, A-014; each within
   its timeout), and deploys. A job that waits for its quota resume is not running (state `failed`, kind `quota`); its
   resume after the deployment runs on the new version, like a `continue`.
6. Formerly: step 3.11 (the ruleset on `main`) before the projects resume; gone by D-110, so the resumption waits for
   neither 3.11 nor the watcher of 4.10.
7. The "after" measurements of 9.1 count only jobs whose id date follows the a1.0.0 deployment (a job id starts with
   its date), so jobs of intermediate versions enter neither "before" nor "after".

One Max window for the laptop and the seat:
- The rebuild's sessions on the laptop (the main session and its subagents) and the seat's coordinators and jobs draw
  on the same 5-hour and weekly limits. After the resumption each slows the other, and a limit stops both.
- Split: by day, the projects and the rebuild's pair tickets, while Adrian is present; at night, the rebuild's
  delegated tickets. A job spawned in the evening takes from the night run's window.
- The weekly limit binds both sides (D-013): when about 80 % of it is used (Adrian's manual threshold), until a0.5.0 the
  projects yield, so that the risk window of D-012 stays short; from a0.5.0 the rebuild yields.
- After a0.3.0 a limit on the seat ends in one automatic resume 5 minutes after the reset (R-034); on the laptop, the
  night mode that Adrian adds to the rebuild prompt resumes after the limit.
- B.2 and the same-task runs of 4.8 and 9.1 (k = 3 whole tickets each) take a large share of a window; they run when
  neither the projects nor a night run need it.
- Revisit when: the 5-hour limit stops the seat's work or the night run on at least two days of one week (M-11, kind
  `quota`, on the seat; the night mode's record of its stops on the laptop); then the split changes, for example to
  whole days for one side.

### Every tag

The deployment script (D-008, R-012) is the only way a commit reaches `/opt/limen`; gate 5.N gives the tag and its
full SHA.

- **0.1** Snapshot `<project>/.limen/` of both projects and the seat state directory to a place the agents' account
  cannot write; keep it until the next tag has run a trial route.
- **0.2** As root: `node /opt/limen/seat/deploy.ts <sha>` with the full SHA. The script refuses, listing the running
  jobs, while any job runs (§7 D3); fetches `origin adrian-rebuild`; refuses a SHA that is not an ancestor of
  `origin/adrian-rebuild`; checks it out detached and tags it locally; compares `git rev-parse HEAD` with the SHA;
  from a0.3.0 verifies the generated systemd units with
  `systemd-analyze verify` (R-032), and from a0.5.0 the nftables rules with `nft -c -f` (R-056). On any failure after
  the checkout it returns to the previous SHA and exits with code 4 (D-010). The script that runs is the one already
  in `/opt/limen`, the previous tag's, and its verifications are its own list, so a verification a tag adds runs only
  from the next deployment; at its own tag it runs by hand from the new checkout, as root (at a0.3.0: `node
  seat/sweep-units.ts` in `/opt/limen`; found at the a0.3.0 deployment, `## State`, "`limen-rebuild-33`").
- **0.3** Reload every coordinator session with `/reload` (from a0.5.0: restart it through the start script, R-050).
- **0.4** The stage's steps below, in order; a migration runs first with `--dry-run` where the step says so.
- **0.5** From a0.4.0: the bridge contract of R-038 (T-31), the bridge log of one coordinator turn and one job turn
  against the fake engine's model view of the same scenario. It runs at every tag and after any change of the Pi,
  bridge or Claude Code version; a version change lands only after the bridge and the type contract pass (D-017).
- **0.6** Trial route in one project: one small ticket through spawn, review and land; note the exit codes and the
  time. The stage's steps name what else to watch.
- **0.7** Rollback: copy the current `<project>/.limen/` of both projects aside, to be kept (z. 29); run
  `node /opt/limen/seat/deploy.ts <previous sha>`; when the stage changed an on-disk format, restore the snapshot of
  0.1. The work of jobs run since 0.1 stays in their branches and in the copy, so a rollback loses nothing.

### Measurements before

B.1 and B.2 run before the first deployment; B.3 runs after a0.2.0 is deployed, on the snapshot taken before the first
deployment (`### Resuming the projects on the seat`, condition 1). B.2 needs the same-task runner of R-011 but no
deployment: once R-091 is pushed (D-046), Adrian runs it on the seat as the agents' account from a separate checkout of that
commit, outside `/opt/limen`, and points it at the `rebuild-base` checkout in `/opt/limen` and at a scratch clone.


- **B.1** Done on 2026-11-17 (results in `## Engine facts`, seat measurement B.1). On `rebuild-base` (today's seat), with `CLAUDE_BRIDGE_DEBUG=1`: save the per-query CLI log of one coordinator
  turn and one job turn (M-02). From the same log: whether each turn reuses or rewrites the Claude Code session, the
  cache TTL (`modelUsage` 5m or 1h), the context window of `claude-opus-5-5` on the Max login, and the cache read of
  the turn after a manual `/compact`, which forces a rewrite (E-1, E-2, E-8).
- **B.2** Done on 2026-11-20 with K = 2 of 3, pass^k no, two attempts void (D-049, D-050; `evidence/b2-same-task.md`).
  The same-task baseline: the same-task runner of R-011, as R-088 and R-091 left it, with `rebuild-base`, k
  attempts (M-05); an attempt that meets a Pi event the runner has not marked ends at once with the raw event in its
  result (R-091). First the
  seat check of R-011 (D-021): the coordinator started headless through Pi's RPC mode loads Limen's hooks and
  receives a wake; Adrian gives the candidate ticket's real time from the M1 records, which sets the time limit.
  After every attempt, the runner's stderr names no job left running (R-088, D-027).
- **B.3** After a0.2.0 is deployed: `limen stats` of a0.2.0 over a migrated copy of each project's `.limen/` from the
  snapshot taken before the first deployment (R-024: the jobs by route and role, M-07's tokens per job and M-11's
  failure kinds; D-072). After a0.3.0 and B.4's copy, the same copy, migrated by R-031 and kept a Git checkout (`stats`
  finds its project by `limenRoot`): `limen stats --sessions <the project's copy of B.4>` inside it gives M-06 and
  M-07 per land on the `Lands` lines and M-03 and M-04 on the `Coordinator` lines (R-098, D-098).
- **B.4** Before a0.4.0 is deployed (it changes what the coordinator reads): copy each project's coordinator sessions
  directory (Pi's sessions directory for the project's folder, under the Pi agent folder of the agents' account; it
  holds only the coordinator's sessions, since jobs write theirs under `.limen/`) beside the snapshot of 0.1, one copy
  per project; R-098 reads that copy with `--sessions` as the "before" of M-03 and M-04 (D-072, D-098).

### After stage 1 (a0.1.0)

The stage's first deployment is its fix tag `a0.1.1` (D-046), which carries R-090 and R-091.

- **1.0** Bootstrap, once: `/opt/limen` at `rebuild-base` has no deployment script. Check by hand that no job runs
  (`limen status` in both projects) and take the snapshot of 0.1; then, as root, `git -C /opt/limen fetch origin
  adrian-rebuild`, `git -C /opt/limen merge-base --is-ancestor <sha> origin/adrian-rebuild` and `git -C /opt/limen
  checkout --detach <sha>` with the full SHA of `a0.1.1` (D-046: the first deployment carries R-090), and run
  `node /opt/limen/seat/deploy.ts <sha>`, whose output names every registry and project it checked (R-090); it repeats
  every check and tags the commit (R-012). From a0.2.0 on, only 0.2 deploys.
- **1.1** In each project, `limen status` lists the leftover files of cut features (R-001–R-007, R-009); check the list, then
  run `limen init --drop-leftovers`.
- **1.2** A detached job still opens its log tab in Herdr, and `limen spawn --tab` refuses with the reason (R-005).
- **1.3** The GitHub module, only if it is connected: one `@limen` mention runs as a detached job (R-005).

### After stage 2 (a0.2.0)

- **2.0** Deploy a0.2.0 by 0.1–0.3: `node /opt/limen/seat/deploy.ts <sha>` with the full SHA from gate 5.2
  (`56f816820786d77e7cd13485ea20bb7fc78dd9d3`, D-082).
- **2.1** The record migration of R-021, from each project's root on the agents' account: `limen migrate --dry-run`,
  then `limen migrate` (D-057 (1)), with no job running or starting; the report lists every job, every id collision
  (item 10), every folder moved to `.limen/unmigrated/` and every file removed.
- **2.2** After `/reload`, the coordinator's session shows no extension error from Limen's hooks, which now take the
  Pi API from R-017's adapter and check events with its type guards; the type contract itself ran in the repository
  on the vendor copy of Pi 1.5.1 (D-055; item 16).
- **2.3** `limen stats` over the migrated history of both projects matches the counts known from gate 2: 142 jobs (84
  worker, 58 reviewer; T-33) and 18 failed (12 limit, 3 timeout, 2 stall, 1 exit; `audit.md` gate 2 §1, Q1) (R-024, R-097: the limits as `quota`;
  B.3).
- **2.4** `limen status` lists the `LIMEN_*` settings variables it finds in the environment (R-015); remove them from the
  coordinator's environment. The variables it lists as read until a ticket stay (D-052): `LIMEN_WORKER_MODEL`
  until 6.1, `LIMEN_COORDINATOR` until R-050, `LIMEN_PACKAGE` until R-049, the poller's `LIMEN_GITHUB_*` until R-059.

### After stage 3 (a0.3.0)

- **3.0** Deploy a0.3.0 by 0.1–0.3: `node /opt/limen/seat/deploy.ts <sha>` with the full SHA from gate 5.3.
- **3.1** `limen seat sweep --install` on the agents' account, with lingering on (when the command exits 4 naming it,
  root runs `loginctl enable-linger <account>` and the install runs again; a second install changes nothing). Then
  `limen seat sweep --status` prints `limen-sweep.timer is active`, `limen status` shows no `Sweep not working`
  section, and after the first minute `journalctl --user -u limen-sweep.service` ends with a final line of class `ok`
  and no `herdr is not available`. The old `limen-prune@ledger` and `limen-prune@synchronizer` timers were disabled on
  2026-11-17 (Adrian, `systemctl disable --now`; item 5, done); what remains is to check that `systemctl list-timers
  --all` shows no `limen-prune` (R-032). The engine facts R-032 relies on (`R-032-seat-sweep-timer/outcome.md` →
  `## Unmeasured`), during a trial job and after its end: as root, the job scope's `cgroup.events` under the agents'
  `user@<uid>.service/app.slice/` reads `populated 1` while the job runs and `populated 0` (or the folder is gone) after
  it, which the deployment gate reads; on the agents' account `systemctl --user is-active limen-job-<id>.scope` prints
  `inactive` or `failed` after the end and for a unit name that never existed (a scope systemd is still
  stopping prints `deactivating`, which R-032 reads as not ended); the seat's systemd 259 exits 4 for both, not the 3
  this step and the code expected (seen at a0.3.0); and `limen seat sweep` run by hand from an SSH and a
  Herdr shell of the agents' account ends with a final line of class `ok`, as the timer's run does.
- **3.2** From a Herdr pane on the agents' account, `systemd-run --user --scope true` exits 0 (item 12); during a trial
  job, `systemd-cgls` shows the engine and its tools in the job's scope, and `systemctl --user is-active --quiet
  limen-job-<id>.scope` exits 0 while the job runs and 3 after it ended, as it does for a unit name that never
  existed: R-026 takes exit 3 as a scope that is gone (R-026 review round 2, note 8); on the seat's systemd 259 both
  exit 4 (seen at a0.3.0; the record's cgroup decides first, so a job that recorded it is unaffected). A second trial job whose wrapper
  alone is killed (`kill -KILL` of the pid `limen show <id>` prints) is ended by the next reap: its record stays
  `running` until `systemd-cgls` shows its scope gone, then is `failed` with a log line that names the checks, and no
  process of the job is left (R-027).
- **3.3** Alerts: choose the new account names for every account of item 1 (the alerts account is the first), and
  create the alerts account (item 1); as root, write the ntfy topic to `/etc/limen/alerts-topic` (root-owned, mode
  0600) and run `node /opt/limen/seat/alerts.ts install --account <name>`, which grants the read rights, writes and
  verifies the units (`limen-alerts.service` runs `/usr/bin/node`) and enables the timer (D-085); install the ntfy app
  on the phone and subscribe (item 11); the first run sends nothing for old jobs, `limen status` shows no alerts
  warning, and a test failure of a trial job sends one line `<project> failed:<kind> <job id>` (D-084) (R-033).
- **3.4** At the next real 5-hour limit, whenever it comes (nothing waits for it; the fake engine's tests cover the
  mechanism): the job's record has kind `quota` and a reset time, exactly one resume runs 5 minutes after the reset
  (A-010, A-016), and the job's log shows whether a `rate_limit_event` arrived (the line `rate-limit event: <type>,
  resets <ISO time>`, from `kendex:rate-limit`) for the 5-hour and the weekly limit (item 12; E-9; R-029, R-034);
  the resumed job started from the sweep's unit (its log has no `launch` failure), and a completion wake owed during
  the limit reached the coordinator after the reset (D-097 (5) (h), (j)). Before a0.3.0 is deployed, on the agents'
  account: remove the link of `quota-resume.ts` from Pi's extensions folder, if there is one, since a0.3.0 deletes
  the file it points at (D-097 (5) (k)).
- **3.5** `limen rule` refuses and names the automatic resume; no `limen rule timer` process runs (`pgrep -af 'limen
  rule timer'` prints nothing); on the agents' account, `ls ~/.limen/rules` shows the old seat rules, which no code
  reads any more, and Adrian may delete the folder by hand (D-097 (3), (6) (d); R-102).
- **3.6** `limen status` lists finished jobs with unlanded work; resolve each with `limen continue <id>` or
  `limen abandon <id>` before the next spawn (R-030); the first `limen abandon` of a job whose Herdr tab is open closes
  that tab (`herdr` tab list before and after; T-28 (5), R-030); the marker migration of R-031 reports which landed
  jobs it marked and which it left without a marker.
- **3.7** Reboot test: jobs survive a Herdr restart (`systemd-cgls` before and after) (item 13; R-026).
- **3.8** A trial job's record holds the peak memory, the CPU time and the peak CPU share (`cpuPeakPercent`) of its
  scope, and a job that runs only `sleep 300` ends with kind `stall`, its log naming `scope CPU idle`; the scope's
  CPU time grew by less than 2 % of the wall time during that sleep (R-026, R-036). A job whose tool starts a busy
  loop detached from the tool, and whose next tool sleeps longer than the stall window, is not ended by the stall rule
  (R-036). `limen stop <id>` of a trial job ends it `stopped` with its reason; `kill -TERM` of
  a second trial job's wrapper alone (its pid from `limen show <id>`) ends it `failed`, kind `signal`, with one alert
  `<project> failed:signal <id>`, and its log shows `engine exited with code 143` and no `TERM grace elapsed` line, so
  Pi exited 143 within the grace (E-17; R-028). A gate file that
  holds a third trial job (`memoryFree` 100, `diagnoseAfter` `1m`, `failAfter` `3m`; `cpuIdle` 100 opens on an idle seat,
  whose rounded reading reaches 100) gives one coordinator wake with the
  diagnosis and one alert `<project> queue <id>` after a minute, and `failed:queue` after three (R-035); then the
  gate file is restored.
- **3.9** Land closes the job's Herdr tabs in its `cleaned` step: its watch tab and the tabs `limen open` and `limen
  diff` opened, `herdr tab list` before and after (R-103). A tab left open for a finished job of a closed feature is
  closed by the sweep's daily step, run from its unit: the tab is gone from `herdr tab list` and the journal of
  `limen-sweep.service` holds the close's line, not `herdr is not available` (R-101, D-096). `limen diff` opens its tab
  only with Hunk's binary on `PATH` and otherwise prints the git command; the seat has no Hunk (2026-11-25), so there
  land closes the tab of `limen open` only.
- **3.10** A trial job in each project reaches Claude with the allow-listed environment and runs the project's own
  checks, before the projects resume (D-012). Inside it: `env` names only the list's names (`docs/jobs.md`), Limen's
  own (`DISABLE_UPDATES` is `1`, `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_0`, `GIT_CONFIG_VALUE_0`, `GIT_TERMINAL_PROMPT`,
  an empty `GIT_ASKPASS`, `GH_CONFIG_DIR`, the engine's `LIMEN_*` transport) and those Pi and the bridge set on Pi's
  own process (`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`), with no `LIMEN_COORDINATOR`, `LIMEN_TEST_MODE` or other
  test knob; `printf 'protocol=https\nhost=github.com\n\n' | git credential fill` fails and prints no password, and
  the account has no `~/.netrc`, which git's HTTP transport reads with no helper (R-087 review round 3, note 1); `gh api
  user --silent` fails (no login reaches gh, one in a system keyring included), and outside the job `gh auth status`
  names where the account's token is stored, a file or a keyring (R-087 review round 2, note 2: a job's `gh auth
  status` lists no host once `GH_CONFIG_DIR` hides `hosts.yml`, even when a keyring login would still authenticate);
  `systemctl --user is-system-running` answers (the user bus a nested spawn needs). The job's log
  names what the list dropped, and the job's end wakes its coordinator (the wrapper's Herdr names). A name that a
  project's check needs and the list dropped is reported to the main session before the projects resume (R-087,
  D-017).
- **3.11** Not done (D-110): the plan of the account that owns `synchronizer` and `ledger` enforces no ruleset on a
  private repository (GitHub's banner on 2026-11-25), and Adrian keeps that plan. D1's watcher is R-106 (step 4.10);
  a project whose owner account's plan enforces rulesets gets one on `main` that forbids force pushes and deletion,
  set by that account's owner.

### After stage 4 (a0.4.0)

- **4.0** Deploy a0.4.0 by 0.1–0.3: `node /opt/limen/seat/deploy.ts <sha>` with the full SHA from gate 5.4.
- **4.1** The bridge contract (T-31): the bridge log of one coordinator turn and one job turn against the fake engine's
  model view of the same scenario (R-038; item 16).
- **4.2** The per-query CLI log shows the Limen context message in the request, whole and first, also for the largest
  role, and it does not start with `/` (E-14); after a manual `/compact` it is sent again (item 12; R-039).
- **4.3** A review job sees only its declared tools and skills, and the seat's Claude Code lists no tool it would load
  on demand (item 12; E-5; R-045).
- **4.4** A Polish message to the coordinator gets a Polish answer, and a ticket written from that conversation is in
  English (item 12; T-13; R-041).
- **4.5** An edit of a ticket in `spec/features/planned/` brings the vision reminder inside that tool result (R-043).
- **4.6** In the coordinator's Bash, `sleep 240` is refused with the wake sentence (R-047).
- **4.7** With every module off, the coordinator session loads no group hook (R-044).
- **4.8** Measurements after stage 4: M-02 and M-05 with a0.4.0 (M-01 is recorded by the main session at the close of
  the stage). Before it, the main session proposes a name-independent evaluator and a way to keep the attempts out of
  the production checkout, each leaving B.2's result unchanged (D-050).
- **4.9** Switch on, in each project's `.agents/limen/limits.json`, the modules its migration report lists as in use;
  until a0.5.0 Adrian edits the file directly, from then on only through the owner channel (R-044).
- **4.10** The `main` watcher (R-106, D-110): in each project's GitHub settings a read-only deploy key whose private
  half only the watcher's account can read; then the install that R-106 names. Its first runs fetch `main` of both
  projects and record no event, and the check of an alert that R-106's ticket names reaches the phone.
- **4.11** The alerts' unit with IPv4 first (R-109, D-108): as root, the alerts' install again as in 3.3, from
  `/opt/limen`; then remove the temporary drop-in `ipv4first.conf` of `limen-alerts.service.d/` and run `systemctl
  daemon-reload`. The next runs of the alerts' timer log no HTTP 429, and the next alert reaches the phone.
- **4.12** A trial job whose task puts a file write and `sleep 300` in one message is ended by the stall rule after 180 s
  of idle scope CPU: its log holds `stalled tool bash sleep 300` (R-108; the first stall trial of a0.3.0, `## State`,
  "`limen-rebuild-33`", was not).
- **4.13** The sweep's journal since the deployment holds no `was not ended: exit code 4` (`journalctl --user -u
  limen-sweep.service --since <deployment time> | grep -c 'exit code 4'` prints 0), and no `stuck` alert came for a
  job whose record has no cgroup (R-107).

### After stage 5 (a0.5.0)

- **5.0** Deploy a0.5.0 by 0.1–0.3: `node /opt/limen/seat/deploy.ts <sha>` with the full SHA from gate 5.5.
- **5.1** Accounts (item 1), with the names chosen in 3.3: create the owner channel account, which accepts only a
  separate key of Adrian's, kept on his own machines with no agent forwarding, and only with a forced command; move
  the GitHub write token to it; give the agents' account a read-only token (R-055).
- **5.2** Where a project has the ruleset of 3.11 (none of `synchronizer` and `ledger`, D-110), extend it: push only
  from the owner channel's identity (item 2; §7 D1; R-055). Elsewhere the owner channel's token is the only write
  credential (5.1), and the watcher of 4.10 alerts on any forced update or deletion of `main`.
- **5.3** Root-owned installs by the seat script: Pi 1.5.1, bridge 5.0.3 and Claude Code in a pinned version in a root
  directory (D-017; note the version in `## System requirements`), with Pi's install path confirmed, and the
  coordinator start script (item 3; R-049, R-050).
- **5.4** Coordinators start only through the start script, never by exporting `LIMEN_COORDINATOR`; a second start for
  the same project refuses and names the PID (item 4; R-050).
- **5.5** Remove the old seat extensions from the Pi extensions directory, and establish whether anything loads the
  extra Limen checkout in the agents' home (item 6; R-049, R-059).
- **5.6** In the coordinator pane, `limen` and `node` resolve to root-owned paths and `LIMEN_PACKAGE` is unset (item 7;
  R-049). Since 1.0 the agents' `limen` link already points at `/opt/limen/bin/limen` (D-051); what remains is that
  the link and `node` are root-owned.
- **5.7** The agents' account is not in `adm` or `systemd-journal` (item 8).
- **5.8** A job in isolated mode quotes the first rule of the "Real data" section of `CLAUDE.md`, and the per-query log
  shows the file loaded; a job quotes the project's `AGENTS.md` if one exists (item 12; E-7, E-15, D-005; R-048).
- **5.9** The per-query log shows the Claude Code binary the launcher pins, and its version (item 12; E-1, E-15; R-048).
- **5.10** The jiti cache path, Node's compile cache and the `-e` module resolution of a job (item 12; E-4; R-049).
- **5.11** Reboot test: Herdr restores the coordinator pane, and the start script registers it again (item 13; R-050).
- **5.12** An idle coordinator wakes when a job ends, a busy one gets the wake after its current turn, and its session
  shows the wake as a custom entry, not as a user message (E-16; R-051).
- **5.13** The coordinator calls the handoff tool at a threshold; the new session's first message is a pointer, and
  `limen handoff show` prints the note (R-052).
- **5.14** A steer reaches a worker with its origin prefix; a steer to a review job refuses (R-053).
- **5.15** The owner channel's timer publishes `main` after a land; a hand commit on `main` is refused by the hook; in
  a scratch project, a deliberate uncovered commit brings the `uncovered-commit` alert and `hold` recovers it (R-055).
- **5.16** Install the nftables rule and the proxy for the agents' account from the templates; the domain list starts
  from the template and grows only by measurement: run one job and one coordinator turn, read the proxy log, add the
  domains Claude Code under the bridge needs (B2c; R-056).
- **5.17** The GitHub module, only if it is connected: `limen github doctor` reports the new private state and no
  abandoned lock (R-057).
- **5.18** The status line loads from `seat/` in coordinators only, and the shared usage poller makes at most one
  request per 2 minutes, the endpoint's limit per account (A-047; R-059).
- **5.19** In a coordinator and in a job, `crontab -e` is refused; a timer Adrian creates by hand on the agents' account
  appears in the next sweep report and stays untouched (R-060).
- **5.20** After the migration: the coordinator and a job run the root-owned Claude Code (5.9), both environments
  have `DISABLE_UPDATES=1`, and the copy in the agents' home directory is removed (D-017; R-049, R-050).

### After stage 6 (a0.6.0)

- **6.0** Deploy a0.6.0 by 0.1–0.3: `node /opt/limen/seat/deploy.ts <sha>` with the full SHA from gate 5.6.
- **6.1** `limen init` in each project: `maxJobs`, the round limit, the routes with reasoning levels, the project gate
  command, the module switches (all off) and the test-line cap (item 9; D-004; R-062); then remove
  `LIMEN_WORKER_MODEL` and `LIMEN_REVIEWER_MODEL` from the environment (item 5).
- **6.2** The front-matter migration of R-061 with `--dry-run`, then for real; open tickets get a typed
  `## Acceptance` at their next spawn (item 10; R-063).
- **6.3** A review job's final message starts with `PASS <sha>` or `FAIL <sha>`, and its record holds the verdict and
  one answer per criterion (item 12; A-086, A-051; R-064).
- **6.4** The board migration of R-066 prints the old prose sections; what should stay goes into the milestone plan in
  `docs/` through a normal ticket.

### After stage 7 (a0.7.0)

- **7.0** Deploy a0.7.0 by 0.1–0.3: `node /opt/limen/seat/deploy.ts <sha>` with the full SHA from gate 5.7.
- **7.1** Before the migration of R-075, count the `needs-adam` keys in both projects; after it, the same number of open
  request records exists (item 10; T-21).
- **7.2** A footer entry does not reach the model: the next turn's input tokens do not grow by the footer's size (item
  12; T-15; R-073; M-12).
- **7.3** `limen decide --quote` accepts a quote from Adrian's last message and refuses one from a wake (R-072).
- **7.4** Job tabs in Herdr carry the label built by code (R-067).
- **7.5** A trial route through land by conditions, including one refusal (R-071).

### After stage 8 (a0.8.0)

- **8.0** Deploy a0.8.0 by 0.1–0.3: `node /opt/limen/seat/deploy.ts <sha>` with the full SHA from gate 5.8.
- **8.1** Groups, only when switched on: a trial group of two teams runs detached and lands through `limen group land`
  (R-077).
- **8.2** Research, only when G1.11 is switched on: create the research account with its own Claude login and an open
  network, install the queue scanner, submit one question (item 1; B2c; R-078).

### After stage 9 (a1.0.0)

- **9.0** Deploy a1.0.0 by 0.1–0.3: `node /opt/limen/seat/deploy.ts <sha>` with the full SHA from gate 5.9.
- **9.1** Measurements after the rebuild on the seat, by the same method as before: M-02–M-09 and M-11.

## Measurement

M-01, M-10 and M-13 are measured on the laptop by the main session when it closes a stage; every metric of model
behaviour or of the seat is measured on the seat, before and after, by Adrian (z. 40). Every before/after comparison of prompt-driven behaviour states its baseline:
"before" is today's seat, which runs with no system-prompt prose and with the per-turn cue (gate 2 §1–§2, revision 4);
"after" is the Limen context message plus the A-077 cue.

Same-task method (gate 2 §2, H-21; the same-task runner of R-011): a closed synchronizer M1 ticket that went through
several review rounds, run again from its parent commit in a scratch clone outside the projects' `.limen/`, never landed; identical
input (commit and ticket file), the same model and reasoning level, a clean state. An attempt is a whole coordinator
session with a fixed owner message and a fixed reply to every owner question (D-021). An attempt passes when the job
reaches `done` and the test files of the merged reference change pass on the job's tip together with the project
gate. The result is pass^k (all k attempts pass), reported next to the number of passing attempts; k = 3 per version,
because every attempt is a whole ticket on the shared Max window (z. 17).

| ID | Metric | Source | Before | After | Tickets |
|---|---|---|---|---|---|
| M-01 | Fixed context per role, bytes and ≈tokens | `node adrian-rebuild/tools/context-size.mjs <ref>` on the laptop; `--project` on the seat | `rebuild-base` (`evidence/context-size-rebuild-base.md`): system-prompt text the bridge drops, plus the cue that reaches the model | at the close of every stage from stage 4: the context message and the cue | R-039–R-047, R-086 |
| M-02 | One raw request per role (coordinator turn, job turn) | per-query CLI log with `CLAUDE_BRIDGE_DEBUG=1` | B.1, done 2026-11-17 (`## Engine facts`) | 4.8, 9.1 | R-039 |
| M-03 | Coordinator cache-read tokens per landed ticket (A-078) | `limen stats` | B.3, M1 history; reference from B.1: about 297k–313k cache-read tokens per coordinator request | 9.1, the next ten landed tickets | R-051 |
| M-04 | Coordinator cache-write tokens in the turn after a land (A-037) | `limen stats` | B.3 | 9.1 | R-039 |
| M-05 | Same-task pass^k, with per run: owner commands outside owner-channel actions (T-41, target 0), `sleep` calls and repeated `status` reads by the coordinator (T-34), share of model replies with their own Done / In progress / Waiting for you lines (T-15, target 0 from a0.7.0), reply language equal to the owner's (T-13), metaphors from the T-14 list in replies | same-task runner (R-011) and its transcript counts | B.2, `rebuild-base` | 4.8 (a0.4.0), 9.1 (a1.0.0) | R-011, R-039–R-047, R-067, R-073 |
| M-06 | Lead time per ticket, split into queue, job runs, checks, review and waiting for the owner | `limen stats` | B.3 | 9.1 | R-024, R-076 |
| M-07 | Tokens per landed ticket by class (input, cache write, cache read, output) | `limen stats` | B.3 | 9.1 | R-024 |
| M-08 | Owner touchpoints per landed ticket, by kind and cause (T-40) | `limen stats`; before: owner messages per ticket in the coordinator transcripts | B.3 | 9.1 | R-076 |
| M-09 | Peak CPU and memory per job scope; time two projects could not both run a job (T-43) | record fields of R-026; start-queue waits | B.3; queue waits only (22 waits, longest 48 min, gate 2 §1) | 9.1 | R-026, R-035 |
| M-10 | Run time of the gate at every stage tag (T-11) | gate-time tool (R-011), laptop | 79–88 s (`evidence/baseline.md`) | at the close of every stage, recorded in `evidence/` | every stage |
| M-11 | Failure kinds and rounds per ticket (A-016, A-015) | `limen stats` | B.3; gate 2 §1: 18 failed jobs (12 limit, 3 timeout, 2 stall, 1 exit) | 9.1 | R-029, R-069 |
| M-12 | A footer entry stays outside the model's context (T-15) | seat step 7.2 | — | 7.2 | R-073 |
| M-13 | Token budget of each role's context message (T-09) | the budget test of R-046, laptop | the size at the close of stage 4 | set by R-086 to the size measured then + 10 % (T-09) | R-046, R-086 |

The units of `limen stats` for M-03, M-04, M-06 and M-07 (R-098, D-098): a landed ticket is a land, a job with a
`landed` marker together with its `parent` chain and the reviewers of its branch; a coordinator turn is one assistant
message of Pi, which on the bridge sums the API requests of one Pi turn, so a cache read per turn is at least B.1's
per request; M-03 divides the sessions' cache read by the lands in their time span; M-04 is the cache write of the
first turn of the run after a land's `limen land` or `limen ticket done` call.

A ticket whose change cannot be measured here marks it `unmeasured` in its outcome with the M-NN above.

## Agents

Definitions: `.claude/agents/rebuild-implementer.md` and `.claude/agents/rebuild-reviewer.md` (tracked). The Polish
summary of each is a YAML comment inside the front matter, because Claude Code reads the front matter from the file's
first line; `check.mjs` accepts that form for these two files.

- **rebuild-implementer**: tools `Read`, `Grep`, `Glob`, `Edit`, `Write`, `Bash`; `disallowedTools`: `Agent`. Reads
  `ticket.md`, `taste.md` → Part B in full, the harness principles in `input/`, the plan's Decisions and Engine facts,
  and the findings the ticket names. Writes the failing test first, then the change; runs the gate, `check.mjs` and
  Biome; drafts `outcome.md`. Leaves HEAD and refs unchanged, stages only `git rm` and `git mv` of the paths that
  `## Change` names, and changes no reserved path (D-015). On a question it stops and replies `BLOCKED: <question>`
  with options and a recommendation; two failures of the same step also end in `BLOCKED`.
- **rebuild-reviewer**: tools `Read`, `Grep`, `Glob`, `Bash`; `disallowedTools`: `Write`, `Edit`, `Agent`. Gets only
  the paths of `ticket.md`, the diff file and `taste.md`; `ticket.md` quotes every decision and engine fact the change
  relies on, so the reviewer checks against them without other inputs. Replies with `PASS` or `FAIL` on line 1, one
  `<ID>: met | not met | unknown: <evidence>` line per criterion, findings as
  `blocking|note · proven|observed|guessed · <finding> · <evidence>` (T-08), and answers to the reviewer questions in
  the `Check` of every rule the diff touches. Verdict rule: `PASS` when every criterion is met and no finding is
  blocking, otherwise `FAIL`; a blocking finding is always `proven`, and a suspicion the reviewer cannot prove is a
  note. It runs single tests, never the full gate (D-015).

Mode criterion: `pair` when the ticket's substance is taste (CLI UX, names, messages, the tone of role prompts, the
shape of a ticket or the board) or when its acceptance cannot be checked by a command; `delegated` otherwise.

Template of `ticket.md` (`check.mjs` requires these headings in every ticket folder):

```
<!-- PL: <2–5 sentences in Polish> -->
# R-NNN <title>
## Problem
<what is wrong; the sources, quoting each finding's Decision and every plan decision and engine fact the change relies on>
## Change
<what changes; every path that is deleted or moved, and every file of adrian-rebuild/tools/ that changes, in backticks>
## Out of scope
## Acceptance
- AC-1: `<command>` → <expected result>
- AC-2 (judgment): <a criterion the reviewer judges, only where no command can check it>
## Migration
<the script and its fixture test, the refusal of an old CLI form, or "none">
## Risk
## Rollback
## Decisions
<answers to BLOCKED questions, review findings to fix, and Adrian's decisions, each dated>
```

Protocol per ticket (rebuild stage 5):
1. The next ticket is the lowest `planned` or `ready` ID of the current stage whose dependencies are all `done`: in a
   night run only among the `ready` tickets (D-054 (1)); by day among the `day` and `day-after` tickets as well
   (D-011). By day the session also makes the tickets of the coming night `ready` (D-054 (1)) and sends the variants
   sheet of every pair ticket whose dependencies are `done` (D-054 (3)).
2. The main session writes `adrian-rebuild/R-NNN-<slug>/ticket.md` and sets the ticket's status to `active`. A
   criterion checks only the ticket's scope, with its expected result as an exit code and no `!` before the command;
   the main session runs every grep and scan criterion at HEAD and confines it to the paths of `## Change` unless
   every match is one the ticket removes; a global property that a subsequent ticket makes true is that ticket's criterion
   (D-025). A criterion names only commands on the list of `## Commands`; a script that runs only on the seat is
   checked through its tests (D-036).
3. `delegated`: the main session runs `node adrian-rebuild/tools/review-guard.mjs snapshot --git --out
   node_modules/.rebuild-review/R-NNN.git`, starts
   `rebuild-implementer` by its name (not a fork) with the ticket folder's path, changes nothing in the working tree
   while it runs, and afterwards runs `node adrian-rebuild/tools/review-guard.mjs compare --git
   node_modules/.rebuild-review/R-NNN.git <ticket.md>`. It exits 1 when HEAD, a ref, git's config, hooks or
   `info/`, `.claude/settings.local.json`, a file in `input/` or a reserved path changed, or when the index holds anything but deletions and moves of the paths
   `## Change` names; that voids the run (z. 14), and Adrian decides. The allow-list cannot tell the two sessions
   apart, so this check is the guarantee. On `BLOCKED: …` the main session asks Adrian, adds the answer to `ticket.md`
   → `## Decisions`, takes a new `snapshot --git` with the same `--out` once it has changed a reserved path (D-035),
   and resumes the same agent with `SendMessage` to its ID. `pair`: the main session implements with
   Adrian.
4. The main session runs `node adrian-rebuild/tools/gate.mjs` itself; its run counts, not a subagent's report. For a
   change of mechanism it also runs `node adrian-rebuild/tools/fails-before.mjs`, which must exit 0 (the new and
   changed tests fail at HEAD), and puts its output into the draft `outcome.md` under `## Fails before`. When either
   fails after `DONE`, the main session resumes the implementer with the output; a second failure of the same step goes
   to Adrian (z. 1). The main session starts the gate once the subagent's final report (its hand-back) has arrived
   and `compare --git` exits 0, without waiting for the task's completion notification (D-059). A test that failed
   even once without a change of the code it runs
   is a finding: nobody runs it again to get a green gate (z. 17); by day the main session asks Adrian, at night it
   writes a question in `.night/questions.md` and the ticket waits (D-029).
5. Review: `node adrian-rebuild/tools/review-guard.mjs snapshot --out node_modules/.rebuild-review/R-NNN.before` and
   `node adrian-rebuild/tools/review-guard.mjs diff --out node_modules/.rebuild-review/R-NNN.diff` (an ignored
   directory, like the gate's helper, so the guard does not see the files; `--out` creates it and writes atomically,
   D-018), then `rebuild-reviewer` with the three paths, then `node adrian-rebuild/tools/review-guard.mjs compare
   node_modules/.rebuild-review/R-NNN.before`. Exit 1 voids the review: for each path the guard names, the main
   session runs `git restore --source=HEAD -- <path>` and `git apply --include=<path>
   node_modules/.rebuild-review/R-NNN.diff`; a file the reviewer created is removed by Adrian himself, because `rm` is
   denied to the sessions. Then `compare` must exit 0, and the review runs again. The guard compares HEAD,
   every ref, the index, `git status --porcelain` and a SHA-256 of every changed and untracked file, so a second edit
   of an already modified file is caught, which the status alone would miss (`tools/test-review-guard.mjs`). The main
   session saves the reviewer's reply to `node_modules/.rebuild-review/R-NNN.reply` and runs `node
   adrian-rebuild/tools/review-verdict.mjs node_modules/.rebuild-review/R-NNN.reply <ticket.md>`; exit 1 (an
   inconsistent verdict, AU-126) rejects the reply, and the review runs again; a second rejected reply goes to Adrian
   (z. 1).
6. The main session writes the round into `review.md`. It records why it rejects a finding, or adds the findings to fix
   to `ticket.md` → `## Decisions`; the fixes are made by the resumed implementer (`delegated`) or by the main session
   (`pair`), and the review runs again on the new diff. At most two rounds of fixes; then Adrian decides, and his
   decision goes to `ticket.md` → `## Decisions`. A round whose verdict is `PASS` and whose findings to fix touch only
   `docs/`, `outcome.md` or `review.md` is closed by the main session's own fixes, with no further round; a fix of code
   or tests still gets a round (D-053 (2)). Once the rounds are spent, Adrian decides only a blocking finding: a
   non-blocking note that needs code or tests goes to the notes of the ticket that rewrites that part, or to the
   outcome's open points when none does, by day and by night (D-092).
7. `outcome.md`, the `changes.md` entry (D-009), the status `done` in `## Tickets` and `## State`; then `check.mjs`
   and Biome on `adrian-rebuild`; one commit `R-NNN: <title>` with all of it; `git push origin adrian-rebuild`.
- No `SendMessage` to other sessions, no `ListAgents`, no agent teams; state passes only through files.
- In a night run, every "Adrian decides" and "asks Adrian" of steps 3, 4 and 6 follows the night mode that Adrian adds
  to the rebuild prompt before rebuild stage 5; a ticket that stops waits for the day, and so do the tickets that depend
  on it. There is no night run before that addition. A question of category A of D-054 (2) is decided by the night
  itself, recorded as a night default for Adrian to confirm in the morning, and does not stop the ticket.
- In a night run subagents run only in the foreground (D-026): `night.mjs` sets `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`,
  and the main session never resumes a subagent with `SendMessage`. Where steps 4 and 6 resume the implementer, a night
  run starts a fresh `rebuild-implementer` by its name with the paths of `ticket.md` and `review.md` (and, in step 4,
  the failing output in `ticket.md` → `## Decisions`); by day `SendMessage` stays. No command stands in for waiting:
  when the session cannot wait for a subagent, it updates `## State` and ends with the reason `cannot-wait`.
- Resume after a cut run (D-102 (4)): a session that finds a ticket `active` with a changed working tree first runs
  `node adrian-rebuild/tools/review-guard.mjs compare --git node_modules/.rebuild-review/R-NNN.git <ticket.md>`; exit
  1 voids the cut run, and Adrian decides; on exit 0 it starts a fresh `rebuild-implementer` by its name with the
  ticket folder's path and "the previous run was cut; finish from the working tree", then steps 4–7. A review cut
  before its reply was saved runs again from step 5.
- While `adrian-rebuild/.night/lock` is held by a live `night.mjs`, a day session only reads and changes nothing in the
  repository (D-102 (1)); `handover.mjs start` and `close-previous` refuse then (D-102 (5)).

## Commands

The Bash commands rebuild stage 5 runs, for the allow-list in `.claude/settings.local.json` (D-016; untracked, excluded
in `.git/info/exclude`; `disableBypassPermissionsMode` set to `disable`). The rules there apply to the main session and to both subagents alike: the reviewer's read-only
limit comes from its definition and from `review-guard.mjs` (a change voids the review), and the implementer's from
its definition and from `compare --git` (protocol step 3), not from the list; the rows below name who runs what, which
the definitions follow. Commands run from the repository root,
with relative paths, never through `cd`.

Rules of form (D-016):
- Every part of a compound command (`&&`, `;`, `|`) must match a rule, so the sessions run single commands, use no
  `cd`, and pipe only into commands on the list.
- No variable assignment before a command (`TMPDIR=… node …` breaks the match of an allow rule); a tool sets its own
  environment, as `gate.mjs` and `fails-before.mjs` do through `gate-env.mjs`.
- No redirection: a tool of `tools/` writes its file with `--out <file>`, atomically and creating the directory
  (`atomic-write.mjs`), and keeps stdout for its result; `check.mjs` rejects a `>` in their commands in this section,
  in `## Agents` and in the subagent definitions (D-018).
- Night runs go through `tools/night.mjs`, which runs `claude -p` with `--permission-mode dontAsk`: a command off the
  list is refused and a write to a protected path is denied. Adrian starts it in a terminal; it is not on the list, so
  no session starts a night run of its own (D-019).

Adrian writes `.claude/settings.local.json`; the rebuild session never changes its own permissions. He adds the
command string of the gate-time tool (R-011) after its `outcome.md` (R-017's contract runs inside `node --test`, D-055),
and the stage-2 rows at the start of stage 2.

Every stage:

| Who | Commands |
|---|---|
| everyone: reading | `git status`, `git diff`, `git log`, `git show`, `git ls-files`, `git rev-parse`, `git cat-file`, `git grep`, `git for-each-ref`, `ls`, `cat`, `head`, `tail`, `wc`, `grep`, `find` (without `-delete` and `-exec`), `sed -n`, `sort`, `uniq`, `cmp`, `diff`, `file`, `command -v` |
| reviewer: checks | `node --test <test file>`, `node bin/limen <args>` on a test fixture (never the full gate, D-015) |
| main session, implementer: checks | `node adrian-rebuild/tools/gate.mjs`, `npm run check`, `npm run typecheck`, `npx tsc --noEmit`, `npx biome check --error-on-warnings <path>`, `node --test <test file>`, `node adrian-rebuild/tools/check.mjs`, `node --test adrian-rebuild/tools/test-changes-entries.mjs`, `node --test adrian-rebuild/tools/test-review-guard.mjs`, `node --test adrian-rebuild/tools/test-fails-before.mjs`, `node --test adrian-rebuild/tools/test-review-verdict.mjs`, `node --test adrian-rebuild/tools/test-night.mjs`, `node --test adrian-rebuild/tools/test-tool-calls.mjs`, `node --test adrian-rebuild/tools/test-handover.mjs`, `node --test adrian-rebuild/tools/test-ticket-rules.mjs`, `node --test adrian-rebuild/tools/test-decision-guard.mjs`, `node --test adrian-rebuild/tools/test-gate.mjs`, `sh adrian-rebuild/tools/test-pre-push.sh`, `node bin/limen <args>` on a test fixture |
| main session, implementer: changes | `npx biome format --write <path>`, `npm ci`; `git rm <path>`, `git rm -r <path>` and `git mv <old> <new>` on the paths a ticket's `## Change` names (the cuts of stage 1, R-042 and R-059 replace files, R-083 renames test files, and others); every deletion and move goes through them, so the list stays the same every night (D-014) |
| main session only | `node adrian-rebuild/tools/review-guard.mjs snapshot --out <file>`, `snapshot --git --out <file>`, `diff --out <file>`, `compare <file>` and `compare --git <file> <ticket.md>`; `node adrian-rebuild/tools/fails-before.mjs`; `node adrian-rebuild/tools/review-verdict.mjs <reply> <ticket.md>`; `git restore --source=HEAD -- <path>` and `git apply --include=<path> <diff>` (after a void review); `git add <paths>` (`git add -A -- <paths>` for deletions and renames), `git commit`, `git push origin adrian-rebuild`; `sh adrian-rebuild/tools/install-hooks.sh` (after a move or a new clone); `node adrian-rebuild/tools/handover.mjs start <n>` and `node adrian-rebuild/tools/handover.mjs close-previous` (by day, D-047); at the close of a stage `git tag <tag> <sha>` (local), the gate-time tool of R-011 (`node adrian-rebuild/tools/gate-time.mjs --out <file>`) and, from stage 4, `node adrian-rebuild/tools/context-size.mjs <ref>` |

In addition, per stage:

| Stage | Commands | For |
|---|---|---|
| 2 | `npm pack @earendil-works/pi-coding-agent@1.5.1 @earendil-works/pi-ai@1.5.1 @earendil-works/pi-agent-core@1.5.1 @vanillagreen/pi-claude-bridge@5.0.3 --pack-destination adrian-rebuild/input/vendor`, `mkdir -p adrian-rebuild/input/vendor/<package>`, `tar -xzf <tarball> -C adrian-rebuild/input/vendor/<package>`, and the contract script of R-017 on that copy; the only network access besides `npm ci` and `git push origin adrian-rebuild` | the type contract of R-017 (T-32 (2)) |
| 3 | none: scopes, units and timers are tested on fakes (T-28 (5)); `systemd-run`, `systemctl` and `loginctl` are seat steps | — |
| 4 | `node adrian-rebuild/tools/context-size.mjs <ref>` for the implementer too | R-039 |
| 5–8 | none: `nft`, `systemd-analyze`, `ssh` and account setup are seat steps | — |

Deny rules (never on the allow list): Edit and Write on `.claude/**` and `adrian-rebuild/input/**`; `git push` of any
other ref, `git push --force` or `-f`, `git push --delete`, `git reset --hard`, `git rebase`,
`git tag -d`, `git branch -d` or `-D`, `git checkout` or `git switch` of another branch, `git stash`, `git clean`,
`--no-verify`, `npm install` (only `npm ci`) and `npm install -g`, `sudo`, `curl`, `wget`, `ssh`, `python3`,
`systemctl`, and `rm` and `mv` (deletions and moves go through `git rm` and `git mv`).

## State

Updated 2026-11-26 by day (`limen-rebuild-35`: D-105's `Tools:` commits, in "`limen-rebuild-35`" at the end of this
section; before it `limen-rebuild-34`: the close of stage 3 on the seat goes on, D-109–D-111, in
"`limen-rebuild-34`" at the end of this section; before it `limen-rebuild-33`: the close of stage 3 on the seat with
Adrian, D-106, step by step in "`limen-rebuild-33`"; before it `limen-rebuild-32`: gate 5.3 decided, D-107; R-103 `done`,
stage 3 closed at `a0.3.0`, gate 5.3 open with Q-51–Q-55 in
"Gate 5.3 summary" at the end of this section, after "`limen-rebuild-32`" and "Close of stage 3".
Before it `limen-rebuild-31`, before the night: R-103 `ready` in "`limen-rebuild-31`" at the end of
this section; before it `limen-rebuild-30`, after R-036; R-029, R-032, R-034 and R-036 are `done`, by day, in
"Evening of 2026-11-23", "R-034 in `limen-rebuild-29`" and "R-036 in `limen-rebuild-30`" at the end of this section,
the next ticket in `Next` 2), rebuild
stage 5 in plan stage 3: stage 1 is closed
at `a0.1.1` (deployed on 2026-11-20, with B.2 closed by D-050); stage 2 is closed at `a0.2.0` (gate 5.2 decided,
D-078–D-082; deployed on 2026-11-23/24 with B.3's a0.2.0 part, "Evening of 2026-11-23"); stage 3 has started: R-026, R-030 and R-033 are `done` (by day), R-027, R-028, R-031, R-035 and R-100
`done` in the night of D-091 (until 09:00; it ended with `no-ticket`), D-092 settles its Q-42 and Q-43, and D-083's
decision guard is built (D-086); D-093 confirms that night's defaults, D-094 splits R-032, R-034 and R-037 (new
R-101–R-103), D-095 adds the kinds `launch` and `internal`, R-029, R-032, R-036, R-037 and R-087 are `ready`, D-096
makes R-103 and D-097 makes R-034, R-101 and R-102 `ready` behind their dependencies, and D-098 makes R-098 `ready`
with its `ticket.md`, so every stage-3 ticket is `done` or `ready` (the four "Day session of 2026-11-23" entries, just
before `Next`). The
newest entries are at the end of this section: the close of stage 2 in "Close of stage 2", the gate in "Gate 5.2
decided", the start of stage 3 in "Start of stage 3", the guard and R-026 in "D-083's decision guard", R-030 and R-033
(with D-087–D-091) in "R-030", the night's preparation in "The night of D-091 prepared", the night itself in
"Night run of 2026-11-22/23", and D-092 in "Morning of 2026-11-23".

Handover of 2026-11-19 (D-033, at 37 % context, after the commit `R-014:`): `limen-rebuild-5` started
`limen-rebuild-6` in `tmux` in remote-control mode (14:10) and ended. WSL booted at 10:34 on 2026-11-19, after the
`.wslconfig` was written (2026-11-18 16:48), so no WSL window has to stay open. `limen-rebuild-6` took over (its push
notification was skipped as redundant: the terminal was active). The handover after it is `limen-rebuild-7`.

Handover of 2026-11-19 (D-033, at 30 % context): Adrian ends `limen-rebuild-4` himself (`/exit`) and starts the next
day session himself with the first message of the rebuild prompt; it starts R-014 with him. Two older sessions were
still alive at 10:09 and should be closed by Adrian, since either would work on the same tree if woken:
`limen-rebuild-3` in `tmux` (`tmux kill-session -t limen-rebuild-3`) and a `claude -c` started at 16:30:47 on
2026-11-18 in a WSL window, hung on a `git grep … | sort` (Esc, then `/exit`; the window stays open while the
`.wslconfig` is not applied).

Handover (D-033): `limen-rebuild-2`, started in `tmux` at 16:17, died at 16:22:59 together with its running
implementer of R-003, when WSL stopped the distro. `tmux` does not keep WSL alive: without a
`%UserProfile%\.wslconfig`, WSL stops a distro about 15 s after its last terminal window closes
(`instanceIdleTimeout`, default 15000) and the VM about 60 s after the distro (the previous boot's journal: "System is
powering down" with no command before it; Windows did not restart). At Adrian's request the main session wrote
`%UserProfile%\.wslconfig` with `[general] instanceIdleTimeout=-1` and `[wsl2] vmIdleTimeout=-1`; it applies from the
next WSL start, and Adrian declined a restart and keeps a WSL window open instead. A session Adrian started in the
repository took R-003 over at step 3, closed R-003 and R-004, and handed over at 31 % context to `limen-rebuild-3`,
started in `tmux` in remote-control mode with the first message of the rebuild prompt (20:35); it closed R-005 and R-006 and
handed over at 31 % context to `limen-rebuild-4`, started the same way. WSL booted at 16:30:17 and the `.wslconfig`
was written at 16:48:28, so it is not applied yet: a WSL window must stay open. Your first act as the next session: send Adrian a push notification (PushNotification, one line in
Polish) that your session takes over the rebuild at the first ticket of `Next`; then go on with `Next`. The next
handover is `limen-rebuild-5`, once a WSL window is open or WSL started after
the `.wslconfig` was written (`uptime -s`). Read your context share at every safe point with `cat
~/.claude/context/<session id>.json` (the session id is the UUID in your scratchpad path; `context_used_percentage`,
`five_hour_used_percentage`, `seven_day_used_percentage`); at 30–50 % hand over, at 50 % at once (D-033, and the
project memory note on the handover).

Done:
- Rebuild stages 0–3 with gates 0, 2 and 3 (D-001–D-007); rebuild stage 1 has no gate.
- Rebuild stage 4: `## Vision`; `## Terms`; `## Decisions` with the verbatim copy of gate 2 §2; `## Stages` (9 stages,
  tags a0.1.0–a1.0.0, the cost and the effect of each); `## Tickets` (R-001–R-087: every `fix` finding and every taste
  rule except T-17 is a source of a ticket; the `Run` column); the 16 gate-2 owner actions placed in `## Deployment`,
  with the resumption of the projects; `## Measurement` (M-01–M-13); `## Agents` with the two definitions in
  `.claude/agents/` and `tools/review-guard.mjs` with its test; `## Commands`. `check.mjs` checks the plan (stages,
  tickets, sources, the dependency graph, `Run`, seat steps, the deployment call per stage, the copy of §2), the Polish
  summaries and, from rebuild stage 5, the ticket folders and `changes.md` (`tools/changes-entries.mjs`, tested). Two
  cold reads by fresh subagents (35 and 22 remarks, resolved): `evidence/plan-cold-read.md`.
- Gate 4 (2026-11-17): Q1–Q3 → D-008–D-010 (the root deployment script R-012 in stage 1, which absorbs D3, so tickets
  R-012–R-059 of commit `cdf3e78` are R-013–R-060 now; the `changes.md` format; seat tools in TypeScript). Adrian's
  additions → D-011 (night runs: R-013 and R-014 in stage 1, R-067 and R-069–R-071 in stage 7, the `Run` column; the
  cost and effect per stage; the resumption; `## Commands`; two exposed dependencies: R-067 on R-069, R-081 on
  R-082–R-086). Q4 and Q5 → D-012 and D-013 (the projects resume after a0.3.0 as an accepted risk with a deadline; T1
  as R-087 in stage 3, split from R-048; step 3.11; the weekly limit). The plan accepted after two corrections → D-014
  (the land rule of stages 3–6; `git rm` and `git mv`). Q6 → the date 2026-11-21 in D-012. The definitions accepted
  after corrections → D-015 (`review-guard.mjs compare --git`, `fails-before.mjs`, `review-verdict.mjs`, `gate.mjs`,
  each with a test).
- The old `limen-prune` timers on the seat were disabled on 2026-11-17 (Adrian); step 3.1 checks it.
- The night mode is in the rebuild prompt (v6) and `.claude/settings.local.json` is written (D-016). `tools/night.mjs`
  (D-019) is done with its test and a review by `rebuild-reviewer`: `evidence/night-runner/` (ticket, review,
  outcome).

Night run of 2026-11-17 (until 07:00; commits `d51cc24`, `6968edf`, `e444106`):
- R-001 `blocked`, Q-1: the 3,500-line cap of `test/` left one line, so its three new test files could not pass the
  gate; R-010 removes the cap. Recommended: R-001 depends on R-010. Its `ticket.md` is written; nothing is implemented.
  R-002–R-007 and R-009 depend on R-001, and R-012 on R-002, so they wait for the answer.
- R-008 `done` (review PASS in one round). For Adrian to confirm: R-008 leaves the LaunchAgent installer (`limen sweep
  --install`, `--uninstall`) to R-032, which replaces it with the systemd installer, because R-008 has `Mig. —` and
  cutting the installer would change the CLI (R-008 → `ticket.md` → `## Decisions`).
- R-010 `done` (review PASS in one round): the author's `spec/` and the docs of gate 2 §6 left the tree, and the
  3,500-line cap of `test/` is gone, so Q-1's cause no longer exists; R-001 stays `blocked` until Adrian's answer.
- R-011 `blocked`, Q-2: whether a same-task attempt is a whole coordinator session (M-05, T-40 and T-41 count the
  coordinator's behaviour; it needs Pi's headless RPC mode, so the row's API `—` would become `pi`) or one worker job.
  Recommended: a coordinator session. No ticket folder yet.
- R-013 `blocked`, Q-3: where the final JSON line `{class, code, next}` carries the data of a successful command, above
  all the job id that `spawn` prints on its last line today. Recommended: an optional typed field (`id`). No ticket
  folder yet.
- `check.mjs` and the `Status` column accept `blocked` (the night mode of the rebuild prompt v6).
- No stage-1 `night` ticket could start after that (R-014 is `pair`, `day-after`), so the night ended with `no-ticket`
  (`.night/status.json`). Gate 5.1 is not due: stage 1 has 9 tickets left.

Day session of 2026-11-18 (Adrian's answers, moved from `adrian-rebuild/.night/questions.md`, whose entries are
marked resolved):
- Q-1 → D-020: R-001 depends on R-010 (done); R-001 `planned`, and its `ticket.md` → `## Decisions` holds the answer.
- Q-2 → D-021: one same-task attempt is a whole coordinator session through Pi's RPC mode, with Adrian's four
  additions (touchpoints, time limit, a void attempt at the subscription limit, a clean copy without `origin` and
  hidden tests); R-011 is size L with API `pi` and the seat check in B.2; R-011 `planned`, its `ticket.md` is written
  from D-021.
- Q-3 → D-022 and `taste.md` → T-37: an optional field `ids` in the final JSON line; R-013 `planned`, its
  `ticket.md` is written from D-022.
- The R-008 point → D-023: the LaunchAgent installer goes with R-032.
- D-024: the main session starts the night runner when Adrian asks for it in the conversation.

Night run of 2026-11-18 (until 07:00; the runner's log: 00:19:25–02:08:14; commits `40846ea`, `f688cb4`, `c733f0e`):
- R-001 `blocked`, Q-4: AC-6 (`git grep -n '"templates/agents.md"' -- src hook` → one line) fails at HEAD, because
  `hook/communication.ts:307` (the `AGENTS.md` fallback that R-040 cuts) matches besides the tracked list; the error is
  the ticket's. Recommended: narrow AC-6 to `src`. Nothing implemented; R-002–R-007, R-009 and R-012 wait with it.
- The day session's note that the `ticket.md` files of R-011 and R-013 were written was wrong: neither folder existed
  at `edaafe2`. The night run writes them from D-021 and D-022.
- R-011 `done`: the same-task runner (`tools/same-task.mjs` with `run`, `evaluate`, `report`; `pi-rpc.mjs` is the
  only module of Pi's RPC protocol, declared from Pi's documentation because the tarballs come only in stage 2, so
  B.2's seat check confirms it first) and the gate-time tool (`tools/gate-time.mjs`). Review FAIL in round 1 (one
  blocking finding), PASS in rounds 2 and 3 after two rounds of fixes; the four notes of round 3 are Q-6 (a fix ticket
  before B.2 or not). For Adrian: add `node adrian-rebuild/tools/gate-time.mjs --out <file>` to
  `.claude/settings.local.json` before the close of stage 1; the main session's choices in R-011 → `ticket.md` →
  `## Decisions` (the tools in `tools/`, the declared protocol, every owner turn answered and counted) are open to
  change at gate 5.1.
- Q-5 (no ticket blocked): a resumed subagent works in the background, so the main session kept its turn open by
  running `npx tsc --noEmit` about 150 times; two `grep` calls outside the repository, meant as a longer wait, were
  denied by the permissions and not worked around. Recommended: a `tools/wait.mjs <seconds>` on the list.
- Q-6 (no ticket blocked): whether R-011's round-3 notes get a fix ticket before B.2 (recommended: yes, S, `night`).
- R-013 `blocked`, Q-7: four commands fail by setting `process.exitCode = 1` and returning (`ticket check`, `picture
  build --strict`, `webhook test`, `github poll`), which the ticket did not list; making them throw breaks item 7's
  ratchet arithmetic. Recommended: a plain `Error` at the four sites and the ratchet "at most the parent's count".
  Its `ticket.md` is written (the main session's reading of `code`: an identifier on failure, `0` on success, for
  Adrian to confirm at gate 5.1); nothing is implemented.
- Ended at 02:08 with `no-ticket` (`.night/status.json` modified at 02:07:57, the run's end at 02:08:14 in
  `.night/launcher.log`; the session's own "02:10" was a guess, as D-019 expects): every other stage-1 `night`
  ticket depends on R-001, and R-014 is `pair`. Gate 5.1 is not due: stage 1 has 10 tickets left.

Start of the day session (checked 2026-11-18, 09:01): the night's last commit `c733f0e` is pushed (`HEAD` =
`origin/adrian-rebuild`), the tree is clean, no `night.mjs` runs and its lock is released. The day session starts from
the commit that records this, whose parent is `c733f0e`.

Day session of 2026-11-18, continued (Adrian's answers to Q-4–Q-7 in the conversation, written into
`.night/questions.md`, whose entries are marked resolved):
- Q-4 → D-025: a criterion checks only the ticket's scope, with an exit code and no `!`; R-001's AC-6 covers the
  paths of its `## Change`, the global check goes to R-040; `check.mjs` rejects a criterion that starts with `!`;
  protocol step 2 runs every grep and scan criterion at HEAD. R-001 `planned`.
- Q-5 → D-026: subagents only in the foreground at night (`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` from
  `night.mjs`), a fresh implementer per night fix round, the reason `cannot-wait`, tool calls per commit counted by
  `night.mjs`; the protocol in `## Agents` is amended. `night.mjs` is changed (commit `6c2cce7`), with the new module
  `tools/tool-calls.mjs` (the count, a side channel whose failure is a line in the log) and their tests
  (`evidence/night-runner-d026/`: review FAIL in round 1, PASS in rounds 2 and 3). Unmeasured until the first night
  with it: that the real `stream-json` has the fields the count reads, and that no subagent runs in the background.
- Q-6 → D-027: R-088 (`pair`, `day-after`, S) fixes R-011's round-3 notes before B.2.
- Q-7 → D-028 and `taste.md` → T-02: only the wrapper sets the exit code; R-013's `ticket.md` is rewritten from it,
  and R-013 depends on the cuts R-002–R-007 and R-009. R-014 also cuts `group wait`. R-013 `planned`.
- The stage-1 criteria were checked under D-025: R-001's AC-6 and R-013's AC-4 and AC-5 changed; no other written
  `ticket.md` of stage 1 has a criterion that a subsequent ticket makes true. Commit `e8c9a47`.
- R-001 `done` (a fresh `rebuild-implementer`; review PASS in rounds 1–3, two rounds of fixes: each `dropped` line
  right after its removal, an overlap rule for the registry, one reason per test, the docs of `status --all`, the
  rule's comment). `LEFTOVERS` is empty; every cut ticket registers its paths, and the registry test rejects an entry
  that overlaps another or a `TRACKED` path.
- The gate was not stable in R-001: the implementer saw the lock-contention test `test/s9-housekeeping.test.ts:135`
  fail alone once in four runs (39 of 41 registrations); one run of the main session failed 93/96 on that test and on
  two of `test/s2-hosted.test.ts` (`limen highlight …` timed out at 180 s, `hosted Pi stop …`), started while the
  implementer's process was still ending, with both gates on the same cache directory (the likely cause, guessed);
  the main session ran the same tree again and it passed 96/96, before D-029 forbade that. → D-029: A-087 (high, fix
  in R-019), and the protocol rule that a test that failed once is a finding and is never run again for a green gate;
  the main session starts the gate only after the subagent's completion notification. The two `s2-hosted` tests are
  cut with hosted jobs (R-005) and `highlight` (R-006). For Adrian: the same rule in the definition of
  `rebuild-implementer`, which the sessions cannot write (the text is in the day session's reply).

- R-088 `done` (pair): Pi is stopped before the jobs at the time limit and at exit 4, a job without `state` or
  `pid` is stopped again once it has both, the comments state when a job lacks them, and every test waits at most
  3 s. Review FAIL in rounds 1 and 2 (a false comment each), PASS in round 3; two comment fixes after it without a
  fourth review (Adrian). B.2 can run on the seat once a0.1.0's other prerequisites hold.
- D-030 (how the day session talks to Adrian; also in the project memory): a message that needs his action carries
  the full text, file, place and command; decisions are asked in plain messages, never through `AskUserQuestion`.
- Adrian pasted D-029's rule into `.claude/agents/rebuild-implementer.md` (commit `175d75a`).
- D-031: until R-019, a gate that fails only on A-087's test is recorded in the outcome as an occurrence and run once
  more (`## Agents`, step 4). D-032: `.gitignore` ignores `.*.swp` (an open editor had failed `check.mjs`).
- R-002 `done`: finish webhooks, coordinator signals and the finish ping are cut; the coordinator registration stays
  for `limen rule` (`src/integrations/coordinator-registration.ts`) until R-034; `src/old-names.ts` is the table of
  old command names (T-18), to which every cut ticket that removes a command adds its entry; `LEFTOVERS` holds four
  paths. Size L (was M). Review PASS in rounds 1 and 2; gate 92/92. The refusal wording is for Adrian at gate 5.1.
- Seat checks by Adrian (2026-11-18): the seat registry holds both projects, both have their `.limen/`, and no
  registry lock is held (A-087 has caused no loss there); the seat-level files of the removed webhook docs do not
  apply to the seat.
- The main session's estimate for a0.1.0 (2026-11-18): about 19–24 hours of work for the ten tickets left (now seven)
  and the close, so 2026-11-19 late or 2026-11-20. D-012's date of 2026-11-21 for a0.5.0 cannot hold (stages 2–5 are
  47 tickets); Adrian takes that decision again on that date (D-012).
- R-003 `done`: Devin (`src/runtime/devin.ts`, `--engine devin`) and the Linear mirror (`limen linear`,
  `templates/linear.md`) are cut. `src/old-names.ts` has the `linear` entry and a second list `OLD_ENGINES` with
  `removedEngine`, where R-004 adds `omp`; `engineProfile` and `resolveSpawnEngine` refuse a removed engine with its
  line, and `limen continue` checks the recorded engine before the transcript, because a Devin record has none (the
  implementer's deviation 1, which the review accepted). `LEFTOVERS` holds seven paths. Review PASS in rounds 1 and 2
  (round 1's first reply was rejected by `review-verdict.mjs` on its format and sent again); gate 95/95. For Adrian,
  outside the projects: the Devin CLI login and the `DEVIN_*` and `LIMEN_DEVIN*` variables, if the seat has them
  (outcome → Open points 1); both refusal wordings at gate 5.1.
- R-004 `done`: the OMP engine is cut: its profile, OMP's skill configuration (`omp config get`), its bridge route,
  the persistent-shell rule of the bash-call counter, OMP's multi-file edit, read selector and `session_stop` in the
  hooks, and the stub `limen init` copied into `.omp/extensions/limen.ts`, which is now a leftover file (`LEFTOVERS`
  holds eight paths). `OLD_ENGINES` has `omp`; the one engine is Pi. The seat runbook follows Adrian's variant (a):
  `pi --version` is checked, `herdr integration install pi`, `moshi-hook install` without `--target`, the coordinator
  starts with `pi`. The two hosted OMP tests of `test/s2-hosted.test.ts` went (R-005 cuts hosted jobs next). Size L
  (was M). Review FAIL in round 1 (two blocking findings in the docs and the manual, fixed with three notes), PASS in
  round 2 (a fresh reviewer, because the first one's reply was held back by the harness); gate 96/96. For Adrian on
  the seat, before a0.1.0: `grep -n LIMEN_ENGINE ~/.bashrc` on the worker account (remove `export LIMEN_ENGINE=omp` if
  it is there) and which target `moshi-hook` was installed with (`moshi-hook status`); the refusal wording at gate 5.1.
  Unverified in the repository: that Pi 1.5.1 fires no `session_stop` and sends no `paths` or `path:N-M` (B.2's seat
  check; the outcome's Risk).
- R-005 `done` (delegated): hosted jobs are cut: the hosted supervisor, the pane ownership proof and its
  uncertainty, `hook/hosted.ts` and every hosted branch of spawn, continue, stop, reap, recovery, the readers and the
  wake. The GitHub module runs a review or task as a detached job (90 min, 900 tool starts, the start queue) and
  matches its record by shape, without `hosted` or `started`; groups are detached, with a log tab per team
  coordinator. `--tab` on `spawn`, `continue` and `group start` refuses with a line of the new `OLD_FLAGS` table
  (`src/old-names.ts`); `--detached` is accepted and changes nothing until R-014. The running job's note is named
  `advisory` everywhere. No leftover files (hosted mode wrote only job folders). Review FAIL in round 1 (one blocking
  sentence in `docs/remote.md`, three notes fixed), PASS in round 2; gate 102/102. For Adrian: step 1.0 must show no
  running job (a hosted job would keep Pi in its pane); the main session's choices in `ticket.md` → `## Decisions`
  and the refusal wording at gate 5.1; `src/job/wake-text.ts:153` still says "open the tab and exit" in the advisory
  wake (outcome → Open points 2, for the wake rewrite of stage 5); `src/project/picture-tick.ts:19` still names
  `--tab` until R-007.
- R-006 `done` (delegated): private planning is cut (committed mode only; `.limen/planning-source` is a
  leftover file), and so are `limen planning`, `highlight`, `ticket-author`, `wait`, `ticket series`, `continue
  --review` and `group status --json`; each refuses with a line of `src/old-names.ts` (`ticket series` inside
  `ticket.ts`, `group status --json` through the new `refuseRemovedWords`), and `/limen <removed word>` in the wake
  hook notifies the refusal instead of toggling mute. The test helper `waitJob` watches the job's `state` in a child
  process instead of calling `limen wait`. Review PASS in round 1 (the first reply was rejected by
  `review-verdict.mjs` on its format and sent again); gate 108/108. For Adrian at gate 5.1: the refusal wordings; on
  the seat (optional): `$LIMEN_HOME/.limen/highlight` and `$LIMEN_HOME/.limen/series/` may be deleted.

- R-007 `done` (delegated, `limen-rebuild-4`): the Picture viewer (`picture/viewer/*`, the page `/`, `map.html`),
  `picture tick`, `picture watch` and the `picture` role are cut; `picture build` checks the map and writes the model
  only with `--json`; `picture serve` serves `/activity.json` and `/events` from the primary checkout's jobs, with no
  map. Refusals: two `OLD_NAMES`, two `OLD_FLAGS` and the new `OLD_ROLES` with `removedRole` (`resolvePreamble`
  refuses a removed role unless the project defines it), where R-009 adds `scout`. `LEFTOVERS` entries may carry a
  `marker` (counted only on a regular file that contains it, the folders on its path checked first, since `.git` is a
  file in a job worktree); the watch hook `.git/hooks/reference-transaction` is one, beside four `.limen` paths.
  A-088 and D-034 (with its correction): `waitJob` waits for `pid` to go; the keeper test's failure that raised it was
  environmental (git 2.34.1 without the gate's shim, outside `gate.mjs`), so a direct `node --test` of a test that
  runs `git worktree list` is no evidence on this laptop. D-035: a new `snapshot --git` after the main session edits
  a reserved path during `BLOCKED` (this run's `compare --git` was void for that reason; Adrian accepted it). Review
  PASS in round 1 (nine notes: one fixed in `outcome.md`, eight rejected with their tickets); gate 127/127. For Adrian
  at gate 5.1: the refusal wordings; outcome → Open points 5 (whether the seat still has a retired
  `limen-picture.timer`, which `docs/seat/README.md` no longer mentions); on the seat, step 1.1 now also lists a marked
  watch hook.

Night run of 2026-11-19 (until 07:00; `night.mjs` run 1 started at 00:08:19):
- R-009 `done` (delegated): the scout role (`templates/scout.md`, the manual's shape, table and escalation line, the
  scout wake) and the `jg` cue (the `jg --help` probe, `## Cue: Search`, `node:child_process` in the communication
  hook) are cut; `OLD_ROLES` has `scout`, so a spawn or continuation of the role refuses unless the project defines
  `.agents/limen/scout.md`. New `test/hook/communication.test.ts` (T-36's golden test: the same context with and
  without a `jg` on PATH, which never runs). Review PASS in round 1 (five notes: the main session renamed the new test
  file to mirror its module, T-29 (1), with `git add` and `git mv`, and added its own runs to the outcome) and round 2
  (one note, rejected); gate 133/133. For Adrian at gate 5.1: the refusal wording ("a survey job"; R-065 brings survey
  tickets). For R-039: the communication hook can still start `git` through `listDrift` (drift detection, not tool
  detection), which its T-36 scan meets (`R-009` → `ticket.md` → `## Decisions`).
- R-012 `done` (delegated): `seat/deploy.ts`, run as `node /opt/limen/seat/deploy.ts <sha>`, in D-008's order; the
  project registries are found through the homes of `/etc/passwd` (root has none; no registry at all is exit 4); the
  tag `deployed-<UTC time>` is created last, so a failed deployment leaves none; verifications run as processes from
  the new checkout (none at stage 1; R-017, R-032, R-056 add theirs); its output escapes control characters (text from
  job folders reaches root's terminal) and git runs without `GIT_DIR` and the other repository-location variables.
  Scans: no `.sh` in `seat/` and `bin/`, no dynamic `import(` in `src/` and `hook/`. Review PASS in round 1 (six notes:
  four fixed by a fresh implementer with tests 12–14, two rejected) and round 2 (one note, fixed in `ticket.md`); gate
  149/149. AC-6 (`node seat/deploy.ts` → exit 2) was refused by the permissions, so it is judged by test 11, which runs
  that command (Q-8). For Adrian at gate 5.1: the registry discovery through `/etc/passwd` and the tag name and place
  (`R-012` → `ticket.md` → `## Decisions`). For R-017: a signal handler, because an interrupt between the checkout and
  the tag leaves the new commit checked out (review round 1, finding 4).
- Q-8 (no ticket blocked): whether `node seat/deploy.ts <args>` goes on the allow-list (recommended: no). Answered
  by day on 2026-11-19 → D-036: it stays off; a criterion names only listed commands (`## Agents`, step 2).
- R-013 `done` (delegated; its `ticket.md` refreshed to `b8babe2` first): `src/outcome.ts` (`LimenError`, six classes
  with exit codes 0–5, `finalLine`, `failureOf`, the client `readOutcome`); `main` is the only place that sets the exit
  code and prints one final line per command process; flag errors and an unknown command exit 2; `ticket check`,
  `picture build --strict`, `github poll` (a rate-limited 403 is class 3) and `group wait` throw typed errors; `ids.job`
  for `spawn`, `continue`, `keeper`, `github review|work`, `ids.ticket` for `ticket new`; every test caller reads the
  final line. Review round 1: the first reply was rejected by `review-verdict.mjs` (one criterion over several lines)
  and a fresh reviewer ran again, PASS with nine notes, plus five from the rejected reply; ten fixed by a fresh
  implementer, five rejected; round 2 PASS (two notes: one accepted, one rejected). Gate 198/198. For R-014: removed
  names still exit 1 `UNTYPED` (the stage convention wants 2 and the new form in `next` after R-013; T-18), and the
  GitHub poller still reads `limen github deliver`'s text (T-26 (4)). For R-082: an App key that holds no usable PEM is
  likely not typed `GITHUB_CONFIG` (guessed). For Adrian at gate 5.1: the codes and `next` texts of R-013
  (`ticket.md` → `## Decisions`).

Day session of 2026-11-19 (`limen-rebuild-5`, started by Adrian; WSL booted at 10:34, after the `.wslconfig` of
2026-11-18 16:48, so the idle timeouts are off):
- R-014 `done` (D-037: the texts in `pair`, the implementation by `rebuild-implementer`): `src/registry.ts` (45
  entries), `src/parser.ts` (replaces `src/commands/flags.ts`), `src/help.ts` with Adrian's golden help, `status
  --all`, `show <job>`, `seat queue`, old names exit 2 `REMOVED`, `spawn` requires its four route flags (D-043),
  `group wait` member-only with `movedBy: "R-077"` (D-042). Decisions D-037–D-044 and T-19's dated addition; notes for
  R-023, R-032, R-034, R-037, R-044, R-066, R-077 and R-081 in `## Tickets`. One `BLOCKED` (two golden lines, D-043);
  reviews PASS in rounds 1–4 with three rounds of fixes, the third by Adrian's exception (D-044); round 4's three
  notes went to gate 5.1, R-023 and R-081. Gate 244/244.
- Adrian's standing request (2026-11-19, project memory): a push notification whenever a decision of his is needed,
  in any session.

Gate 5.1 summary (stage 1 is closed; the gate is by day, with Adrian):
- Close (2026-11-19, `limen-rebuild-6`, `## Stages` → Closing a stage): at `5c7ea31` the gate exits 0 with 244/244
  twice (once alone, once through the gate-time tool), `check.mjs` reports 0 errors and Biome is clean on
  `adrian-rebuild`; M-10: 77.1 s (`evidence/gate-time-a0.1.0.md`; baseline 79–88 s, `evidence/baseline.md`).
- Tickets: R-001–R-014 and R-088 done (15 of 15). Gate 244/244 at the last commit (198 after R-013, 127 after
  R-007).
- Findings addressed by stage 1 (each ticket's `## Problem` names how far): A-042 (R-001), A-027, A-060, A-076
  (R-002), A-049 (R-003, R-004), A-023 (R-005), A-079 (R-006), A-048 in part and A-088 (R-007), A-083 in part (R-008;
  the platform adapter is R-020), A-081 in part (R-009; the per-role lists are R-045); plus gate-2 items G1.3–G1.8,
  G1.12, §6, §7 D3 (R-012) and H-21 (R-011); taste rules T-18, T-19, T-26 (1), T-37 (`ids` declared) by R-014.
- Unmeasured: M-01 (the role texts R-002–R-009 and R-014 changed; from stage 4, E-1), M-05 (R-013's final line in
  every tool result; R-011's runner and R-088; R-014's required route flags and generated help), the seat steps B.2
  and 1.0–1.3.
- Fixed context before and after: not measured at stage 1 — `context-size.mjs` is on the list from stage 4, and the
  role texts stages 1–3 change sit in Pi's system prompt, which the bridge drops (E-1); the cue changed only by the
  `jg` cut, which never fired on the seat (T-36).
- Tag `a0.1.0`: local, on the commit `Stage 1: close` (its full SHA is in the gate reply and is the argument of
  `## Deployment` 0.2 and 1.0); a fix after the gate is a ticket of stage 1 and the tag `a0.1.1`.
- Seat steps: B.2 before the deployment; then `## Deployment` 1.0 (bootstrap of `seat/deploy.ts`), 1.1–1.3; plus the
  tickets' seat notes: the Devin login and `DEVIN_*` variables (R-003), `LIMEN_ENGINE=omp` in the worker's `~/.bashrc`
  and `moshi-hook status` (R-004), no running job at 1.0 (R-005), a retired `limen-picture.timer` (R-007), optional
  deletions under `$LIMEN_HOME/.limen/` (R-006).
- For Adrian's decision at the gate: the refusal wordings of R-002–R-009 and R-014 (with R-014's review round 4 note
  1: `limen jobs --all a1b2c3d4` and `limen jobs -- --all` name `limen show`, while D-038 says only `jobs <ref>` does;
  `R-014-command-registry/review.md` → Round 4); R-011's choices; R-012's registry discovery through `/etc/passwd`
  and the tag name and place; R-013's codes and `next` texts; R-014's `kind` calls (`outcome.md` → Open points). Q-8
  is settled (D-036).
- Seat note of R-014 for the deployment: a coordinator spawn without one of `--engine`, `--provider`, `--model`,
  `--thinking` now exits 2 and names the missing flags (D-043); `LIMEN_ENGINE` no longer chooses a spawn's engine.

Gate 5.1 decided (2026-11-19): D-045 and D-046; the dated addition to T-37 in `taste.md`; new rows R-089 (stage
2), R-090 and R-091 (stage 1) and notes for R-023, R-025 and R-032 in `## Tickets`; `## Deployment` 1.0 deploys
`a0.1.1`, and B.2 runs with R-091's runner.

Close of a0.1.1 (2026-11-19, `limen-rebuild-8`, `## Stages` → Closing a stage):
- At `74f62e2` the gate exits 0 with 253/253 twice (once alone, once through the gate-time tool), `check.mjs` reports
  0 errors and Biome is clean on `adrian-rebuild`; M-10: 82.2 s (`evidence/gate-time-a0.1.1.md`; 77.1 s at a0.1.0).
- Tickets since a0.1.0: R-090 and R-091 (done); D-047's handover tool, outside the ticket list.
- Findings and decisions closed: D-045 (3) and (4) (R-091, R-090); the gap of §7 D3 for a registry with no project
  (R-090).
- Unmeasured, besides a0.1.0's: R-090's listing against the seat's registries (step 1.0); R-091's marks against the
  real Pi in RPC mode (B.2; R-091 → `outcome.md` → Open points).
- Fixed context: not measured, as at a0.1.0 (`context-size.mjs` from stage 4).
- Tag `a0.1.1`: local, on the commit `Stage 1: close (a0.1.1)`; its full SHA is in the gate reply and is the argument
  of `## Deployment` 1.0.

B.2 on the seat (2026-11-19 evening, D-048; Adrian ran each step, the main session read the outputs; the files stay
in a scratch folder of the agents' account, outside the projects):
- Facts: `/opt/limen` is checked out at `f1e3a54` (upstream), whose code equals `rebuild-base` (`git diff --stat
  f1e3a54 rebuild-base` touches only five files of `docs/seat/`); the coordinators load Limen from the extra checkout
  in the agents' home (gate 2 §9 item 6, steps 5.5–5.6), which is at `rebuild-base` and clean; the agents' account
  has no `sudo`, and git refuses the root-owned `/opt/limen` unless `-c safe.directory=/opt/limen` is given for one
  command. The coordinator's route is `--provider pi-claude --model claude-opus-5-5 --thinking xhigh`, which Pi
  clamps to `high` (the session records `thinking high`; `pi-ai` → `clampThinkingLevel`).
- Engine fact found on the way (Pi 1.5.1 `docs/security.md`): in RPC, JSON and print mode Pi skips project-local
  extensions unless the run has `--approve`, a saved trust decision covers the folder, or `defaultProjectTrust` is
  `always`; the seat sets none, so every attempt passes `--approve` among the engine args. The runner adds no flag
  itself (R-011 item 3.3).
- The runner's checkout at `91cc2e4` passed its 57 tests on the seat's Node 26.
- Seat check of R-011 (D-021), passed by the second smoke attempt in a copy of the project with a one-line ticket
  that asks for a job: the headless coordinator loaded Limen's hooks (`limen-project-context` in its session), its
  worker ended `done` and the wake reached it as a user turn; no `protocol-error.json`, no extension error, `stops`
  empty (R-088, R-091). The first smoke attempt, whose ticket did not ask for a job, was done by the coordinator in its
  own session in 61 s. Both landed without an owner "land", the second while saying that this breaks the project's
  rule; the second slept once and read `status` four times (M-05 material).
- Candidate: F013 of synchronizer (one completed review that found issues, one fix, two failed reviewer jobs; 102 min
  from the first job's start to the last job's end, so `--time-limit 180`), from its start commit `1fe9df6` with the
  reference `948dfda` (the seven F013 commits only); the hidden tests are the four changed files under `test/`. The
  control runs: the reference with the hidden tests passes the project gate (9 checks, 116.8 s), and the start commit
  with them fails it (from `tsc` on, so the unit test binds to the reference's API: the absolute pass^k is
  pessimistic, the before/after comparison is not affected).
- Three attempts (k = 3): none started a job; each coordinator implemented F013 in its own session (44, 52 and 37 min,
  one touchpoint each), so no attempt has a candidate and `evaluate` refused all three. Attempt 1 is
  `void-contaminated`: a bash call of the coordinator read job evidence of F002 and F003 in the production checkout,
  whose absolute paths are written in committed notes of the project. The report: `passed 0 of 2; pass^2: no; void:
  1`. The loop's own log lines carry false exit codes (the main session's error: `$(date -Is)` resets `$?`); the
  report reads `result.json` and `evaluation.json`.
- By D-049 (2026-11-20): the diagnostic of the coordinators' own branches of attempts 2 and 3 (two and three commits
  on a branch of their own, nothing on `main`): each passes the project gate without the hidden tests (9 checks) and
  fails it with them from `tsc` on, because the hidden unit test imports two functions of the reference's API that
  neither branch has (`isNonce`, `parseProofAnswer`). Attempt 4, the rerun of attempt 1, started a worker job, so it
  had a candidate, which failed the gate with the hidden tests; it is `void-contaminated` too. The report over the four:
  `passed 0 of 2; pass^2: no; void: 2`. pass^3 is "no" whatever a third valid attempt gives, since two have failed.
- Open for the "after" runs (4.8, 9.1), not for B.2: the hidden unit test binds the evaluation to the reference's
  internal names, so a correct implementation under other names fails; B.2 is not affected, because neither valid
  attempt has a candidate. Whether the hidden tests become the integration test alone is decided before 4.8, after a
  control run of that variant.

- R-090 `done` (delegated, by day): `seat/deploy.ts` prints every registry and registry line it checked before any
  other line, and registries that hold no project refuse with exit 4 before the fetch. One `BLOCKED`: the gate failed
  on `test/structure.test.ts:24` because its whole-tree walk counted the 579 `.ts` files of the Pi sources in the
  ignored `adrian-rebuild/input/vendor/`; Adrian chose (a): the basename test counts only the files git knows that
  exist in the working tree. The implementer's first run was void by `compare --git` only through Adrian's own fetch
  of the sources during it, and Adrian accepted it. Review PASS in rounds 1 and 2 (one fix round: the ELOOP test, a
  split test, the listing without deleted index entries); gate 253/253. For R-025: the other scans of that test file
  still walk ignored files (`## Tickets` → notes).
- The Pi 1.5.1 sources are in `adrian-rebuild/input/vendor/` (Adrian, 2026-11-19, by `## Commands`, stage-2 row; the
  deny rule on `input/` refuses the sessions' `mkdir` there, so Adrian ran it). The `npm pack` lines are on the
  allow-list.

- R-091 `done` (delegated, by day, `limen-rebuild-7`): `pi-rpc.mjs` marks each of the 26 types Pi 1.5.1 writes in
  RPC mode `handled` or `skipped` (`MARKS`, from the package sources), extension requests by method and responses by
  command; a request Pi waits on, an unmarked type, method or command, an unknown disposition or a line that is not
  JSON ends the attempt with exit 4 and `<out>/protocol-error.json` holding the raw line; a run ends at
  `agent_settled`, a prompt answered `handled` waits for no run, and `result.json` carries `extensionErrors`,
  `touchpointsDefinition` and `transcript`. The implementer's run was void by `compare --git` only through Adrian's
  own edit of `.claude/settings.local.json` (the `handover.mjs` line), and he accepted it; AC-2 was the ticket's
  error (`fails-before.mjs` takes only `test/`), judged by the main session's before-run (57 tests, 15 failing at
  HEAD's runner). Review PASS in round 1 (four notes, rejected with reasons; two go to B.2 as open points in
  `outcome.md`); gate 253/253. B.2 can run with this runner.
- Handover incidents of 2026-11-19 (for the handover tool): `limen-rebuild-6` was still alive in `tmux` after its
  handover, idle with no child process, because `EndConversation` ends the conversation and not the `claude` process;
  the main session killed it at Adrian's request. Then Adrian resumed this conversation with `claude -r` in a WSL
  window while its first process still ran in `tmux` (`limen-rebuild-7`) with the implementer, so the conversation
  ran in two processes; the auto-mode classifier refused the main session's `tmux kill-session` of its own duplicate,
  and Adrian killed it; the implementer was resumed with `SendMessage` from its transcript (the tree was still clean).
  PR #2 (`adrian-rebuild` into `main`, opened by accident from Adrian's phone on 2026-11-18) was closed at his
  request, without deleting the branch.
- D-047 `done`: the handover tool `tools/handover.mjs` (`start <n>`, `close-previous`) with its test (21 tests, each
  failing before its change: 12 before the tool existed, 6 before review round 1's fixes, 3 before round 2's, 1
  before round 3's) and a review by `rebuild-reviewer` in three rounds, PASS each time; round 3's two code notes were
  fixed without a fourth review (Adrian, (a)) (`evidence/handover/`). The project memory note on the handover follows
  D-047.

Day session of 2026-11-20 (`limen-rebuild-9`; its `close-previous` printed `handover: stopped claude 822 (claude -r)`
and exited 0; after Adrian's `/remote-control` the session id, and so the context file, changed):
- D-052 (Adrian's answers to R-015's three questions): the exceptions besides `LIMEN_WORKER_MODEL`, the seat fact that
  no `LIMEN_*` is set in the agents' login shell, and the place of each setting.
- R-015 `done` (delegated): `src/config.ts` is the only reader of `process.env.LIMEN_*` in `src/`, `hook/`, `bin/` and
  `seat/`; its registry gives each of the 48 names a kind; `limits.json` alone sets `prepare`, `toolStall` and the new
  `toolCalls`, `start-gate.json` alone the start gate (also `"off"`); the environments of the wrapper, the engine and the
  group advance are built from the registry, which closes the leaks of `LIMEN_TIMEOUT_MS` and `LIMEN_CONTINUE` (both
  shown failing at HEAD); `limen status` names ignored settings and the exceptions with their tickets. Reviews PASS in
  rounds 1–3 with two rounds of fixes; round 3's three notes were text of `outcome.md` and `review.md`, fixed by the
  main session without a fourth review. Gate 277/277. The stage-2 row of `### Cost and effect per stage` and step 2.4
  now follow D-052 (review round 1, finding 6). For R-034: the `rule` timer still starts from the whole environment
  (`src/commands/rule.ts:136`); for R-054: a job can raise its own tool cap through the project root's `limits.json`,
  as it can its stall time (G2 accepted risk until then); for R-084: the person-naming comments of
  `src/runtime/start-queue.ts:16-17`. The implementer's scratch runners lie outside the repository in
  `/tmp/limen-r015-round2/` (Adrian removes them; `rm` is denied to the sessions).
- Cost of R-015 (the day session's readings of its context file): the weekly use went from 71 % to 75 %, the 5-hour
  window from 29 % to 54 %.
- R-016 `done` (delegated): `src/boundary.ts` parses data from outside with hand-written validators and returns the
  value or a typed `BAD_DATA` error (`LimenError`, class `environment`) that names the file, the field and the
  expectation, every control character and line terminator escaped; `limits.json`, `start-gate.json` and the client's
  final line go through it; ratchets in `test/structure.test.ts`: `JSON.parse` outside the module at most 41 − 3, casts
  at most 75 (runtime) and 7 (`test/`) by an AST count, `as unknown as` none, and a T-25 scan of the module's function
  names. Review round 1 FAIL on one blocking finding that was the main session's own omission (its `fails-before.mjs`
  output was not in `outcome.md` before the review; fixed), rounds 2 and 3 PASS; two rounds of fixes; round 3's three
  code notes go to R-021 (`## Tickets` → notes), as R-014's round 4 did by D-044. Gate 310/310. The implementer's
  scratch files lie in `/tmp/r016/` outside the repository. Cost: weekly 75 % → 77 %.

Active ticket: none.

Handover of 2026-11-19 (D-047, at 31 % context, after the commit `D-047:`): `limen-rebuild-7` (a `claude -r` in a
WSL window since 17:46, no `tmux`) started `limen-rebuild-8` with `node adrian-rebuild/tools/handover.mjs start 8`
(19:04:15, in `tmux`, with `--remote-control`) and ended its turn. `limen-rebuild-8`'s push notification was skipped
as redundant (the terminal was active); its `close-previous`, the tool's first real run, printed `handover: stopped
claude 613783 (claude -r)` and exited 0, and the process was gone afterwards (`evidence/handover/outcome.md` →
Measurement).

Handover of 2026-11-20 (D-047, at 38 % context, after B.2, the deployment of `a0.1.1` and the commit that records
them): `limen-rebuild-8` starts `limen-rebuild-9` with `node adrian-rebuild/tools/handover.mjs start 9` and ends its
turn. The next session's first acts: a push notification to Adrian that it takes over at stage 2; then `node
adrian-rebuild/tools/handover.mjs close-previous`, which should stop `limen-rebuild-8` (in `tmux`), and the session
reports its lines to Adrian; then `Next`. The handover after it is `limen-rebuild-10`, with `start 10`.

- B.2 closed on 2026-11-20 by D-050 (K = 2): `evidence/b2-same-task.md`. R-090 (`2be4b80`) and R-091 (`049097d`)
  are ancestors of `a0.1.1` (`91cc2e4`); the commits after it change only `plan.md` and `evidence/`.

Deployment of `a0.1.1` (2026-11-20, Adrian as root, guided step by step): D-050's three confirmations held (no
running job in either project; the snapshot of 0.1 holds as many entries as the source, 16397; R-090 and `a0.1.1` on
`origin/adrian-rebuild`); 1.0's bootstrap checkout and `seat/deploy.ts` exited 0 and tagged `deployed-2026-11-20-093125`,
listing one registry with eight projects, six of them B.2's clones (D-051). No coordinator was running, so 0.3 had
nothing to reload. D-051 done: the registry holds the two projects, the agents' `limen` resolves to
`/opt/limen/bin/limen`, and `limen --help` ends with R-013's final line.
- 1.1: the leftover list held `.limen/coordinator-events` (R-002) in synchronizer and `.omp/extensions/limen.ts`
  (R-004) in both projects; Adrian dropped all three. The OMP stub was tracked in both projects, so Adrian committed
  its removal on each `main` and pushed it (with `--no-verify`, past the projects' own `pre-push` hook: the agents'
  account holds the write credential and the hook is no barrier, A-006).
- 1.2, first half: `limen spawn --tab …` exits 2 with `REMOVED` and names its replacement (R-005, R-014); no job count
  was taken before it, so "no job made" rests on the test of R-005. The log tab half is checked by the trial route.
- 1.3: skipped, since the seat has no `limen-*` timer at all (no GitHub poller, no `limen-prune`, no retired
  `limen-picture.timer`).
- Tickets' seat notes: no `DEVIN_*` or `LIMEN_DEVIN*` variable and no `devin` (R-003); no `LIMEN_ENGINE` in the
  worker's `~/.bashrc`, and `moshi-hook` is not on the agents' `PATH` (R-004); no `highlight` or `series` under the
  seat folder (R-006).

- 0.6, the trial route (ledger, 2026-11-20 09:46–11:12 UTC): Adrian's usual "we continue the work" started F009,
  and the coordinator went on to F010 until he stopped it; both went through a worker, a review and repairs and were
  landed by the coordinator without his "land" (the rule is prose in the project, A-012, A-013; R-071 replaces it).
  Every one of the eight jobs recorded its Herdr tab (`herdr/mode` `watch`), so 1.2 holds; seven wakes reached the
  coordinator on their own, and it still slept six times and read `status` thirteen times (T-34, R-047). Final lines:
  19 `ok`; one `usage BAD_ARGUMENT` for `limen continue … --task-file`, a flag `continue` never had (refused at
  `rebuild-base` too); two `refused UNTYPED`, both right (`land` of a failed job, `land` with no commits; typed in
  stage 2). One repair failed in 3 s for want of a provider (`## Tickets` → notes → R-062), and one was stopped by the
  stall rule on a `sleep 360`. Times: F009 46 min from the first spawn to the last job, F010 31 min.
- D-012 holds (Adrian, 2026-11-20): both projects stay paused until `a0.3.0`; the trial ran two tickets because
  "continue the work" is the coordinator's standing instruction.
- The deployment of `a0.1.1` is complete (0.1–0.3, 0.6, 1.0–1.3). B.3 follows the deployment of `a0.2.0`.

Adrian's answers of 2026-11-20 are D-053 (the weekly-limit push at 98 %, the cheaper review, the rehearsal of the
night mode tonight, the laptop before he leaves) and D-054 (`ready` tickets for the night, night defaults of category
A, pair tickets by a variants sheet). The night mode of the rebuild prompt (`input/prompt.md`, which the sessions
cannot edit) is amended by D-054: a night run takes only `ready` tickets, and it decides category A itself.
He is away 2026-11-21 to 2026-11-23 with only his phone; the seat steps (2.0–2.4, B.3), edits of
`.claude/settings.local.json` and `.claude/agents/*`, and a void review that left a file the reviewer created wait for
his return; a ticket that waits on one of them is `blocked`, and the session takes the next ticket that does not
depend on it. R-017's contract check is designed to run inside `node --test`, so that it needs no new allow-list line.
The Pi 1.5.1 sources are in `adrian-rebuild/input/vendor/`; the bridge 5.0.3 sources are fetched by Adrian after
`R-016:` (the three commands of the day session's reply), into `adrian-rebuild/input/vendor/pi-claude-bridge/`.

Handover of 2026-11-20 (D-047, at 42 % context, after the commit `D-053, D-054:`): `limen-rebuild-9` starts
`limen-rebuild-10` with `node adrian-rebuild/tools/handover.mjs start 10` and ends its turn. The next session's
first acts: a push notification to Adrian that it takes over at stage 2; `node adrian-rebuild/tools/handover.mjs
close-previous`, whose lines it reports to Adrian; then `Next`. The handover after it is `limen-rebuild-11`.

Day session of 2026-11-20, continued (`limen-rebuild-10`; its `close-previous` printed `handover: closed tmux
session limen-rebuild-9` and two `handover: stopped claude …` lines and exited 0):
- D-054 (1) and (3) in `check.mjs` (`evidence/night-ready/`, the main session's work, as D-047 was): the new module
  `tools/ticket-rules.mjs` holds the status `ready` and `ready (D-NNN, …)`, a pair ticket whose `Run` is `night`
  once its `ticket.md` → `## Decisions` holds a dated entry (it then counts as a night ticket of its stage), and,
  for every `ready` or `active` ticket, a command with its exit code in each criterion that is no judgment, which the
  allow, deny and ask rules of `.claude/settings.local.json` must pass (`refusal`, built on the night logs' facts);
  `section` and `checkRuns` moved there from `check.mjs`, and `review-verdict.mjs` takes the criterion IDs from it.
  32 tests, each failing before its change; reviews PASS in rounds 1–3 (eight, two and one notes, all fixed; two
  rounds of fixes, round 3's note was text of the spec, fixed without a fourth round by D-053 (2)); commit `D-054:`. Run as if `active`, the check names R-012's AC-6 (`node seat/deploy.ts`, Q-8) and ten criteria of
  done tickets that predate D-025.
- D-055 (Adrian, "1c 2a", asked in plain words at his request): R-017's type contract runs only in the repository, as a
  test on the vendor copy (`seat/deploy.ts` does not run it; `## Deployment` 0.2 and 2.2, the R-012 note and
  `## Commands` follow, and T-32 has a dated addition); its guards throw `BAD_DATA`, and R-029 (sources T-32, D-055)
  records the job's `engine-error` and the warning. R-017 `ready` with its `ticket.md` (`skipLibCheck` with
  compile-time "not `any`" assertions, because Pi's type closure reaches provider SDKs that are not vendored).
- Inventories for R-018 (every temp-and-rename writer and every direct write to `spec/` and job files) and R-020
  (platform operations, external programs, requirement checks) came from two read-only subagents; their facts are in
  those tickets' `ticket.md`.
- R-018 `ready` (size L, was M: about 60 call sites; the scan bans the write primitives outside `src/atomic-write.ts`,
  with exceptions for the locks until R-019 and the LaunchAgent until R-032) and R-020 `ready` (`src/platform/`; the
  requirements check at `limen init`; the check at coordinator start goes to R-050, a note in `## Tickets`): two
  independent branches for the night (D-054 (1)); `check.mjs` passes their criteria against the allow-list.
- R-089 `ready` from a third read-only inventory (every place that sets `next` or `code`, the old-names entries,
  the tests): D-045 (2), (5) and D-046 (1)–(3), (5) settle it; the main session put the parser check of D-046 (3) into
  the tests' reader of the final line.
- R-019 waited for Adrian's answer 3 (asked 2026-11-20), given to `limen-rebuild-11` (see below).

Day session of 2026-11-20, continued (`limen-rebuild-11`; its `close-previous` printed `handover: closed tmux session
limen-rebuild-10` and one `handover: stopped claude …` line and exited 0; its push notification was skipped as
redundant):
- Answer 3 → D-056: R-019 depends on R-018 and R-020 (the owner identity from `src/platform/`, which R-020's AC-4
  requires), the 60 s bounded wait with a typed error, the pid-only owner file abandoned only when its pid is gone, and
  `TimeoutStartSec` in R-032 (a note in `## Tickets`). R-019 `ready (D-056)`; the night writes its `ticket.md` at the
  HEAD it starts from, after R-018 and R-020 are `done`.
- Adrian (2026-11-20, 16:30): no idle afternoon; the day session takes R-018 by day (the root of the critical path
  R-018 → R-019 → R-021 → R-023), and the night keeps R-017, R-020, R-089 and R-019. R-018 `active` from step 3
  (`rebuild-implementer`); AC-3 at HEAD finds its four lines.
- R-021's inventory (a read-only subagent at `3df0494`; its facts feed D-057 and the night's `ticket.md`): about 45
  one-value files per job; `state` is written in six places, `src/runtime/wrapper.ts:227` without a check;
  `finalizeJob` checks and writes with no lock; `prune` deletes a folder with no `state`; no job archive exists; no
  boot id is recorded. Adrian's answers → D-057 (all seven as recommended); `## Deployment` 2.1 names `limen
  migrate`. R-021 `ready (D-057)`: the night writes its `ticket.md` once R-019 is `done`.
- R-018 `done` (delegated, by day): `src/atomic-write.ts` is the only module that writes or renames a file (temp,
  `fsync`, `rename` or, with `exclusive`, `link`, `fsync` of the folder), with sync forms and one temp-name pattern;
  the eight copies of the policy and about 60 direct writes go through it, and five folder readers skip its temps
  (the implementer's deviation 1, each with a test failing at HEAD); a scan bans the primitives outside it, with an
  exception list (locks until R-019, the LaunchAgent until R-032). Review round 1 PASS with seven notes (six fixed by
  the resumed implementer: `github resolve` writes its outcome by `rename` behind its gate, the transcript copy keeps
  its mode, a true comment, stronger EACCES tests, tests of two filters and of the sync form; one rejected), round 2
  PASS with five notes (two fixed by the main session, D-057 committed on its own as `d27a2c7`; three go to R-021 and
  R-025). Gate 340/340. Cost: weekly 79 % → 81 %. For a change of `adrian-rebuild/tools/` outside the ticket list
  (the implementer's open point 3): `fails-before.mjs` puts its copy of HEAD under `/tmp`, where the poller refuses its
  own module path, so the `github poll` tests of `test/cli/github.test.ts` fail at HEAD whenever that file is among
  the changed tests, for a reason unrelated to the ticket.

Day session of 2026-11-20, continued (`limen-rebuild-12`; its `close-previous` printed `handover: closed tmux session
limen-rebuild-11` and one `handover: stopped claude …` line and exited 0; its push notification was skipped as
redundant):
- R-017 `done` (delegated, by day). The implementer's `BLOCKED` (Pi 1.5.1 has no `before_subagent_spawn` event and no
  `context.agent`, so the adapter could not both declare what the hooks use and pass on Pi's real types) → D-058
  (Adrian, "a"): R-017 removes that dead code. `src/runtime/pi-api.ts` is the one declaration of the Pi API the hooks
  use; every handler gets `unknown` and reads through guards that throw BAD_DATA; the type contract
  (`test/runtime/pi-contract.ts`) ran on the vendor copy of Pi 1.5.1 in the gate, not skipped. Review round 1 PASS with
  six notes (four fixed by the resumed implementer, among them the `tool_call` guard only inside a group, because Pi
  1.5.1 rethrows a `tool_call` handler's error and blocks the call, an engine fact the ticket had wrong and a note for
  R-029; two rejected), round 2 PASS with four notes (a comment fixed by the implementer; the `## Fails before` quote
  and D-059's own commit by the main session; one rejected), round 3 PASS with none. Gate 377/377. Cost: weekly 82 % →
  85 %.
- D-059 (Adrian, 2026-11-20, "zrezygnuj z czekania na to powiadomienie, bo ten mechanizm coś nie działa"): by day the
  gate starts on the subagent's final report and `compare --git` exit 0, without the completion notification;
  committed on its own as `911f8ae`, so that R-017's rollback leaves it.

- R-020 `done` (delegated, by day): `src/platform/` (the interface `Platform` of operating-system primitives, its one
  implementation `linux`, and `requirements.ts` with a probe per declared tool, exit 4 naming it); `limen init` and
  `limen workspace init` check them first; the A-083 scan bans `/proc/`, `ps`, `cpus` and `process.kill` outside the
  adapter. Its AC-2 showed that every test plant refuses on the laptop's git 2.34 outside the gate → D-060 (Adrian,
  "A"; the session upgraded git itself through Linuxbrew, since `sudo` is denied; commit `6ef1840`) and Change 7 (a
  plant links the runner's git). Review round 1 PASS with eight notes (six fixed, two rejected), round 2 FAIL on two
  notes in `outcome.md` (fixed by the main session), round 3 PASS with none. Gate 401/401. Cost: weekly 85 % → 88 %.
- R-022 and R-023 prepared for the night from two read-only inventories; Adrian's first answers were withheld: he
  asked the session to read `gate-2-decisions.md`, `taste.md`, the harness principles and this plan and ask again.
  After that reading (a fresh subagent read all four in full), seven of the eleven questions were settled by T-20,
  T-24, T-26, T-38, T-01, T-28, D-039, D-046 and R-018's precedent; four were asked again on 2026-11-20 at 23:40
  (R-022: the class of an id that names no job; R-023: the split into R-023 and a new R-092, the early `spawn` line,
  one launcher module for Limen's own CLI) → D-061 (Adrian: all as recommended). R-022 and R-023 `ready (D-061)`;
  the new R-092 (T-38) `planned`; the inventories' facts are in `evidence/inventories/R-022-R-023.md`.
- R-019's `ticket.md` written by day (`check.mjs` requires it once R-020 is `done`, D-054 (1)), from a read-only
  inventory at R-020's tree; R-020 committed as `90a34ca`.

Day session of 2026-11-20, continued (`limen-rebuild-13`; its `close-previous` printed `handover: closed tmux session
limen-rebuild-12` and one `handover: stopped claude …` line and exited 0; its push notification was skipped as
redundant):
- Night preflight at `6d854ff` (D-024): `node adrian-rebuild/tools/test-night.mjs` → exit 0 (29/29); `node
  adrian-rebuild/tools/check.mjs` → exit 0 (5 `ready` tickets, their criteria against the allow-list); `HEAD` equal to
  `origin/adrian-rebuild`, clean tree; a new `claude -p` session listed `rebuild-implementer` and `rebuild-reviewer`.
  Use at 23:25: weekly 88 %, five-hour window 22 %. The old `.night/status.json` (`no-ticket`, 2026-11-19) predates
  this night's runs, so the runner ignores it.
- Adrian (2026-11-20, 23:26): "Uruchom tryb nocny do 7:00 rano". `limen-rebuild-13` starts `night.mjs --until 07:00`
  right after the commit of this entry and then changes nothing in the repository until Adrian writes (D-024).

Night run of 2026-11-20/21 (until 07:00; `night.mjs` run 1 started at 23:26:54):
- R-019 `done` (delegated): `src/lock.ts` is the one lock module (a lock file holding its owner's record, created
  whole; the takeover under a claim on the dead record with a re-read, A-087; a 60 s wait ending in `LOCK_TIMEOUT`);
  the cabinet, launch, prune, start-queue, seat-registry, poll and ticket-number locks go through it; D-031's exception
  left `## Agents`. Review PASS in rounds 1–3 (six, four and four notes; two rounds of fixes by fresh implementers:
  the boot id and `born` bounded in the record, one poll-lock definition, comments and test headers). Gate 429/429;
  no test failed in any run. For Adrian in the morning: the 17 night defaults of `outcome.md` → `## Night defaults`
  (summarised in `ticket.md` → `## Decisions`), above all `LOCK_TIMEOUT`'s empty `next` with the hint in the message
  (T-37) and the new code `LOCK_LOST`; and Q-9 (no ticket blocked): whether round 3's three notes on code and tests get
  a fix ticket (recommended: yes, S, `night`).
- R-021 `done` (delegated): its `ticket.md` written at `9cbc77d` from `evidence/inventories/R-021.md`; the
  implementer started at 01:21 and was cut at 02:06 by the 5-hour limit (HTTP 429 `usage_limit_reached`, 466 tool calls,
  mid-way through the CLI tests; weekly use 95 %), which ended run 1 with exit 1; run 2 (02:36) ended at once on the
  same limit. Run 3 (03:36, the new window): `compare --git` on the snapshot of 01:21 exited 0, so the partial tree
  stood as the cut implementer's work, and a fresh `rebuild-implementer` finished it (the night's rule for a resumed
  implementer, `## Agents`). Review FAIL in rounds 1 and 2 (four blocking findings, then one: the hook's sweep stopped
  at a damaged record), two rounds of fixes by fresh implementers, PASS in round 3 with five notes: two docs lines
  fixed by the main session (D-053 (2)), four on code and the manual are Q-10 (recommended: one S fix ticket before
  the close of stage 2, since the migration's `born` loss must land before `## Deployment` 2.1). Gate 484/484; no test
  failed without a change of its code. For Adrian in the morning: the night defaults and the two deviations of
  `outcome.md` (`cleanup` stays a content file; the reaper may end a migrated `running` record); round 2's rejected
  finding 4 (records refuse unknown fields) as a format question in `outcome.md` → `## Open points`; finding 3 went to
  R-022's notes in `## Tickets`.
- Weekly use reached 98 % at 05:08 (read from the run's `rate_limit_event` lines in `.night/2026-11-20-run-3.log`, since
  a night run has no status line) and 99 % at 05:37; the D-053 push "Hej, mamy 98% limitu tygodniowego, zresetuj
  licznik" was tried and not sent ("Remote Control inactive" in a `claude -p` run), so the morning session tells Adrian.
- R-021 committed and pushed as `0e4e588` (05:39). R-022 `active` (delegated, from 05:41): its `ticket.md` was written
  before that commit at R-021's tree (`check.mjs` requires it once R-021 is `done`, D-054 (1)) and stays untracked until
  R-022's own commit, as R-019's did. With the weekly use at 99 %, the limit may cut its implementer; then the tree
  holds its partial work, and the next session starts from `compare --git` on `node_modules/.rebuild-review/R-022.git`
  and continues with a fresh implementer, as run 3 did for R-021.
- The end of the night (read by `limen-rebuild-13` from `launcher.log` and the run logs' `result` events): R-022's
  implementer finished, the main session's gate passed (498/498), and review round 1 was PASS with four notes, all to
  be fixed (`review.md`, `ticket.md` → `## Decisions`); the snapshot for the fixing implementer was taken at 06:13, and
  at 06:15 the weekly limit ended run 3 before that implementer started (HTTP 429, "You've hit your weekly limit ·
  resets Nov 23, 5pm"). Runs 1 and 2 had ended on the five-hour limit (429) at 02:06 and 02:36. No run wrote a reason
  into `status.json`, so `night.mjs` ended with exit 3 after three runs, as designed. R-089 and R-023 did not start.

Morning of 2026-11-21 (`limen-rebuild-13`, after Adrian's "sprawdź" at 06:24):
- Adrian reset the weekly limit (D-053; the night's push had not reached him) and answered Q-9 and Q-10 "Zgoda na
  rekomendację" → D-062: one fix ticket R-093 for the seven round-3 notes of R-019 and R-021, `ready (D-062)`, after
  R-022 too (same files) and before the tag `a0.2.0`. He agreed that the session takes over the morning: R-022 from
  its round-1 fixes, then R-089 and R-023.
- `review-guard.mjs compare --git node_modules/.rebuild-review/R-022.git
  adrian-rebuild/R-022-exact-job-references/ticket.md` → exit 0: the tree is the night's R-022 work after round 1.
- The night defaults for Adrian (D-054 (2)) are in the `outcome.md` → `## Night defaults` of R-019 (17), R-021 and
  R-022; they wait for gate 5.2.
- The commit `D-062:` (`78e7664`, pushed) took in R-022's staged `git rm src/job/lookup.ts` by mistake, since the
  session ran `git add <paths>` and `git commit` while the implementer's deletion was in the index. The next commit
  puts the file back into the index only (`git restore --source=0e4e588 --staged`), so `78e7664` is the one commit
  whose tree lacks it and R-022's own commit holds the deletion. Rule for every commit outside a ticket while a
  ticket's work is in the tree: `git diff --cached --name-status` shows only the intended paths before `git commit`.

- R-022 round 1 fixes (a fresh implementer): DONE; the main session's gate 502/502, `fails-before.mjs` exit 0 (seven
  files). Review round 2 PASS with three notes: 2 and 3 (two comments that claim more than the code) fixed in the
  second and last round of fixes; 1 (the race test of `stop`) is R-021's and goes to R-093 (8) by D-063 (1). The
  round-2 implementer's gate failed once on the unchanged queue test of `s3-finish-wake`, so it replied `BLOCKED`
  (D-029); D-063 (2) settled it (measurement, five orphaned wrappers stopped, one more gate run) and added R-094.
- From about 09:10: autopilot until 13:00 (D-063 (4)); Adrian is driving. D-064 (his message at about 09:10): the
  98 % push of D-053 (1) is removed.
- R-022 `done` (delegated): the main session's gate after the round-2 fixes 504/504, `fails-before.mjs` exit 0 (eight
  files); review round 3 PASS with four notes: two in `outcome.md` fixed by the main session (D-053 (2)), two on code
  (the migration's report of a token shared with `.limen/unmigrated/`, the keeper comment's "read once") in
  `.night/questions.md` → Q-11 (recommended: two more items of R-093), no ticket blocked. Cost: weekly 0 % → 2 %.
- R-093's `ticket.md` written at R-022's tree (`check.mjs` requires it once R-022 is `done`, D-054 (1)); its grep
  criteria match at R-022's tree (they fail before). It is committed with the handover below, as R-091's was, because
  `handover.mjs start` needs a clean tree.

Day session of 2026-11-21, continued (`limen-rebuild-14`, autopilot until 13:00 by D-063 (4); its `close-previous`
printed `handover: closed tmux session limen-rebuild-13` and one `handover: stopped claude …` line and exited 0; no
push, by the handover):
- Q-11 had no answer at 09:28, so R-093 starts as written, without items (9) and (10); an answer "1" after this start
  makes one S ticket after R-093 (Q-11's option 1).
- R-093 `active` (delegated, from 09:28).
- R-093 `done` (delegated): one error-code helper `hasCode` in the new `src/system-error.ts` (it imports nothing,
  because `src/outcome.ts` as owner closes a load cycle through `src/lock.ts`); the migration keeps a `born` with no
  usable `pid`; the hook's damaged map is keyed by the job folder and cleared at a session start, and its per-tick
  record and progress reads go through the damage guard; the plant writes `record.json` atomically, and the race test
  of `test/cli/stop.test.ts` passed in every run of the reviews. Review round 1 PASS with six notes: two fixed by a
  fresh implementer (the `isExist` copy, the hook test's header and setup), AC-13's scope recorded in `ticket.md`,
  three not fixed here with their reasons (`review.md`); round 2 PASS with one note on `outcome.md`, fixed by the
  main session (D-053 (2)). The main session's gate 511/511 after each round; `fails-before.mjs` exit 0 (five files).
  Open points for gate 5.2 (`outcome.md`): eight more inline error-code checks for the scan ticket of T-25, and the hook's
  `start-notice` and `notify/` reads, which can still throw an I/O error other than damage.
- R-094's `ticket.md` written at R-093's tree before R-093's commit (`check.mjs` requires it once R-093 is `done`,
  D-054 (1)); it stays untracked until R-094's own commit, as R-022's did. Its mechanism, found while writing it: a
  queued wrapper carries the plant's path neither in its command line nor through an engine, so the plant's `pkill -f`
  misses it, and `waitForStart` never reads its own folder.
- R-093 committed and pushed as `613f4bb` (10:29). R-094 `active` (delegated, from 10:30).
- R-094 `done` (delegated): `waitForStart` returns how the wait ended (`started`, `stopped`, `gone`); a job whose
  record is missing (folder removed, or recreated empty by the lock's `mkdir`) ends the wait at its next poll, and
  the wrapper returns before setup and the engine, writing nothing into the folder; the plant's `cleanup` kills every
  process with the plant's own `LIMEN_HOME` and lists again until none is left; the queue test proves that a timeout
  counts from engine start by intervals that load can only lengthen (`timed` now blocks and ends on its timeout).
  Review: round 1 PASS with eight notes (five fixed, one deviation accepted, two not fixed here), round 2 PASS with
  three (all fixed in the second and last round), round 3 PASS with four: one in `review.md` fixed by the main session
  (D-053 (2)), three on code and tests in `.night/questions.md` → Q-12 (recommended: one S ticket before `a0.2.0`,
  which also takes Q-11's notes if Q-11 makes a ticket). The main session's gate 513/513, 514/514 and 515/515 after the
  three rounds; `fails-before.mjs` exit 0 each time. Q-13: the stopped `coord` process 1509615 (a leftover of the
  failed gate run of R-022's round 2), which `kill` would end only after Adrian's yes.
- For gate 5.2 (`outcome.md` → Open points): in one mutation run of fix 2 (queue time counted against the timeout),
  `test/s3-finish-wake.test.ts` also failed one `wokeOnce` assertion (`1 !== 0`, its test name cut from the output);
  the run changed code the test runs, so by D-029 it is no finding, and the unchanged tree passed the file 7/7 before
  and after; a possible double wake that predates R-094.
- R-094 committed and pushed as `4339985` (12:22); context 23 % at that safe point, so no handover. R-089 `active`
  (delegated, from 12:26): AC-4 and AC-5 run at `4339985` still match, and its `ticket.md` → `## Decisions` names the
  `next: ""` sites that R-016, R-019 and R-020 added since it was written.
- From 13:00 by day (the autopilot ended; no new ticket started after 13:00). A push at 13:25 named the three open
  questions; Adrian answered about 13:40 → D-065: R-095 (Q-11 and Q-12), and the session ended the stopped process
  1509615 (Q-13).
- R-089 review: round 1 PASS with eight notes (three fixed: the reader-import scan, the hook's "run null", a test of
  the 20 s cap; two deviations accepted; three rejected with reasons); the fixing implementer replied `BLOCKED` on the
  scope of the main session's own Fix 3 wording, which the main session settled by the finding's intent (a reading of
  its own decision, not a taste choice) and resumed it; round 2 PASS with two notes: the scan goes to the TypeScript
  AST in the second and last round of fixes, the by-hand comparison is rejected. The main session's gate 555/555 and
  566/566.
- R-089 `done` (delegated): `code` is `null` on success, `next` a `limen …` command with concrete values or `null`,
  enforced by `LimenError` and the validator; `JOB_STARTED` is a text line; `group wait` past its limit exits 0; the
  tests' reader `test/final-line.ts` runs every `next` through `main`'s parser, and a syntax-tree scan
  (`test/imports.ts`) ties every test file to it. Review round 3: the first reply was rejected by `review-verdict.mjs`
  (PASS with AC-7 `unknown`), so the main session added its gate run to `outcome.md` and ran it again: PASS with one
  note. The main session's gate 572/572; `fails-before.mjs` exit 0 (24 files). Two notes on the scan's path
  resolution (`../src//outcome.ts` and a `file:` URL with no `//` pass it) wait for Adrian: Q-14 (recommended: item (f)
  of R-095). The same-name note (`readOutcome`, `outputText` in the reader) goes to the scan ticket of T-25.

Day session of 2026-11-21, continued (`limen-rebuild-15`, by day; its `close-previous` printed `handover: closed tmux
session limen-rebuild-14` and one `handover: stopped claude …` line and exited 0; its takeover push was skipped as
redundant, the terminal being active):
- R-023's AC-5 and AC-6 run at `dfcb4ba` (D-025): 14 and 2 lines, every one a line the ticket removes.
- R-023 `active` (delegated, from 14:23).
- Q-14 → D-066 (Adrian: "1"): item (f) of R-095.
- R-023's implementer replied `BLOCKED` at 15:14 (D-029): its gate (586 tests, 584 pass) failed once on the unchanged
  "a held gate queues jobs by priority …" (`test/s3-finish-wake.test.ts`: the wakes' "started after" marks
  `[true, false, false, true, false, true]` against `[true, false, true, false, true]`, one wake too many), the same
  test as D-063 (2) with a third symptom (R-094's `outcome.md` → Open points: a `wokeOnce` `1 !== 0` in a mutation
  run); the file alone passed 7/7 once afterwards (a diagnosis run). The other failure, `test/s2-herdr.test.ts`'s
  pattern that needed `spawn`'s early id line, it fixed (2/2 alone). `compare --git` → exit 0. No leftover wrapper
  processes at 15:12 (`ps`). Asked as Q-15, with Q-16 (an old `claude` process in the repository).
- Q-15 and Q-16 → D-067 (Adrian: "zgoda na obie rekomendacje"): the measurement of D-063 (2) and the new R-096
  (`planned`); the session stopped the two processes of Q-16 (`kill`, exit 0; `ps` no longer lists them).

- R-023 measurement (D-067 (1)): 10 of 10 alone on the tree and 10 of 10 at `HEAD` passed; the resumed implementer's
  second gate 586/586 (`DONE`); `compare --git` → exit 0; the main session's gate 586/586 (114.7 s) and
  `fails-before.mjs` exit 0 (nine files). Review round 1 PASS with five notes, all fixed in the first round of fixes
  by the resumed implementer (`review.md` → Round 1; `ticket.md` → `## Decisions`).

- R-023 first round of fixes: the implementer's gate 588/588 (`DONE`); `compare --git` → exit 0; the main session's
  gate 588/588 and `fails-before.mjs` exit 0 (eleven files). Review round 2 FAIL: AC-7 not met (the new `spawn`
  test passes at HEAD, confirmed alone, and `## Fails before` did not name it) and one docs note; both go to the
  second and last round of fixes.
- R-023 `done` (delegated): the commands without `movedBy` are thin handlers over new domain modules in `src/job/`,
  `src/project/`, `src/runtime/`, `src/integrations/` and `src/picture/`; no command imports another, and nothing
  outside the wrapper and the registry imports `src/commands`; the wrapper holds a command's text and prints it at its
  end (`CommandText`), so `spawn`'s early id line is gone and `land`'s terminal question carries its notes;
  `src/runtime/launcher.ts` is the one module that starts Limen's own CLI; command words are read only in the parser.
  Review: round 1 PASS with five notes (all fixed), round 2 FAIL on AC-7 (`## Fails before` missed the new `spawn`
  test that passes at HEAD) with one docs note, both fixed in the second and last round; round 3 PASS with no
  findings. The main session's gate 586/586, 588/588 and 588/588; `fails-before.mjs` exit 0 (eleven files). Open
  points for gate 5.2 (`outcome.md`): the GitHub poller still reads Herdr's words for a failed `github deliver`
  (R-082, R-059); `hook/wake.ts` reads its own `/limen` word outside the parser scan.
- R-023 committed and pushed as `0546c7c` (16:23); context 22 % at that safe point, so no handover.
- R-095's `ticket.md` written at `0546c7c` from D-065 (1), D-066 and the three `review.md` → Round 3; AC-6 and AC-7
  run there match one line each, both lines the ticket removes (D-025). The main session corrected R-022's
  `## Migration` with a dated line (item (a)), committed with R-095. R-095 `active` (delegated, from 16:26).

- R-095's implementer `DONE`; `compare --git` → exit 0; the main session's gate 596/596 and `fails-before.mjs`
  exit 0 (five files). Review round 1 PASS with four notes: two fixed in the first round of fixes (the log append
  must not replace `QUEUE_RECORD_UNREADABLE`; `docs/jobs.md`), one rejected and one accepted with reasons
  (`review.md` → Round 1).

- R-095 first round of fixes: the implementer's gate 597/597 (`DONE`); `compare --git` → exit 0; the main session's
  gate 597/597 and `fails-before.mjs` exit 0. Review round 2 PASS with three notes, all to the second and last round
  of fixes (the `waitForStart` comment, a guarded `rm` of the queue entry, `docs/jobs.md`).

- R-095 `done` (delegated): `limen migrate`'s report says that a token one job shares only with folders of
  `.limen/unmigrated/` names that job; `keeper` reads each job once, by its resolved id; `waitForStart` reads only
  `ENOENT` as a gone record and ends on any other error with `QUEUE_RECORD_UNREADABLE`, its cause in the job's log,
  which neither a failed log line nor a failed removal of the queue entry replaces; two in-process tests show both
  "gone" checks; the plant test signals through the platform; `fileOf` resolves as Node does (D-066). Review: round 1
  PASS with four notes (two fixed, one rejected, one accepted), round 2 PASS with three (all fixed in the second and
  last round), round 3 PASS with three: the docs sentence fixed by the main session (D-053 (2)), two notes on
  `test/runtime/start-queue.test.ts` (a diagnosis message, its header line) are Q-17. The main session's gate 596/596,
  597/597 and 598/598; `fails-before.mjs` exit 0 (five files) each time. Open points for gate 5.2 (`outcome.md`): the
  class and code of `QUEUE_RECORD_UNREADABLE` reach no reader (R-082); the other mixed shared-token lines (R-031).

Day session of 2026-11-21, continued (`limen-rebuild-16`, by day; its `close-previous` printed `handover: closed tmux
session limen-rebuild-15` and one `handover: stopped claude …` line and exited 0; its takeover push was skipped as
redundant, the terminal being active; Q-17 asked again in the conversation, with a push):
- R-096's `ticket.md` written at `29722fd` from D-067 (1); it has no grep criteria (D-025). Q-17's two items are not in
  it yet; an answer "1" adds them as a dated entry of its `## Decisions` before the review.
- R-096 `active` (delegated, from 17:53).
- Q-17 → D-068 (Adrian: "Zgodnie z rekomendacją"): items (d) and (e) of R-096, in its `## Decisions` with AC-8.
- R-096's implementer replied `BLOCKED` at about 18:23: within (a)'s limit no run failed under load (6 of 10 gate
  runs, all 598/598, and 29 of 30 runs of the file beside them, 7/7 each; the permission classifier denied two file
  runs, not retried), but it found the cause and reproduced it deterministically in a scratch test (3 of 3 fail at
  HEAD): `test/fake-engine.mjs`'s `turn()` fires `agent_settled` after every turn, also while a follow-up is queued,
  so `confirmDeliveries` (`hook/wake.ts`) counts the wake unconfirmed, releases the claim and the next sweep injects
  it again; Pi 1.5.1 drains follow-ups inside one run and emits `agent_settled` once after it (`agent-loop.js`,
  line 196; `agent-session.js`, line 738; the main session checked both). The delivery code is right; the same
  sequence explains R-094's open point 5. `compare --git` → exit 0; the tree is unchanged. Asked as Q-18.

- Q-18 → D-069 (Adrian: "zgodnie z rekomendacjami"): option 1; the implementer is resumed with D-068 and D-069.

- R-096's resumed implementer `DONE` (D-068, D-069): the fake engine settles once per run; the new
  `test/fake-engine.test.ts`; items (d) and (e). After it, 6 gate runs (599/599) and 29 runs of the file beside them
  with no failure. `compare --git` → exit 0; the main session's gate 599/599 and `fails-before.mjs
  test/fake-engine.test.ts` exit 0 (the new test fails at HEAD on the double wake). Review round 1 PASS with three
  notes: two fixed in the first round of fixes (T-18 "run" in the fake engine's header; an async FIFO write), one
  with no change (`review.md` → Round 1). `review-verdict.mjs` rejected the first check of the reply, since AC-8, AC-9
  and AC-4's D-069 form were only in `## Decisions`; they moved into `## Acceptance` and the same reply checked
  consistent.
- R-096 `done` (delegated): the extra wake came from the test's fake engine, which fired `agent_settled` after every
  turn while a follow-up was queued, so the hook counted the wake unconfirmed and sent it again; Pi 1.5.1 settles once
  per run, so a real coordinator hears the event once and the delivery code is unchanged. The same mechanism explains
  R-094's open point 5. Review: round 1 PASS with three notes (two fixed, one no change), round 2 PASS with one note
  on `outcome.md`, fixed by the main session (D-053 (2)). The main session's gate 599/599 twice; `fails-before.mjs
  test/fake-engine.test.ts` exit 0 twice. Open point for gate 5.2 (`outcome.md`): a message a hook sends while
  `agent_settled` is emitted starts a new run of the fake engine, with no test of its own.

- R-096 committed and pushed as `07ec41b`; context 22 % at that safe point, so no handover.
- R-092's read-only inventory at `07ec41b`: `evidence/inventories/R-092.md` (24 of the 35 change commands refuse
  before their first write, 11 write before a refusal; many are rewritten by tickets of stages 3–8). Its scope
  asked as Q-19.

Q-19 asked again (Adrian: read `plan.md`, `gate-2-decisions.md`, `taste.md` and the harness principles, then ask
again, as for D-061). Settled by the documents, not asked (the session's reading, for D-070):
- R-092 builds the mechanism of T-38 (1)–(4) and converts `ticket done`, `picture build` and the group roster of
  `group start` (D-061); a converted refusal carries its own code (D-061), so the `UNTYPED` ratchet of
  `test/structure.test.ts` (218) falls, and R-082 types the rest (its comment there); argument errors of a converted
  command are usage, exit 2 (T-02); a state changed since `validate` ends with exit 3 before the first write
  (T-38 (2)).
- Commands with `movedBy` are exempt (D-061): prune, sweep, close, keeper, rule set, end and timer, group wait.
- The wrapper's `endDueRules` before every handler goes with seat rules (A-010, R-034) and T-04's housekeeping with
  R-032, not with R-092.
- The shape check over the change commands not converted yet starts as a ratchet, a list that may only shrink, and
  R-082 brings it to zero (`## Stages` → conventions: a scan that cannot hold at once over the author's code starts
  as a ratchet; R-082 and R-083 bring the counts to zero); a ticket that rewrites such a command converts it, by the
  reviewer question of T-38.

- Q-19 → D-070 (Adrian: "1"): R-092 converts nine commands; the settled points above are D-070 (2).
- R-092's `ticket.md` written at `07ec41b` from T-38, D-061 and D-070; it has no grep criteria (D-025). R-092
  `ready` (delegated); context 34 % before its implementer, so the session hands over first (D-047).

Day session of 2026-11-21, continued (`limen-rebuild-17`, by day; its `close-previous` printed `handover: closed tmux
session limen-rebuild-16` and one `handover: stopped claude …` line and exited 0; its takeover push was skipped as
redundant, the terminal being active; context 7 % at the start):
- R-092 `active` (delegated, from 20:43).
- Q-20 (may a night cross from stage 2 into stage 3?), Q-21 (R-024's inventory found that `failureKind` calls the
  subscription-limit failures `engine-error`), Q-22 and Q-23 (R-024's scope and output), Q-24 and Q-25 (R-025's
  declarations and success tests) asked in the conversation with pushes; Adrian answered all as recommended, Q-20 with
  option 2 (tonight stays in stage 2, until 09:00) and Q-23's last line corrected; they become D-071–D-076 in the commit
  that makes the night's tickets `ready`.
- R-092's implementer `DONE` at about 21:58; `compare --git` → exit 0; the main session's first gate 645/646: the new
  `BRANCH_LIVE_JOB` test raced a live wrapper's `progress.json` in `test/snapshot.ts` (ENOENT); resumed with the output
  (step 4), the implementer made that job a written record owned by a sleeping process (deviation 10); gate 646/646,
  `fails-before.mjs` exit 0 (17 files).
- R-092's review: round 1 FAIL (three blocking findings, nine notes; eleven fixes and the T-29 splits in the first
  round, finding 12 on `land`'s lock rejected and noted for R-037); round 2 FAIL (one blocking finding, five notes; the
  second and last round, which also typed `requireGit` as `GIT_FAILED` and found two defects of round 1, fixed at their
  cause); round 3 PASS with six notes, after one reply rejected by `review-verdict.mjs` for its form and given again
  by the same reviewer with the tree unchanged. The main session fixed notes 3 (`docs/picture.md`) and 5 (`outcome.md`
  → deviation 23); note 4 and the T-29 question with no change; notes 1, 2, 6 and the template line of note 3 asked as
  Q-26 (`review.md` → Round 3).
- R-092 `done` (delegated): the shape of T-38 in `src/operation.ts` (a read view with no write method, `apply` re-reads
  the held facts under the lock and ends with `STATE_CHANGED`, exit 3, before its first write; a failure after it is
  never a refusal); spawn, continue, stop, ticket done, picture build, group start, group stop, github review and
  github work go through it, their refusals typed; `UNTYPED_THROWS` 218 → 106; the shared `test/snapshot.ts`; the
  T-38 ratchet of 18 commands for R-082. The main session's gate 676/676 after the last round; `fails-before.mjs` exit 0
  (18 files). Open point (`outcome.md`): a test plant under the gate's cache that a stopped run left, which the
  sessions may not remove.
- R-092 committed and pushed as `6556e38` (00:20). D-071–D-076 into `## Decisions`; R-097 (new, S), R-024 and R-025
  `ready`, their `ticket.md` written at `6556e38` from the read-only inventories `evidence/inventories/R-024.md`
  (at `972c782`) and `R-025.md` (on R-092's finished tree), with no grep criteria (D-025); R-098 `planned` in stage 3;
  `## Deployment` B.3 narrowed and B.4 added (D-072). R-097 and R-024 depend on nothing open, R-025 on R-092 (done):
  two independent branches and a third ticket (D-054 (1)).

Night run of 2026-11-22 (until 09:00; `night.mjs` run 1 started at 00:07:53; the tickets in protocol order, the
lowest `ready` ID first: R-024, R-025, R-097):
- R-024 `done` (delegated): `limen stats` (D-073's variant b) and the one transcript reader through the validators.
  Review PASS in rounds 1–3 with two rounds of fixes by fresh implementers (D-026 (2)): round 1's `show` model line
  with no assistant turn, the token units by the rounded value, a direct test of the operation, the T-29 splits;
  round 2's bound "from the job's own start" in the reader (T-25 (1)). The main session's gate 690/690;
  `fails-before.mjs` exit 0 (five files). Night default for Adrian to confirm: the direct test of `projectStatistics`
  in `test/job/statistics.test.ts` (`ticket.md` → `## Decisions`). Open points for gate 5.2 (`outcome.md`): the
  fourth copy of the ISO-time pattern (T-25 (2)), the fake engine's non-Pi transcript line, the older-Pi lines that
  the stricter validators name under `Not read` (B.3, M-07).
- Run 1 ended at 02:09 with exit 1 on the subscription's 5-hour limit (its result: `usage_limit_reached`), during
  R-025's first round of fixes, whose fresh implementer had only read files. `night.mjs` started run 2 at 02:39.
- R-025 `done` (delegated; run 1: the implementation and review round 1 FAIL with one blocking finding; run 2: both
  rounds of fixes by fresh implementers, rounds 2 and 3 PASS): every registry entry declares `refuses`, `SHARED_CODES`
  in `src/operation.ts`, the scans of `test/registry.test.ts` through `test/coverage.ts` (the TypeScript syntax tree,
  names by the language's scopes), the ratchets `WITHOUT_CODE_TEST` 70, `WITHOUT_SNAPSHOT` 35, `WITHOUT_SUCCESS_TEST` 29
  (R-082, R-083) and `UNKNOWN_CLASS` by site, the T-04 read test, `status` and `show` `change` until R-032, the walks
  through `knownFilesBelow`. Round 2's first reply was rejected by `review-verdict.mjs` for its form (AC-9 over bullet
  lines); a fresh reviewer replied again with the tree unchanged. The main session's gate 710/710; `fails-before.mjs`
  exit 0 (17 files). Night default for Adrian to confirm (`ticket.md` → `## Decisions`, round 1): `SHARED_CODES` holds
  D-075's five codes and `UNKNOWN_COMMAND`, `REMOVED` and `UNTYPED`; the implementer's technical choices are
  `outcome.md` → Deviations 6–11 (category A (b)). Open points for gate 5.2 (`outcome.md`): scan (b)3 holds a test by
  its code, so `WITHOUT_SNAPSHOT` holds unit tests that run no command (R-082 decides whether the scan holds a test by
  the command it runs); the snapshot count does not read whether the two snapshots are compared; three renamed tests
  that combine mechanisms and two unprefixed `REMOVED` proofs are R-083's. Committed and pushed as `399dc4f`.
- R-097 `done` (delegated): `failureKind` (`src/job/record.ts`) calls an engine stop reason that says a subscription
  limit was hit (`SUBSCRIPTION_LIMIT`, the pattern of fact 6) `quota`, in the migration and at finalize; the reset
  time stays `null`. Review round 1 PASS with three notes (one fixed in a round of fixes: the comments' reason for the
  `null` reset time, D-057 (4) and R-029; two with no change), round 2 PASS with no findings. The main session's gate
  714/714 twice; `fails-before.mjs` exit 0 twice (three files). Open point for gate 5.2 (`outcome.md`): the older copy
  of the 429 rule in `src/job/listing.ts` (T-25 (2)), outside the ticket's change.
- Stage 2 has no ticket left, so the night ends with the reason `done` (`.night/status.json`), with the gate summary
  below (the night mode: no gate and no tag at night).

Gate 5.2 summary (stage 2's tickets are done; the close and the gate are by day, with Adrian):
- Close (for the day session, `## Stages` → Closing a stage): not run at night. The last gate is 733/733 at R-099's
  tree; the close runs the gate twice (once through the gate-time tool, M-10), `check.mjs` and Biome on
  `adrian-rebuild`, commits `Stage 2: close` and tags `a0.2.0` locally with Adrian.
- Tickets: R-015–R-025, R-089, R-092–R-097 and R-099 done (19 of 19; R-092–R-097 and R-099 are the stage's fix and
  follow-up tickets from D-061–D-071 and D-077). Gate 253/253 at a0.1.1 → 733/733 (R-099's final tree).
- Findings and rules addressed by stage 2 (each ticket's `## Problem` names how far): A-016 in part (R-097: the
  `quota` kind; the reset time and resume are R-029 and R-034), A-017, A-018, A-055, A-058 and A-087 (R-019), A-019,
  A-053, A-056 and S1+ (R-021), A-022 (R-018), A-083 (R-020, after R-008's part); H-01, H-20 and §2 (R-024); taste
  rules T-01, T-02, T-03, T-12, T-20, T-25, T-26, T-27, T-28, T-29, T-30, T-32, T-33, T-37 and T-38 (from their rows in
  `## Tickets`).
- Unmeasured (`changes.md`): M-10 (R-017–R-021), M-01 (R-021–R-023, R-093), M-05 (R-022, R-023, R-089), M-07, M-11
  and M-06 (R-024), M-11 (R-097); the seat steps 2.0–2.4 and B.3.
- Fixed context before and after: not measured at stage 2, as at stage 1 (`context-size.mjs` from stage 4; the role
  texts sit in Pi's system prompt, which the bridge drops, E-1).
- Tag `a0.2.0`: local, on the commit `Stage 2: close`; its full SHA is the argument of `## Deployment` 2.0.
- Seat steps: `## Deployment` 2.0 (deploy), 2.1 (`limen migrate --dry-run`, then `limen migrate`, with no job
  running), 2.2 (no extension error after `/reload`), 2.3 (`limen stats` against gate 2's counts: 142 jobs, 18 failed,
  12 of them `quota` by R-097), 2.4 (the `LIMEN_*` variables); then B.3. The projects stay stopped until a0.3.0
  (D-012).
- For Adrian's decision at the gate: the night defaults of R-024 (the direct test of `projectStatistics`), R-025
  (`SHARED_CODES` with `UNKNOWN_COMMAND`, `REMOVED` and `UNTYPED`; the implementer's choices, `outcome.md` →
  Deviations 6–11) and R-099 (F1–F3 and G1, `ticket.md` → `## Decisions`; F3 reaches beyond its `## Out of scope`);
  the open points of R-019, R-021, R-022, R-023, R-095 and R-096 (as listed in the entries above) and of R-024, R-025,
  R-097 and R-099 (their `outcome.md` → Open points), of which four ask a ticket's scope: whether R-025's scan (b)3
  holds a test by the command it runs (for R-082), the second copies of the ISO-time pattern (R-024) and of the 429
  rule (R-097), T-25 (2), and where `limen github status`'s unchecked print of the claim copy's `job` goes (R-099's
  Open point 9, no ticket row names it). Q-26 was resolved by D-077 (R-099, done).

The main session `limen-rebuild-17`, at night with Adrian's consent (D-077):
- Q-26 → D-077 (Adrian, about 00:10: "Zgadzam się na nowy ticket nocny R-099"); his "tak" (about 00:20) to starting
  the runner a second time for R-099 once the first had ended with `done`, the tree clean and pushed, before 08:00.
  The session waited for the runner's process to exit (04:26:45) and found the reason `done`, a clean tree and
  `50212ef` pushed. R-099 `ready` (S, delegated, night), its `ticket.md` written at `50212ef` (no grep criteria,
  D-025); the D-024 preflight, then `night.mjs --until 09:00`. Stage 2 now holds R-099 too: the gate summary above
  counts 18 tickets without it.
- A correction: R-092's commit `6556e38` was made at 00:05, not at 00:20 as an entry above says.

Night run of 2026-11-22, the runner's second start (until 09:00; `night.mjs` run 1 started at 04:29:05, from
`4cc9eb0`, the tree clean and pushed):
- R-099 `active` (delegated, from 04:35). The implementer's `DONE` at about 05:02; `compare --git` exit 0; the main
  session's gate 722/722, `fails-before.mjs` exit 0 (six files). Review round 1: the first reply rejected by
  `review-verdict.mjs` for its form (AC-6), a fresh reviewer's reply FAIL with one blocking finding (`github review`
  after a crash refuses `BRANCH_EXISTS`); fixes F1–F8 in `ticket.md` → `## Decisions` (F1–F3 night defaults), for the
  first round of fixes by a fresh implementer (from about 05:50).
- The first round of fixes `DONE` at about 06:00; `compare --git` exit 0; the main session's gate 730/730,
  `fails-before.mjs` exit 0. Review round 2: the first reply rejected for its form (bullet lines), a fresh reviewer's
  reply PASS with four notes, two needing code or tests (F2's message prints an unchecked field of the claim's copy;
  no test of the review branch's failure after the record); fixes G1–G5 for the second and last round of fixes (from
  about 06:30).
- R-099 `done` (delegated; review FAIL, PASS, PASS with two rounds of fixes by fresh implementers, D-026 (2); one
  reply each in rounds 1 and 2 rejected by `review-verdict.mjs` for its form and given again by a fresh reviewer with
  the tree unchanged): `github review` and `github work` take over, under the jobs lock, a handoff gate with no job
  record of the claim, no job in the claim's copy and no no-job answer; the review's branch is made after the job
  record; `github resolve` makes its gate and answer in one hold of the jobs lock; the copy's job is printed only in
  the form of a job id; `GROUP_STOP_INCOMPLETE` takes its cause's class (exit 3, 4 or 5, each tested); the snapshot's
  `git()` throws on a git failure; `templates/picture/CONTRACT.md:91`. Round 3's two notes (`docs/` only) fixed by the
  main session (D-053 (2)). The main session's gate 733/733 on the final tree; `fails-before.mjs` exit 0 (six files).
  Night defaults for Adrian to confirm (`ticket.md` → `## Decisions`, rounds 1 and 2): F1 (the review's branch after
  the record, not a deletion of a stale branch), F2 (a gate whose claim copy names a job stays, so a job retired by
  `limen prune --retire` gets no second job), F3 (`github resolve` under the jobs lock, beyond `## Out of scope`'s "the
  rest of `github`", since the take-over would otherwise weaken the gate's exclusion), G1 (the copy's job printed only
  as a job id). Open points for gate 5.2 (`outcome.md` → Open points 2, 5, 7–9): a job retired before the poller saw
  it past `starting`; `github resolve` on a crash's gate fails at its `mkdir` (R-082); a crash between the record and
  the wrapper's start (`GITHUB_HANDOFF_GATE` until prune, then `BRANCH_EXISTS` for `github review`, as at `HEAD`);
  `.limen/.publishing-<id>` left by a crash (publication's ticket); `limen github status` prints the copy's `job`
  field unchecked, as at `HEAD` (no ticket row names it).
- Stage 2 has no ticket left again, so the night ends with the reason `done` (`.night/status.json`); the gate summary
  above now counts 19 tickets with R-099.

Close of stage 2 (2026-11-22, `limen-rebuild-18`, by day, `## Stages` → Closing a stage; its `close-previous` printed
`handover: closed tmux session limen-rebuild-17` and one `handover: stopped claude …` line and exited 0; its takeover
push was skipped as redundant, the terminal being active; context 9 % at the start):
- At `224afe6` (the tree clean, `HEAD` pushed, `.night/status.json` `done`) the gate exits 0 with 733/733 twice (once
  alone in 151.4 s, once through the gate-time tool), `check.mjs` reports 0 errors and Biome is clean on
  `adrian-rebuild`; M-10: 150.8 s (`evidence/gate-time-a0.2.0.md`; 82.2 s at a0.1.1 with 253 tests).
- The commit `Stage 2: close` (`56f8168`) and the local annotated tag `a0.2.0` on it; the tag's full SHA is in the
  gate reply and is the argument of `## Deployment` 2.0. The gate summary is "Gate 5.2 summary" above, with R-099 (19
  tickets).
- A slip at the close: `check.mjs` ran on the close commit's text before `git commit` and reported 2 errors (a
  `path:line` reference to a file that `rebuild-base` lacks, and a filler word of T-17, both in this entry), but the
  command chain piped it into `tail`, whose exit 0 let the commit, the push and the tag run. The next commit fixes
  the two lines, after which `check.mjs` exits 0. The tag stays on `56f8168`: moving it (`git tag -f`) is on the
  deny list and is Adrian's (Q-31), and the code under the tag is that of `224afe6`, which the gate passed twice
  (the close commit changes only `plan.md` and adds `evidence/gate-time-a0.2.0.md`). Rule from now on: `check.mjs`
  and the gate run as their own command, and their exit code is read before any commit.
  - Q-31: the tag `a0.2.0` on `56f8168`, whose `check.mjs` reports those 2 text errors. Options: 1. keep it
    (recommended: the deployed tree is the gated code, and nothing in `plan.md` reaches the seat); 2. a PATCH tag
    `a0.2.1` on the fix commit, which the session can make itself (a new tag deletes nothing), and 2.0 deploys it.
- Asked at gate 5.2 in the conversation, with a push (Adrian's answers become D-078 onwards):
  - Q-27: the night defaults of stage 2 (R-019 `outcome.md` → `## Night defaults` 1–17, among them `LOCK_TIMEOUT`'s
    empty `next` and the code `LOCK_LOST`; R-021's and R-022's `## Night defaults` and R-021's two deviations; R-024's
    direct test in `test/job/statistics.test.ts`; R-025's `SHARED_CODES` with `UNKNOWN_COMMAND`, `REMOVED` and
    `UNTYPED` and its Deviations 6–11; R-099's F1, F2, F3 and G1). Options: 1. confirm all (recommended: each passed
    review, and none closes a door that a ticket of a coming stage needs); 2. confirm all but the ones named; 3. revisit them one by one.
  - Q-28: R-021's format question (review round 2, finding 4): records refuse a field they do not know, so a reader
    older than a record reads it as damaged. Options: 1. keep the refusal (recommended: a deployment runs with no job
    running and `/reload` follows at once, so no record of the new code meets an old hook; T-27 (2), and a breaking
    change raises the schema version); 2. readers ignore an unknown field; 3. readers ignore it and `limen status`
    names it.
  - Q-29: the placement of stage 2's open points: a new fix ticket R-100 and notes for eight tickets, as proposed
    below. Options: 1. as proposed (recommended); 2. without R-100, its items as notes for R-029 and R-082; 3. another
    placement, named.
  - Q-30: go on to stage 3 in a new session, which writes the tickets of stage 3 `ready` by day (D-074) for the next
    night. Options: 1. go on (recommended); 2. a fix of stage 2 first (a PATCH tag `a0.2.1`).
- Proposal of Q-29 (each line: the open point, its source, the proposed place):
  - A new fix ticket R-100 (S, delegated, night, stage 3, before R-029; T-25 (2)): one definition per pattern that
    stage 2 left in copies: the ISO-time pattern of `src/job/record.ts`, `src/lock.ts`, `src/job/migration.ts` and
    `src/job/usage.ts` in one module that also checks the ranges (a month 13 passes the form today; R-024 Open point
    2); the older copy of the 429 rule in `src/job/listing.ts` through `isRateLimit` (R-097); the eight inline error-code checks
    through `hasCode` (R-093); `seat/deploy.ts`'s own `jobFolders` through the resolver's listing (R-022 Open point 1,
    its last part).
  - R-031 (archive): a job retired before the poller saw it past `starting` leaves a gate that no rule tells from a
    crash's (R-099 Open point 2); the mixed shared-token report lines (R-095 Open point 1, already named there).
  - R-032 (sweep): a `starting` record with no pid after a crash between the record and the wrapper's start (R-099
    Open point 7), and `.limen/.publishing-<id>` left by a crash before its rename (R-099 Open point 8).
  - R-033 (alerts): the bell now needs `node` on its service's `PATH` (R-021 Open point 3), for seat step 3.3.
  - R-038 (fake engine): its `{"task": …}` line is no Pi entry, so `limen stats` names it under `Not read` (R-024
    Open point 3); a message a hook sends during `agent_settled` has no test of its own (R-096 Open point 1).
  - R-051 (wakes): the own listings of `.limen/jobs/` in `hook/wake.ts` (`:323`, `:885`, `:1169`) and
    `src/job/wake-delivery.ts:306` go through the resolver's listing (R-022 Open point 1).
  - R-058 (GitHub text): `limen github status` prints the claim copy's `job` field unchecked (R-099 Open point 9).
  - R-082 (debt): scan (b)3 holds a test by the command it runs, not by its code, so unit tests that run no command
    leave `WITHOUT_SNAPSHOT` (R-025); already named there: `QUEUE_RECORD_UNREADABLE`'s class (R-095), `github resolve`
    on a crash's gate (R-099 Open point 5), the poller's Herdr stderr (R-023 Open point 2, with R-059).
  - No change (accepted as each `outcome.md` records it): R-019 Open points 2–6, R-021 Open points 1, 2 and 5, R-022
    Open point 2, R-023 Open points 3 and 4, R-024 Open points 1, 4, 5 and 7 (7 is B.3's, M-07), R-025's (R-083's
    already), R-095 Open points 2 and 3, R-099 Open points 3, 4 and 6.

Gate 5.2 decided (2026-11-22, Adrian: "Q27 potwierdzam, Q28 rekomendacja, Q29 rekomendacja, Q30 rekomendacja, Q31
rekomendacja"): D-078 (the night defaults of stage 2 stand), D-079 (a record refuses an unknown field), D-080 (R-100's
row in `## Tickets`, before R-029, and the notes of R-031, R-032, R-033, R-038, R-051, R-058 and R-082 there), D-081
(stage 3 in a new session) and D-082 (`a0.2.0` stays on `56f8168`; `## Deployment` 2.0 names its full SHA). The seat
steps 0.1, 2.0–2.4 and B.3 are Adrian's; stage 3 does not wait for them (`## Stages` → Closing a stage).

Active ticket: none.

Resolved (Q-26 → D-077), asked in the conversation with a push: R-092's round-3 notes 1, 2, 6 and the template line of
note 3. Options: 1. a new fix ticket R-099 (recommended); 2. notes for the tickets that rewrite those parts; 3. the fix
ticket by day tomorrow.

Resolved (Q-19 → D-070), asked in the conversation with a push, then again after Adrian had the session read the
documents:
- Q-19 (R-092's scope beyond D-061's three): 1. also spawn, continue, stop, group stop, github review and github work
  (recommended); 2. also only spawn, continue and stop; 3. every change command without `movedBy` now.

Start of stage 3 (2026-11-22, `limen-rebuild-19`, by day; its `close-previous` printed `handover: closed tmux session
limen-rebuild-18` and one `handover: stopped claude …` line and exited 0; its takeover push was skipped as redundant,
the terminal being active; context 7 % at the start):
- Four read-only inventories at `9da2fde` (`Explore` agents, in parallel): `evidence/inventories/R-026.md`, `R-030.md`,
  `R-033.md`, `R-100.md`.
- R-100 and R-030 `ready`, their `ticket.md` written at `9da2fde` from the inventories, with no grep criteria (D-025);
  each `## Decisions` records the main session's readings, settled by the documents. They are two independent
  branches (R-100 → R-029; R-030 → R-031), D-054 (1). `check.mjs` exit 0 (2 ready).
- R-100's reach: D-080's eight code checks go through `hasCode`; the 17 lines that type an error as
  `NodeJS.ErrnoException` become a ratchet list for R-082 (the plan's ratchet convention), not part of R-100.
- R-026 `ready`, its `ticket.md` written at `24c0957` from its inventory, every choice settled by the documents
  (`## Decisions` 1–5: the wrapper inside `limen-job-<id>.scope`, the finisher ends the scope after every terminal
  transition, `contain.ts` goes, the optional record field `scope`, no unscoped fallback); notes for R-028, R-036,
  R-087, R-050 and R-060 in `## Tickets`. Three independent branches for the night now.
- Asked in the conversation, with a push; then, at Adrian's request, asked again after the session read
  `input/gate-2-decisions.md`, `input/zasady-budowy-harnessu.md` and `taste.md` (Part B in full, Part A searched for
  the questions' subjects). Adrian's answers become D-083 onwards; R-033's `ticket.md` follows them:
  - Q-32 (R-033, the alert's layout; the content is fixed: project as its folder's base name, so no path leaves the
    seat (A-066), the kind `failed:<kind>`, the job id, English (T-13), at most 100 characters (T-10)): a) one line,
    no title: `synchronizer failed:quota 2026-11-16-f001-work-a-37c02ed6` (recommended: the same line on the phone and
    in the unit's log); b) the ntfy title `synchronizer: failed (quota)`, the job id as the body.
  - Q-33 withdrawn: gate 2 §0.5 keeps account names out of tracked files and G2 has Adrian choose them before the seat
    changes, so the first recommendation (`limen-alerts` fixed in code) contradicted the documents; the name is given
    on the seat when the alerts are installed.
  - Q-34 (R-033, where the alerts run, restated): 1. a system unit and timer, installed by root with a seat tool that
    takes the account name as an argument (D-010: generated from typed definitions, `systemd-analyze verify` before
    enabling), `User=` that account, the topic by `LoadCredential=` from a root-owned 0600 file; `limen status`
    checks the unit (`systemctl is-active`, `is-failed`) and warns (A-066); `seat/deploy.ts` re-renders an installed
    unit at each tag with the account it already holds; R-033 grows from M to L (recommended); 2. user units on the
    alerts account, installed by the alerts tool run as that account (A-024's pattern for the sweep, no root but
    lingering), the topic in a 0600 `EnvironmentFile=` owned by that account; the agents' `limen status` cannot see
    another account's user units, so its warning needs a file the alerts account writes where the agents can read it.
  - Told, not asked: the alerts account gets only traverse rights (ACL `--x`) on the path to each project's records
    and read rights on the project registry (priority 1); events that are no job record (`no-coordinator`,
    `unattributed-engine`, `uncovered-commit`, timer failures of T-02) come with the tickets that create them; R-033
    sends `failed:<kind>` from the records.
- R-030 corrected after the same reading: abandon closes the job's Herdr tab (T-18), its summary is T-19's wording,
  and the status listing reads worktrees without optional locks (T-04).
- Q-35 asked after Adrian's request to enforce the search of the sources before a decision question, preferably by a
  hook: 1. a hook plus the session's memory (recommended); 2. the memory only. The memory rule was written at once
  (`feedback-search-sources-before-asking`).
- Adrian: "wszystko zgodnie z rekomendacjami" → D-083 (Q-35, the hook), D-084 (Q-32 a, the alert's line), D-085
  (Q-34 1, a system unit installed by root). R-033 `ready` (now L), its `ticket.md` written at `e39ccd0` from its
  inventory; `## Deployment` 3.3 follows D-085; the R-059 note no longer names the bell. Four tickets `ready` for the
  night: R-026, R-030, R-033, R-100 (`check.mjs` exit 0).

D-083's decision guard (2026-11-22, `limen-rebuild-20`, by day; its `close-previous` printed `handover: closed tmux
session limen-rebuild-19` and one `handover: stopped claude …` line and exited 0; its takeover push was skipped as
redundant, the terminal being active):
- `tools/decision-guard.mjs` and `tools/test-decision-guard.mjs` `done` (`evidence/decision-guard/`): 63 tests, each
  earlier version of the tool failing its new tests (24 of 24 before the tool, then 15, 7 and 1 of 63 for the tools of
  review rounds 1–3); 42 one-at-a-time mutations each fail a test. Review PASS in rounds 1–3 (11, 5 and 2 notes):
  two rounds of fixes, one note accepted (a hook block's `is_error` is not checked; it fails safe), one rejected (an
  internal-error branch no input reaches); round 3's two notes fixed without a fourth review (Q-36 a, Q-37 a →
  D-086, "zgodnie z rekomendacjami"; asked after a search of the four sources, with a push).
- A trial before review round 1 on this session's own transcript found that a split by a regular expression missed
  the session's commonest forms (`sed -n 'a,bp;c,dp'`, `grep 'a\|b'`); the lexer replaced it. A trial after the fixes
  named all four sources after the real push of Q-36 and Q-37, since nothing was searched after it.
- One command was refused by the permissions (an `rm -rf` of a scratchpad folder, a deny rule); the same run went to
  a fresh folder without `rm`.
- The `hooks` block for `.claude/settings.local.json` was given to Adrian in the conversation (D-016: only he writes
  the file); he keeps it for his return from the trip (`Next` 1).
- R-026 `done` by day (delegated, at Adrian's word, `Next` 2): every job's wrapper starts in
  `limen-job-<id>.scope`, the winner of every terminal transition reads the scope's readings (record field `scope`,
  shown by `limen show`) and ends the whole scope in a `finally`; follow-up processes start in
  `limen-run-<token>.scope`; `contain.ts` goes; `limen init` refuses without a user manager. Gate 752/752 (the main
  session's runs after each round); `fails-before.mjs` exit 0. Review PASS in rounds 1–3 (10, 11 and 5 notes): two
  rounds of fixes by the resumed implementer (item 6 (a)–(f): the scope's end in `finally`, exhaustion's group KILL as
  the fallback, no swallowed scope start, the `systemctl` literal banned outside the adapter with the GitHub doctor's
  calls moved there, a scope that never existed is `gone` from facts, `endJobScope`; item 7 (g): one comment's
  pointer), the main session's text fixes (`## Deployment` 3.2 gains the `is-active` check; notes for R-060, R-050,
  R-087, R-034 and R-081 in `## Tickets`, the R-050/R-087 one corrected after round 3). Not checked here: that
  `systemctl --user is-active` exits 3 for a scope that is gone (step 3.2). Unmeasured: M-09 (steps 3.2, 3.7, 3.8).

R-030 (2026-11-22, `limen-rebuild-21`, by day, Adrian away; its `close-previous` printed `handover: closed tmux session
limen-rebuild-20` and one `handover: stopped claude …` line and exited 0; its takeover push was skipped as redundant,
the terminal being active; context 8 % at the start):
- R-030 `active` (delegated, from 15:20). The implementer's `DONE`; `compare --git` exit 0; the main session's gate
  771/771, `fails-before.mjs` exit 0 (twelve files). Review round 1 FAIL (one blocking: abandon saved a nested
  repository only as a gitlink and removed it); fixes F1–F8 in `ticket.md` → `## Decisions`; `## Deployment` 3.6 and
  the ticket's row gain the Herdr check of T-28 (5). Round 1 of fixes: gate 778/778. Review round 2 PASS with ten
  notes; fixes G1–G9 (the second and last round), Deviation 10 accepted. Round 2 of fixes: gate 784/784,
  `fails-before.mjs` exit 0. Review round 3 FAIL with one blocking finding (`review.md` → Round 3): abandon still
  removes a worktree whose embedded repository the job committed as a gitlink in its own unlanded `HEAD`, so the
  nested commit is lost. Both rounds of fixes are spent: Q-38 asked in the conversation, with a push. The working tree
  holds R-030's uncommitted change, so no other ticket starts until it is committed.
  - Q-38: 1. a third round of fixes for R-030 only, on D-044's pattern: H1 abandon keeps and names the worktree when
    a gitlink of the saved tree points to a commit missing from the project repository's object store (`git cat-file
    -e`), with the reviewer's probe as a test that fails before it; H2 `docs/commands.md:158` states G5's condition; H3
    `outcome.md`'s test count; review round 4 checks only these and regressions, a new blocking finding goes to Adrian,
    no fifth round (recommended); 2. commit R-030 as it is and give the loss case to a new fix ticket before `a0.3.0`;
    3. abandon refuses with a new code any job whose worktree holds a nested repository.
- Adrian: "rekomendacja" → D-087 (Q-38 option 1): H1–H3 in `ticket.md` → `## Decisions`, a third round of fixes by
  the resumed implementer, then review round 4 on H1–H3 and regressions only.
- The third round of fixes `DONE`; `compare --git` exit 0; gate 785/785, `fails-before.mjs` exit 0. Review round 4
  FAIL with a new blocking finding (`review.md` → Round 4): the worktree that H1 keeps is removed by the next prune,
  since the written `limen/abandon/<id>` resolves the job and the worktree looks clean. By D-087 it goes to Adrian:
  Q-39 asked in the conversation, with a push. Round 4's note 3 (`docs/jobs.md:138`) fixed by the main session.
  - Q-39: 1. a fourth round of fixes with one item: one function decides whether a worktree holds state the project
    cannot hold, used by prune, land, `prune --retire` and abandon; a worktree whose `HEAD`, index or working tree holds
    a gitlink to a commit the project's object store lacks is kept like a dirty one, whatever job names it; tests:
    round 4's probe (abandon, then `limen prune`) and the same through land, each failing before the fix; review round
    5 on that item and regressions only, a new blocking finding to Adrian (recommended: it closes the loss on every
    removal path, a landed job's worktree too, and leaves the meaning of "resolved" as it is); 2. abandon writes no
    branch when a nested repository holds what the branch cannot, and refuses with a new code, so the job stays
    unresolved, listed and blocking worker spawns until a human moves the nested repository (it covers the abandon path
    only); 3. commit R-030 now and give the case to a new fix ticket before `a0.3.0`.
- Adrian: "zgodnie z rekomendacją" → D-088 (Q-39 option 1): I1 in `ticket.md` → `## Decisions`, a fourth round of
  fixes by the resumed implementer, then review round 5 on I1 and regressions only; round 4's note 2 to R-031's notes.
- R-030 `done` (delegated; review FAIL, PASS, FAIL, FAIL, PASS in rounds 1–5, with fixes F1–F8, G1–G9, H1–H3 (D-087)
  and I1 (D-088) by the resumed implementer): prune keeps every worktree that is dirty, holds unlanded work, holds a
  registered worktree below it or a nested repository whose commit the project lacks, one `kept` line each, and land
  and `prune --retire` keep by the same checks; `limen abandon <id>` saves the whole state on `limen/abandon/<id>` and
  removes the worktree only when the branch holds all of it; worker spawns refuse `UNLANDED_WORK` (a repair spawn on
  the job's own branch takes it over); `limen status` lists the jobs. The main session's gate 787/787 on the final tree
  (184.7 s); `fails-before.mjs` exit 0 (twelve files). Round 5's text note fixed by the main session (`docs/jobs.md:147`,
  D-053 (2)); its notes 2–4 go to R-032's notes (D-087's rule). Unmeasured: M-10, M-06 (step 3.6, with its Herdr check).
- Commit `R-030:` (`3fec0d2`), pushed; the tree clean; context 27 %.
- R-033 `active` (delegated, from 18:45); a note in its `ticket.md` → `## Decisions` names what R-026 and R-030 changed
  since its facts. The implementer's `DONE` (its gate 821/821 twice); `compare --git` exit 1: the index holds the five
  `git rm` deletions of `## Change` (f) (`docs/seat/bell.sh`, `bell.ts`, `limen-bell.service`, `limen-bell.timer`,
  `test/seat/bell.test.ts`), which the guard does not read as named, because (f) writes them in one backtick span with
  spaces and `changePaths` reads only spans without whitespace; nothing else differs (HEAD, refs, config, hooks,
  reserved paths). The ticket's form is the main session's slip. By `## Agents`, step 3, the run is void and Adrian
  decides: Q-40 asked in the conversation, with a push.
  - Q-40: 1. accept the run, as D-035 did: the main session writes each of the five paths in its own backticks in
    (f), takes a new `snapshot --git`, runs `compare --git` again (it must exit 0), and goes on with the gate
    (recommended); 2. void it: restore the tree to `HEAD` and run a fresh implementer on the corrected ticket.
- Adrian: "rekomendowane" → D-089 (Q-40 option 1): (f) names each path in its own backticks, a new `snapshot --git`,
  then `compare --git` again.
- `compare --git` exit 0; gate 821/821; `fails-before.mjs` exit 0 (six files). Review round 1 PASS with eight notes:
  fixes F1–F6 (a run that reads no project fails, the install refuses with no project and refuses root and an agents'
  account, a reload every time, the missing tests, one `requiredText`, a header of at most 100 characters); the main
  session fixed the Rollback (remove the units and reload before the revert's deployment) and added the row of
  `setfacl`, `systemd-analyze`, `systemctl` to `## System requirements`. Round 1 of fixes: gate 832/832. Review round
  2 PASS; fix G1 (the summary names the true cause). Round 2 of fixes: gate 834/834, `fails-before.mjs` exit 0.
  Review round 3 PASS with two notes that need code (`review.md` → Round 3, notes 2 and 3) and one text note, fixed by
  the main session (`docs/seat/README.md:29`). Both rounds of fixes are spent: Q-41 asked in the conversation, with a
  push. Adrian also asked whether the night can start (2026-11-22, 19:58): not before R-033's commit, R-100's
  `ticket.md` checked again at `HEAD` (R-033 moved `absent` and deploy's jobs listing into `seat/`, and
  `seat/alerts.ts` is a new place its scans cover), the tickets of R-031 and R-035 written `ready`, and the D-024
  preflight in the next session (this one is at 31 %); the end time is his.
  - Q-41: 1. notes 2 and 3 become two items of R-035, which adds the `queue` event to `seat/alerts.ts` in stage 3, so
    both are fixed before `a0.3.0` and the alerts' install (3.3) (recommended); 2. a third round of fixes for R-033 now,
    on D-044's pattern; 3. a separate S fix ticket in stage 3.
- Adrian: "uwagi do R-035, na noc pięć ticketów, potwierdzam godzinę 9:00" → D-090 (Q-41 option 1; the two items in
  R-035's note in `## Tickets`) and D-091 (the night until 09:00 with R-027, R-028, R-031, R-035 and R-100).
- R-033 `done` (delegated; review PASS in rounds 1–3, with fixes F1–F6 and G1 by the resumed implementer): the alerts
  of `seat/alerts.ts` replace the bell, as a system unit and timer on an account of their own (D-085), one line per
  failure (D-084), the topic only from the credential; the install refuses root, an agents' account and a seat with no
  project; a run that reads no project fails with its true cause; `seat/deploy.ts` runs the new checkout's units step;
  `limen status` warns. The main session's gate 834/834 on the final tree; `fails-before.mjs` exit 0 (six files).
  Unmeasured: the real systemd side, the ACLs and the phone (`## Deployment` 3.3).

The night of D-091 prepared (2026-11-22, `limen-rebuild-22`, by day, Adrian at the terminal; its `close-previous`
printed `handover: closed tmux session limen-rebuild-21` and one `handover: stopped claude …` line and exited 0; its
takeover push was skipped as redundant, the terminal being active; context 8 % at the start):
- Four read-only inventories at `9a370ae` (`Explore` agents, in parallel), their reports taken from the agents'
  hand-backs by a script, unchanged but for three wrapped lines: `evidence/inventories/R-027.md`, `R-028.md`,
  `R-031.md`, `R-035.md`.
- R-100's `ticket.md` checked again at `9a370ae` (D-025: each scan pattern of its `## Change` run with `git grep`):
  R-033 moved `absent` into `seat/registries.ts`, already through `hasCode`, so seven of D-080's eight code checks
  remain; `seat/alerts.ts` lists job folders through `jobFolderNames` and joins `JOB_FOLDER_READERS`, whose import
  pattern must accept a seat file's path; the facts' lines moved to `HEAD`; the 17 `NodeJS.ErrnoException` lines are
  the same set (its `## Decisions` 5).
- R-027, R-028, R-031 and R-035 `ready`, their `ticket.md` written at `9a370ae` from the inventories, with no grep
  criteria; every open question of the inventories (13, 15, 16 and 14) settled by the documents and recorded in each
  `## Decisions` as the main session's reading, so none was asked: A-005 read as the job's scope since R-026; A-052's
  "recorded" request decides `stopped` (a TERM to the wrapper alone, or a user-manager restart, is `failed:signal`);
  `oom` replaces `signal` and `reaped` only, so a `quota` end keeps its resume; A-002's markers as optional record
  fields with one write-once writer, retire under the jobs lock into `.limen/archive/<YYYY-MM>/`, the migration's
  evidence being land's own closing commit; A-036's diagnosis in the record and the coordinator's wake, the phone line
  `<project> queue <job id>` (A-066, D-084), the thresholds in the gate file, a durable `queueWait` field.
- Plan changes that follow T-28 (5) and the tickets: R-027's API `systemd`, seat 3.2; R-028's API `pi`, seat 3.8;
  R-031 and R-035 size L (were M); R-031's seat column 3.6; steps 3.2 and 3.8 name the trials; engine fact E-17 (Pi's
  print mode exits 143 on TERM, from the vendored source, checked by the main session); a note for R-032 (the paths
  that still trust a dead wrapper or a scope's end).
- One grace for stop, exhaustion and the reaper: R-027 makes it one constant at 5 s, R-028 sets A-020's 10 s, so the
  two tickets run in either order.

Night run of 2026-11-22/23 (D-091, until 09:00; `night.mjs` run 1 started at 21:10:15, from `cda9da5`, the tree clean
and pushed; the tickets in protocol order, the lowest `ready` ID first: R-027, R-028, R-031, R-035, R-100):
- R-027 `done` (delegated; review PASS in rounds 1 and 2 with one round of fixes by a fresh implementer, D-026 (2);
  round 1's first reply rejected by `review-verdict.mjs` for its form, bullet lines below AC-9, and given again by a
  fresh reviewer with the tree unchanged): the reaper writes `failed` only once the job's scope, or for a record
  without one its wrapper's process group, is gone (readings, TERM, grace, KILL, a read of the state), with
  `process group gone: <checks>`; otherwise the job stays `running` with one `reap: … not ended: …` line per attempt;
  the platform's `scopeState` and `signalScope`; one grace (`stopGraceMs`, 5 s, the test knob `LIMEN_STOP_GRACE_MS`)
  and one wait after a KILL (`KILL_WAIT_MS`). Fixes F1–F3: a failed signal call is named in the reap's line (T-01), the
  deaf-engine test split (T-29 (3)), the 1 s wait after a KILL defined once (T-25). The main session's gate 846/846 on
  the final tree; `fails-before.mjs` exit 0 (six files). Night defaults for Adrian to confirm (`ticket.md` →
  `## Decisions`): the implementer's seven (`outcome.md` → `## Night defaults`), of which default 2 narrows the
  ticket's Decision 4: a record without `scope` whose pid has no start time and is held by a live process stays
  `running`, since the reaper signals no group it cannot attribute. Open points for gate 5.3 (`outcome.md` → Open
  points): `is-active` exit 3 also reads a `deactivating` scope as gone; a reaper inside the reaped job's own scope
  TERMs itself; the reaper signals the unit the record names (not new); the words "ended after TERM" beside a failed
  TERM call; for R-028's implementer, the stop's Herdr deadline with the test knob at 500 ms or less. Unmeasured: M-11,
  M-10 (step 3.2). Committed and pushed as `ddea3ef`.
- R-028 `done` (delegated; review PASS in rounds 1–3 with two rounds of fixes by fresh implementers): a TERM to the
  wrapper reaches the engine once through the wrapper's group, every limit stays armed, and the engine's pid is KILLed
  after the grace, now 10 s (A-020); `limen stop` writes `stopRequested` for every running job before its TERM, and
  only a recorded request ends `stopped` (or `done` for a `done:` stop); any other TERM or signal ends `failed`, kind
  `signal`, `killed by <SIGNAL>`, and `oom` when the scope counted an OOM kill (A-052); the fake engine exits 143 on a
  TERM (E-17). Fixes F1–F3 (the `oom` rule's test alone, each signal's result in the log, the disarm test by events
  through the tool cap) and G1–G2 (a TERM after the engine's end changes nothing, through the test knob
  `LIMEN_END_GATE`; the engine's own end in the log, which seat step 3.8 now reads). The main session's gate 858/858
  on the final tree; `fails-before.mjs` exit 0 (five files). Before the implementation the main session recorded in
  `ticket.md` → `## Decisions` what R-027 changed since the ticket's facts. Night defaults for Adrian to confirm
  (`ticket.md` → `## Decisions`): the implementer's fifteen (`outcome.md` → `## Night defaults`), among them the
  request written in `endJob` rather than `apply` (the lock is not re-entrant), the disarm test through the tool cap
  instead of the time limit (which races the TERM), and the seam `LIMEN_END_GATE`; AC-9 read within (a)'s scope (a
  stop of a `starting` job and a group's reserved slot write `stopped` with no request, and send no signal). Open
  points for gate 5.3 (`outcome.md` → Open points): those two ends; the exhaustion's TERM still drops its result; a
  TERM during the prune step reaches no `--prepare`; the end gate's wait has no bound if the test knob leaked (with no
  `limen status` warning for a set test knob); the TERM's flag taken on `close`, not `exit`; R-027's sentence that stop
  and the exhaustion "keep their group signals until R-028", which this ticket's `## Change` does not take up.
  Unmeasured: M-11, M-10 (step 3.8).
- Run 1 ended at 00:52 with exit 1 on the 5-hour limit (its result: `usage_limit_reached`, "resets 1:10am"), with
  R-031 `active` and its first implementer cut after writing tests only. `night.mjs` started run 2 at 01:22; its
  `compare --git` on R-031's snapshot of 00:36 exited 0, `HEAD` was `fe092f9` = `origin/adrian-rebuild`, and a fresh
  implementer finished the change from that tree (as for R-021).
- R-031 `done` (delegated; review FAIL in round 1 with three blocking findings, PASS in rounds 2 and 3, two rounds of
  fixes by fresh implementers, F1–F11 and G1–G6; the first reply of rounds 2 and 3 rejected by `review-verdict.mjs`
  for its form and given again by a fresh reviewer with the tree unchanged): the record's optional `landed` and
  `abandoned` markers, written once by `writeMarker` after a terminal state (land, `ticket done` for jobs with no
  unlanded work, abandon once the save holds the whole worktree, the migration's marker step from land's closing
  commits); `prune --retire` (`src/runtime/retiring.ts`) moves only marked jobs with no unlanded work, with one
  `rename` under the jobs lock, into `.limen/archive/<YYYY-MM>/<id>/`, the month folder made durable first; the token
  draw, `limen stats` and the GitHub claim lookup (and the poller's evidence) read the archive; `limen status` lists
  each `limen/abandon/<id>` branch; the new refusal `ABANDON_BRANCH_LACKS_WORK`. The main session's gate 900/900 on
  the final tree; `fails-before.mjs` exit 0 (16 files). Night defaults for Adrian to confirm (`ticket.md` →
  `## Decisions`): AC-12's first clause read within the ticket's scope (D-025; `removeUnstartedRecords` still deletes
  a record that never started), and the workspace's abandon branches from every immediate child repository; the
  implementers' 26 in `outcome.md` → `## Night defaults` (above all 1: abandon also marks a job whose worktree was
  already gone; 3: the marker writer's two refusals are `internal`, undeclared; 21: G1 also changes the start reply).
  Q-42 (no ticket blocked): where round 3's two code notes go, the poller's lockless reads around a retire and the two
  `abandonedOf`; recommended: items of R-032. Open points for gate 5.3: `outcome.md` → Open points 1–8. Unmeasured:
  `limen stats` over the archive, the marker step on the seat (3.6), the archive's syncs on a real crash, the poller's
  replies for a retired job.
- Run 2 ended at 05:41 with exit 1 on the 5-hour limit, with R-035 `active` and its first fix implementer cut (its
  partial hand-back: "Now Biome, the gate, and the checks"). `night.mjs` started run 3 at 06:41; its `compare --git` on
  R-035's fix snapshot of 05:28 exited 0, `HEAD` was `34a40d0` = `origin/adrian-rebuild`, and after a new snapshot (the
  run had changed `plan.md`, D-035) a fresh implementer found F1–F4 complete in that tree and finished the checks and
  `outcome.md`.
- R-035 `done` (delegated; review PASS in rounds 1 and 2 with one round of fixes, F1–F4): the gate file's
  `diagnoseAfter` (30 min) and `failAfter` (2 h); past the first the wrapper's poll writes one diagnosis (the gate
  reading and the three largest units of the agents' user manager by memory and by CPU, each `job <id>` or
  `unattributed`, names quoted as data) into the record's new optional `queueWait` and into `advisory`, so the
  coordinator is woken, and the job waits on; past the second the job ends `failed`, kind `queue`, unless a stop was
  requested. The alerts send `<project> queue <job id>` from `queueWait.diagnosedAt`, keep the list of projects read
  (a first read records the present events as reported and sends none, D-090 (1)) and count an unreadable root once
  (D-090 (2)). The main session's gate 926/926 on the final tree; `fails-before.mjs` exit 0 (nine files); F1's
  failure before it is shown by reading round 1's code in the reviewed diff, not by a run (`outcome.md` → `## Round 1
  fixes`). Night defaults for Adrian to confirm: the implementer's thirteen (`outcome.md` → `## Night defaults`), among
  them `limits` kept when the gate is `"off"`, the order decision → `failAfter` → `diagnoseAfter` in a poll, and the
  Description shortened to stay within 100 characters. Q-43 (no ticket blocked): the wake hook's one advisory receipt
  per job and session means a stall advisory after the queue's diagnosis no longer reaches that session; recommended: an
  item of R-036. Open points for gate 5.3: `outcome.md` → Open points 1–7. Unmeasured: M-09, M-06, seat step 3.8.
  Committed and pushed as `017a228`.
- R-100 `done` (delegated, started at 07:20, before the end time; review PASS in round 1, its first reply rejected by
  `review-verdict.mjs` for its form, AC-10 over four bullet lines, and given again by a fresh reviewer with the tree
  unchanged): its scan patterns run again at `017a228` first (the same set at moved lines, `ticket.md` →
  `## Decisions`). The ISO time has one definition, `isIsoTime` and the validator `isoTime` in `src/boundary.ts` (the
  form and a round trip through `Date`, so a month 13, a day 0, `2026-02-30`, `2026-02-29` and hour 24 are refused);
  the 429 rule is `isRateLimit`, which `stopSummary` now calls; the seven inline code checks go through `hasCode`
  (Herdr's `errorCode` gone); `seat/deploy.ts` lists through `jobFolderNames` (a hidden folder is skipped, a file at
  the `jobs` path is exit 4, the list is sorted). Three scans in `test/structure.test.ts` with fixture cases, the
  ratchet `ERRNO_TYPED` (17 lines, for R-082) and `JOB_FOLDER_READERS` with both seat readers. The main session's gate
  946/946; `fails-before.mjs` exit 0 (four files in one run; `test/system-error.test.ts` passes at `HEAD` on its
  own, as `## Change` (e) allows). Two notes fixed by the main session in `outcome.md` (D-053 (2)), one left to R-082's
  ratchet as in R-020, R-028 and R-035 (`claimRecovery`'s "split pending"). Night defaults for Adrian to confirm: the
  implementer's six (`outcome.md` → `## Night defaults`), among them text scans by line with `src/commands/rule.ts`
  whole as the ISO exception, and the ratchet compared as a multiset. R-029 now has all its dependencies `done`.
- No `ready` ticket is left in stage 3 (R-029, R-032, R-034, R-036, R-037 and R-087 are `planned`, and a night takes
  only `ready` ones, D-054 (1)), so the night ends with the reason `no-ticket` (`.night/status.json`). Gate 5.3 is not
  due: stage 3 has six tickets left.

Morning of 2026-11-23 (`limen-rebuild-22`, by day, Adrian at the terminal): the night ended at 07:56 with
`no-ticket`, `e308a14` pushed, the tree clean. The session first relayed the night's Q-42 and Q-43 without searching
the sources; at Adrian's question it found both settled by D-087's rule (applied again by D-088, R-030's round 5 and
D-090), which D-087 had written as an exception for R-030 only. Adrian: "tak" → D-092 (the rule made general, by day
and by night; `## Agents`, step 6); Q-42 → R-032's notes, Q-43 → R-036's notes in `## Tickets`, both marked resolved
in `.night/questions.md`. The project memory rule on searching the sources now covers questions relayed from a night or
a subagent.

Day session of 2026-11-23 (`limen-rebuild-23`, by day, Adrian at the terminal; its `close-previous` printed `handover:
closed tmux session limen-rebuild-22` and one `handover: stopped claude …` line and exited 0; its takeover push was
skipped as redundant, the terminal being active; context 7 % at the start): the night defaults of the five tickets,
searched against `taste.md` Part B, gate 2, the principles and `## Decisions` (none contradicts a rule; four named for
attention), asked as Q-44 with a push; Adrian: "Zgodnie z rekomendacjami" → D-093. The open points of those tickets
that need code went to the notes of R-029, R-032, R-037 and R-087 (D-092). Six read-only inventories at `6d17130`
(`general-purpose` agents in parallel, each writing only its file, `git status` checked after): `evidence/inventories/
R-029.md`, `R-032.md`, `R-034.md`, `R-036.md`, `R-037.md`, `R-087.md`, with 16, 19, 21, 16, 20 and 16 open design
questions; three of them propose a split of an L ticket (R-032 by cadence, R-034 into the rules' cut and the quota
resume, R-037 into the atomic closing commit and the recorded steps), asked as Q-45–Q-47. R-036 `ready` (`5acb9fc`;
seat step 3.8 names the scope's checks); R-029's `ticket.md` written (seat step 3.4 reads a log line for the
rate-limit event) and asked Q-48 with a push. Adrian: "rekomendacje" → D-094 (the three splits; rows R-101–R-103,
R-054 now depends on R-103, steps 3.5 and 3.9 name R-102 and R-103) and D-095 (`launch`, `internal`); R-029 `ready`.

Day session of 2026-11-23, continued (`limen-rebuild-24`, by day, Adrian at the terminal; its `close-previous` printed
`handover: closed tmux session limen-rebuild-23` and one `handover: stopped claude …` line and exited 0; its takeover
push was skipped as redundant, the terminal being active; context 8 % at the start): R-087 `ready` with its
`ticket.md` (written at `ab36464`; the inventory's 16 questions settled by the documents, items 1, 2, 4 and 10 of its
`## Decisions` named for Adrian's attention at gate 5.3: the wrapper keeps `HERDR_*`, the fixed list of names, test
mode as the marker `LIMEN_TEST_MODE`, the dropped-names log line); seat step 3.10 rewritten with it (a trial job per
project that runs the project's checks; `git credential fill` instead of `git config --get credential.helper`, which
misses a URL-scoped helper). R-032 `ready` with its `ticket.md` (written at `06d8d75`; the minute half of D-094 (1);
the inventory's 19 questions settled by the documents; items 4, 6, 8 and 9 of its `## Decisions` named for gate 5.3:
`TimeoutStartSec=300`, the `Sweep not working` section, the dead job's line without "since", and whether a read may
take a bounded reading, as `seat queue`'s 2-second sample and `status`'s probes do); seat step 3.1 rewritten with it;
the D-041 (6) note moved to R-103 with `diff` and `open`, which record their Herdr tab's place.

Day session of 2026-11-23, continued (`limen-rebuild-25`, by day, Adrian at the terminal; its `close-previous` printed
`handover: closed tmux session limen-rebuild-24` and one `handover: stopped claude …` line and exited 0; its takeover
push was skipped as redundant, the terminal being active; context 7 % at the start): R-037 `ready` with its
`ticket.md` (`R-037-atomic-closing-commit/`; the closing-commit half of D-094 (3); the inventory's 20 questions settled
by the documents, chiefly A-057's Decision, which carries its pattern over to the closing commit, and T-38's "by
construction": the commit is built in a temporary index from the commit validate held, the hooks `git commit -m` runs
before it commits run on that index, the branch moves by compare-and-swap, and only then does the checkout follow, by
a two-way `git read-tree -m -u`; every close takes the ticket-lanes lock; land refuses `TICKETS_UNCOMMITTED` before its
merge and exits ≠ 0 with `next` `limen ticket done <codes>` after a failed close). Items 1, 2, 8 and 9 of its
`## Decisions` are named for gate 5.3: the hooks see the working tree before the close, `post-commit` is not run, a
rejecting hook is `environment` `HOOK_REJECTED`, and land's `irreversible` mark (D-075) goes to R-103. The D-092 note
on `ticket done`'s markers is relabelled R-103 (D-094 (3)), and a new R-103 note holds the mark and the checkout left
behind by a kill after the branch move. One command of this session was refused by the permissions (an inline
`node -e` edit of `plan.md`, off the list) and was not worked around; the edits went through the editor. R-103's
decisions: Q-49 and Q-50 asked with a push after the sources were searched; Adrian: "rekomendacje" → D-096 (the
leftover tabs and the `close` cut go to R-101, which gains API `herdr` and step 3.9; `diff` and `open` become change
commands, T-04's list drops `diff`; twelve items settled by the documents for R-103); R-103 `ready (D-096)`; R-037's
`ticket.md` now moves `close`'s `movedBy` to R-101.

Day session of 2026-11-23, continued (`limen-rebuild-26`, by day, Adrian at the terminal; its `close-previous` printed
`handover: closed tmux session limen-rebuild-25` and one `handover: stopped claude …` line and exited 0; its takeover
push was skipped as redundant, the terminal being active; context 8 % at the start): the decisions of R-101 (the daily
half of `evidence/inventories/R-032.md` → section 9, with D-096 (1)), R-034 and R-102 (`R-034.md` → section 9) were
searched against the documents; three that none settles were asked as Q-51–Q-53 with a push (the resume as a sweep
step or a command; the race of a resume with the deployment; the seat's old rules folder). Adrian: "zgodnie z
rekomendacjami" → D-097 (option 1 each, with the items settled by the documents, those marked (A) named for his
attention). R-034, R-101 and R-102 `ready (D-097)`; R-034's API is `pi, systemd`; steps 3.4 and 3.5 rewritten; the
`movedBy` note names R-102 for `rule`, and the note on the rule timer's stderr line is R-102's; R-032's `ticket.md`
→ `## Out of scope` names R-101 for the leftover Herdr tabs (D-096 (1)). One finding of the session's own, outside
the inventory, is in D-097 (4) (d): `prunePass` deletes an unregistered folder with no `.git` in the worktree root
with all it holds; R-101 moves it into the archive. Then R-098: a read-only inventory by a `general-purpose` agent at
`f5d8b7b` (`evidence/inventories/R-098.md`, 17 questions, the tree checked clean but for that file after it); the
questions no document settles were asked as Q-54–Q-57 with a push (the unit "landed ticket", M-03's division, where
the coordinator sessions are read, and the output in two variants on the golden fragment of R-024). Adrian: "zgodnie
z rekomendacjami" → D-098; R-098 `ready` with its `ticket.md` (`R-098-stats-per-land/`), steps B.3 and B.4 and the
paragraph after the `## Measurement` table rewritten. D-098 corrects one item of the reading sent with the questions:
`stats` reads every file of the `--sessions` directory, with no filter on the recorded `cwd`, since B.3 runs on a copy.
Adrian did not ask for a night run (he is back from the trip in the evening and wants to do his manual steps at about
20:00), so the session did `Next` 3: `fails-before.mjs` makes its copy of HEAD in the gate's private TMPDIR and fills
it inside the cleanup (`evidence/fails-before-tmpdir/`: ticket, outcome, review; two new tests, each failing at HEAD's
tool; review PASS in three rounds, two rounds of fixes, round 3's text note fixed without a fourth, D-053 (2)). Two
commands of this session were refused by the permissions (an inline `python3` edit, then a `git stash list` beside a
test run) and were not worked around; the edits went through the editor.

Evening of 2026-11-23 (`limen-rebuild-27`, by day, for Adrian's manual steps of `Next` 3; its `close-previous` printed
`handover: closed tmux session limen-rebuild-26` and one `handover: stopped claude …` line and exited 0; its takeover
push was skipped as redundant, the terminal being active): the session checked at `7b6bfb2` that `a0.2.0` is
`56f816820786d77e7cd13485ea20bb7fc78dd9d3` and an ancestor of `origin/adrian-rebuild`, that `.claude/settings.local.json`
has no `hooks` key yet, and from `56f8168` that `limen migrate` and `limen stats` find their project as the Git
top-level of the working folder (`limenRoot`), so B.3's copy must be a Git checkout, and that neither command writes
the seat's project registry (only the wake hook and `limen init` do). It gave Adrian item 1's block and the steps 0.1,
0.2, 0.3, 2.1–2.4, 0.6 and B.3's a0.2.0 part in one message and waits for his results.
- `Next` 1 done: Adrian added the `hooks` block; a live push naming `Q-00`, after a search of `plan.md` and
  `input/gate-2-decisions.md` only, was blocked with exactly `taste.md` and `input/zasady-budowy-harnessu.md` named, and
  the transcript marks the blocked call `"is_error": true` (`evidence/decision-guard/outcome.md` → Deviations), so the
  guard is active by day; night runs load it at start.
- Step 0.1's "seat state directory" is the seat folder: `.limen/` in the home folder of the account that runs Limen
  (`seatDir`, `src/project/seat.ts:12` at `56f8168`; `LIMEN_HOME` is a test knob), which holds the project registry.
- One command was refused by the permissions (an empty inline `python3`, a stray call) and was not worked around.
- The snapshot taken before `a0.1.1` (B.3's "before" data) is not a folder but the archive that the 2026-11-20 session's
  step 0.1 made with `tar -C <agents' home> -czf … .limen synchronizer/.limen ledger/.limen` in root's snapshot folder
  (found in that session's transcript on the laptop); B.3's copy extracts one project's `.limen` from it into a clone
  of the project with its branches and no `origin`, and compares the entry counts.
- Deployment of `a0.2.0` (2026-11-23/24, Adrian as root): 0.1 (no job running in either project; the snapshot of both
  projects' `.limen/` and the seat folder in a new root-only folder, each pair of entry counts equal) and 0.2
  (`seat/deploy.ts` with the full SHA exited 0, `git -C /opt/limen rev-parse HEAD` is the SHA), per Adrian: "wszystko
  przeszło prawidłowo" (no numbers given).
- 2.1: no id collision and no folder moved to `.limen/unmigrated/` in either project (Adrian). 2.3 (`limen stats`,
  both final lines `ok`): synchronizer 79 records (2026-11-08 to 2026-11-17; reviewer 29 with 6 failed, worker 49 with
  3 failed, one reviewer on a Codex route, failed; quota 6, timeout 2, stall 1, exit 1), ledger 64 records (2026-11-10
  to 2026-11-12; reviewer 28 with 6 failed, worker 36 with 2 failed; quota 6, timeout 1, stall 1). Together 143 jobs
  (85 worker, 58 reviewer) and 18 failed (12 quota, 3 timeout, 2 stall, 1 exit): the failures and the reviewers match
  gate 2, the workers are one more (in synchronizer). The session first read the missing eight jobs of the 2026-11-20
  trial route as a loss; that was wrong: ledger's live `.limen/jobs/` holds 83 folders, the trial's among them, and
  the snapshot of 0.1 taken on 2026-11-23 holds 72 (64 and the trial's 8). The 64-record output matches the archive
  taken before `a0.1.1`, so it likely came from B.3's copy (the shell that ran the checks stood in `~/b3/ledger`);
  Adrian confirms where both outputs ran, and 2.3 is run again in the live checkouts. New: ledger's `main` holds
  F011, landed by `2026-11-24-f011-repair-5-…`, so 11 jobs ran after the snapshot of 0.1, while D-012 keeps the
  projects paused until `a0.3.0`; Adrian (asked whether he used the coordinator session during 0.3–2.3): "Możliwe, ale
  z niej nie korzystałem". Whether F011 was his 0.6 trial or the coordinator's own start is asked. Adrian: "F011 to
  moja próba 0.6", and the two outputs above ran in the B.3 copies (so they are B.3's a0.2.0 part, below).
- 2.3, run again in the live checkouts (both final lines `ok`, no job running, `LIMEN_COORDINATOR` the only
  environment line): synchronizer as above (79); ledger 83 records (2026-11-10 to 2026-11-24): F011's 11 jobs on
  `pi-claude/claude-opus-5-5` (6 workers at `high`, 1 h 16, and 5 reviewers at `xhigh`, 2 h 04, all done), and the
  migrated 72 on `unknown` routes (30 reviewers with 6 failed, 42 workers with 4 failed; quota 6, stall 2, timeout 1,
  exit 1). Without the two trial routes (2026-11-20: 2 reviewers and 6 workers, with the stall stop and the repair
  that had no provider; F011) the live counts equal B.3's.
- B.3's a0.2.0 part (the copies of the archive taken before `a0.1.1`, migrated by `a0.2.0`): synchronizer 79 records
  (2026-11-08 to 2026-11-17; quota 6, timeout 2, stall 1, exit 1), ledger 64 (2026-11-10 to 2026-11-12; reviewer 28
  with 6 failed, worker 36 with 2 failed; quota 6, timeout 1, stall 1): 143 jobs (85 worker, 58 reviewer), 18 failed
  (12 quota, 3 timeout, 2 stall, 1 exit). Against gate 2 §1 (142: 84 worker, 58 reviewer; the same 18 by kind) one
  worker more, in synchronizer, whose newest record is of 2026-11-17, the day of gate 2's count: unexplained, likely a
  job after that count. All routes are `unknown` (the older records held none).
- 0.6 (Adrian's trial route, ledger, F011 from 2026-11-23 to 2026-11-24): 11 jobs, all done (a worker and five
  repairs, five reviews), landed by `2026-11-24-f011-repair-5-…` (`Close F011: landed by …` on `main`). Read from the
  records and the coordinator's Pi session with a read-only script the session gave (its fixture test on the laptop
  was refused by the permissions and not worked around, so the script ran untested, with no error): Adrian's
  instructions "zrób tylko jeden następny ticket, land dopiero po moim sygnale, potem stop" (21:21 UTC) and, after
  the first job, "zapisz czas gotowości do land, potem zrób land sam, potem stop" (21:47), so the coordinator landed
  on his word; the first spawn at 21:23:47, the last job's end at 00:48:44 (3 h 25 min, five review rounds, the fifth
  repair documents only, landed without a sixth review); 11 wakes for 11 jobs, each at its job's end; 28 final lines,
  all `ok null`; 0 `sleep` calls and 5 `status` reads (the `a0.1.1` trial: 19 `ok` of 22, 6 sleeps, 13 reads).
- The deployment of `a0.2.0` is complete: 0.1–0.3, 2.1–2.4, 0.6 and B.3's a0.2.0 part. B.3's a0.3.0 part and B.4
  follow their tags; the copies in `~/b3/` of the agents' account are kept for them.
- Adrian (2026-11-24, asked "dzień" or "noc HH:MM" for the rest of stage 3): "robimy teraz". The session takes the
  stage-3 tickets by day in protocol order (`## Agents`, step 1). Active ticket: R-029 (delegated), from `3a9e48c`.
- R-029 `done` (delegated): every detector passes its failure's kind to `finalizeJob` (the text patterns stay for the
  migration), the nine ends without a kind get `launch`, `internal` or `timeout` (D-095), a `quota` failure records its
  reset time from `kendex:rate-limit` (the new `hook/rate-limit.ts`) or from `errorMessage` with a zone, and a guard's
  refusal of a Pi event is written by the adapter's `recorded` before Pi sees it (a job ends `engine-error`; a
  coordinator session gets an escaped warning line in `limen status`). Review PASS in rounds 1–3, with two rounds of
  fixes (F1–F5: escaping, a deterministic timeout test, two test splits, the hooks listed from `hook/`, a comment;
  G1–G2: the session folder matched by pid and `born`, the show test failing for the printing alone); round 3's two
  notes went to R-102's note (D-092). Gate 971/971. For Adrian at gate 5.3: the naming point of `outcome.md` → Open
  point 4 (T-18: "refusal" also names a guard's BAD_DATA). Outside the repository: two copies of `HEAD` the implementer
  made in the gate's cache folder (`r029-head-*`) and about 640 test folders (`limen-live-*`, `limen-tree-*`, 84 MB in
  all) that `test/u11-live-activity.test.ts:99` and `:121` leave there on every gate run; `rm` is denied to the
  sessions, so Adrian removes them if he wants, and the leak is a note for the ticket that rewrites those tests.
- 2.4: `limen status` names `LIMEN_COORDINATOR` in both projects (read until R-050, so it stays).
- `limen-rebuild-28` (its `close-previous` printed `handover: closed tmux session limen-rebuild-27` and one `handover:
  stopped claude …` line and exited 0; its takeover push was skipped as redundant, the terminal being active; context
  8 % at the start): R-032 `done` (delegated), from `8b1ec4c`. `limen seat sweep` (`src/runtime/sweeping.ts`) replaces
  `limen sweep` (exit 2): the reap, the end of terminal jobs' leftover scopes, coordinators and the Herdr ring per
  project, each step and record failing alone, the start queue's dead entries once per run, `SWEEP_IN_JOB` inside a
  job scope; `status`, `show`, `seat queue` and the wake hook's tick no longer write; `stuck` is escalated from the
  third attempt (alert and `limen status`); the user-unit installer with lingering and `TimeoutStartSec=300`
  (`src/platform/systemd-units.ts`, one placement policy that the alerts share); `holdsProcesses` reads
  `cgroup.events`, so root's deployment gate sees a dead wrapper's engine; deploy verifies the new checkout's units.
  The implementer's one `BLOCKED` (the ticket's module names broke the unique-basename test) and its defaults were
  settled by the documents, `ticket.md` → `## Decisions` 15–17 (named for Adrian at gate 5.3: 15, 16, and the new
  test knob of 17). Review PASS in rounds 1–3 with two rounds of fixes (F1–F9, G1–G4); round 2's first reply was
  rejected by `review-verdict.mjs` on form and sent again unchanged in substance; round 3's notes went to R-082's and
  R-101's notes and to `outcome.md` → Open point 6 (D-092); step 3.1 names the engine facts it relies on, and the
  system requirements name `systemd-analyze`. Gate 1030/1030. For Adrian at gate 5.3: `outcome.md` → Open points 1–6
  (the transitive import closure of read commands, `endDueRules` until R-102, `diff` and `open` until R-103, the two
  bounded probes, `--install` not refused inside a job scope, `--uninstall`'s tolerance). One command of this session
  was refused by the permissions (a heredoc append to the ticket with a stray `python3`) and was not worked around.

Next (by day):
1. Done on 2026-11-23: Adrian added the `hooks` block of D-083 to `.claude/settings.local.json`, and the live test
   blocked a push naming `Q-00` ("Evening of 2026-11-23" above); the guard is active, by day and at night.
2. By day, with Adrian (2026-11-24: "robimy teraz"): the stage-3 tickets in protocol order (`## Agents`, step 1).
   R-029 (`b0c033b`), R-032, R-034 (`04d4f34`), R-036 (`bb0ae2b`) and R-037 (`limen-rebuild-30`) are `done`, and D-099 (2)'s `## Change`
   form check is in `tools/ticket-rules.mjs` (commit `Tools: …`, test in `tools/test-ticket-rules.mjs`). Next, by
   protocol step 1, R-087 and R-098, each `ready` with its `ticket.md`, R-101 `ready (D-097)` with its `ticket.md`
   (`R-101-sweep-daily-steps/`, its Decisions 2 and 4 for gate 5.3) and R-102 `ready (D-097)` with its `ticket.md`
   (`R-102-seat-rules-cut/`, written by `limen-rebuild-29` at R-034's tree before R-034's commit, as `check.mjs`
   requires once R-034 is `done` (D-054 (1)), from a read-only agent's inventory and D-097 (6); its Decisions 1–3 for
   gate 5.3); R-103 `ready` with its `ticket.md` (`R-103-land-recorded-steps/`, written by `limen-rebuild-31` after
   R-037; its Decisions 2, 5, 6, 9, 15, 16 and 18 for gate 5.3). The night of 2026-11-24/25 takes these five by
   D-102 until 08:00 ("Night of 2026-11-24/25" at the end of this section). The main session's estimate given to Adrian
   (2026-11-24): about 25 h of work for the ten tickets (18–32 h, from stage 3's eight tickets at 44 min to 3 h 49), so
   the last ticket on 2026-11-25 before noon if a night runs between, then the close and gate 5.3. Whether and when to
   start a night is Adrian's (D-024: the main session starts the runner when he asks).
3. Done on 2026-11-23/24: Adrian's manual steps, item 1 and the deployment of `a0.2.0` ("Evening of 2026-11-23"
   above).

Resolved (Q-49 and Q-50 → D-096; Adrian: "rekomendacje"), asked on 2026-11-23 by `limen-rebuild-25` in the
conversation with a push, after the sources were searched; the settled items went into D-096 (3):
- Q-49 (R-103, R-101): who closes leftover Herdr tabs (T-18 (1): "the daily `limen-sweep` closes leftovers") and cuts
  `limen close`. Options: 1. R-101 (recommended): a daily step of `limen seat sweep` closes the recorded tabs of the
  finished jobs whose features are all closed (today's `limen close FNNN` rule, for every closed feature), R-101 cuts
  `close` (exit 2, `next: limen seat sweep`), gains API `herdr` and a check in step 3.9 that the sweep's unit reaches
  Herdr; R-103 keeps the `cleaned` step; 2. R-103, as D-094 (3) has it, adds that daily step and so depends on R-101;
  3. no sweep of leftovers: a tab the `cleaned` step cannot close fails the step (exit 4, `next: limen land <id>`).
- Q-50 (R-103, T-04): `limen diff` and `limen open` in Herdr record their tab's place (`herdr/diff/`, `herdr/`),
  which T-04 forbids a read command (`diff` is on its list), and the `cleaned` step and the sweep close tabs by those
  places. Options: 1. both become `change` (recommended: each opens a tab and records it so Limen can close it; T-04's
  list drops `diff`, dated, in `taste.md`); 2. both stay `read` and write nothing, and a job's tabs are found by
  `herdr tab list` and the name Limen gives them, with a seat check of that output; 3. both stay `read` and stop
  recording, so Limen never closes their tabs.
- Settled by the documents, for D-096 (items 9 and 10 named for Adrian's attention): (1) the steps are in
  `record.json` (A-021, gate 2 S1+): `merged` is R-031's `landed` marker, written in the same write as a new optional
  field `land` (D-079) that then records `closed` (the closing commit, or `null` when nothing closed) and `cleaned`,
  each once under the job's lock through the marker writer; (2) the order is merged, closed, cleaned, and the branch
  and worktree go in `cleaned` (A-021); (3) land runs through the runner with typed refusals (D-070 (2)), the terminal
  question between `validated` and `apply`, apply under a land lock of the job; (4) a failed step keeps its class with
  `next` `limen land <id>`, which replaces R-037's `limen ticket done <codes>`; (5) a rerun continues from the first
  step not recorded, never merges again after `merged`, deletes the branch only while its tip is in the target's
  history (z. 29), and after all steps exits 0 with the steps' line, as abandon's marked line; (6) a kill after R-037's
  branch move: the rerun finds `Close <codes>: landed by <id>` in the target's history, finishes the checkout and
  records `closed`; (7) an older record (`landed`, no `land`) is continued from Git, as abandon's steps are (R-030
  Decision 6), with no migration script (R-031 Decision 1); (8) retire keeps a record whose `land` lacks `cleaned`;
  (9) `cleaned` closes the job's `herdr/` and `herdr/diff/` tabs, the coordinator's own skipped, synchronously with
  `closeJobTab`'s bound and one retry, the result in the output and the job's log; a tab that does not close is a line
  and the step is recorded (T-18 (1), T-01); the same close in `ticket done` (the finished jobs of its tickets) and in
  `abandon` (after its marker, still found from Git); (10) a rerun of `ticket done` on a ticket its own closing commit
  closed continues the marker step and, with nothing left, exits 0 (T-02, the D-092 note), while a number with no
  ticket stays `NO_ACTIVE_TICKET`; (11) land's `irreversible` mark (D-075); (12) the watch tab's close at a job's end
  (`settleJobTab`, A-029) stays.

Resolved (Q-17 → D-068; Q-18 → D-069), asked in the conversation with a push:
- Q-17 (R-095's round-3 notes 2 and 3): `waitFailure`'s message and the opening line of
  `test/runtime/start-queue.test.ts`. Options: 1. two items of R-096 (recommended); 2. a separate S ticket; 3. no
  ticket.
- Q-18 (R-096's `BLOCKED`): go on without a failing run under load, on the deterministic proof? Options: 1. fix the
  fake engine (one `agent_settled` per run, as Pi), a new `test/fake-engine.test.ts`, AC-4 as
  `fails-before.mjs test/fake-engine.test.ts`, AC-7 records the load runs with no failure (recommended); 2. a larger
  load limit first, then 1; 3. change the hook instead (rejected by the implementer: a wake Pi never takes would not
  be recovered).

Resolved (Q-14 → D-066; Q-15 and Q-16 → D-067):
- Q-14 (R-089's round-3 notes 1 and A, `R-089-final-line-null/review.md` → Round 3): the import scan's `fileOf`
  (`test/final-line.test.ts`) resolves paths unlike Node in two forms: `../src//outcome.ts` (an empty segment kept)
  and a `file:` URL with no `//` (resolved against the test file, while Node resolves it from the root; its comment
  says otherwise), so an import of the reader in either form passes the scan; no file uses either form. Options: 1.
  item (f) of R-095: `fileOf` resolves as Node's own resolver does (normalized, `file:` URLs by the URL rules), with a
  fixture case for each form, and its comment fixed (recommended: a few lines in a test helper R-095 does not touch
  otherwise, but the guarantee of AC-10 is code, z. 14); 2. a separate S ticket; 3. no ticket (both forms are
  deliberate). A full answer: the option number.

Handover of 2026-11-20 (D-047, at 42 % context, after the commit that makes R-089 `ready`): `limen-rebuild-10`
starts `limen-rebuild-11` with `node adrian-rebuild/tools/handover.mjs start 11` and ends its turn. The next session's
first acts: a push notification to Adrian that it takes over at stage 2 and waits for his answer 3 and the night mode;
then `node adrian-rebuild/tools/handover.mjs close-previous`, whose lines it reports to Adrian; then `Next`. The
handover after it is `limen-rebuild-12`.

Notes for the next session:
- Start Claude Code in the repository root, so that it loads `.claude/agents/`.
- Progress lives in this section; the Claude Code task list mirrors the open steps when the tool is available.
- After moving or re-cloning the repo, run `sh adrian-rebuild/tools/install-hooks.sh` again.
- Run the gate as `node adrian-rebuild/tools/gate.mjs` (D-001, D-015). Before every commit run `node adrian-rebuild/tools/check.mjs`
  and `npx biome check --error-on-warnings adrian-rebuild`.
- Tracked files must not carry home or scratchpad paths; experiments live in the session scratchpad only.
- Adrian's gate-2 file lives only in `input/` (not tracked); everything in it is now copied into tracked files.

Handover of 2026-11-20 (D-047, at 31 % context, after the commit `R-018:`): `limen-rebuild-11` starts
`limen-rebuild-12` with `node adrian-rebuild/tools/handover.mjs start 12` and ends its turn. The next session's first
acts: a push notification to Adrian that it takes over at stage 2 (R-017 by day, or the night mode on his word); then
`node adrian-rebuild/tools/handover.mjs close-previous`, whose lines it reports to Adrian; then `Next`. The handover
after it is `limen-rebuild-13`.

Handover of 2026-11-20 (D-047, at 47 % context, after the commit `D-061:`): `limen-rebuild-12` starts
`limen-rebuild-13` with `node adrian-rebuild/tools/handover.mjs start 13` and ends its turn. The next session's first
acts: a push notification to Adrian that it takes over and waits for the night phrase; `node
adrian-rebuild/tools/handover.mjs close-previous`, whose lines it reports to Adrian; then `Next` 0. The handover after
it is `limen-rebuild-14`.

Handover of 2026-11-21 (D-047, at 31 % context, after the commit `R-022:` and the commit of R-093's `ticket.md`):
`limen-rebuild-13` starts `limen-rebuild-14` with `node adrian-rebuild/tools/handover.mjs start 14` and ends its turn.
The autopilot of D-063 (4) goes on until 13:00 on 2026-11-21 (Adrian is driving): the next session sends no push,
not even the takeover one; its first act is `node adrian-rebuild/tools/handover.mjs close-previous`, whose lines go
into this section; then `Next` 1 (R-093 is `ready` with its `ticket.md`), by the night mode's rules, with no new
ticket after 13:00. The handover after it is `limen-rebuild-15`.

Handover of 2026-11-21 (D-047, at 32 % context, after the commit `R-089:` (`c526f51`) and the commit of R-023's
`ticket.md`): `limen-rebuild-14` starts `limen-rebuild-15` with `node adrian-rebuild/tools/handover.mjs start 15` and
ends its turn. By day (the autopilot ended at 13:00; Adrian is away with his phone, D-053): the next session's first
acts are a push notification to Adrian that it takes over at R-023 and waits for Q-14, then `node
adrian-rebuild/tools/handover.mjs close-previous`, whose lines go into this section, then `Next` 1 (R-023 `ready` with
its `ticket.md`, written at R-089's tree; it runs AC-5 and AC-6 at HEAD first, D-025). Q-14's answer goes into
D-066 and, for option 1, into R-095's `ticket.md` when it is written. The handover after it is `limen-rebuild-16`.

Handover of 2026-11-21 (D-047, at 30 % context, after the commit `R-095:` (`f2ed1f6`)): `limen-rebuild-15` starts
`limen-rebuild-16` with `node adrian-rebuild/tools/handover.mjs start 16` and ends its turn. By day: the next
session's first acts are a push notification to Adrian that it takes over at R-096 and waits for Q-17, then `node
adrian-rebuild/tools/handover.mjs close-previous`, whose lines go into this section, then `Next` 1: R-096's
`ticket.md` (D-067; written at `f2ed1f6`, with Q-17's two items if Adrian answers "1"; its grep criteria run at HEAD
first, D-025). Q-17's answer goes into D-068. The night defaults and open points of R-019, R-021, R-022, R-023 and
R-095 wait for gate 5.2. The handover after it is `limen-rebuild-17`.

Handover of 2026-11-21 (D-047, at 34 % context, after the commit of R-092's `ticket.md` and D-070):
`limen-rebuild-16` starts `limen-rebuild-17` with `node adrian-rebuild/tools/handover.mjs start 17` and ends its turn.
By day: the next session's first acts are a push notification to Adrian that it takes over at R-092, then `node
adrian-rebuild/tools/handover.mjs close-previous`, whose lines go into this section, then `Next` 1 (R-092 `ready`
with its `ticket.md`, D-070). The night defaults and open points of R-019, R-021, R-022, R-023, R-095 and R-096 wait
for gate 5.2. The handover after it is `limen-rebuild-18`.

Handover of 2026-11-22 (D-047, at 41 % context, after the night's commit `R-099:` (`4b25384`), with the tree clean
and pushed): `limen-rebuild-17` starts `limen-rebuild-18` with `node adrian-rebuild/tools/handover.mjs start 18` and
ends its turn. By day: the next session's first acts are a push notification to Adrian that it takes over at the
close of stage 2, then `node adrian-rebuild/tools/handover.mjs close-previous`, whose lines go into this section, then
`Next` 1: the close of stage 2 (`## Stages` → Closing a stage), gate 5.2 by phone with the "Gate 5.2 summary" above
and R-099's entry (the night defaults of R-024, R-025 and R-099, the open points), the tag `a0.2.0`, and the tickets
of stage 3 `ready` by day (D-074). The handover after it is `limen-rebuild-19`.

Handover of 2026-11-22 (D-081, at 18 % context, at the start of stage 3, after the commit `D-078–D-082:`, with the
tree clean and pushed): `limen-rebuild-18` starts `limen-rebuild-19` with `node adrian-rebuild/tools/handover.mjs
start 19` and ends its turn. By day: the next session's first acts are a push notification to Adrian that it takes
over at the start of stage 3, then `node adrian-rebuild/tools/handover.mjs close-previous`, whose lines go into this
section, then `Next` 1: the tickets of stage 3 `ready` by day for the next night (D-074, D-081). The handover after it
is `limen-rebuild-20`.

Handover of 2026-11-22 (D-047, at 42 % context, after the commit of R-033's `ticket.md` and D-083–D-085, with the
tree clean and pushed): `limen-rebuild-19` starts `limen-rebuild-20` with `node adrian-rebuild/tools/handover.mjs
start 20` and ends its turn. By day: the next session's first acts are a push notification to Adrian that it takes
over at D-083's decision guard, then `node adrian-rebuild/tools/handover.mjs close-previous`, whose lines go into this
section, then `Next` 1. The handover after it is `limen-rebuild-21`.

Handover of 2026-11-22 (D-047, at 34 % context, after the commit `R-026:`, with the tree clean and pushed):
`limen-rebuild-20` starts `limen-rebuild-21` with `node adrian-rebuild/tools/handover.mjs start 21` and ends its
turn. By day, Adrian away: the next session's first acts are a push notification to Adrian that it takes over at
R-030, then `node adrian-rebuild/tools/handover.mjs close-previous`, whose lines go into this section, then `Next` 2
(R-030, R-033, R-100 by day, delegated); `Next` 1 waits for Adrian's return. The handover after it is
`limen-rebuild-22`.

Handover of 2026-11-22 (D-047, at 36 % context, after the commit `R-033:`, with the tree clean and pushed):
`limen-rebuild-21` starts `limen-rebuild-22` with `node adrian-rebuild/tools/handover.mjs start 22` and ends its
turn. By day, Adrian at the terminal: the next session's first acts are a push notification to Adrian that it takes
over to prepare the night of D-091, then `node adrian-rebuild/tools/handover.mjs close-previous`, whose lines go into
this section, then `Next` 2 (a)–(c), ending with the start of `night.mjs --until 09:00`. The handover after it is
`limen-rebuild-23`.

Handover of 2026-11-23 (D-047, at 37 % context, after the commit `D-092:`, with the tree clean and pushed):
`limen-rebuild-22` starts `limen-rebuild-23` with `node adrian-rebuild/tools/handover.mjs start 23` and ends its
turn. By day, Adrian at the terminal: the next session's first acts are a push notification to Adrian that it takes
over at the night defaults of the night of D-091, then `node adrian-rebuild/tools/handover.mjs close-previous`, whose
lines go into this section, then `Next` 2. The handover after it is `limen-rebuild-24`.

Handover of 2026-11-23 (D-047, at 33 % context, after the commit `D-094, D-095:`, with the tree clean and pushed):
`limen-rebuild-23` starts `limen-rebuild-24` with `node adrian-rebuild/tools/handover.mjs start 24` and ends its
turn. By day, Adrian at the terminal: the next session's first acts are a push notification to Adrian that it takes
over at the `ticket.md` of R-087, R-032 and R-037, then `node adrian-rebuild/tools/handover.mjs close-previous`,
whose lines go into this section, then `Next` 2. The handover after it is `limen-rebuild-25`.

Handover of 2026-11-23 (D-047, at 31 % context, after the commit of R-032's `ticket.md` (`d6eb6ed`), with the tree
clean and pushed): `limen-rebuild-24` starts `limen-rebuild-25` with `node adrian-rebuild/tools/handover.mjs start 25`
and ends its turn. By day, Adrian at the terminal: the next session's first acts are a push notification to Adrian
that it takes over at the `ticket.md` of R-037, then `node adrian-rebuild/tools/handover.mjs close-previous`, whose
lines go into this section, then `Next` 2. The handover after it is `limen-rebuild-26`.

Handover of 2026-11-23 (D-047, at 30 % context, after the commit `D-096:` (`c64a9b4`), with the tree clean and
pushed): `limen-rebuild-25` starts `limen-rebuild-26` with `node adrian-rebuild/tools/handover.mjs start 26` and ends
its turn. By day, Adrian at the terminal: the next session's first acts are a push notification to Adrian that it
takes over at the decisions of R-101, then `node adrian-rebuild/tools/handover.mjs close-previous`, whose lines go
into this section, then `Next` 2. The handover after it is `limen-rebuild-27`.

Handover of 2026-11-23 (D-047, at 37 % context, after the commit `Tools: fails-before.mjs …` (`1c51bfa`), with the tree
clean and pushed): `limen-rebuild-26` starts `limen-rebuild-27` with `node adrian-rebuild/tools/handover.mjs start 27`
and ends its turn, before Adrian's manual steps of about 20:00, so that a session with a fresh context guides them.
Adrian is away until then: the next session's first acts are a push notification to Adrian (one line in Polish) that
it takes over at his manual steps of `Next` 3, then `node adrian-rebuild/tools/handover.mjs close-previous`, whose
lines go into this section, then one message that gives him item 1's block and each step of `Next` 3 in full (the
text and command of `## Deployment` 0.1, 0.2 with the full SHA, 0.3, 2.1–2.4, 0.6 and B.3's a0.2.0 part, in that
order), and it waits for his results. The handover after it is `limen-rebuild-28`.

Handover of 2026-11-24 (D-047, at 33 % context, after the commit `R-029:` (`b0c033b`), with the tree clean and
pushed): `limen-rebuild-27` starts `limen-rebuild-28` with `node adrian-rebuild/tools/handover.mjs start 28` and ends
its turn. By day, Adrian at the terminal: the next session's first acts are a push notification to Adrian (one line in
Polish) that it takes over at R-032, then `node adrian-rebuild/tools/handover.mjs close-previous`, whose lines go into
this section, then `Next` 2 from R-032 (`## Agents`, protocol steps 2–7). The handover after it is `limen-rebuild-29`.

Handover of 2026-11-24 (D-047, at 32 % context, after the commit `R-032:` (`3e46310`) and the commit of the `ticket.md`
of R-034 and R-101, with the tree clean and pushed): `limen-rebuild-28` starts `limen-rebuild-29` with `node
adrian-rebuild/tools/handover.mjs start 29` and ends its turn. By day, Adrian at the terminal: the next session's first
acts are a push notification to Adrian (one line in Polish) that it takes over at R-034, then `node
adrian-rebuild/tools/handover.mjs close-previous`, whose lines go into this section, then `Next` 2 from R-034
(`## Agents`, protocol steps 2–7; its `ticket.md` is written at R-032's tree, so it first runs its grep criteria at
HEAD, D-025, and notes any fact R-032's commit moved). The handover after it is `limen-rebuild-30`.

R-034 in `limen-rebuild-29` (2026-11-24, by day, Adrian at the terminal): `close-previous` closed `limen-rebuild-28`
(exit 0). The implementer's run was void by `compare --git` for the ticket's form alone and accepted (Q-58 → D-099
(1)); Q-59 → D-099 (2) makes D-089's rule a check (a commit `Tools: …` after `R-034:`). Review round 1 FAIL on AC-9
alone (after one reply rejected by `review-verdict.mjs` for its form); Q-60 → D-100 (the overdue `failed:quota`);
fixes F1–F12, gate 1067/1067. Review round 2 PASS (after one reply rejected for its form); fixes G1–G3, gate
1068/1068, `fails-before.mjs` exit 0 (fourteen files). Review round 3 PASS with two notes (one to `outcome.md` →
`## Open points`, D-092). A pause at Adrian's request between rounds 2 and 3 ("przez chwilę nie będę miał internetu"),
with nothing running. R-034 `done`; R-102's `ticket.md` is written. For Adrian, proposed in the conversation and not
yet answered: one line in `.claude/agents/rebuild-reviewer.md` → `## Reply format`, since nine replies of the rebuild
were rejected for the same form (bullet lines below a judged criterion, `met` with no colon).

Handover of 2026-11-24 (D-047, at 30 % context, after the commit `Tools: …` (`7df070d`) of D-099 (2), with the tree
clean and pushed): `limen-rebuild-29` starts `limen-rebuild-30` with `node adrian-rebuild/tools/handover.mjs start 30`
and ends its turn. By day, Adrian at the terminal: the next session's first acts are a push notification to Adrian
(one line in Polish) that it takes over at R-036, then `node adrian-rebuild/tools/handover.mjs close-previous`, whose
lines go into this section, then `Next` 2 from R-036 (`## Agents`, protocol steps 2–7). Open for Adrian, asked in
`limen-rebuild-29`'s conversation and not answered: the reviewer definition's one-line form rule ("R-034 in
`limen-rebuild-29`" above). The handover after it is `limen-rebuild-31`.

R-036 in `limen-rebuild-30` (2026-11-24, by day, Adrian at the terminal): `close-previous` printed `handover: closed
tmux session limen-rebuild-29` and one `handover: stopped claude …` line and exited 0; the takeover push was skipped as
redundant, the terminal being active; context 8 % at the start. R-036 `active`: its `ticket.md` (written at `6d17130`)
was checked again at `HEAD` `903a8c9` (protocol step 2, D-025): no criterion is a grep or scan; the places that R-029,
R-032 and R-034 moved are `ticket.md` → `## Decisions` 15–23 (above all the seat notification, now `seatEvent` in
`src/runtime/sweeping.ts`, and the kind `stall` set on `exhaust`). Next: the implementer (protocol step 3).
- D-101: Adrian added the one-line criterion rule to `.claude/agents/rebuild-reviewer.md` while R-036's implementer
  ran; `compare --git` exited 1 naming only that file, whose blob was `0426fed`, the one read after his edit, so the run
  counts (D-101 (2)). The implementer reported `DONE` (gate 1086/1086 twice in its own runs, which do not count).
  Next: the commit `D-101:`, a new `snapshot --git`, then protocol step 4 (the main session's gate and
  `fails-before.mjs`).
- R-036 `done` (delegated): the stall rule reads the job scope's CPU time (`usage_usec` of its `cpu.stat`, the new
  platform member `cpuTime`) instead of the engine's process tree from `ps` (`processTable` and the identity checks
  gone): a pending tool whose progress key holds for the window while the scope's CPU time grows by less than 2 % of
  the wall time ends the job `stall`, `stalled tool <tool>: scope CPU idle and no tool progress for <n>s`; the wrapper
  samples the scope at every tick (test knob `LIMEN_STALL_TICK_MS`) and records the peak share of the machine as
  `scope.cpuPeakPercent` (M-09; a pair closer than half a tick gives no rate), which `limen show` prints; `advisory`
  names its source (`queue` or `stall`), and the wake hook's receipts, attempts and fallback and the seat event are per
  source (D-092). Review PASS in rounds 1–3 (each reply accepted at once by `review-verdict.mjs`, the first since
  D-101), with two rounds of fixes (F1–F3: the end's failed read logged, the 2 % in `docs/jobs.md` as the design
  threshold, an open point; G1–G2: the peak's minimum interval, a test split); round 3's one note went to R-082's notes
  (D-092), and R-087's knob count to its note. Gate 1090/1090. For Adrian at gate 5.3: `outcome.md` → Open points 1–4
  (3: a pending tool with no child process can now stall, accepted in Risk 2; seat step 3.8 shows it). Unmeasured:
  M-09, seat step 3.8.
- R-037 `active` (from `bb0ae2b`): its `ticket.md` (written at `ca67568`) was checked again at `HEAD` (protocol step 2,
  D-025): five cited places moved by a line or two, the rest unchanged, and AC-6 and AC-7 match only lines the change
  removes (`ticket.md` → `## Decisions` 14–16). Next: the implementer (protocol step 3).
- R-037 `done` (delegated): the closing commit of `limen land` and `limen ticket done` is one operation,
  `closeOperation` (`src/project/lanes.ts`): built in a temporary index from the `HEAD` that validate held, through the
  project's `pre-commit`, `prepare-commit-msg` and `commit-msg` hooks (`git hook run`), the branch moved by one
  compare-and-swap, and only then the checkout (`git update-index --refresh`, `git read-tree -m -u`), under the
  ticket-lanes lock; `HOOK_REJECTED`, `STATE_CHANGED`, `CHECKOUT_BEHIND` (`next` null, Decision 17) and `GIT_FAILED`;
  land refuses `TICKETS_UNCOMMITTED` before its merge with `next` `limen land <id>` and never exits 0 after a failed
  close; `commitPaths` is gone; `close` has `movedBy: "R-101"`. The implementer's one `BLOCKED` (`next` as a git command)
  was settled by T-37 and D-046 (Decisions 17–19). The main session's first gate failed once on
  `test/group-extensions.test.ts:92` under a load average of 17; Adrian chose the diagnosis (D-029): the file alone 4 of
  4, the gate again 1106 of 1106 (`outcome.md` → `## Proof`). Review FAIL in round 1 (land's refusal before the merge
  named `limen ticket done`), PASS in rounds 2 and 3, with two rounds of fixes (F1–F4, G1–G5); round 3's note went to
  R-103's notes, and round 1's note 6 too. Gate 1109/1109 (278 s; the earlier 512–568 s came with a loaded machine).
  For Adrian at gate 5.3: `outcome.md` → Open points 1–6 (5: `git commit-tree` ignores `commit.gpgSign`, so a project
  that signs gets unsigned closing commits; read `git config --get commit.gpgSign` in both projects before `a0.3.0`;
  6: a project hook's output in `HOOK_REJECTED`, not a regression) and the new wordings (`CHECKOUT_BEHIND`, the
  `HOOK_REJECTED` message, the `kept <folder>` line, land's failure prefix). Next: the handover to `limen-rebuild-31`,
  which writes D-102 and A, builds C, and starts the night until 08:00 (Adrian: "wszystko dziś, rozpoczęcie przebiegu
  nocnego po zakończeniu otwartej pracy, przebieg nocny do 8:00").
- R-103 `planned` (was `ready (D-096)`): with R-037 `done`, `check.mjs` requires its `ticket.md` (D-054 (1)), which D-096
  left to the night; a night could then commit nothing before R-103, the last of its queue. `limen-rebuild-31` writes
  R-103's `ticket.md` before the night, at `HEAD` after R-037, from D-096 (3) (a)–(l), R-103's notes in `## Tickets` and
  a read-only inventory, and sets it `ready` again.

Handover of 2026-11-24 (D-047, at 41 % context, after the commit `R-037:` (`c8a92b0`), with the tree clean and
pushed): `limen-rebuild-30` starts `limen-rebuild-31` with `node adrian-rebuild/tools/handover.mjs start 31` and ends
its turn. By day, Adrian at the terminal. Adrian's decision for tonight (2026-11-24, in the conversation): "wszystko
dziś, rozpoczęcie przebiegu nocnego po zakończeniu otwartej pracy, przebieg nocny do 8:00", on the main session's
proposal of D-102, A and C below. The next session's acts, in this order:
1. A push notification to Adrian (one line in Polish) that it takes over before the night; then `node
   adrian-rebuild/tools/handover.mjs close-previous`, whose lines go into this section.
2. R-103's `ticket.md` (`adrian-rebuild/R-103-<slug>/`), at `HEAD`, from D-096 (3) (a)–(l), R-103's notes in
   `## Tickets` (among them R-037's round-1 note 6 and round-3 note 1) and a read-only agent's inventory of land's
   code after R-037 (as R-102's was written); status `ready` again; a commit `State: ticket.md of R-103`.
3. D-102 in `## Decisions` (dated 2026-11-24, Adrian's words above; amends D-024): (1) while `.night/lock` is held by
   a live `night.mjs`, a day session only reads, whatever Adrian writes, and changes nothing in the repository; (2) the
   main session starts the runner as a background task that Claude Code tracks (`run_in_background`), as `nohup node
   adrian-rebuild/tools/night.mjs --until HH:MM` with stdout and stderr appended to `adrian-rebuild/.night/launcher.log`,
   so the runner's end wakes the session that started it; (3) at that wake the session sends Adrian a push, reads
   `## State` and `.night/status.json`, and takes over by day (a handover by D-047 when at 30–50 % context); (4) A, the
   resume rule, in `## Agents` → protocol: a session that finds a ticket `active` with a changed working tree runs
   `review-guard.mjs compare --git node_modules/.rebuild-review/R-NNN.git <ticket.md>` first (exit 1 voids the run,
   and Adrian decides); on exit 0 it starts a fresh `rebuild-implementer` with the ticket's path and "the previous run
   was cut; finish from the working tree", then protocol steps 4–7; a review cut before its reply was saved runs
   again; (5) C below is the guarantee of (1) in code. One commit `D-102: …` with `check.mjs` and Biome.
4. C: `night.mjs` exports the liveness check of `.night/lock` (the owner's pid, start time and boot id, as
   `removeAbandoned` reads them; an unreadable lock is not live, as there); `handover.mjs start` and `close-previous`
   refuse with exit 1 and the lock's owner while it is live (a `close-previous` during a night would stop the night's
   `claude -p`, which is older than the new session and runs in the repository, at a clean moment between its
   commits). Tests in `adrian-rebuild/tools/test-handover.mjs` (a live lock refuses both commands and opens or stops
   nothing; a dead or unreadable lock does not refuse) and, if `night.mjs` changes beyond the export, in
   `test-night.mjs`; review by `rebuild-reviewer` as for D-026 (`evidence/night-runner-d026/` is the pattern:
   `evidence/handover-night-lock/` with ticket, review and outcome); one commit `Tools: …`.
5. D-024's preflight: `node --test adrian-rebuild/tools/test-night.mjs` and `test-handover.mjs`, the reviewer's
   verdict, the pushed SHA and a clean tree, and a new `claude -p` session lists both subagent definitions; then the
   runner by D-102 (2) with `--until 08:00`, and a push to Adrian with its start time. The night's queue: R-087,
   R-098, R-101, R-102, R-103 (each `ready`, `Run` `night`, dependencies `done`). Then the session ends its turn and
   changes nothing until the runner's end wakes it (D-102 (1), (3)).
Open for Adrian at gate 5.3 from `limen-rebuild-30`: R-036 `outcome.md` → Open points 1–4, R-037 `outcome.md` → Open
points 1–6 and its new wordings (above). The handover after `limen-rebuild-31` is `limen-rebuild-32`.

`limen-rebuild-31` (2026-11-24, by day, Adrian at the terminal): `close-previous` printed `handover: closed tmux session
limen-rebuild-30` and one `handover: stopped claude …` line and exited 0; the takeover push was skipped as redundant,
the terminal being active; context 7 % at the start.
- R-103 `ready`: its `ticket.md` is written at `9601408` from D-096 (3) (a)–(l), the notes in `## Tickets` and a
  read-only inventory, `evidence/inventories/R-103.md` (a `general-purpose` agent that wrote only that file). The
  inventory's 18 open questions are settled by the documents as the main session's reading (`ticket.md` →
  `## Decisions` 1–18; items 2, 5, 6, 9, 15, 16 and 18 named for Adrian's attention at gate 5.3); size L (was M,
  Decision 19). The ticket builds on R-101's closing function when R-101 is `done` (R-101 comes first in the queue).
  AC-7–AC-9 are the only scans, each confined to a path of `## Change` and matching at `9601408` only lines the change
  removes (D-025).
- D-102 in `## Decisions` (acts 3 of the handover), with two bullets in `## Agents` → protocol: the resume after a cut
  run and the day session's read-only rule while a night holds `.night/lock`.
- C `done` (act 4, D-102 (5), the main session's work): `night.mjs` exports `liveOwner(root)`, the one liveness rule
  of `.night/lock` that its takeover uses too; `handover.mjs start` and `close-previous` refuse with exit 1 and the
  lock's owner while it is live, before any tmux call or signal. Tests first: `test-handover.mjs` 22/24 with the code
  unchanged (the two refusal tests failing), then 24/24; `test-night.mjs` 29/29. Review PASS in round 1 (the reply
  accepted at once), three notes: one settled by the commit, one rejected with its reason, one an open point
  (`evidence/handover-night-lock/`). Next: act 5, D-024's preflight and the runner until 08:00.

Night of 2026-11-24/25 (D-102, until 08:00; Adrian: "przebieg nocny do 8:00"). The handover's acts 1–4 of
`limen-rebuild-31` above are done; a night session runs no `handover.mjs` (it refuses during a night anyway, D-102
(5)). Preflight at `ddce57b` (D-024): `node --test adrian-rebuild/tools/test-night.mjs` → exit 0 (29/29); `node --test
adrian-rebuild/tools/test-handover.mjs` → exit 0 (24/24); the reviewer's verdict on C: PASS
(`evidence/handover-night-lock/review.md`); `node adrian-rebuild/tools/check.mjs` → exit 0 (5 `ready` tickets, their
criteria against the allow-list); `HEAD` equal to `origin/adrian-rebuild`, clean tree; a new `claude -p` session listed
`rebuild-implementer` and `rebuild-reviewer`. Use at 23:03: five-hour window 4 %, weekly 31 %. The old
`.night/status.json` (`no-ticket`, 2026-11-23) predates this night's runs, so the runner ignores it.
- The night's queue, in protocol order (`## Agents`, step 1: the lowest `ready` ID whose dependencies are `done`): R-087,
  R-098, R-101, R-102, R-103; R-103 builds on R-101's closing function when R-101 is `done` (its `## Change`, first
  paragraph). Each ticket's `ticket.md` is checked again at `HEAD` first (protocol step 2, D-025).
- `limen-rebuild-31` starts the runner by D-102 (2) right after the commit of this entry, as a background task, and
  then changes nothing in the repository until the runner's end wakes it (D-102 (1), (3)).
- Run 1 started at 23:03:38 (`.night/launcher.log`). R-087 `active` (23:10): its `ticket.md` (written at `ab36464`)
  was checked again at `HEAD` `b21bd45` (protocol step 2, D-025): no criterion is a grep or scan; R-032 and R-036
  added the test knobs `LIMEN_LINGER_DIR` and `LIMEN_STALL_TICK_MS`, which (b) covers, and moved cited places
  (`ticket.md` → `## Decisions` 16–18). One command of this session was refused by the permissions (an `awk` in a
  pipe, off the list) and was not worked around. Next: the implementer (protocol step 3).
- R-087 `done` (delegated): a job's environment is built from the allow-list `JOB_PASSES` of `src/config.ts`, never
  from a copy of the spawner's; Limen sets `DISABLE_UPDATES=1`, an empty `credential.helper` through
  `GIT_CONFIG_COUNT`, `GIT_TERMINAL_PROMPT=0`, an empty `GIT_ASKPASS` and `GH_CONFIG_DIR` at a folder it never
  creates; `LIMEN_COORDINATOR` and the poller's six names never cross, `LIMEN_PACKAGE` and `LIMEN_WORKER_MODEL` do
  until their tickets; a test knob is read only with `LIMEN_TEST_MODE=1`; `--prepare` gets the engine's environment;
  the job's log names the dropped names. Review FAIL in round 1 (the group fixture printed `LIMEN_HOME` without the
  marker, so a manual group proof would have used the account's real registry), PASS in rounds 2 and 3, with two
  rounds of fixes (F1–F4, G1–G2) and the main session's text fixes of rounds 2 and 3 (step 3.10: `GIT_ASKPASS`, `gh api
  user --silent` in the job, `gh auth status` outside it, no `~/.netrc`). Gate 1124/1124. Night default for Adrian to
  confirm: F2, the empty `GIT_ASKPASS` (`ticket.md` → `## Decisions`, D-054 (2) (b)). For gate 5.3: `outcome.md` →
  Open points 4 (a gh login in a system keyring would still be found; step 3.10 shows which) and 7 (`~/.netrc`), and
  Decisions 1, 2, 4 and 10. Unmeasured: step 3.10. Two commands of this session were refused by the permissions (an
  `echo` after a guard call; a `gate.mjs --out`) and were not worked around; the reviewer's own Biome run was refused
  too (not on its list), so AC-8 was judged from the records. Next: R-098 (protocol step 2).
- R-098 `active` (01:15, from `02492cb`): its `ticket.md` (written at `f5d8b7b`) was checked again at `HEAD` (protocol
  step 2, D-025): no criterion is a grep or scan; the `stats`, statistics, usage and session-commands modules are
  unchanged, and R-032–R-087 moved cited places only (`ticket.md` → `## Decisions` 8–10). Next: the implementer
  (protocol step 3).
- R-098 `done` (delegated): `limen stats` counts lands (a `landed` job, its `parent` chain and the reviewers of its
  branch, from records only) and prints, after the jobs table, the tokens per land and the median lead time with its
  parts (queue, job runs, review); with `--sessions <dir>` also the coordinator's sessions: turns, tokens by class,
  cache read per turn and per land in the sessions' span (M-03), the cache write of the first turn after a land
  (M-04); `SESSIONS_NOT_FOUND`; `Not read` names every part it could not give. Review FAIL in round 1 (a migrated
  record that `ticket done` marks got a lead time to midnight, a guessed number), PASS in rounds 2 and 3 (round 3's
  first reply rejected by `review-verdict.mjs` for its form and run again), with two rounds of fixes (F1–F7, G1–G3)
  and the main session's text fixes. Gate 1144/1144. Night default for Adrian to confirm: F5, the run parts less each
  job's queue wait, so the parts do not overlap; its cost is that every B.3 land (migrated records) prints the parts
  as `—`, M-06's "before" being the total alone (`outcome.md` → Open point 1 gives the other option). For gate 5.3:
  `outcome.md` → Open points 2–7; round 3's note 2 went to R-103's notes (D-092). Unmeasured: M-03, M-04, M-06, M-07
  (B.3, B.4, 9.1). Next: R-101 (protocol step 2).
- R-101 `active` (03:20, from `45605c1`): its `ticket.md` (written at R-032's tree) was checked again at `HEAD`
  (protocol step 2, D-025): AC-4–AC-6 match only lines the change removes (`prune` and `close` both carry `movedBy:
  "R-101"` since R-037); `LIMEN_SETUP_KEEP` also marks a spawn's start that owes setup, so a night default gives that
  mark its own transport name `LIMEN_SETUP` (`ticket.md` → `## Decisions` 7, for Adrian to confirm); moved places in
  Decisions 8–10. Next: the implementer (protocol step 3).
- Run 1 ended at 03:37:08 with exit 1 at the five-hour limit (its log's last result: `api_error_status` 429, "You've hit
  your 5-hour limit"), with R-101's implementer cut before its reply; `night.mjs` started run 2 at 04:07:08. By D-102
  (4): `review-guard.mjs compare --git node_modules/.rebuild-review/R-101.git <ticket.md>` → exit 0, then a fresh
  `rebuild-implementer` with "the previous run was cut; finish from the working tree", which replied `DONE` (seven
  deviations in `outcome.md`); `compare --git` → exit 0 again; the main session's `gate.mjs` → exit 0 (1170/1170) and
  `fails-before.mjs` → exit 0 (`outcome.md` → `## Fails before`). Next: the review (protocol step 5).
- R-101 `done` (delegated): `limen seat sweep` runs, per project, its daily steps (prune, retire, the close of leftover
  Herdr tabs) when `.limen/daily-sweep` is absent or at least 24 h old, and writes the stamp only when all three
  succeed; `limen prune` and `limen close` exit 2 naming `limen seat sweep`; the setup prune at a job's start is gone
  (`LIMEN_SETUP` marks a spawn's setup, night default Decision 7); nothing Git does not hold elsewhere is deleted within
  D-097 (4) (d)'s list (moves into `.limen/archive/`, tested byte for byte); retire waits 24 h after a marker and takes
  the job's own lock without waiting; the poller looks a job up again in the archive. Review FAIL in round 1 (an
  archived folder of a job that never ran blocked the rerun of a crashed GitHub handoff for ever), PASS in rounds 2
  and 3, with two rounds of fixes (F1–F6, G1–G3) and the main session's text fixes of round 3. Gate 1178/1178. Night
  default for Adrian to confirm: Decision 7 (`LIMEN_SETUP`). For gate 5.3: `outcome.md` → Open points 3 (an
  unregistered worktree-root folder that holds a `.git` is still deleted, as at `HEAD`; recommended: move it too), 4,
  5 (the `seat sweep` help summary is the implementer's wording), 6 (prune's moves still wait 60 s for a job's lock;
  recommended: one attempt, as retire), and Decisions 2 and 4; round 3's note 1 went to R-103's notes (D-092).
  Unmeasured: M-01, M-05 (the coordinator's manual), step 3.9. Two commands of this session were refused by the
  permissions (a `cat` and a `Read` of this session's context file outside the repository) and were not worked
  around. Next: R-102 (protocol step 2).
- R-102 `active` (06:38, from `b489760`): its `ticket.md` (written at R-034's tree) was checked again at `HEAD`
  (protocol step 2, D-025): AC-7–AC-9 match only lines the change removes; the places R-036–R-101 moved are in
  `ticket.md` → `## Decisions` 6–8. Next: the implementer (protocol step 3).
- R-102: the implementer replied `DONE` (nine deviations and the proposed words in `outcome.md`); `compare --git` →
  exit 0; the main session's `gate.mjs` → exit 0 (1182/1182) and `fails-before.mjs` → exit 0 (15 files, `outcome.md`
  → `## Fails before`). Next: the review (protocol step 5).
- R-102 review round 1: FAIL (the hook tests wrote six refusal files into the checkout's ignored `.limen/refusals/`,
  for Adrian to remove: `outcome.md` → Open points 5), F1–F5 in `ticket.md` → `## Decisions`; a fresh implementer made
  them (`compare --git` → exit 0); the main session's gate → exit 0 (1188/1188), no new file in `.limen/refusals/`,
  `fails-before.mjs` → exit 0 (19 files). It is past 08:00, so no ticket starts after R-102. Next: review round 2.
- (Written by day, from the night's records.) R-102 review round 2: PASS with five notes, G1–G2 in `ticket.md` →
  `## Decisions` (the last round of fixes), made by a fresh implementer; the gate → exit 0 (1189/1189) and
  `fails-before.mjs` → exit 0 (19 files) at 08:50; review round 3 started and was cut before its reply was saved.
- The night's end: run 1 (23:03–03:37) ended on the 5-hour limit (`429`, "You've hit your 5-hour limit") after R-087
  and R-098; the runner waited 30 min; run 2 (04:07–08:46) made R-101 and R-102 up to its round-3 review and ended on
  the limit again; neither run wrote `status.json`, so `night.mjs` exited 3 at 08:46:56 ("a retry … would start at or
  after the end"). `.night/lock` was removed by the runner. Committed in the night: R-087 (`02492cb`), R-098
  (`45605c1`), R-101 (`b489760`); no night question.

Day of 2026-11-25 (`limen-rebuild-31`, by D-102 (3), after the runner's end woke it; Adrian at the terminal, "no to
działaj"): context 28 % at the takeover.
- R-102 `done` (delegated), resumed by D-102 (4): `review-guard.mjs compare --git` → exit 0, so the night's fix runs
  count; the main session's gate → exit 0 (1189/1189), no new file in the checkout's `.limen/refusals/`;
  `fails-before.mjs` → exit 0 (19 files); review round 3 again: PASS with two notes (one to `outcome.md` → Open points
  9: a start-queue entry is live on its pid and job folder alone, already at `HEAD`; one text fix). Seat rules are cut:
  `limen rule …` exits 2 (`REMOVED`); a coordinator hook's refusal goes to `.limen/refusals/<pid>-<born>.json`, which
  the sweep removes once its process is gone. For Adrian: `outcome.md` → Open points 5 (remove the checkout's ignored
  `.limen/`, six test refusals written by the first tree's gate runs), 6 (a gate check for new ignored files, a
  `Tools:` commit, recommended), 7 and 9 for gate 5.3, and `## Words for gate 5.3`. Unmeasured: seat step 3.5.
- Next: R-103 (`ready`, the last ticket of stage 3), then the close of stage 3 and gate 5.3.

Handover of 2026-11-25 (D-047, at 31 % context, after the commit `R-102:` (`a26d5f4`), with the tree clean and pushed
and no night running): `limen-rebuild-31` starts `limen-rebuild-32` with `node adrian-rebuild/tools/handover.mjs start
32` and ends its turn. By day, Adrian at the terminal. The next session's first acts are a push notification to Adrian
(one line in Polish) that it takes over at R-103, then `node adrian-rebuild/tools/handover.mjs close-previous`, whose
lines go into this section, then R-103 by `## Agents`, protocol steps 2–7: its `ticket.md` was written at `9601408`,
before R-087, R-098, R-101 and R-102, so step 2 first runs AC-7–AC-9 at `HEAD` and notes in `ticket.md` →
`## Decisions` the places those commits moved (above all R-101's closing function in `src/integrations/herdr.ts`,
`closeLeftoverTabs` and `closeJobTab`'s result, which R-103's `## Change` builds on, and R-101's retire in
`src/runtime/retiring.ts`). Open for Adrian: R-102 `outcome.md` → Open points 5 (he removes the checkout's ignored
`.limen/` by hand) and 6 (a gate check for new ignored files, recommended); for gate 5.3 the open points of R-036,
R-037, R-087, R-098, R-101 and R-102 and R-103's items marked (A). The handover after it is `limen-rebuild-33`.

`limen-rebuild-32` (2026-11-25, by day, Adrian at the terminal): `close-previous` printed `handover: closed tmux session
limen-rebuild-31` and one `handover: stopped claude …` line and exited 0; the takeover push was skipped as redundant,
the terminal being active; context 11 % at the start.
- R-103 `active` (from `4f8dea1`): its `ticket.md` (written at `9601408`) was checked again at `HEAD` (protocol step 2,
  D-025): AC-7–AC-9 match only lines the change removes or rewrites; the places R-087–R-102 moved, R-101's closing
  function as the change uses it, and the two R-103 notes the night added to `## Tickets` (R-098 round 3, note 2: the
  day-only marker time in one definition; R-101 round 3, note 1: a closed tab is marked and not asked again, the daily
  close bounded) are `ticket.md` → `## Decisions` 20–23, the last two settled by the documents and marked (A) for gate
  5.3; a new AC-15 runs the tests of the sweep, retire, the Herdr module and statistics. Next: the implementer
  (protocol step 3).
- R-103 `done` (delegated): `limen land` runs through the runner and records its steps `merged` (R-031's `landed`
  with the new field `land`), `closed` and `cleaned`, each once; a rerun continues from the first step not recorded and
  never merges again; the branch and worktree go only in `cleaned`, which also closes the job's recorded Herdr tabs
  through one function that `ticket done`, `abandon` and the sweep share (a closed tab marked, the daily close bounded
  at 60 s); `diff` and `open` are `change` commands; `limen <command> --help` shows the kind; retire keeps a record
  whose `land` lacks `cleaned`. The implementer's `DONE`, `compare --git` → exit 0, the main session's gate → exit 0
  (1233/1233), `fails-before.mjs` → exit 0 (16 files). AC-6 named `test/cli/prune.test.ts`, which R-101 removed (the
  main session's miss in step 2, Decision 24). Review PASS in rounds 1–3 (9, 2 and 4 notes), two rounds of fixes
  (F1–F6: the close's `next` and message on a rerun, an unlisted tab's log line, a comment, two tests, a test made
  independent of the fake's start; G1: a closing commit counts only after the merge, so a job commit with a closing
  subject is never recorded as `closed`), the main session's text fixes of round 3; gate after G1 1237/1237. For gate
  5.3: `outcome.md` → `## New codes and wordings`, Deviation 1 (`MERGE_FAILED` exit 4, `ticket.md` → Decision 25),
  Open points 3–6 (6: a rerun on a record whose merged commit Git no longer holds ends exit 4 each time;
  recommended a fix in the next ticket of `src/job/landing.ts`), and the items marked (A) in Decisions 2, 5, 6, 9,
  15, 16, 18, 21 and 23. One command of this session was refused by the permissions (a stray `python3 --version`
  before an edit) and was not worked around; the edit ran without it. Unmeasured: M-01, M-05, step 3.9. A
  recommendation for Adrian: `check.mjs` checks that every test file a `ready` or `active` criterion names exists, so
  Decision 24's miss cannot recur (a `Tools:` commit).
- Next: the close of stage 3 (`## Stages` → Closing a stage) and gate 5.3 with Adrian.

Close of stage 3 (2026-11-25, `limen-rebuild-32`, by day, `## Stages` → Closing a stage):
- At `9bdf42e` (the tree clean, `HEAD` pushed, no night running) the gate exits 0 with 1237/1237 twice (once alone in
  307.0 s, once through the gate-time tool), `check.mjs` reports 0 errors and Biome is clean; M-10: 317.2 s
  (`evidence/gate-time-a0.3.0.md`; 150.8 s at a0.2.0 with 733 tests). M-01 is from stage 4 (R-039's
  `context-size.mjs`); the coordinator's manual `templates/agents.md` grew from 41,097 to 41,424 bytes (about 10,274 to
  10,356 tokens) between `a0.2.0` and `9bdf42e`.
- The inventory for the gate, by a read-only `general-purpose` agent that wrote only that file:
  `evidence/gate-5.3-inventory.md` (78 night defaults, 75 confirmed by D-093; 69 items for gate 5.3 or marked (A) in
  14 tickets; 126 open points, 61 of them for Adrian by their own text; 36 unmeasured items; 41 new codes and
  wordings; 22 findings; the steps 3.0–3.11; no open night question). A second such agent drafts the placement of the
  open points into `evidence/gate-5.3-placement.md` (Q-53), as Q-29 was at gate 5.2.
- The commit `Stage 3: close` and the local annotated tag `a0.3.0` on it; the tag's full SHA is in the gate reply and is
  the argument of `## Deployment` 3.0.

Gate 5.3 summary (stage 3's 18 tickets are done; the gate is by day, with Adrian):
- Verdict: stage 3 is complete at `a0.3.0`: R-026–R-037, R-087, R-098, R-100–R-103 are `done`, each with a green gate
  and a review PASS; the gate grew from 733 to 1237 tests. Findings closed by stage 3's tickets (their sources): A-001,
  A-002, A-004, A-005, A-010, A-016, A-017, A-020, A-021, A-024, A-029, A-036, A-037, A-052, A-054, A-056, A-057,
  A-059, A-061, A-066, A-068, A-078. Unmeasured: 36 items in 16 tickets (inventory, section 4), measured by the seat
  steps 3.1–3.10, B.3, B.4 and M-01, M-03–M-07, M-11.
- Asked at gate 5.3 in the conversation (Adrian's answers become D-103 onwards):
  - Q-51: the three night defaults of the night of D-102: R-087 F2 (an empty `GIT_ASKPASS` in the job), R-098 F5 (the
    run parts less each job's queue wait), R-101 Decision 7 (the transport name `LIMEN_SETUP`). Options: 1. confirm all
    (recommended: each passed review, and none closes a door a coming ticket needs); 2. all but the ones named; 3. one
    by one.
  - Q-52: the items for gate 5.3 and those marked (A) in the tickets' `## Decisions` (69 in 14 tickets, inventory
    section 2) and the 41 new codes and wordings (R-034, R-037, R-102, R-103). Options: 1. they stand as written, but
    for the ones Adrian names (recommended: each passed review; the final help and texts are R-085's and R-065's); 2.
    one ticket at a time.
  - Q-53: the placement of the open points that need a decision (`evidence/gate-5.3-placement.md`, once drafted and
    checked by the main session). Options: 1. as proposed; 2. another placement, named.
  - Q-54: two `Tools:` commits before stage 4: a gate check that the gate leaves no new ignored file in the checkout
    (R-102 Open point 6), and a `check.mjs` check that every test file a `ready` or `active` criterion names exists
    (R-103 Decision 24). Options: 1. both (recommended: each is a guarantee in code for a miss this stage had); 2. one;
    3. none.
  - Q-55: stage 4 in a new session, while the seat steps of `a0.3.0` (3.0–3.11) and the projects' resumption (D-012)
    are Adrian's. Options: 1. go on (recommended: the next stage does not wait for seat steps unless Adrian says so);
    2. wait for 3.0–3.11 first.
- For Adrian's hand, outside the questions: R-102 Open point 5 (the checkout's ignored `.limen/`, six refusal files
  of the first tree's gate runs; `rm` is denied to the sessions).
- Superseded by "Gate 5.3, partly decided" below.

Gate 5.3, partly decided (2026-11-25, `limen-rebuild-32`; Adrian: "Q-51 - rekomendacja, Q-52 - rekomendacja, Q-53 -
czekam na propozycję, Q-54 - rekomendacja, Q-55 - najpierw ja zamknę etap 3 po swojej stronie"): D-103 (Q-51), D-104
(Q-52), D-105 (Q-54, two `Tools:` commits before stage 4) and D-106 (Q-55: stage 4 waits for Adrian's close of stage 3
on the seat, gone through with a new day session one step at a time).
- Q-53's proposal: `evidence/gate-5.3-placement.md`, drafted by a read-only `general-purpose` agent that wrote only that
  file; the main session checked its four placements that rest on a reading of a planned ticket's scope (R-032 Open
  points 5 and 6 → R-060, R-033 Open point 6 → R-059, R-035 Open point 4 → R-073, R-102 Open point 7 → R-050) against
  those tickets' rows and found each within the row's title. In short: 16 notes for ten planned tickets (R-049, R-050,
  R-051, R-054, R-059, R-060, R-062, R-073, R-076, R-085); two new fix tickets in stage 4, R-104 (S: the sweep's daily
  prune, R-101 Open points 4 and 6) and R-105 (M: the T-04 and T-26 scans of `test/structure.test.ts`, R-032 Open point
  1 and R-026 Open point 3); 36 points no change (14 already closed by another stage-3 ticket or by D-093); five for
  Adrian, one of them Q-54 already. Asked with it:
  - Q-56 (R-029 Open point 4): "refusal" names both a command's exit-1 refusal and a guard's `BAD_DATA` of a Pi value.
    Options: 1. keep it (recommended: the guard's word is T-32 (4)'s and D-055's, and the two never meet in one
    output); 2. another word for the guard's field, `.limen/refusals/` and its writers, as a note for R-085, with a
    record migration (D-079).
  - Q-57 (R-032 Open point 4, `ticket.md` → Decision 9): may a read command take a bounded reading of an outside
    system (`limen status`'s Herdr and systemd probes, 2–5 s; `seat queue`'s 2 s sample)? Options: 1. yes, each bound
    named in T-04 by a dated line, the read test keeping its exceptions (recommended: a read writes nothing, which is
    T-04's guarantee, and the bounds are code); 2. no, the sweep records what the probes read and reads show that
    record (a fix ticket).
  - Q-58 (R-101 Open point 3): a worktree-root folder that Git does not register but that holds a `.git` is still
    deleted by the daily prune. Options: 1. every unregistered folder moves to `.limen/archive/unregistered/`, `.git`
    or not (recommended: nothing Git does not hold elsewhere is deleted, z. 29), in R-104, amending D-097 (4) (d); 2.
    only one whose `.git` Git cannot read; 3. as now.
  - Q-59 (R-102 Open point 9): a start-queue entry is live on its pid and job folder alone, so a process of the agents'
    account can hold other jobs' starts until their `failAfter`. Options: 1. a fix that checks the entry's job folder
    against the project's jobs, in R-104, which becomes M (recommended: the queue's own rule in code, z. 14); 2. an
    accepted risk, since that account already runs every job.
- For Adrian's hand, added to the summary's: R-029's test folders left in the gate's cache (about 84 MB, R-029
  `outcome.md` → Open points).
- Superseded by "Gate 5.3 decided" below; formerly: Adrian's answers to Q-53 and Q-56–Q-59, then a handover to `limen-rebuild-33`, which goes through
  D-106's seat steps with Adrian and then makes D-105's two `Tools:` commits before stage 4.

Gate 5.3 decided (2026-11-25, `limen-rebuild-32`; Adrian: "Q-53 - rekomendacja, Q-56 - rekomendacja, Q-57 -
rekomendacja, Q-58 - rekomendacja, Q-59 - rekomendacja"): D-107. Applied in the same commit: the rows R-104 (M) and
R-105 (M) in stage 4 (`## Tickets`, `## Stages` → Stage 4 and Cost and effect: 12 tickets), the notes for R-049,
R-050, R-051, R-054, R-059, R-060, R-062, R-073, R-076, R-085, R-104 and R-105 in `## Tickets`, and Q-57's dated line
in T-04 (`taste.md`). Adrian asked for the commands to remove the leftover files by hand; the session gave them in the
conversation (the checkout's `.limen/`, and the `limen-live-*`, `limen-tree-*`, `limen-plant-*` and `r029-head-*`
folders of the gate's cache folder, `node-compile` kept), to run while no gate or test runs.

Handover of 2026-11-25 (D-047, at about 33 % context, after the commit `D-107:`, with the tree clean and pushed and no
night running): `limen-rebuild-32` starts `limen-rebuild-33` with `node adrian-rebuild/tools/handover.mjs start 33`
and ends its turn. By day, Adrian at the terminal. The next session's acts, in this order:
1. A push notification to Adrian (one line in Polish) that it takes over for the close of stage 3 on the seat; then
   `node adrian-rebuild/tools/handover.mjs close-previous`, whose lines go into this section.
2. D-106: Adrian's close of stage 3 on the seat, one step at a time with him: `## Deployment` 0.1–0.3 for `a0.3.0`
   (full SHA `6f8a872c237c5ffc8176f37d493b43dffb50c888`), then 3.0–3.11 with the projects' resumption (D-012). For each
   step the session states what Adrian runs and what result counts, reads his result, and records it in this section;
   a failed step goes by `## Stages` → Closing a stage (0.7's rollback or a fix, Adrian's choice). Ask first whether
   he removed the leftover files.
3. D-105's two `Tools:` commits (the gate's check for new ignored files in the checkout; `check.mjs`'s check that
   every test file a `ready` or `active` criterion names exists), each test first, with a review by `rebuild-reviewer`
   as for D-026 (`evidence/<tool-change>/` with ticket, review, outcome).
4. Then stage 4 starts in a new session (D-106, D-081's pattern), which writes stage 4's `ticket.md` files, R-104 and
   R-105 among them.
The handover after it is `limen-rebuild-34`.

`limen-rebuild-33` (2026-11-25, by day, Adrian at the terminal): `close-previous` printed `handover: closed tmux session
limen-rebuild-32` and one `handover: stopped claude …` line and exited 0; the takeover push was skipped as redundant,
the terminal being active; context 8 % at the start. At `f749fae` (the tree clean, `HEAD` = `origin/adrian-rebuild`)
`a0.3.0` is `6f8a872c237c5ffc8176f37d493b43dffb50c888`. The leftover files: the checkout's `.limen/` is gone; the
gate's cache folder still holds 365 `limen-live-*`, 364 `limen-tree-*`, 8 `limen-plant-*` and 2 `r029-head-*` folders.
- The order of the seat steps (D-106), as the session gives them: 0.1, the `quota-resume.ts` link of 3.4 (before
  0.2), 0.2, 0.3, then 3.6 first (R-031's marker step of `limen migrate`, `--dry-run` first, and the unlanded work),
  because `## Deployment` → Conditions 3 runs it before the first spawn and a worker spawn refuses `UNLANDED_WORK`
  (R-030), then 3.1, 3.5, 3.2, 3.3, 3.10, 3.8, 3.9, 3.7, 0.6, 3.11 and the resumption (D-012); 3.4 waits for a real
  limit.
- Adrian removed the gate cache's leftover folders (only `node-compile-cache` is left).
- 0.1 (2026-11-25, 12:04 UTC): `limen status` (a0.2.0) in both projects: `Running (0)`, `Candidates to inspect (0)`,
  `Needs a decision (0)`, `LIMEN_COORDINATOR: until R-050` the only environment line, final lines `ok`; `Older: 79
  records` (synchronizer) and `Older: 64 records` (ledger), which counts only jobs that ended more than 7 days ago
  (`RECENT_MS`, `src/job/listing.ts` line 15 at `a0.2.0`), so ledger's 19 newer jobs (the trial of 2026-11-20 and F011) are
  outside it and 64 + 19 = 83 as on 2026-11-24. The snapshot of both projects' `.limen/` and the seat folder is the
  archive `20261125T120444Z.tgz` in root's snapshot folder: 16084 entries in the source and 16084 in the archive.
- Adrian's note on the removal: zsh printed `no matches found: limen-live-*` (with zsh's `nomatch`, a glob without a
  match stops the whole command); the folder held only `node-compile-cache` afterwards (modified at 12:47 local time),
  so an earlier run of the command had removed the folders.
- 3.4's part before the deployment (D-097 (5) (k)): in Pi's extensions folder of the agents' account,
  `quota-resume.ts` was a symbolic link into a checkout in the agents' home (not `/opt/limen`), linked on 2026-11-16
  with `coordinator-handoff.ts` and `statusline.ts`; Adrian removed it, and the other three entries are unchanged
  (`herdr-agent-state.ts` a file). The two remaining seat extensions are unchanged from `rebuild-base` to `a0.3.0`, and
  the `limen watch` that the handoff's first message names is still a command at `a0.3.0`, so a0.3.0 changes nothing
  they rely on; they load from a worker-writable checkout until step 5.5 (D-012's accepted risk).
- 0.2 (2026-11-25, 12:13 UTC, as root): `seat/deploy.ts 6f8a872c237c5ffc8176f37d493b43dffb50c888` printed the registry
  check (2 projects, 0 running jobs each), `deployed 6f8a872… in /opt/limen (previous
  56f816820786d77e7cd13485ea20bb7fc78dd9d3), tag deployed-2026-11-25-121320` and the `next` of step 0.3, and exited 0;
  `git -C /opt/limen rev-parse HEAD` is the SHA, and the agents' `limen` resolves to `/opt/limen/bin/limen`.
- A gap in 0.2's text: the script that runs is the one already in `/opt/limen`, the previous tag's, and its
  verifications are its own constant (`VERIFICATIONS`, `seat/deploy.ts` line 63 at `a0.2.0`, empty), so a verification a tag
  adds runs only from the next deployment: this deployment ran no `systemd-analyze verify` of the sweep units (R-032),
  and the same holds for R-056's nftables check at a0.5.0 and for a0.3.0's step that refreshes the alerts' units
  (nothing is installed yet, 3.3). At its own tag the new verification runs by hand from the new checkout, as root:
  `node seat/sweep-units.ts` in `/opt/limen` (it renders both units into a new folder of the OS temporary folder,
  verifies them, removes the folder and writes nothing in any home).
- 0.2's verification by hand (as root, `node seat/sweep-units.ts` in `/opt/limen`): exit 4, `systemd-analyze verify
  failed for limen-sweep.service and limen-sweep.timer (exit 1)`, with `limen-sweep.service: Command /usr/bin/node is
  not executable: No such file or directory` and two `CPUAccounting=` warnings of the distribution's own xfs units.
  The sweep's unit and the alerts' unit run root's Node as `/usr/bin/node` (`NODE`, `src/platform/systemd-units.ts` line 37
  at `a0.3.0`; `seat/units.ts`; A-025: a program the agents' account cannot replace), which `docs/seat/agent-setup.md`
  §4 installs (at `/usr/bin/node` and `/usr/local/bin/node`); the seat has no `/usr/bin/node`. So 3.1's install would
  fail its own `systemd-analyze --user verify` and 3.3 would install a unit that cannot start. The steps after 0.2 wait;
  the deployed `a0.3.0` itself runs (the CLI is a process of the agents' Node), and 0.3 is not yet done. Asked of
  Adrian first: where root's Node lies on the seat.
- Root's Node on the seat (as root): `node` is `/usr/local/bin/node`, a root-owned symbolic link (2026-11-07) to the
  tarball's binary in a folder of its own under `/opt` (v24.21.0, `root:root 755`); `/usr/bin/node` does not exist. The
  seat thus differs from `agent-setup.md` §4 (a copy at both paths). Recommended to Adrian: a root-owned symbolic link
  `/usr/bin/node` to the same binary, after a check that its parent folders are root-owned and not group- or
  other-writable, then 0.2's verification again; no code change and no new tag. The alternative, a code change of
  `NODE`, is a ticket and a tag for a path the seat's own runbook already names.
- The seat fix (Adrian, as root, 12:28 UTC): the three folders above the binary are `root:root 755`; the new
  `/usr/bin/node` is a root-owned symbolic link to the same binary (`v24.21.0`); 0.2's verification by hand again:
  `verified limen-sweep.service and limen-sweep.timer of /opt/limen`, exit 0. 0.2 is done.
- 0.3: no coordinator session runs in either project (Adrian), so there is nothing to reload; a coordinator that starts
  from now on loads a0.3.0's hooks and the two remaining seat extensions at its start.
- 3.6, the dry run of `limen migrate` (R-031's marker step), both final lines `ok` with `next` `limen migrate`, no
  folder moved to `.limen/unmigrated/`, every job already a record (79 and 83): synchronizer `markers: 17 landed and 0
  abandoned would be written; 62 finished jobs left without one` (one land each of F001–F010, F013–F016, F018–F020);
  ledger `11 landed and 0 abandoned …; 72 … left without one` (F001–F004, F007, F009–F011, F018–F020; F011's by
  `2026-11-24-f011-repair-5-…`, as recorded on 2026-11-24, and F009 and F010 by the trial of 2026-11-20). Every job
  left without a marker names the same reason: no closing commit of land names it and no abandon branch. Most are
  reviews, continued parents and earlier rounds, which never carry one (`docs/jobs.md`, the job archive); the worker
  jobs of synchronizer's F012 and F022, `seat-smoke`, `pomiar-b1` and a review of `windows-test-cleanup`, and of
  ledger's F006, F008 and `f019-jqwik-skips`, have no closing commit `Close <codes>: landed by <id>` in `HEAD`'s
  history, so they stay in `.limen/jobs/` unmarked: the daily retire never moves them, nothing is deleted, and
  `limen stats` counts no land for them.
- 3.6, the migration for real: synchronizer `markers: 17 landed and 0 abandoned written; 62 finished jobs left without
  one`, ledger `11 landed … written; 72 …`, both `0 migrated, 0 moved to .limen/unmigrated`, final lines `ok` with
  `next` `null`. `limen status` (a0.3.0) in both: no `Unlanded work` section, so no job needs `continue` or `abandon`
  before the first spawn, and the tab close of the first `limen abandon` (T-28 (5), R-030) has no job to show it here
  (left for a trial job, or unmeasured); `Alerts not working` and `Sweep not working` (expected before 3.1 and 3.3);
  `Leftover files (1)`: `.limen/coordinators (seat rules (R-102))` in both, left for 3.5. On `main`, F012 and F022
  (synchronizer) and F006 and F008 (ledger) were closed by `Close <code>: landed` with no `by <id>`, an older land's
  form, so the migration rightly marks none of their jobs (it never reads the git graph).
- 3.1 (12:33–12:36 UTC): `limen seat sweep --install` from an SSH login shell of the agents' account wrote and verified
  both units, reloaded and enabled the timer, exit 0 (lingering was on); `--status` prints `limen-sweep.timer is
  active`. The journal: the first run (12:34:14–16, 2.6 s CPU, 75.2 MB peak) pruned two worktrees of finished jobs
  (`… (job …): job done`: synchronizer's `pomiar-b1`, ledger's `f011-review-5`), retired the 28 marked jobs (11 and 17)
  to `.limen/archive/2026-11/`, ran the daily steps of both projects and ended `swept 2 projects` with a final line
  `ok`; the runs of 12:35 and 12:36 end the same; no `herdr is not available`, no branch deleted (land had deleted
  them), no tab closed. As root, `systemctl list-timers --all` shows no `limen-prune`, but the old template units
  `limen-prune@.service` and `limen-prune@.timer` are still files in the system unit folder (the README of `a0.3.0`
  removes them).
- 3.1, finished: as root, no `*.wants` link of `limen-prune` was left, the two template units moved to a new folder
  beside root's snapshots (nothing deleted), `systemctl daemon-reload`, and no `limen-prune` path is left in the system
  unit folder; `limen seat sweep` run by hand from an SSH shell and from a Herdr pane of the agents' account ends
  `swept 2 projects` and a final line `ok` each; `limen status` (synchronizer) has no `Sweep not working` section and
  `Older: 62 records` (79 less the 17 retired). Left for the trial job of 3.2: the scope facts of 3.1 (`cgroup.events`,
  `systemctl --user is-active` of the job's scope and of a name that never existed).
- 3.5: `limen rule` prints `limen rule was removed with seat rules (R-102); Limen itself resumes a job the subscription
  limit stopped, 5 minutes after the reset (limen seat sweep)` and a final line `usage` `REMOVED`, exit 2; `pgrep -af
  'limen rule timer'` finds nothing (exit 1); `~/.limen/rules` held the two old rule folders
  `claude-quota-reset` and `claude-quota-reset-backup` (2026-11-10), which Adrian removed by hand (the archive of 0.1
  holds them); `.limen/coordinators` held three registration folders in each project (synchronizer to 2026-11-17,
  ledger to 2026-11-24 06:46), and `limen init --drop-leftovers` printed `dropped .limen/coordinators (seat rules
  (R-102))` and `ok` in each.
- 3.2 with 3.8's first part and 3.1's scope facts, on one trial job (the session's proposal: one job that runs only
  `sleep 300` serves all three): from a Herdr pane of the agents' account, `systemd-run --user --scope true` exits 0;
  `limen spawn` (synchronizer, route `pi`/`pi-claude`/`claude-opus-5-5`/`low`, `--timeout 15m`) started
  `2026-11-25-trial-stall-d40ee900` (12:43:56 UTC), final line `ok` with `ids.job`. While it ran: `systemctl --user
  is-active` of its scope printed `active`, exit 0; `systemctl --user status` showed in the scope the wrapper (the
  agents' Node 26 running `/opt/limen/bin/limen`), `pi`, the bridge's `claude` (its tools off but the bridge's MCP
  tools, `--effort low`) and `sleep 300`, 38 tasks, 415.7 MB peak; as root, the scope's `cgroup.events` read
  `populated 1`.
- Refuted on the seat: `systemctl --user is-active` of a unit name that never existed prints `inactive` and exits 4, not
  3, which `## Deployment` 3.1 and 3.2 and the code assume (`NOT_ACTIVE = 3`, `src/platform/linux.ts` line 52 at `a0.3.0`;
  R-026 review round 2, note 8). Where it matters: `scopeState` (`src/platform/linux.ts` line 239) decides by the cgroup
  folder first, so a job whose record names its cgroup is unaffected; for a record with no cgroup (a job that ended
  before its scope ran, `endJobScope` in `src/job/finalize.ts` line 185), exit 4 is a call failure (`callFailure`), so the
  end logs `scope … was not ended: exit code 4` and the job goes to `notEnded`, and the sweep's next reads of that
  scope fail the same way; from the third run the job would be listed as one the sweep cannot end and alerted
  `stuck` (guessed from the code, not seen). For the gate.
- The trial job's end: it was not ended by the stall rule. `sleep 300` ran once with a 400 s tool timeout and returned
  0; the job ended `done with open checks` after 5 minutes (`done: pi exited 0`, 12:49:24), its note checks
  `replied` and `change-no-file` not proven. `limen show` holds the scope's readings: memory peak 415.8 MiB, CPU 7.0 s,
  peak 21 %, OOM kills 0 (3.8's first sentence holds for a `done` job). The CPU criterion was met: 5.5 s at 42 s, 7.0 s
  at the end, so under 2 % of the wall time during the sleep; the stall rule also needs a pending tool whose progress
  key does not move (`pendingTool`, `src/runtime/wrapper.ts` line 314 at `a0.3.0`: `seen.activity` must stay `tool`, and
  every `agent_start`, `turn_start`, `message_start` or `message_update` event sets it to `think`, `src/runtime/
  stream.ts:57`; every stderr chunk and non-JSON stdout line moves the key), so something the real engine sends during
  a running tool keeps it from applying; which one the job's log shows. After the end: `is-active` of the scope prints
  `inactive`, exit 4 (a collected transient scope reads as a unit that never existed; the record's cgroup decides
  first, so the job is unaffected); no `sleep 300` is left; as root, the scope's `cgroup.events` is gone; systemd is
  259 (259.9-0ubuntu0.1). The coordinator wake went to the Herdr pane of the shell that spawned (no Pi agent there:
  `agent_not_found`, two attempts, as designed), and the job's log tab was closed at the end (`herdr tab close …:
  closed`).
- The trial job's log explains it: `write …/note.md` and `bash sleep 300` started with no `wait` between them, and the
  one `wait` after `bash sleep 300` came with the note's write (`note changed`, 12:44:11); nothing else was logged
  until the next `think` (12:49:1x), so no stderr chunk, no non-JSON line and no activity change came during the sleep.
  Pi 1.5.1 runs the tool calls of one message in parallel by default (`toolExecution ?? "parallel"`,
  `pi-agent-core` `dist/agent.js` line 147; `executeToolCallsParallel` in `dist/agent-loop.js` emits every
  `tool_execution_start` first, then each `tool_execution_end` as its tool finishes), and the model put both calls in
  one message. The wrapper keeps one activity (`recordEvents`, `src/runtime/wrapper.ts` line 501 at `a0.3.0`), so the
  write's `tool_execution_end` set it to `wait` while `sleep` still ran, and `pendingTool` was undefined for the rest of
  the sleep: the stall rule (A-059, R-036) never applies to a tool that outlives another of its message. Fix
  direction: pending tools by `toolCallId` (each start adds, each end removes), pending while one is left, the key over
  that set. The job's time limit (default 90 minutes) still bounds such a tool. For the gate, with the exit-4 finding.
- 3.3, first try (Adrian ran the commands with the proposed name, read as a yes to the scheme `limen-<role>`, to be
  confirmed; the agents' account keeps its name until
  5.1 at least): the seat has no `setfacl` (the package `acl`); `curl -d test` to the new topic got HTTP 429 from the
  relay, sent before the phone had subscribed (the response body, which names the limit, was discarded, so the cause
  is unknown); the alerts' system account was created and the topic file is `root:root 600`; `alerts.ts install`
  refused, `setfacl cannot run (spawnSync setfacl ENOENT)`, exit 4, so nothing was granted or installed. The topic's
  value reached the conversation's transcript through the pasted output, so the session advised a new one.
- 3.3, second try: with the phone subscribed to a new topic (written into the topic file unseen), `curl -d test` got
  HTTP 429, `{"code":42908,…,"error":"limit reached: daily message quota reached; …"}`: the relay's daily message
  quota for the seat's address is used up although the alerts have sent nothing. Suspected: the old seat bell
  (`docs/seat/bell.sh`, `bell.ts`, `limen-bell.{service,timer}` at `a0.2.0`, cut by `a0.3.0`), a timer every 15 s that
  posts one ntfy message per terminal job record without its `notify/bell` receipt, so a receipt it cannot write would
  repeat every 15 s; or a relay quota shared by the seat's IPv6 prefix. `alerts.ts install` waits.
- The cause: no `limen-bell` unit is loaded or installed on the seat and its journal is empty today; `curl -4 -d
  test4` got HTTP 200 and reached the phone, `curl -6 -d test6` got 429 `42908`. So the relay's daily quota of the
  seat's IPv6 address (the relay counts IPv6 senders by prefix) is used up by other senders, and IPv4 works.
  `seat/alerts.ts` sends with `fetch` from a unit with no address-family setting (`seat/units.ts` at `a0.3.0`), so
  the alerts would go over IPv6 and fail every run (guessed for Node's choice; the session proposed a check).
- D-108 (Adrian: "rekomendacja"). As root, without the drop-in Node's `fetch` to the relay got 429 and with
  `NODE_OPTIONS=--dns-result-order=ipv4first` 200 (only the second reached the phone), so Node picks IPv6 and the
  option fixes it. The drop-in `ipv4first.conf` in `limen-alerts.service.d/` was written; `alerts.ts install --account
  limen-alerts` granted `--x` on 7 folders, `r-x` on 2 jobs folders and `r--` on 1 registry, wrote, verified and
  reloaded the units, enabled the timer, exit 0. The timer is `active`; the first run (13:35:45) read 2 projects with
  0 failed jobs (the migrated records are history no alert answers) and recorded 0 events, none sent (A-054); the run
  of 13:36:46 the same; `limen status` (synchronizer) has no `Alerts not working` section. 3.3's test failure of a
  trial job comes with the second stall trial.
- The second stall trial (`2026-11-25-trial-stall-2-6b12bad7`, synchronizer, 13:39:02 UTC; its task put `sleep 300`
  alone in its message): the log has `think`, `bash sleep 300`, then at 13:42:08 `stalled tool bash sleep 300: scope
  CPU idle and no tool progress for 180s; TERM sent to process group …` and `failed: …` with the same detail, so the
  stall rule works for a lone tool and the session's diagnosis of the first trial holds (a tool beside another of its
  message). 3.3's test failure: the alerts' run of 13:42:52 read `1 failed job` and logged `sent: synchronizer
  failed:stall 2026-11-25-trial-stall-2-6b12bad7`, and the phone got that one line (D-084). 3.3 is done.
- 3.8's stop and 3.6's abandon (`2026-11-25-trial-abandon-46913d20`, synchronizer): the job wrote `trial-abandon.txt`
  and ran `sleep 170`; `limen stop … "seat check 3.8"` printed `stopped …: seat check 3.8`, ok, and `limen show` reads
  `STOPPED`, `stopped: seat check 3.8` (43 s, 5 tools); `limen status` listed it under `Unlanded work (spawn refuses
  until each is continued or abandoned)` with `1 changed file, 0 unlanded commits` and both commands; `limen open`
  opened its tab (`trial-abandon · stopped`, in `herdr tab list`); `limen abandon` saved it on `limen/abandon/<id>`,
  removed its worktree and printed `closed the Herdr tab … of job …`, ok, and the tab is gone from the next `herdr tab
  list` (T-28 (5), R-030); the branch exists. No alert came for the stopped job (the alerts answer failed jobs only).
- 3.8's TERM and 3.2's KILL, first try: void. The session's commands held a placeholder (`kill -TERM <pid …>`), which
  the pasted block ran as a bash syntax error, so neither wrapper was signalled and both jobs ended `done`
  (`trial-term`, `trial-kill`, the second `done with open checks`); no alert, as for any `done` job. Seen on the way:
  the start queue is the seat's, across projects (`queued trial-kill: … settling 52s after the last start, 0 ahead`,
  started after 58 s), and the compact `limen show` of a running job ends its first line with `pid <n>`. The retry
  reads the pid from that line.
- 3.8's TERM and 3.2's KILL, second try (pids read from the compact `limen show`, each a `…/node /opt/limen/bin/limen`
  wrapper): `kill -TERM` of `trial-term-2`'s wrapper alone: `failed: killed by SIGTERM`, the log's `engine exited with
  code 143` and no `TERM grace elapsed` (E-17, R-028), and the alert `synchronizer failed:signal …` (14:03:12, on the
  phone). `kill -KILL` of `trial-kill-2`'s wrapper alone: 2 s after it the scope still held `pi`, `claude` and `sleep
  170`, and `limen show` read `RUNNING … wrapper dead; limen-sweep will finalize … pid … (not alive)`; the sweep then
  ended it `failed: process group gone: wrapper … is not running; scope limen-job-….scope ended after TERM`
  (14:03:53), no `sleep 170` is left, the scope reads `inactive` (exit 4), and the alert `ledger failed:reaped …`
  (14:04:13, on the phone) (R-027). 3.2 is done; 3.8 has its busy loop and its queue trial left.
- 3.7, the Herdr restart, during the busy-loop trial (`2026-11-25-trial-busy-9ee8f598`, synchronizer, spawned from an
  SSH shell at 14:12:11): Herdr is no systemd unit but a `herdr server` process; Adrian's first try only closed and
  reattached the client (the server's pid unchanged), the second ended the server (`kill`, then no `herdr` process)
  and started Herdr again (a new server pid). Before and after, the job's scope held the same six processes (the
  wrapper, `pi`, `claude`, `timeout 600 sh -c "while :; do :; done"`, its `sh`, `sleep 540`) and `limen show` read
  `RUNNING`, so the job survived a Herdr restart (item 13; R-026). Spawned from an SSH shell, its environment held no
  `LIMEN_COORDINATOR` (the dropped names lack it; Herdr panes have it).
- 3.8's busy loop: the job ended `DONE WITH OPEN CHECKS` (9 min, 8 tools), no `stalled tool` in its log though it was
  silent for over 8 minutes; systemd logged the scope `Killed … with SIGKILL on client request` at 14:21:51 and
  `Consumed 9min 30.641s CPU time over 9min 40.222s wall clock time`, so the loop kept the scope busy and the stall
  rule rightly left the job alone (R-036); the loop started at or after the scope (14:12:11), so its own 600 s limit
  ends no earlier than 14:22:11, and the scope's end at 14:21:51 is what ended it (no `while :` process left). No
  `herdr` line in the log: spawned from an SSH shell, the job opened no tab to close and had no pane to wake.
- 3.8's queue trial, first try: void. With no seat gate file before (restored to none after), `cpuIdle` 100 queued the
  job (`queued: CPU 99% idle (gate 100%) …`), but after 58 s a reading of `CPU 100% idle (gate 100%)` admitted it, so
  it ran and ended `done` before any diagnosis: on an idle seat the rounded CPU reading reaches 100, and `## Deployment`
  3.8's `cpuIdle` 100 is no gate that never opens. Seen on the way: the start notice and the completion wake went to
  the spawning Herdr pane (`agent_not_found`, two attempts each). The retry uses `memoryFree` 100 (80 % was free).
- 3.8's queue trial, second try (`memoryFree` 100 in the seat's gate file, removed after): spawn printed `queued
  trial-queue-2: … memory 79% free (gate 100%), 0 ahead`; at 1 min the log's `start queue: queued for 1m without a
  start: …; largest by memory: …` (the diagnosis), and the alert `ledger queue …` (14:32:39); at 3 min `failed: queued
  for 3m without a start: …` (no engine started, 0 tool calls) and the alert `ledger failed:queue …` (14:34:41), both
  on the phone; the gate file is gone again. The diagnosis's coordinator wake is not seen: no coordinator runs, and
  the log names only the completion wake's two `agent_not_found` attempts (unmeasured until a coordinator runs). 3.8
  is done.
- 3.10 (`2026-11-25-trial-env-ffcd3293` in synchronizer, `…-ef41f90a` in ledger; one task through `--task-file`, its
  credential probe printing only a count of `password=` lines and `env` only names): the same names in both jobs'
  tool shell: the allow-list's (`HOME`, `PATH`, `USER`, `LOGNAME`, `LANG`, `XDG_RUNTIME_DIR`,
  `DBUS_SESSION_BUS_ADDRESS`), Limen's (`LIMEN_JOB`, `LIMEN_JOB_ID`, `LIMEN_CONTEXT_ROOT`, `DISABLE_UPDATES`,
  `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_0`, `GIT_CONFIG_VALUE_0`, `GIT_TERMINAL_PROMPT`, `GIT_ASKPASS`, `GH_CONFIG_DIR`),
  those Pi and the bridge set on Pi's process (`PI_CODING_AGENT`, `PI_MANAGED_INSTALL_ROOT`, `PI_MODEL`,
  `PI_PROVIDER`, `PI_REASONING_LEVEL`, `PI_SESSION_FILE`, `PI_SESSION_ID`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`,
  `CLAUDE_AGENT_SDK_VERSION`, `AI_AGENT`, `NoDefaultCurrentDirectoryInExePath`), systemd's `INVOCATION_ID` and the
  shell's `PWD`, `SHLVL`, `_`; no `LIMEN_COORDINATOR`, `LIMEN_TEST_MODE`, test knob or `HERDR_*`. `credential-fill
  exit=128 password-lines=0`, `no-netrc`, `gh-api exit=4`; `systemctl --user is-system-running` answered `degraded`
  (exit 1), so the user bus works and some user unit has failed (which one is not yet read). The projects' own gates
  passed in the jobs: synchronizer `npm ci && npm run verify` exit 0 (11 checks in 375.0 s), ledger `./mvnw verify`
  exit 0 (`BUILD SUCCESS`, 1:35 min), so no name a project check needs was dropped (the dropped list holds `JAVA_HOME`,
  and Maven found Java on `PATH`). Outside the jobs, `gh auth status` names the account's token in gh's `hosts.yml` (a
  file, which `GH_CONFIG_DIR` hides from a job). Both jobs ended `done with open checks`: their note check would not
  take the task's `;`-joined probe as proof. Each job left its gate log in the shared `/tmp`.
- `## Deployment` corrected from what this close found: 0.2 (a tag's new verification runs by hand at its own
  deployment), 3.1 and 3.2 (systemd 259 exits 4 for an ended scope and for a name that never existed), 3.8 (the queue
  trial's gate is `memoryFree` 100).
- Done so far of D-106: 0.1, 0.2 (with the root Node link), 0.3 (nothing to reload), 3.1, 3.2, 3.3 (D-108), 3.5, 3.6,
  3.7, 3.8, 3.10, and 3.4's part before the deployment. Left: 3.9 and 0.6, 3.11, the resumption; 3.4 waits for a real
  limit; B.3's a0.3.0 part and B.4 belong to the a0.4.0 deployment.
- Findings for Adrian's decision (in this entry above): (1) `systemctl --user is-active` exits 4 on systemd 259 where
  `scopeState` expects 3, so a job that ended before its scope ran would be logged `scope … was not ended` and, from the
  third sweep, listed and alerted `stuck` (from the code; not seen); (2) Pi 1.5.1 runs a message's tool calls in
  parallel and the wrapper keeps one activity, so the stall rule misses a tool that outlives another of its message
  (seen); (3) D-108's ticket: the alerts' unit sends over IPv4 first. The session's recommendation: three S fix
  tickets at the head of stage 4, `delegated`, and the resumption does not wait for them, since a job's time limit
  bounds (2), (1) is a false alarm with nothing lost, and the drop-in covers (3).

Handover of 2026-11-25 (D-047, at 36 % context, after the commit of this entry, with the tree clean and pushed and no
night running): `limen-rebuild-33` starts `limen-rebuild-34` with `node adrian-rebuild/tools/handover.mjs start 34`
and ends its turn. By day, Adrian at the terminal. The next session's acts, in this order:
1. A push notification to Adrian (one line in Polish) that it takes over the close of stage 3 on the seat at 3.9;
   then `node adrian-rebuild/tools/handover.mjs close-previous`, whose lines go into this section.
2. D-106 goes on, one step at a time with Adrian, as in "`limen-rebuild-33`" above (each step: what he runs, what
   result counts, his result recorded here; commands with no placeholder inside a pasted block, values read by the
   commands themselves; output that could hold the alerts' topic or a token masked by the command): first
   `systemctl --user --failed --no-pager` on the agents' account (the `degraded` of 3.10); then 3.9 with 0.6, a trial
   route in one project through a coordinator Adrian starts as usual (one small ticket through spawn, review and
   land; the exit codes and the time; the start notice and the completion wake reaching the coordinator, unmeasured
   so far; land's `cleaned` closing the job's watch tab and the tabs `limen open` and `limen diff` opened, `herdr tab
   list` before and after; the daily step's close of a leftover tab, from the sweep's journal); then 3.11 (the GitHub
   ruleset on `main` of both projects); then Adrian's decision on the three findings above (D-109 onwards; rows in
   `## Tickets` and `## Stages` → Stage 4 if he takes the recommendation); then the projects' resumption (D-012), with
   the trial leftovers named for him: the branch `limen/abandon/2026-11-25-trial-abandon-46913d20` in synchronizer,
   which Limen never deletes, and the two jobs' gate logs in the seat's `/tmp`.
3. D-105's two `Tools:` commits, each test first, with a review by `rebuild-reviewer` as for D-026.
4. Then stage 4 starts in a new session (D-106, D-081's pattern), which writes stage 4's `ticket.md` files.
The handover after it is `limen-rebuild-35`.

`limen-rebuild-34` (2026-11-25, by day, Adrian at the terminal): `close-previous` printed `handover: closed tmux session
limen-rebuild-33` and one `handover: stopped claude …` line and exited 0; the takeover push was skipped as redundant,
the terminal being active; context 10 % at the start; `HEAD` = `origin/adrian-rebuild` = `c7f491b`, the tree clean.
- 3.10's `degraded`: `systemctl --user --failed` on the agents' account lists one unit, `quota-watch.service`, `LOAD
  not-found`, `failed (Result: exit-code)` since 2026-11-10 19:26 UTC, `status=2`. No version of this repository names
  `quota-watch` (`git grep` at `rebuild-base` and `HEAD`, `git log --all -S`), and Limen reads neither
  `is-system-running` nor a failed state (`git grep` in `src`, `seat`, `bin`, `hook`, `docs`): a pre-rebuild seat
  unit of the same day as 3.5's old rule folders, whose definition is gone while the user manager keeps its failed
  state. Not a Limen finding. Proposed: `systemctl --user reset-failed quota-watch.service` after a check that no
  `quota-*` unit file or timer is left, so that the user manager answers `running` and a failure from now on shows.
- Done (Adrian): no `quota-*` unit file or timer is listed; after `reset-failed quota-watch.service`,
  `systemctl --user is-system-running` answers `running`. 3.10 is complete.
- The order from here (the session's): 3.11 before 3.9 with 0.6, since the ruleset is quick and independent of the
  trial (condition 6 asks it only before the resumption). Land pushes nothing (`src/job/landing.ts` at `a0.3.0` has no
  push), so the trial touches no `main` on GitHub and need not wait for 3.11.
- 3.9's procedure, read from the code at `a0.3.0`: a job's watch tab closes at its end (`settleJobTab`,
  `src/integrations/herdr.ts` line 50), so land's `cleaned` (`closeJobTabs`, line 133) closes the tabs `limen open`
  (recorded in `herdr/`) and `limen diff` (recorded in `herdr/diff/`) opened after the job ended, and finds the watch
  tab gone (a log note, no output line); land closes only the landed job's tabs (`closeOperation` with no
  `closeTicketTabs`), so a tab `limen open` opened for the feature's review job is left over once land's `closed` step
  moves the ticket to `done`, and the daily step closes it (`closeLeftoverTabs`, line 374; `closedJobFeatures`,
  `src/job/job.ts` line 179). The daily steps run when the project's `.limen/daily-sweep` stamp is absent or at least
  24 hours old (`dailyDue`, `src/runtime/sweeping.ts` line 340); today's ran at 12:34 UTC.
- 3.11 (Adrian, in GitHub's ruleset form of both projects): `Your rulesets won't be enforced on this private
  repository until you move to GitHub Team organization account.` Both projects are private repositories whose
  plan does not enforce rulesets, so 3.11 cannot be done as written. GitHub's documentation names rulesets for
  private repositories with GitHub Pro, Team and Enterprise Cloud, while community threads report the same banner on
  Pro accounts, so whether Pro suffices is settled by no source. None of gate 2 §7 D1 and §9 item 2, D-012,
  `taste.md` or the rubric foresees the case: asked of Adrian as Q-60. Since land pushes nothing, 3.9 with 0.6 can go
  on meanwhile.
- 0.6 with 3.9 started (Adrian, ledger, F012, worker `2026-11-25-f012-sqlite-adapter-d9c3c39c`; the coordinator was
  told to run `limen open` and `limen diff` before land and to land only on Adrian's "land"). Seen while the worker
  ran: the coordinator got the completion wakes of ledger's five trial jobs of this close (`trial-kill`,
  `trial-kill-2`, `trial-queue`, `trial-queue-2`, `trial-env`), spawned from shells with no coordinator, as fallback
  wakes (`sendCompletion` with `fallback`, `hook/wake.ts` line 457 at `a0.3.0`; `oldEnoughForFallback` has no upper
  age, `src/job/wake-delivery.ts` line 301), each answered by a turn and still recorded unconfirmed, so each came twice
  until `wake was unconfirmed twice; automatic delivery stopped` (`completionStopped`, line 38: the count is on disk,
  so no session gets them again). The text said `The subscribed coordinator is busy` for jobs that have no
  subscriber (`src/job/wake-text.ts` line 119). The coordinator acted on none of them and F012 went on. Finding (4)
  for Adrian's decision with the three above: a fallback wake answered by a turn is not confirmed (why, not yet read:
  the confirmation needs `accepted`, `entered`, `answered` and `settled`, `hook/wake.ts` line 727), and its text names
  a subscriber that does not exist; cost, not loss (two coordinator turns per job; synchronizer's seven trial jobs
  wait for its coordinator's first start the same way). Whether the worker's own wake comes once is read at its end.
- D-109 (Adrian, on finding (4)): such artefacts of the rebuild's trials are accepted during the rebuild, not in the
  version it ends with; (4) is `fix` before a1.0.0, its ticket decided with the other findings. Adrian asked for the
  context and history of the ruleset before answering Q-60 (A-006 and its Q3 in `audit.md`, gate 2's A-006 decision,
  §7 D1 and B1″, D-012, `## Deployment` 3.11 and 5.2, R-055); the session gave them in the conversation.
- Adrian on the background of Q-60: `synchronizer` and `ledger` are personal projects kept private, not worth a paid
  plan; Limen is to serve, from a1.0.0 at the earliest, a professional project of his on a dedicated GitHub account
  (his account a collaborator, every repository private), where protecting the repositories matters. The session
  noted for it that fine-grained tokens do not reach a repository owned by another personal account through a
  collaborator (GitHub's documentation lists that gap), which B1″ assumes; Adrian answered Q-61 that the project is a
  beneficiary, not a goal of the rebuild (D-111), so nothing is added for it.
- Q-60 → D-110 (Adrian: "zgodnie z rekomendacją", the session's "2 + B"): §7 D1 per project; R-106 (S, delegated,
  night) in stage 4 with seat step 4.10; 3.11 not done; 5.2 only where a ruleset exists; condition 6 gone; stage 4 has
  13 tickets and 11 seat steps. Q-61 → D-111.
- 0.6 with 3.9, results (ledger, F012; Adrian's times are local, UTC+1): the first spawn at 16:23 local, ready to land
  at 2026-11-25T20:18:00Z after review 7 (seven repairs and seven reviews), `limen land` of
  `2026-11-25-f012-repair-7-21408ccf` at 20:30:06Z: `landed … onto main`, `land: closed spec/features/done/2026-11/F012-…
  in d91c177; NOW and PROVEN regenerated`, `deleted branch limen/2026-11-25-f012-sqlite-adapter-d9c3c39c`, `closed the
  Herdr tab w64:t2 of job 2026-11-25-f012-repair-7-21408ccf` and the final line `ok`; the project's gate on `main` passed
  (821 tests). `herdr tab list` before land: `F012 repair 7 · done` (`w64:t2`) and `F012 review 7 · done` (`w65:t2`),
  each opened by the coordinator's `limen open`, and no `· diff` tab; after land `w64:t2` is gone and `w65:t2` stays.
  The daily step from the unit, after the stamp's removal: `closed the leftover Herdr tab w65:t2 of job
  2026-11-25-f012-review-7-4fce44d3` and `ran the daily steps of …`, no `herdr is not available`, and `w65:t2` is gone
  from the next list. So land's `cleaned` and the daily close hold (R-103, R-101). The diff tab: `limen diff` opens a
  tab only when Hunk's binary is on `PATH` and prints `git diff <base>...<branch>` otherwise (`showJobDiff`,
  `src/integrations/hunk.ts` line 44 at `a0.3.0`), and no doc of `a0.3.0` names Hunk, so 3.9's diff half assumed a
  viewer the seat likely lacks (asked). After land the coordinator handed over to a new session in a new tab (the seat
  extension `coordinator-handoff.ts`, over 30 % context); that tab is not in the last list (asked).
- The read of F012's jobs (Adrian): `command -v hunk` finds none on the agents' account (`no-hunk`), so `limen diff`
  printed the git command and the diff half of 3.9 cannot happen on this seat (3.9 corrected; a note for R-081). Each
  of the 15 F012 jobs (the worker, repairs 1–7, reviews 1–7) holds one `notify/delivered` entry, the coordinator's
  session, and no `notify/unconfirmed` file: every completion wake of the session's own jobs was confirmed once, so
  (4) touches only fallback wakes. No job holds a `_start.` entry, so no start notice was delivered; whether any F012
  job waited in the start queue (a start notice is sent only then) is not read, so the start notice stays unmeasured.
  The handoff's new tab "3" was closed by Adrian. 0.6 and 3.9 are done.
- Q-62 → D-112 (Adrian: "Q-62 zgodnie z rekomendacjami"): R-107 (E-18), R-108 (E-19) and R-109 (D-108) in stage 4,
  each S, `delegated`, `night`, with seat steps 4.13, 4.12 and 4.11; (4) a note for R-051; stage 4 has 16 tickets and
  14 seat steps.
- D-113 (Adrian): the projects stay paused and the Max window goes to the rebuild; the resumption waits for his word.
  He cleans the trial leftovers first. Limen has no command that removes them: `limen abandon` refuses a job with no
  unlanded work (`NO_UNLANDED_WORK`, `src/job/abandoning.ts` line 180 at `a0.3.0`), retire takes only a job with a
  `landed` or `abandoned` marker 24 hours old (`src/runtime/retiring.ts`), and only a person deletes a job's record
  (R-031 Decision 6). So the trial jobs of 2026-11-25 (their folders, branches, any worktree, the gate logs in `/tmp`)
  are listed first and removed by hand after; removing their folders also keeps them out of `limen stats` (B.3, B.4)
  and spares synchronizer's coordinator their fallback wakes.
- The cleanup (Adrian, as the agents' account, with the sweep's timer stopped and started again, `active` after): in
  synchronizer `git worktree remove` of the six registered trial worktrees, `git branch -d` of the seven trial
  branches (each `was 2699d60`) and `git branch -D` of `limen/abandon/2026-11-25-trial-abandon-46913d20` (`was
  b7e290c`, the trial's one file), and its seven trial job folders; in ledger `git branch -d` of the five trial
  branches (`was 3336935`) and its five trial job folders; in `/tmp` the two `trial-env` gate logs; the chain of `&&`
  ended `CLEANED`. F012's jobs and temporary files are untouched.
- D-106 is complete: `## Deployment` 0.1–0.3, 0.6, 3.1–3.3, 3.5–3.10, and 3.4's part before the deployment are done;
  3.11 is not done by D-110. Left: 3.4 waits for a real limit, which cannot come while the projects stay paused
  (D-113); B.3's a0.3.0 part and B.4 belong to the a0.4.0 deployment; the resumption waits for Adrian (D-113).

Handover of 2026-11-26 (D-047, at about 31 % context, after the commit of this entry, with the tree clean and pushed
and no night running): `limen-rebuild-34` starts `limen-rebuild-35` with `node adrian-rebuild/tools/handover.mjs start
35` and ends its turn. By day, Adrian at the terminal. The next session's acts, in this order:
1. A push notification to Adrian (one line in Polish) that it takes over at D-105's two `Tools:` commits; then
   `node adrian-rebuild/tools/handover.mjs close-previous`, whose lines go into this section.
2. D-105's two `Tools:` commits, each test first, with a review by `rebuild-reviewer` as for D-026
   (`evidence/<tool-change>/` with ticket, review, outcome): (a) the gate's check that a gate run leaves no new ignored
   file in the checkout (R-102 `outcome.md` → Open point 6); (b) `check.mjs`'s check that every test file a `ready` or
   `active` criterion names exists (R-103 `ticket.md` → Decision 24).
3. Then stage 4 starts in a new session (D-106, D-081's pattern), which writes stage 4's `ticket.md` files: R-038–R-047
   and R-104–R-109, with the notes of `## Tickets` for each (R-104, R-105, R-107–R-109, and R-051's for stage 5); the
   projects stay paused (D-113), so the Max window is the rebuild's, by day and by night.
The handover after it is `limen-rebuild-36`.

`limen-rebuild-35` (2026-11-26, by day, Adrian at the terminal): `close-previous` printed `handover: closed tmux session
limen-rebuild-34` and one `handover: stopped claude …` line and exited 0; the takeover push was skipped as redundant,
the terminal being active; context 7 % at the start; `HEAD` = `origin/adrian-rebuild` = `74d85dc`, the tree clean.
- D-105 (1) done: `gate.mjs` fails on a new ignored file in the checkout outside `node_modules/` and editor swap files,
  naming each (`evidence/gate-new-ignored/`, the commit `Tools: gate.mjs fails on a new ignored file …`); review PASS
  in rounds 1–3. The full gate leaves none in this checkout (exit 0, 1237/1237).
- Next: D-105 (2), `check.mjs`'s check of the test files that `ready` and `active` criteria name
  (`evidence/check-test-files/`); then handover item 3 above (stage 4 in a new session).
