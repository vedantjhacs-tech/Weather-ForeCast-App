/* ==========================================================================
   1. STATE MANAGEMENT
   ========================================================================== */
const appState = {
  currentCity: "",
  country: "",
  latitude: null,
  longitude: null,
  unit: "celsius", // 'celsius' or 'fahrenheit'
  theme: "dark",   // 'dark' or 'light'
  weatherData: null,
  recentSearches: JSON.parse(localStorage.getItem("recentSearches")) || []
};

/* ==========================================================================
   2. DOM ELEMENT REFERENCES
   ========================================================================== */
const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");
const geoBtn = document.getElementById("geo-btn");
const refreshBtn = document.getElementById("refresh-btn");
const statusContainer = document.getElementById("status-container");
const statusMessage = document.getElementById("status-message");
const weatherContent = document.getElementById("weather-content");

// Weather display elements
const locationNameEl = document.getElementById("location-name");
const lastUpdatedEl = document.getElementById("last-updated");
const currentIconEl = document.getElementById("current-icon");
const currentTempEl = document.getElementById("current-temp");
const currentConditionEl = document.getElementById("current-condition");
const feelsLikeTempEl = document.getElementById("feels-like-temp");
const humidityValEl = document.getElementById("humidity-val");
const windValEl = document.getElementById("wind-val");
const precipValEl = document.getElementById("precip-val");
const sunValEl = document.getElementById("sun-val");
const forecastGridEl = document.getElementById("forecast-grid");

// Control elements
const unitCBtn = document.getElementById("unit-c");
const unitFBtn = document.getElementById("unit-f");
const themeToggleBtn = document.getElementById("theme-toggle-btn");
const themeIconEl = document.getElementById("theme-icon");
const recentSearchesContainer = document.getElementById("recent-searches-container");
const recentChipsEl = document.getElementById("recent-chips");

/* ==========================================================================
   3. WMO WEATHER CODE MAPPING
   ========================================================================== */
function getWeatherDetails(code) {
  // WMO Weather Interpretation Codes (WW)
  const weatherMap = {
    0: { condition: "Clear Sky", icon: "☀️" },
    1: { condition: "Mainly Clear", icon: "🌤️" },
    2: { condition: "Partly Cloudy", icon: "⛅" },
    3: { condition: "Overcast", icon: "☁️" },
    45: { condition: "Foggy", icon: "🌫️" },
    48: { condition: "Depositing Rime Fog", icon: "🌫️" },
    51: { condition: "Light Drizzle", icon: "🌧️" },
    53: { condition: "Moderate Drizzle", icon: "🌧️" },
    55: { condition: "Dense Drizzle", icon: "🌧️" },
    61: { condition: "Slight Rain", icon: "🌧️" },
    63: { condition: "Moderate Rain", icon: "🌧️" },
    65: { condition: "Heavy Rain", icon: "🌧️" },
    71: { condition: "Slight Snow", icon: "❄️" },
    73: { condition: "Moderate Snow", icon: "❄️" },
    75: { condition: "Heavy Snow", icon: "❄️" },
    80: { condition: "Slight Rain Showers", icon: "🌦️" },
    81: { condition: "Moderate Rain Showers", icon: "🌦️" },
    82: { condition: "Violent Rain Showers", icon: "⛈️" },
    95: { condition: "Thunderstorm", icon: "⚡" },
    96: { condition: "Thunderstorm with Hail", icon: "⛈️" },
    99: { condition: "Severe Thunderstorm", icon: "⛈️" }
  };

  return weatherMap[code] || { condition: "Unknown", icon: "🌡️" };
}

/* ==========================================================================
   4. UI STATE HELPERS (Loading, Error, Display)
   ========================================================================== */
function showLoading() {
  statusContainer.classList.remove("hidden");
  statusMessage.textContent = "⏳ Fetching weather data...";
  weatherContent.classList.add("hidden");
}

function showError(message) {
  statusContainer.classList.remove("hidden");
  statusMessage.textContent = `❌ ${message}`;
  weatherContent.classList.add("hidden");
}

function showWeather() {
  statusContainer.classList.add("hidden");
  weatherContent.classList.remove("hidden");
}

/* ==========================================================================
   5. API FETCHING LOGIC
   ========================================================================== */
// Step A: Geocode city name to lat/lon
async function fetchCoordinates(cityName) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`;
  
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to reach geocoding service.");
  
  const data = await response.json();
  if (!data.results || data.results.length === 0) {
    throw new Error(`Location "${cityName}" not found. Please check spelling.`);
  }

  const result = data.results[0];
  return {
    name: result.name,
    country: result.country || result.admin1 || "",
    latitude: result.latitude,
    longitude: result.longitude
  };
}

// Step B: Fetch weather using lat/lon
async function fetchWeatherData(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&timezone=auto`;

  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch weather data from API.");

  return await response.json();
}

// Step C: Unified search workflow
async function handleSearch(cityName) {
  if (!cityName.trim()) {
    showError("Please enter a valid city name.");
    return;
  }

  try {
    showLoading();

    // 1. Get Lat/Lon
    const geoData = await fetchCoordinates(cityName);
    appState.currentCity = geoData.name;
    appState.country = geoData.country;
    appState.latitude = geoData.latitude;
    appState.longitude = geoData.longitude;

    // 2. Fetch Weather Data
    const weatherData = await fetchWeatherData(geoData.latitude, geoData.longitude);
    appState.weatherData = weatherData;

    // 3. Render
    renderWeather();
    saveRecentSearch(geoData.name);
    showWeather();

  } catch (error) {
    showError(error.message);
  }
}

/* ==========================================================================
   6. RENDERING FUNCTIONS
   ========================================================================== */
function renderWeather() {
  const data = appState.weatherData;
  if (!data) return;

  const current = data.current;
  const daily = data.daily;
  const isFahrenheit = appState.unit === "fahrenheit";

  // Helper unit converters
  const convertTemp = (celsius) => isFahrenheit ? Math.round((celsius * 9/5) + 32) : Math.round(celsius);
  const tempUnitSymbol = isFahrenheit ? "°F" : "°C";
  const speedUnitSymbol = isFahrenheit ? "mph" : "km/h";
  const convertSpeed = (kmh) => isFahrenheit ? Math.round(kmh * 0.621371) : Math.round(kmh);

  // Update Location & Last Updated
  locationNameEl.textContent = appState.country 
    ? `${appState.currentCity}, ${appState.country}` 
    : appState.currentCity;
  
  const now = new Date();
  lastUpdatedEl.textContent = `Last updated: ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  // Update Current Weather Card
  const weatherDetail = getWeatherDetails(current.weather_code);
  currentIconEl.textContent = weatherDetail.icon;
  currentConditionEl.textContent = weatherDetail.condition;
  currentTempEl.textContent = convertTemp(current.temperature_2m);
  feelsLikeTempEl.textContent = convertTemp(current.apparent_temperature);

  document.querySelectorAll(".temp-unit").forEach(el => el.textContent = tempUnitSymbol);

  humidityValEl.textContent = `${current.relative_humidity_2m}%`;
  windValEl.textContent = `${convertSpeed(current.wind_speed_10m)} ${speedUnitSymbol}`;
  precipValEl.textContent = `${current.precipitation} mm`;

  // Parse Sunrise / Sunset
  const formatTime = (timeStr) => {
    if (!timeStr) return "--";
    const date = new Date(timeStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  const sunriseTime = formatTime(daily.sunrise[0]);
  const sunsetTime = formatTime(daily.sunset[0]);
  sunValEl.textContent = `${sunriseTime} / ${sunsetTime}`;

  // Render 7-Day Forecast Grid
  forecastGridEl.innerHTML = "";
  for (let i = 0; i < daily.time.length; i++) {
    const dateObj = new Date(daily.time[i] + "T00:00:00");
    const dayName = i === 0 ? "Today" : dateObj.toLocaleDateString("en-US", { weekday: "short" });
    const dayWeather = getWeatherDetails(daily.weather_code[i]);
    const maxTemp = convertTemp(daily.temperature_2m_max[i]);
    const minTemp = convertTemp(daily.temperature_2m_min[i]);
    const precipProb = daily.precipitation_probability_max[i];

    const card = document.createElement("div");
    card.className = "forecast-card";
    card.innerHTML = `
      <span class="forecast-date">${dayName}</span>
      <span class="forecast-icon">${dayWeather.icon}</span>
      <div class="forecast-temps">
        <span class="temp-max">${maxTemp}${tempUnitSymbol}</span>
        <span class="temp-min">${minTemp}${tempUnitSymbol}</span>
      </div>
      <span class="forecast-precip">🌧️ ${precipProb}%</span>
    `;
    forecastGridEl.appendChild(card);
  }
}

/* ==========================================================================
   7. INITIAL EVENT LISTENERS & SETUP
   ========================================================================== */
searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  handleSearch(searchInput.value);
});

// Load default city on initial launch
handleSearch("Chandigarh");
/* ==========================================================================
   8. RECENT SEARCHES & LOCAL STORAGE
   ========================================================================== */
function saveRecentSearch(city) {
  // Filter out duplicates and keep max 5 recent searches
  let searches = appState.recentSearches.filter(
    (item) => item.toLowerCase() !== city.toLowerCase()
  );
  searches.unshift(city);
  if (searches.length > 5) searches.pop();

  appState.recentSearches = searches;
  localStorage.setItem("recentSearches", JSON.stringify(searches));
  renderRecentSearches();
}

function renderRecentSearches() {
  if (appState.recentSearches.length === 0) {
    recentSearchesContainer.classList.add("hidden");
    return;
  }

  recentSearchesContainer.classList.remove("hidden");
  recentChipsEl.innerHTML = "";

  appState.recentSearches.forEach((city) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = city;
    chip.addEventListener("click", () => {
      searchInput.value = city;
      handleSearch(city);
    });
    recentChipsEl.appendChild(chip);
  });
}

/* ==========================================================================
   9. GEOLOCATION ("USE MY LOCATION")
   ========================================================================== */
async function fetchCityNameFromCoords(lat, lon) {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${lat.toFixed(2)},${lon.toFixed(2)}&count=1&language=en&format=json`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      return {
        name: data.results[0].name,
        country: data.results[0].country || ""
      };
    }
  } catch (e) {
    // Fallback if reverse lookup fails
  }
  return { name: "Your Location", country: "" };
}

geoBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    showError("Geolocation is not supported by your browser.");
    return;
  }

  showLoading();

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        const locationDetails = await fetchCityNameFromCoords(lat, lon);
        appState.currentCity = locationDetails.name;
        appState.country = locationDetails.country;
        appState.latitude = lat;
        appState.longitude = lon;

        const weatherData = await fetchWeatherData(lat, lon);
        appState.weatherData = weatherData;

        renderWeather();
        showWeather();
      } catch (err) {
        showError("Failed to fetch weather for your current location.");
      }
    },
    (error) => {
      switch (error.code) {
        case error.PERMISSION_DENIED:
          showError("Location permission denied. Please search manually.");
          break;
        case error.POSITION_UNAVAILABLE:
          showError("Location information unavailable.");
          break;
        case error.TIMEOUT:
          showError("Location request timed out.");
          break;
        default:
          showError("An unknown error occurred while getting location.");
      }
    }
  );
});

/* ==========================================================================
   10. UNIT & THEME TOGGLES + REFRESH
   ========================================================================== */
// Unit Toggle (°C / °F)
unitCBtn.addEventListener("click", () => {
  if (appState.unit === "celsius") return;
  appState.unit = "celsius";
  unitCBtn.classList.add("active");
  unitFBtn.classList.remove("active");
  renderWeather();
});

unitFBtn.addEventListener("click", () => {
  if (appState.unit === "fahrenheit") return;
  appState.unit = "fahrenheit";
  unitFBtn.classList.add("active");
  unitCBtn.classList.remove("active");
  renderWeather();
});

// Theme Switcher (Dark / Light)
themeToggleBtn.addEventListener("click", () => {
  const currentTheme = document.documentElement.getAttribute("data-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";

  document.documentElement.setAttribute("data-theme", newTheme);
  appState.theme = newTheme;
  themeIconEl.textContent = newTheme === "dark" ? "🌙" : "☀️";
  localStorage.setItem("appTheme", newTheme);
});

// Load Persisted Theme Preferences
const savedTheme = localStorage.getItem("appTheme");
if (savedTheme) {
  document.documentElement.setAttribute("data-theme", savedTheme);
  appState.theme = savedTheme;
  themeIconEl.textContent = savedTheme === "dark" ? "🌙" : "☀️";
}

// Refresh Button Handler
refreshBtn.addEventListener("click", async () => {
  if (appState.latitude && appState.longitude) {
    try {
      showLoading();
      const weatherData = await fetchWeatherData(appState.latitude, appState.longitude);
      appState.weatherData = weatherData;
      renderWeather();
      showWeather();
    } catch (err) {
      showError("Failed to refresh weather data.");
    }
  }
});

// Initial Render of Recent Searches
renderRecentSearches();