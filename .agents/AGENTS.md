# FloorPlanner — Agent Rules

## Kontekst projektu
- Przeczytaj `.agents/PROJECT_KNOWLEDGE.md` na początku każdej sesji — zawiera pełną dokumentację architektury, algorytmów i aktualnego stanu.
- Aplikacja działa z pliku (`file:///` protocol) — nie wymaga serwera do działania.
- Kod to vanilla JS (bez frameworków), ładowany przez `<script>` tagi w `index.html`.

## Testowanie
- Otwórz `file:///C:/Projekty/moje/floorPlanner/index.html` w przeglądarce.
- Alternatywnie: `npm run dev` → `http://localhost:3000` (auto-reload).
- Do force reload użyj `Ctrl+Shift+R`.
- Testy jednostkowe: `npm test` (własny mini-runner, ~80 testów).
- Używaj `window._wallGraph`, `eventBus`, `appState` do programistycznego debugowania.

## TDD
- **Nowa logika** → najpierw test w `tests/<kategoria>/<nazwa>.test.js`, potem implementacja.
- **Bugfix** → najpierw test reprodukujący buga, potem fix.
- **Wyjątek**: kod UI/DOM (canvas layers, toolbar, sidebar) — testowany manualnie.

## Konwencje kodu
- Współrzędne w **milimetrach (mm)**, Y-down (screen coords).
- `wallIds[k]` = wall ID krawędzi kończącej się na `polygon[k]` (incoming edge convention).
- `wallId = null` → otwór drzwiowy. `wallId = number` → ściana (dylatacja).
- Nowe narzędzia wzoruj na `WallTool` / `DoorTool`.
- Nowe komendy (undo/redo) wzoruj na `AddWallCommand` / `AddDoorCommand`.

## Krytyczne algorytmy
- `_mergePolygonPairThroughDoors` w `wall-graph.js` — najkompleksowszy algorytm. Przy zmianach: sprawdź brak duplikatów, brak diagonalnych krawędzi, poprawne wallIds.
- `_splitCollinearOpposite` w `polygon-clip.js` — dzieli "dumbbell" polygony.
- `insetRectilinear` w `geometry.js` — dylatacja. Wymaga axis-aligned edges.

## Język komunikacji
- Użytkownik komunikuje się po polsku.
