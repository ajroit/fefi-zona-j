// ==========================================
// Predicciones AI - Villa Sahores
// ==========================================

const PREDICTIONS_URL = "data/predictions.json";
let PREDICTIONS_DATA = null;
let currentFilter = "all";

// ---- Nombre corto ----
function predNombreEquipo(nombre) {
  if (!nombre) return "";
  return nombre
    .replace(/^CLUB\s+/i, "")
    .replace(/^C\.?S\.?Y?\.?D\.?\s*/i, "")
    .replace(/^S\.?D\.?\s*/i, "")
    .split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// ---- Load ----
async function loadPredictions() {
  try {
    let res = await fetch(PREDICTIONS_URL);
    if (!res.ok) res = await fetch("../data/predictions.json");
    PREDICTIONS_DATA = await res.json();
  } catch (err) {
    console.error("Error cargando predicciones:", err);
    document.getElementById("predictions-container").innerHTML = `
      <div class="pred-empty">
        <div class="emoji">🔮</div>
        <p>No hay predicciones disponibles aún</p>
        <p style="font-size: 13px; margin-top: 8px; color: var(--text-muted);">
          Ejecutá <code>python scraper/predictor.py</code> para generar predicciones
        </p>
      </div>
    `;
    return;
  }

  renderTimestamp();
  renderFilters();
  renderPredictions();
}

// ---- Timestamp ----
function renderTimestamp() {
  if (!PREDICTIONS_DATA?.actualizado) return;
  const d = new Date(PREDICTIONS_DATA.actualizado);
  document.getElementById("pred-timestamp").textContent =
    "Predicciones generadas: " +
    new Intl.DateTimeFormat("es-AR", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
      timeZone: "America/Argentina/Buenos_Aires"
    }).format(d);
}

// ---- Filters ----
function renderFilters() {
  const torneos = [...new Set(PREDICTIONS_DATA.predicciones.map(p => p.torneo_id))];
  const labels = {};
  PREDICTIONS_DATA.predicciones.forEach(p => {
    labels[p.torneo_id] = p.torneo_label || p.torneo_id;
  });

  const $row = document.getElementById("filter-row");
  let html = `<button class="filter-btn active" data-filter="all">Todos</button>`;
  torneos.forEach(t => {
    html += `<button class="filter-btn" data-filter="${t}">${labels[t]}</button>`;
  });
  $row.innerHTML = html;

  $row.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      currentFilter = btn.dataset.filter;
      $row.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderPredictions();
    });
  });
}

// ---- Render predictions ----
function renderPredictions() {
  const foco = PREDICTIONS_DATA.equipo_foco;
  let preds = PREDICTIONS_DATA.predicciones;
  if (currentFilter !== "all") {
    preds = preds.filter(p => p.torneo_id === currentFilter);
  }

  if (preds.length === 0) {
    document.getElementById("predictions-container").innerHTML = `
      <div class="pred-empty">
        <div class="emoji">🏆</div>
        <p>No hay partidos pendientes en este torneo</p>
      </div>
    `;
    return;
  }

  const html = `<div class="predictions-grid">${preds.map(pred => {
    const result = pred.prediccion || "empate";
    const focoLocal = pred.es_local;
    const localName = focoLocal ? foco : pred.rival;
    const visitName = focoLocal ? pred.rival : foco;
    const localScore = focoLocal ? pred.score_foco : pred.score_rival;
    const visitScore = focoLocal ? pred.score_rival : pred.score_foco;

    return `
      <div class="pred-card">
        <div class="pred-result-strip ${result}"></div>
        <div class="pred-card-header">
          <span class="pred-torneo">${pred.torneo_label || pred.torneo_nombre || ""}</span>
          <span class="pred-fecha-num">Fecha ${pred.fecha_num}</span>
        </div>

        <div class="pred-matchup">
          <div class="pred-team">
            <div class="pred-team-name ${localName === foco ? 'foco' : ''}">${predNombreEquipo(localName)}</div>
            <div class="pred-team-condition">Local</div>
          </div>
          <div class="pred-score-box">
            <span class="pred-score-num ${localName === foco ? 'foco' : 'rival'}">${localScore ?? '?'}</span>
            <span class="pred-score-sep">–</span>
            <span class="pred-score-num ${visitName === foco ? 'foco' : 'rival'}">${visitScore ?? '?'}</span>
          </div>
          <div class="pred-team">
            <div class="pred-team-name ${visitName === foco ? 'foco' : ''}">${predNombreEquipo(visitName)}</div>
            <div class="pred-team-condition">Visitante</div>
          </div>
        </div>

        <div class="pred-probs">
          <div class="prob-col">
            <div class="prob-label">Victoria</div>
            <div class="prob-bar-wrap"><div class="prob-bar win" style="width: ${pred.prob_victoria || 0}%"></div></div>
            <div class="prob-value win">${pred.prob_victoria || 0}%</div>
          </div>
          <div class="prob-col">
            <div class="prob-label">Empate</div>
            <div class="prob-bar-wrap"><div class="prob-bar draw" style="width: ${pred.prob_empate || 0}%"></div></div>
            <div class="prob-value draw">${pred.prob_empate || 0}%</div>
          </div>
          <div class="prob-col">
            <div class="prob-label">Derrota</div>
            <div class="prob-bar-wrap"><div class="prob-bar lose" style="width: ${pred.prob_derrota || 0}%"></div></div>
            <div class="prob-value lose">${pred.prob_derrota || 0}%</div>
          </div>
        </div>

        <div class="pred-confidence">
          <span class="conf-label">Confianza</span>
          <div class="conf-track"><div class="conf-fill" style="width: ${pred.confianza || 0}%"></div></div>
          <span class="conf-value">${pred.confianza || 0}%</span>
        </div>

        ${pred.razon ? `<div class="pred-reason">${pred.razon}</div>` : ''}
      </div>
    `;
  }).join("")}</div>`;

  document.getElementById("predictions-container").innerHTML = html;
}

// ---- Init ----
loadPredictions();
