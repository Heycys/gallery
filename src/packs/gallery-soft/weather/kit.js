// gallery-soft/weather (天气, 柔光风格): Gallery 风格's gallery/weather in the soft look, the same logic. A
// city's weather now and for the days ahead, from Open-Meteo (open-meteo.com, no key), for a custom page. Its
// settings, `city` (a name as the reader writes it: 上海, Berlin) and `unit` (℃ or ℉), are the card's form (the
// grip at its top right › 设置…), kept in the data part `settings`, which the board writes and this block only
// reads. The city is looked up by name (geocoding-api.open-meteo.com: its first match, its coordinates), its
// weather fetched for them (api.open-meteo.com: now, and each day's highest, lowest and sky for five days),
// both through context.fetch, the server fetching for it: its needs name the two hosts, and nothing is
// fetched until the reader allows them (the kit then shows 允许访问 over the card and starts the block again
// once the reader says yes). Fetched again as its settings change (`source`) and every 30 minutes; the
// server keeps an answer a minute and gives what it kept when the network is not there, which the card says
// by its time (更新于 14:05). What it says while there is nothing to
// show (no city yet, one not found, waiting for the reader's consent, the network not there, this computer's
// network setup sending Open-Meteo's names to an address of its own or of a private network, which the
// server refuses: code "private") is the cards' empty face, a soft disc with a picture over a line and what
// to do. In the page's language.
//
// Its face, laid out by its card's size (`context.size`, read again on `layout`; data-w, data-h, data-pad): a
// head of a cloud's chip and the city, when at its end; the sky's picture (the sun, a cloud, rain in their own
// colors) and the temperature large side by side, the sky's words and today's lowest and highest beside them;
// how it feels, the humidity and the wind under them; on a 4 × 4 card the five days ahead, each its lowest and
// highest at either end of a bar drawn against the lowest and highest of all five, today's now marked on it;
// a 2 × 2 card the temperature and the picture, the sky's words and the range under them.

const WORDS = {
  zh: {
    title: "天气",
    pick: "写上一个城市",
    where: "右上角手柄 › 设置…",
    whereShort: "手柄 › 设置…",
    loading: "正在取天气…",
    unknown: (/** @type {string} */ city) => `找不到「${city}」：换一个写法试试`,
    unknownLine: (/** @type {string} */ city) => `找不到「${city}」`,
    unknownHow: "换个写法试试，比如「上海」「Berlin」",
    unknownHowShort: "换个写法试试",
    consent: "允许联网之后显示天气",
    consentShort: "允许联网后显示",
    offline: "现在连不上网，取不到天气",
    offlineShort: "现在连不上网",
    offlineHow: "连上之后会自己再取",
    private: "网络设置把天气服务指向了本地地址，取不到天气",
    privateLine: "网络设置把天气服务指向了本地地址",
    privateHow: "取不到天气",
    failed: "没能取到天气",
    at: (/** @type {string} */ time) => `更新于 ${time}`,
    feels: (/** @type {string} */ value) => `体感 ${value}`,
    humidity: (/** @type {number} */ value) => `湿度 ${value}%`,
    wind: (/** @type {number} */ value) => `风 ${value} km/h`,
    highLow: (/** @type {string} */ high, /** @type {string} */ low) => `最高 ${high} · 最低 ${low}`,
    today: "今天",
    weekdays: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
    sky: {
      clear: "晴", mostly: "大部晴朗", partly: "多云", overcast: "阴", fog: "雾", drizzle: "毛毛雨", "freezing-drizzle": "冻毛毛雨",
      rain: "雨", "light-rain": "小雨", "heavy-rain": "大雨", "freezing-rain": "冻雨", snow: "雪", "light-snow": "小雪", "heavy-snow": "大雪",
      grains: "雪粒", showers: "阵雨", "snow-showers": "阵雪", thunder: "雷阵雨", hail: "雷阵雨伴冰雹", unknown: "天气未知",
    },
  },
  en: {
    title: "Weather",
    pick: "Name a city",
    where: "The grip at the top right › Settings…",
    whereShort: "Grip › Settings…",
    loading: "Fetching the weather…",
    unknown: (/** @type {string} */ city) => `No place called “${city}”: try another spelling`,
    unknownLine: (/** @type {string} */ city) => `No place called “${city}”`,
    unknownHow: "Try another spelling, as “Shanghai” or “Berlin”",
    unknownHowShort: "Try another spelling",
    consent: "Shown once it may go online",
    consentShort: "Shown once online",
    offline: "Offline: no weather now",
    offlineShort: "Offline",
    offlineHow: "It fetches again once online",
    private: "The network setup sends the weather service to a local address",
    privateLine: "The network setup sends the weather service to a local address",
    privateHow: "No weather from there",
    failed: "The weather could not be fetched",
    at: (/** @type {string} */ time) => `Updated ${time}`,
    feels: (/** @type {string} */ value) => `Feels ${value}`,
    humidity: (/** @type {number} */ value) => `Humidity ${value}%`,
    wind: (/** @type {number} */ value) => `Wind ${value} km/h`,
    highLow: (/** @type {string} */ high, /** @type {string} */ low) => `High ${high} · Low ${low}`,
    today: "Today",
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    sky: {
      clear: "Clear", mostly: "Mostly clear", partly: "Partly cloudy", overcast: "Overcast", fog: "Fog", drizzle: "Drizzle", "freezing-drizzle": "Freezing drizzle",
      rain: "Rain", "light-rain": "Light rain", "heavy-rain": "Heavy rain", "freezing-rain": "Freezing rain", snow: "Snow", "light-snow": "Light snow", "heavy-snow": "Heavy snow",
      grains: "Snow grains", showers: "Showers", "snow-showers": "Snow showers", thunder: "Thunderstorm", hail: "Thunderstorm with hail", unknown: "Unknown",
    },
  },
};

/** The language the page speaks: the UI's where Gallery says it (data-ge-language), else its lang's. */
function languageOf(/** @type {HTMLElement} */ root) {
  const ui = root.getAttribute("data-ge-language");
  return (ui !== null ? ui === "en" : /^en(?:-|$)/i.test(root.lang)) ? "en" : "zh";
}

/**
 * The sky a WMO weather code says (what Open-Meteo answers with), as { words (its key in WORDS' sky),
 * picture (which of the pictures draws it) }; `day` false draws a clear or mostly clear sky with the moon.
 * @param {unknown} code
 * @param {boolean} day
 */
function skyOf(code, day = true) {
  const sun = day ? "sun" : "moon";
  /** @type {Record<number, [string, string]>} */
  const skies = {
    0: ["clear", sun], 1: ["mostly", sun], 2: ["partly", day ? "partly" : "partly-night"], 3: ["overcast", "cloud"],
    45: ["fog", "fog"], 48: ["fog", "fog"], 51: ["drizzle", "rain"], 53: ["drizzle", "rain"], 55: ["drizzle", "rain"], 56: ["freezing-drizzle", "rain"], 57: ["freezing-drizzle", "rain"],
    61: ["light-rain", "rain"], 63: ["rain", "rain"], 65: ["heavy-rain", "rain"], 66: ["freezing-rain", "rain"], 67: ["freezing-rain", "rain"],
    71: ["light-snow", "snow"], 73: ["snow", "snow"], 75: ["heavy-snow", "snow"], 77: ["grains", "snow"],
    80: ["showers", "rain"], 81: ["showers", "rain"], 82: ["showers", "rain"], 85: ["snow-showers", "snow"], 86: ["snow-showers", "snow"],
    95: ["thunder", "thunder"], 96: ["hail", "thunder"], 99: ["hail", "thunder"],
  };
  const [words, picture] = typeof code === "number" && skies[code] ? skies[code] : ["unknown", "cloud"];
  return { words, picture };
}

/**
 * The address a city's name is looked up at (Open-Meteo's geocoding: its first match, in `language`).
 * @param {string} city
 * @param {"zh" | "en"} language
 */
const searchAddress = (city, language) => `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=${language}&format=json`;

/**
 * The address of the weather at a place (its coordinates, to two decimals: one address for one place,
 * which the server keeps), in `unit` (℃ or ℉): now, and five days, by the place's own clock.
 * @param {{ latitude: number, longitude: number }} place
 * @param {string} unit
 */
const forecastAddress = (place, unit) => `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude.toFixed(2)}&longitude=${place.longitude.toFixed(2)}`
  + "&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day"
  + `&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=5${unit === "℉" ? "&temperature_unit=fahrenheit" : ""}`;

/**
 * The first place a lookup's answer gives ({ name, latitude, longitude, region }), or null for none.
 * @param {any} answer
 */
function placeOf(answer) {
  const found = Array.isArray(answer?.results) ? answer.results[0] : null;
  if (!found || typeof found.latitude !== "number" || typeof found.longitude !== "number") return null;
  return { name: String(found.name ?? ""), latitude: found.latitude, longitude: found.longitude, region: String(found.admin1 ?? found.country ?? "") };
}

/** A temperature as the card writes it: whole degrees, a degree sign, a minus that is one. @param {unknown} value */
const degrees = (value) => (typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}°`.replace(/^-/, "−") : "–");

/**
 * What the card says, in `language`, of `state`: { kind: "pick" } (no city), { kind: "loading", city },
 * { kind: "unknown", city } (no such place), { kind: "consent", city }, { kind: "offline", city },
 * { kind: "private", city } (the server refused the address this computer's resolver gave: one of this
 * computer or of a private network, its network setup's doing), { kind: "failed", city }, or
 * { kind: "weather", place, forecast (Open-Meteo's answer), at (when it was fetched, ISO) }. Its head (the city, and when), and either a note (with its line and what to do,
 * long and short, for the empty face) or the weather: the sky's picture and words, the temperature, today's
 * range (highest / lowest), its lowest and highest apart, how it feels, the humidity, the wind, the more
 * line's pieces, the temperature now as a number, and the days ahead.
 * @param {any} state
 * @param {"zh" | "en"} language
 */
function faceOf(state, language) {
  const words = WORDS[language];
  const head = { city: state.city || state.place?.name || words.title, at: "" };
  if (state.kind !== "weather") {
    /** @type {Record<string, string>} */
    const notes = { pick: words.pick, loading: words.loading, consent: words.consent, offline: words.offline, private: words.private, failed: words.failed };
    const note = state.kind === "unknown" ? words.unknown(state.city) : notes[state.kind] ?? words.failed;
    /** @type {Record<string, [string, string, string, string]>} the empty face's line and what to do, long and short */
    const empty = {
      pick: [words.pick, words.where, words.pick, words.whereShort],
      loading: [words.loading, "", words.loading, ""],
      unknown: [words.unknownLine(state.city), words.unknownHow, words.unknownLine(state.city), words.unknownHowShort],
      consent: [words.consent, "", words.consentShort, ""],
      offline: [words.offline, words.offlineHow, words.offlineShort, ""],
      private: [words.privateLine, words.privateHow, words.privateLine, words.privateHow],
      failed: [words.failed, "", words.failed, ""],
    };
    const [line, how, lineShort, howShort] = empty[state.kind] ?? empty.failed;
    if (state.kind === "pick") head.city = words.title;
    return { head, note, hint: state.kind === "pick" || state.kind === "unknown" ? words.where : "", empty: { line, how, lineShort, howShort }, now: null, days: [] };
  }
  const { current = {}, daily = {} } = state.forecast ?? {};
  const sky = skyOf(current.weather_code, current.is_day !== 0);
  const fetched = typeof state.at === "string" ? new Date(state.at) : null;
  const two = (/** @type {number} */ value) => String(value).padStart(2, "0");
  head.at = fetched && !Number.isNaN(fetched.getTime()) ? words.at(`${two(fetched.getHours())}:${two(fetched.getMinutes())}`) : "";
  const range = (/** @type {number} */ index) => `${degrees(daily.temperature_2m_max?.[index])} / ${degrees(daily.temperature_2m_min?.[index])}`;
  const feels = typeof current.apparent_temperature === "number" ? words.feels(degrees(current.apparent_temperature)) : null;
  const humidity = typeof current.relative_humidity_2m === "number" ? words.humidity(Math.round(current.relative_humidity_2m)) : null;
  const wind = typeof current.wind_speed_10m === "number" ? words.wind(Math.round(current.wind_speed_10m)) : null;
  const more = [feels, humidity, wind].filter((piece) => piece !== null);
  const dates = Array.isArray(daily.time) ? daily.time : [];
  const days = dates.slice(0, 5).map((/** @type {string} */ date, /** @type {number} */ index) => {
    const [year, month, day] = String(date).split("-").map(Number);
    const weekday = index === 0 ? words.today : words.weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? "";
    const [high, low] = [daily.temperature_2m_max?.[index], daily.temperature_2m_min?.[index]];
    return { weekday, picture: skyOf(daily.weather_code?.[index]).picture, sky: words.sky[skyOf(daily.weather_code?.[index]).words], range: range(index), high: degrees(high), low: degrees(low), span: typeof high === "number" && typeof low === "number" && Number.isFinite(high) && Number.isFinite(low) ? [low, high] : null };
  });
  const temperature = typeof current.temperature_2m === "number" && Number.isFinite(current.temperature_2m) ? current.temperature_2m : null;
  return {
    head, note: "", hint: "", empty: null,
    now: { picture: sky.picture, sky: words.sky[sky.words], temperature: degrees(current.temperature_2m), range: dates.length ? range(0) : "", low: days[0]?.low ?? "", high: days[0]?.high ?? "", feels, humidity, wind, more, value: temperature },
    days,
  };
}

// The sky's pictures, two-toned on a 64 x 64 grid, each color the face's (style.css): the sun with its rays,
// a cloud with its shade, rain, snow, a bolt, the moon, fog.
const SUN = (/** @type {number} */ cx, /** @type {number} */ cy, /** @type {number} */ r) => {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
    const turn = (angle * Math.PI) / 180;
    const [inner, outer] = [r + 4.5, r + 8.5];
    return `<line x1="${(cx + Math.cos(turn) * inner).toFixed(1)}" y1="${(cy + Math.sin(turn) * inner).toFixed(1)}" x2="${(cx + Math.cos(turn) * outer).toFixed(1)}" y2="${(cy + Math.sin(turn) * outer).toFixed(1)}"/>`;
  }).join("");
  return `<g class="gallery-soft-weather-rays" stroke-width="2.6" stroke-linecap="round">${rays}</g><circle class="gallery-soft-weather-sun" cx="${cx}" cy="${cy}" r="${r}"/><circle class="gallery-soft-weather-core" cx="${cx - r * 0.22}" cy="${cy - r * 0.22}" r="${r * 0.62}"/>`;
};
const CLOUD = (/** @type {number} */ dx, /** @type {number} */ dy, /** @type {number} */ scale, /** @type {string} */ fill = "cloud", /** @type {string} */ shade = "shade") => `<g transform="translate(${dx} ${dy}) scale(${scale})"><g class="gallery-soft-weather-${shade}"><circle cx="20" cy="33" r="10"/><circle cx="31" cy="25" r="13"/><circle cx="43" cy="32" r="9.5"/><rect x="18" y="31" width="27" height="12" rx="6"/></g><g class="gallery-soft-weather-${fill}"><circle cx="20" cy="31" r="10"/><circle cx="31" cy="23" r="13"/><circle cx="43" cy="30" r="9.5"/><rect x="18" y="29" width="27" height="12" rx="6"/></g></g>`;
const MOON = (/** @type {number} */ cx, /** @type {number} */ cy, /** @type {number} */ r) => `<path class="gallery-soft-weather-moon" d="M${cx + r * 0.62} ${cy + r * 0.55}A${r} ${r} 0 1 1 ${cx - r * 0.35} ${cy - r * 0.94}A${r * 0.78} ${r * 0.78} 0 0 0 ${cx + r * 0.62} ${cy + r * 0.55}z"/>`;
const PICTURES = {
  sun: SUN(32, 32, 12),
  moon: MOON(32, 32, 15),
  partly: SUN(24, 23, 10) + CLOUD(8, 14, 0.95),
  "partly-night": MOON(25, 22, 11) + CLOUD(8, 14, 0.95),
  cloud: CLOUD(-2, 2, 0.8, "shade", "shade") + CLOUD(6, 10, 0.95),
  fog: `${CLOUD(2, -2, 0.95)}<g class="gallery-soft-weather-mist" stroke-width="2.8" stroke-linecap="round"><line x1="14" y1="48" x2="50" y2="48"/><line x1="20" y1="55" x2="44" y2="55"/></g>`,
  rain: `${CLOUD(2, 2, 0.95)}<g class="gallery-soft-weather-rain" stroke-width="2.8" stroke-linecap="round"><line x1="24" y1="47" x2="21" y2="54"/><line x1="33" y1="47" x2="30" y2="54"/><line x1="42" y1="47" x2="39" y2="54"/></g>`,
  snow: `${CLOUD(2, 2, 0.95)}<g class="gallery-soft-weather-snow"><circle cx="23" cy="51" r="2.4"/><circle cx="32" cy="55" r="2.4"/><circle cx="41" cy="51" r="2.4"/></g>`,
  thunder: `${CLOUD(2, 0, 0.95)}<path class="gallery-soft-weather-bolt" d="M34 41l-7 10h5.5l-2.5 9 8.5-12h-5.5l3-7z"/>`,
  none: '<g class="gallery-soft-weather-track"><circle cx="20" cy="33" r="10"/><circle cx="31" cy="25" r="13"/><circle cx="43" cy="32" r="9.5"/><rect x="18" y="31" width="27" height="12" rx="6"/></g>',
};

// The small line pictures of the face (24 x 24): the head's pin, the empty face's, the more line's.
const LINES = {
  pin: '<path d="M12 21s-6.2-5.6-6.2-11a6.2 6.2 0 1 1 12.4 0c0 5.4-6.2 11-6.2 11z"/><circle cx="12" cy="10" r="2.2"/>',
  globe: '<circle cx="12" cy="12" r="8.6"/><path d="M3.4 12h17.2M12 3.4c2.4 2.4 3.6 5.3 3.6 8.6s-1.2 6.2-3.6 8.6M12 3.4C9.6 5.8 8.4 8.7 8.4 12s1.2 6.2 3.6 8.6"/>',
  cloudoff: '<path d="M7 18.5h10.2a3.8 3.8 0 0 0 1.4-7.3A6 6 0 0 0 7.6 9.6 4.5 4.5 0 0 0 7 18.5z"/><path d="M4 4l16 16"/>',
  search: '<circle cx="11" cy="11" r="6.3"/><path d="M20 20l-4.3-4.3"/>',
  thermo: '<path d="M10 14.3V5.2a2 2 0 1 1 4 0v9.1a4 4 0 1 1-4 0z"/>',
  drop: '<path d="M12 3.6s5.8 6.2 5.8 10.2a5.8 5.8 0 0 1-11.6 0C6.2 9.8 12 3.6 12 3.6z"/>',
  wind: '<path d="M3.5 9.5h11a2.6 2.6 0 1 0-2.6-2.6"/><path d="M3.5 14h14.6a2.6 2.6 0 1 1-2.6 2.6"/>',
};

/**
 * The size the face is laid out by: its card's cells (`context.size`), or `fallback` (the manifest's first
 * size) where no card is; and the frame's padding for it, as the soft cards pad theirs: "xs" on a card one
 * cell high, "s" on a small one (2 × 2 and less), "l" on one 3 cells high or more, else "m".
 * @param {DocComponentSize | null | undefined} size
 * @param {[number, number]} fallback
 */
function sizeOf(size, fallback) {
  const w = size?.w ?? fallback[0];
  const h = size?.h ?? fallback[1];
  return { w, h, pad: h === 1 ? "xs" : w <= 2 && h <= 2 ? "s" : h >= 3 ? "l" : "m" };
}

/**
 * An element of the face, of `kind` (its class).
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string} kind
 * @param {string} [text]
 */
function made(tag, kind, text) {
  const node = document.createElement(tag);
  node.className = `gallery-soft-weather-${kind}`;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A sky's picture, as an svg element, `size` px square. @param {string} picture @param {number} size */
function pictureOf(picture, size) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 64 64");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "gallery-soft-weather-picture");
  svg.innerHTML = PICTURES[/** @type {keyof typeof PICTURES} */ (picture)] ?? PICTURES.cloud;
  return svg;
}

/** The head's chip: a cloud, on a 16 grid, its line the 1.8 of the others' 24 in proportion (the pin stays the pick-a-city disc's). */
function chipOf() {
  const holder = made("span", "chip");
  holder.setAttribute("aria-hidden", "true");
  holder.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5a2.9 2.9 0 0 1-.45-5.76 3.75 3.75 0 0 1 7.25.9A2.45 2.45 0 0 1 11.5 12.5z"/></svg>';
  return holder;
}

/** A line picture of the face, as a span holding its svg. @param {keyof typeof LINES} name @param {string} kind */
function lineOf(name, kind) {
  const holder = made("span", kind);
  holder.setAttribute("aria-hidden", "true");
  holder.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${LINES[name]}</svg>`;
  return holder;
}

DocKit.component({
  id: "gallery-soft/weather",
  on: ["source", "layout"],
  mount(host, context) {
    const language = languageOf(document.documentElement);
    const face = made("div", "face");
    host.append(face);
    /** @type {any} */
    let shown = { kind: "loading", city: "" };
    const draw = (/** @type {any} */ state) => {
      shown = state;
      const { w, h, pad } = sizeOf(context.size, [4, 2]);
      const small = w <= 2;
      const tall = h >= 3;
      const said = faceOf(state, language);
      const head = made("div", "head");
      head.append(chipOf(), made("span", "city", said.head.city), made("span", "at", small ? "" : said.head.at));
      /** @type {Element[]} */
      const parts = [head];
      if (said.now) {
        const now = said.now;
        const temperature = made("span", "temperature", now.temperature.replace(/°$/, ""));
        temperature.append(made("sup", "degree", "°"));
        if (small) {
          const top = made("div", "row");
          top.append(temperature, pictureOf(now.picture, 46));
          const line = made("p", "line", `${now.sky} `);
          line.append(made("span", "range", `${now.low} / ${now.high}`));
          parts.push(top, line);
        } else {
          const words = made("span", "words");
          words.append(made("b", "sky", now.sky), made("span", "range", tall ? WORDS[language].highLow(now.high, now.low) : [`${now.low} / ${now.high}`, now.feels].filter(Boolean).join(" · ")));
          const row = made("div", "now");
          row.append(pictureOf(now.picture, tall ? 54 : 52), temperature, words);
          const more = made("p", "more");
          /** @type {Array<[keyof typeof LINES, string | null]>} */
          const pieces = tall ? [["thermo", now.feels], ["drop", now.humidity], ["wind", now.wind]] : [["drop", now.humidity], ["wind", now.wind]];
          more.append(...pieces.filter(([, words]) => words !== null).map(([picture, words]) => {
            const piece = made("span", "piece");
            piece.append(lineOf(picture, "icon"), String(words));
            return piece;
          }));
          parts.push(row, more);
          if (tall) {
            const days = made("ol", "days");
            const spans = said.days.flatMap((day) => day.span ?? []);
            const [lowest, highest] = [Math.min(...spans), Math.max(...spans)];
            const share = (/** @type {number} */ value) => `${(((value - lowest) / (highest - lowest)) * 100).toFixed(1)}%`;
            days.replaceChildren(...said.days.map((day, index) => {
              const item = made("li", "day");
              const picture = pictureOf(day.picture, 24);
              picture.setAttribute("aria-label", day.sky);
              picture.removeAttribute("aria-hidden");
              picture.setAttribute("role", "img");
              const bar = made("span", "bar");
              bar.setAttribute("aria-hidden", "true");
              if (day.span && highest > lowest) {
                const fill = made("i", "fill");
                fill.style.left = share(day.span[0]);
                fill.style.right = `${(100 - parseFloat(share(day.span[1]))).toFixed(1)}%`;
                bar.append(fill);
                if (index === 0 && now.value !== null) {
                  const mark = made("b", "mark");
                  mark.style.left = share(Math.min(highest, Math.max(lowest, now.value)));
                  bar.append(mark);
                }
              }
              item.append(made("span", "weekday", day.weekday), picture, made("span", "low", day.low), bar, made("span", "high", day.high));
              return item;
            }));
            parts.push(days);
          }
        }
      } else if (said.empty) {
        const empty = made("div", "empty");
        /** @type {Record<string, keyof typeof LINES>} */
        const discs = { pick: "pin", consent: "globe", offline: "cloudoff", private: "globe", unknown: "search", failed: "cloudoff" };
        if (state.kind === "loading") {
          const waiting = made("span", "disc");
          waiting.append(pictureOf("none", 28));
          empty.append(waiting);
        } else empty.append(lineOf(discs[state.kind] ?? "cloudoff", "disc"));
        empty.append(made("p", "note", small ? said.empty.lineShort : said.empty.line));
        const how = small ? said.empty.howShort : said.empty.how;
        if (how) empty.append(made("p", "how", how));
        parts.push(empty);
      }
      face.replaceChildren(...parts);
      Object.assign(face.dataset, { kind: state.kind, w: String(w), h: String(h), pad });
    };
    let asked = 0; // the latest load: an earlier one that answers later draws nothing
    const load = async () => {
      const mine = ++asked;
      const settings = context.readJSON("settings");
      if (settings === undefined) return; // no JSON: the instance has failed, and Gallery shows what it holds
      const city = typeof settings?.city === "string" ? settings.city.trim() : "";
      const unit = settings?.unit === "℉" ? "℉" : "℃";
      if (!city) return draw({ kind: "pick" });
      draw({ kind: "loading", city });
      try {
        const found = placeOf((await context.fetch(searchAddress(city, language))).data);
        if (mine !== asked) return;
        if (!found) return draw({ kind: "unknown", city });
        const answer = await context.fetch(forecastAddress(found, unit));
        if (mine !== asked) return;
        draw({ kind: "weather", city, place: found, forecast: answer.data, at: answer.at });
      } catch (error) {
        if (mine !== asked) return;
        const code = /** @type {DocFetchError} */ (error).code;
        draw({ kind: code === "consent" || code === "offline" || code === "private" ? code : "failed", city });
        if (!code) context.fail(error); // no refusal of the server's: the block's own mistake, which the kit says
      }
    };
    load();
    context.interval(load, 30 * 60_000);
    return {
      update(reason) {
        if (reason === "source") load();
        else if (reason === "layout") draw(shown);
      },
    };
  },
});
