#!/usr/bin/env python3
"""
Predictor de resultados deportivos – Villa Sahores
Analiza los datos de cada torneo y genera predicciones usando Gemini.

Algoritmo:
  1. Para cada torneo (Baby Fútbol, Futsal Liga, Futsal Reducido), extrae
     los próximos partidos del equipo foco.
  2. Para cada rival, calcula métricas clave:
     - Posición, puntos, efectividad (% victorias)
     - Gol a favor / en contra / diferencia de goles
     - Forma reciente (últimos 5 resultados)
     - Rendimiento local vs visitante (en categoría general)
  3. Arma un prompt estructurado con todos estos datos y pide a Gemini:
     - Predicción de resultado (victoria/empate/derrota)
     - Score estimado
     - Probabilidades porcentuales
     - Justificación breve
  4. Guarda todo en data/predictions.json

Requisitos:
  - GEMINI_API_KEY (env var o argumento)
  - google-generativeai (pip install google-generativeai)
"""

import json
import os
import sys
import time
from datetime import datetime

try:
    import google.generativeai as genai
except ImportError:
    print("❌ Instalar: pip install google-generativeai")
    sys.exit(1)


# ── Configuración ──────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
OUTPUT_FILE = os.path.join(DATA_DIR, "predictions.json")

EQUIPO_FOCO = "VILLA SAHORES"
MAX_PARTIDOS_POR_TORNEO = 3  # Limitar para no exceder quota

TORNEOS = [
    {
        "id": "babyfutbol",
        "nombre": "Baby Fútbol FEFI",
        "archivo": "fefi-data.json",
        "label_corto": "Baby Fútbol",
    },
    {
        "id": "futsal",
        "nombre": "Futsal Liga de Honor B",
        "archivo": "futsal-data.json",
        "label_corto": "Futsal Liga",
    },
    {
        "id": "futsal-reducido",
        "nombre": "Futsal Reducido Zona A",
        "archivo": "futsal-reducido-data.json",
        "label_corto": "Futsal Reducido",
    },
]


# ── Extracción de datos ───────────────────────────────────
def cargar_datos(archivo):
    path = os.path.join(DATA_DIR, archivo)
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def stats_equipo(data, equipo):
    """Calcula estadísticas de un equipo a partir de la tabla general."""
    gral = data.get("tablas_posiciones", {}).get("general", [])
    row = next((t for t in gral if t["equipo"] == equipo), None)
    if not row:
        return None
    total = len(gral)
    return {
        "posicion": row["posicion"],
        "total_equipos": total,
        "pj": row["pj"],
        "g": row["g"],
        "e": row["e"],
        "p": row["p"],
        "gf": row.get("gf", 0),
        "gc": row.get("gc", 0),
        "dif": row.get("gf", 0) - row.get("gc", 0),
        "pts": row["pts"],
        "efectividad": round(100 * row["g"] / row["pj"], 1) if row["pj"] > 0 else 0,
    }


def forma_reciente(data, equipo, n=5):
    """Últimos N resultados del equipo (W/D/L) en vista general."""
    resultados = []
    for fecha in data.get("fechas", []):
        for enc in fecha.get("encuentros", []):
            local, visitante = enc["local"], enc["visitante"]
            if equipo not in (local, visitante):
                continue
            if enc.get("estado") != "Finalizado":
                continue
            es_local = (local == equipo)

            # Sumar goles de todas las categorías
            gf, gc = 0, 0
            jugado = False
            for cat, p in enc.get("partidos", {}).items():
                if cat == "general":
                    continue
                if p and p.get("jugado"):
                    jugado = True
                    gf += (p.get("goles_local", 0) if es_local
                           else p.get("goles_visitante", 0)) or 0
                    gc += (p.get("goles_visitante", 0) if es_local
                           else p.get("goles_local", 0)) or 0
            if not jugado:
                continue
            rival = visitante if es_local else local
            if gf > gc:
                r = "W"
            elif gf < gc:
                r = "L"
            else:
                r = "D"
            resultados.append({
                "resultado": r,
                "gf": gf,
                "gc": gc,
                "rival": rival,
                "fecha_num": fecha.get("numero", 0),
                "local": es_local,
            })
    return resultados[-n:]


def stats_por_categoria(data, equipo):
    """Stats del equipo en cada categoría individual."""
    tablas = data.get("tablas_posiciones", {})
    cats = {}
    for cat, tabla in tablas.items():
        if cat == "general":
            continue
        row = next((t for t in tabla if t["equipo"] == equipo), None)
        if row:
            cats[cat] = {
                "pos": row["posicion"],
                "total": len(tabla),
                "pts": row["pts"],
                "pj": row["pj"],
                "gf": row.get("gf", 0),
                "gc": row.get("gc", 0),
            }
    return cats


def proximos_partidos(data):
    """Encuentra los próximos partidos del equipo foco (después del último jugado)."""
    partidos = []
    for fecha in data.get("fechas", []):
        for enc in fecha.get("encuentros", []):
            if EQUIPO_FOCO not in (enc["local"], enc["visitante"]):
                continue
            es_local = (enc["local"] == EQUIPO_FOCO)
            rival = enc["visitante"] if es_local else enc["local"]
            jugado = enc.get("estado") == "Finalizado"
            partidos.append({
                "numero": fecha.get("numero", 0),
                "fecha": fecha.get("fecha_partido"),
                "rival": rival,
                "es_local": es_local,
                "jugado": jugado,
            })

    # Buscar después del último jugado (misma lógica del fix)
    last_played = -1
    for i, p in enumerate(partidos):
        if p["jugado"]:
            last_played = i

    pendientes = [p for i, p in enumerate(partidos)
                  if not p["jugado"] and i > last_played]
    return pendientes[:MAX_PARTIDOS_POR_TORNEO]


def head_to_head(data, rival):
    """Busca resultado anterior entre el foco y el rival en este torneo."""
    for fecha in data.get("fechas", []):
        for enc in fecha.get("encuentros", []):
            if enc.get("estado") != "Finalizado":
                continue
            if EQUIPO_FOCO not in (enc["local"], enc["visitante"]):
                continue
            oponente = (enc["visitante"] if enc["local"] == EQUIPO_FOCO
                        else enc["local"])
            if oponente != rival:
                continue

            es_local = (enc["local"] == EQUIPO_FOCO)
            gf, gc = 0, 0
            for p in enc.get("partidos", {}).values():
                if p and p.get("jugado"):
                    gf += (p.get("goles_local", 0) if es_local
                           else p.get("goles_visitante", 0)) or 0
                    gc += (p.get("goles_visitante", 0) if es_local
                           else p.get("goles_local", 0)) or 0
            return {"gf": gf, "gc": gc, "local_foco": es_local}
    return None


# ── Armado del prompt para Gemini ─────────────────────────
def armar_prompt_torneo(torneo_info, data):
    """Arma el bloque de datos para un torneo completo."""
    proximos = proximos_partidos(data)
    if not proximos:
        return None, []

    foco_stats = stats_equipo(data, EQUIPO_FOCO)
    foco_forma = forma_reciente(data, EQUIPO_FOCO)
    foco_cats = stats_por_categoria(data, EQUIPO_FOCO)

    bloques = []
    for partido in proximos:
        rival = partido["rival"]
        rival_stats = stats_equipo(data, rival)
        rival_forma = forma_reciente(data, rival)
        rival_cats = stats_por_categoria(data, rival)
        h2h = head_to_head(data, rival)

        bloque = f"""
### Fecha {partido['numero']} — {EQUIPO_FOCO} vs {rival} ({'Local' if partido['es_local'] else 'Visitante'})

**{EQUIPO_FOCO}:**
- General: {foco_stats}
- Forma últimos 5: {[f"{r['resultado']} ({r['gf']}-{r['gc']} vs {r['rival']})" for r in foco_forma]}
- Por categoría: {json.dumps(foco_cats, ensure_ascii=False)}

**{rival}:**
- General: {rival_stats}
- Forma últimos 5: {[f"{r['resultado']} ({r['gf']}-{r['gc']} vs {r['rival']})" for r in rival_forma]}
- Por categoría: {json.dumps(rival_cats, ensure_ascii=False)}

**Head-to-head esta temporada:** {h2h if h2h else 'No se enfrentaron aún'}
**Condición:** {EQUIPO_FOCO} juega de {'LOCAL' if partido['es_local'] else 'VISITANTE'}
"""
        bloques.append((partido, bloque))

    return foco_stats, bloques


def generar_predicciones_gemini(datos_torneos):
    """Llama a Gemini con todos los datos y obtiene predicciones."""

    # Armar prompt completo
    secciones = []
    match_list = []  # para mapear respuestas

    for torneo, data, foco_stats, bloques in datos_torneos:
        if not bloques:
            continue
        seccion = f"\n## {torneo['nombre']}\n"
        seccion += f"Total equipos: {foco_stats['total_equipos']}  |  "
        seccion += f"{EQUIPO_FOCO} está {foco_stats['posicion']}° con {foco_stats['pts']} pts\n"
        for partido, bloque in bloques:
            seccion += bloque
            match_list.append({
                "torneo_id": torneo["id"],
                "torneo_nombre": torneo["nombre"],
                "torneo_label": torneo["label_corto"],
                "fecha_num": partido["numero"],
                "rival": partido["rival"],
                "es_local": partido["es_local"],
                "fecha": partido.get("fecha"),
            })
        secciones.append(seccion)

    if not secciones:
        return []

    prompt = f"""Sos un analista deportivo experto en futsal y baby fútbol argentino.
Analizá los siguientes datos estadísticos REALES de los torneos de Villa Sahores y predecí los resultados de cada próximo partido.

IMPORTANTE:
- Los datos son reales y actualizados
- "General" suma los goles de TODAS las categorías del encuentro
- Cada encuentro tiene múltiples categorías (1ra, 3ra, 4ta, etc.)
- El score general puede ser alto (30+) porque suma muchas categorías
- Considerá la forma reciente, posición en tabla, diferencia de gol, y localía
- Sé realista: si un equipo viene perdiendo mucho, no lo favorezcas

Para CADA partido listado, respondé en formato JSON estricto (sin markdown, sin ```):

[
  {{
    "fecha_num": <número>,
    "rival": "<nombre exacto del rival>",
    "torneo_id": "<id del torneo>",
    "prediccion": "victoria" | "empate" | "derrota",
    "score_foco": <goles estimados para {EQUIPO_FOCO}>,
    "score_rival": <goles estimados para rival>,
    "prob_victoria": <0-100>,
    "prob_empate": <0-100>,
    "prob_derrota": <0-100>,
    "confianza": <0-100>,
    "razon": "<explicación concisa en español, 2-3 oraciones>"
  }},
  ...
]

DATOS:
{''.join(secciones)}

Respondé SOLO con el array JSON, sin texto adicional.
"""

    print(f"📝 Prompt: {len(prompt)} caracteres, {len(match_list)} partidos")

    model = genai.GenerativeModel("gemini-2.5-flash")

    # Retry con backoff para manejar rate limits
    for attempt in range(3):
        try:
            response = model.generate_content(prompt)
            break
        except Exception as e:
            if "429" in str(e) and attempt < 2:
                wait = 30 * (attempt + 1)
                print(f"⏳ Rate limit, esperando {wait}s (intento {attempt + 1}/3)...")
                time.sleep(wait)
            else:
                raise

    # Parsear respuesta
    text = response.text.strip()
    # Limpiar posibles bloques de código markdown
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
    if text.endswith("```"):
        text = text.rsplit("```", 1)[0]
    text = text.strip()

    try:
        predicciones = json.loads(text)
    except json.JSONDecodeError as e:
        print(f"⚠️  Error parseando respuesta de Gemini: {e}")
        print(f"Respuesta cruda:\n{text[:500]}")
        return []

    # Enriquecer con metadata
    for pred in predicciones:
        # Buscar la info original del match
        match_info = next(
            (m for m in match_list
             if m["fecha_num"] == pred.get("fecha_num")
             and m["torneo_id"] == pred.get("torneo_id")),
            None
        )
        if match_info:
            pred["torneo_nombre"] = match_info["torneo_nombre"]
            pred["torneo_label"] = match_info["torneo_label"]
            pred["es_local"] = match_info["es_local"]
            pred["fecha"] = match_info.get("fecha")

    return predicciones


# ── Main ──────────────────────────────────────────────────
def main():
    print("🔮 Predictor de resultados – Villa Sahores")
    print("=" * 50)

    # API Key
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key and len(sys.argv) > 1:
        api_key = sys.argv[1]
    if not api_key:
        print("❌ Falta GEMINI_API_KEY (env var o argumento)")
        print("   Uso: python predictor.py <API_KEY>")
        print("   O:   GEMINI_API_KEY=... python predictor.py")
        sys.exit(1)

    genai.configure(api_key=api_key)

    # Procesar cada torneo
    datos_torneos = []
    for torneo in TORNEOS:
        data = cargar_datos(torneo["archivo"])
        if not data:
            print(f"⚠️  No se encontró {torneo['archivo']}")
            continue

        foco_stats, bloques = armar_prompt_torneo(torneo, data)
        if not bloques:
            print(f"ℹ️  {torneo['nombre']}: sin próximos partidos")
            continue

        print(f"✅ {torneo['nombre']}: {len(bloques)} partidos a predecir")
        datos_torneos.append((torneo, data, foco_stats, bloques))

    if not datos_torneos:
        print("ℹ️  No hay partidos pendientes en ningún torneo")
        return

    # Generar predicciones
    print("\n🤖 Consultando a Gemini...")
    predicciones = generar_predicciones_gemini(datos_torneos)
    print(f"✅ {len(predicciones)} predicciones generadas")

    # Guardar
    output = {
        "actualizado": datetime.utcnow().isoformat() + "Z",
        "equipo_foco": EQUIPO_FOCO,
        "predicciones": predicciones,
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Guardado en {OUTPUT_FILE}")
    for pred in predicciones:
        emoji = {"victoria": "🟢", "empate": "🟡", "derrota": "🔴"}.get(
            pred.get("prediccion"), "⚪")
        print(f"   {emoji} F{pred.get('fecha_num')} vs {pred.get('rival')}: "
              f"{pred.get('score_foco')}-{pred.get('score_rival')} "
              f"({pred.get('prediccion')}, {pred.get('confianza')}% conf)")


if __name__ == "__main__":
    main()
