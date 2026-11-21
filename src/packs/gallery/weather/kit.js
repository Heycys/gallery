// gallery/weather (天气): a city's weather now and for the days ahead, from Open-Meteo (open-meteo.com,
// no key), for a custom page. Its settings, `city` (a name as the reader writes it: 上海, Berlin) and
// `unit` (℃ or ℉), are the card's form (the grip at its top right › 设置…), kept in the data part
// `settings`, which the board writes and this block only reads. The city is looked up by name
// (geocoding-api.open-meteo.com: its first match, its coordinates), its weather fetched for them
// (api.open-meteo.com: now, and each day's highest, lowest and sky for six days, today and the five after
// it), both through context.fetch, the server fetching for it: its needs name the two hosts, and nothing
// is fetched until the reader allows them (the kit then shows 允许访问 on the card and starts the block
// again once the reader says yes). Fetched again as its settings change (`source`) and every 30 minutes;
// the server keeps an answer a minute and gives what it kept when the network is not there, which the
// card says by its time (更新于 09:05; an answer kept more than 10 minutes, when the network is not there,
// the head's sign of no network and when it was fetched, 昨天 21:40). In the page's language.
//
// Its face (in the kit's card tokens), laid out by the card's cells (`data-layout`, by
// context.size, read again on `layout`): a head of the chip (a place's pin), the city and when; the sky's
// picture (drawn in its own colors: the sun's orange, a cloud's gray, the rain's blue) beside the
// temperature, the hero, and the sky's words and today's lowest and highest; under them how it feels,
// the air's humidity and the wind (its direction and speed). A narrow card (2 wide) the picture and the
// temperature at the bottom and one line under them; a tall one (4 high) the next five days at the
// bottom, each its weekday, its sky, its lowest, a bar from its lowest to its highest on the scale of all
// of them, cold to warm, and its highest. What it says while there is nothing to show (no city yet, one
// not found, waiting for the reader's consent, the network not there, this computer's network setup
// sending Open-Meteo's names to an address of its own or of a private network, which the server refuses:
// code "private") is the cards' empty face under the head: what is so, and what to do, faint.

const WORDS = {
  zh: {
    title: "天气",
    states: {
      pick: ["写上一个城市", "在卡片右上角的 设置… 里填，比如「杭州」"],
      loading: ["正在取天气…", ""],
      consent: ["允许联网之后显示天气", "数据来自 open-meteo.com"],
      offline: ["现在连不上网，取不到天气", "连上以后会自己再取"],
      private: ["取不到天气", "网络设置把天气服务指向了本地地址"],
      failed: ["没能取到天气", "过一会儿会自己再取"],
    },
    unknown: (/** @type {string} */ city) => [`找不到「${city}」`, "换个写法试试，比如「上海」"],
    at: (/** @type {string} */ time) => `更新于 ${time}`,
    yesterday: (/** @type {string} */ time) => `昨天 ${time}`,
    day: (/** @type {number} */ month, /** @type {number} */ day, /** @type {string} */ time) => `${month}月${day}日 ${time}`,
    feels: (/** @type {string} */ value) => `体感 ${value}`,
    winds: ["北风", "东北风", "东风", "东南风", "南风", "西南风", "西风", "西北风"],
    wind: (/** @type {string} */ from, /** @type {number} */ value) => `${from} ${value} km/h`,
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
    states: {
      pick: ["Name a city", "In Settings… at the card's top right, such as “Berlin”"],
      loading: ["Fetching the weather…", ""],
      consent: ["Allow internet access to show the weather", "From open-meteo.com"],
      offline: ["Offline: no weather now", "It fetches again once online"],
      private: ["No weather", "The network setup sends the weather service to a local address"],
      failed: ["The weather could not be fetched", "It tries again in a while"],
    },
    unknown: (/** @type {string} */ city) => [`No place called “${city}”`, "Try another spelling, such as “Berlin”"],
    at: (/** @type {string} */ time) => `Updated ${time}`,
    yesterday: (/** @type {string} */ time) => `Yesterday ${time}`,
    day: (/** @type {number} */ month, /** @type {number} */ day, /** @type {string} */ time) => `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1]} ${day} ${time}`,
    feels: (/** @type {string} */ value) => `Feels ${value}`,
    winds: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
    wind: (/** @type {string} */ from, /** @type {number} */ value) => `${from} ${value} km/h`,
    today: "Today",
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    sky: {
      clear: "Clear", mostly: "Mostly clear", partly: "Partly cloudy", overcast: "Overcast", fog: "Fog", drizzle: "Drizzle", "freezing-drizzle": "Freezing drizzle",
      rain: "Rain", "light-rain": "Light rain", "heavy-rain": "Heavy rain", "freezing-rain": "Freezing rain", snow: "Snow", "light-snow": "Light snow", "heavy-snow": "Heavy snow",
      grains: "Snow grains", showers: "Showers", "snow-showers": "Snow showers", thunder: "Thunderstorm", hail: "Thunderstorm with hail", unknown: "Unknown",
    },
  },
};

/** How old a kept answer is before the head says it is (with no network): 10 minutes. */
const STALE = 10 * 60_000;

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
 * which the server keeps), in `unit` (℃ or ℉): now, and six days (today and the five after it), by the
 * place's own clock.
 * @param {{ latitude: number, longitude: number }} place
 * @param {string} unit
 */
const forecastAddress = (place, unit) => `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude.toFixed(2)}&longitude=${place.longitude.toFixed(2)}`
  + "&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,is_day"
  + `&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=6${unit === "℉" ? "&temperature_unit=fahrenheit" : ""}`;

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
 * What the card says, in `language`, of `state` at `now`: { kind: "pick" } (no city), { kind: "loading",
 * city }, { kind: "unknown", city } (no such place), { kind: "consent", city }, { kind: "offline", city },
 * { kind: "private", city } (the server refused the address this computer's resolver gave: one of this
 * computer or of a private network, its network setup's doing), { kind: "failed", city }, or
 * { kind: "weather", place, forecast (Open-Meteo's answer), at (when it was fetched, ISO), cached }. Its head
 * (the city, when, and whether that is an answer kept from before the network went: `stale`), and either a
 * note and its hint (the empty face) or the weather: the sky's picture and words, the temperature, today's
 * lowest and highest, the more line's pieces ({ icon, text }), and the five days after today.
 * @param {any} state
 * @param {"zh" | "en"} language
 * @param {Date} [now]
 */
function faceOf(state, language, now = new Date()) {
  const words = WORDS[language];
  const named = state.kind === "pick" || state.kind === "unknown";
  const head = { city: named ? words.title : state.city || state.place?.name || words.title, at: "", stale: false };
  if (state.kind !== "weather") {
    /** @type {Record<string, string[]>} */
    const states = words.states;
    const [note, hint] = state.kind === "unknown" ? words.unknown(state.city) : states[state.kind] ?? states.failed;
    return { head, note, hint, now: null, days: [] };
  }
  const { current = {}, daily = {} } = state.forecast ?? {};
  const sky = skyOf(current.weather_code, current.is_day !== 0);
  const fetched = typeof state.at === "string" ? new Date(state.at) : null;
  const two = (/** @type {number} */ value) => String(value).padStart(2, "0");
  if (fetched && !Number.isNaN(fetched.getTime())) {
    const time = `${two(fetched.getHours())}:${two(fetched.getMinutes())}`;
    head.stale = state.cached === true && now.getTime() - fetched.getTime() > STALE;
    const day = (/** @type {Date} */ date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
    const ago = day(now) - day(fetched);
    head.at = !head.stale ? words.at(time) : ago === 0 ? time : ago === 1 ? words.yesterday(time) : words.day(fetched.getMonth() + 1, fetched.getDate(), time);
  }
  const range = (/** @type {number} */ index) => `${degrees(daily.temperature_2m_min?.[index])} / ${degrees(daily.temperature_2m_max?.[index])}`;
  const more = [
    typeof current.apparent_temperature === "number" ? { icon: "feels", text: words.feels(degrees(current.apparent_temperature)) } : null,
    typeof current.relative_humidity_2m === "number" ? { icon: "humidity", text: `${Math.round(current.relative_humidity_2m)}%` } : null,
    typeof current.wind_speed_10m === "number" ? { icon: "wind", text: words.wind(typeof current.wind_direction_10m === "number" ? words.winds[Math.round(current.wind_direction_10m / 45) % 8] : "", Math.round(current.wind_speed_10m)).trim() } : null,
  ].filter((piece) => piece !== null);
  const dates = Array.isArray(daily.time) ? daily.time : [];
  const days = dates.slice(1, 6).map((/** @type {string} */ date, /** @type {number} */ at) => {
    const index = at + 1;
    const [year, month, day] = String(date).split("-").map(Number);
    const weekday = words.weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? "";
    const [high, low] = [daily.temperature_2m_max?.[index], daily.temperature_2m_min?.[index]];
    const kind = skyOf(daily.weather_code?.[index]);
    return { weekday, picture: kind.picture, sky: words.sky[kind.words], range: range(index), high: degrees(high), low: degrees(low), span: typeof high === "number" && typeof low === "number" && Number.isFinite(high) && Number.isFinite(low) ? [low, high] : null };
  });
  const span = typeof daily.temperature_2m_max?.[0] === "number" && typeof daily.temperature_2m_min?.[0] === "number" ? [daily.temperature_2m_min[0], daily.temperature_2m_max[0]] : null;
  return { head, note: "", hint: "", now: { picture: sky.picture, sky: words.sky[sky.words], temperature: degrees(current.temperature_2m), range: dates.length ? range(0) : "", span, more }, days };
}

// The sky's pictures, each drawn on a box of 64 in its own colors (style.css: the sun's orange, a cloud's
// gray, the rain's blue, as the instance's custom properties say them in light and dark).
const cloud = (x = 0, y = 0, scale = 1, tone = "cloud") => `<g transform="translate(${x} ${y}) scale(${scale})" class="gallery-weather-${tone}"><rect x="13" y="34" width="39" height="15" rx="7.5"/><circle cx="24" cy="35" r="8.5"/><circle cx="35.5" cy="30" r="11.5"/><circle cx="45.5" cy="38" r="7.5"/></g>`;
function sunAt(cx, cy, r) {
  let rays = "";
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    rays += `<line x1="${(cx + (r + 5) * Math.cos(a)).toFixed(1)}" y1="${(cy + (r + 5) * Math.sin(a)).toFixed(1)}" x2="${(cx + (r + 9.5) * Math.cos(a)).toFixed(1)}" y2="${(cy + (r + 9.5) * Math.sin(a)).toFixed(1)}"/>`;
  }
  return `<g class="gallery-weather-sun"><circle cx="${cx}" cy="${cy}" r="${r}"/><g class="gallery-weather-rays" stroke-width="3" stroke-linecap="round">${rays}</g></g>`;
}
const moonAt = (cx, cy, r) => `<path class="gallery-weather-moon" d="M${cx + r * 0.35} ${cy - r}a${r} ${r} 0 1 0 ${r * 0.65} ${r * 1.55}a${r * 0.8} ${r * 0.8} 0 0 1 -${r * 0.65} -${r * 1.55}z"/>`;
const PICTURES = {
  sun: sunAt(32, 32, 11),
  moon: moonAt(30, 32, 14),
  partly: sunAt(24, 23, 9) + cloud(5, 5, 0.95),
  "partly-night": moonAt(22, 22, 11) + cloud(5, 5, 0.95),
  cloud: cloud(-6, -8, 0.9, "cloud-2") + cloud(4, 2, 1),
  fog: `${cloud(0, -8, 1)}<g class="gallery-weather-mist" stroke-width="3.2" stroke-linecap="round"><line x1="14" y1="49" x2="50" y2="49"/><line x1="20" y1="56" x2="44" y2="56"/></g>`,
  rain: `${cloud(0, -6, 1)}<g class="gallery-weather-rain" stroke-width="3.2" stroke-linecap="round"><line x1="24" y1="49" x2="21.5" y2="55"/><line x1="33.5" y1="49" x2="31" y2="55"/><line x1="43" y1="49" x2="40.5" y2="55"/></g>`,
  snow: `${cloud(0, -6, 1)}<g class="gallery-weather-snow"><circle cx="23" cy="52" r="2.4"/><circle cx="32.5" cy="56" r="2.4"/><circle cx="42" cy="52" r="2.4"/></g>`,
  thunder: `${cloud(0, -8, 1)}<path class="gallery-weather-bolt" d="M34 40l-7 10h6l-3 9 9-12h-6l3-7z"/>`,
};
// The more line's small pictures, of lines, 24 x 24.
const ICONS = {
  feels: '<path d="M10 13.8V5.5a2 2 0 1 1 4 0v8.3a3.8 3.8 0 1 1-4 0z"/>',
  humidity: '<path d="M12 4s5.5 6 5.5 10a5.5 5.5 0 0 1-11 0C6.5 10 12 4 12 4z"/>',
  wind: '<path d="M3.5 9.5h10a2.8 2.8 0 1 0-2.8-2.8M3.5 14.5h14a2.8 2.8 0 1 1-2.8 2.8M3.5 12h6"/>',
  offline: '<path d="M3.5 3.5l17 17M9 16.2a4.5 4.5 0 0 1 5.5-.5M5.5 12.5a9.5 9.5 0 0 1 3.6-2.3M18.6 12.6a9.5 9.5 0 0 0-3-2.1M2.5 9a14 14 0 0 1 3.5-2.3M21.5 9A14 14 0 0 0 10.6 5.3"/><circle cx="12" cy="19.5" r=".9" fill="currentColor"/>',
};
const lines = (/** @type {string} */ drawing) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${drawing}</svg>`;

/**
 * An element of the face, of `kind` (its class).
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string} kind
 */
function made(tag, kind) {
  const node = document.createElement(tag);
  node.className = `gallery-weather-${kind}`;
  return node;
}

/** A sky's picture, as an svg element. @param {string} picture */
function pictureOf(picture) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 64 64");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "gallery-weather-picture");
  svg.innerHTML = PICTURES[/** @type {keyof typeof PICTURES} */ (picture)] ?? PICTURES.cloud;
  return svg;
}

DocKit.component({
  id: "gallery/weather",
  on: ["source", "layout"],
  mount(host, context) {
    const language = languageOf(document.documentElement);
    const face = made("div", "face");
    host.append(face);
    const layout = () => {
      const size = context.size;
      face.dataset.layout = !size ? "wide" : size.w <= 2 ? "narrow" : size.h >= 4 ? "tall" : "wide";
    };
    const draw = (/** @type {any} */ state) => {
      const said = faceOf(state, language);
      const head = made("p", "head");
      const chip = made("span", "chip");
      chip.setAttribute("aria-hidden", "true");
      chip.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.27" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5a2.9 2.9 0 0 1-.45-5.76 3.75 3.75 0 0 1 7.25.9A2.45 2.45 0 0 1 11.5 12.5z"/></svg>';
      const city = made("span", "city");
      city.textContent = said.head.city;
      const at = made("span", "at");
      if (said.head.stale) {
        const sign = made("span", "stale");
        sign.innerHTML = lines(ICONS.offline);
        sign.dataset.docTip = said.head.at;
        at.append(sign);
      }
      // The time in words of its own: a narrow card shows the sign of an answer kept from before alone (style.css).
      const when = made("span", "when");
      when.textContent = said.head.at;
      at.append(when);
      head.append(chip, city, at);
      /** @type {HTMLElement[]} */
      const parts = [head];
      if (said.now) {
        const now = made("div", "now");
        const temperature = made("span", "temperature");
        temperature.textContent = said.now.temperature;
        temperature.dataset.length = String(said.now.temperature.length); // −12° or 105° and longer: a 2 × 2 card's number steps down (style.css)
        const words = made("span", "words");
        const sky = made("span", "sky");
        sky.textContent = said.now.sky;
        const range = made("span", "range");
        range.textContent = said.now.range;
        words.append(sky, range);
        now.append(pictureOf(said.now.picture), temperature, words);
        const more = made("p", "more");
        more.replaceChildren(...said.now.more.map(({ icon, text }) => {
          const span = made("span", "piece");
          span.innerHTML = lines(ICONS[/** @type {keyof typeof ICONS} */ (icon)]);
          span.append(text);
          return span;
        }));
        const days = made("ol", "days");
        const spans = [...said.days.flatMap((day) => (day.span ? [day.span] : [])), ...(said.now.span ? [said.now.span] : [])];
        const lowest = Math.min(...spans.map(([low]) => low));
        const highest = Math.max(...spans.map(([, high]) => high));
        days.replaceChildren(...said.days.map((day) => {
          const item = made("li", "day");
          const weekday = made("span", "weekday");
          weekday.textContent = day.weekday;
          const low = made("span", "low");
          low.textContent = day.low;
          const bar = made("span", "bar");
          bar.setAttribute("aria-hidden", "true");
          if (day.span && highest > lowest) {
            // The day's part of the whole scale, its colors the scale's own there: the gradient as wide as the scale, moved under it.
            const from = (day.span[0] - lowest) / (highest - lowest);
            const to = (day.span[1] - lowest) / (highest - lowest);
            const fill = made("span", "fill");
            fill.style.left = `${from * 100}%`;
            fill.style.right = `${(1 - to) * 100}%`;
            const part = Math.max(to - from, 0.01);
            fill.style.backgroundSize = `${100 / part}% 100%`;
            fill.style.backgroundPosition = `${1 - part > 0 ? (from / (1 - part)) * 100 : 0}% 0`;
            bar.append(fill);
          }
          const high = made("span", "high");
          high.textContent = day.high;
          const picture = pictureOf(day.picture);
          picture.setAttribute("aria-label", day.sky);
          picture.removeAttribute("aria-hidden");
          picture.setAttribute("role", "img");
          item.append(weekday, picture, low, bar, high);
          return item;
        }));
        // A narrow card's one line under the temperature: the sky, then today's lowest and highest.
        const line = made("p", "line");
        const lineSky = document.createElement("b");
        lineSky.textContent = said.now.sky;
        const dot = made("span", "dot");
        dot.textContent = "·";
        line.append(lineSky, dot, said.now.range);
        parts.push(now, line, more, days);
      } else {
        const empty = made("div", "empty");
        const note = made("p", "note");
        note.textContent = said.note;
        empty.append(note);
        if (said.hint) {
          const hint = made("p", "hint");
          hint.textContent = said.hint;
          empty.append(hint);
        }
        parts.push(empty);
      }
      face.replaceChildren(...parts);
      face.dataset.kind = state.kind;
      layout();
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
        draw({ kind: "weather", city, place: found, forecast: answer.data, at: answer.at, cached: answer.cached });
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
        else if (reason === "layout") layout();
      },
    };
  },
});
