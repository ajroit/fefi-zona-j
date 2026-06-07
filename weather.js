// weather.js - Pronóstico del clima para el día del partido en Villa Sahores

async function loadWeather(fechaIso) {
  const weatherContainerId = "next-match-weather";
  
  // Buscar el contenedor meta donde inyectaremos el clima
  const metaContainer = document.getElementById("next-match-meta");
  if (!metaContainer) return;

  // Eliminar elemento de clima anterior si existe
  let weatherSpan = document.getElementById(weatherContainerId);
  if (weatherSpan) {
    weatherSpan.remove();
  }

  if (!fechaIso) return;

  // Crear el elemento contenedor para el clima
  weatherSpan = document.createElement("span");
  weatherSpan.id = weatherContainerId;
  weatherSpan.className = "match-meta-item";
  weatherSpan.style.display = "inline-flex";
  weatherSpan.style.alignItems = "center";
  weatherSpan.style.gap = "6px";
  weatherSpan.innerHTML = `
    <span style="font-size: 14px; animation: rotate 2s linear infinite;" class="weather-spinner">⏳</span>
    <span>Cargando clima...</span>
  `;
  metaContainer.appendChild(weatherSpan);

  try {
    // Coordenadas de Club Villa Sahores (Santo Tomé 2496, CABA)
    const lat = -34.6015;
    const lon = -58.4947;
    
    // Consulta a la API gratuita de Open-Meteo (con 16 días de pronóstico para abarcar las próximas dos semanas)
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=America/Argentina/Buenos_Aires&forecast_days=16`);
    if (!response.ok) throw new Error("API Error");
    
    const data = await response.json();
    const daily = data.daily;
    if (!daily || !daily.time) throw new Error("Datos incorrectos");

    // Buscar el índice de la fecha del partido
    const index = daily.time.indexOf(fechaIso);
    if (index === -1) {
      // Si el partido supera los 16 días o ya pasó, no hay pronóstico disponible
      weatherSpan.innerHTML = `🌤️ Clima no disponible`;
      return;
    }

    const code = daily.weather_code[index];
    const maxTemp = Math.round(daily.temperature_2m_max[index]);
    const minTemp = Math.round(daily.temperature_2m_min[index]);

    // Tabla de traducción de códigos WMO a Emojis y descripciones en español
    const weatherMapping = {
      0: { emoji: "☀️", desc: "Despejado" },
      1: { emoji: "🌤️", desc: "Algo nublado" },
      2: { emoji: "⛅", desc: "Parcialmente nublado" },
      3: { emoji: "☁️", desc: "Cubierto" },
      45: { emoji: "🌫️", desc: "Niebla" },
      48: { emoji: "🌫️", desc: "Niebla helada" },
      51: { emoji: "🌧️", desc: "Llovizna leve" },
      53: { emoji: "🌧️", desc: "Llovizna moderada" },
      55: { emoji: "🌧️", desc: "Llovizna fuerte" },
      56: { emoji: "🌧️", desc: "Llovizna helada leve" },
      57: { emoji: "🌧️", desc: "Llovizna helada densa" },
      61: { emoji: "🌧️", desc: "Lluvia leve" },
      63: { emoji: "🌧️", desc: "Lluvia moderada" },
      65: { emoji: "🌧️", desc: "Lluvia fuerte" },
      66: { emoji: "🌧️", desc: "Lluvia helada leve" },
      67: { emoji: "🌧️", desc: "Lluvia helada fuerte" },
      71: { emoji: "❄️", desc: "Nieve leve" },
      73: { emoji: "❄️", desc: "Nieve moderada" },
      75: { emoji: "❄️", desc: "Nieve fuerte" },
      77: { emoji: "❄️", desc: "Granizo de nieve" },
      80: { emoji: "🌦️", desc: "Lluvia leve dispersa" },
      81: { emoji: "🌦️", desc: "Lluvia moderada dispersa" },
      82: { emoji: "🌦️", desc: "Lluvia fuerte dispersa" },
      85: { emoji: "❄️", desc: "Nieve leve dispersa" },
      86: { emoji: "❄️", desc: "Nieve fuerte dispersa" },
      95: { emoji: "⛈️", desc: "Tormenta" },
      96: { emoji: "⛈️", desc: "Tormenta con granizo" },
      99: { emoji: "⛈️", desc: "Tormenta severa" }
    };

    const weatherInfo = weatherMapping[code] || { emoji: "🌤️", desc: "Parcialmente nublado" };

    // Inyectar el clima en el metadato del partido
    weatherSpan.innerHTML = `
      <span style="font-size: 15px; display: inline-flex; animation: hoverPulse 3s ease-in-out infinite;">${weatherInfo.emoji}</span>
      <span>${minTemp}°C / ${maxTemp}°C (${weatherInfo.desc})</span>
    `;
  } catch (error) {
    console.error("Error al obtener clima:", error);
    weatherSpan.innerHTML = `⚠️ Clima no disponible`;
  }
}
