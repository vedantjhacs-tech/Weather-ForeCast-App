/* ==========================================================================
   WEATHERPULSE - COMPLETE SCRIPT
   ========================================================================== */


/* ==========================================================================
   1. STATE MANAGEMENT
   ========================================================================== */

function loadRecentSearches() {
  try {
    const saved = JSON.parse(
      localStorage.getItem("recentSearches")
    );

    if (!Array.isArray(saved)) {
      return [];
    }

    return saved.filter(
      (item) =>
        typeof item === "string" &&
        item.trim().length > 0
    );
  } catch (error) {
    console.error(
      "Could not load recent searches:",
      error
    );

    return [];
  }
}


const appState = {
  currentCity: "",
  country: "",
  latitude: null,
  longitude: null,
  accuracy: null,

  unit: "celsius",
  theme: "dark",

  weatherData: null,

  recentSearches: loadRecentSearches()
};


let latestRequestId = 0;
let isLocating = false;
let isRefreshing = false;


/* ==========================================================================
   2. WEATHER CACHE + REQUEST OPTIMIZATION
   ========================================================================== */

const WEATHER_CACHE_DURATION =
  5 * 60 * 1000;

const GEO_CACHE_DURATION =
  10 * 60 * 1000;


/*
   Completed weather responses.
*/
const weatherCache =
  new Map();


/*
   Completed city → coordinates responses.
*/
const geocodingCache =
  new Map();


/*
   Currently running requests.

   These prevent duplicate API calls when
   the same request is already in progress.
*/
const inFlightWeatherRequests =
  new Map();

const inFlightGeocodingRequests =
  new Map();


/*
   Version number for each weather location.

   This prevents an older request from
   overwriting the result of a newer request.
*/
const weatherRequestVersions =
  new Map();


function getWeatherCacheKey(
  latitude,
  longitude
) {
  const lat =
    Number(latitude);

  const lon =
    Number(longitude);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    return null;
  }

  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}


function getCachedWeather(
  latitude,
  longitude
) {
  const key =
    getWeatherCacheKey(
      latitude,
      longitude
    );

  if (!key) {
    return null;
  }

  const cached =
    weatherCache.get(key);

  if (!cached) {
    return null;
  }

  const age =
    Date.now() -
    cached.timestamp;

  if (
    age >= WEATHER_CACHE_DURATION
  ) {
    weatherCache.delete(key);

    return null;
  }

  return cached.data;
}


function setCachedWeather(
  latitude,
  longitude,
  data
) {
  const key =
    getWeatherCacheKey(
      latitude,
      longitude
    );

  if (!key || !data) {
    return;
  }

  weatherCache.set(
    key,
    {
      data,
      timestamp: Date.now()
    }
  );
}


function clearWeatherCache(
  latitude,
  longitude
) {
  const key =
    getWeatherCacheKey(
      latitude,
      longitude
    );

  if (key) {
    weatherCache.delete(key);
  }
}


/* --------------------------------------------------------------------------
   GEOCODING CACHE
   -------------------------------------------------------------------------- */

function getGeocodingCacheKey(
  cityName
) {
  if (
    typeof cityName !== "string"
  ) {
    return null;
  }

  const normalized =
    cityName
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

  return normalized || null;
}


function getCachedCoordinates(
  cityName
) {
  const key =
    getGeocodingCacheKey(
      cityName
    );

  if (!key) {
    return null;
  }

  const cached =
    geocodingCache.get(key);

  if (!cached) {
    return null;
  }

  const age =
    Date.now() -
    cached.timestamp;

  if (
    age >= GEO_CACHE_DURATION
  ) {
    geocodingCache.delete(key);

    return null;
  }

  return cached.data;
}


function setCachedCoordinates(
  cityName,
  data
) {
  const key =
    getGeocodingCacheKey(
      cityName
    );

  if (!key || !data) {
    return;
  }

  geocodingCache.set(
    key,
    {
      data,
      timestamp: Date.now()
    }
  );
}


/* --------------------------------------------------------------------------
   REQUEST VERSIONING
   -------------------------------------------------------------------------- */

function getNextWeatherRequestVersion(
  latitude,
  longitude
) {
  const key =
    getWeatherCacheKey(
      latitude,
      longitude
    );

  if (!key) {
    return null;
  }

  const nextVersion =
    (weatherRequestVersions.get(key) || 0) + 1;

  weatherRequestVersions.set(
    key,
    nextVersion
  );

  return {
    key,
    version: nextVersion
  };
}


/* ==========================================================================
   3. DOM ELEMENTS
   ========================================================================== */

const searchForm =
  document.getElementById(
    "search-form"
  );

const searchInput =
  document.getElementById(
    "search-input"
  );

const geoBtn =
  document.getElementById(
    "geo-btn"
  );

const refreshBtn =
  document.getElementById(
    "refresh-btn"
  );

const statusContainer =
  document.getElementById(
    "status-container"
  );

const statusMessage =
  document.getElementById(
    "status-message"
  );

const weatherContent =
  document.getElementById(
    "weather-content"
  );

const locationNameEl =
  document.getElementById(
    "location-name"
  );

const lastUpdatedEl =
  document.getElementById(
    "last-updated"
  );

const currentIconEl =
  document.getElementById(
    "current-icon"
  );

const currentTempEl =
  document.getElementById(
    "current-temp"
  );

const currentConditionEl =
  document.getElementById(
    "current-condition"
  );

const feelsLikeTempEl =
  document.getElementById(
    "feels-like-temp"
  );

const humidityValEl =
  document.getElementById(
    "humidity-val"
  );

const windValEl =
  document.getElementById(
    "wind-val"
  );

const precipValEl =
  document.getElementById(
    "precip-val"
  );

const sunValEl =
  document.getElementById(
    "sun-val"
  );

const forecastGridEl =
  document.getElementById(
    "forecast-grid"
  );

const unitCBtn =
  document.getElementById(
    "unit-c"
  );

const unitFBtn =
  document.getElementById(
    "unit-f"
  );

const themeToggleBtn =
  document.getElementById(
    "theme-toggle-btn"
  );

const themeIconEl =
  document.getElementById(
    "theme-icon"
  );

const recentSearchesContainer =
  document.getElementById(
    "recent-searches-container"
  );

const recentChipsEl =
  document.getElementById(
    "recent-chips"
  );

const advisorySection =
  document.getElementById(
    "farming-advisory"
  );

const advisoryContent =
  document.getElementById(
    "advisory-content"
  );


/* ==========================================================================
   4. WEATHER CODE MAP
   ========================================================================== */

const weatherMap = {
  0: {
    condition: "Clear Sky",
    icon: "☀️"
  },

  1: {
    condition: "Mainly Clear",
    icon: "🌤️"
  },

  2: {
    condition: "Partly Cloudy",
    icon: "⛅"
  },

  3: {
    condition: "Overcast",
    icon: "☁️"
  },

  45: {
    condition: "Foggy",
    icon: "🌫️"
  },

  48: {
    condition: "Depositing Rime Fog",
    icon: "🌫️"
  },

  51: {
    condition: "Light Drizzle",
    icon: "🌧️"
  },

  53: {
    condition: "Moderate Drizzle",
    icon: "🌧️"
  },

  55: {
    condition: "Dense Drizzle",
    icon: "🌧️"
  },

  56: {
    condition: "Light Freezing Drizzle",
    icon: "🌧️"
  },

  57: {
    condition: "Dense Freezing Drizzle",
    icon: "🌧️"
  },

  61: {
    condition: "Slight Rain",
    icon: "🌧️"
  },

  63: {
    condition: "Moderate Rain",
    icon: "🌧️"
  },

  65: {
    condition: "Heavy Rain",
    icon: "🌧️"
  },

  66: {
    condition: "Light Freezing Rain",
    icon: "🌧️"
  },

  67: {
    condition: "Heavy Freezing Rain",
    icon: "🌧️"
  },

  71: {
    condition: "Slight Snow",
    icon: "❄️"
  },

  73: {
    condition: "Moderate Snow",
    icon: "❄️"
  },

  75: {
    condition: "Heavy Snow",
    icon: "❄️"
  },

  77: {
    condition: "Snow Grains",
    icon: "❄️"
  },

  80: {
    condition: "Slight Rain Showers",
    icon: "🌦️"
  },

  81: {
    condition: "Moderate Rain Showers",
    icon: "🌦️"
  },

  82: {
    condition: "Violent Rain Showers",
    icon: "⛈️"
  },

  85: {
    condition: "Slight Snow Showers",
    icon: "🌨️"
  },

  86: {
    condition: "Heavy Snow Showers",
    icon: "🌨️"
  },

  95: {
    condition: "Thunderstorm",
    icon: "⚡"
  },

  96: {
    condition: "Thunderstorm with Hail",
    icon: "⛈️"
  },

  99: {
    condition: "Severe Thunderstorm",
    icon: "⛈️"
  }
};


function getWeatherDetails(
  code
) {
  return (
    weatherMap[code] || {
      condition: "Unknown",
      icon: "🌡️"
    }
  );
}


/* ==========================================================================
   5. UI HELPERS
   ========================================================================== */

function showLoading(
  message = "Fetching weather data..."
) {
  statusContainer.classList.remove(
    "hidden"
  );

  statusContainer.classList.add(
    "loading"
  );

  statusMessage.innerHTML =
    "";

  const spinner =
    document.createElement(
      "span"
    );

  spinner.className =
    "loading-spinner";

  spinner.setAttribute(
    "aria-hidden",
    "true"
  );

  const messageText =
    document.createTextNode(
      message
    );

  statusMessage.appendChild(
    spinner
  );

  statusMessage.appendChild(
    messageText
  );

  weatherContent.classList.add(
    "hidden"
  );
}


function showError(
  message,
  keepWeatherVisible = false
) {
  statusContainer.classList.remove(
    "hidden"
  );

  statusContainer.classList.remove(
    "loading"
  );

  statusMessage.textContent =
    `❌ ${message}`;

  if (!keepWeatherVisible) {
    weatherContent.classList.add(
      "hidden"
    );
  }
}


function showWeather() {
  statusContainer.classList.add(
    "hidden"
  );

  statusContainer.classList.remove(
    "loading"
  );

  weatherContent.classList.remove(
    "hidden"
  );
}


/* ==========================================================================
   6. SAFE FETCH WITH TIMEOUT
   ========================================================================== */

async function safeFetch(
  url,
  errorMessage,
  timeout = 10000
) {
  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(
      () => {
        controller.abort();
      },
      timeout
    );

  try {
    const response =
      await fetch(
        url,
        {
          signal:
            controller.signal
        }
      );

    if (!response.ok) {
      throw new Error(
        errorMessage
      );
    }

    return response;

  } catch (error) {

    if (
      error.name ===
      "AbortError"
    ) {
      throw new Error(
        "The request took too long. Please check your internet connection and try again."
      );
    }

    if (
      error.message ===
      errorMessage
    ) {
      throw error;
    }

    throw new Error(
      "Network error. Please check your internet connection and try again."
    );

  } finally {
    clearTimeout(
      timeoutId
    );
  }
}


/* ==========================================================================
   7. CITY → COORDINATES
   ========================================================================== */

async function fetchCoordinates(
  cityName
) {
  const cleanName =
    cityName.trim();

  /*
     First check completed geocoding cache.
  */
  const cachedCoordinates =
    getCachedCoordinates(
      cleanName
    );

  if (cachedCoordinates) {
    console.log(
      "⚡ Using cached coordinates for:",
      cleanName
    );

    return cachedCoordinates;
  }


  const cacheKey =
    getGeocodingCacheKey(
      cleanName
    );


  /*
     If the exact same geocoding request
     is already running, reuse it.
  */
  if (cacheKey) {
    const existingRequest =
      inFlightGeocodingRequests.get(
        cacheKey
      );

    if (existingRequest) {
      console.log(
        "🔄 Reusing in-flight geocoding request for:",
        cleanName
      );

      return existingRequest;
    }
  }


  const requestPromise =
    (async () => {

      const url =
        `https://geocoding-api.open-meteo.com/v1/search?` +
        `name=${encodeURIComponent(cleanName)}` +
        `&count=5` +
        `&language=en` +
        `&format=json`;


      const response =
        await safeFetch(
          url,
          "Unable to reach the location service. Please try again.",
          10000
        );


      let data;

      try {
        data =
          await response.json();

      } catch (error) {
        throw new Error(
          "The location service returned invalid data. Please try again."
        );
      }


      if (
        !data ||
        typeof data !== "object" ||
        !Array.isArray(data.results) ||
        data.results.length === 0
      ) {
        throw new Error(
          `Location "${cityName}" not found. Please check the spelling.`
        );
      }


      const result =
        data.results[0];


      if (
        !result ||
        !Number.isFinite(
          Number(result.latitude)
        ) ||
        !Number.isFinite(
          Number(result.longitude)
        )
      ) {
        throw new Error(
          "The location service returned invalid coordinates."
        );
      }


      const coordinates = {
        name:
          typeof result.name === "string"
            ? result.name
            : cleanName,

        country:
          typeof result.country === "string"
            ? result.country
            : (
                typeof result.admin1 === "string"
                  ? result.admin1
                  : ""
              ),

        latitude:
          Number(result.latitude),

        longitude:
          Number(result.longitude)
      };


      setCachedCoordinates(
        cleanName,
        coordinates
      );


      return coordinates;

    })();


  if (cacheKey) {
    inFlightGeocodingRequests.set(
      cacheKey,
      requestPromise
    );
  }


  try {
    return await requestPromise;

  } finally {

    if (
      cacheKey &&
      inFlightGeocodingRequests.get(
        cacheKey
      ) === requestPromise
    ) {
      inFlightGeocodingRequests.delete(
        cacheKey
      );
    }
  }
}


/* ==========================================================================
   8. WEATHER API
   ========================================================================== */

async function fetchWeatherData(
  lat,
  lon
) {
  if (
    !Number.isFinite(
      Number(lat)
    ) ||
    !Number.isFinite(
      Number(lon)
    )
  ) {
    throw new Error(
      "Invalid location coordinates."
    );
  }


  const url =
    `https://api.open-meteo.com/v1/forecast?` +
    `latitude=${Number(lat)}` +
    `&longitude=${Number(lon)}` +
    `&current=` +
    `temperature_2m,` +
    `relative_humidity_2m,` +
    `apparent_temperature,` +
    `precipitation,` +
    `weather_code,` +
    `wind_speed_10m` +
    `&daily=` +
    `weather_code,` +
    `temperature_2m_max,` +
    `temperature_2m_min,` +
    `precipitation_probability_max,` +
    `sunrise,` +
    `sunset` +
    `&forecast_days=7` +
    `&timezone=auto`;


  const response =
    await safeFetch(
      url,
      "Weather service is currently unavailable. Please try again later.",
      10000
    );


  let data;

  try {
    data =
      await response.json();

  } catch (error) {
    throw new Error(
      "The weather service returned invalid data. Please try again."
    );
  }


  /* ------------------------------------------------------------------------
     BASIC RESPONSE VALIDATION
     ------------------------------------------------------------------------ */

  if (
    !data ||
    typeof data !== "object" ||
    !data.current ||
    typeof data.current !== "object" ||
    !data.daily ||
    typeof data.daily !== "object"
  ) {
    throw new Error(
      "Weather data is incomplete. Please try again."
    );
  }


  /* ------------------------------------------------------------------------
     CURRENT WEATHER VALIDATION
     ------------------------------------------------------------------------ */

  const requiredCurrentFields = [
    "temperature_2m",
    "relative_humidity_2m",
    "apparent_temperature",
    "precipitation",
    "weather_code",
    "wind_speed_10m"
  ];


  const hasCurrentData =
    requiredCurrentFields.every(
      (field) =>
        data.current[field] !== undefined &&
        data.current[field] !== null
    );


  /* ------------------------------------------------------------------------
     DAILY FORECAST VALIDATION
     ------------------------------------------------------------------------ */

  const hasDailyData =
    Array.isArray(
      data.daily.time
    ) &&
    Array.isArray(
      data.daily.weather_code
    ) &&
    Array.isArray(
      data.daily.temperature_2m_max
    ) &&
    Array.isArray(
      data.daily.temperature_2m_min
    ) &&
    Array.isArray(
      data.daily.precipitation_probability_max
    ) &&
    Array.isArray(
      data.daily.sunrise
    ) &&
    Array.isArray(
      data.daily.sunset
    );


  if (
    !hasCurrentData ||
    !hasDailyData
  ) {
    throw new Error(
      "Weather data is incomplete. Please try again."
    );
  }


  if (
    data.daily.time.length === 0 ||
    data.daily.weather_code.length === 0
  ) {
    throw new Error(
      "No forecast data is available right now. Please try again."
    );
  }


  return data;
}


/* ==========================================================================
   9. WEATHER DATA WITH CACHE + IN-FLIGHT DEDUPLICATION
   ========================================================================== */

async function getWeatherDataWithCache(
  lat,
  lon
) {
  const cachedWeather =
    getCachedWeather(
      lat,
      lon
    );


  if (cachedWeather) {
    console.log(
      "⚡ Using cached weather data for current location."
    );

    return cachedWeather;
  }


  const key =
    getWeatherCacheKey(
      lat,
      lon
    );


  if (!key) {
    throw new Error(
      "Invalid location coordinates."
    );
  }


  /*
     If another request for the same location
     is already running, reuse that Promise.
  */
  const existingRequest =
    inFlightWeatherRequests.get(
      key
    );


  if (existingRequest) {
    console.log(
      "🔄 Reusing in-flight weather request."
    );

    return existingRequest;
  }


  const requestInfo =
    getNextWeatherRequestVersion(
      lat,
      lon
    );


  if (!requestInfo) {
    throw new Error(
      "Invalid location coordinates."
    );
  }


  const requestVersion =
    requestInfo.version;


  console.log(
    "🌐 Fetching fresh weather data for current location."
  );


  const requestPromise =
    (async () => {

      const weatherData =
        await fetchWeatherData(
          lat,
          lon
        );


      const currentVersion =
        weatherRequestVersions.get(
          key
        );


      /*
         Only cache the response if it is
         still the latest request for this location.
      */
      if (
        currentVersion ===
        requestVersion
      ) {
        setCachedWeather(
          lat,
          lon,
          weatherData
        );
      }


      return weatherData;

    })();


  inFlightWeatherRequests.set(
    key,
    requestPromise
  );


  try {
    return await requestPromise;

  } finally {

    if (
      inFlightWeatherRequests.get(
        key
      ) === requestPromise
    ) {
      inFlightWeatherRequests.delete(
        key
      );
    }
  }
}


/* ==========================================================================
   10. FARMING ADVISORY
   ========================================================================== */

function getFarmingAdvice(
  data
) {
  if (
    !data ||
    !data.current ||
    !data.daily
  ) {
    return [];
  }


  const current =
    data.current;

  const daily =
    data.daily;


  const temperature =
    Number(
      current.temperature_2m
    );


  const humidity =
    Number(
      current.relative_humidity_2m
    );


  const windSpeedKmh =
    Number(
      current.wind_speed_10m
    );


  const rainProbability =
    Number(
      daily
        .precipitation_probability_max
        ?.[0] ?? 0
    );


  const weatherCode =
    Number(
      current.weather_code
    );


  const advice = [];


  const isFahrenheit =
    appState.unit ===
    "fahrenheit";


  function displayTemperature(
    celsius
  ) {
    if (
      !Number.isFinite(celsius)
    ) {
      return "--";
    }


    const value =
      isFahrenheit
        ? (celsius * 9) / 5 + 32
        : celsius;


    return `${Math.round(value)}${
      isFahrenheit
        ? "°F"
        : "°C"
    }`;
  }


  function displayWind(
    kmh
  ) {
    if (
      !Number.isFinite(kmh)
    ) {
      return "--";
    }


    const value =
      isFahrenheit
        ? kmh * 0.621371
        : kmh;


    return `${Math.round(value)} ${
      isFahrenheit
        ? "mph"
        : "km/h"
    }`;
  }


  if (
    rainProbability >= 70
  ) {
    advice.push(
      `🌧️ High rain chance (${rainProbability}%). Avoid irrigation today and plan field work carefully.`
    );

  } else if (
    rainProbability >= 40
  ) {
    advice.push(
      `🌦️ Moderate rain chance (${rainProbability}%). Consider delaying irrigation and outdoor spraying if possible.`
    );

  } else {
    advice.push(
      `☀️ Low rain chance (${rainProbability}%). Outdoor farm activities can generally be planned normally.`
    );
  }


  if (
    temperature >= 35
  ) {
    advice.push(
      `🌡️ High temperature (${displayTemperature(temperature)}). Provide adequate water and protect sensitive crops from heat stress.`
    );

  } else if (
    temperature >= 30
  ) {
    advice.push(
      `🌡️ Warm conditions (${displayTemperature(temperature)}). Monitor soil moisture and crop water requirements.`
    );

  } else if (
    temperature <= 10
  ) {
    advice.push(
      `❄️ Cool conditions (${displayTemperature(temperature)}). Protect temperature-sensitive crops from cold stress where necessary.`
    );

  } else {
    advice.push(
      `🌱 Temperature is around ${displayTemperature(temperature)}, which is generally suitable for many routine farming activities.`
    );
  }


  if (
    humidity >= 80
  ) {
    advice.push(
      `💧 High humidity (${humidity}%). Monitor crops for fungal disease and avoid unnecessary irrigation.`
    );

  } else if (
    humidity >= 60
  ) {
    advice.push(
      `💧 Humidity is ${humidity}%. Keep monitoring crop moisture and disease conditions.`
    );

  } else {
    advice.push(
      `💧 Relatively low humidity (${humidity}%). Check soil moisture regularly, especially for water-sensitive crops.`
    );
  }


  if (
    windSpeedKmh >= 40
  ) {
    advice.push(
      `💨 Strong winds (${displayWind(windSpeedKmh)}). Avoid spraying and secure vulnerable plants or farm structures.`
    );

  } else if (
    windSpeedKmh >= 25
  ) {
    advice.push(
      `💨 Moderate-to-strong winds (${displayWind(windSpeedKmh)}). Use caution with spraying and outdoor farm work.`
    );

  } else {
    advice.push(
      `💨 Wind speed is around ${displayWind(windSpeedKmh)}. Conditions are generally manageable for routine field work.`
    );
  }


  if (
    [95, 96, 99].includes(
      weatherCode
    )
  ) {
    advice.push(
      `⛈️ Thunderstorm conditions detected. Avoid unnecessary outdoor field work and protect equipment and livestock.`
    );

  } else if (
    [65, 82].includes(
      weatherCode
    )
  ) {
    advice.push(
      `🌧️ Heavy rainfall conditions are possible. Check field drainage and avoid working in waterlogged areas.`
    );
  }


  return advice;
}


function renderFarmingAdvisory() {
  const data =
    appState.weatherData;


  if (
    !data ||
    !data.current ||
    !data.daily
  ) {
    return;
  }


  if (
    !advisorySection ||
    !advisoryContent
  ) {
    return;
  }


  const advice =
    getFarmingAdvice(
      data
    );


  advisoryContent.innerHTML =
    "";


  advice.forEach(
    (message) => {

      const item =
        document.createElement(
          "p"
        );

      item.className =
        "advisory-item";

      item.textContent =
        message;

      advisoryContent.appendChild(
        item
      );
    }
  );


  advisorySection.classList.remove(
    "hidden"
  );
}


/* ==========================================================================
   11. MAIN SEARCH (OPTIMIZED WITH BUTTON DISABLE & INPUT VALIDATION)
   ========================================================================== */

async function handleSearch(cityName) {
  const cleanCityName = cityName?.trim();

  // 1. Validation for empty search
  if (!cleanCityName) {
    showError("Please enter a city name before searching.");
    return;
  }

  const searchBtn = document.getElementById("search-btn");
  const requestId = ++latestRequestId;

  try {
    // Disable inputs & show loading state
    if (searchBtn) searchBtn.disabled = true;
    showLoading(`Searching weather for "${cleanCityName}"...`);

    const geoData = await fetchCoordinates(cleanCityName);

    if (requestId !== latestRequestId) return;

    const cachedWeather = getCachedWeather(
      geoData.latitude,
      geoData.longitude
    );

    let weatherData;

    if (cachedWeather) {
      console.log("⚡ Using cached weather data for:", geoData.name);
      weatherData = cachedWeather;
    } else {
      weatherData = await getWeatherDataWithCache(
        geoData.latitude,
        geoData.longitude
      );

      if (requestId !== latestRequestId) return;
    }

    if (requestId !== latestRequestId) return;

    // Update global app state
    appState.currentCity = geoData.name;
    appState.country = geoData.country;
    appState.latitude = geoData.latitude;
    appState.longitude = geoData.longitude;
    appState.accuracy = null;
    appState.weatherData = weatherData;

    searchInput.value = geoData.name;

    // Render weather UI and save history
    renderWeather();
    saveRecentSearch(geoData.name);
    showWeather();

  } catch (error) {
    if (requestId !== latestRequestId) return;

    console.error("Weather search error:", error);

    // Show clear error message for wrong city name or API failures
    showError(
      error.message || "Something went wrong. Please check the city name and try again."
    );
  } finally {
    // Re-enable search button
    if (searchBtn) searchBtn.disabled = false;
  }
}
/* ==========================================================================
   12. WEATHER RENDERING
   ========================================================================== */

function renderWeather() {
  const data =
    appState.weatherData;


  if (
    !data ||
    !data.current ||
    !data.daily
  ) {
    return;
  }


  const current =
    data.current;

  const daily =
    data.daily;


  const isFahrenheit =
    appState.unit ===
    "fahrenheit";


  function convertTemp(
    celsius
  ) {
    const value =
      Number(celsius);


    if (
      !Number.isFinite(value)
    ) {
      return "--";
    }


    return isFahrenheit
      ? Math.round(
          (value * 9) / 5 + 32
        )
      : Math.round(value);
  }


  function convertSpeed(
    kmh
  ) {
    const value =
      Number(kmh);


    if (
      !Number.isFinite(value)
    ) {
      return "--";
    }


    return isFahrenheit
      ? Math.round(
          value * 0.621371
        )
      : Math.round(value);
  }


  const tempUnitSymbol =
    isFahrenheit
      ? "°F"
      : "°C";


  const speedUnitSymbol =
    isFahrenheit
      ? "mph"
      : "km/h";


  locationNameEl.textContent =
    appState.country
      ? `${appState.currentCity}, ${appState.country}`
      : appState.currentCity;


  lastUpdatedEl.textContent =
    `Last updated: ${new Date().toLocaleTimeString(
      [],
      {
        hour: "2-digit",
        minute: "2-digit"
      }
    )}`;


  const weatherDetail =
    getWeatherDetails(
      current.weather_code
    );


  currentIconEl.textContent =
    weatherDetail.icon;


  currentConditionEl.textContent =
    weatherDetail.condition;


  currentTempEl.textContent =
    convertTemp(
      current.temperature_2m
    );


  feelsLikeTempEl.textContent =
    convertTemp(
      current.apparent_temperature
    );


  document
    .querySelectorAll(
      ".temp-unit"
    )
    .forEach(
      (element) => {

        element.textContent =
          tempUnitSymbol;

        element.setAttribute(
          "aria-label",
          isFahrenheit
            ? "degrees Fahrenheit"
            : "degrees Celsius"
        );
      }
    );


  const humidity =
    Number(
      current.relative_humidity_2m
    );


  humidityValEl.textContent =
    Number.isFinite(humidity)
      ? `${humidity}%`
      : "--";


  const wind =
    convertSpeed(
      current.wind_speed_10m
    );


  windValEl.textContent =
    wind === "--"
      ? "--"
      : `${wind} ${speedUnitSymbol}`;


  const precipitation =
    Number(
      current.precipitation
    );


  precipValEl.textContent =
    Number.isFinite(
      precipitation
    )
      ? `${precipitation} mm`
      : "--";


  function formatTime(
    timeString
  ) {
    if (
      typeof timeString !==
      "string"
    ) {
      return "--";
    }


    const match =
      timeString.match(
        /T(\d{2}):(\d{2})/
      );


    if (!match) {
      return "--";
    }


    const hours =
      Number(match[1]);

    const minutes =
      Number(match[2]);


    if (
      !Number.isInteger(hours) ||
      !Number.isInteger(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return "--";
    }


    const period =
      hours >= 12
        ? "PM"
        : "AM";


    const displayHour =
      hours % 12 || 12;


    return `${displayHour}:${String(
      minutes
    ).padStart(
      2,
      "0"
    )} ${period}`;
  }


  const sunrise =
    daily.sunrise?.[0];

  const sunset =
    daily.sunset?.[0];


  sunValEl.textContent =
    `${formatTime(
      sunrise
    )} / ${formatTime(
      sunset
    )}`;


  forecastGridEl.innerHTML =
    "";


  const forecastDays =
    Array.isArray(
      daily.time
    )
      ? daily.time
      : [];


  for (
    let i = 0;
    i < forecastDays.length;
    i++
  ) {

    const dateString =
      forecastDays[i];


    const dateObj =
      new Date(
        `${dateString}T00:00:00Z`
      );


    const dayName =
      i === 0
        ? "Today"
        : (
            Number.isNaN(
              dateObj.getTime()
            )
              ? "Day"
              : dateObj.toLocaleDateString(
                  "en-US",
                  {
                    weekday: "short",
                    timeZone: "UTC"
                  }
                )
          );


    const dayWeather =
      getWeatherDetails(
        daily.weather_code?.[i]
      );


    const maxTemp =
      convertTemp(
        daily.temperature_2m_max?.[i]
      );


    const minTemp =
      convertTemp(
        daily.temperature_2m_min?.[i]
      );


    const precipProbRaw =
      Number(
        daily
          .precipitation_probability_max
          ?.[i]
      );


    const precipProb =
      Number.isFinite(
        precipProbRaw
      )
        ? Math.min(
            100,
            Math.max(
              0,
              Math.round(
                precipProbRaw
              )
            )
          )
        : 0;


    const card =
      document.createElement(
        "div"
      );


    card.className =
      "forecast-card";


    const dateEl =
      document.createElement(
        "span"
      );


    dateEl.className =
      "forecast-date";

    dateEl.textContent =
      dayName;


    const iconEl =
      document.createElement(
        "span"
      );


    iconEl.className =
      "forecast-icon";

    iconEl.textContent =
      dayWeather.icon;


    iconEl.setAttribute(
      "aria-hidden",
      "true"
    );


    const tempsEl =
      document.createElement(
        "div"
      );


    tempsEl.className =
      "forecast-temps";


    const maxTempEl =
      document.createElement(
        "span"
      );


    maxTempEl.className =
      "temp-max";

    maxTempEl.textContent =
      `${maxTemp}${tempUnitSymbol}`;


    const minTempEl =
      document.createElement(
        "span"
      );


    minTempEl.className =
      "temp-min";

    minTempEl.textContent =
      `${minTemp}${tempUnitSymbol}`;


    tempsEl.appendChild(
      maxTempEl
    );

    tempsEl.appendChild(
      minTempEl
    );


    const precipEl =
      document.createElement(
        "span"
      );


    precipEl.className =
      "forecast-precip";

    precipEl.textContent =
      `🌧️ ${precipProb}%`;


    card.appendChild(
      dateEl
    );

    card.appendChild(
      iconEl
    );

    card.appendChild(
      tempsEl
    );

    card.appendChild(
      precipEl
    );


    forecastGridEl.appendChild(
      card
    );
  }


  renderFarmingAdvisory();
}


/* ==========================================================================
   13. SEARCH FORM
   ========================================================================== */

searchForm.addEventListener(
  "submit",
  (event) => {

    event.preventDefault();

    handleSearch(
      searchInput.value
    );
  }
);


/* ==========================================================================
   14. RECENT SEARCHES
   ========================================================================== */

function saveRecentSearch(
  city
) {
  if (
    typeof city !== "string" ||
    !city.trim()
  ) {
    return;
  }


  const normalizedCity =
    city.trim();


  let searches =
    appState.recentSearches.filter(
      (item) =>
        typeof item === "string" &&
        item.trim().toLowerCase() !==
          normalizedCity.toLowerCase()
    );


  searches.unshift(
    normalizedCity
  );


  searches =
    searches.slice(
      0,
      5
    );


  appState.recentSearches =
    searches;


  try {

    localStorage.setItem(
      "recentSearches",
      JSON.stringify(
        searches
      )
    );

  } catch (error) {

    console.error(
      "Could not save recent searches:",
      error
    );
  }


  renderRecentSearches();
}


function renderRecentSearches() {
  if (
    !Array.isArray(
      appState.recentSearches
    ) ||
    !appState.recentSearches.length
  ) {

    recentSearchesContainer.classList.add(
      "hidden"
    );

    return;
  }


  recentSearchesContainer.classList.remove(
    "hidden"
  );


  recentChipsEl.innerHTML =
    "";


  appState.recentSearches.forEach(
    (city) => {

      if (
        typeof city !== "string" ||
        !city.trim()
      ) {
        return;
      }


      const chip =
        document.createElement(
          "span"
        );


      chip.className =
        "chip";


      chip.textContent =
        city;


      chip.setAttribute(
        "role",
        "button"
      );


      chip.setAttribute(
        "tabindex",
        "0"
      );


      chip.setAttribute(
        "aria-label",
        `Search weather for ${city}`
      );


      const searchRecentCity =
        () => {

          searchInput.value =
            city;

          handleSearch(
            city
          );
        };


      chip.addEventListener(
        "click",
        searchRecentCity
      );


      chip.addEventListener(
        "keydown",
        (event) => {

          if (
            event.key === "Enter" ||
            event.key === " "
          ) {

            event.preventDefault();

            searchRecentCity();
          }
        }
      );


      recentChipsEl.appendChild(
        chip
      );
    }
  );
}


/* ==========================================================================
   15. REVERSE GEOCODING
   ========================================================================== */

async function fetchCityNameFromCoords(
  lat,
  lon
) {
  try {

    if (
      !Number.isFinite(
        Number(lat)
      ) ||
      !Number.isFinite(
        Number(lon)
      )
    ) {
      throw new Error(
        "Invalid location coordinates."
      );
    }


    const url =
      `https://api.bigdatacloud.net/data/reverse-geocode-client?` +
      `latitude=${Number(lat)}` +
      `&longitude=${Number(lon)}` +
      `&localityLanguage=en`;


    const response =
      await safeFetch(
        url,
        "Reverse geocoding service is currently unavailable. Please try again later.",
        10000
      );


    let data;


    try {
      data =
        await response.json();

    } catch (error) {

      throw new Error(
        "The location service returned invalid data."
      );
    }


    const possibleNames = [
      data.locality,
      data.city,
      data.town,
      data.village,
      data.localityInfo
        ?.administrative
        ?.[3]
        ?.name,
      data.localityInfo
        ?.administrative
        ?.[2]
        ?.name,
      data.principalSubdivision
    ];


    let name =
      "Your Location";


    for (
      const locationName
      of possibleNames
    ) {

      if (
        locationName &&
        typeof locationName ===
          "string"
      ) {

        name =
          locationName;

        break;
      }
    }


    return {
      name,

      country:
        typeof data.countryName ===
        "string"
          ? data.countryName
          : ""
    };


  } catch (error) {

    console.error(
      "Reverse geocoding error:",
      error
    );


    return {
      name: "Your Location",
      country: ""
    };
  }
}


/* ==========================================================================
   16. USE MY LOCATION
   ========================================================================== */
geoBtn.addEventListener(
  "click",
  () => {

    if (
      isLocating
    ) {
      return;
    }


    if (
      !navigator.geolocation
    ) {

      showError(
        "Geolocation is not supported by your browser."
      );

      return;
    }


    isLocating =
      true;


    geoBtn.disabled =
      true;


    geoBtn.textContent =
      "📍 Getting Location...";


    showLoading(
      "Getting your location..."
    );


    const requestId =
      ++latestRequestId;


    navigator.geolocation.getCurrentPosition(

      async (position) => {

        try {

          const lat =
            Number(
              position.coords.latitude
            );


          const lon =
            Number(
              position.coords.longitude
            );


          const accuracy =
            Number(
              position.coords.accuracy
            );


          if (
            !Number.isFinite(lat) ||
            !Number.isFinite(lon)
          ) {

            throw new Error(
              "Your browser returned invalid location coordinates."
            );
          }


          appState.latitude =
            lat;

          appState.longitude =
            lon;

          appState.accuracy =
            Number.isFinite(
              accuracy
            )
              ? accuracy
              : null;


          console.log(
            "📍 WeatherPulse Location"
          );


          console.log(
            "Latitude:",
            lat
          );


          console.log(
            "Longitude:",
            lon
          );


          console.log(
            "Accuracy:",
            accuracy,
            "meters"
          );


          const [
            locationDetails,
            weatherData
          ] =
            await Promise.all([

              fetchCityNameFromCoords(
                lat,
                lon
              ),

              getWeatherDataWithCache(
                lat,
                lon
              )
            ]);


          if (
            requestId !==
            latestRequestId
          ) {
            return;
          }


          appState.currentCity =
            locationDetails.name;


          appState.country =
            locationDetails.country;


          appState.weatherData =
            weatherData;


          searchInput.value =
            locationDetails.name;


          renderWeather();


          if (
            locationDetails.name !==
            "Your Location"
          ) {

            saveRecentSearch(
              locationDetails.name
            );
          }


          showWeather();


          if (
            Number.isFinite(
              accuracy
            ) &&
            accuracy > 5000
          ) {

            console.warn(
              "⚠️ Browser returned a low-accuracy location:",
              accuracy,
              "meters"
            );


            console.warn(
              "Windows/Chrome may be using approximate location instead of GPS."
            );
          }


        } catch (error) {

          if (
            requestId !==
            latestRequestId
          ) {
            return;
          }


          console.error(
            "Geolocation weather error:",
            error
          );


          showError(
            error.message ||
            "Failed to fetch weather for your current location."
          );


        } finally {

          isLocating =
            false;


          geoBtn.disabled =
            false;


          geoBtn.textContent =
            "📍 Use My Location";
        }
      },


      (error) => {

        if (
          requestId !==
          latestRequestId
        ) {

          isLocating =
            false;

          geoBtn.disabled =
            false;

          geoBtn.textContent =
            "📍 Use My Location";

          return;
        }


        isLocating =
          false;


        geoBtn.disabled =
          false;


        geoBtn.textContent =
          "📍 Use My Location";


        switch (
          error.code
        ) {

          case error.PERMISSION_DENIED:

            showError(
              "Location permission was denied. Please allow location access or search for a city manually."
            );

            break;


          case error.POSITION_UNAVAILABLE:

            showError(
              "Your location could not be determined. Please try again or search manually."
            );

            break;


          case error.TIMEOUT:

            showError(
              "Location request timed out. Please try again."
            );

            break;


          default:

            showError(
              "Unable to get your location. Please search for a city manually."
            );
        }
      },


      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  }
);


/* ==========================================================================
   17. UNIT SWITCH
   ========================================================================== */

function updateUnitAccessibility() {

  unitCBtn.setAttribute(
    "aria-pressed",
    appState.unit === "celsius"
      ? "true"
      : "false"
  );


  unitFBtn.setAttribute(
    "aria-pressed",
    appState.unit === "fahrenheit"
      ? "true"
      : "false"
  );
}


unitCBtn.addEventListener(
  "click",
  () => {

    if (
      appState.unit ===
      "celsius"
    ) {
      return;
    }


    appState.unit =
      "celsius";


    unitCBtn.classList.add(
      "active"
    );


    unitFBtn.classList.remove(
      "active"
    );


    updateUnitAccessibility();

    renderWeather();
  }
);


unitFBtn.addEventListener(
  "click",
  () => {

    if (
      appState.unit ===
      "fahrenheit"
    ) {
      return;
    }


    appState.unit =
      "fahrenheit";


    unitFBtn.classList.add(
      "active"
    );


    unitCBtn.classList.remove(
      "active"
    );


    updateUnitAccessibility();

    renderWeather();
  }
);


/* ==========================================================================
   18. THEME
   ========================================================================== */

function applyTheme(
  theme
) {

  document.documentElement.setAttribute(
    "data-theme",
    theme
  );


  appState.theme =
    theme;


  themeIconEl.textContent =
    theme === "dark"
      ? "🌙"
      : "☀️";


  themeToggleBtn.setAttribute(
    "aria-pressed",
    theme === "dark"
      ? "true"
      : "false"
  );


  themeToggleBtn.setAttribute(
    "aria-label",
    theme === "dark"
      ? "Switch to light mode"
      : "Switch to dark mode"
  );
}


themeToggleBtn.addEventListener(
  "click",
  () => {

    const currentTheme =
      document.documentElement.getAttribute(
        "data-theme"
      );


    const newTheme =
      currentTheme === "dark"
        ? "light"
        : "dark";


    applyTheme(
      newTheme
    );


    try {

      localStorage.setItem(
        "appTheme",
        newTheme
      );

    } catch (error) {

      console.error(
        "Could not save theme:",
        error
      );
    }
  }
);


/* ==========================================================================
   19. LOAD SAVED THEME
   ========================================================================== */

let savedTheme =
  null;


try {

  savedTheme =
    localStorage.getItem(
      "appTheme"
    );

} catch (error) {

  savedTheme =
    null;
}


if (
  savedTheme === "dark" ||
  savedTheme === "light"
) {

  applyTheme(
    savedTheme
  );

} else {

  applyTheme(
    appState.theme
  );
}


/* ==========================================================================
   20. REFRESH WEATHER
   ========================================================================== */

refreshBtn.addEventListener(
  "click",
  async () => {

    if (
      isRefreshing
    ) {
      return;
    }


    if (
      appState.latitude === null ||
      appState.longitude === null
    ) {

      showError(
        "No weather location is available to refresh."
      );

      return;
    }


    isRefreshing =
      true;


    refreshBtn.disabled =
      true;


    const requestId =
      ++latestRequestId;


    const latitude =
      appState.latitude;

    const longitude =
      appState.longitude;


    try {

      statusContainer.classList.remove(
        "hidden"
      );


      statusContainer.classList.add(
        "loading"
      );


      statusMessage.innerHTML =
        "";


      const spinner =
        document.createElement(
          "span"
        );


      spinner.className =
        "loading-spinner";


      spinner.setAttribute(
        "aria-hidden",
        "true"
      );


      const refreshText =
        document.createTextNode(
          "Refreshing weather data..."
        );


      statusMessage.appendChild(
        spinner
      );


      statusMessage.appendChild(
        refreshText
      );


      /*
         Create a new request version.

         This makes sure an older request cannot
         overwrite this refresh result.
      */
      const requestInfo =
        getNextWeatherRequestVersion(
          latitude,
          longitude
        );


      if (!requestInfo) {
        throw new Error(
          "Invalid location coordinates."
        );
      }


      /*
         Refresh deliberately bypasses
         the completed weather cache.
      */
      clearWeatherCache(
        latitude,
        longitude
      );


      /*
         Refresh deliberately makes a fresh
         API request instead of reusing an
         in-flight normal request.
      */
      const weatherData =
        await fetchWeatherData(
          latitude,
          longitude
        );


      if (
        requestId !==
        latestRequestId
      ) {
        return;
      }


      /*
         Make sure no newer request for the
         same location has superseded this one.
      */
      const currentVersion =
        weatherRequestVersions.get(
          requestInfo.key
        );


      if (
        currentVersion !==
        requestInfo.version
      ) {
        return;
      }


      setCachedWeather(
        latitude,
        longitude,
        weatherData
      );


      appState.weatherData =
        weatherData;


      renderWeather();


      showWeather();


    } catch (error) {

      if (
        requestId !==
        latestRequestId
      ) {
        return;
      }


      console.error(
        "Refresh error:",
        error
      );


      showError(
        error.message ||
        "Failed to refresh weather data. Showing the last available weather.",
        true
      );


    } finally {

      isRefreshing =
        false;


      refreshBtn.disabled =
        false;
    }
  }
);


/* ==========================================================================
   21. INITIALIZATION
   ========================================================================== */

updateUnitAccessibility();

renderRecentSearches();


/*
   Default city
*/

handleSearch(
  "Chandigarh"
);