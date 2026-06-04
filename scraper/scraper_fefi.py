"""
Scraper FEFI Baby Fútbol - Zona J
Descarga la página de FEFI y genera data/fefi-data.json

Uso:
    pip install -r requirements.txt
    python scraper_fefi.py

Salida: ../data/fefi-data.json (estructura completa del torneo)
"""
from typing import Optional
import json
import re
from datetime import datetime, timezone
from pathlib import Path
import socket
import urllib3.util.connection as connection

# Force IPv4 to avoid Network is unreachable errors in environments without IPv6 routing (like GitHub Actions)
connection.allowed_gai_family = lambda: socket.AF_INET

import requests
from bs4 import BeautifulSoup

URL = "https://fefi.com.ar/2026-torneo-anual-baby-futbol/j/"
ZONA = "J"
TORNEO_ACTUAL = "apertura"  # cambiar a 'clausura' cuando arranque la 2da rueda
ANIO_TORNEO = 2026

# Orden de columnas en la web de FEFI (por año de nacimiento)
CATEGORIAS = [2019, 2013, 2018, 2014, 2017, 2016, 2015]

MESES_ES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
}

EQUIPO_FOCO = "CLUB SAHORES"


def parsear_fecha_es(texto: str) -> Optional[str]:
    """'Fecha 1 - 18 de Abril' -> '2026-04-18'"""
    m = re.search(r"(\d{1,2})\s*de\s*(\w+)", texto, re.IGNORECASE)
    if not m:
        return None
    dia = int(m.group(1))
    mes = MESES_ES.get(m.group(2).lower())
    if not mes:
        return None
    return f"{ANIO_TORNEO}-{mes:02d}-{dia:02d}"


def parsear_gol(celda: str):
    """'5' -> (5, None); 'GP' -> (None, 'GP'); '' -> (None, None)"""
    s = celda.strip()
    if s in ("GP", "NP"):
        return None, s
    if s.isdigit():
        return int(s), None
    return None, None


def parsear_int(celda: str) -> Optional[int]:
    s = celda.strip()
    return int(s) if s.isdigit() else None


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
}


def scrape():
    print(f"Descargando {URL}...")
    try:
        html = requests.get(URL, timeout=30, headers=HEADERS).text
    except Exception as e:
        print(f"⚠️ Error en descarga directa: {e}. Intentando vía proxy de fallback...")
        import urllib.parse
        proxy_url = f"https://api.allorigins.win/get?url={urllib.parse.quote(URL)}"
        resp = requests.get(proxy_url, timeout=30)
        resp.raise_for_status()
        html = resp.json()["contents"]

    soup = BeautifulSoup(html, "html.parser")
    tablas = soup.find_all("table")

    # Identificar tablas por su contenido
    fixture_tabla = next(t for t in tablas if "Fecha 1" in t.get_text())
    direcciones_tabla = next(t for t in tablas if "Dirección" in t.get_text())
    resultados_tabla = next(t for t in tablas if "F.T." in t.get_text())
    posiciones_tabla = next(
        t for t in tablas if "Pts." in t.get_text() and "F.T." not in t.get_text()
    )

    # ========== EQUIPOS (con direcciones) ==========
    equipos = {}
    for row in direcciones_tabla.find_all("tr")[1:]:
        cols = [c.get_text(strip=True) for c in row.find_all("td")]
        if len(cols) >= 4:
            nombre = cols[0].upper()
            equipos[nombre] = {
                "nombre": nombre,
                "direccion": cols[1],
                "localidad": cols[2],
                "tiene_cancha": cols[3].upper() == "SI",
            }

    # ========== FIXTURE (cruces por fecha) ==========
    fechas = []
    fecha_actual = None
    for row in fixture_tabla.find_all("tr"):
        celdas = row.find_all("td")
        texto = row.get_text(" ", strip=True)
        m = re.match(r"Fecha\s+(\d+)\s*-\s*(.+)", texto)
        if m:
            fecha_actual = {
                "numero": int(m.group(1)),
                "fecha_partido": parsear_fecha_es(m.group(2)),
                "encuentros": [],
            }
            fechas.append(fecha_actual)
            continue
        if (
            fecha_actual
            and len(celdas) == 3
            and celdas[1].get_text(strip=True).lower() == "vs"
        ):
            local = celdas[0].get_text(strip=True).upper()
            visit = celdas[2].get_text(strip=True).upper()
            fecha_actual["encuentros"].append(
                {"local": local, "visitante": visit, "partidos": {}}
            )
            for nombre in (local, visit):
                equipos.setdefault(nombre, {
                    "nombre": nombre, "direccion": None,
                    "localidad": None, "tiene_cancha": False,
                })

    # ========== RESULTADOS POR CATEGORÍA ==========
    rows = resultados_tabla.find_all("tr")[1:]
    i = 0
    while i < len(rows) - 1:
        cl = [c.get_text(strip=True) for c in rows[i].find_all("td")]
        cv = [c.get_text(strip=True) for c in rows[i + 1].find_all("td")]
        if len(cl) >= 11 and cl[0].startswith("F") and cl[0][1:].isdigit():
            num_fecha = int(cl[0][1:])
            local = cl[1].upper()
            
            offset_v = 0 if len(cv) < 11 else 1
            visitante = cv[offset_v].upper()
            
            estado_raw = cl[10].lower() if len(cl) > 10 else ""
            estado = estado_raw if estado_raw in ("verificado", "previo") else None

            # Buscar el encuentro en el fixture
            fecha = next((f for f in fechas if f["numero"] == num_fecha), None)
            if fecha:
                enc = next(
                    (e for e in fecha["encuentros"]
                     if e["local"] == local and e["visitante"] == visitante),
                    None,
                )
                if enc:
                    enc["estado"] = estado
                    for idx, cat in enumerate(CATEGORIAS):
                        gl, obs_l = parsear_gol(cl[2 + idx])
                        gv, obs_v = parsear_gol(cv[1 + offset_v + idx])
                        enc["partidos"][str(cat)] = {
                            "goles_local": gl,
                            "goles_visitante": gv,
                            "observacion_local": obs_l,
                            "observacion_visitante": obs_v,
                            "observacion": obs_l or obs_v,
                            "jugado": (gl is not None or obs_l is not None) and (gv is not None or obs_v is not None),
                        }
            i += 2
        else:
            i += 1

    # ========== TABLAS DE POSICIONES ==========
    tablas_pos = {}
    categoria_actual = None
    for row in posiciones_tabla.find_all("tr")[1:]:
        cols = [c.get_text(strip=True) for c in row.find_all("td")]
        if not cols:
            continue
        
        primera = cols[0].upper()
        # Si la fila tiene 1 sola columna o las demás están vacías, es un encabezado de categoría
        if (len(cols) == 1 or (len(cols) > 1 and cols[1] == "")) and (
            primera == "GENERAL" or primera in (str(c) for c in CATEGORIAS)
        ):
            categoria_actual = primera.lower()
            tablas_pos[categoria_actual] = []
            continue
            
        if len(cols) < 6:
            continue
            
        if categoria_actual and cols[0]:
            tablas_pos[categoria_actual].append({
                "equipo": cols[0].upper(),
                "pj": parsear_int(cols[1]),
                "g": parsear_int(cols[2]),
                "e": parsear_int(cols[3]),
                "p": parsear_int(cols[4]),
                "pts": parsear_int(cols[5]),
            })

    # Asignar posición ordinal en cada tabla (tal como vienen, ya están ordenadas)
    for cat, lista in tablas_pos.items():
        for idx, eq in enumerate(lista, 1):
            eq["posicion"] = idx

    # ========== ARMAR JSON FINAL ==========
    data = {
        "actualizado": datetime.now(timezone.utc).isoformat(),
        "zona": ZONA,
        "torneo": TORNEO_ACTUAL,
        "anio": ANIO_TORNEO,
        "equipo_foco": EQUIPO_FOCO,
        "categorias": CATEGORIAS,
        "equipos": list(equipos.values()),
        "fechas": fechas,
        "tablas_posiciones": tablas_pos,
    }

    salida = Path(__file__).parent.parent / "data" / "fefi-data.json"
    salida.parent.mkdir(exist_ok=True)
    with salida.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    total_jugados = sum(
        1 for f in fechas for e in f["encuentros"]
        for p in e["partidos"].values() if p.get("jugado")
    )
    print(f"OK — {len(equipos)} equipos, {len(fechas)} fechas, "
          f"{total_jugados} partidos jugados")
    print(f"Escrito en: {salida}")


if __name__ == "__main__":
    scrape()
