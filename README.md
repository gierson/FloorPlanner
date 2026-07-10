<div align="center">

# 🪵 FloorPlanner

**Interaktywny planer układania podłóg — projektuj pomieszczenia i automatycznie optymalizuj rozkład paneli, desek i płytek.**

[![Deploy to GitHub Pages](https://github.com/gierson/FloorPlanner/actions/workflows/deploy.yml/badge.svg)](https://github.com/gierson/FloorPlanner/actions/workflows/deploy.yml)
[![Live Demo](https://img.shields.io/badge/demo-live-2ea44f?logo=github)](https://gierson.github.io/FloorPlanner/)
![Vanilla JS](https://img.shields.io/badge/vanilla-JS-f7df1e?logo=javascript&logoColor=black)
![No build step](https://img.shields.io/badge/build-none-blue)

### 🔗 [**Uruchom aplikację → gierson.github.io/FloorPlanner**](https://gierson.github.io/FloorPlanner/)

</div>

---

## Czym jest FloorPlanner

FloorPlanner to aplikacja webowa dla osób planujących **układanie podłóg** — od paneli
laminowanych i desek drewnianych, po płytki ceramiczne i parkiet w jodełkę.

Rysujesz ściany pomieszczenia, wstawiasz drzwi, wybierasz materiał, a aplikacja
**automatycznie oblicza optymalny rozkład paneli** — z uwzględnieniem szczelin
dylatacyjnych przy ścianach, ciągłości wzoru przez otwory drzwiowe, minimalizacji
odpadu z docinków oraz zestawienia materiałowego potrzebnego do zakupu.

Całość działa w przeglądarce — **bez instalacji, bez konta, bez serwera**. Dane
projektu zostają na Twoim urządzeniu.

## ✨ Kluczowe funkcje

### 🏠 Projektowanie pomieszczenia
- **Rysowanie ścian** metodą klik-klik oraz gotowy kształt prostokąta
- **Snapowanie** do siatki i do kątów 45° / 90° dla precyzyjnych obrysów
- **Wpisywanie wymiarów** w milimetrach bezpośrednio podczas rysowania
- **Dwa tryby odniesienia** — rysowanie po osi ściany albo **od krawędzi podłogi**
  (wymiary „w świetle", tak jak podaje je projekt pomieszczenia)
- **Automatyczne wykrywanie pokojów** — zamknięte obrysy stają się pokojami,
  ściana działowa dzieli przestrzeń na dwa osobne pomieszczenia
- **Drzwi** z podglądem na żywo (ghost preview), snapowaniem do środka ściany
  i wymiarowaniem od narożników

### 📐 Optymalizacja układu
- **Automatyczne obliczenie rozkładu paneli** dla całego planu jednym kliknięciem
- **Szczeliny dylatacyjne** przy ścianach, z zachowaniem **ciągłości wzoru przez
  otwory drzwiowe** — panele przechodzą płynnie między pomieszczeniami
- **Łączenie pomieszczeń w strefy podłogi** — kilka pokojów połączonych drzwiami
  traktowanych jako jedna ciągła powierzchnia (obsługa wielu drzwi na jednej ścianie)
- **Korekta pozycji podłogi (offset)** — ręczne przesunięcie rastra dla lepszego
  dopasowania docinków przy ścianach
- **Klasyfikacja i minimalizacja docinków** — scoring układu pod kątem odpadu

### 🎨 Wzory i materiały
- **Wzór prosty** z przesunięciem (stagger): brak / 1/2 / 1/3 długości panelu
- **Jodełka klasyczna 45°** z wyborem **kierunku rzędów** (poziomo / pionowo)
- **Wybór kierunku układania** dla obu wzorów
- **Gotowe presety materiałów**: panele laminowane, deski drewniane, płytki
  ceramiczne, płytki wielkoformatowe i deski do jodełki
- **Własne presety** — zapis własnych wymiarów materiału (pamięć przeglądarki)

### 📊 Zestawienie i zarządzanie
- **Podsumowanie materiałowe** — powierzchnia, liczba pełnych paneli,
  liczba i rozmiar docinków, szacowany odpad
- **Projekty** — zapis i wczytywanie planów oraz **import / eksport do JSON**
- **Cofnij / Ponów** (pełna historia zmian) oraz **Zoom / Pan** na planie

### ⌨️ Skróty klawiszowe

| Skrót | Akcja |
|---|---|
| `W` | Narzędzie: rysuj ścianę |
| `D` | Narzędzie: dodaj drzwi |
| `V` | Narzędzie: zaznacz / edytuj |
| `Del` | Usuń ścianę |
| `F` | Przełącz stronę odsunięcia (tryb „od krawędzi podłogi") |
| `Ctrl` + `Z` / `Ctrl` + `Shift` + `Z` | Cofnij / Ponów |
| `Ctrl` + `O` | Zarządzaj projektami |

## 🚀 Uruchomienie lokalne

FloorPlanner to statyczna aplikacja (HTML / CSS / JS) **bez kroku budowania**.

```bash
# Sklonuj repozytorium
git clone git@github.com:gierson/FloorPlanner.git
cd FloorPlanner

# Wariant 1: serwer deweloperski z auto-reload
npm install
npm run dev        # http://localhost:3000

# Wariant 2: bez niczego — po prostu otwórz plik
#   otwórz index.html w przeglądarce
```

## 🧪 Testy

Projekt korzysta z własnego, lekkiego test-runnera (bez zależności zewnętrznych)
pokrywającego logikę geometrii, przycinania wielokątów i modelu grafu ścian.

```bash
npm test           # jednorazowe uruchomienie
npm run test:watch # tryb watch — ponowne uruchomienie po zmianach
```

## 🏗️ Architektura

Aplikacja napisana w **czystym JavaScript** (vanilla, bez frameworków i bundlera),
renderowana na **wielowarstwowym Canvas 2D**.

```
index.html
└── app.js  (FloorPlannerApp — fasada)
    ├── Model danych      WallGraph — planarny graf ścian, wykrywanie pokojów,
    │                     łączenie stref podłogi przez drzwi
    ├── Warstwy canvas    Grid · Walls · Layout · Overlay (interakcja myszy)
    ├── Narzędzia         WallTool · DoorTool · SnapSystem · DimensionInput
    ├── Silnik            Optimizer · GridGenerator · HerringboneGenerator ·
    │                     LayoutEngine · PolygonClip · Geometry (dylatacja)
    └── UI                Toolbar · Sidebar · SummaryPanel · ProjectPanel
```

Wzorce spajające aplikację:
- **EventBus** (pub/sub) — luźno powiązana komunikacja między modułami
- **AppState** — reaktywny stan z obserwatorami
- **CommandManager** — wzorzec komend zapewniający cofanie / ponawianie

Wszystkie współrzędne wyrażone są w **milimetrach**. Sercem systemu jest
`WallGraph` — planarny graf, który wykrywa pokoje przez znajdowanie minimalnych
cykli i łączy je w ciągłe strefy podłogi przez otwory drzwiowe.

## 🌐 Wdrożenie

Każdy push do gałęzi `main` automatycznie publikuje aplikację na **GitHub Pages**
poprzez workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## 📄 Licencja

Projekt udostępniony na warunkach licencji zawartej w pliku [LICENSE](LICENSE).
