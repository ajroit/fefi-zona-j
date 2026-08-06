#!/usr/bin/env python3
"""
Tabla de posiciones para los torneos del Clausura (Elite, Promocionales, Reducido).

POR QUE EXISTE
--------------
Los tres scrapers "lite" solo pedian /visualizer, o sea el fixture. Nunca
llamaban al endpoint de clasificacion, asi que `tablas_posiciones` salia
siempre {} y el dashboard no podia mostrar ninguna tabla, aunque la web
oficial si la tuviera.

El scraper de Liga de Honor ya hacia esto bien; esto es la misma logica
extraida para poder reusarla.

NOTA SOBRE GRUPOS
-----------------
/clasification-groups a veces devuelve [] aunque la web muestre tabla: pasa
cuando la fase todavia no tiene el grupo publicado en la API. En ese caso se
devuelve una tabla vacia y el scraper sigue con el fixture, en vez de fallar.
Se puede forzar el grupo con la env var correspondiente (ej: ELITE_GROUP_ID).
"""
import os
import socket

import urllib3.util.connection as connection

connection.allowed_gai_family = lambda: socket.AF_INET

import requests

API_BASE = "https://api.weball.me/public-v2"
INSTANCE_UUID = "2d260df1-7986-49fd-95a2-fcb046e7a4fb"
TIMEOUT = 20


def _get(path, **params):
    params["instanceUUID"] = INSTANCE_UUID
    try:
        r = requests.get(f"{API_BASE}{path}", params=params, timeout=TIMEOUT)
        if not r.ok:
            print(f"   ⚠️  {path} -> HTTP {r.status_code}")
            return None
        return r.json()
    except Exception as e:
        print(f"   ⚠️  {path} -> {e!r}")
        return None


def obtener_group_id(tournament_id, phase_id, env_var=None):
    """Id del grupo de clasificacion, o None si la fase todavia no lo publica."""
    if env_var:
        forzado = os.environ.get(env_var, "").strip()
        if forzado.isdigit():
            print(f"   📌 grupo forzado por {env_var}={forzado}")
            return int(forzado)

    grupos = _get(f"/tournament/{tournament_id}/phase/{phase_id}/clasification-groups")
    if not grupos:
        return None
    gid = grupos[0].get("id")
    print(f"   📊 grupo de clasificacion: {grupos[0].get('value', '?')} (ID: {gid})")
    return gid


def procesar_tablas(clasificacion_raw):
    """Convierte la respuesta cruda en (tablas, categorias, equipos)."""
    tablas, categorias, equipos_set = {}, [], {}

    for cat_data in clasificacion_raw or []:
        cat_nombre = cat_data.get("value") or "DESCONOCIDA"
        categorias.append(cat_nombre)

        tabla = []
        for pos in cat_data.get("positions") or []:
            # Mismo cuidado que en scraper_futsal: el valor puede ser null,
            # y .get(k, {}) no cubre ese caso.
            club_insc = (pos.get("club") or {}).get("clubInscription") or {}
            nombre = club_insc.get("tableName") or club_insc.get("name") or ""
            if not nombre:
                continue
            equipos_set.setdefault(nombre.upper().strip(), club_insc.get("logo") or "")

            tabla.append({
                "posicion": len(tabla) + 1,
                "equipo": nombre.upper().strip(),
                "pj": pos.get("pj") or 0,
                "g": pos.get("pg") or 0,
                "e": pos.get("pe") or 0,
                "p": pos.get("pp") or 0,
                "gf": pos.get("gf") or 0,
                "gc": pos.get("gc") or 0,
                "pts": pos.get("pts") or 0,
            })
        tablas[cat_nombre] = tabla

    # Tabla general acumulada
    general = {}
    for tabla in tablas.values():
        for row in tabla:
            eq = row["equipo"]
            general.setdefault(eq, {"equipo": eq, "pj": 0, "g": 0, "e": 0,
                                    "p": 0, "gf": 0, "gc": 0, "pts": 0})
            for k in ("pj", "g", "e", "p", "gf", "gc", "pts"):
                general[eq][k] += row[k]

    general_list = sorted(general.values(),
                          key=lambda x: (x["pts"], x["gf"] - x["gc"], x["gf"]),
                          reverse=True)
    for i, row in enumerate(general_list, 1):
        row["posicion"] = i
    tablas["general"] = general_list

    equipos = [{"nombre": n, "logo": l} for n, l in equipos_set.items()]
    return tablas, categorias, equipos


def obtener_tablas(tournament_id, phase_id, env_var=None):
    """Devuelve (tablas, categorias, equipos). Vacios si todavia no hay tabla."""
    gid = obtener_group_id(tournament_id, phase_id, env_var)
    if not gid:
        print("   ℹ️  La fase todavia no publica tabla de posiciones; sigo con el fixture")
        return {}, [], []

    crudo = _get(f"/tournament/{tournament_id}/phase/{phase_id}/group/{gid}/clasification")
    if not crudo:
        print("   ℹ️  La clasificacion vino vacia")
        return {}, [], []

    tablas, categorias, equipos = procesar_tablas(crudo)
    print(f"   ✅ tabla: {len(categorias)} categorias, {len(equipos)} equipos")
    return tablas, categorias, equipos
