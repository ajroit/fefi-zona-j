#!/usr/bin/env python3
"""
Predictor de resultados deportivos – Villa Sahores
Genera predicciones POR CATEGORÍA para cada próximo partido, usando Gemini.

Hace UNA LLAMADA A GEMINI POR PARTIDO para evitar timeouts.
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
GEMINI_MODEL = "gemini-2.5-flash"
MAX_PARTIDOS = 1  # Solo el próximo partido por torneo

FEFI_CAT_LABELS = {
    "2019": "Cat 2019", "2018": "Cat 2018", "2017": "Cat 2017",
    "2016": "Cat 2016", "2015": "Cat 2015", "2014": "Cat 2014",
    "2013": "Cat 2013",
}

FUTSAL_CAT_LABELS = {
    "PRIMERA MASCULINO": "1ra", "TERCERA MASCULINO": "3ra",
    "CUARTA MASCULINO": "4ta", "QUINTA MASCULINO": "5ta",
    "SEXTA MASCULINO": "6ta", "SEPTIMA MASCULINO": "7ma",
    "OCTAVA MASCULINO": "8va", "SUB21 MASCULINO": "Sub-21",
    "PRIMERA FEMENINO": "1ra Fem", "SEGUNDA FEMENINO": "2da Fem",
    "TERCERA FEMENINO": "3ra Fem",
}

TORNEOS = [
    {
        "id": "babyfutbol", "nombre": "Baby Fútbol FEFI",
        "archivo": "fefi-data.json", "label_corto": "Baby Fútbol",
        "cat_labels": FEFI_CAT_LABELS,
    },
    {
        "id": "futsal", "nombre": "Futsal Liga de Honor B",
        "archivo": "futsal-data.json", "label_corto": "Futsal Liga",
        "cat_labels": FUTSAL_CAT_LABELS,
    },
    {
        "id": "futsal-reducido", "nombre": "Futsal Reducido Zona A",
        "archivo": "futsal-reducido-data.json", "label_corto": "Futsal Reducido",
        "cat_labels": FUTSAL_CAT_LABELS,
    },
]


# ── Extracción de datos ───────────────────────────────────
def cargar_datos(archivo):
    path = os.path.join(DATA_DIR, archivo)
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def stats_equipo_cat(data, equipo, cat):
    tabla = data.get("tablas_posiciones", {}).get(cat, [])
    row = next((t for t in tabla if t["equipo"] == equipo), None)
    if not row:
        return None
    return {
        "pos": row.get("posicion", "?"), "total": len(tabla),
        "pj": row.get("pj", 0), "g": row.get("g", 0),
        "e": row.get("e", 0), "p": row.get("p", 0),
        "gf": row.get("gf", 0), "gc": row.get("gc", 0),
        "pts": row.get("pts", 0),
    }


def forma_reciente_cat(data, equipo, cat, n=5):
    resultados = []
    for fecha in data.get("fechas", []):
        for enc in fecha.get("encuentros", []):
            if equipo not in (enc["local"], enc["visitante"]):
                continue
            p = enc.get("partidos", {}).get(cat)
            if not p or not p.get("jugado"):
                continue
            es_local = (enc["local"] == equipo)
            gf = (p.get("goles_local", 0) if es_local
                  else p.get("goles_visitante", 0)) or 0
            gc = (p.get("goles_visitante", 0) if es_local
                  else p.get("goles_local", 0)) or 0
            r = "W" if gf > gc else ("L" if gf < gc else "D")
            rival = enc["visitante"] if es_local else enc["local"]
            resultados.append(f"{r}({gf}-{gc} vs {rival})")
    return resultados[-n:]


def encuentro_jugado(enc):
    """Un encuentro está jugado si tiene estado Finalizado o algún partido con jugado=True."""
    if enc.get("estado") == "Finalizado":
        return True
    return any(p.get("jugado") for p in enc.get("partidos", {}).values())


def proximos_partidos(data, equipo_foco):
    partidos = []
    for fecha in data.get("fechas", []):
        for enc in fecha.get("encuentros", []):
            if equipo_foco not in (enc["local"], enc["visitante"]):
                continue
            es_local = (enc["local"] == equipo_foco)
            partidos.append({
                "numero": fecha.get("numero", 0),
                "fecha": fecha.get("fecha_partido"),
                "rival": enc["visitante"] if es_local else enc["local"],
                "es_local": es_local,
                "jugado": encuentro_jugado(enc),
            })

    last_played = -1
    for i, p in enumerate(partidos):
        if p["jugado"]:
            last_played = i

    pendientes = [p for i, p in enumerate(partidos)
                  if not p["jugado"] and i > last_played]
    return pendientes[:MAX_PARTIDOS]


# ── Prompt por partido individual ─────────────────────────
def armar_prompt_partido(torneo, data, partido, equipo_foco):
    """Arma un prompt para UN SOLO partido con todas sus categorías."""
    rival = partido["rival"]
    categorias = data.get("categorias", [])
    cat_labels = torneo.get("cat_labels", {})

    bloque = ""
    cats_con_datos = []
    for cat in categorias:
        label = cat_labels.get(cat, cat)
        foco_st = stats_equipo_cat(data, equipo_foco, cat)
        rival_st = stats_equipo_cat(data, rival, cat)
        foco_forma = forma_reciente_cat(data, equipo_foco, cat)
        rival_forma = forma_reciente_cat(data, rival, cat)

        if not foco_st and not rival_st:
            continue

        cats_con_datos.append({"key": cat, "label": label})
        bloque += f"\n**{label} (key: \"{cat}\"):**\n"
        if foco_st:
            bloque += f"  {equipo_foco}: {foco_st['pos']}°/{foco_st['total']} "
            bloque += f"({foco_st['pts']}pts, {foco_st['g']}G-{foco_st['e']}E-{foco_st['p']}P, "
            bloque += f"GF:{foco_st['gf'] or 0} GC:{foco_st['gc'] or 0})"
            if foco_forma:
                bloque += f" Forma: {', '.join(foco_forma)}"
            bloque += "\n"
        else:
            bloque += f"  {equipo_foco}: sin datos\n"

        if rival_st:
            bloque += f"  {rival}: {rival_st['pos']}°/{rival_st['total']} "
            bloque += f"({rival_st['pts']}pts, {rival_st['g']}G-{rival_st['e']}E-{rival_st['p']}P, "
            bloque += f"GF:{rival_st['gf'] or 0} GC:{rival_st['gc'] or 0})"
            if rival_forma:
                bloque += f" Forma: {', '.join(rival_forma)}"
            bloque += "\n"
        else:
            bloque += f"  {rival}: sin datos\n"

    if not cats_con_datos:
        return None

    prompt = f"""Analista deportivo: predecí CADA CATEGORÍA del partido
{equipo_foco} vs {rival} (Fecha {partido['numero']}, {torneo['nombre']}).
{equipo_foco} juega de {'LOCAL' if partido['es_local'] else 'VISITANTE'}.

REGLAS:
- Datos reales del torneo actual
- Cada categoría es un partido independiente (1 gol = 1 gol)
- Considerá posición, forma, gol diferencia
- Sé realista con equipos en mala racha
- La "bajada" es un subtítulo de diario deportivo: breve, enganchante, con dato clave

DATOS:
{bloque}

Respondé SOLO con un array JSON (sin markdown):
[
  {{
    "categoria": "<key exacta>",
    "categoria_label": "<label>",
    "prediccion": "victoria"|"empate"|"derrota",
    "score_foco": <int>,
    "score_rival": <int>,
    "prob_victoria": <0-100>,
    "prob_empate": <0-100>,
    "prob_derrota": <0-100>,
    "confianza": <0-100>,
    "razon": "<1 oración técnica>",
    "bajada": "<subtítulo periodístico de 10-15 palabras, estilo Olé o TyC Sports>"
  }}
]
"""
    return prompt


def llamar_gemini(prompt, label):
    model = genai.GenerativeModel(GEMINI_MODEL)

    for attempt in range(3):
        try:
            response = model.generate_content(prompt)
            break
        except Exception as e:
            if ("429" in str(e) or "503" in str(e)) and attempt < 2:
                wait = 20 * (attempt + 1)
                print(f"      ⏳ Retry en {wait}s ({attempt+1}/3)...")
                time.sleep(wait)
            else:
                print(f"      ❌ Error: {e}")
                return []

    text = response.text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
    if text.endswith("```"):
        text = text.rsplit("```", 1)[0]
    text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        print(f"      ⚠️ JSON inválido: {e}")
        return []


# ── Main ──────────────────────────────────────────────────
def main():
    print("🔮 Predictor de resultados – Villa Sahores")
    print("=" * 50)

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key and len(sys.argv) > 1:
        api_key = sys.argv[1]
    if not api_key:
        print("❌ Falta GEMINI_API_KEY")
        sys.exit(1)

    genai.configure(api_key=api_key)
    todas = []

    for torneo in TORNEOS:
        print(f"\n🏟️  {torneo['nombre']}")

        data = cargar_datos(torneo["archivo"])
        if not data:
            print("   ⚠️ Archivo no encontrado")
            continue

        equipo_foco = data.get("equipo_foco", EQUIPO_FOCO)
        proximos = proximos_partidos(data, equipo_foco)
        if not proximos:
            print("   ℹ️ Sin próximos partidos")
            continue

        print(f"   📋 {len(proximos)} partidos pendientes (equipo: {equipo_foco})")

        for partido in proximos:
            rival = partido["rival"]
            print(f"   ⚽ F{partido['numero']} vs {rival}...", end=" ", flush=True)

            prompt = armar_prompt_partido(torneo, data, partido, equipo_foco)
            if not prompt:
                print("sin datos")
                continue

            preds = llamar_gemini(prompt, f"F{partido['numero']} vs {rival}")
            if not preds:
                print("❌")
                continue

            # Enriquecer
            for p in preds:
                p["fecha_num"] = partido["numero"]
                p["rival"] = rival
                p["torneo_id"] = torneo["id"]
                p["torneo_nombre"] = torneo["nombre"]
                p["torneo_label"] = torneo["label_corto"]
                p["es_local"] = partido["es_local"]
                p["fecha"] = partido.get("fecha")

            todas.extend(preds)
            wins = sum(1 for p in preds if p.get("prediccion") == "victoria")
            losses = sum(1 for p in preds if p.get("prediccion") == "derrota")
            print(f"✅ {len(preds)} cats ({wins}G/{len(preds)-wins-losses}E/{losses}P)")

            time.sleep(3)  # Pausa entre llamadas

    # Guardar
    output = {
        "actualizado": datetime.utcnow().isoformat() + "Z",
        "equipo_foco": EQUIPO_FOCO,
        "predicciones": todas,
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n{'=' * 50}")
    print(f"✅ Total: {len(todas)} predicciones en {OUTPUT_FILE}")
    v = sum(1 for p in todas if p.get("prediccion") == "victoria")
    d = sum(1 for p in todas if p.get("prediccion") == "derrota")
    e = len(todas) - v - d
    print(f"   🟢 {v} victorias | 🟡 {e} empates | 🔴 {d} derrotas")


if __name__ == "__main__":
    main()
