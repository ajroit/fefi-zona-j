#!/usr/bin/env python3
"""
Fetcher de datos Futsal Reducido (Clausura 2026)
Consume la API publica de Weball para Torneo 555 / Fase 1361
Genera data/futsal-reducido-data.json y web/data/futsal-reducido-data.json
"""

import json
import os
import requests
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
            sub_matches = mp.get("matches") or []
            for m in sub_matches:
                cat_obj = m.get("category", {}).get("categoryInstance", {})
                cat_name = cat_obj.get("name", "").upper().strip()
                if not cat_name: continue
                
                sh = m.get("scoreHome")
                sa = m.get("scoreAway")
                status = m.get("status")
                match_id = m.get("id")
                
                jugado = (sh is not None and sa is not None) or status == "Finalizado"
                
                partidos_cat[cat_name] = {
                    "goles_local": sh,
                    "goles_visitante": sa,
                    "jugado": jugado,
                    "estado": status,
                    "match_id": match_id
                }
                
            encuentros.append({
                "local": local,
                "visitante": visitante,
                "estado": mp.get("status"),
                "partidos": partidos_cat
            })
            
        fechas.append({
            "numero": num_fecha,
            "fecha_partido": None,
            "encuentros": encuentros
        })
        
    result = {
        "actualizado": datetime.now().isoformat(),
        "torneo": "Torneo Joma 2026 - Futsal Reducido (Clausura)",
        "torneo_id": "futsal-reducido",
        "equipo_foco": EQUIPO_FOCO,
        "categorias": [
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
        "tablas_posiciones": {}
    }
    
    os.makedirs(os.path.dirname(OUTPUT_DATA), exist_ok=True)
    os.makedirs(os.path.dirname(OUTPUT_WEB_DATA), exist_ok=True)
    
    with open(OUTPUT_DATA, "w") as f:
        json.dump(result, f, indent=2)
        
    shutil.copy(OUTPUT_DATA, OUTPUT_WEB_DATA)
    print(f"✅ OK — {len(fechas)} fechas de Reducido guardadas en {OUTPUT_DATA}")

if __name__ == "__main__":
    fetch_reducido_data()
