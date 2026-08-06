#!/usr/bin/env python3
"""
Fetcher de datos Futsal Reducido (Clausura 2026)
Consume la API publica de Weball para Torneo 555 / Fase 1361
Genera data/futsal-reducido-data.json y web/data/futsal-reducido-data.json
"""

import json
import os
import requests

from weball_tabla import obtener_tablas
from weball_sedes import obtener_sedes
import shutil
from datetime import datetime

INSTANCE_UUID = "2d260df1-7986-49fd-95a2-fcb046e7a4fb"
TOURNAMENT_ID = 555
PHASE_ID = 1361
EQUIPO_FOCO = "VILLA SAHORES"

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DATA = os.path.join(BASE_DIR, "data", "futsal-reducido-data.json")
OUTPUT_WEB_DATA = os.path.join(BASE_DIR, "web", "data", "futsal-reducido-data.json")

def fetch_reducido_data():
    print("Downloading Reducido Clausura (Torneo 555, Fase 1361)...")
    url = f"https://api.weball.me/public-v2/tournament/{TOURNAMENT_ID}/phase/{PHASE_ID}/visualizer?instanceUUID={INSTANCE_UUID}"
    
    r = requests.get(url, timeout=15)
    if r.status_code != 200:
        raise Exception(f"HTTP Error {r.status_code} fetching Reducido data")
        
    viz = r.json()

    # FIX: el visualizer trae venue=null en cada partido. La sede hay que
    # pedirla aparte por (fecha, categoria); este scraper nunca lo hacia.
    SEDES = obtener_sedes(viz, TOURNAMENT_ID, PHASE_ID)
    
    fechas = []
    equipos_dict = {}
    
    for child in viz.get("children", []):
        fecha_label = child.get("value", "")
        num_fecha = int(fecha_label.replace("Fecha ", "")) if "Fecha " in fecha_label and fecha_label.replace("Fecha ", "").isdigit() else len(fechas) + 1
        
        encuentros = []
        for mp in child.get("matchesPlanning", []):
            ch = mp.get("clubHome") or {}
            ca = mp.get("clubAway") or {}
            ci_h = ch.get("clubInscription") or {}
            ci_a = ca.get("clubInscription") or {}
            
            local = (ci_h.get("tableName") or ci_h.get("name") or "").upper().strip()
            visitante = (ci_a.get("tableName") or ci_a.get("name") or "").upper().strip()
            
            if not local or not visitante:
                continue
                
            for eq in (local, visitante):
                equipos_dict.setdefault(eq, {"nombre": eq})
                
            partidos_cat = {}
            # FIX: la API devuelve los partidos por categoría bajo la clave
            # "tournamentMatches", no "matches". Este scraper buscaba "matches",
            # que nunca existe, así que `partidos` quedaba SIEMPRE vacío: el
            # Reducido tenía 155 encuentros y cero resultados desde el día uno.
            # (Los otros scrapers ya usaban la clave correcta.)
            sub_matches = mp.get("tournamentMatches") or mp.get("matches") or []
            for m in sub_matches:
                cat_obj = (m.get("category") or {}).get("categoryInstance") or {}
                cat_name = (cat_obj.get("name") or "").upper().strip()
                if not cat_name:
                    continue

                sh = m.get("scoreHome")
                sa = m.get("scoreAway")

                # FIX: el estado viene como objeto matchStatus, no como string
                status_obj = m.get("matchStatus") or {}
                status_label = status_obj.get("label") or ""
                finalizado = bool(status_obj.get("finalized"))

                # FIX: id y fecha/hora viven dentro de matchInfo
                m_info = m.get("matchInfo") or {}
                match_id = m_info.get("id")
                dt = m_info.get("dateTime") or m_info.get("dateTimeUTC")
                venue = m.get("venue") or {}

                jugado = (sh is not None and sa is not None) or finalizado

                partidos_cat[cat_name] = {
                    "match_id": match_id,
                    "goles_local": sh,
                    "goles_visitante": sa,
                    "jugado": jugado,
                    "estado": status_label,
                    "fecha_hora": dt,
                    "sede": (SEDES.get(match_id) or venue or {}).get("name"),
                    "direccion": (SEDES.get(match_id) or venue or {}).get("address"),
                }

            algun_jugado = any(p["jugado"] for p in partidos_cat.values())

            encuentros.append({
                "local": local,
                "visitante": visitante,
                "estado": "Finalizado" if algun_jugado else "Pendiente",
                "partidos": partidos_cat
            })

        # FIX: la fecha estaba hardcodeada en None, así que el dashboard no
        # podía ordenar ni saber cuál era el próximo partido. Se toma del
        # primer partido de la fecha que traiga dateTime.
        fecha_str = None
        for enc in encuentros:
            for p in enc["partidos"].values():
                if p.get("fecha_hora"):
                    fecha_str = p["fecha_hora"][:10]
                    break
            if fecha_str:
                break

        fechas.append({
            "numero": num_fecha,
            "fecha_partido": fecha_str,
            "encuentros": encuentros
        })
        
    # FIX: este scraper nunca pedia la tabla de posiciones (solo el fixture),
    # por eso el dashboard no mostraba tabla para este torneo.
    print("Obteniendo tabla de posiciones...")
    tablas_posiciones, cats_api, equipos_api = obtener_tablas(
        TOURNAMENT_ID, PHASE_ID, env_var="REDUCIDO_GROUP_ID")
    for e in equipos_api:
        equipos_dict.setdefault(e["nombre"], {"nombre": e["nombre"]})
        if e.get("logo"):
            equipos_dict[e["nombre"]]["logo"] = e["logo"]

    result = {
        "actualizado": datetime.now().isoformat(),
        "torneo": "Torneo Joma 2026 - Futsal Reducido (Clausura)",
        "torneo_id": "futsal-reducido",
        "equipo_foco": EQUIPO_FOCO,
        "categorias": cats_api or [
            "PRIMERA MASCULINO",
            "TERCERA MASCULINO",
            "CUARTA MASCULINO",
            "QUINTA MASCULINO",
            "SEXTA MASCULINO",
            "SEPTIMA MASCULINO",
            "OCTAVA MASCULINO"
        ],
        "equipos": list(equipos_dict.values()),
        "fechas": fechas,
        "tablas_posiciones": tablas_posiciones
    }
    
    # FIX: no pisar el JSON bueno si la API devolvió algo vacío o cambió de forma
    if not fechas or not equipos_dict:
        raise RuntimeError(
            f"Parseo vacío ({len(fechas)} fechas, {len(equipos_dict)} equipos). "
            "No se sobrescribe futsal-reducido-data.json."
        )

    os.makedirs(os.path.dirname(OUTPUT_DATA), exist_ok=True)
    os.makedirs(os.path.dirname(OUTPUT_WEB_DATA), exist_ok=True)
    
    with open(OUTPUT_DATA, "w") as f:
        json.dump(result, f, indent=2)
        
    shutil.copy(OUTPUT_DATA, OUTPUT_WEB_DATA)
    print(f"✅ OK — {len(fechas)} fechas de Reducido guardadas en {OUTPUT_DATA}")

if __name__ == "__main__":
    fetch_reducido_data()
