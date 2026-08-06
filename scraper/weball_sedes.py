#!/usr/bin/env python3
"""
Sedes de los partidos para los torneos del Clausura.

POR QUE EXISTE
--------------
El objeto que devuelve /visualizer trae `venue: null` en cada partido: la sede
NO viaja ahi. Hay que pedirla aparte, por combinacion de (fecha, categoria),
al endpoint .../category/{cat_id}/visualizer/{node_id}/match.

scraper_futsal.py ya lo hacia; los tres scrapers "lite" (Elite, Promocionales,
Reducido) nunca lo llamaron, por eso el dashboard no mostraba ninguna sede
aunque estuvieran publicadas.
"""
import concurrent.futures
import socket

import urllib3.util.connection as connection

connection.allowed_gai_family = lambda: socket.AF_INET

import requests

API_BASE = "https://api.weball.me/public-v2"
INSTANCE_UUID = "2d260df1-7986-49fd-95a2-fcb046e7a4fb"
TIMEOUT = 20
MAX_WORKERS = 10


def _fetch(tournament_id, phase_id, node_id, cat_id):
    url = (f"{API_BASE}/tournament/{tournament_id}/phase/{phase_id}"
           f"/category/{cat_id}/visualizer/{node_id}/match")
    try:
        r = requests.get(url, params={"instanceUUID": INSTANCE_UUID}, timeout=TIMEOUT)
        if not r.ok:
            return []
        data = r.json()
        return data if isinstance(data, list) else []
    except Exception:
        return []


def obtener_sedes(visualizer, tournament_id, phase_id):
    """Devuelve {match_id: venue_dict} para todos los partidos del fixture."""
    tareas = set()
    for child in (visualizer or {}).get("children", []) or []:
        node_id = child.get("id")
        if not node_id:
            continue
        for mp in child.get("matchesPlanning") or []:
            for tm in (mp.get("tournamentMatches") or mp.get("matches") or []):
                cat_id = (tm.get("category") or {}).get("id")
                if cat_id:
                    tareas.add((node_id, cat_id))

    if not tareas:
        return {}

    print(f"   ⏳ Buscando sedes en {len(tareas)} combinaciones fecha/categoria...")
    sedes = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futuros = [ex.submit(_fetch, tournament_id, phase_id, n, c) for n, c in tareas]
        for fut in concurrent.futures.as_completed(futuros):
            for match in fut.result():
                m_id = (match.get("matchInfo") or {}).get("id")
                venue = match.get("venue")
                if m_id and venue:
                    sedes[m_id] = venue

    print(f"   ✅ Sedes encontradas para {len(sedes)} partidos")
    return sedes
