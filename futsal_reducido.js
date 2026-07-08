// ==========================================
// Futsal Reducido Zona A - Dashboard Villa Sahores
// Matches the root index.html design system
// ==========================================

const FUTSAL_RED_DATA_URL = "data/futsal-reducido-data.json";
const FUTSAL_RED_STORAGE_KEY = "futsal-red-cat-preferida";

let FUTSAL_RED_DATA = null;
let futsalRedCategoriaActual = "general";

// Orden de prioridad de categorías para mostrar
const FUTSAL_RED_CAT_PRIORIDAD = [
  "PRIMERA MASCULINO",
  "TERCERA MASCULINO",
  "CUARTA MASCULINO",
  "QUINTA MASCULINO",
  "SEXTA MASCULINO",
  "SEPTIMA MASCULINO",
  "OCTAVA MASCULINO",
];

// Labels cortos para los botones de categoría
const FUTSAL_RED_CAT_LABELS = {
  "PRIMERA MASCULINO": "1ra",
  "TERCERA MASCULINO": "3ra",
  "CUARTA MASCULINO": "4ta",
  "QUINTA MASCULINO": "5ta",
  "SEXTA MASCULINO": "6ta",
  "SEPTIMA MASCULINO": "7ma",
  "OCTAVA MASCULINO": "8va",
};

// ---- Carga de datos ----
async function initFutsalRed() {
  if (FUTSAL_RED_DATA) return FUTSAL_RED_DATA;

  try {
    const cacheBust = "?v=" + new Date().getTime();
    let res = await fetch(FUTSAL_RED_DATA_URL + cacheBust);
    if (!res.ok) res = await fetch("../data/futsal-reducido-data.json" + cacheBust);
    FUTSAL_RED_DATA = await res.json();
  } catch (err) {
    console.error("Error cargando datos Futsal Reducido:", err);
    return null;
  }

  const guardada = localStorage.getItem(FUTSAL_RED_STORAGE_KEY);
  if (guardada && (guardada === "general" || FUTSAL_RED_DATA.categorias.includes(guardada))) {
    futsalRedCategoriaActual = guardada;
  }

  return FUTSAL_RED_DATA;
}

// ---- Helpers ----
const FUTSAL_RED_ES_FOCO = (eq) => eq === FUTSAL_RED_DATA.equipo_foco;

function futsalRedObtenerTabla(cat) {
  if (!FUTSAL_RED_DATA || !FUTSAL_RED_DATA.tablas_posiciones) return null;
  if (cat === "general") {
    return FUTSAL_RED_DATA.tablas_posiciones.general || null;
  }
  return FUTSAL_RED_DATA.tablas_posiciones[cat] || null;
}

function futsalRedPartidosDelFoco(categoria) {
  const out = [];
  for (const fecha of FUTSAL_RED_DATA.fechas) {
    for (const enc of fecha.encuentros) {
      if (!FUTSAL_RED_ES_FOCO(enc.local) && !FUTSAL_RED_ES_FOCO(enc.visitante)) continue;

      const esLocal = FUTSAL_RED_ES_FOCO(enc.local);
      const rival = esLocal ? enc.visitante : enc.local;

      if (categoria === "general") {
        let gf = 0, gc = 0, jugado = false;
        let out_sede = null, out_dir = null, out_hora = null, out_fecha = null, out_match_id = null;
        for (const cat of FUTSAL_RED_DATA.categorias) {
          const p = enc.partidos[cat];
          if (p) {
            if (p.jugado) {
              jugado = true;
              gf += (esLocal ? p.goles_local : p.goles_visitante) || 0;
              gc += (esLocal ? p.goles_visitante : p.goles_local) || 0;
            }
            if (!out_match_id && p.match_id) {
              out_match_id = p.match_id;
            }
            // Para general, tomamos la sede/hora/fecha del primer partido encontrado, sea jugado o no
            if (!out_sede && p.sede) {
              out_sede = p.sede;
              out_dir = p.direccion;
            }
            if (!out_hora && p.fecha_hora) {
              const fh = p.fecha_hora;
              out_hora = fh.includes(" ") ? fh.split(" ")[1].substring(0, 5) : (fh.includes("T") ? fh.split("T")[1].substring(0, 5) : null);
            }
            if (!out_fecha && p.fecha_hora) {
              const fh = p.fecha_hora;
              out_fecha = fh.includes(" ") ? fh.split(" ")[0] : (fh.includes("T") ? fh.split("T")[0] : null);
            }
          }
        }
        out.push({
          numero: fecha.numero, fecha: out_fecha || fecha.fecha_partido,
          rival, esLocal,
          gf: jugado ? gf : null, gc: jugado ? gc : null,
          jugado, estado: enc.estado,
          sede: out_sede, direccion: out_dir, hora: out_hora,
          match_id: out_match_id
        });
      } else {
        const p = enc.partidos[categoria];
        if (!p) continue;

        // Si el encuentro ya finalizó pero esta categoría no tiene scores,
        // significa que no participó (NP/walkover) — se marca como jugado
        const encuentroFinalizado = enc.estado === "Finalizado";
        const tieneScores = p.jugado;

        let out_fecha = null;
        if (p.fecha_hora) {
          const fh = p.fecha_hora;
          out_fecha = fh.includes(" ") ? fh.split(" ")[0] : (fh.includes("T") ? fh.split("T")[0] : null);
        }

        out.push({
          numero: fecha.numero, fecha: out_fecha || fecha.fecha_partido,
          rival, esLocal,
          gf: esLocal ? p.goles_local : p.goles_visitante,
          gc: esLocal ? p.goles_visitante : p.goles_local,
          jugado: tieneScores || encuentroFinalizado,
          noParticipo: encuentroFinalizado && !tieneScores,
          estado: enc.estado,
          sede: p.sede,
          direccion: p.direccion,
          hora: p.fecha_hora ? (p.fecha_hora.includes(" ") ? p.fecha_hora.split(" ")[1].substring(0, 5) : (p.fecha_hora.includes("T") ? p.fecha_hora.split("T")[1].substring(0, 5) : null)) : null,
          planillas: p.planillas || [] ,
          match_id: p.match_id
        });
      }
    }
  }
  return out;
}

function futsalRedResultadoLetra(p) {
  if (!p.jugado || p.gf == null) return null;
  if (p.gf > p.gc) return "W";
  if (p.gf < p.gc) return "L";
  return "D";
}

// ---- Render header ----
function futsalRedRenderHeader() {
  document.getElementById("updated").textContent =
    "Actualizado: " + new Intl.DateTimeFormat("es-AR", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      timeZone: "America/Argentina/Buenos_Aires"
    }).format(new Date(FUTSAL_RED_DATA.actualizado));
}

// ---- Render selector de categorías ----
function futsalRedRenderCategorySelector() {
  const wrap = document.getElementById("cat-selector");
  const opts = [{ key: "general", label: "General" }];
  FUTSAL_RED_CAT_PRIORIDAD.forEach(c => {
    if (FUTSAL_RED_DATA.categorias.includes(c)) {
      opts.push({ key: c, label: FUTSAL_RED_CAT_LABELS[c] || c });
    }
  });

  wrap.innerHTML = opts.map(o =>
    `<button class="cat-btn ${o.key === futsalRedCategoriaActual ? "active" : ""}"
             data-cat="${o.key}"
             role="tab"
             aria-selected="${o.key === futsalRedCategoriaActual}">
       ${o.label}
     </button>`
  ).join("");

  wrap.querySelectorAll(".cat-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      futsalRedCategoriaActual = btn.dataset.cat;
      localStorage.setItem(FUTSAL_RED_STORAGE_KEY, futsalRedCategoriaActual);

      if (typeof window.trackEvent === "function") {
        window.trackEvent("select_category", { category_id: futsalRedCategoriaActual, sport_id: "futsal-reducido" });
      }
      wrap.querySelectorAll(".cat-btn").forEach(b => {
        const active = b.dataset.cat === futsalRedCategoriaActual;
        b.classList.toggle("active", active);
        b.setAttribute("aria-selected", active);
      });
      futsalRedRender();
    });
  });
}

// ---- Render principal ----
function futsalRedRender() {
  futsalRedRenderProximoPartido();
  futsalRedRenderMetrics();
  futsalRedRenderForma();
  futsalRedRenderTabla();
  futsalRedRenderHistorial();
  futsalRedRenderCalendario();

  // Actualizar estadísticas de goleadores y tarjetas e historial expandible
  actualizarStatsYTablas("Futsal Reducido", futsalRedCategoriaActual, "VILLA SAHORES B (MASC)");

  const tag = futsalRedCategoriaActual === "general"
    ? "Acumulado"
    : FUTSAL_RED_CAT_LABELS[futsalRedCategoriaActual] || futsalRedCategoriaActual;
  document.getElementById("form-cat-tag").textContent = tag;
  document.getElementById("table-cat-tag").textContent = tag;
  document.getElementById("history-cat-tag").textContent = tag;
}

// ---- Próximo partido ----
function futsalRedRenderProximoPartido() {
  const partidos = futsalRedPartidosDelFoco(futsalRedCategoriaActual);
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  const proximo = partidos.find(p => p.fecha && p.fecha >= todayStr) || partidos.find(p => !p.jugado);

  const $teams = document.getElementById("next-match-teams");
  const $meta = document.getElementById("next-match-meta");
  const $date = document.getElementById("next-match-date");
  const $pred = document.getElementById("next-match-prediction");
  const $scouting = document.getElementById("next-match-scouting");

  if (!proximo) {
    $date.textContent = "";
    $teams.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color: var(--text-muted); padding: 20px;">No hay proximos partidos en esta categoria</div>`;
    $meta.innerHTML = "";
    $pred.innerHTML = "";
    if ($scouting) $scouting.innerHTML = "";
    const $actions = document.getElementById("next-match-actions");
    if ($actions) $actions.innerHTML = "";
    return;
  }

  const horaStr = proximo.hora ? ` - ${proximo.hora} hs` : "";
  const fechaStr = proximo.fecha ? fechaCorta(proximo.fecha) : "Pendiente";
  $date.textContent = "Fecha " + proximo.numero + " - " + fechaStr + horaStr;

  const local = proximo.esLocal ? FUTSAL_RED_DATA.equipo_foco : proximo.rival;
  const visit = proximo.esLocal ? proximo.rival : FUTSAL_RED_DATA.equipo_foco;

  $teams.innerHTML = `
    <div class="team-block">
      <div class="team-name ${local === FUTSAL_RED_DATA.equipo_foco ? 'highlight' : ''}">${nombreEquipo(local)}</div>
      <div class="team-condition">Local</div>
    </div>
    <div class="vs-badge">VS</div>
    <div class="team-block">
      <div class="team-name ${visit === FUTSAL_RED_DATA.equipo_foco ? 'highlight' : ''}">${nombreEquipo(visit)}</div>
      <div class="team-condition">Visitante</div>
    </div>
  `;

  if (proximo.sede) {
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(proximo.sede + ' ' + (proximo.direccion || ''))}`;
    $meta.innerHTML = `
      <div class="match-location">
        <span class="location-icon">📍</span>
        <a href="${mapsUrl}" target="_blank" rel="noopener" class="location-link">
          ${proximo.sede}${proximo.direccion ? ' (' + proximo.direccion + ')' : ''}
        </a>
      </div>
    `;
  } else {
    $meta.innerHTML = `<div class="match-location" style="color: var(--text-muted);"><span class="location-icon">⏳</span> Sede pendiente</div>`;
  }

  // Comparativa
  const tabla = futsalRedObtenerTabla(futsalRedCategoriaActual);
  if (tabla) {
    const focoEnTabla = tabla.find(t => t.equipo === FUTSAL_RED_DATA.equipo_foco);
    const rivalEnTabla = tabla.find(t => t.equipo === proximo.rival);
    if (focoEnTabla && rivalEnTabla) {
      const tipo = futsalRedCategoriaActual === "general" ? "general" : FUTSAL_RED_CAT_LABELS[futsalRedCategoriaActual] || futsalRedCategoriaActual;
      $pred.innerHTML = `<strong>Comparativa ${tipo}:</strong> ${nombreEquipo(FUTSAL_RED_DATA.equipo_foco)} ${focoEnTabla.posicion}° (${focoEnTabla.pts} pts) vs ${nombreEquipo(proximo.rival)} ${rivalEnTabla.posicion}° (${rivalEnTabla.pts} pts)`;
    } else {
      $pred.innerHTML = "";
    }
  } else {
    $pred.innerHTML = "";
  }

  // Scouting del rival
  renderScoutingSection($scouting, "futsal-reducido", proximo.rival, futsalRedCategoriaActual);

  // Botón para compartir partido
  renderizarBotonCompartir("futsal-reducido", proximo.numero, proximo.rival);
}

// ---- Métricas ----
function futsalRedRenderMetrics() {
  const tabla = futsalRedObtenerTabla(futsalRedCategoriaActual);
  const $m = document.getElementById("metrics");

  if (!tabla) { $m.innerHTML = ""; return; }

  const foco = tabla.find(t => t.equipo === FUTSAL_RED_DATA.equipo_foco);
  if (!foco) { $m.innerHTML = ""; return; }

  const efectividad = foco.pj > 0 ? Math.round(100 * foco.g / foco.pj) : 0;
  const dif = foco.gf - foco.gc;
  const difClass = dif > 0 ? "positive" : (dif < 0 ? "negative" : "");
  const difStr = dif > 0 ? `+${dif}` : String(dif);

  $m.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Posicion</div>
      <div class="stat-value">${foco.posicion}<span class="stat-sub">/ ${tabla.length}</span></div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Puntos</div>
      <div class="stat-value">${foco.pts}<span class="stat-sub">pts</span></div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Efectividad</div>
      <div class="stat-value">${efectividad}<span class="stat-sub">%</span></div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Diferencia</div>
      <div class="stat-value ${difClass}">${difStr}</div>
    </div>
  `;
}

// ---- Forma reciente ----
function futsalRedRenderForma() {
  const partidos = futsalRedPartidosDelFoco(futsalRedCategoriaActual)
    .filter(p => p.jugado)
    .slice(-5);

  const $row = document.getElementById("form-row");
  if (partidos.length === 0) {
    $row.innerHTML = '<div class="form-empty">Aun no hay partidos jugados en esta categoria</div>';
    return;
  }

  $row.innerHTML = partidos.map(p => {
    const r = futsalRedResultadoLetra(p);
    if (!r) return "";
    const label = r === "W" ? "G" : (r === "L" ? "P" : "E");
    return `<span class="form-pill ${r}" title="vs ${nombreEquipo(p.rival)}: ${p.gf}-${p.gc}">${label}</span>`;
  }).join("");
}

// ---- Tabla de posiciones ----
function futsalRedRenderTabla() {
  const tabla = futsalRedObtenerTabla(futsalRedCategoriaActual);
  const $t = document.getElementById("standings");
  if (!tabla) { $t.innerHTML = ""; return; }

  $t.innerHTML = `
    <thead>
      <tr>
        <th class="pos">#</th>
        <th>Equipo</th>
        <th class="center">PJ</th>
        <th class="center">G</th>
        <th class="center">E</th>
        <th class="center">P</th>
        <th class="center hide-mobile">GF</th>
        <th class="center hide-mobile">GC</th>
        <th class="center">Pts</th>
      </tr>
    </thead>
    <tbody>
      ${tabla.map(t => `
        <tr class="${t.equipo === FUTSAL_RED_DATA.equipo_foco ? 'highlight' : ''}">
          <td class="pos">${t.posicion}</td>
          <td><span class="team-col">${nombreEquipo(t.equipo)}</span></td>
          <td class="center">${t.pj}</td>
          <td class="center">${t.g}</td>
          <td class="center">${t.e}</td>
          <td class="center">${t.p}</td>
          <td class="center hide-mobile">${t.gf}</td>
          <td class="center hide-mobile">${t.gc}</td>
          <td class="center pts">${t.pts}</td>
        </tr>
      `).join('')}
    </tbody>
  `;
}

// ---- Historial ----
function futsalRedRenderHistorial() {
  const partidos = futsalRedPartidosDelFoco(futsalRedCategoriaActual).filter(p => p.jugado);
  const $list = document.getElementById("history-list");

  if (partidos.length === 0) {
    $list.innerHTML = '<div class="form-empty">Aun no hay partidos jugados</div>';
    return;
  }

  $list.innerHTML = partidos.slice().reverse().map(p => {
    if (p.noParticipo) {
      return `
        <div class="history-item" style="opacity: 0.5">
          <span class="history-result" style="background: var(--bg-alt); color: var(--text-muted)">NP</span>
          <div class="history-rival">
            <span class="history-rival-name">${nombreEquipo(p.rival)}</span>
            <span class="history-rival-meta">F${p.numero} - No participó</span>
          </div>
          <span class="history-score">-</span>
        </div>
      `;
    }
    const r = futsalRedResultadoLetra(p);
    if (!r) return "";
    const label = r === "W" ? "G" : (r === "L" ? "P" : "E");

    const fichaHtml = p.match_id ? `
      <div class="history-ficha-btns">
        <a href="match.html?id=${p.match_id}" class="btn-ver-ficha" title="Ver ficha completa">
          📋 Ficha
        </a>
      </div>
    ` : "";

    return `
      <div class="history-item">
        <span class="history-result ${r}">${label}</span>
        <div class="history-rival">
          <span class="history-rival-name">${nombreEquipo(p.rival)}</span>
          <span class="history-rival-meta">F${p.numero} - ${p.esLocal ? 'Local' : 'Visitante'}</span>
        </div>
        <span class="history-score">${p.gf} - ${p.gc}</span>
        ${fichaHtml}
      </div>
    `;
  }).join('');
}

// ---- Calendario ----
function futsalRedRenderCalendario() {
  const partidos = futsalRedPartidosDelFoco(futsalRedCategoriaActual);
  const $list = document.getElementById("schedule");

  $list.innerHTML = partidos.map(p => {
    const horaStr = p.hora ? ` @ ${p.hora}` : "";
    let sedeStr = p.sede ? `<div class="schedule-venue">${p.sede}</div>` : "";
    
    if (!p.jugado && !p.sede && !p.hora) {
      sedeStr = `<div class="schedule-venue" style="color: var(--text-muted);">Pendiente</div>`;
    }
    
    return `
      <div class="schedule-item ${p.jugado ? 'played' : ''}">
        <span class="schedule-num">F${p.numero}</span>
        <div class="schedule-info">
          <span class="schedule-rival">
            vs ${nombreEquipo(p.rival)}
            <span class="schedule-condition">${p.esLocal ? '(L)' : '(V)'}${p.noParticipo ? ' - NP' : ''}${horaStr}</span>
          </span>
          ${sedeStr}
        </div>
        <span class="schedule-date">${fechaCorta(p.fecha)}</span>
      </div>
    `;
  }).join('');
}

// ---- Activar futsal reducido ----
async function activarFutsalReducido() {
  const data = await initFutsalRed();
  if (!data) {
    document.querySelector("main").innerHTML =
      `<div class="loading">No se pudieron cargar los datos de Futsal Reducido. Reintenta en unos minutos.</div>`;
    return;
  }
  await cargarFutsalStats(); // Cargar estadísticas en segundo plano (o localmente)
  futsalRedRenderHeader();
  futsalRedRenderCategorySelector();
  futsalRedRender();
}
