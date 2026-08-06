#!/usr/bin/env python3
"""
Selección de fase vigente para los torneos de Weball.

PROBLEMA QUE RESUELVE
---------------------
Los scrapers hacían `fase = fases[0]`, es decir, siempre la PRIMERA fase que
devuelve la API. Cuando el torneo pasó de Apertura a Clausura, la lista pasó a
tener dos fases y el scraper se quedó clavado en la Apertura para siempre:
seguía bajando un fixture terminado, escribía el mismo JSON con solo el
timestamp cambiado, y el dashboard nunca mostraba nada nuevo.

CÓMO ELIGE
----------
1. Override manual por variable de entorno (ej: FUTSAL_PHASE_ID=1402).
   Es el escape hatch: si la heurística falla, pineás el ID y listo.
2. Alguna marca de "activa" en el objeto de la fase (active / isActive /
   current / status), probando varios nombres de campo porque la API no está
   documentada.
3. La fecha de inicio más reciente que ya haya pasado.
4. Último recurso: la ÚLTIMA fase de la lista (Apertura → Clausura suele venir
   en orden cronológico), que es lo contrario de lo que hacía antes.
"""
import os
from datetime import datetime, timezone

FLAGS_ACTIVA = ("active", "isActive", "current", "isCurrent", "enabled")
CAMPOS_INICIO = ("startDate", "start_date", "dateFrom", "startsAt", "createdAt")


def _parse_fecha(valor):
    if not valor or not isinstance(valor, str):
        return None
    txt = valor.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(txt)
    except ValueError:
        try:
            dt = datetime.strptime(valor[:10], "%Y-%m-%d")
        except ValueError:
            return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def elegir_fase(fases, env_var=None, etiqueta="torneo"):
    """Devuelve (fase, motivo). `fases` es la lista cruda de la API."""
    if not fases:
        return None, "sin fases"

    # 1. Override manual
    if env_var:
        forzado = os.environ.get(env_var, "").strip()
        if forzado:
            for f in fases:
                if str(f.get("id")) == forzado:
                    return f, f"forzada por {env_var}={forzado}"
            print(f"⚠️  {env_var}={forzado} no coincide con ninguna fase; sigo con la heurística")

    # 2. Marca de activa
    for campo in FLAGS_ACTIVA:
        activas = [f for f in fases if f.get(campo) is True]
        if len(activas) == 1:
            return activas[0], f"marcada como activa ({campo})"
        if len(activas) > 1:
            return activas[-1], f"varias activas ({campo}), tomo la última"

    activas = [f for f in fases if str(f.get("status", "")).lower() in ("active", "in_progress", "open")]
    if activas:
        return activas[-1], "status activo"

    # 3. Inicio más reciente ya empezado
    ahora = datetime.now(timezone.utc)
    candidatas = []
    for f in fases:
        for campo in CAMPOS_INICIO:
            dt = _parse_fecha(f.get(campo))
            if dt:
                candidatas.append((dt, f, campo))
                break
    empezadas = [c for c in candidatas if c[0] <= ahora]
    if empezadas:
        dt, fase, campo = max(empezadas, key=lambda c: c[0])
        return fase, f"inicio más reciente ({campo}={dt.date()})"

    # 4. La última de la lista
    return fases[-1], "última de la lista (heurística por defecto)"


def resumen_fases(fases):
    """Metadata para guardar en el JSON de salida y poder auditar la elección."""
    salida = []
    for f in fases:
        salida.append({
            k: v for k, v in f.items()
            if k in ("id", "name", "status", "order", "position") + FLAGS_ACTIVA + CAMPOS_INICIO
        })
    return salida
