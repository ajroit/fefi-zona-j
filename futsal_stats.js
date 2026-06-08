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

// Configurar elementos expandibles en el historial de partidos
function configurarHistorialExpandible(torneoNombre, categoriaActual) {
  if (!FUTSAL_STATS) return;

  const items = document.querySelectorAll("#history-list .history-item");
  items.forEach(item => {
    // Evitar duplicar listeners
    if (item.classList.contains("has-stats-expander")) return;

    const rivalNameNode = item.querySelector(".history-rival-name");
    const metaNode = item.querySelector(".history-rival-meta");
    if (!rivalNameNode || !metaNode) return;

    const metaText = metaNode.textContent.trim();
    if (metaText.includes("No participó")) return;

    // Obtener número de fecha
    const matchFecha = metaText.match(/F(\d+)/);
    if (!matchFecha) return;
    const fechaNum = parseInt(matchFecha[1]);

    // Buscar si existen detalles de este partido
    const matchesList = [];
    for (const id in FUTSAL_STATS.partidos_detalles) {
      const m = FUTSAL_STATS.partidos_detalles[id];
      if (m.torneo === torneoNombre && m.fecha_num === fechaNum) {
        if (categoriaActual === "general" || m.categoria === categoriaActual) {
          matchesList.push(m);
        }
      }
    }

    if (matchesList.length === 0) return;

    // Marcar como clickeable y añadir clase
    item.classList.add("clickable-history", "has-stats-expander");

    // Crear container de detalles
    const detailsDiv = document.createElement("div");
    detailsDiv.className = "history-details";

    let detailsHtml = "";
    matchesList.forEach(m => {
      const catLabel = STATS_CAT_LABELS[m.categoria] || m.categoria;

      // 1. Árbitros
      let refHtml = "";
      if (m.referees && m.referees.length > 0) {
        refHtml = `
          <div class="hist-detail-sec referee-sec">
            <span class="hist-detail-label">🧑‍⚖️ Árbitro:</span>
            <div class="referee-flex">
              ${m.referees.map(r => `
                <div class="referee-badge-item" title="ID: ${r.id}">
                  ${r.foto ? `<img src="${r.foto}" class="ref-photo" alt="${r.nombre_completo}">` : '<span class="ref-photo-placeholder">🏁</span>'}
                  <span class="ref-name">${r.nombre_completo}</span>
                </div>
              `).join("")}
            </div>
          </div>
        `;
      }

      // 2. Goles Villa Sahores
      const sahoresGoals = (m.goles || []).filter(g => g.equipo.toUpperCase().includes("VILLA SAHORES"));
      let goalsHtml = "";
      if (sahoresGoals.length > 0) {
        goalsHtml = `
          <div class="hist-detail-sec goals-sec">
            <span class="hist-detail-label">⚽ Goles:</span>
            <span class="hist-detail-text">
              ${sahoresGoals.map(g => `<strong>${g.nombre_completo}</strong>${g.cantidad > 1 ? ` (x${g.cantidad})` : ''}`).join(", ")}
            </span>
          </div>
        `;
      }

      // 3. Tarjetas Villa Sahores
      const sahoresCards = (m.tarjetas || []).filter(c => c.equipo.toUpperCase().includes("VILLA SAHORES"));
      let cardsHtml = "";
      if (sahoresCards.length > 0) {
        cardsHtml = `
          <div class="hist-detail-sec cards-sec">
            <span class="hist-detail-label">🟨 Tarjetas:</span>
            <span class="hist-detail-text">
              ${sahoresCards.map(c => {
                let colorBadge = "🟨";
                if (c.tipo === "roja") colorBadge = "🟥";
                else if (c.tipo === "doble_amarilla") colorBadge = "🟨🟨";
                return `<strong>${c.nombre_completo}</strong> (${colorBadge})`;
              }).join(", ")}
            </span>
          </div>
        `;
      }

      const showCatTag = categoriaActual === "general";
      detailsHtml += `
        <div class="match-detail-row">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; flex-wrap: wrap; gap: 6px;">
            ${showCatTag ? `<div class="detail-cat-badge">${catLabel}</div>` : "<div></div>"}
            <a href="match.html?id=${Number(m.match_id).toString(16)}" class="btn-planilla" style="font-size: 10px; padding: 3px 6px;" title="Ver ficha completa y compartir">
              🔗 Ver Ficha
            </a>
          </div>
          <div class="detail-columns">
            ${refHtml}
            ${goalsHtml}
            ${cardsHtml}
            ${!refHtml && !goalsHtml && !cardsHtml ? '<div class="details-empty-msg">No se registraron incidencias en planilla.</div>' : ''}
          </div>
        </div>
      `;
    });

    detailsDiv.innerHTML = detailsHtml;
    item.appendChild(detailsDiv);

    // Toggle al hacer click
    item.addEventListener("click", (e) => {
      // Si hace click en ver planilla (el link), no colapsar/expandir
      if (e.target.closest(".btn-planilla")) return;

      const wasExpanded = item.classList.contains("expanded");

      // Cerrar los otros
      document.querySelectorAll("#history-list .history-item.expanded").forEach(el => {
        if (el !== item) el.classList.remove("expanded");
      });

      item.classList.toggle("expanded", !wasExpanded);
    });
  });
}
