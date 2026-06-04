import json
import os
import socket
import urllib3.util.connection as connection

# Force IPv4 to avoid Network is unreachable errors in environments without IPv6 routing (like GitHub Actions)
connection.allowed_gai_family = lambda: socket.AF_INET

import requests

TELEGRAM_TOKEN = os.environ.get('TELEGRAM_TOKEN')
TELEGRAM_CHAT_ID = os.environ.get('TELEGRAM_CHAT_ID')

def get_sahores_match(data):
    # Find the next unplayed match for VILLA SAHORES
    for fecha in data.get('fechas', []):
        for enc in fecha.get('encuentros', []):
            if 'VILLA SAHORES' in (enc.get('local', ''), enc.get('visitante', '')):
                # Check if it's played
                jugado = enc.get('estado') == 'Finalizado' or any(
                    p.get('jugado') for p in enc.get('partidos', {}).values()
                )
                if not jugado:
                    return enc
    return None

def process_league(name, old_file, new_file):
    try:
        with open(old_file, 'r') as f:
            old_data = json.load(f)
    except Exception as e:
        print(f"Could not load old data for {name}:", e)
        return

    try:
        with open(new_file, 'r') as f:
            new_data = json.load(f)
    except Exception as e:
        print(f"Could not load new data for {name}:", e)
        return

    old_match = get_sahores_match(old_data)
    new_match = get_sahores_match(new_data)

    if not old_match or not new_match:
        print(f"[{name}] Could not find upcoming match.")
        return

    # Check if they refer to the same match
    if old_match.get('local') != new_match.get('local') or old_match.get('visitante') != new_match.get('visitante'):
        print(f"[{name}] Next match changed entirely, not evaluating schedule updates.")
        return

    # Check if it was pending and now it has data
    # "Pendiente" can mean enc['estado'] == 'Pendiente' or the categories missing fecha_hora/sede
    
    # We will look for any category that went from having NO fecha_hora to having fecha_hora
    newly_scheduled = {}
    for cat, new_p in new_match.get('partidos', {}).items():
        old_p = old_match.get('partidos', {}).get(cat, {})
        
        # Check if old didn't have fecha_hora, but new does
        if not old_p.get('fecha_hora') and new_p.get('fecha_hora'):
            newly_scheduled[cat] = new_p

    # If any category got scheduled, or if the encounter status changed from Pendiente to Programado
    if newly_scheduled or (old_match.get('estado') == 'Pendiente' and new_match.get('estado') != 'Pendiente'):
        
        # Build message
        local = new_match.get('local')
        visitante = new_match.get('visitante')
        msg = f"⚽ ¡Ya están los horarios y días para {name}!\n\n**{local} vs {visitante}**\n\nSegún el siguiente detalle:\n"
        
        for cat, p in new_match.get('partidos', {}).items():
            if p.get('fecha_hora') or p.get('sede'):
                fecha_hora = p.get('fecha_hora')
                if fecha_hora:
                    if "T" in fecha_hora:
                        date_part, time_part = fecha_hora.split("T")
                        time_part = time_part[:5]
                    else:
                        date_part, time_part = fecha_hora.split(" ")
                        time_part = time_part[:5]
                    y, m, d = date_part.split("-")
                    fecha_str = f"{d}/{m}/{y} a las {time_part} hs"
                else:
                    fecha_str = 'Pendiente'

                sede = p.get('sede')
                direccion = p.get('direccion')
                sede_str = sede if sede else 'Pendiente'
                if direccion:
                    sede_str += f" ({direccion})"

                msg += f"🔸 **{cat}**: {fecha_str} en {sede_str}\n"
                
        # Send message
        url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
        payload = {
            "chat_id": TELEGRAM_CHAT_ID,
            "text": msg,
            "parse_mode": "Markdown"
        }
        res = requests.post(url, json=payload)
        print(f"[{name}] Telegram API response:", res.status_code, res.text)
    else:
        print(f"[{name}] No new schedule updates detected.")

def main():
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        print("Telegram credentials not found.")
        return

    leagues = [
        ("Futsal (Liga de Honor)", "/tmp/futsal-data-old.json", "data/futsal-data.json"),
        ("Futsal Femenino (Elite 1)", "/tmp/futsal-femenino-data-old.json", "data/futsal-femenino-data.json")
    ]

    for name, old_file, new_file in leagues:
        process_league(name, old_file, new_file)

if __name__ == '__main__':
    main()
