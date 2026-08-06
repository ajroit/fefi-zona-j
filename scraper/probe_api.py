#!/usr/bin/env python3
"""Sonda: volcar TODO lo que la API sabe del partido 239752
(VILLA SAHORES vs HURACAN, 2017 Promocionales), que la web muestra suspendido."""
import json, os, socket
import urllib3.util.connection as connection
connection.allowed_gai_family = lambda: socket.AF_INET
import requests

BASE="https://api.weball.me/public-v2"; UUID="2d260df1-7986-49fd-95a2-fcb046e7a4fb"
TID, PID = 895, 1388
OBJETIVO = {239661, 239752, 239843, 239934}
OUT=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),"probe")

def get(path,**p):
    p["instanceUUID"]=UUID
    try:
        r=requests.get(f"{BASE}{path}",params=p,timeout=25)
        return r.status_code,(r.json() if r.ok else r.text[:200])
    except Exception as e: return -1,repr(e)

res={}

# 1) el partido tal como viene en el visualizer
st,viz=get(f"/tournament/{TID}/phase/{PID}/visualizer")
res["visualizer_status"]=st
for child in (viz or {}).get("children",[]) or []:
    for mp in child.get("matchesPlanning") or []:
        for tm in mp.get("tournamentMatches") or []:
            if tm.get("id") in OBJETIVO or (tm.get("matchInfo") or {}).get("id") in OBJETIVO:
                res.setdefault("desde_visualizer",{})[str(tm.get("id"))]=tm
                res.setdefault("matchesPlanning_padre",{})[str(tm.get("id"))]={
                    k:v for k,v in mp.items() if k not in ("tournamentMatches","clubHome","clubAway")}

# 2) el mismo partido desde el endpoint de detalle
for child in (viz or {}).get("children",[]) or []:
    nid=child.get("id")
    for mp in child.get("matchesPlanning") or []:
        for tm in mp.get("tournamentMatches") or []:
            mid=(tm.get("matchInfo") or {}).get("id")
            if mid in OBJETIVO:
                cid=(tm.get("category") or {}).get("id")
                st2,body=get(f"/tournament/{TID}/phase/{PID}/category/{cid}/visualizer/{nid}/match")
                res["detalle_status"]=st2
                if isinstance(body,list):
                    for m in body:
                        if (m.get("matchInfo") or {}).get("id") in OBJETIVO:
                            res.setdefault("desde_detalle",{})[str(mid)]=m
                break

# 3) endpoints por partido individual
for mid in sorted(OBJETIVO):
    for path in (f"/match/{mid}", f"/tournament-match/{mid}", f"/tournament/{TID}/match/{mid}"):
        st3,b=get(path)
        if st3==200:
            res.setdefault("endpoints_por_match",{})[f"{path}"]=b
            break
        res.setdefault("endpoints_probados",{})[path]=st3
    break

os.makedirs(OUT,exist_ok=True)
json.dump(res,open(os.path.join(OUT,"v5.json"),"w"),indent=2,ensure_ascii=False,default=str)
print("listo")
