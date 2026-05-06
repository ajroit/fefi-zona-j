# FEFI Zona J — Dashboard Club Sahores

Dashboard automatizado para seguir al Club Sahores en el Torneo Anual FEFI Baby Fútbol 2026 (Zona J).

Todo corre en GitHub: scrapeo automático semanal, almacenamiento en JSON versionado, y publicación gratuita en GitHub Pages.

## ¿Qué hace?

- 🤖 **Cada domingo a la madrugada**, un bot de GitHub Actions visita la página de FEFI, extrae los datos actualizados de la zona J y los guarda en `data/fefi-data.json`.
- 🌐 **El dashboard** (HTML/CSS/JS estático) lee ese JSON y muestra próximo partido, tabla, historial y forma reciente.
- 🔄 **Todo se redeplea solo** cuando el JSON cambia.

## Estructura del repo

```
fefi-zona-j/
├── .github/workflows/
│   ├── scrape.yml           # Scraper semanal (cron domingo 02:30 UTC)
│   └── deploy.yml           # Publicación a GitHub Pages
├── scraper/
│   ├── scraper_fefi.py      # Scraper Python
│   └── requirements.txt
├── web/
│   ├── index.html           # Dashboard
│   ├── styles.css
│   └── app.js
├── data/
│   └── fefi-data.json       # Generado por el scraper
└── README.md
```

## Implementación paso a paso

### 1. Crear el repo en GitHub

1. Andá a [github.com/new](https://github.com/new) y creá un repo **público** (necesario para que GitHub Pages funcione gratis).
   - Nombre sugerido: `fefi-zona-j`
   - No agregues README, .gitignore ni licencia desde GitHub (los vamos a tener acá).
2. En tu computadora, cloná y subí los archivos:
   ```bash
   git clone https://github.com/TU_USUARIO/fefi-zona-j.git
   cd fefi-zona-j
   # Copiar todos los archivos descargados a esta carpeta, manteniendo las subcarpetas
   git add .
   git commit -m "Setup inicial"
   git push origin main
   ```

### 2. Habilitar permisos de Actions

GitHub Actions necesita permiso para escribir en el repo (para commitear el JSON actualizado).

1. En tu repo: **Settings → Actions → General**.
2. Bajá hasta "Workflow permissions".
3. Marcá **"Read and write permissions"** y **"Allow GitHub Actions to create and approve pull requests"**.
4. **Save**.

### 3. Habilitar GitHub Pages

1. **Settings → Pages**.
2. En "Source", elegí **"GitHub Actions"** (no "Deploy from a branch").
3. Listo, no hace falta más.

### 4. Disparar el primer scrape

1. Andá a la pestaña **Actions**.
2. En la izquierda, seleccioná **"Scrape FEFI Zona J"**.
3. Botón **"Run workflow"** → **"Run workflow"** (verde).
4. Esperá ~1 minuto. Si todo va bien, se actualiza `data/fefi-data.json` y eso dispara el workflow de deploy automáticamente.

### 5. Ver el dashboard

Una vez completado el deploy (otro minuto), tu dashboard está en:

```
https://TU_USUARIO.github.io/fefi-zona-j/
```

El link exacto aparece en **Settings → Pages** una vez deplegado.

## Operación normal

- El scraper corre solo todos los domingos a las 23:30 hora Argentina.
- Si no hay cambios en los datos (porque la página de FEFI todavía no se actualizó), no se hace ningún commit ni redeploy.
- Si querés forzar una corrida (porque viste que ya cargaron resultados), volvé a Actions → Run workflow.

## Cambiar de Apertura a Clausura

Cuando arranque la segunda rueda del torneo, editá `scraper/scraper_fefi.py`:

```python
TORNEO_ACTUAL = "clausura"
```

Hacé commit, push, y a partir de la próxima corrida se carga la rueda nueva. Los datos del Apertura quedan en el historial de Git (cada commit es un snapshot).

## Probar localmente

Si querés modificar el dashboard antes de subir:

```bash
# Desde la raíz del repo
python3 -m http.server 8000
```

Después abrí `http://localhost:8000/web/` en el navegador. El JS está preparado para encontrar el JSON tanto en local como en producción.

## Personalizar

**Cambiar de equipo o zona:** Editá las constantes al principio de `scraper/scraper_fefi.py`:
```python
URL = "https://fefi.com.ar/2026-torneo-anual-baby-futbol/{otra_zona}/"
ZONA = "..."
EQUIPO_FOCO = "TU CLUB"
```

**Cambiar colores:** Editá las variables CSS en `web/styles.css` (sección `:root` y `@media (prefers-color-scheme: dark)`).

## Costos

Todo es **gratis**:
- GitHub Actions free: 2000 min/mes en privados, ilimitado en públicos. Este repo usa ~5 min/mes.
- GitHub Pages: ilimitado en repos públicos.
- Sin Supabase, sin Vercel, sin servidores externos.

## Troubleshooting

**El scraper falla con error 403:**
La página de FEFI bloquea requests sin headers de navegador. El script ya manda los headers correctos, pero si cambia la protección de FEFI puede haber que ajustar `HEADERS` en el scraper.

**El dashboard muestra "No se pudieron cargar los datos":**
Significa que `data/fefi-data.json` no existe o no está accesible. Revisá que el scraper haya corrido al menos una vez (Actions → Scrape FEFI Zona J → ver última ejecución).

**El cambio en el código no se ve reflejado:**
Después de hacer push, esperá 1-2 minutos a que termine el workflow de deploy. Si el botón "Run workflow" no aparece para "Deploy a GitHub Pages", asegurate de tener la configuración del paso 3.

## Próximos pasos posibles

- Sumar los datos de 2025 (misma estructura, otra URL) para tener más historial.
- Notificación push los sábados a la noche cuando se cargan los resultados (vía service worker).
- Modo "todas las categorías" mostrando los 7 partidos del sábado en una sola vista.
