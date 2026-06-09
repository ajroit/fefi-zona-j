// ==========================================================
// Standalone Match Detail Script - Villa Sahores
// ==========================================================

const TOURNAMENT_DATA_URLS = {
  "Futsal Liga de Honor": "data/futsal-data.json",
  "Futsal Reducido": "data/futsal-reducido-data.json",
  "Futsal Femenino": "data/futsal-femenino-data.json"
};

// Formato de fecha corta para el detalle
function formatLongDate(isoStr) {
  if (!isoStr) return "Fecha Pendiente";
  try {
    const date = new Date(isoStr);
    if (isNaN(date.getTime())) {
      // Fallback si no parsea (ej: "2026-03-21 17:00")
      const parts = isoStr.split(" ");
      if (parts.length >= 2) {
        const [y, m, d] = parts[0].split("-");
        const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        return `${parseInt(d)} de ${meses[parseInt(m) - 1]} de ${y} - ${parts[1]} hs`;
      }
      return isoStr;
    }
    const formatter = new Intl.DateTimeFormat("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    return formatter.format(date);
  } catch (e) {
    return isoStr;
  }
}

// Capitalizar nombres de equipos
function nombreEquipo(nombre) {
  if (!nombre) return "";
  return nombre.split(" ").map(w =>
    w.length > 2 ? w[0] + w.slice(1).toLowerCase() : w
  ).join(" ");
}

async function initMatchDetails() {
  // 1. Obtener ID de la URL
  const urlParams = new URLSearchParams(window.location.search);
  let rawId = urlParams.get("id") || urlParams.get("m");
  
  if (!rawId) {
    showError("No se proporcionó ningún identificador de partido en la URL.");
    return;
  }

  // 2. Cargar futsal-stats.json (con fallback)
  let statsData = null;
  const cacheBust = "?v=" + new Date().getTime();
  try {
    let res = await fetch("data/futsal-stats.json" + cacheBust);
    if (!res.ok) res = await fetch("../data/futsal-stats.json" + cacheBust);
    statsData = await res.json();
  } catch (err) {
    console.warn("No se pudieron cargar los datos de estadísticas del servidor. Intentando fallback a fixtures...");
  }

  // 3. Buscar partido en partidos_detalles (si statsData está disponible)
  let match = null;
  let matchId = rawId;
  const decodedId = parseInt(rawId, 16);
  const targetMatchId = isNaN(decodedId) ? Number(rawId) : decodedId;

  if (statsData && statsData.partidos_detalles) {
    // Intentar primero con el ID tal cual (decimal)
    match = statsData.partidos_detalles[String(rawId)];
    
    // Si no se encuentra, intentar decodificando de hexadecimal (ej: '24602' o '244ab')
    if (!match && !isNaN(decodedId)) {
      match = statsData.partidos_detalles[String(decodedId)];
      if (match) {
        matchId = decodedId;
      }
    }
  }

  // 4. Si no se encontró en partidos_detalles, buscar en los fixtures del torneo
  if (!match) {
    try {
      const fixtureFiles = [
        { url: "data/futsal-data.json", torneo: "Futsal Liga de Honor" },
        { url: "data/futsal-reducido-data.json", torneo: "Futsal Reducido" },
        { url: "data/futsal-femenino-data.json", torneo: "Futsal Femenino" }
      ];
      
      for (const t of fixtureFiles) {
        try {
          let res = await fetch(t.url + cacheBust);
          if (!res.ok) res = await fetch("../" + t.url + cacheBust);
          if (res.ok) {
            const tData = await res.json();
            for (const fecha of tData.fechas || []) {
              for (const enc of fecha.encuentros || []) {
                for (const catName in enc.partidos || {}) {
                  const p = enc.partidos[catName];
                  if (p && (p.match_id === targetMatchId || p.match_id === String(targetMatchId))) {
                    match = {
                      match_id: targetMatchId,
                      torneo: t.torneo,
                      categoria: catName,
                      fecha_num: fecha.numero,
                      fecha_hora: p.fecha_hora,
                      local: enc.local,
                      visitante: enc.visitante,
                      goles_local: p.goles_local,
                      goles_visitante: p.goles_visitante,
                      referees: [],
                      goles: [],
                      tarjetas: []
                    };
                    matchId = targetMatchId;
                    break;
                  }
                }
                if (match) break;
              }
              if (match) break;
            }
          }
        } catch (e) {
          console.warn(`Error buscando en ${t.url}:`, e);
        }
        if (match) break;
      }
    } catch (e) {
      console.warn("Error buscando en fixtures:", e);
    }
  }

  if (!match) {
    showError(`El partido con código "${rawId}" no se encontró en la base de datos.`);
    return;
  }

  // Ocultar Loader y mostrar contenido
  document.getElementById("loader").style.display = "none";
  document.getElementById("match-content").style.display = "block";

  // 5. Cargar logos de los equipos y planillas del fixture
  let homeLogo = null;
  let awayLogo = null;
  let planillas = [];
  const torneoUrl = TOURNAMENT_DATA_URLS[match.torneo];
  if (torneoUrl) {
    try {
      let res = await fetch(torneoUrl + cacheBust);
      if (!res.ok) res = await fetch("../" + torneoUrl + cacheBust);
      const torneoData = await res.json();
      
      const homeEq = torneoData.equipos.find(e => e.nombre.toUpperCase() === match.local.toUpperCase() || match.local.toUpperCase().includes(e.nombre.toUpperCase()));
      const awayEq = torneoData.equipos.find(e => e.nombre.toUpperCase() === match.visitante.toUpperCase() || match.visitante.toUpperCase().includes(e.nombre.toUpperCase()));
      
      if (homeEq) homeLogo = homeEq.logo;
      if (awayEq) awayLogo = awayEq.logo;

      // Buscar planillas en el fixture cruzando por fecha_num + categoría + equipos
      for (const fecha of torneoData.fechas || []) {
        if (fecha.numero !== match.fecha_num) continue;
        for (const enc of fecha.encuentros || []) {
          const matchesHome = enc.local.toUpperCase().includes(match.local.toUpperCase()) || match.local.toUpperCase().includes(enc.local.toUpperCase());
          const matchesAway = enc.visitante.toUpperCase().includes(match.visitante.toUpperCase()) || match.visitante.toUpperCase().includes(enc.visitante.toUpperCase());
          if (matchesHome && matchesAway) {
            const catPartido = enc.partidos[match.categoria];
            if (catPartido && catPartido.planillas && catPartido.planillas.length > 0) {
              planillas = catPartido.planillas;
            }
            break;
          }
        }
      }
    } catch (e) {
      console.warn("No se pudieron cargar los logos de los equipos:", e);
    }
  }

  // 6. Rellenar scoreboard
  const homeTitle = document.getElementById("home-name");
  const awayTitle = document.getElementById("away-name");
  
  homeTitle.textContent = nombreEquipo(match.local);
  awayTitle.textContent = nombreEquipo(match.visitante);
  
  // Destacar Villa Sahores
  if (match.local.toUpperCase().includes("VILLA SAHORES")) homeTitle.classList.add("highlight");
  if (match.visitante.toUpperCase().includes("VILLA SAHORES")) awayTitle.classList.add("highlight");

  document.getElementById("home-score").textContent = match.goles_local ?? 0;
  document.getElementById("away-score").textContent = match.goles_visitante ?? 0;

  // Cargar imágenes de logos
  const homeLogoWrap = document.getElementById("home-logo-wrap");
  const awayLogoWrap = document.getElementById("away-logo-wrap");
  
  if (homeLogo) {
    homeLogoWrap.innerHTML = `<img src="${homeLogo}" class="team-logo-img" alt="${match.local}">`;
  }
  if (awayLogo) {
    awayLogoWrap.innerHTML = `<img src="${awayLogo}" class="team-logo-img" alt="${match.visitante}">`;
  }

  // Categoría y fecha
  const catLabel = match.categoria.trim();
  document.getElementById("category-badge").textContent = `${match.torneo} - ${catLabel}`;
  document.getElementById("match-date-label").textContent = `Fecha ${match.fecha_num} • ${formatLongDate(match.fecha_hora)}`;

  // 7. Eventos: Goles
  const goalsList = document.getElementById("goals-list");
  if (match.goles && match.goles.length > 0) {
    goalsList.innerHTML = match.goles.map(g => {
      const isHome = g.equipo.toUpperCase() === match.local.toUpperCase() || match.local.toUpperCase().includes(g.equipo.toUpperCase());
      const teamBadgeClass = isHome ? "home" : "away";
      const teamBadgeText = isHome ? "Local" : "Vis.";
      return `
        <div class="event-item">
          <span class="event-team-badge ${teamBadgeClass}">${teamBadgeText}</span>
          <span class="event-icon">⚽</span>
          <span class="event-player">${g.nombre_completo}</span>
          ${g.cantidad > 1 ? `<span class="event-detail">(x${g.cantidad})</span>` : ''}
        </div>
      `;
    }).join("");
  } else {
    goalsList.innerHTML = '<div class="details-empty">No se registraron goles en la planilla.</div>';
  }

  // Eventos: Tarjetas
  const cardsList = document.getElementById("cards-list");
  if (match.tarjetas && match.tarjetas.length > 0) {
    cardsList.innerHTML = match.tarjetas.map(c => {
      const isHome = c.equipo.toUpperCase() === match.local.toUpperCase() || match.local.toUpperCase().includes(c.equipo.toUpperCase());
      const teamBadgeClass = isHome ? "home" : "away";
      const teamBadgeText = isHome ? "Local" : "Vis.";
      
      let cardEmoji = "🟨";
      let cardLabel = "Amarilla";
      if (c.tipo === "roja") {
        cardEmoji = "🟥";
        cardLabel = "Roja";
      } else if (c.tipo === "doble_amarilla") {
        cardEmoji = "🟨🟨";
        cardLabel = "Doble Amarilla";
      }
      
      return `
        <div class="event-item">
          <span class="event-team-badge ${teamBadgeClass}">${teamBadgeText}</span>
          <span class="event-icon">${cardEmoji}</span>
          <span class="event-player">${c.nombre_completo}</span>
          <span class="event-detail">(${cardLabel})</span>
        </div>
      `;
    }).join("");
  } else {
    cardsList.innerHTML = '<div class="details-empty">No se registraron tarjetas en este partido.</div>';
  }

  // 8. Árbitros
  const refereeCard = document.getElementById("referee-card");
  if (match.referees && match.referees.length > 0) {
    refereeCard.style.display = "flex";
    const ref = match.referees[0]; // Tomamos el primer árbitro
    document.getElementById("referee-fullname").textContent = ref.nombre_completo;
    
    // Cargar foto
    const refPhotoContainer = document.getElementById("referee-photo-container");
    if (ref.foto) {
      refPhotoContainer.innerHTML = `<img src="${ref.foto}" class="referee-photo-large" alt="${ref.nombre_completo}">`;
    } else {
      refPhotoContainer.innerHTML = `<span class="referee-placeholder-large">🧑‍⚖️</span>`;
    }

    // Estadísticas del árbitro en nuestra base
    const refGlobal = (statsData && statsData.arbitros) ? statsData.arbitros[ref.nombre_completo] : null;
    const refCountLabel = document.getElementById("referee-stats-label");
    if (refGlobal) {
      const v = refGlobal.victorias || 0;
      const e = refGlobal.empates || 0;
      const d = refGlobal.derrotas || 0;
      refCountLabel.textContent = `Dirigió ${refGlobal.partidos_dirigidos} partido(s) a Villa Sahores (V: ${v}, E: ${e}, D: ${d}).`;
    } else {
      refCountLabel.textContent = "Árbitro oficial de la federación.";
    }
  } else {
    refereeCard.style.display = "none";
  }

  // 9. Planillas (fotos de las planillas oficiales)
  const planillasSection = document.getElementById("planillas-section");
  if (planillas.length > 0) {
    planillasSection.style.display = "block";
    const planillasGrid = document.getElementById("planillas-grid");
    planillasGrid.innerHTML = planillas.map((url, idx) => `
      <a href="${url}" target="_blank" rel="noopener" class="planilla-thumb" title="Ver planilla ${idx + 1} en tamaño completo">
        <img src="${url}" alt="Planilla ${idx + 1}" loading="lazy">
        <span class="planilla-overlay">📷 Ver planilla ${idx + 1}</span>
      </a>
    `).join("");
  } else {
    planillasSection.style.display = "none";
  }

  // 10. Configurar Botones de Compartir
  const shareTitle = `${nombreEquipo(match.local)} ${match.goles_local ?? 0} - ${match.goles_visitante ?? 0} ${nombreEquipo(match.visitante)} (${catLabel}) - Villa Sahores`;
  const shareUrl = window.location.href;
  
  // WhatsApp
  const wsBtn = document.getElementById("btn-share-whatsapp");
  wsBtn.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareTitle + " ⚽👇\n" + shareUrl)}`;
  
  // Copiar Enlace
  const copyBtn = document.getElementById("btn-copy-link");
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      const oldText = copyBtn.textContent;
      copyBtn.textContent = "✅ ¡Enlace Copiado!";
      copyBtn.style.background = "#2e7d32";
      setTimeout(() => {
        copyBtn.textContent = oldText;
        copyBtn.style.background = "";
      }, 2000);
    }).catch(err => {
      console.error("Error copiando enlace:", err);
    });
  });

  // Actualizar Título de la Página y Metatags
  document.title = `${nombreEquipo(match.local)} vs ${nombreEquipo(match.visitante)} - ${catLabel}`;
}

function showError(msg) {
  document.getElementById("loader").style.display = "none";
  document.getElementById("match-content").style.display = "none";
  const errScreen = document.getElementById("error-screen");
  errScreen.style.display = "block";
  document.getElementById("error-msg").textContent = msg;
}

// Iniciar al cargar
window.addEventListener("DOMContentLoaded", initMatchDetails);
