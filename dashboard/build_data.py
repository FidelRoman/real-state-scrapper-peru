"""
ETL del dashboard inmobiliario.

Une tres fuentes:
  1. Google Sheet "Nexo Inmobiliario Data", tab `projects_data_updated`
     -> proyectos con latitude/longitude (no existen en el repo).
  2. Google Sheet, tab `ubigeos` -> nombres de distrito y polígonos (geo_shape).
  3. data/departments_info_new_*.csv -> unidades scrapeadas por run_project_info_batch.py.

Si hay credenciales (tools.json o GOOGLE_SERVICE_ACCOUNT_JSON) lee del Sheet y refresca
el snapshot commiteado; si no las hay, trabaja con el snapshot. Así el build de CI no se
rompe cuando falta el secret.

Salida:
  dashboard/data/dashboard.json    -> meta + proyectos + unidades
  dashboard/data/districts.geojson -> polígonos de distritos con métricas agregadas
  dashboard/snapshot/projects_geo.csv, districts_raw.csv -> fallback sin credenciales
"""

import glob
import json
import os
import re
import statistics
import sys
from datetime import datetime

import pandas as pd

SHEET_ID = "17as6JwYUiOcluCzaDG_gpuY4ic7emL6k-TYITGJFx5g"
SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DASH = os.path.join(ROOT, "dashboard")
OUT_DIR = os.path.join(DASH, "data")
SNAP_DIR = os.path.join(DASH, "snapshot")
CREDENTIALS_FILE = os.path.join(ROOT, "tools.json")
PROJECTS_SNAPSHOT = os.path.join(SNAP_DIR, "projects_geo.csv")
DISTRICTS_SNAPSHOT = os.path.join(SNAP_DIR, "districts_raw.csv")

# Tipo de cambio para normalizar las unidades en dólares a soles.
USD_PEN = float(os.environ.get("USD_PEN", "3.75"))

MONEDA_USD = "Dólares"


# --------------------------------------------------------------------------- #
# Lectura de fuentes
# --------------------------------------------------------------------------- #
def _sheet_client():
    """Devuelve un cliente gspread, o None si no hay credenciales disponibles."""
    try:
        import gspread
        from google.oauth2.service_account import Credentials
    except ImportError:
        print("  gspread/google-auth no instalados; se usará el snapshot.")
        return None

    raw = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    if raw:
        creds = Credentials.from_service_account_info(json.loads(raw), scopes=SCOPES)
    elif os.path.exists(CREDENTIALS_FILE):
        creds = Credentials.from_service_account_file(CREDENTIALS_FILE, scopes=SCOPES)
    else:
        print("  Sin credenciales (tools.json / GOOGLE_SERVICE_ACCOUNT_JSON); se usará el snapshot.")
        return None

    return gspread.authorize(creds)


def _tab_to_df(sheet, name):
    values = sheet.worksheet(name).get_all_values()
    df = pd.DataFrame(values[1:], columns=values[0])
    return df.replace("", pd.NA).dropna(how="all")


def load_sources():
    """Lee proyectos y distritos del Sheet; si falla, cae al snapshot commiteado."""
    client = _sheet_client()
    if client is not None:
        try:
            sheet = client.open_by_key(SHEET_ID)
            projects = _tab_to_df(sheet, "projects_data_updated")
            districts = _tab_to_df(sheet, "ubigeos")
            os.makedirs(SNAP_DIR, exist_ok=True)
            projects.to_csv(PROJECTS_SNAPSHOT, index=False, encoding="utf-8")
            # Solo guardamos los distritos que aparecen en los proyectos: el tab
            # completo son 1.875 filas con polígonos de todo el Perú.
            usados = set(projects["ubigeo_id"].dropna())
            cols = ["ubigeo", "nombdep", "nombprov", "nombdist", "geo_shape"]
            districts[districts["ubigeo"].isin(usados)][cols].to_csv(
                DISTRICTS_SNAPSHOT, index=False, encoding="utf-8"
            )
            print(f"  Sheet leído: {len(projects)} proyectos, snapshot actualizado.")
            return projects, districts
        except Exception as exc:  # noqa: BLE001 - queremos degradar, no fallar
            print(f"  Error leyendo el Sheet ({exc}); se usará el snapshot.")

    if not os.path.exists(PROJECTS_SNAPSHOT):
        sys.exit(
            "No hay credenciales ni snapshot en dashboard/snapshot/. "
            "Coloca tools.json en la raíz del repo y vuelve a ejecutar."
        )
    projects = pd.read_csv(PROJECTS_SNAPSHOT, dtype=str)
    districts = pd.read_csv(DISTRICTS_SNAPSHOT, dtype=str)
    print(f"  Snapshot leído: {len(projects)} proyectos.")
    return projects, districts


def load_units():
    files = sorted(glob.glob(os.path.join(ROOT, "data", "departments_info_new_*.csv")))
    if not files:
        sys.exit("No se encontraron data/departments_info_new_*.csv")
    df = pd.concat([pd.read_csv(f) for f in files], ignore_index=True)
    print(f"  {len(df)} unidades leídas de {len(files)} archivos.")
    return df


# --------------------------------------------------------------------------- #
# Normalización
# --------------------------------------------------------------------------- #
def _num(value):
    """'430,880' -> 430880.0 ; '67.40 m²' -> 67.4 ; vacío -> None."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    match = re.search(r"-?[\d.]+", str(value).replace(",", ""))
    if not match:
        return None
    try:
        return float(match.group())
    except ValueError:
        return None


def _int(value):
    n = _num(value)
    return int(n) if n is not None else None


def parse_entrega(raw):
    """'Entrega inmediata' o 'dd/mm/yyyy' -> (fecha ISO | None, trimestre, inmediata)."""
    texto = str(raw or "").strip()
    if not texto or texto.lower().startswith("entrega inmediata"):
        return None, "Inmediata", True
    try:
        fecha = datetime.strptime(texto, "%d/%m/%Y")
    except ValueError:
        return None, "Sin fecha", False
    return fecha.strftime("%Y-%m-%d"), f"{fecha.year}-T{(fecha.month - 1) // 3 + 1}", False


def normalize_units(raw):
    """Convierte el CSV crudo de unidades en registros limpios y comparables."""
    unidades = []
    for row in raw.to_dict("records"):
        precio = _num(row.get("precio"))
        divisa = str(row.get("divisa") or "Soles").strip()
        area = _num(row.get("area"))
        precio_pen = precio * USD_PEN if (precio and divisa == MONEDA_USD) else precio
        # Hay precios en 0 en la fuente: no sirven para precio/m², pero la unidad existe.
        precio_m2 = round(precio_pen / area, 2) if (precio_pen and area) else None
        fecha_iso, trimestre, inmediata = parse_entrega(row.get("fecha"))

        unidades.append(
            {
                "link": row.get("proyecto_link"),
                "tipo": str(row.get("tipo") or "").strip() or "Sin tipo",
                "modelo": str(row.get("modelo") or "").replace("Modelo ", "").strip(),
                "piso": str(row.get("piso") or "").strip(),
                "dorm": _int(row.get("dormitorios_cont")),
                "area": area,
                "precio": round(precio, 2) if precio is not None else None,
                "divisa": divisa,
                "precio_pen": round(precio_pen, 2) if precio_pen is not None else None,
                "precio_m2": precio_m2,
                "unidades": _int(row.get("disponible")) or 0,
                "entrega": fecha_iso,
                "trimestre": trimestre,
                "inmediata": inmediata,
            }
        )
    return unidades


def _mediana(values):
    limpio = [v for v in values if v]
    return round(statistics.median(limpio), 2) if limpio else None


def build_projects(raw, unidades, distritos_por_ubigeo):
    """Proyectos con lat/lon + agregados de sus unidades."""
    por_link = {}
    for u in unidades:
        por_link.setdefault(u["link"], []).append(u)

    proyectos = []
    for row in raw.to_dict("records"):
        link = row.get("proyecto_link")
        lat, lon = _num(row.get("latitude")), _num(row.get("longitude"))
        if lat is None or lon is None:
            continue

        mias = por_link.get(link, [])
        precios = [u["precio_pen"] for u in mias if u["precio_pen"]]
        areas = [u["area"] for u in mias if u["area"]]
        mix = {}
        for u in mias:
            if u["dorm"]:
                mix[u["dorm"]] = mix.get(u["dorm"], 0) + u["unidades"]
        entregas = sorted(u["entrega"] for u in mias if u["entrega"])
        ubigeo = str(row.get("ubigeo_id") or "").strip()
        info_distrito = distritos_por_ubigeo.get(ubigeo, {})

        proyectos.append(
            {
                "link": link,
                "nombre": str(row.get("proyecto_nombre") or "").strip(),
                "inmobiliaria": str(row.get("inmobiliaria_nombre") or "").strip(),
                "logo": row.get("inmobiliaria_imagen"),
                "imagen": row.get("proyecto_imagen"),
                "etapa": str(row.get("proyecto_etapa") or "").strip() or "Sin etapa",
                "direccion": str(row.get("proyecto_direccion") or "").strip(),
                "distrito": info_distrito.get("nombre")
                or str(row.get("proyecto_distrito") or "").strip(),
                "provincia": info_distrito.get("provincia", ""),
                "departamento": info_distrito.get("departamento", ""),
                "ubigeo": ubigeo,
                "lat": lat,
                "lon": lon,
                "precio_desde": _num(row.get("proyecto_precio")),
                "n_modelos": len(mias),
                "unidades": sum(u["unidades"] for u in mias),
                "precio_min": round(min(precios), 2) if precios else None,
                "precio_max": round(max(precios), 2) if precios else None,
                "precio_m2": _mediana([u["precio_m2"] for u in mias]),
                "area_min": round(min(areas), 2) if areas else None,
                "area_max": round(max(areas), 2) if areas else None,
                "mix_dorm": {str(k): v for k, v in sorted(mix.items())},
                "entrega": entregas[0] if entregas else None,
                "inmediata": any(u["inmediata"] for u in mias),
                "tipos": sorted({u["tipo"] for u in mias}),
            }
        )
    return proyectos


# --------------------------------------------------------------------------- #
# Geometría
# --------------------------------------------------------------------------- #
def wkt_to_geometry(wkt):
    """Convierte POLYGON((lon lat, ...)) / MULTIPOLYGON a geometría GeoJSON.

    El tab `ubigeos` guarda polígonos ya simplificados (rmapshaperid), en un
    formato uniforme, así que un parser propio evita depender de shapely.
    """
    texto = str(wkt or "").strip()
    if not texto:
        return None
    tipo = "MultiPolygon" if texto.upper().startswith("MULTIPOLYGON") else "Polygon"

    def anillo(bloque):
        puntos = []
        for par in bloque.split(","):
            partes = par.strip().split()
            if len(partes) >= 2:
                try:
                    puntos.append([float(partes[0]), float(partes[1])])
                except ValueError:
                    continue
        return puntos

    if tipo == "Polygon":
        bloques = re.findall(r"\(([^()]+)\)", texto)
        coords = [anillo(b) for b in bloques]
        coords = [c for c in coords if len(c) >= 4]
        return {"type": "Polygon", "coordinates": coords} if coords else None

    poligonos = []
    for grupo in re.findall(r"\(\(([^()]*(?:\([^()]*\)[^()]*)*)\)\)", texto):
        anillos = [anillo(b) for b in re.findall(r"\(?([^()]+)\)?", grupo)]
        anillos = [a for a in anillos if len(a) >= 4]
        if anillos:
            poligonos.append(anillos)
    return {"type": "MultiPolygon", "coordinates": poligonos} if poligonos else None


def build_geojson(districts_raw, proyectos):
    """GeoJSON de distritos con las dos métricas de la coropleta."""
    por_ubigeo = {}
    for p in proyectos:
        por_ubigeo.setdefault(p["ubigeo"], []).append(p)

    features = []
    for row in districts_raw.to_dict("records"):
        ubigeo = str(row.get("ubigeo") or "").strip()
        if ubigeo not in por_ubigeo:
            continue
        geometry = wkt_to_geometry(row.get("geo_shape"))
        if geometry is None:
            continue
        del_distrito = por_ubigeo[ubigeo]
        features.append(
            {
                "type": "Feature",
                "geometry": geometry,
                "properties": {
                    "ubigeo": ubigeo,
                    "distrito": str(row.get("nombdist") or "").title(),
                    "provincia": str(row.get("nombprov") or "").title(),
                    "proyectos": len(del_distrito),
                    "unidades": sum(p["unidades"] for p in del_distrito),
                    "precio_m2": _mediana([p["precio_m2"] for p in del_distrito]),
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


def district_lookup(districts_raw):
    """ubigeo -> nombres canónicos, para los filtros jerárquicos."""
    lookup = {}
    for row in districts_raw.to_dict("records"):
        ubigeo = str(row.get("ubigeo") or "").strip()
        if not ubigeo:
            continue
        lookup[ubigeo] = {
            "nombre": str(row.get("nombdist") or "").title(),
            "provincia": str(row.get("nombprov") or "").title(),
            "departamento": str(row.get("nombdep") or "").title(),
        }
    return lookup


# --------------------------------------------------------------------------- #
def main():
    print("Leyendo fuentes...")
    projects_raw, districts_raw = load_sources()
    units_raw = load_units()

    print("Normalizando...")
    lookup = district_lookup(districts_raw)
    unidades = normalize_units(units_raw)
    proyectos = build_projects(projects_raw, unidades, lookup)

    # Solo conservamos unidades de proyectos geolocalizados (el dashboard es un mapa).
    links = {p["link"] for p in proyectos}
    unidades = [u for u in unidades if u["link"] in links]

    geojson = build_geojson(districts_raw, proyectos)

    payload = {
        "meta": {
            "generado": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "usd_pen": USD_PEN,
            "n_proyectos": len(proyectos),
            "n_unidades": len(unidades),
            "n_distritos": len(geojson["features"]),
        },
        "proyectos": proyectos,
        "unidades": unidades,
    }

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "dashboard.json"), "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT_DIR, "districts.geojson"), "w", encoding="utf-8") as fh:
        json.dump(geojson, fh, ensure_ascii=False, separators=(",", ":"))

    sin_geo = len(projects_raw) - len(proyectos)
    con_unidades = sum(1 for p in proyectos if p["n_modelos"])
    print(
        f"\nListo:\n"
        f"  proyectos           : {len(proyectos)} ({sin_geo} descartados sin lat/lon)\n"
        f"  con detalle de units: {con_unidades} ({con_unidades / len(proyectos):.1%})\n"
        f"  unidades (modelos)  : {len(unidades)}\n"
        f"  unidades disponibles: {sum(u['unidades'] for u in unidades):,}\n"
        f"  distritos con polígono: {len(geojson['features'])}\n"
        f"  tipo de cambio USD  : {USD_PEN}"
    )


if __name__ == "__main__":
    main()
