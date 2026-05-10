// ==========================================
// Club Villa Sahores - Dashboard Deportivo
// Orquestador Baby Fútbol + Futsal
// ==========================================

const DATA_URL = "data/fefi-data.json";
const PREDICTIONS_DATA_URL = "data/predictions.json";
const CATEGORIAS_ORDEN = [2013, 2014, 2015, 2016, 2017, 2018, 2019];
const STORAGE_KEY = "fefi-cat-preferida";
const SPORT_STORAGE_KEY = "deporte-preferido";

let DATA = null;
let categoriaActual = "general";
let deporteActual = "babyfutbol";
let PREDICTIONS_CACHE = null;

// ---- Carga inicial ----
async function init() {
  // Recuperar deporte preferido
  const savedSport = localStorage.getItem(SPORT_STORAGE_KEY);
  if (savedSport && (savedSport === "babyfutbol" || savedSport === "futsal" || savedSport === "futsal-reducido")) {
    deporteActual = savedSport;
  }

  // Configurar sport selector
  setupSportSelector();

  // Cargar el deporte actual
  if (deporteActual === "futsal") {
    await switchToFutsal();
  } else if (deporteActual === "futsal-reducido") {
    await switchToFutsalReducido();
  } else {
    await switchToBabyFutbol();
  }
}

// ---- Sport selector ----
function setupSportSelector() {
  document.querySelectorAll(".sport-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const sport = btn.dataset.sport;
      if (sport === deporteActual) return;

      deporteActual = sport;
      localStorage.setItem(SPORT_STORAGE_KEY, sport);

      // Actualizar botones
      document.querySelectorAll(".sport-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.sport === sport);
      });

      if (sport === "futsal") {
        await switchToFutsal();
      } else if (sport === "futsal-reducido") {
        await switchToFutsalReducido();
      } else {
        await switchToBabyFutbol();
      }
    });
  });

  // Actualizar estado visual inicial
  document.querySelectorAll(".sport-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.sport === deporteActual);
  });
}

// ---- Cambio a Baby Fútbol ----
async function switchToBabyFutbol() {
  // Actualizar hero
  document.getElementById("hero-subtitle").textContent = "Club Social y Deportivo - Desde 1931";
  document.getElementById("badge-label").textContent = "Torneo FEFI 2026";
  document.getElementById("badge-zona").textContent = "Zona J";

  // Actualizar footer
  document.getElementById("footer-credits").innerHTML =
    'Datos de <a href="https://fefi.com.ar/2026-torneo-anual-baby-futbol/j/" target="_blank" rel="noopener">fefi.com.ar</a>';

  // Cargar datos si no están
  if (!DATA) {
    try {
      let res = await fetch(DATA_URL);
      if (!res.ok) res = await fetch("../data/fefi-data.json");
      DATA = await res.json();
    } catch (err) {
      document.querySelector("main").innerHTML =
        `<div class="loading">No se pudieron cargar los datos. Reintenta en unos minutos.</div>`;
      console.error(err);
      return;
    }
  }

  const guardada = localStorage.getItem(STORAGE_KEY);
  if (guardada && (guardada === "general" || CATEGORIAS_ORDEN.includes(Number(guardada)))) {
    categoriaActual = guardada;
  }

  renderHeader();
  renderCategorySelector();
  render();
}

// ---- Cambio a Futsal ----
async function switchToFutsal() {
  // Actualizar hero
  document.getElementById("hero-subtitle").textContent = "Futsal - Liga de Honor B";
  document.getElementById("badge-label").textContent = "Torneo Joma 2026";
  document.getElementById("badge-zona").textContent = "Zona 1";

  // Actualizar footer
  document.getElementById("footer-credits").innerHTML =
    'Datos de <a href="https://futsala.ar" target="_blank" rel="noopener">futsala.ar</a>';

  await activarFutsal();
}

// ---- Cambio a Futsal Reducido ----
async function switchToFutsalReducido() {
  // Actualizar hero
  document.getElementById("hero-subtitle").textContent = "Futsal - Reducido";
  document.getElementById("badge-label").textContent = "Torneo Joma 2026";
  document.getElementById("badge-zona").textContent = "Zona A";

  // Actualizar footer
  document.getElementById("footer-credits").innerHTML =
    'Datos de <a href="https://futsala.ar" target="_blank" rel="noopener">futsala.ar</a>';

  await activarFutsalReducido();
}

// =============================================
// FEFI Baby Fútbol – funciones originales
// =============================================

function renderHeader() {
  const updated = new Date(DATA.actualizado);
  const formatter = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires"
  });
  document.getElementById("updated").textContent =
    "Actualizado: " + formatter.format(updated);
}

function renderCategorySelector() {
  const wrap = document.getElementById("cat-selector");
  const opts = [{ key: "general", label: "General" }];
  CATEGORIAS_ORDEN.forEach(c => opts.push({ key: String(c), label: String(c) }));

  wrap.innerHTML = opts.map(o =>
    `<button class="cat-btn ${o.key === String(categoriaActual) ? "active" : ""}"
             data-cat="${o.key}"
             role="tab"
             aria-selected="${o.key === String(categoriaActual)}">
       ${o.label}
     </button>`
  ).join("");

  wrap.querySelectorAll(".cat-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      categoriaActual = btn.dataset.cat;
      localStorage.setItem(STORAGE_KEY, categoriaActual);
      wrap.querySelectorAll(".cat-btn").forEach(b => {
        const active = b.dataset.cat === categoriaActual;
        b.classList.toggle("active", active);
        b.setAttribute("aria-selected", active);
      });
      render();
    });
  });
}

// ---- Helper centralizado: busca la tabla con fallback seguro ----
function obtenerTabla(cat) {
  if (!DATA || !DATA.tablas_posiciones) return null;
  const t = DATA.tablas_posiciones[String(cat)];
  if (Array.isArray(t)) return t;
  const general = DATA.tablas_posiciones.general;
  return Array.isArray(general) ? general : null;
}

// ---- Render principal ----
function render() {
  renderProximoPartido();
  renderMetrics();
  renderForma();
  renderTabla();
  renderHistorial();
  renderCalendario();

  const tag = categoriaActual === "general"
    ? "Acumulado"
    : `Cat. ${categoriaActual}`;
  document.getElementById("form-cat-tag").textContent = tag;
  document.getElementById("table-cat-tag").textContent = tag;
  document.getElementById("history-cat-tag").textContent = tag;
}

// ---- Helpers ----
const ES_FOCO = (eq) => eq === DATA.equipo_foco;

function partidosDelFoco(categoria) {
  const out = [];
  for (const fecha of DATA.fechas) {
    for (const enc of fecha.encuentros) {
      if (!ES_FOCO(enc.local) && !ES_FOCO(enc.visitante)) continue;

      const esLocal = ES_FOCO(enc.local);
      const rival = esLocal ? enc.visitante : enc.local;

      if (categoria === "general") {
        let gf = 0, gc = 0, jugado = false, observ = null;
        for (const cat of DATA.categorias) {
          const p = enc.partidos[String(cat)];
          if (p && p.jugado) {
            jugado = true;
            gf += esLocal ? p.goles_local : p.goles_visitante;
            gc += esLocal ? p.goles_visitante : p.goles_local;
          }
          if (p && p.observacion) observ = p.observacion;
        }
        out.push({
          numero: fecha.numero,
          fecha: fecha.fecha_partido,
          rival, esLocal,
          gf: jugado ? gf : null,
          gc: jugado ? gc : null,
          jugado,
          observacion: observ,
          estado: enc.estado,
        });
      } else {
        const p = enc.partidos[String(categoria)];
        if (!p) continue;
        out.push({
          numero: fecha.numero,
          fecha: fecha.fecha_partido,
          rival, esLocal,
          gf: esLocal ? p.goles_local : p.goles_visitante,
          gc: esLocal ? p.goles_visitante : p.goles_local,
          jugado: p.jugado,
          observacion: p.observacion,
          estado: enc.estado,
        });
      }
    }
  }
  return out;
}

function resultadoLetra(p) {
  if (!p.jugado || p.gf == null) return null;
  if (p.gf > p.gc) return "W";
  if (p.gf < p.gc) return "L";
  return "D";
}

function nombreEquipo(nombre) {
  return nombre.split(" ").map(w =>
    w.length > 2 ? w[0] + w.slice(1).toLowerCase() : w
  ).join(" ");
}

function buscarEquipo(nombre) {
  return (DATA.equipos || []).find(e => e.nombre === nombre);
}

function fechaCorta(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${parseInt(d)} ${meses[parseInt(m) - 1]}`;
}

// ---- Proximo partido ----
function renderProximoPartido() {
  const partidos = partidosDelFoco(categoriaActual);
  const proximo = partidos.find(p => !p.jugado);

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
    return;
  }

  $date.textContent = "Fecha " + proximo.numero + " - " + fechaCorta(proximo.fecha);

  const local = proximo.esLocal ? DATA.equipo_foco : proximo.rival;
  const visit = proximo.esLocal ? proximo.rival : DATA.equipo_foco;

  $teams.innerHTML = `
    <div class="team-block">
      <div class="team-name ${local === DATA.equipo_foco ? 'highlight' : ''}">${nombreEquipo(local)}</div>
      <div class="team-condition">Local</div>
    </div>
    <div class="vs-badge">VS</div>
    <div class="team-block">
      <div class="team-name ${visit === DATA.equipo_foco ? 'highlight' : ''}">${nombreEquipo(visit)}</div>
      <div class="team-condition">Visitante</div>
    </div>
  `;

  const localData = buscarEquipo(local);
  let metaHTML = "";
  if (localData && localData.direccion) {
    const mapsUrl = "https://maps.google.com/?q=" +
      encodeURIComponent(`${localData.direccion}, ${localData.localidad}, Argentina`);
    metaHTML += `<span class="match-meta-item">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
        <circle cx="12" cy="10" r="3"></circle>
      </svg>
      <a href="${mapsUrl}" target="_blank" rel="noopener">${localData.direccion}, ${localData.localidad}</a>
    </span>`;
  }
  if (proximo.fecha) {
    const f = new Date(proximo.fecha + "T12:00:00");
    const dia = f.toLocaleDateString("es-AR", { weekday: "long" });
    metaHTML += `<span class="match-meta-item">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
      </svg>
      ${dia.charAt(0).toUpperCase() + dia.slice(1)}
    </span>`;
  }
  $meta.innerHTML = metaHTML;

  // Comparativa entre los dos equipos
  const tabla = obtenerTabla(categoriaActual);
  if (tabla) {
    const focoEnTabla = tabla.find(t => t.equipo === DATA.equipo_foco);
    const rivalEnTabla = tabla.find(t => t.equipo === proximo.rival);
    if (focoEnTabla && rivalEnTabla) {
      const tipo = categoriaActual === "general" ? "general" : `cat. ${categoriaActual}`;
      $pred.innerHTML = `<strong>Comparativa ${tipo}:</strong> ${nombreEquipo(DATA.equipo_foco)} ${focoEnTabla.posicion}° (${focoEnTabla.pts} pts) vs ${nombreEquipo(proximo.rival)} ${rivalEnTabla.posicion}° (${rivalEnTabla.pts} pts)`;
    } else {
      $pred.innerHTML = "";
    }
  } else {
    $pred.innerHTML = "";
  }

  // Scouting del rival
  renderScoutingSection($scouting, "babyfutbol", proximo.rival, categoriaActual);
}

// ---- Metricas ----
function renderMetrics() {
  const tabla = obtenerTabla(categoriaActual);
  const $m = document.getElementById("metrics");

  if (!tabla) {
    $m.innerHTML = "";
    return;
  }

  const foco = tabla.find(t => t.equipo === DATA.equipo_foco);
  if (!foco) {
    $m.innerHTML = "";
    return;
  }

  const efectividad = foco.pj > 0 ? Math.round(100 * foco.g / foco.pj) : 0;
  const partidos = partidosDelFoco(categoriaActual);
  const dif = partidos
    .filter(p => p.jugado)
    .reduce((acc, p) => acc + (p.gf - p.gc), 0);

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
function renderForma() {
  const partidos = partidosDelFoco(categoriaActual)
    .filter(p => p.jugado)
    .slice(-5);

  const $row = document.getElementById("form-row");
  if (partidos.length === 0) {
    $row.innerHTML = '<div class="form-empty">Aun no hay partidos jugados en esta categoria</div>';
    return;
  }

  $row.innerHTML = partidos.map(p => {
    const r = resultadoLetra(p);
    const label = r === "W" ? "G" : (r === "L" ? "P" : "E");
    return `<span class="form-pill ${r}" title="vs ${nombreEquipo(p.rival)}: ${p.gf}-${p.gc}">${label}</span>`;
  }).join("");
}

// ---- Tabla de posiciones ----
function renderTabla() {
  const tabla = obtenerTabla(categoriaActual);
  const $t = document.getElementById("standings");
  if (!tabla) {
    $t.innerHTML = "";
    return;
  }

  $t.innerHTML = `
    <thead>
      <tr>
        <th class="pos">#</th>
        <th>Equipo</th>
        <th class="center">PJ</th>
        <th class="center">G</th>
        <th class="center">E</th>
        <th class="center">P</th>
        <th class="center">Pts</th>
      </tr>
    </thead>
    <tbody>
      ${tabla.map(t => `
        <tr class="${t.equipo === DATA.equipo_foco ? 'highlight' : ''}">
          <td class="pos">${t.posicion}</td>
          <td><span class="team-col">${nombreEquipo(t.equipo)}</span></td>
          <td class="center">${t.pj ?? '-'}</td>
          <td class="center">${t.g ?? '-'}</td>
          <td class="center">${t.e ?? '-'}</td>
          <td class="center">${t.p ?? '-'}</td>
          <td class="center pts">${t.pts ?? '-'}</td>
        </tr>
      `).join('')}
    </tbody>
  `;
}

// ---- Historial ----
function renderHistorial() {
  const partidos = partidosDelFoco(categoriaActual).filter(p => p.jugado);
  const $list = document.getElementById("history-list");

  if (partidos.length === 0) {
    $list.innerHTML = '<div class="form-empty">Aun no hay partidos jugados</div>';
    return;
  }

  $list.innerHTML = partidos.slice().reverse().map(p => {
    const r = resultadoLetra(p);
    const label = r === "W" ? "G" : (r === "L" ? "P" : "E");
    return `
      <div class="history-item">
        <span class="history-result ${r}">${label}</span>
        <div class="history-rival">
          <span class="history-rival-name">${nombreEquipo(p.rival)}</span>
          <span class="history-rival-meta">F${p.numero} - ${p.esLocal ? 'Local' : 'Visitante'}${p.observacion ? ' - ' + p.observacion : ''}</span>
        </div>
        <span class="history-score">${p.gf} - ${p.gc}</span>
      </div>
    `;
  }).join('');
}

// ---- Calendario ----
function renderCalendario() {
  const partidos = partidosDelFoco(categoriaActual);
  const $list = document.getElementById("schedule");

  $list.innerHTML = partidos.map(p => {
    let direccionHTML = "";
    if (!p.jugado) {
      const equipoSede = p.esLocal ? DATA.equipo_foco : p.rival;
      const sedeData = buscarEquipo(equipoSede);
      if (sedeData && sedeData.direccion) {
        const mapsUrl = "https://maps.google.com/?q=" + encodeURIComponent(`${sedeData.direccion}, ${sedeData.localidad}, Argentina`);
        direccionHTML = `<a href="${mapsUrl}" target="_blank" rel="noopener" class="schedule-address">📍 ${sedeData.direccion}, ${sedeData.localidad}</a>`;
      }
    }

    return `
      <div class="schedule-item ${p.jugado ? 'played' : ''}">
        <span class="schedule-num">F${p.numero}</span>
        <div class="schedule-info">
          <span class="schedule-rival">
            vs ${nombreEquipo(p.rival)}
            <span class="schedule-condition">${p.esLocal ? '(L)' : '(V)'}</span>
          </span>
          ${direccionHTML}
        </div>
        <span class="schedule-date">${fechaCorta(p.fecha)}</span>
      </div>
    `;
  }).join('');
}

// ── Scouting compartido: carga predictions y muestra análisis del rival ──
async function loadPredictionsData() {
  if (PREDICTIONS_CACHE) return PREDICTIONS_CACHE;
  try {
    let res = await fetch(PREDICTIONS_DATA_URL);
    if (!res.ok) res = await fetch("../data/predictions.json");
    PREDICTIONS_CACHE = await res.json();
  } catch (e) {
    console.warn("No se pudieron cargar predicciones para scouting:", e);
    PREDICTIONS_CACHE = null;
  }
  return PREDICTIONS_CACHE;
}

function renderScoutingSection($container, torneoId, rival, categoriaFilter) {
  if (!$container) return;

  // Si está en 'general', no mostramos el scouting individual
  if (categoriaFilter === "general" || !categoriaFilter) {
    $container.innerHTML = "";
    return;
  }

  loadPredictionsData().then(data => {
    if (!data || !data.predicciones) {
      $container.innerHTML = "";
      return;
    }

    // Filtrar predicciones para este torneo, rival y categoría seleccionada
    const items = data.predicciones.filter(p =>
      p.torneo_id === torneoId && 
      p.rival === rival && 
      p.scouting_rival && 
      String(p.categoria) === String(categoriaFilter)
    );

    if (items.length === 0) {
      $container.innerHTML = "";
      return;
    }

    const rivalNombre = nombreEquipo(rival);
    $container.innerHTML = `
      <div class="scouting-header" onclick="this.nextElementSibling.classList.toggle('collapsed')">
        <span class="scouting-icon">🔍</span>
        <span>¿Qué hay que saber sobre ${rivalNombre}?</span>
        <span class="scouting-toggle">▼</span>
      </div>
      <div class="scouting-list">
        ${items.map(item => `
          <div class="scouting-item">
            <span class="scouting-cat-label">${item.categoria_label || item.categoria}</span>
            <div class="scouting-text">${item.scouting_rival}</div>
          </div>
        `).join("")}
      </div>
    `;
  });
}

// Iniciar
init();
