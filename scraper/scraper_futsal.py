#!/usr/bin/env python3
"""
Fetcher de datos Futsal - Liga de Honor B Zona 1
Consume la API pública de Weball (api.weball.me) y genera data/futsal-data.json
"""

import json
import os
import sys
from datetime import datetime
import concurrent.futures
import socket
import urllib3.util.connection as connection

# Force IPv4 to avoid Network is unreachable errors in environments without IPv6 routing (like GitHub Actions)
connection.allowed_gai_family = lambda: socket.AF_INET

import requests

from weball_fases import elegir_fase, resumen_fases

# ── Configuración ──────────────────────────────────────────
API_BASE = "https://api.weball.me/public-v2"
INSTANCE_UUID = "2d260df1-7986-49fd-95a2-fcb046e7a4fb"
TOURNAMENT_ID = 549        # Liga de Honor B - Zona 1
DISCIPLINE_ID = 2          # MASCULINO
EQUIPO_FOCO = "VILLA SAHORES"
TIMEOUT = 15

# Salida
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_FILE = os.path.join(BASE_DIR, "data", "futsal-data.json")


# ── Helpers ────────────────────────────────────────────────
def api_get(path, params=None):
    """GET al endpoint público de Weball."""
    import time
    url = f"{API_BASE}{path}"
    for attempt in range(4):
        try:
            resp = requests.get(url, params=params, timeout=TIMEOUT)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            print(f"⚠️ Attempt {attempt + 1} failed for {path}: {e}")
            if attempt < 3:
                time.sleep(2 * (attempt + 1))
            else:
                raise e


# ── 1. Obtener fases ──────────────────────────────────────
def obtener_fases():
    """Devuelve lista de fases (ej: [{id: 930, name: 'APERTURA', ...}])."""
    data = api_get(f"/tournament/{TOURNAMENT_ID}/phase",
                   params={"disciplineId": DISCIPLINE_ID})
    if not data:
        print("⚠️  No se encontraron fases")
        return []
    print(f"✅ {len(data)} fase(s): {', '.join(f['name'] for f in data)}")
    return data


# ── 2. Obtener tabla de posiciones ────────────────────────
def obtener_clasificacion(phase_id, group_id):
    """Devuelve clasificación por categoría."""
    data = api_get(
        f"/tournament/{TOURNAMENT_ID}/phase/{phase_id}/group/{group_id}/clasification",
        params={"instanceUUID": INSTANCE_UUID}
    )
    if not data:
        return []
    return data


def procesar_tablas(clasificacion_raw):
    """
    Convierte la clasificación cruda en un dict categoria -> lista de posiciones.
    También devuelve la lista de categorías y equipos.
    """
    tablas = {}
    categorias = []
    equipos_set = {}

    for cat_data in clasificacion_raw:
        cat_nombre = cat_data.get("value", "DESCONOCIDA")
        categorias.append(cat_nombre)

        tabla = []
        for pos in cat_data.get("positions", []):
            # FIX: en el Clausura la API devuelve filas con "club": null (plazas
            # todavía sin definir). `.get("club", {})` NO cubre ese caso: solo
            # aplica el default si falta la clave, no si el valor es null.
            # Eso reventaba con AttributeError y tiraba abajo todo el scraper.
            club_insc = (pos.get("club") or {}).get("clubInscription") or {}
            nombre = club_insc.get("tableName") or club_insc.get("name") or ""
            if not nombre:
                continue  # plaza sin equipo asignado: no va a la tabla
            logo = club_insc.get("logo") or ""

            if nombre not in equipos_set:
                equipos_set[nombre] = logo

            # FIX: los contadores también pueden venir null antes del primer
            # partido; `or 0` evita que la suma de la tabla general explote.
            tabla.append({
                "posicion": len(tabla) + 1,
                "equipo": nombre,
                "pj": pos.get("pj") or 0,
                "g": pos.get("pg") or 0,
                "e": pos.get("pe") or 0,
                "p": pos.get("pp") or 0,
                "gf": pos.get("gf") or 0,
                "gc": pos.get("gc") or 0,
                "pts": pos.get("pts") or 0,
            })

        tablas[cat_nombre] = tabla

    # Tabla general: sumar stats de todas las categorías por equipo
    general = {}
    for cat_nombre, tabla in tablas.items():
        for row in tabla:
            eq = row["equipo"]
            if eq not in general:
                general[eq] = {"equipo": eq, "pj": 0, "g": 0, "e": 0,
                               "p": 0, "gf": 0, "gc": 0, "pts": 0}
            for k in ["pj", "g", "e", "p", "gf", "gc", "pts"]:
                general[eq][k] += row[k]

    # Ordenar general por pts desc, dif desc, gf desc
    general_list = sorted(
        general.values(),
        key=lambda x: (x["pts"], x["gf"] - x["gc"], x["gf"]),
        reverse=True
    )
    for i, row in enumerate(general_list, 1):
        row["posicion"] = i
    tablas["general"] = general_list

    equipos = [{"nombre": n, "logo": l} for n, l in equipos_set.items()]

    return tablas, categorias, equipos


# ── 3. Obtener fixture ───────────────────────────────────
def obtener_fixture(phase_id):
    """Devuelve visualizer con todas las fechas y partidos."""
    data = api_get(
        f"/tournament/{TOURNAMENT_ID}/phase/{phase_id}/visualizer",
        params={"instanceUUID": INSTANCE_UUID}
    )
    if not data:
        return []
    return data


def _fetch_match_details(phase_id, node_id, cat_id):
    """Detalle de partidos (trae la sede). Con reintentos: la API responde 503
    cuando se le pegan muchos pedidos concurrentes, y antes ese fallo se
    tragaba en silencio y la sede quedaba vacia."""
    import random, time as _t
    url = f"/tournament/{TOURNAMENT_ID}/phase/{phase_id}/category/{cat_id}/visualizer/{node_id}/match"
    for intento in range(4):
        try:
            res = api_get(url, params={"instanceUUID": INSTANCE_UUID})
            if isinstance(res, list):
                return res
        except Exception:
            pass
        if intento < 3:
            _t.sleep((2 ** intento) + random.uniform(0, 0.8))
    print(f"   ⚠️  sin detalle para nodo {node_id}/cat {cat_id} tras 4 intentos")
    return []

def procesar_fixture(visualizer_data, categorias, phase_id):
    """Convierte los datos del fixture en la lista estructurada de fechas."""
    fechas = []
    
    # 1. Recopilar todas las combinaciones (node_id, cat_id) necesarias
    tareas = set()
    for child in visualizer_data.get("children", []):
        if child.get("type") != "container":
            continue
        node_id = child.get("id")
        for mp in child.get("matchesPlanning", []):
            for tm in mp.get("tournamentMatches", []):
                cat_id = (tm.get("category") or {}).get("id")
                if node_id and cat_id:
                    tareas.add((node_id, cat_id))
    
    # 2. Fetch concurrente de sedes
    match_venues = {} # match_id -> venue
    print(f"   ⏳ Fetcheando sedes de {len(tareas)} combinaciones de categoría/fecha...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        futuros = [
            executor.submit(_fetch_match_details, phase_id, n_id, c_id)
            for n_id, c_id in tareas
        ]
        for fut in concurrent.futures.as_completed(futuros):
            for match in fut.result():
                m_id = (match.get("matchInfo") or {}).get("id")
                venue = match.get("venue")
                if m_id and venue:
                    match_venues[m_id] = venue

    print(f"   ✅ Se encontraron sedes para {len(match_venues)} partidos.")

    for child in visualizer_data.get("children", []):
        fecha_label = child.get("value", "")
        # Extraer número de fecha
        num = 0
        try:
            num = int(''.join(c for c in fecha_label if c.isdigit()))
        except ValueError:
            pass

        encuentros = []
        for mp in child.get("matchesPlanning", []):
            home_insc = (mp.get("clubHome") or {}).get("clubInscription", {}) or {}
            away_insc = (mp.get("clubAway") or {}).get("clubInscription", {}) or {}
            local = home_insc.get("tableName") or home_insc.get("name", "?")
            visitante = away_insc.get("tableName") or away_insc.get("name", "?")

            # Agrupar partidos por categoría
            partidos = {}
            for tm in mp.get("tournamentMatches", []):
                # Obtener categoría
                cat_inst = (tm.get("category", {})
                              .get("categoryInstance", {}))
                cat_nombre = cat_inst.get("name", "DESCONOCIDA")

                score_h = tm.get("scoreHome")
                score_a = tm.get("scoreAway")
                status = tm.get("matchStatus", {}) or {}
                status_label = status.get("label", "")
                finalized = status.get("finalized", False)
                
                # Extraer info de matchInfo
                m_info = tm.get("matchInfo", {}) or {}
                dt = m_info.get("dateTime") or m_info.get("dateTimeUTC")
                photos = m_info.get("spreadsheetPhotos", [])
                match_id = m_info.get("id")
                
                # Obtener venue pre-fetcheado, o fallback al de tm
                venue = match_venues.get(match_id) or tm.get("venue", {}) or {}

                jugado = (score_h is not None and score_a is not None)

                partidos[cat_nombre] = {
                    "match_id": match_id,
                    "goles_local": score_h,
                    "goles_visitante": score_a,
                    "jugado": jugado,
                    "estado": status_label,
                    "fecha_hora": dt,
                    "sede": venue.get("name"),
                    "direccion": venue.get("address"),
                    "planillas": photos,
                }

            # Determinar si al menos un partido se jugó
            algun_jugado = any(p["jugado"] for p in partidos.values())

            encuentros.append({
                "local": local,
                "visitante": visitante,
                "partidos": partidos,
                "estado": "Finalizado" if algun_jugado else "Pendiente",
            })

        # Extraer fecha del primer partido que tenga fecha
        fecha_str = None
        for enc in encuentros:
            for p in enc["partidos"].values():
                if p.get("fecha_hora"):
                    fecha_str = p["fecha_hora"][:10]  # YYYY-MM-DD
                    break
            if fecha_str:
                break

        fechas.append({
            "numero": num,
            "fecha_partido": fecha_str,
            "encuentros": encuentros,
        })

    return fechas


# ── 4. Obtener grupos de clasificación ────────────────────
def obtener_groups(phase_id):
    """Devuelve los grupos de clasificación disponibles."""
    data = api_get(
        f"/tournament/{TOURNAMENT_ID}/phase/{phase_id}/clasification-groups",
        params={"instanceUUID": INSTANCE_UUID}
    )
    if not data:
        return []
    return data


# ── Main ──────────────────────────────────────────────────
def main():
    print("🏟️  Fetcher Futsal - Liga de Honor B Zona 1")
    print("=" * 50)

    # 1. Obtener fases
    fases = obtener_fases()
    if not fases:
        print("❌ No hay fases disponibles")
        sys.exit(1)

    # FIX: antes era `fases[0]`, o sea SIEMPRE la primera fase. Cuando el torneo
    # pasó de Apertura a Clausura, el scraper quedó clavado en la Apertura
    # terminada y no volvió a traer datos nuevos nunca más.
    for _f in fases:
        print(f"   · fase disponible: {_f.get('id')} — {_f.get('name')}")
    fase, _motivo = elegir_fase(fases, env_var="FUTSAL_PHASE_ID", etiqueta="Liga de Honor B")
    phase_id = fase["id"]
    fase_nombre = fase["name"]
    print(f"📋 Usando fase: {fase_nombre} (ID: {phase_id}) — {_motivo}")

    # 2. Obtener grupos
    # FIX: una fase recién arrancada todavía no tiene tabla de posiciones
    # armada. Antes eso era `sys.exit(1)` y se perdía TAMBIÉN el fixture, que
    # sí estaba disponible. Ahora seguimos con las tablas vacías.
    groups = obtener_groups(phase_id)
    tablas, categorias, equipos = {}, [], []
    if not groups:
        print("⚠️  La fase todavía no tiene tabla de posiciones; sigo solo con el fixture")
    else:
        group = groups[0]
        group_id = group["id"]
        print(f"📊 Grupo: {group.get('value', '?')} (ID: {group_id})")

        print("📊 Obteniendo tablas de posiciones...")
        clasificacion = obtener_clasificacion(phase_id, group_id)
        tablas, categorias, equipos = procesar_tablas(clasificacion)
        print(f"✅ {len(categorias)} categorías, {len(equipos)} equipos")

    # 4. Fixture
    print("📅 Obteniendo fixture...")
    visualizer = obtener_fixture(phase_id)
    fechas = procesar_fixture(visualizer, categorias, phase_id)
    print(f"✅ {len(fechas)} fechas procesadas")

    # 5. Armar JSON de salida
    output = {
        "actualizado": datetime.utcnow().isoformat() + "Z",
        "torneo": "Liga de Honor B",
        "zona": "Zona 1",
        "fase": fase_nombre.capitalize(),
        "fase_id": phase_id,
        "fase_seleccion": _motivo,
        "fases_disponibles": resumen_fases(fases),
        "anio": datetime.utcnow().year,
        "equipo_foco": EQUIPO_FOCO,
        "categorias": categorias,
        "equipos": equipos,
        "tablas_posiciones": tablas,
        "fechas": fechas,
    }

    # Guardar
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Datos guardados en {OUTPUT_FILE}")
    print(f"   📊 Categorías: {len(categorias)}")
    print(f"   👥 Equipos: {len(equipos)}")
    print(f"   📅 Fechas: {len(fechas)}")

    # Verificar equipo foco
    if EQUIPO_FOCO in [e["nombre"] for e in equipos]:
        gral = tablas.get("general", [])
        foco_pos = next((t for t in gral if t["equipo"] == EQUIPO_FOCO), None)
        if foco_pos:
            print(f"   ⭐ {EQUIPO_FOCO}: {foco_pos['posicion']}° con {foco_pos['pts']} pts")
    else:
        print(f"   ⚠️  {EQUIPO_FOCO} no encontrado en los equipos")


if __name__ == "__main__":
    main()
