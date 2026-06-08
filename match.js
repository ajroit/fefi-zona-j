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

  // 2. Resolver ID hexadecimal (si contiene letras, ej: '244ab' -> 148651)
  let matchId = rawId;
  const isHex = /[a-fA-F]/.test(rawId) || isNaN(Number(rawId));
  if (isHex) {
    try {
      matchId = parseInt(rawId, 16);
      if (isNaN(matchId)) {
        showError(`El identificador hexadecimal "${rawId}" no es válido.`);
        return;
      }
      console.log(`🔍 Hexadecimal "${rawId}" decodificado como decimal: ${matchId}`);
    } catch (e) {
      showError(`Error decodificando el identificador hexadecimal "${rawId}".`);
      return;
    }
  } else {
    matchId = parseInt(rawId, 10);
  }

  // 3. Cargar futsal-stats.json
  let statsData = null;
  try {
    const cacheBust = "?v=" + new Date().getTime();
    let res = await fetch("data/futsal-stats.json" + cacheBust);
    if (!res.ok) res = await fetch("../data/futsal-stats.json" + cacheBust);
    statsData = await res.json();
  } catch (err) {
    showError("No se pudieron cargar los datos de estadísticas del servidor.");
    console.error(err);
    return;
  }

  // 4. Buscar partido en partidos_detalles
  const match = statsData.partidos_detalles[String(matchId)];
  if (!match) {
    showError(`El partido con ID ${matchId} (código "${rawId}") no se encontró en la base de datos.`);
    return;
  }

  // Ocultar Loader y mostrar contenido
  document.getElementById("loader").style.display = "none";
  document.getElementById("match-content").style.display = "block";

  // 5. Cargar logos de los equipos (opcional de fondo)
  let homeLogo = null;
  let awayLogo = null;
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
    const refGlobal = statsData.arbitros[ref.nombre_completo];
    const refCountLabel = document.getElementById("referee-stats-label");
    if (refGlobal) {
      refCountLabel.textContent = `Dirigió ${refGlobal.partidos_dirigidos} partido(s) de Villa Sahores en este torneo.`;
    } else {
      refCountLabel.textContent = "Árbitro oficial de la federación.";
    }
  } else {
    refereeCard.style.display = "none";
  }

  // 9. Configurar Botones de Compartir
  const shareTitle = `${nombreEquipo(match.local)} ${match.goles_local ?? 0} - ${match.goles_visitante ?? 0} ${nombreEquipo(match.visitante)} (${catLabel}) - Villa Sahores`;
  const shareUrl = window.location.href;
  
  // WhatsApp
  const wsBtn = document.getElementById("btn-share-whatsapp");
  wsBtn.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareTitle + " ⚽👇\n" + shareUrl)}`;
  
  // Telegram
  const tgBtn = document.getElementById("btn-share-telegram");
  tgBtn.href = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareTitle)}`;
  
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
