#!/usr/bin/env python3
"""
Calcula el próximo rival de cada torneo leyendo los JSON de data/.

Se usa DOS veces en el workflow (antes y después de scrapear) para decidir
si vale la pena gastar una llamada a Gemini. Antes esta lógica estaba
duplicada e inconsistente dentro del YAML: el "antes" leía predictions.json
y el "después" leía los data/*.json, así que nunca coincidían y el predictor
corría siempre.

Imprime una línea tipo:  babyfutbol:CLUB X,futsal:CLUB Y
"""
import json
import os
from datetime import datetime, timedelta, timezone

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")

TORNEOS = [
    ("futsal-data.json", "futsal", "VILLA SAHORES"),
    ("futsal-duelos-data.json", "futsal-duelos", "VILLA SAHORES"),
    ("futsal-reducido-data.json", "futsal-reducido", "VILLA SAHORES"),
    ("futsal-femenino-data.json", "futsal-femenino", "VILLA SAHORES"),
    ("fefi-data.json", "babyfutbol", "CLUB SAHORES"),
]


def next_rival(fname, equipo_default):
    tz_arg = timezone(timedelta(hours=-3))
    hoy = datetime.now(tz_arg).strftime("%Y-%m-%d")

    try:
        with open(os.path.join(DATA_DIR, fname), encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return ""

    equipo = data.get("equipo_foco", equipo_default)
    matches = []
    for fecha in data.get("fechas", []):
        for enc in fecha.get("encuentros", []):
            local = enc.get("local", "")
            visitante = enc.get("visitante", "")
            if equipo not in (local, visitante):
                continue
            rival = visitante if local == equipo else local
            jugado = enc.get("estado") == "Finalizado" or any(
                p.get("jugado") for p in enc.get("partidos", {}).values()
            )
            matches.append({
                "rival": rival,
                "jugado": jugado,
                "fecha": fecha.get("fecha_partido"),
            })

    # 1) primer partido de hoy en adelante
    for m in matches:
        if m.get("fecha") and m["fecha"] >= hoy:
            return m["rival"]
    # 2) si no hay, el primero sin jugar (postergados)
    for m in matches:
        if not m["jugado"]:
            return m["rival"]
    return ""


def main():
    rivales = {}
    for fname, tid, foco in TORNEOS:
        r = next_rival(fname, foco)
        if r:
            rivales[tid] = r
    print(",".join(f"{k}:{v}" for k, v in sorted(rivales.items())))


if __name__ == "__main__":
    main()
