// share.js - Componente para compartir detalles de partidos de Villa Sahores

function formatFechaDia(isoString) {
  if (!isoString) return "";
  const [y, m, d] = isoString.split("-");
  const f = new Date(isoString + "T12:00:00");
  const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  return `${dias[f.getDay()]} ${parseInt(d)} de ${meses[parseInt(m) - 1]}`;
}

function generarTextoCompartir(deporte, numeroFecha, rival) {
  let data = null;
  let nombreDeporte = "";
  
  if (deporte === "babyfutbol") {
    data = typeof DATA !== 'undefined' ? DATA : null;
    nombreDeporte = "Baby Fútbol - FEFI";
  } else if (deporte === "futsal") {
    data = typeof FUTSAL_DATA !== 'undefined' ? FUTSAL_DATA : null;
    nombreDeporte = "Futsal - Liga de Honor";
  } else if (deporte === "futsal-reducido") {
    data = typeof FUTSAL_RED_DATA !== 'undefined' ? FUTSAL_RED_DATA : null;
    nombreDeporte = "Futsal - Reducido";
  } else if (deporte === "futsal-femenino") {
    data = typeof FUTSAL_FEMENINO_DATA !== 'undefined' ? FUTSAL_FEMENINO_DATA : null;
    nombreDeporte = "Futsal - Femenino";
  }

  if (!data) return "";

  // Buscar encuentro
  let encuentro = null;
  let fechaObj = null;
  for (const f of data.fechas) {
    if (f.numero === numeroFecha) {
      for (const e of f.encuentros) {
        if (e.local === rival || e.visitante === rival) {
          encuentro = e;
          fechaObj = f;
          break;
        }
      }
    }
  }

  if (!encuentro) return "";

  const local = encuentro.local;
  const visitante = encuentro.visitante;

  let texto = `⚽ *¡Próximo Partido - Villa Sahores!*\n\n`;
  texto += `🏆 *${nombreDeporte}* (Fecha ${numeroFecha})\n`;
  texto += `🆚 *${local} vs ${visitante}*\n`;

  // Sede y dirección
  let sede = "";
  let direccion = "";
  let fechaMatch = "";

  if (deporte === "babyfutbol") {
    const eqLocal = (data.equipos || []).find(e => e.nombre === local);
    if (eqLocal && eqLocal.direccion) {
      sede = local;
      direccion = `${eqLocal.direccion}, ${eqLocal.localidad || ""}`;
    }
    if (fechaObj && fechaObj.fecha_partido) {
      fechaMatch = formatFechaDia(fechaObj.fecha_partido);
    }
  } else {
    for (const cat of data.categorias) {
      const p = encuentro.partidos[cat];
      if (p) {
        if (!sede && p.sede) {
          sede = p.sede;
          direccion = p.direccion || "";
        }
        if (!fechaMatch && p.fecha_hora) {
          const iso = p.fecha_hora.includes(" ") ? p.fecha_hora.split(" ")[0] : (p.fecha_hora.includes("T") ? p.fecha_hora.split("T")[0] : "");
          if (iso) fechaMatch = formatFechaDia(iso);
        }
      }
    }
    if (!fechaMatch && fechaObj && fechaObj.fecha_partido) {
      fechaMatch = formatFechaDia(fechaObj.fecha_partido);
    }
  }

  if (fechaMatch) {
    texto += `📅 ${fechaMatch}\n`;
  }
  if (sede) {
    texto += `📍 Sede: *${sede}*${direccion ? ' (' + direccion + ')' : ''}\n`;
  } else {
    texto += `📍 Sede: *Pendiente*\n`;
  }

  if (deporte !== "babyfutbol") {
    texto += `\n*Horarios por categoría:*\n`;
    const listaCategorias = [];
    for (const cat of data.categorias) {
      const p = encuentro.partidos[cat];
      if (p) {
        let hora = "Pendiente";
        let sortKey = "99:99";
        if (p.fecha_hora) {
          const h = p.fecha_hora.includes(" ") ? p.fecha_hora.split(" ")[1].substring(0, 5) : (p.fecha_hora.includes("T") ? p.fecha_hora.split("T")[1].substring(0, 5) : "");
          if (h) {
            hora = `${h} hs`;
            sortKey = h;
          }
        }
        
        let catLabel = cat;
        if (deporte === "futsal" && typeof FUTSAL_CAT_LABELS !== 'undefined') {
          catLabel = FUTSAL_CAT_LABELS[cat] || cat;
        } else if (deporte === "futsal-reducido") {
          // Usar labels cortos si existen en el ámbito
          if (cat === "PRIMERA MASCULINO") catLabel = "1ra";
          else if (cat === "TERCERA MASCULINO") catLabel = "3ra";
          else if (cat === "CUARTA MASCULINO") catLabel = "4ta";
          else if (cat === "QUINTA MASCULINO") catLabel = "5ta";
          else if (cat === "SEXTA MASCULINO") catLabel = "6ta";
          else if (cat === "SEPTIMA MASCULINO") catLabel = "7ma";
          else if (cat === "OCTAVA MASCULINO") catLabel = "8va";
        } else if (deporte === "futsal-femenino" && typeof FUTSAL_FEMENINO_CAT_LABELS !== 'undefined') {
          catLabel = FUTSAL_FEMENINO_CAT_LABELS[cat] || cat;
        }
        
        listaCategorias.push({ cat: catLabel.trim(), hora, sortKey });
      }
    }
    
    listaCategorias.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    listaCategorias.forEach(c => {
      texto += `🔸 ${c.cat}: ${c.hora}\n`;
    });
  }

  texto += `\n¡Vamos Sahores! 💪🔴⚫`;
  return texto;
}

function compartirMatch(deporte, numeroFecha, rival) {
  const texto = generarTextoCompartir(deporte, numeroFecha, rival);
  if (!texto) return;

  if (navigator.share) {
    navigator.share({
      title: 'Próximo Partido - Villa Sahores',
      text: texto
    }).catch(err => {
      console.log("Error o cancelación al compartir nativamente:", err);
    });
  } else {
    navigator.clipboard.writeText(texto).then(() => {
      const toast = document.getElementById("share-toast");
      if (toast) {
        toast.classList.add("show");
        setTimeout(() => {
          toast.classList.remove("show");
        }, 2500);
      }
    }).catch(err => {
      console.error("Error al copiar al portapapeles:", err);
      alert("No se pudo copiar el texto. Por favor inténtalo de nuevo.");
    });
  }
}

function renderizarBotonCompartir(deporte, numeroFecha, rival) {
  const container = document.getElementById("next-match-actions");
  if (!container) return;

  const texto = generarTextoCompartir(deporte, numeroFecha, rival);
  const textoEncoded = encodeURIComponent(texto);
  const waUrl = `https://api.whatsapp.com/send?text=${textoEncoded}`;
  const tgUrl = `https://t.me/share/url?url=&text=${textoEncoded}`;

  container.innerHTML = `
    <div class="share-actions-wrapper">
      <button class="btn-share-main" onclick="compartirMatch('${deporte}', ${numeroFecha}, '${rival}')" title="Copiar o compartir texto formateado">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon-share">
          <circle cx="18" cy="5" r="3"></circle>
          <circle cx="6" cy="12" r="3"></circle>
          <circle cx="18" cy="19" r="3"></circle>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
          <line x1="8.59" y1="10.49" x2="15.41" y2="6.51"></line>
        </svg>
        <span>Compartir / Copiar</span>
      </button>
      <a href="${waUrl}" target="_blank" rel="noopener" class="btn-share-social whatsapp" title="Compartir directo en WhatsApp">
        <svg viewBox="0 0 24 24" fill="currentColor" class="icon-social">
          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.717-1.458L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.97C16.328 1.968 13.861.94 11.997.94c-5.441 0-9.87 4.372-9.874 9.802-.002 1.768.468 3.49 1.36 5.041L2.447 21.5l5.8-1.513z"/>
          <path d="M15.42 12.924c-.266-.134-1.579-.78-1.823-.869-.243-.089-.422-.134-.599.134-.178.267-.688.869-.843 1.047-.155.178-.311.2-.577.067-.267-.134-1.127-.417-2.148-1.328-.794-.709-1.33-1.585-1.486-1.853-.155-.267-.016-.411.118-.544.12-.119.267-.312.4-.468.133-.156.177-.267.266-.445.09-.178.044-.334-.022-.468-.067-.134-.599-1.448-.821-1.983-.216-.52-.435-.449-.599-.458-.155-.008-.333-.01-.51-.01s-.467.067-.71.334c-.244.267-.933.913-.933 2.228 0 1.314.954 2.584 1.088 2.762.133.178 1.877 2.867 4.549 4.02.636.275 1.132.44 1.52.563.639.203 1.22.174 1.68.107.512-.074 1.579-.646 1.8-.1.223-.546.223-1.014.156-1.092-.067-.079-.244-.134-.511-.267z"/>
        </svg>
      </a>
      <a href="${tgUrl}" target="_blank" rel="noopener" class="btn-share-social telegram" title="Compartir directo en Telegram">
        <svg viewBox="0 0 24 24" fill="currentColor" class="icon-social">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.02-1.96 1.25-5.54 3.69-.52.36-1 .53-1.42.52-.47-.01-1.37-.26-2.03-.48-.82-.27-1.47-.42-1.42-.88.03-.24.35-.49.96-.75 3.78-1.65 6.31-2.74 7.58-3.27 3.61-1.51 4.35-1.78 4.84-1.79.11 0 .35.03.5.16.13.12.17.28.19.39.02.06.02.16.01.25z"/>
        </svg>
      </a>
      <div class="share-toast" id="share-toast">📋 ¡Texto copiado al portapapeles!</div>
    </div>
  `;
}
