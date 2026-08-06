#!/usr/bin/env python3
import json, os, socket
import urllib3.util.connection as connection
connection.allowed_gai_family = lambda: socket.AF_INET
import requests
BASE="https://api.weball.me/public-v2"; UUID="2d260df1-7986-49fd-95a2-fcb046e7a4fb"
OUT=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),"probe")
def get(path,**p):
    p["instanceUUID"]=UUID
    try:
        r=requests.get(f"{BASE}{path}",params=p,timeout=20)
        b=r.json() if r.ok else r.text[:150]
        return {"status":r.status_code,"n":(len(b) if isinstance(b,list) else type(b).__name__),
                "sample":(b[0] if isinstance(b,list) and b else b)}
    except Exception as e: return {"error":repr(e)}
res={}
# el slug de la web dice t227; el scraper usa 551
for tid in (227,551):
    res[f"t{tid}_groups"]=get(f"/tournament/{tid}/phase/1359/clasification-groups")
    res[f"t{tid}_clas_1454"]=get(f"/tournament/{tid}/phase/1359/group/1454/clasification")
    res[f"t{tid}_phases"]=get(f"/tournament/{tid}/phase",disciplineId=2)
# promo tiene grupo 2008: probar la clasificacion completa
res["promo_clas_2008"]=get("/tournament/895/phase/1388/group/2008/clasification")
# fixtureClasifications sueltos que aparecian en el grupo de promo
res["promo_clas_3864"]=get("/tournament/895/phase/1388/clasification/3864")
os.makedirs(OUT,exist_ok=True)
json.dump(res,open(os.path.join(OUT,"v3.json"),"w"),indent=2,ensure_ascii=False,default=str)
print("listo")
