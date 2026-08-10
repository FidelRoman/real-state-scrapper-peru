# Dashboard del mercado inmobiliario de Lima

Tablero web (HTML + JS, sin build step) sobre los datos que scrapea este repo.
Mapa con coropleta por distrito, filtros cruzados, siete gráficos y tabla de unidades.

## Regenerar los datos

```bash
python dashboard/build_data.py
```

Fuentes que combina:

| Fuente | Qué aporta |
|---|---|
| Google Sheet `projects_data_updated` | proyectos con `latitude` / `longitude` |
| Google Sheet `ubigeos` | nombres de distrito y polígonos (`geo_shape`) |
| `data/departments_info_new_*.csv` | unidades (modelo, área, precio, dormitorios, entrega) |

Las credenciales salen de `tools.json` en la raíz del repo o de la variable de entorno
`GOOGLE_SERVICE_ACCOUNT_JSON`. **Si no hay ninguna de las dos**, el script usa el
snapshot commiteado en `dashboard/snapshot/` y funciona igual (con las coordenadas de
la última ejecución con credenciales).

Salida — commiteada, porque es lo que sirve GitHub Pages:

- `dashboard/data/dashboard.json` — proyectos y unidades ya normalizados
- `dashboard/data/districts.geojson` — polígonos con métricas por distrito

Variables opcionales:

- `USD_PEN` — tipo de cambio para pasar a soles las unidades en dólares (por defecto `3.75`).

## Verlo en local

```bash
python -m http.server 8765 --directory dashboard
```

Y abrir <http://localhost:8765>. Hace falta un servidor HTTP: abrir el `index.html`
directamente con `file://` no deja que el navegador haga `fetch` de los JSON.

## Publicación

El workflow `.github/workflows/scraper.yml` regenera los datos cada domingo y publica
`dashboard/` en GitHub Pages. Para que funcione hay que hacer dos cosas una sola vez:

1. Crear el secret `GOOGLE_SERVICE_ACCOUNT_JSON` con el contenido de `tools.json`
   (Settings → Secrets and variables → Actions). Sin él el sitio se publica igual,
   pero las coordenadas dejan de refrescarse.
2. Activar Pages: Settings → Pages → Source: **GitHub Actions**.

## Notas de diseño

- Precios normalizados a soles; el tooltip conserva la moneda original.
- Las unidades con precio 0 en la fuente cuentan como stock pero no entran en las
  medianas de S/ /m².
- Con filtros de unidad activos (dormitorios, tipo, entrega, precio, área) solo se
  muestran proyectos con al menos un modelo que los cumpla; sin ellos aparecen también
  los ~109 proyectos que todavía no tienen detalle de unidades scrapeado.
- Paletas verificadas para daltonismo y contraste sobre la superficie oscura `#14171d`:
  categórica de 3 etapas, rampa ordinal de dormitorios y rampa secuencial de la coropleta.
- `window.dashboard` expone `map`, `charts`, `filtros` y `render()` para depurar desde
  la consola del navegador.
