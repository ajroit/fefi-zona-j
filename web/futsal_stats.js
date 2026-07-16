// ==========================================================
// Futsal Statistics & Leaderboard - Villa Sahores
// Exposes functions to load and render scraped match stats.
// ==========================================================

let FUTSAL_STATS = null;

// Short labels mapping (synced with futsal.js)
const STATS_CAT_LABELS = {
  "PRIMERA MASCULINO": "1ra",
  "TERCERA MASCULINO": "3ra",
  "CUARTA MASCULINO": "4ta",
  "QUINTA MASCULINO": "5ta",
  "SEXTA MASCULINO": "6ta",
  "SEPTIMA MASCULINO": "7ma",
  "OCTAVA MASCULINO": "8va",
  "2016 PROMOCIONALES": "2016",
  "2017 PROMOCIONALES": "2017",
  "2018 PROMOCIONALES": "2018",
  "2019 PROMOCIONALES": "2019",
  "PRIMERA ADULTAS FEMENINO ": "1ra",
  "RESERVA ADULTAS FEMENINO ": "Reserva",
  "UNICA ADULTAS FEMENINO ": "Unica"
};

// Cargar estadísticas
async function cargarFutsalStats() {
  if (FUTSAL_STATS) return FUTSAL_STATS;
  try {
    const cacheBust = "?v=" + new Date().getTime();
    let res = await fetch("data/futsal-stats.json" + cacheBust);
    if (!res.ok) res = await fetch("../data/futsal-stats.json" + cacheBust);
    FUTSAL_STATS = await res.json();
    console.log("📊 Futsal stats loaded successfully.");
  } catch (err) {
    console.warn("⚠️ No se pudieron cargar las estadísticas de Futsal:", err);
  }
  return FUTSAL_STATS;
}

// Renderizar tabla de goleadores y tarjetas
function actualizarStatsYTablas(torneoNombre, categoriaActual, focusTeamName) {
  const container = document.getElementById("futsal-stats-card");
  const table = document.getElementById("futsal-stats-table");
  const catTag = document.getElementById("futsal-stats-cat-tag");

  if (!container || !table) return;

  if (!FUTSAL_STATS) {
    container.style.display = "none";
    return;
  }

  container.style.display = "block";
  catTag.textContent = categoriaActual === "general" ? "Acumulado" : (STATS_CAT_LABELS[categoriaActual] || categoriaActual);

  let players = [];

  if (categoriaActual === "general") {
    // Agrupar y sumar goleadores de todas las categorías correspondientes a este equipo (focusTeamName)
    const aggregated = {};
    for (const cat in FUTSAL_STATS.goleadores) {
      const catPlayers = FUTSAL_STATS.goleadores[cat];
      for (const p of catPlayers) {
        if (p.equipo === focusTeamName) {
          const key = p.jugador_id;
          if (!aggregated[key]) {
            aggregated[key] = {
              nombre: p.nombre,
              apellido: p.apellido,
              equipo: p.equipo,
              goles: 0,
              amarillas: 0,
              rojas: 0,
              doble_amarilla: 0,
              categorias: new Set()
            };
          }
          aggregated[key].goles += p.goles || 0;
          aggregated[key].amarillas += p.amarillas || 0;
          aggregated[key].rojas += p.rojas || 0;
          aggregated[key].doble_amarilla += p.doble_amarilla || 0;
          aggregated[key].categorias.add(STATS_CAT_LABELS[cat] || cat);
        }
      }
    }

    players = Object.values(aggregated).map(p => {
      p.categoriasStr = Array.from(p.categorias).join(", ");
      return p;
    });
  } else {
    // Categoría específica
    const catPlayers = FUTSAL_STATS.goleadores[categoriaActual] || [];
    players = catPlayers.filter(p => p.equipo === focusTeamName);
  }

  // Ordenar: Goles desc -> Amarillas desc -> Rojas desc
  players.sort((a, b) => {
    if (b.goles !== a.goles) return b.goles - a.goles;
    if (b.amarillas !== a.amarillas) return b.amarillas - a.amarillas;
    return b.rojas - a.rojas;
  });

  // Limitar a los mejores 15 en vista general para no saturar la UI
  if (categoriaActual === "general" && players.length > 15) {
    players = players.slice(0, 15);
  }

  if (players.length === 0) {
    table.innerHTML = `
      <tbody>
        <tr>
          <td colspan="6" class="form-empty">No hay estadísticas registradas para esta categoría</td>
        </tr>
      </tbody>
    `;
    return;
  }

  const isGeneral = categoriaActual === "general";
  const headers = `
    <thead>
      <tr>
        <th class="pos">#</th>
        <th>Jugador</th>
        ${isGeneral ? '<th class="hide-mobile" style="text-align: left;">Categoría</th>' : ''}
        <th class="center">⚽ Goles</th>
        <th class="center">🟨 Tarjetas</th>
        <th class="center">🟥 Rojas</th>
        <th class="center hide-mobile">🟨🟨 Doble</th>
      </tr>
    </thead>
  `;

  const rows = players.map((p, idx) => {
    const doubleYellow = p.doble_amarilla || 0;
    return `
      <tr>
        <td class="pos">${idx + 1}</td>
        <td>
          <span style="font-weight: 600; text-transform: capitalize;">
            ${p.nombre.toLowerCase()} ${p.apellido.toLowerCase()}
          </span>
        </td>
        ${isGeneral ? `<td class="hide-mobile"><span class="card-tag" style="font-size:10px;">${p.categoriasStr}</span></td>` : ''}
        <td class="center" style="font-weight: 700; color: var(--brand-green-light);">${p.goles}</td>
        <td class="center" style="color: var(--warning);">${p.amarillas || '-'}</td>
        <td class="center" style="color: var(--danger); font-weight: 600;">${p.rojas || '-'}</td>
        <td class="center hide-mobile" style="color: #f39c12;">${doubleYellow || '-'}</td>
      </tr>
    `;
  }).join("");

  table.innerHTML = headers + "<tbody>" + rows + "</tbody>";
}

