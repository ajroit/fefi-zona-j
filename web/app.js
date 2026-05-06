// ==========================================
// FEFI Zona J - Dashboard de Club Sahores
// ==========================================

const DATA_URL = "data/fefi-data.json";
const CATEGORIAS_ORDEN = [2013, 2014, 2015, 2016, 2017, 2018, 2019];
const STORAGE_KEY = "fefi-cat-preferida";

let DATA = null;
let categoriaActual = "general";

// ---- Carga inicial ----
async function init() {
  try {
    let res = await fetch(DATA_URL);
    if (!res.ok) res = await fetch("../data/fefi-data.json");
    DATA = await res.json();
  } catch (err) {
    document.querySelector("main").innerHTML =
      `<div class="loading">No se pudieron cargar los datos. Reintentá en unos minutos.</div>`;
    console.error(err);
    return;
  }

  const guardada = localStorage.getItem(STORAGE_KEY);
  if (guardada && (guardada === "general" || CATEGORIAS_ORDEN.includes(Number(guardada)))) {
    categoriaActual = guardada;
  }

  renderHeader();
  renderCategorySelector();
  render();
}

function renderHeader() {
  const updated = new Date(DATA.actualizado);
  const formatter = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires"
  });
  document.getElementById("updated").textContent =
    "Actualizado: " + formatter.format(updated);
  document.getElementById("torneo-label").textContent =
    DATA.torneo.charAt(0).toUpperCase() + DATA.torneo.slice(1);
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
    : `Categoría ${categoriaActual}`;
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
  const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return `${parseInt(d)} ${meses[parseInt(m)-1]}`;
}

// ---- Próximo partido ----
function renderProximoPartido() {
  const partidos = partidosDelFoco(categoriaActual);
  const proximo = partidos.find(p => !p.jugado);

  const $teams = document.getElementById("next-match-teams");
  const $meta = document.getElementById("next-match-meta");
  const $date = document.getElementById("next-match-date");
  const $pred = document.getElementById("next-match-prediction");

  if (!proximo) {
    $date.textContent = "";
    $teams.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color: var(--text-muted); padding: 20px;">No hay próximos partidos en esta categoría</div>`;
    $meta.innerHTML = "";
    $pred.innerHTML = "";
    return;
  }

  $date.textContent = "Fecha " + proximo.numero + " · " + fechaCorta(proximo.fecha);

  const local = proximo.esLocal ? DATA.equipo_foco : proximo.rival;
  const visit = proximo.esLocal ? proximo.rival : DATA.equipo_foco;

  $teams.innerHTML = `
    <div class="team-block">
      <div class="team-name">${nombreEquipo(local)}</div>
      <div class="team-condition">Local</div>
    </div>
    <div class="vs-divider">vs</div>
    <div class="team-block">
      <div class="team-name">${nombreEquipo(visit)}</div>
      <div class="team-condition">Visitante</div>
    </div>
  `;

  const localData = buscarEquipo(local);
  let metaHTML = "";
  if (localData && localData.direccion) {
    const mapsUrl = "https://maps.google.com/?q=" +
      encodeURIComponent(`${localData.direccion}, ${localData.localidad}, Argentina`);
    metaHTML += `<span>📍 <a href="${mapsUrl}" target="_blank" rel="noopener">${localData.direccion}, ${localData.localidad}</a></span>`;
  }
  if (proximo.fecha) {
    const f = new Date(proximo.fecha + "T12:00:00");
    const dia = f.toLocaleDateString("es-AR", { weekday: "long" });
    metaHTML += `<span>📆 ${dia.charAt(0).toUpperCase() + dia.slice(1)}</span>`;
  }
  $meta.innerHTML = metaHTML;

  // Comparativa entre los dos equipos
  const tabla = obtenerTabla(categoriaActual);
  if (tabla) {
    const focoEnTabla = tabla.find(t => t.equipo === DATA.equipo_foco);
    const rivalEnTabla = tabla.find(t => t.equipo === proximo.rival);
    if (focoEnTabla && rivalEnTabla) {
      const tipo = categoriaActual === "general" ? "general" : `cat. ${categoriaActual}`;
      $pred.innerHTML = `<strong>📊 Comparativa ${tipo}:</strong> ${nombreEquipo(DATA.equipo_foco)} ${focoEnTabla.posicion}° (${focoEnTabla.pts} pts) vs ${nombreEquipo(proximo.rival)} ${rivalEnTabla.posicion}° (${rivalEnTabla.pts} pts)`;
    } else {
      $pred.innerHTML = "";
    }
  } else {
    $pred.innerHTML = "";
  }
}

// ---- Métricas ----
function renderMetrics() {
  const tabla = obtenerTabla(categoriaActual);
  const $m = document.getElementById("metrics");

  if (!tabla) { $m.innerHTML = ""; return; }

  const foco = tabla.find(t => t.equipo === DATA.equipo_foco);
  if (!foco) { $m.innerHTML = ""; return; }

  const efectividad = foco.pj > 0 ? Math.round(100 * foco.g / foco.pj) : 0;
  const partidos = partidosDelFoco(categoriaActual);
  const dif = partidos
    .filter(p => p.jugado)
    .reduce((acc, p) => acc + (p.gf - p.gc), 0);

  const difClass = dif > 0 ? "positive" : (dif < 0 ? "negative" : "");
  const difStr = dif > 0 ? `+${dif}` : String(dif);

  $m.innerHTML = `
    <div class="metric">
      <div class="metric-label">Posición</div>
      <div class="metric-value">${foco.posicion}°<span class="metric-sub">/ ${tabla.length}</span></div>
    </div>
    <div class="metric">
      <div class="metric-label">Puntos</div>
      <div class="metric-value">${foco.pts}<span class="metric-sub">en ${foco.pj}PJ</span></div>
    </div>
    <div class="metric">
      <div class="metric-label">Efectividad</div>
      <div class="metric-value">${efectividad}%</div>
    </div>
    <div class="metric">
      <div class="metric-label">Diferencia</div>
      <div class="metric-value ${difClass}">${difStr}</div>
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
    $row.innerHTML = '<div class="form-empty">Aún no hay partidos jugados en esta categoría</div>';
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
        <th class="center">Pts</th>
      </tr>
    </thead>
    <tbody>
      ${tabla.map(t => `
        <tr class="${t.equipo === DATA.equipo_foco ? 'highlight' : ''}">
          <td class="pos">${t.posicion}</td>
          <td>${nombreEquipo(t.equipo)}</td>
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
    $list.innerHTML = '<div class="form-empty">Aún no hay partidos jugados</div>';
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
          <span class="history-rival-meta">F${p.numero} · ${p.esLocal ? 'Local' : 'Visitante'}${p.observacion ? ' · ' + p.observacion : ''}</span>
        </div>
        <span class="history-score">${p.gf}–${p.gc}</span>
      </div>
    `;
  }).join('');
}

// ---- Calendario ----
function renderCalendario() {
  const partidos = partidosDelFoco(categoriaActual);
  const $list = document.getElementById("schedule");
  $list.innerHTML = partidos.map(p => `
    <div class="schedule-fecha ${p.jugado ? 'played' : ''}">
      <span class="schedule-num">F${p.numero}</span>
      <span>
        <span class="schedule-rival">vs ${nombreEquipo(p.rival)}</span>
        <span class="schedule-condition">${p.esLocal ? '(L)' : '(V)'}</span>
      </span>
      <span class="schedule-date">${fechaCorta(p.fecha)}</span>
    </div>
  `).join('');
}

init();
