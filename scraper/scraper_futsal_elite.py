#!/usr/bin/env python3
"""
Fetcher de datos Futsal Elite A (Clausura 2026)
Consume la API publica de Weball para Torneo 551 / Fase 1359
Genera data/futsal-elite-data.json y web/data/futsal-elite-data.json
"""

import json
import os
import requests

from weball_tabla import obtener_tablas
import shutil
from datetime import datetime

INSTANCE_UUID = "2d260df1-7986-49fd-95a2-fcb046e7a4fb"
TOURNAMENT_ID = 551
PHASE_ID = 1359
EQUIPO_FOCO = "VILLA SAHORES"

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DATA = os.path.join(BASE_DIR, "data", "futsal-elite-data.json")
OUTPUT_WEB_DATA = os.path.join(BASE_DIR, "web", "data", "futsal-elite-data.json")

def fetch_elite_data():
    print("Downloading Elite A Clausura (Torneo 551, Fase 1359)...")
    url = f"https://api.weball.me/public-v2/tournament/{TOURNAMENT_ID}/phase/{PHASE_ID}/visualizer?instanceUUID={INSTANCE_UUID}"
    
    r = requests.get(url, timeout=15)
    if r.status_code != 200:
        raise Exception(f"HTTP Error {r.status_code} fetching Elite A data")
        
    viz = r.json()
    
    fechas = []
    equipos_dict = {}
    
    for child in viz.get("children", []):
        fecha_label = child.get("value", "")
        # extract date number
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
                
            # Partidos por categoria
            partidos_cat = {}
            # FIX: la API devuelve los partidos en "tournamentMatches", no "matches".
            # La clave no existia, asi que este torneo nunca tuvo resultados.
            sub_matches = mp.get("tournamentMatches") or mp.get("matches") or []
            for m in sub_matches:
                cat_obj = m.get("category", {}).get("categoryInstance", {})
                cat_name = cat_obj.get("name", "").upper().strip()
                if not cat_name: continue
                
                sh = m.get("scoreHome")
                sa = m.get("scoreAway")
                status = (m.get("matchStatus") or {}).get("label") or ""
                match_id = (m.get("matchInfo") or {}).get("id")
                _dt = (m.get("matchInfo") or {}).get("dateTime") or (m.get("matchInfo") or {}).get("dateTimeUTC")
                
                jugado = (sh is not None and sa is not None) or status == "Finalizado"
                
                partidos_cat[cat_name] = {
                    "goles_local": sh,
                    "goles_visitante": sa,
                    "jugado": jugado,
                    "estado": status,
                    "match_id": match_id,
                    "fecha_hora": _dt
                }
                
            encuentros.append({
                "local": local,
                "visitante": visitante,
                "estado": mp.get("status"),
                "partidos": partidos_cat
            })
            
        fechas.append({
            "numero": num_fecha,
            "fecha_partido": next(
                (p["fecha_hora"][:10] for e in encuentros
                 for p in e["partidos"].values() if p.get("fecha_hora")), None),
            "encuentros": encuentros
        })
        
    # FIX: este scraper nunca pedia la tabla de posiciones (solo el fixture),
    # por eso el dashboard no mostraba tabla para este torneo.
    print("Obteniendo tabla de posiciones...")
    tablas_posiciones, cats_api, equipos_api = obtener_tablas(
        TOURNAMENT_ID, PHASE_ID, env_var="ELITE_GROUP_ID")
    for e in equipos_api:
        equipos_dict.setdefault(e["nombre"], {"nombre": e["nombre"]})
        if e.get("logo"):
            equipos_dict[e["nombre"]]["logo"] = e["logo"]

    result = {
        "actualizado": datetime.now().isoformat(),
        "torneo": "Torneo Joma 2026 - Elite A (Clausura)",
        "torneo_id": "futsal-elite",
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
    
    os.makedirs(os.path.dirname(OUTPUT_DATA), exist_ok=True)
    os.makedirs(os.path.dirname(OUTPUT_WEB_DATA), exist_ok=True)
    
    with open(OUTPUT_DATA, "w") as f:
        json.dump(result, f, indent=2)
        
    shutil.copy(OUTPUT_DATA, OUTPUT_WEB_DATA)
    print(f"✅ OK — {len(fechas)} fechas de Elite A guardadas en {OUTPUT_DATA}")

if __name__ == "__main__":
    fetch_elite_data()
