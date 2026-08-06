#!/usr/bin/env python3
"""Sonda temporal: vuelca la ESTRUCTURA de la API de Weball para los tres
torneos del Clausura, para poder escribir el parseo sin adivinar."""
import json, os, socket
import urllib3.util.connection as connection
connection.allowed_gai_family = lambda: socket.AF_INET
import requests

BASE = "https://api.weball.me/public-v2"
UUID = "2d260df1-7986-49fd-95a2-fcb046e7a4fb"
TORNEOS = [("elite", 551, 1359), ("promo", 895, 1388), ("reducido", 555, 1361)]
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "probe")


def get(path, **params):
    params["instanceUUID"] = UUID
    try:
        r = requests.get(f"{BASE}{path}", params=params, timeout=20)
        return {"_status": r.status_code, "_body": r.json() if r.ok else r.text[:300]}
    except Exception as e:
        return {"_error": repr(e)}


def shape(o, depth=0):
    """Resume la forma de un objeto sin volcar miles de filas."""
    if depth > 4:
        return "..."
    if isinstance(o, dict):
        return {k: shape(v, depth + 1) for k, v in o.items()}
    if isinstance(o, list):
        return [f"<lista de {len(o)}>"] + ([shape(o[0], depth + 1)] if o else [])
    return type(o).__name__


os.makedirs(OUT, exist_ok=True)
for nombre, tid, pid in TORNEOS:
    res = {}
    viz = get(f"/tournament/{tid}/phase/{pid}/visualizer")
    res["visualizer_shape"] = shape(viz)
    body = viz.get("_body") or {}
    if isinstance(body, dict):
        for child in (body.get("children") or [])[:1]:
            for mp in (child.get("matchesPlanning") or [])[:1]:
                res["matchPlanning_keys"] = sorted(mp.keys())
                for key in ("tournamentMatches", "matches"):
                    if mp.get(key):
                        res[f"primer_{key}"] = mp[key][0]
                        break
    res["clasification_groups"] = get(f"/tournament/{tid}/phase/{pid}/clasification-groups")
    grupos = res["clasification_groups"].get("_body")
    if isinstance(grupos, list) and grupos:
        gid = grupos[0].get("id")
        res["_group_id"] = gid
        cl = get(f"/tournament/{tid}/phase/{pid}/group/{gid}/clasification")
        res["clasification_shape"] = shape(cl)
        b = cl.get("_body")
        if isinstance(b, list) and b:
            res["primera_categoria"] = {k: v for k, v in b[0].items() if k != "positions"}
            pos = b[0].get("positions") or []
            res["primera_posicion"] = pos[0] if pos else None
    with open(os.path.join(OUT, f"{nombre}.json"), "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=2, default=str)
    print(f"OK {nombre}")
