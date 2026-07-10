# FloorPlanner

Aplikacja webowa do **planowania układania podłóg** (paneli podłogowych, desek, płytek).

🔗 **Demo na żywo:** https://gierson.github.io/FloorPlanner/

## Uruchomienie lokalne

```bash
npm install
npm run dev      # live-server na http://localhost:3000
```

To statyczna aplikacja (HTML/CSS/JS bez kroku budowania) — wystarczy otworzyć `index.html`
lub uruchomić dowolny serwer statyczny.

## Testy

```bash
npm test
```

## Wdrożenie

Każdy push do gałęzi `main` automatycznie publikuje aplikację na GitHub Pages
za pośrednictwem workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).
