#!/usr/bin/env python3
"""
Sedes de los partidos para los torneos del Clausura.

POR QUE EXISTE
--------------
El objeto que devuelve /visualizer trae `venue: null` en cada partido: la sede
NO viaja ahi. Hay que pedirla aparte, por combinacion de (fecha, categoria),
al endpoint .../category/{cat_id}/visualizer/{node_id}/match.

EL PROBLEMA DE LOS 503
----------------------
Sondeando la API se vio que con 10 pedidos concurrentes empieza a devolver
503 Service Temporarily Unavailable. En femenino fallaban 30 de 54 llamadas.
El codigo anterior se tragaba la excepcion y devolvia [], asi que la sede
quedaba vacia sin que nada avisara: parecia "la API no lo publica" cuando en
realidad nos estaban limitando.

Ahora: menos concurrencia, reintentos con backoff, y las sedes que ya
teniamos guardadas se conservan si el pedido llega a fallar igual.
"""
import concurrent.futures
import json
import os
import random
import socket
import time

import urllib3.util.connection as connection

connection.allowed_gai_family = lambda: socket.AF_INET

import requests

API_BASE = "https://api.weball.me/public-v2"
INSTANCE_UUID = "2d260df1-7986-49fd-95a2-fcb046e7a4fb"
TIMEOUT = 25
MAX_WORKERS = 4          # con 10 la API tira 503
REINTENTOS = 4

_session = requests.Session()


def _fetch(tournament_id, phase_id, node_id, cat_id):
    """Devuelve (lista_de_matches, hubo_error_definitivo)."""
    url = (f"{API_BASE}/tournament/{tournament_id}/phase/{phase_id}"
           f"/category/{cat_id}/visualizer/{node_id}/match")
    for intento in range(REINTENTOS):
        try:
            r = _session.get(url, params={"instanceUUID": INSTANCE_UUID}, timeout=TIMEOUT)
            if r.status_code in (429, 500, 502, 503, 504):
                if intento < REINTENTOS - 1:
                    espera = (2 ** intento) + random.uniform(0, 0.8)
                    time.sleep(espera)
                    continue
                return [], True
            if not r.ok:
                return [], True
            data = r.json()
            return (data if isinstance(data, list) else []), False
        except Exception:
            if intento < REINTENTOS - 1:
                time.sleep((2 ** intento) + random.uniform(0, 0.8))
                continue
            return [], True
    return [], True


def cargar_sedes_previas(json_path):
    """Sedes ya conocidas del JSON anterior, para no perderlas si la API falla."""
    previas = {}
    if not json_path or not os.path.exists(json_path):
        return previas
    try:
        with open(json_path, encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return previas
    for fecha in data.get("fechas") or []:
        for enc in fecha.get("encuentros") or []:
            for p in (enc.get("partidos") or {}).values():
                mid = p.get("match_id")
                if mid and p.get("sede"):
                    previas[mid] = {"name": p.get("sede"), "address": p.get("direccion")}
    return previas


def obtener_sedes(visualizer, tournament_id, phase_id, cache_json=None):
    """Devuelve {match_id: venue}. Conserva las sedes previas si la API falla."""
    previas = cargar_sedes_previas(cache_json)

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
        return previas

    print(f"   ⏳ Sedes: {len(tareas)} combinaciones fecha/categoria "
          f"({MAX_WORKERS} en paralelo, hasta {REINTENTOS} intentos)")

    sedes, fallidas = {}, 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futuros = [ex.submit(_fetch, tournament_id, phase_id, n, c) for n, c in tareas]
        for fut in concurrent.futures.as_completed(futuros):
            matches, error = fut.result()
            if error:
                fallidas += 1
            for match in matches:
                m_id = (match.get("matchInfo") or {}).get("id")
                venue = match.get("venue")
                if m_id and venue:
                    sedes[m_id] = venue

    if fallidas:
        print(f"   ⚠️  {fallidas} de {len(tareas)} combinaciones fallaron tras reintentar")

    # Lo nuevo pisa a lo viejo, pero lo viejo nunca se pierde
    resultado = dict(previas)
    resultado.update(sedes)
    recuperadas = len(resultado) - len(sedes)
    print(f"   ✅ Sedes: {len(sedes)} de la API"
          + (f" + {recuperadas} conservadas del JSON anterior" if recuperadas > 0 else ""))
    return resultado
