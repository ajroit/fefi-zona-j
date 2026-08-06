#!/usr/bin/env python3
"""
Sedes de los partidos para los torneos del Clausura.

POR QUE EXISTE
--------------
El objeto que devuelve /visualizer trae `venue: null` en cada partido: la sede
NO viaja ahi. Hay que pedirla aparte, por combinacion de (fecha, categoria),
al endpoint .../category/{cat_id}/visualizer/{node_id}/match.

EL ESTADO DEL PARTIDO
---------------------
El estado real (Suspendido, Postergado, Finalizado...) vive en el campo
`status` al NIVEL del partido, y SOLO en este endpoint de detalle: el
visualizer lo devuelve null. Los scrapers leian `matchStatus`, que no existe
en ninguna respuesta, asi que el estado salia siempre "".

`status.publicLabel` es lo que muestra la web ("Suspendido");
`status.label` es la etiqueta interna ("Postergado").

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


def cargar_previos(json_path):
    """Sede y estado ya conocidos del JSON anterior, para no perderlos si la API falla."""
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
                if not mid:
                    continue
                guardado = {}
                if p.get("sede"):
                    guardado["venue"] = {"name": p.get("sede"), "address": p.get("direccion")}
                if p.get("estado"):
                    guardado["estado"] = p.get("estado")
                if p.get("fecha_hora"):
                    guardado["fecha_hora"] = p.get("fecha_hora")
                if guardado:
                    previas[mid] = guardado
    return previas


def obtener_detalles(visualizer, tournament_id, phase_id, cache_json=None):
    """Devuelve {match_id: {"venue":..., "estado":..., "fecha_hora":...}}.
    Conserva lo que ya sabiamos si la API falla."""
    previas = cargar_previos(cache_json)

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

    detalles, fallidas = {}, 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futuros = [ex.submit(_fetch, tournament_id, phase_id, n, c) for n, c in tareas]
        for fut in concurrent.futures.as_completed(futuros):
            matches, error = fut.result()
            if error:
                fallidas += 1
            for match in matches:
                m_id = (match.get("matchInfo") or {}).get("id")
                if not m_id:
                    continue
                info = {}
                if match.get("venue"):
                    info["venue"] = match["venue"]
                st = match.get("status") or {}
                # publicLabel es lo que muestra la web; label es el interno
                etiqueta = st.get("publicLabel") or st.get("label")
                if etiqueta:
                    info["estado"] = etiqueta
                    info["finalizado"] = bool(st.get("finalized"))
                dt = (match.get("matchInfo") or {}).get("dateTime")
                if dt:
                    info["fecha_hora"] = dt
                if info:
                    detalles[m_id] = info

    if fallidas:
        print(f"   ⚠️  {fallidas} de {len(tareas)} combinaciones fallaron tras reintentar")

    # Fusion campo por campo: lo nuevo pisa, pero lo viejo nunca se pierde
    resultado = {}
    for mid in set(previas) | set(detalles):
        combinado = dict(previas.get(mid) or {})
        combinado.update(detalles.get(mid) or {})
        resultado[mid] = combinado

    con_sede = sum(1 for v in resultado.values() if v.get("venue"))
    con_estado = sum(1 for v in resultado.values() if v.get("estado"))
    print(f"   ✅ {len(resultado)} partidos con detalle "
          f"({con_sede} con sede, {con_estado} con estado)")
    return resultado


# Alias por compatibilidad
def obtener_sedes(*a, **k):
    return obtener_detalles(*a, **k)
