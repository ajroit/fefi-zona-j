#!/usr/bin/env python3
"""
Scraper de estadísticas de Futsal para Villa Sahores
Fetchea todos los partidos jugados, compila goleadores, tarjetas y árbitros.
Guarda los resultados en data/futsal-stats.json.
"""

import json
import os
import sys
from datetime import datetime
import concurrent.futures
import requests

API_BASE = "https://api.weball.me/public-v2"
INSTANCE_UUID = "2d260df1-7986-49fd-95a2-fcb046e7a4fb"
EQUIPO_FOCO = "VILLA SAHORES"
TIMEOUT = 15

# Definición de los torneos a procesar
TORNEOS = [
    {"id": 549, "disciplina": 2, "nombre": "Futsal Liga de Honor"},
    {"id": 555, "disciplina": 2, "nombre": "Futsal Reducido"},
    {"id": 560, "disciplina": 1, "nombre": "Futsal Femenino"}
]

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_FILE = os.path.join(BASE_DIR, "data", "futsal-stats.json")

def api_get(path, params=None):
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

def obtener_fases(tournament_id, discipline_id):
    try:
        data = api_get(f"/tournament/{tournament_id}/phase", params={"disciplineId": discipline_id})
        return data if isinstance(data, list) else []
    except Exception as e:
        print(f"⚠️ Error obteniendo fases para torneo {tournament_id}: {e}")
        return []

def obtener_visualizer(tournament_id, phase_id):
    try:
        return api_get(f"/tournament/{tournament_id}/phase/{phase_id}/visualizer", params={"instanceUUID": INSTANCE_UUID})
    except Exception as e:
        print(f"⚠️ Error obteniendo visualizer para torneo {tournament_id}, fase {phase_id}: {e}")
        return {}

def obtener_detalles_partido(match_id):
    try:
        return api_get(f"/matches/{match_id}")
    except Exception as e:
        print(f"⚠️ Error obteniendo detalles del partido {match_id}: {e}")
        return None

def main():
    print("🔮 Iniciando recopilación de estadísticas de Futsal...")
    
    # 1. Recopilar todos los match_ids de partidos jugados por Sahores
    match_tasks = [] # Lista de (match_id, torneo_nombre, n_fecha)
    match_ids_set = set()

    for torneo in TORNEOS:
        t_id = torneo["id"]
        t_name = torneo["nombre"]
        disc_id = torneo["disciplina"]
        
        print(f"🔍 Procesando {t_name} (ID: {t_id})...")
        fases = obtener_fases(t_id, disc_id)
        
        for fase in fases:
            fase_id = fase["id"]
            visualizer = obtener_visualizer(t_id, fase_id)
            if not visualizer:
                continue
            
            for child in visualizer.get("children", []):
                if child.get("type") != "container":
                    continue
                fecha_label = child.get("value") or child.get("name") or ""
                
                # Intentar parsear el número de fecha
                n_fecha = 0
                import re
                match_num = re.search(r'\d+', str(fecha_label))
                if match_num:
                    n_fecha = int(match_num.group())
                
                for mp in child.get("matchesPlanning", []):
                    home_insc = mp.get("clubHome", {}).get("clubInscription", {}) or {}
                    away_insc = mp.get("clubAway", {}).get("clubInscription", {}) or {}
                    club_home = home_insc.get("tableName") or home_insc.get("name", "")
                    club_away = away_insc.get("tableName") or away_insc.get("name", "")
                    
                    if EQUIPO_FOCO in club_home.upper() or EQUIPO_FOCO in club_away.upper():
                        for tm in mp.get("tournamentMatches", []):
                            # Verificar si ya se jugó
                            score_h = tm.get("scoreHome")
                            score_a = tm.get("scoreAway")
                            status = tm.get("matchStatus", {}) or {}
                            finalized = status.get("finalized", False)
                            
                            m_info = tm.get("matchInfo", {}) or {}
                            match_id = m_info.get("id")
                            
                            if match_id and (finalized or (score_h is not None and score_a is not None)):
                                if match_id not in match_ids_set:
                                    match_ids_set.add(match_id)
                                    match_tasks.append((match_id, t_name, n_fecha))

    print(f"📊 Se encontraron {len(match_tasks)} partidos jugados de Villa Sahores.")
    
    # 2. Descargar los detalles de cada partido de forma concurrente
    partidos_detalles = {}
    print("⚡ Descargando detalles de partidos de la API de Weball...")
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        # Mapear futuros a sus metadatos correspondientes
        futuros = {
            executor.submit(obtener_detalles_partido, m_id): (m_id, t_name, n_fecha)
            for m_id, t_name, n_fecha in match_tasks
        }
        
        for fut in concurrent.futures.as_completed(futuros):
            m_id, t_name, n_fecha = futuros[fut]
            detalle = fut.result()
            if detalle:
                partidos_detalles[m_id] = {
                    "raw": detalle,
                    "torneo": t_name,
                    "fecha_num": n_fecha
                }

    print(f"✅ Descargados los detalles de {len(partidos_detalles)} partidos.")

    # 3. Procesar los datos y construir estadísticas
    goleadores = {} # cat_name -> list of players
    arbitros = {}   # referee_name -> referee_info
    log_partidos = {} # match_id -> parsed match info

    for m_id, info in partidos_detalles.items():
        raw = info["raw"]
        torneo = info["torneo"]
        fecha_num = info["fecha_num"]
        
        cat = raw.get("category", {}) or {}
        cat_name = cat.get("name", "DESCONOCIDA")
        
        local = raw.get("clubHomeName", "")
        visitante = raw.get("clubAwayName", "")
        score_h = raw.get("scoreHome", 0)
        score_a = raw.get("scoreAway", 0)
        fecha_hora = raw.get("dateTime", "")
        
        # Determinar resultado del partido para Villa Sahores
        resultado = None
        if EQUIPO_FOCO in local.upper():
            if score_h > score_a:
                resultado = "victoria"
            elif score_h == score_a:
                resultado = "empate"
            else:
                resultado = "derrota"
        elif EQUIPO_FOCO in visitante.upper():
            if score_a > score_h:
                resultado = "victoria"
            elif score_a == score_h:
                resultado = "empate"
            else:
                resultado = "derrota"

        # Árbitros del partido
        ref_list = []
        for ref in raw.get("referees", []) or []:
            ref_name = f"{ref.get('name', '')} {ref.get('lastName', '')}".strip()
            if not ref_name:
                continue
            ref_logo = ref.get("logo") or ""
            ref_id = ref.get("id")
            
            ref_list.append({
                "id": ref_id,
                "nombre_completo": ref_name,
                "foto": ref_logo
            })
            
            # Registrar en DB global de árbitros
            if ref_name not in arbitros:
                arbitros[ref_name] = {
                    "id": ref_id,
                    "nombre": ref.get("name", ""),
                    "apellido": ref.get("lastName", ""),
                    "foto": ref_logo,
                    "partidos_dirigidos": 0,
                    "victorias": 0,
                    "empates": 0,
                    "derrotas": 0
                }
            arbitros[ref_name]["partidos_dirigidos"] += 1
            if resultado == "victoria":
                arbitros[ref_name]["victorias"] += 1
            elif resultado == "empate":
                arbitros[ref_name]["empates"] += 1
            elif resultado == "derrota":
                arbitros[ref_name]["derrotas"] += 1

        # Goles del partido
        goles_list = []
        # Goles local
        for g in raw.get("eventGoalsListHome", []) or []:
            p_data = g.get("player", {}) or {}
            p_id = p_data.get("id")
            p_name = f"{p_data.get('name', '')} {p_data.get('lastName', '')}".strip()
            cantidad = g.get("goals", 1)
            
            goles_list.append({
                "jugador_id": p_id,
                "nombre_completo": p_name,
                "equipo": local,
                "cantidad": cantidad
            })
            
            # Registrar en acumulador de goleadores
            if EQUIPO_FOCO in local.upper():
                registrar_goleador(goleadores, cat_name, p_data, local, cantidad)
                
        # Goles visitante
        for g in raw.get("eventGoalsListAway", []) or []:
            p_data = g.get("player", {}) or {}
            p_id = p_data.get("id")
            p_name = f"{p_data.get('name', '')} {p_data.get('lastName', '')}".strip()
            cantidad = g.get("goals", 1)
            
            goles_list.append({
                "jugador_id": p_id,
                "nombre_completo": p_name,
                "equipo": visitante,
                "cantidad": cantidad
            })
            
            # Registrar en acumulador de goleadores
            if EQUIPO_FOCO in visitante.upper():
                registrar_goleador(goleadores, cat_name, p_data, visitante, cantidad)

        # Tarjetas del partido
        tarjetas_list = []
        
        # Tarjetas amarillas
        for c in raw.get("eventYellowCardsListHome", []) or []:
            tarjetas_list.append(parse_tarjeta(c, "amarilla", local))
            if EQUIPO_FOCO in local.upper():
                registrar_tarjeta(goleadores, cat_name, c.get("player", {}), "amarilla", local)
        for c in raw.get("eventYellowCardsListAway", []) or []:
            tarjetas_list.append(parse_tarjeta(c, "amarilla", visitante))
            if EQUIPO_FOCO in visitante.upper():
                registrar_tarjeta(goleadores, cat_name, c.get("player", {}), "amarilla", visitante)
                
        # Tarjetas rojas
        for c in raw.get("eventRedCardsListHome", []) or []:
            tarjetas_list.append(parse_tarjeta(c, "roja", local))
            if EQUIPO_FOCO in local.upper():
                registrar_tarjeta(goleadores, cat_name, c.get("player", {}), "roja", local)
        for c in raw.get("eventRedCardsListAway", []) or []:
            tarjetas_list.append(parse_tarjeta(c, "roja", visitante))
            if EQUIPO_FOCO in visitante.upper():
                registrar_tarjeta(goleadores, cat_name, c.get("player", {}), "roja", visitante)
                
        # Doble amarillas
        for c in raw.get("eventDoubleYellowCardsListHome", []) or []:
            tarjetas_list.append(parse_tarjeta(c, "doble_amarilla", local))
            if EQUIPO_FOCO in local.upper():
                registrar_tarjeta(goleadores, cat_name, c.get("player", {}), "doble_amarilla", local)
        for c in raw.get("eventDoubleYellowCardsListAway", []) or []:
            tarjetas_list.append(parse_tarjeta(c, "doble_amarilla", visitante))
            if EQUIPO_FOCO in visitante.upper():
                registrar_tarjeta(goleadores, cat_name, c.get("player", {}), "doble_amarilla", visitante)

        # Guardar en log detallado
        log_partidos[str(m_id)] = {
            "match_id": m_id,
            "torneo": torneo,
            "categoria": cat_name,
            "fecha_num": fecha_num,
            "fecha_hora": fecha_hora,
            "local": local,
            "visitante": visitante,
            "goles_local": score_h,
            "goles_visitante": score_a,
            "referees": ref_list,
            "goles": goles_list,
            "tarjetas": tarjetas_list
        }

    # Ordenar goleadores por goles desc
    for cat in goleadores:
        goleadores[cat] = sorted(goleadores[cat], key=lambda x: x["goles"], reverse=True)

    # 4. Guardar archivo final
    stats_data = {
        "actualizado": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "goleadores": goleadores,
        "arbitros": arbitros,
        "partidos_detalles": log_partidos
    }

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(stats_data, f, indent=2, ensure_ascii=False)

    print(f"🎉 Estadísticas compiladas exitosamente en: {OUTPUT_FILE}")
    print(f"   - Categorías con estadísticas: {len(goleadores)}")
    print(f"   - Árbitros en base de datos: {len(arbitros)}")
    print(f"   - Partidos analizados: {len(log_partidos)}")

def parse_tarjeta(card_obj, tipo, equipo):
    p = card_obj.get("player", {}) or {}
    p_id = p.get("id")
    p_name = f"{p.get('name', '')} {p.get('lastName', '')}".strip()
    return {
        "tipo": tipo,
        "jugador_id": p_id,
        "nombre_completo": p_name,
        "equipo": equipo
    }

def registrar_goleador(goleadores, cat_name, player_obj, equipo, goles):
    if not player_obj:
        return
    p_id = player_obj.get("id")
    if not p_id:
        return
    
    if cat_name not in goleadores:
        goleadores[cat_name] = []
        
    # Buscar si ya existe
    jugador = None
    for j in goleadores[cat_name]:
        if j["jugador_id"] == p_id:
            jugador = j
            break
            
    if not jugador:
        jugador = {
            "jugador_id": p_id,
            "nombre": player_obj.get("name", ""),
            "apellido": player_obj.get("lastName", ""),
            "equipo": equipo,
            "goles": 0,
            "amarillas": 0,
            "rojas": 0,
            "doble_amarilla": 0
        }
        goleadores[cat_name].append(jugador)
        
    jugador["goles"] += goles

def registrar_tarjeta(goleadores, cat_name, player_obj, tipo_tarjeta, equipo):
    if not player_obj:
        return
    p_id = player_obj.get("id")
    if not p_id:
        return
        
    if cat_name not in goleadores:
        goleadores[cat_name] = []
        
    # Buscar si ya existe
    jugador = None
    for j in goleadores[cat_name]:
        if j["jugador_id"] == p_id:
            jugador = j
            break
            
    if not jugador:
        jugador = {
            "jugador_id": p_id,
            "nombre": player_obj.get("name", ""),
            "apellido": player_obj.get("lastName", ""),
            "equipo": equipo,
            "goles": 0,
            "amarillas": 0,
            "rojas": 0,
            "doble_amarilla": 0
        }
        goleadores[cat_name].append(jugador)
        
    if tipo_tarjeta == "amarilla":
        jugador["amarillas"] += 1
    elif tipo_tarjeta == "roja":
        jugador["rojas"] += 1
    elif tipo_tarjeta == "doble_amarilla":
        jugador["doble_amarilla"] += 1

if __name__ == "__main__":
    main()
