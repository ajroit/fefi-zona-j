#!/usr/bin/env python3
"""Sonda: cuantos partidos tienen horario y sede REALMENTE en la API,
por torneo, y si el endpoint de detalle responde o falla."""
import json, os, socket, concurrent.futures
import urllib3.util.connection as connection
connection.allowed_gai_family = lambda: socket.AF_INET
import requests

BASE="https://api.weball.me/public-v2"; UUID="2d260df1-7986-49fd-95a2-fcb046e7a4fb"
OUT=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),"probe")

TORNEOS=[("elite",551,1359),("promo",895,1388),("reducido",555,1361),
         ("femenino",560,1393),("femenino_apertura",560,935),("honorB",549,1366)]

def get(path,**p):
    p["instanceUUID"]=UUID
    try:
        r=requests.get(f"{BASE}{path}",params=p,timeout=25)
        return r.status_code, (r.json() if r.ok else r.text[:150])
    except Exception as e:
        return -1, repr(e)

res={}
for nombre,tid,pid in TORNEOS:
    st,viz=get(f"/tournament/{tid}/phase/{pid}/visualizer")
    r={"visualizer_status":st}
    if not isinstance(viz,dict):
        r["error"]=str(viz)[:150]; res[nombre]=r; continue

    total=condt=0; combos=set(); ejemplos=[]
    for child in viz.get("children") or []:
        nid=child.get("id")
        for mp in child.get("matchesPlanning") or []:
            for tm in (mp.get("tournamentMatches") or []):
                total+=1
                mi=tm.get("matchInfo") or {}
                if mi.get("dateTime"): condt+=1
                cid=(tm.get("category") or {}).get("id")
                if nid and cid: combos.add((nid,cid))
    r.update(total_matches=total, con_dateTime=condt, combos=len(combos))

    # probar el endpoint de detalle
    ok=err=venues=0
    def probe(nc):
        n,c=nc
        return get(f"/tournament/{tid}/phase/{pid}/category/{c}/visualizer/{n}/match")
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        for st2,body in ex.map(probe, list(combos)[:60]):
            if st2==200 and isinstance(body,list):
                ok+=1
                for m in body:
                    if m.get("venue"): venues+=1
                    if len(ejemplos)<1 and m.get("venue"):
                        ejemplos.append({k:m.get(k) for k in ("venue",)} | {"matchInfo_dateTime":(m.get("matchInfo") or {}).get("dateTime")})
            else:
                err+=1
                if len(ejemplos)<2: ejemplos.append({"status":st2,"body":str(body)[:120]})
    r.update(detalle_ok=ok, detalle_error=err, venues_en_detalle=venues, ejemplos=ejemplos)
    res[nombre]=r
    print(nombre, r.get("total_matches"), r.get("con_dateTime"), r.get("detalle_ok"), r.get("venues_en_detalle"))

os.makedirs(OUT,exist_ok=True)
json.dump(res,open(os.path.join(OUT,"v4.json"),"w"),indent=2,ensure_ascii=False,default=str)
