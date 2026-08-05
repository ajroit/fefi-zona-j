#!/usr/bin/env python3
"""
Generador de Predicciones y Scouting de Rival – Villa Sahores
Regla estricta: NO generar frases sintéticas de relleno para Futsal
cuando no hay estadísticas reales o análisis previo de Gemini.
"""

import json
import os
import shutil
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
OUTPUT_FILE = os.path.join(DATA_DIR, "predictions.json")
OUTPUT_WEB_FILE = os.path.join(BASE_DIR, "web", "data", "predictions.json")

EQUIPO_FOCO_FEFI = "CLUB SAHORES"
EQUIPO_FOCO_FUTSAL = "VILLA SAHORES"

TORNEOS = [
    {
        "id": "babyfutbol",
        "nombre": "Baby Fútbol FEFI",
        "archivo": "fefi-data.json",
        "equipo": EQUIPO_FOCO_FEFI,
        "cats": ["2013", "2014", "2015", "2016", "2017", "2018", "2019"]
    },
    {
        "id": "futsal",
        "nombre": "Futsal Elite A",
        "archivo": "futsal-elite-data.json",
        "equipo": EQUIPO_FOCO_FUTSAL,
        "cats": ["PRIMERA MASCULINO", "TERCERA MASCULINO", "CUARTA MASCULINO", "QUINTA MASCULINO", "SEXTA MASCULINO", "SEPTIMA MASCULINO", "OCTAVA MASCULINO"]
    },
    {
        "id": "futsal-promo",
        "nombre": "Futsal Promocionales Zona C",
        "archivo": "futsal-promo-data.json",
        "equipo": EQUIPO_FOCO_FUTSAL,
        "cats": ["2016 PROMOCIONALES", "2017 PROMOCIONALES", "2018 PROMOCIONALES", "2019 PROMOCIONALES"]
    },
    {
        "id": "futsal-reducido",
        "nombre": "Futsal Reducido Zona A",
        "archivo": "futsal-reducido-data.json",
        "equipo": EQUIPO_FOCO_FUTSAL,
        "cats": ["PRIMERA MASCULINO", "TERCERA MASCULINO", "CUARTA MASCULINO", "QUINTA MASCULINO", "SEXTA MASCULINO", "SEPTIMA MASCULINO", "OCTAVA MASCULINO"]
    }
]

def format_nombre(n):
    if not n: return ""
    return n.replace("CLUB ", "").replace("C.S.Y.D. ", "").strip()

def buscar_antecedente_directo(data, equipo_foco, rival, cat):
    """Busca en todas las fechas un encuentro previo entre ambos equipos para esa categoría."""
    for fecha in data.get("fechas", []):
        for enc in fecha.get("encuentros", []):
            loc = enc.get("local", "").strip()
            vis = enc.get("visitante", "").strip()
            if (loc == equipo_foco and vis == rival) or (loc == rival and vis == equipo_foco):
                partidos = enc.get("partidos", {})
                p = partidos.get(cat)
                if p and p.get("jugado"):
                    es_local_prev = (loc == equipo_foco)
                    gl = p.get("goles_local")
                    gv = p.get("goles_visitante")
                    if gl is not None and gv is not None:
                        gf = gl if es_local_prev else gv
                        gc = gv if es_local_prev else gl
                        return {
                            "fecha_num": fecha.get("numero"),
                            "es_local": es_local_prev,
                            "gf": gf,
                            "gc": gc
                        }
    return None

def buscar_antecedente_general(data, equipo_foco, rival):
    """Calcula el saldo de puntos/victorias de la tira en el choque del Apertura."""
    for fecha in data.get("fechas", []):
        for enc in fecha.get("encuentros", []):
            loc = enc.get("local", "").strip()
            vis = enc.get("visitante", "").strip()
            if (loc == equipo_foco and vis == rival) or (loc == rival and vis == equipo_foco):
                partidos = enc.get("partidos", {})
                jugados = [p for p in partidos.values() if p.get("jugado")]
                if len(jugados) > 0:
                    es_local_prev = (loc == equipo_foco)
                    vic_foco = 0
                    vic_rival = 0
                    empates = 0
                    pts_foco = 0
                    pts_rival = 0
                    for p in jugados:
                        gl = p.get("goles_local", 0) or 0
                        gv = p.get("goles_visitante", 0) or 0
                        gf = gl if es_local_prev else gv
                        gc = gv if es_local_prev else gl
                        if gf > gc:
                            vic_foco += 1
                            pts_foco += 2
                        elif gc > gf:
                            vic_rival += 1
                            pts_rival += 2
                        else:
                            empates += 1
                            pts_foco += 1
                            pts_rival += 1
                    return {
                        "fecha_num": fecha.get("numero"),
                        "es_local": es_local_prev,
                        "vic_foco": vic_foco,
                        "vic_rival": vic_rival,
                        "empates": empates,
                        "pts_foco": pts_foco,
                        "pts_rival": pts_rival
                    }
    return None

def build_predictions():
    predicciones = []
    
    for t in TORNEOS:
        path = os.path.join(DATA_DIR, t["archivo"])
        if not os.path.exists(path):
            continue
            
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
            
        equipo_foco = t["equipo"]
        fechas = data.get("fechas", [])
        
        proximo = None
        for fecha in fechas:
            for enc in fecha.get("encuentros", []):
                local = enc.get("local", "").strip()
                visitante = enc.get("visitante", "").strip()
                if equipo_foco in (local, visitante):
                    jugado = enc.get("estado") == "Finalizado" or any(p.get("jugado") for p in enc.get("partidos", {}).values())
                    if not jugado and not proximo:
                        es_local = (local == equipo_foco)
                        rival = visitante if es_local else local
                        proximo = {
                            "numero": fecha.get("numero"),
                            "fecha": fecha.get("fecha_partido"),
                            "rival": rival,
                            "es_local": es_local,
                            "encuentro": enc
                        }
                        break
                        
        if not proximo:
            continue
            
        rival = proximo["rival"]
        num_fecha = proximo["numero"]
        es_local = proximo["es_local"]
        condicion_str = "Local" if es_local else "Visitante"
        
        antecedente_gen = buscar_antecedente_general(data, equipo_foco, rival)
        
        for cat in t["cats"]:
            tabla = data.get("tablas_posiciones", {}).get(cat, [])
            row_foco = next((r for r in tabla if r.get("equipo") == equipo_foco), None)
            row_rival = next((r for r in tabla if r.get("equipo") == rival), None)
            
            pos_foco = row_foco.get("posicion", "-") if row_foco else "-"
            pts_foco = row_foco.get("pts", 0) if row_foco else 0
            pos_rival = row_rival.get("posicion", "-") if row_rival else "-"
            pts_rival = row_rival.get("pts", 0) if row_rival else 0
            
            ant_cat = buscar_antecedente_directo(data, equipo_foco, rival, cat)
            
            # REGLA ESTRICTA:
            # En FEFI: Si hay tabla o antecedente, construir análisis.
            # En Futsal: Si no hay partidos jugados o Gemini real, NO colocar texto genérico de relleno.
            scouting_analysis = None
            
            if t["id"] == "babyfutbol":
                scouting_analysis = f"Cruce clave de la Fecha {num_fecha} de {condicion_str} ante {format_nombre(rival)}."
                if row_rival and row_foco:
                    if pts_foco > pts_rival:
                        scouting_analysis += f" El rival llega {pos_rival}° ({pts_rival} pts). Sahores ({pos_foco}° con {pts_foco} pts) buscará imponer su juego."
                    elif pts_rival > pts_foco:
                        scouting_analysis += f" El rival se encuentra {pos_rival}° ({pts_rival} pts) sobre Sahores ({pos_foco}°)."
                    else:
                        scouting_analysis += f" Duelo directo entre dos equipos empatados en puntos ({pts_foco} pts)."
            else:
                # En Futsal: solo incluir scouting_analysis si hay datos reales en la tabla de posiciones con partidos jugados
                if row_rival and row_rival.get("pj", 0) > 0 and row_foco and row_foco.get("pj", 0) > 0:
                    scouting_analysis = f"Fecha {num_fecha} ({condicion_str}) ante {format_nombre(rival)} ({pos_rival}° con {pts_rival} pts vs Sahores {pos_foco}° con {pts_foco} pts)."
                
            if scouting_analysis or ant_cat or antecedente_gen:
                predicciones.append({
                    "torneo_id": t["id"],
                    "torneo_label": t["nombre"],
                    "fecha_num": num_fecha,
                    "categoria": cat,
                    "categoria_label": cat,
                    "rival": rival,
                    "es_local": es_local,
                    "fecha": proximo["fecha"],
                    "probabilidad_victoria": 50,
                    "probabilidad_empate": 25,
                    "probabilidad_derrota": 25,
                    "resultado_estimado": "Duelo parejo",
                    "scouting_rival": scouting_analysis,
                    "antecedente_cat": ant_cat,
                    "antecedente_gen": antecedente_gen,
                    "factores_clave": [
                        f"Condición: {condicion_str}",
                        f"Posición rival: {pos_rival}° ({pts_rival} pts)"
                    ]
                })

    output_data = {
        "actualizado": datetime.now().isoformat(),
        "predicciones": predicciones
    }

    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(os.path.dirname(OUTPUT_WEB_FILE), exist_ok=True)
    
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)
        
    shutil.copy(OUTPUT_FILE, OUTPUT_WEB_FILE)
    print(f"✅ OK — {len(predicciones)} predicciones estrictas guardadas en {OUTPUT_FILE}")

if __name__ == "__main__":
    build_predictions()
