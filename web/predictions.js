// ==========================================
// Predicciones AI - Villa Sahores
// Per-category match predictions
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
    const cacheBust = "?v=" + new Date().getTime();
    let res = await fetch(PREDICTIONS_URL + cacheBust);
    if (!res.ok) res = await fetch("../data/predictions.json" + cacheBust);
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

// ---- Group predictions by match ----
function groupByMatch(preds) {
  const groups = {};
  preds.forEach(p => {
    const key = `${p.torneo_id}|${p.fecha_num}|${p.rival}`;
    if (!groups[key]) {
      groups[key] = {
        torneo_id: p.torneo_id,
        torneo_label: p.torneo_label || p.torneo_nombre || "",
        fecha_num: p.fecha_num,
        rival: p.rival,
        es_local: p.es_local,
        fecha: p.fecha,
        categorias: []
      };
    }
    groups[key].categorias.push(p);
  });
  return Object.values(groups);
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
        <p>No hay predicciones para este torneo</p>
      </div>
    `;
    return;
  }

  const matches = groupByMatch(preds);

  const html = `<div class="predictions-list">${matches.map(match => {
    const localName = match.es_local ? foco : match.rival;
    const visitName = match.es_local ? match.rival : foco;

    // Summary stats
    const wins = match.categorias.filter(c => c.prediccion === "victoria").length;
    const draws = match.categorias.filter(c => c.prediccion === "empate").length;
    const losses = match.categorias.filter(c => c.prediccion === "derrota").length;
    const totalGoalsFoco = match.categorias.reduce((s, c) => s + (c.score_foco || 0), 0);
    const totalGoalsRival = match.categorias.reduce((s, c) => s + (c.score_rival || 0), 0);

    const overallResult = wins > losses ? "victoria" : (losses > wins ? "derrota" : "empate");

    return `
      <div class="match-pred-card">
        <div class="pred-result-strip ${overallResult}"></div>

        <!-- Match header -->
        <div class="match-pred-header">
          <div class="match-pred-torneo">
            <span class="pred-torneo">${match.torneo_label}</span>
            <span class="pred-fecha-num">Fecha ${match.fecha_num}</span>
          </div>
          <div class="match-pred-matchup">
            <span class="match-pred-team ${localName === foco ? 'foco' : ''}">${predNombreEquipo(localName)}</span>
            <span class="match-pred-vs">vs</span>
            <span class="match-pred-team ${visitName === foco ? 'foco' : ''}">${predNombreEquipo(visitName)}</span>
          </div>
          <div class="match-pred-summary">
            <span class="summary-score">${totalGoalsFoco} – ${totalGoalsRival}</span>
            <span class="summary-cats">
              <span class="cat-dot win">${wins}G</span>
              <span class="cat-dot draw">${draws}E</span>
              <span class="cat-dot lose">${losses}P</span>
            </span>
          </div>
        </div>

        <!-- Category predictions table -->
        <div class="cat-preds-table">
          <div class="cat-preds-header">
            <span class="col-cat">Categoría</span>
            <span class="col-result">Pred.</span>
            <span class="col-score">Score</span>
            <span class="col-probs">V% / E% / D%</span>
            <span class="col-conf">Conf.</span>
          </div>
          ${match.categorias.map(cat => {
            const resultEmoji = cat.prediccion === "victoria" ? "🟢" :
                               (cat.prediccion === "derrota" ? "🔴" : "🟡");
            const resultClass = cat.prediccion;
            return `
              <div class="cat-pred-row ${resultClass}">
                <span class="col-cat">${cat.categoria_label || cat.categoria}</span>
                <span class="col-result">${resultEmoji}</span>
                <span class="col-score">${cat.score_foco ?? '?'} – ${cat.score_rival ?? '?'}</span>
                <span class="col-probs">
                  <span class="prob-mini win">${cat.prob_victoria || 0}</span> /
                  <span class="prob-mini draw">${cat.prob_empate || 0}</span> /
                  <span class="prob-mini lose">${cat.prob_derrota || 0}</span>
                </span>
                <span class="col-conf">
                  <span class="conf-mini-bar"><span class="conf-mini-fill" style="width:${cat.confianza || 0}%"></span></span>
                  ${cat.confianza || 0}%
                </span>
              </div>
              ${cat.razon ? `<div class="cat-pred-reason">${cat.razon}</div>` : ''}
              ${cat.scouting_rival ? `<div class="cat-scouting-rival"><span class="scouting-label">🔍 ¿Qué hay que saber del rival?</span> ${cat.scouting_rival}</div>` : ''}
            `;
          }).join("")}
        </div>
      </div>
    `;
  }).join("")}</div>`;

  document.getElementById("predictions-container").innerHTML = html;
}

// ---- Init ----
loadPredictions();

// ---- Trigger Scraper ----
function updateTokenLinks() {
  const token = localStorage.getItem("github_pat");
  const clearBtn = document.getElementById("btn-clear-pat");
  if (clearBtn) {
    clearBtn.style.display = token ? "inline-block" : "none";
  }
}

async function triggerScraper() {
  const btn = document.getElementById("btn-trigger-scraper");
  if (!btn) return;

  let token = localStorage.getItem("github_pat");
  if (!token) {
    token = prompt("Para ejecutar el scraper necesitas un GitHub Personal Access Token (PAT) con permisos de 'actions:write'.\n\nPor favor, ingresalo a continuación (se guardará localmente en tu navegador):");
    if (!token) return;
    localStorage.setItem("github_pat", token.trim());
    updateTokenLinks();
  }

  btn.classList.add("loading");
  btn.disabled = true;
  btn.textContent = "Disparando Scraper... ";

  try {
    const response = await fetch("https://api.github.com/repos/ajroit/fefi-zona-j/actions/workflows/scrape.yml/dispatches", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ref: "main"
      })
    });

    if (response.status === 204) {
      alert("¡GitHub Action ejecutada con éxito! 🚀\nEl scraper se está ejecutando en segundo plano en GitHub. Los datos se actualizarán en unos minutos.");
    } else {
      const errData = await response.json().catch(() => null);
      const errMsg = errData?.message || `Código de estado: ${response.status}`;
      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem("github_pat");
        updateTokenLinks();
        alert(`Error de autenticación: ${errMsg}.\nSe borró el token guardado para que puedas intentar de nuevo con otro válido.`);
      } else {
        alert(`No se pudo iniciar el scraper: ${errMsg}`);
      }
    }
  } catch (error) {
    console.error("Error disparando el scraper:", error);
    alert(`Ocurrió un error de red: ${error.message}`);
  } finally {
    btn.classList.remove("loading");
    btn.disabled = false;
    btn.textContent = "🔄 Ejecutar Scraper / Actualizar Datos";
  }
}

// Configurar listeners
function setupScraperListeners() {
  const triggerBtn = document.getElementById("btn-trigger-scraper");
  if (triggerBtn && !triggerBtn.dataset.listenerAttached) {
    triggerBtn.addEventListener("click", triggerScraper);
    triggerBtn.dataset.listenerAttached = "true";
  }

  const clearBtn = document.getElementById("btn-clear-pat");
  if (clearBtn && !clearBtn.dataset.listenerAttached) {
    clearBtn.addEventListener("click", () => {
      localStorage.removeItem("github_pat");
      updateTokenLinks();
      alert("Token eliminado de tu navegador.");
    });
    clearBtn.dataset.listenerAttached = "true";
  }

  updateTokenLinks();
}

document.addEventListener("DOMContentLoaded", setupScraperListeners);
if (document.readyState === "interactive" || document.readyState === "complete") {
  setupScraperListeners();
}
