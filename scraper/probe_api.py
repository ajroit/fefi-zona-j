#!/usr/bin/env python3
"""Sonda v2: probar variantes del endpoint de clasificacion."""
import json, os, socket
import urllib3.util.connection as connection
connection.allowed_gai_family = lambda: socket.AF_INET
import requests

BASE="https://api.weball.me/public-v2"; UUID="2d260df1-7986-49fd-95a2-fcb046e7a4fb"
OUT=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),"probe")

def get(path, **p):
    p["instanceUUID"]=UUID
    try:
        r=requests.get(f"{BASE}{path}",params=p,timeout=20)
        b=r.json() if r.ok else r.text[:200]
        n=len(b) if isinstance(b,list) else ("dict" if isinstance(b,dict) else b)
        return {"status":r.status_code,"n":n,"sample":(b[0] if isinstance(b,list) and b else b)}
    except Exception as e:
        return {"error":repr(e)}

# elite=551/1359 (grupo 1454 segun la web), promo=895/1388, reducido=555/1361
res={}
for nombre,tid,pid,gid in [("elite",551,1359,1454),("promo",895,1388,None),("reducido",555,1361,None)]:
    r={}
    r["groups_solo_uuid"]      = get(f"/tournament/{tid}/phase/{pid}/clasification-groups")
    r["groups_disciplineId_2"] = get(f"/tournament/{tid}/phase/{pid}/clasification-groups", disciplineId=2)
    r["groups_disciplineId_1"] = get(f"/tournament/{tid}/phase/{pid}/clasification-groups", disciplineId=1)
    if gid:
        r[f"clasification_group_{gid}"] = get(f"/tournament/{tid}/phase/{pid}/group/{gid}/clasification")
        r[f"clasification_group_{gid}_d2"] = get(f"/tournament/{tid}/phase/{pid}/group/{gid}/clasification", disciplineId=2)
    r["phases_d2"] = get(f"/tournament/{tid}/phase", disciplineId=2)
    res[nombre]=r
os.makedirs(OUT,exist_ok=True)
json.dump(res,open(os.path.join(OUT,"v2.json"),"w"),indent=2,ensure_ascii=False,default=str)
print("listo")
