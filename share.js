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

  // Obtener categoría actual y ver si habilitamos botón de Google Calendar
  let catActual = "general";
  if (deporte === "futsal") {
    catActual = typeof futsalCategoriaActual !== 'undefined' ? futsalCategoriaActual : "general";
  } else if (deporte === "futsal-reducido") {
    catActual = typeof futsalRedCategoriaActual !== 'undefined' ? futsalRedCategoriaActual : "general";
  } else if (deporte === "futsal-femenino") {
    catActual = typeof futsalFemeninoCategoriaActual !== 'undefined' ? futsalFemeninoCategoriaActual : "general";
  }

  let gCalUrl = "";
  if (deporte !== "babyfutbol" && catActual !== "general") {
    let data = null;
    let nombreDeporte = "";
    if (deporte === "futsal") {
      data = typeof FUTSAL_DATA !== 'undefined' ? FUTSAL_DATA : null;
      nombreDeporte = "Futsal - Liga de Honor";
    } else if (deporte === "futsal-reducido") {
      data = typeof FUTSAL_RED_DATA !== 'undefined' ? FUTSAL_RED_DATA : null;
      nombreDeporte = "Futsal - Reducido";
    } else if (deporte === "futsal-femenino") {
      data = typeof FUTSAL_FEMENINO_DATA !== 'undefined' ? FUTSAL_FEMENINO_DATA : null;
      nombreDeporte = "Futsal - Femenino";
    }

    if (data) {
      let encuentro = null;
      for (const f of data.fechas) {
        if (f.numero === numeroFecha) {
          for (const e of f.encuentros) {
            if (e.local === rival || e.visitante === rival) {
              encuentro = e;
              break;
            }
          }
        }
      }

      if (encuentro) {
        const p = encuentro.partidos[catActual];
        if (p && p.fecha_hora && p.sede) {
          const datetimeStr = p.fecha_hora.trim();
          const matchDate = datetimeStr.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+|T)(\d{2}):(\d{2})/);
          if (matchDate) {
            const [, year, month, day, hour, minute] = matchDate;
            const start = `${year}${month}${day}T${hour}${minute}00`;
            
            const jsDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
            const jsEndDate = new Date(jsDate.getTime() + 60 * 60 * 1000); // 1 hora de duración
            const endYear = jsEndDate.getFullYear();
            const endMonth = String(jsEndDate.getMonth() + 1).padStart(2, '0');
            const endDay = String(jsEndDate.getDate()).padStart(2, '0');
            const endHour = String(jsEndDate.getHours()).padStart(2, '0');
            const endMinute = String(jsEndDate.getMinutes()).padStart(2, '0');
            const end = `${endYear}${endMonth}${endDay}T${endHour}${endMinute}00`;
            
            const datesParam = `${start}/${end}`;
            
            let catLabel = catActual;
            if (deporte === "futsal" && typeof FUTSAL_CAT_LABELS !== 'undefined') {
              catLabel = FUTSAL_CAT_LABELS[catActual] || catActual;
            } else if (deporte === "futsal-reducido") {
              if (catActual === "PRIMERA MASCULINO") catLabel = "1ra";
              else if (catActual === "TERCERA MASCULINO") catLabel = "3ra";
              else if (catActual === "CUARTA MASCULINO") catLabel = "4ta";
              else if (catActual === "QUINTA MASCULINO") catLabel = "5ta";
              else if (catActual === "SEXTA MASCULINO") catLabel = "6ta";
              else if (catActual === "SEPTIMA MASCULINO") catLabel = "7ma";
              else if (catActual === "OCTAVA MASCULINO") catLabel = "8va";
            } else if (deporte === "futsal-femenino" && typeof FUTSAL_FEMENINO_CAT_LABELS !== 'undefined') {
              catLabel = FUTSAL_FEMENINO_CAT_LABELS[catActual] || catActual;
            }

            const local = encuentro.local;
            const visitante = encuentro.visitante;
            const title = `Futsal: ${local} vs ${visitante} (${catLabel})`;
            const location = `${p.sede}${p.direccion ? ', ' + p.direccion : ''}`;
            const details = `🏆 Torneo: ${nombreDeporte} (Fecha ${numeroFecha})\n🆚 Encuentro: ${local} vs ${visitante}\n📍 Sede: ${location}\n\n¡Vamos Sahores! 💪🔴⚫`;
            
            gCalUrl = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${datesParam}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}`;
          }
        }
      }
    }
  }

  // Obtener fecha del partido en formato ISO para el pronóstico del clima
  let fechaMatchIso = "";
  let dataWeather = null;
  if (deporte === "babyfutbol") {
    dataWeather = typeof DATA !== 'undefined' ? DATA : null;
  } else if (deporte === "futsal") {
    dataWeather = typeof FUTSAL_DATA !== 'undefined' ? FUTSAL_DATA : null;
  } else if (deporte === "futsal-reducido") {
    dataWeather = typeof FUTSAL_RED_DATA !== 'undefined' ? FUTSAL_RED_DATA : null;
  } else if (deporte === "futsal-femenino") {
    dataWeather = typeof FUTSAL_FEMENINO_DATA !== 'undefined' ? FUTSAL_FEMENINO_DATA : null;
  }

  if (dataWeather) {
    let encuentroWeather = null;
    let fechaObjWeather = null;
    for (const f of dataWeather.fechas) {
      if (f.numero === numeroFecha) {
        for (const e of f.encuentros) {
          if (e.local === rival || e.visitante === rival) {
            encuentroWeather = e;
            fechaObjWeather = f;
            break;
          }
        }
      }
    }

    if (encuentroWeather) {
      if (deporte === "babyfutbol") {
        if (fechaObjWeather && fechaObjWeather.fecha_partido) {
          fechaMatchIso = fechaObjWeather.fecha_partido;
        }
      } else {
        if (catActual !== "general") {
          const p = encuentroWeather.partidos[catActual];
          if (p && p.fecha_hora) {
            fechaMatchIso = p.fecha_hora.includes(" ") ? p.fecha_hora.split(" ")[0] : (p.fecha_hora.includes("T") ? p.fecha_hora.split("T")[0] : p.fecha_hora);
          }
        }
        if (!fechaMatchIso) {
          for (const cat of dataWeather.categorias) {
            const p = encuentroWeather.partidos[cat];
            if (p && p.fecha_hora) {
              const iso = p.fecha_hora.includes(" ") ? p.fecha_hora.split(" ")[0] : (p.fecha_hora.includes("T") ? p.fecha_hora.split("T")[0] : p.fecha_hora);
              if (iso) {
                fechaMatchIso = iso;
                break;
              }
            }
          }
        }
        if (!fechaMatchIso && fechaObjWeather && fechaObjWeather.fecha_partido) {
          fechaMatchIso = fechaObjWeather.fecha_partido;
        }
      }
    }
  }

  if (typeof loadWeather === 'function') {
    loadWeather(fechaMatchIso);
  }

  container.innerHTML = `
    <div class="share-actions-wrapper">
      <a href="${waUrl}" target="_blank" rel="noopener" class="btn-share-social whatsapp" title="Compartir directo en WhatsApp">
        <svg viewBox="0 0 24 24" fill="currentColor" class="icon-social">
          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.717-1.458L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.97C16.328 1.968 13.861.94 11.997.94c-5.441 0-9.87 4.372-9.874 9.802-.002 1.768.468 3.49 1.36 5.041L2.447 21.5l5.8-1.513z"/>
          <path d="M15.42 12.924c-.266-.134-1.579-.78-1.823-.869-.243-.089-.422-.134-.599.134-.178.267-.688.869-.843 1.047-.155.178-.311.2-.577.067-.267-.134-1.127-.417-2.148-1.328-.794-.709-1.33-1.585-1.486-1.853-.155-.267-.016-.411.118-.544.12-.119.267-.312.4-.468.133-.156.177-.267.266-.445.09-.178.044-.334-.022-.468-.067-.134-.599-1.448-.821-1.983-.216-.52-.435-.449-.599-.458-.155-.008-.333-.01-.51-.01s-.467.067-.71.334c-.244.267-.933.913-.933 2.228 0 1.314.954 2.584 1.088 2.762.133.178 1.877 2.867 4.549 4.02.636.275 1.132.44 1.52.563.639.203 1.22.174 1.68.107.512-.074 1.579-.646 1.8-.1.223-.546.223-1.014.156-1.092-.067-.079-.244-.134-.511-.267z"/>
        </svg>
      </a>
      ${gCalUrl ? `
      <a href="${gCalUrl}" target="_blank" rel="noopener" class="btn-share-social google-calendar" title="Agregar al Google Calendar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon-social">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      </a>
      ` : ""}
      <div class="share-toast" id="share-toast">📋 ¡Texto copiado al portapapeles!</div>
    </div>
  `;
}
