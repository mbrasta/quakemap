/* ============================================================
   رصد — نقشهٔ زندهٔ زمین‌لرزه
   داده: USGS (GeoJSON ۳۰ روز اخیر) — بدون نیاز به سرور
   ============================================================ */
(function () {
  "use strict";

  /* ------------------------------------------------------------
     ۱) ثابت‌ها
  ------------------------------------------------------------ */
  const USGS_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson";
  const CACHE_KEY = "rasad-feed-v1";
  const REFRESH_MS = 180000; // هر ۳ دقیقه
  const CLOCK_MS = 30000; // هر ۳۰ ثانیه
  const ROW = 68; // ارتفاع هر ردیف لیست (px)

  const TIME_MS = {
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
  };

  const REGIONS = {
    iran: { minLat: 25, maxLat: 39.8, minLon: 44, maxLon: 63.4 },
    mideast: { minLat: 12, maxLat: 42, minLon: 24, maxLon: 66 },
  };

  const REGION_VIEW = {
    world: { center: [22, 18], zoom: 2 },
    iran: { center: [32.5, 53.5], zoom: 5 },
    mideast: { center: [28, 45], zoom: 4 },
  };

  const MAG_COLORS = ["#8b99a6", "#3f8f6b", "#a8843f", "#c4623a", "#a33a3a"];

  const MAG_BUCKETS = [
    { label: "زیر ۲", tone: 0 },
    { label: "۲–۳", tone: 0 },
    { label: "۳–۴", tone: 1 },
    { label: "۴–۵", tone: 2 },
    { label: "۵–۶", tone: 3 },
    { label: "۶+", tone: 4 },
  ];

  const TILES = {
    night: {
      url: "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=cb1_4ht6_1_aa71736399781e4ca8735d4d",
      attr: "&copy; OpenStreetMap &copy; CARTO",
      subdomains: "abcd",
      maxZoom: 20,
    },
    paper: {
      url: "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=cb1_4ht6_1_aa71736399781e4ca8735d4d",
      attr: "&copy; OpenStreetMap &copy; CARTO",
      subdomains: "abcd",
      maxZoom: 20,
    },
    sat: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attr: "Tiles &copy; Esri",
      subdomains: "abc",
      maxZoom: 18,
    },
  };

  const UI = {
    regions: [
      { id: "world", label: "جهان" },
      { id: "iran", label: "ایران" },
    ],
    times: [
      { id: "hour", label: "ساعت" },
      { id: "day", label: "روز" },
      { id: "week", label: "هفته" },
      { id: "month", label: "ماه" },
    ],
    mags: [
      { id: "0", label: "همه" },
      { id: "3", label: "۳+" },
      { id: "4", label: "۴+" },
      { id: "5", label: "۵+" },
      { id: "6", label: "۶+" },
    ],
    depths: [
      { id: "all", label: "همه" },
      { id: "shallow", label: "تا ۷۰ کیلومتر" },
      { id: "deep", label: "عمیق‌تر" },
    ],
    sorts: [
      { id: "time", label: "زمان" },
      { id: "mag", label: "بزرگی" },
      { id: "depth", label: "عمق" },
    ],
    bases: [
      { id: "night", label: "شب" },
      { id: "paper", label: "روز" },
      { id: "sat", label: "ماهواره" },
    ],
  };

  const DEFAULTS = { minMag: 3, timeRange: "week", region: "world", depth: "all" };

  /* ------------------------------------------------------------
     ۲) ترجمهٔ نام مکان‌ها به فارسی
  ------------------------------------------------------------ */
  const DIRS = {
    N: "شمال", NNE: "شمال‌شمال‌شرقی", NE: "شمال‌شرقی", ENE: "شرق‌شمال‌شرقی",
    E: "شرق", ESE: "شرق‌جنوب‌شرقی", SE: "جنوب‌شرقی", SSE: "جنوب‌جنوب‌شرقی",
    S: "جنوب", SSW: "جنوب‌جنوب‌غربی", SW: "جنوب‌غربی", WSW: "غرب‌جنوب‌غربی",
    W: "غرب", WNW: "غرب‌شمال‌غربی", NW: "شمال‌غربی", NNW: "شمال‌شمال‌غربی",
  };

  const NAMES = [
    ["United Arab Emirates", "امارات"], ["Saudi Arabia", "عربستان"],
    ["Papua New Guinea", "پاپوآ گینهٔ نو"], ["New Zealand", "نیوزیلند"],
    ["United States", "ایالات متحده"], ["Persian Gulf", "خلیج فارس"],
    ["Caspian Sea", "دریای خزر"], ["Mediterranean Sea", "دریای مدیترانه"],
    ["Indian Ocean", "اقیانوس هند"], ["Pacific Ocean", "اقیانوس آرام"],
    ["Red Sea", "دریای سرخ"], ["Sea of Japan", "دریای ژاپن"],
    ["Mid-Atlantic Ridge", "رشته‌کوه میان‌اطلسی"], ["Hindu Kush", "هندوکش"],
    ["Puerto Rico", "پورتوریکو"], ["Afghanistan", "افغانستان"],
    ["Turkmenistan", "ترکمنستان"], ["Azerbaijan", "آذربایجان"],
    ["California", "کالیفرنیا"], ["Indonesia", "اندونزی"],
    ["Philippines", "فیلیپین"], ["Pakistan", "پاکستان"],
    ["Tajikistan", "تاجیکستان"], ["Kyrgyzstan", "قرقیزستان"],
    ["Uzbekistan", "ازبکستان"], ["Kazakhstan", "قزاقستان"],
    ["Argentina", "آرژانتین"], ["Australia", "استرالیا"],
    ["Greenland", "گرینلند"], ["Guatemala", "گواتمالا"],
    ["Nicaragua", "نیکاراگوئه"], ["El Salvador", "السالوادور"],
    ["Costa Rica", "کاستاریکا"], ["Washington", "واشنگتن"],
    ["Türkiye", "ترکیه"], ["Turkey", "ترکیه"], ["Armenia", "ارمنستان"],
    ["Georgia", "گرجستان"], ["Lebanon", "لبنان"], ["Bahrain", "بحرین"],
    ["Kuwait", "کویت"], ["Qatar", "قطر"], ["Yemen", "یمن"], ["Jordan", "اردن"],
    ["Israel", "اسرائیل"], ["Syria", "سوریه"], ["Cyprus", "قبرس"],
    ["Greece", "یونان"], ["Italy", "ایتالیا"], ["Japan", "ژاپن"],
    ["China", "چین"], ["India", "هند"], ["Nepal", "نپال"], ["Taiwan", "تایوان"],
    ["Russia", "روسیه"], ["Mexico", "مکزیک"], ["Canada", "کانادا"],
    ["Alaska", "آلاسکا"], ["Hawaii", "هاوایی"], ["Oregon", "اورگن"],
    ["Nevada", "نوادا"], ["Montana", "مونتانا"], ["Oklahoma", "اوکلاهما"],
    ["Texas", "تگزاس"], ["Chile", "شیلی"], ["Peru", "پرو"],
    ["Ecuador", "اکوادور"], ["Colombia", "کلمبیا"], ["Iceland", "ایسلند"],
    ["Tonga", "تونگا"], ["Fiji", "فیجی"], ["Vanuatu", "وانواتو"],
    ["Iran", "ایران"], ["Iraq", "عراق"], ["Oman", "عمان"],
  ]
    .sort((a, b) => b[0].length - a[0].length)
    .map(([en, fa]) => [
      new RegExp("\\b" + en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+") + "\\b", "gi"),
      fa,
    ]);

  const PREFIXES = [
    [/^off the coast of\s+/i, "دور از ساحل "],
    [/^near the coast of\s+/i, "نزدیک ساحل "],
    [/^south of\s+/i, "جنوب "],
    [/^north of\s+/i, "شمال "],
    [/^east of\s+/i, "شرق "],
    [/^west of\s+/i, "غرب "],
    [/^southern\s+/i, "جنوب "],
    [/^northern\s+/i, "شمال "],
    [/^eastern\s+/i, "شرق "],
    [/^western\s+/i, "غرب "],
    [/^central\s+/i, "مرکز "],
    [/^near\s+/i, "نزدیک "],
  ];

  const placeCache = new Map();

  function translateTail(input) {
    let out = input.replace(/\s+region\b/gi, "");
    for (const [re, fa] of PREFIXES) {
      if (re.test(out)) {
        out = out.replace(re, fa);
        break;
      }
    }
    for (const [re, fa] of NAMES) out = out.replace(re, fa);
    return out.replace(/,\s*/g, "، ").replace(/\s+/g, " ").trim();
  }

  function placeFa(place) {
    const hit = placeCache.get(place);
    if (hit) return hit;
    const km = place.trim().match(/^(\d+(?:\.\d+)?)\s*km\s+([A-Z]{1,3})\s+of\s+(.+)$/i);
    let fa;
    if (km) {
      const kmFa = Number(km[1]).toLocaleString("fa-IR", { maximumFractionDigits: 0 });
      const dir = DIRS[km[2].toUpperCase()] || km[2];
      fa = kmFa + " کیلومتری " + dir + " " + translateTail(km[3]);
    } else {
      fa = translateTail(place);
    }
    placeCache.set(place, fa);
    return fa;
  }

  /* ------------------------------------------------------------
     ۳) توابع کمکی و قالب‌بندی
  ------------------------------------------------------------ */
  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
    );
  }

  const round1 = (n) => Math.round(n * 10) / 10;
  const fmtInt = (n) => Math.round(n).toLocaleString("fa-IR");
  const fmtMag = (m) =>
    m.toLocaleString("fa-IR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  function fmtAgo(time, now) {
    const s = Math.max(0, now - time) / 1000;
    if (s < 45) return "همین حالا";
    if (s < 3600) return fmtInt(Math.floor(s / 60)) + " دقیقه پیش";
    if (s < 86400) return fmtInt(Math.floor(s / 3600)) + " ساعت پیش";
    return fmtInt(Math.floor(s / 86400)) + " روز پیش";
  }

  function fmtWhen(time) {
    return new Date(time).toLocaleString("fa-IR", {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  function fmtCoord(lat, lon) {
    return (
      Math.abs(lat).toFixed(2) + "° " + (lat >= 0 ? "N" : "S") + "  " +
      Math.abs(lon).toFixed(2) + "° " + (lon >= 0 ? "E" : "W")
    );
  }

  function magTone(m) {
    if (m >= 6) return 4;
    if (m >= 5) return 3;
    if (m >= 4) return 2;
    if (m >= 3) return 1;
    return 0;
  }

  function bucketIndex(m) {
    if (m < 2) return 0;
    if (m < 3) return 1;
    if (m < 4) return 2;
    if (m < 5) return 3;
    if (m < 6) return 4;
    return 5;
  }

  const magRadius = (m) => Math.min(28, 4 + Math.pow(Math.max(0, m), 1.45) * 1.15);

  function inRegion(q, region) {
    if (region === "world") return true;
    const b = REGIONS[region];
    return q.lat >= b.minLat && q.lat <= b.maxLat && q.lon >= b.minLon && q.lon <= b.maxLon;
  }

  function depthOk(depth, mode) {
    if (mode === "all") return true;
    if (depth == null) return false;
    return mode === "shallow" ? depth <= 70 : depth > 70;
  }

  const ALERTS = { green: "سبز", yellow: "زرد", orange: "نارنجی", red: "قرمز" };
  const alertFa = (a) => (a ? ALERTS[a] || a : null);
  const statusFa = (s) => (s === "reviewed" ? "بازبینی‌شده" : s === "automatic" ? "خودکار" : null);

  // یکسان‌سازی «ي/ك» عربی با «ی/ک» فارسی برای جستجو
  const normFa = (s) => s.replace(/ي/g, "ی").replace(/ك/g, "ک").toLowerCase();

  function safeUrl(value) {
    const fallback = "https://earthquake.usgs.gov/";
    if (typeof value !== "string") return fallback;
    try {
      const u = new URL(value);
      return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function normalizeFeature(raw) {
    if (!raw || typeof raw !== "object") return null;
    const coords = raw.geometry && raw.geometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    const p = raw.properties || {};
    if (p.mag == null || !Number.isFinite(Number(p.mag))) return null;
    const depth =
      coords[2] == null || !Number.isFinite(Number(coords[2])) ? null : Number(coords[2]);
    const time = typeof p.time === "number" && Number.isFinite(p.time) ? p.time : 0;
    const id =
      typeof raw.id === "string" && raw.id ? raw.id : time + ":" + lat.toFixed(3) + ":" + lon.toFixed(3);
    return {
      id,
      mag: Number(p.mag),
      place: typeof p.place === "string" && p.place.trim() ? p.place.trim() : "موقعیت نامشخص",
      time,
      url: safeUrl(p.url),
      tsunami: p.tsunami === 1,
      felt: typeof p.felt === "number" ? p.felt : null,
      alert: typeof p.alert === "string" ? p.alert : null,
      magType: typeof p.magType === "string" ? p.magType : null,
      status: typeof p.status === "string" ? p.status : null,
      lat,
      lon,
      depth,
    };
  }

  function store(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* ممکن است فضا پر باشد */ }
  }
  function load(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  const prefersStill = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const ICON_SUN =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';
  const ICON_MOON =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
  const ICON_X =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  const ICON_LINK =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>';
  const ICON_COPY =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';

  /* ------------------------------------------------------------
     ۴) وضعیت برنامه
  ------------------------------------------------------------ */
  const state = {
    theme: document.documentElement.dataset.theme === "light" ? "light" : "dark",
    basemap: "night",
    region: DEFAULTS.region,
    timeRange: DEFAULTS.timeRange,
    depth: DEFAULTS.depth,
    sort: "time",
    minMag: DEFAULTS.minMag, // مقدار لحظه‌ای اسلایدر
    minMagQ: DEFAULTS.minMag, // مقدار اعمال‌شده (بعد از debounce)
    search: "",
    searchQ: "",
    feed: null,
    loading: true,
    error: null,
    selectedId: null,
    now: Date.now(),
    filtered: [],
    sorted: [],
    quakes: [],
  };

  // بازیابی ترجیحات ذخیره‌شده
  (function restorePrefs() {
    const b = load("rasad-basemap");
    state.basemap = b === "night" || b === "paper" || b === "sat" ? b : state.theme === "light" ? "paper" : "night";
    const r = load("rasad-region");
    if (r === "iran" || r === "mideast" || r === "world") state.region = r;
  })();

  /* ------------------------------------------------------------
     ۵) کنترل‌های قطعه‌ای (Segmented)
  ------------------------------------------------------------ */
  function buildSeg(host, items, onPick) {
    host.innerHTML = items
      .map((i) => '<button type="button" data-id="' + esc(i.id) + '" aria-pressed="false">' + esc(i.label) + "</button>")
      .join("");
    host.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-id]");
      if (b) onPick(b.dataset.id);
    });
  }

  function syncSeg(host, value) {
    host.querySelectorAll("button[data-id]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.id === String(value)));
    });
  }

  function syncControls() {
    syncSeg($("segRegion"), state.region);
    syncSeg($("segTime"), state.timeRange);
    syncSeg($("segMag"), String(round1(state.minMag)));
    syncSeg($("segDepth"), state.depth);
    syncSeg($("segSort"), state.sort);
    syncSeg($("segBase"), state.basemap);
    $("magValue").textContent = fmtMag(state.minMag);
    $("magRange").value = String(state.minMag);
    const dirty =
      round1(state.minMag) !== DEFAULTS.minMag ||
      state.timeRange !== DEFAULTS.timeRange ||
      state.region !== DEFAULTS.region ||
      state.depth !== DEFAULTS.depth ||
      state.search !== "";
    $("resetBtn").disabled = !dirty;
    $("searchClear").hidden = state.search === "";
  }

  /* ------------------------------------------------------------
     ۶) نقشه (Leaflet + Supercluster)
  ------------------------------------------------------------ */
  const mapView = (function () {
    let map = null;
    let group = null;
    let tile = null;
    let me = null;
    let index = null;
    let byId = new Map();
    let ready = false;

    const isCluster = (p) => p && p.cluster === true && typeof p.cluster_id === "number";

    function init() {
      const host = $("map");
      if (typeof L === "undefined" || typeof Supercluster === "undefined") {
        host.innerHTML =
          '<div class="map-fallback"><p>بارگذاری کتابخانهٔ نقشه ممکن نشد.<br />اتصال اینترنت را بررسی و صفحه را دوباره باز کنید.</p></div>';
        return;
      }
      const view = REGION_VIEW[state.region];
      map = L.map(host, {
        worldCopyJump: true,
        minZoom: 2,
        maxZoom: 18,
        zoomControl: true,
        attributionControl: true,
      }).setView(view.center, view.zoom);
      map.zoomControl.setPosition("topleft");
      group = L.layerGroup().addTo(map);
      setBasemap(state.basemap);
      map.on("moveend", render);
      new ResizeObserver(() => {
        map.invalidateSize();
        render();
      }).observe(host);
      ready = true;
      requestAnimationFrame(() => {
        map.invalidateSize();
        render();
      });
    }

    function setBasemap(id) {
      if (!ready && !map) return;
      if (tile) tile.remove();
      const spec = TILES[id];
      tile = L.tileLayer(spec.url, {
        attribution: spec.attr,
        maxZoom: spec.maxZoom,
        subdomains: spec.subdomains,
      }).addTo(map);
      render();
    }

    function setQuakes(list) {
      if (!map) return;
      byId = new Map(list.map((q) => [q.id, q]));
      index = new Supercluster({
        radius: 56,
        maxZoom: 14,
        minPoints: 2,
        map: (props) => ({ maxMag: props.mag }),
        reduce: (acc, props) => {
          acc.maxMag = Math.max(acc.maxMag, props.maxMag);
        },
      });
      index.load(
        list.map((q) => ({
          type: "Feature",
          properties: { id: q.id, mag: q.mag },
          geometry: { type: "Point", coordinates: [q.lon, q.lat] },
        }))
      );
      render();
    }

    function render() {
      if (!map || !index) return;
      const size = map.getSize();
      if (size.x < 2 || size.y < 2) return;
      const b = map.getBounds();
      let features;
      try {
        features = index.getClusters(
          [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
          Math.max(0, Math.round(map.getZoom()))
        );
      } catch (e) {
        return;
      }
      group.clearLayers();
      const selectedStroke = state.basemap === "paper" ? "#1c1d20" : "#f4f4f5";

      for (const f of features) {
        const lon = f.geometry.coordinates[0];
        const lat = f.geometry.coordinates[1];
        const props = f.properties;

        if (isCluster(props)) {
          const count = props.point_count;
          const tone = magTone(props.maxMag || 0);
          const px = count < 10 ? 34 : count < 100 ? 42 : count < 1000 ? 50 : 58;
          const icon = L.divIcon({
            className: "q-cluster tone-" + tone,
            html: "<span>" + count.toLocaleString("fa-IR") + "</span>",
            iconSize: [px, px],
            iconAnchor: [px / 2, px / 2],
          });
          const marker = L.marker([lat, lon], { icon: icon, keyboard: false });
          marker.on("click", () => {
            let z;
            try {
              z = Math.min(index.getClusterExpansionZoom(props.cluster_id), 14);
            } catch (e) {
              z = Math.min(map.getZoom() + 2, 14);
            }
            map.flyTo([lat, lon], z, { duration: prefersStill() ? 0 : 0.45 });
          });
          group.addLayer(marker);
          continue;
        }

        const q = byId.get(props.id);
        if (!q) continue;
        const sel = state.selectedId === q.id;
        const circle = L.circleMarker([lat, lon], {
          radius: magRadius(q.mag),
          fillColor: MAG_COLORS[magTone(q.mag)],
          fillOpacity: sel ? 1 : 0.92,
          color: sel ? selectedStroke : "#14161a",
          weight: sel ? 3 : 1,
          opacity: 1,
        });
        circle.bindTooltip(
          '<div class="tip-in"><b>' + esc(fmtMag(q.mag)) + "</b><span>" + esc(placeFa(q.place)) + "</span></div>",
          { className: "q-tip", direction: "top", offset: [0, -4], opacity: 1 }
        );
        circle.on("click", () => select(q.id, true));
        group.addLayer(circle);
      }
    }

    function fit() {
      if (!map) return;
      const still = prefersStill();
      const pts = state.filtered;
      if (pts.length === 0) {
        const v = REGION_VIEW[state.region];
        map.setView(v.center, v.zoom, { animate: !still });
        return;
      }
      const bounds = L.latLngBounds(pts.map((q) => [q.lat, q.lon]));
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 7, animate: !still });
    }

    function flyTo(lat, lon, zoom) {
      if (!map) return;
      map.flyTo([lat, lon], zoom || 6, { duration: prefersStill() ? 0 : 0.7 });
    }

    function showMe(lat, lon) {
      if (!map) return;
      if (me) me.remove();
      me = L.circleMarker([lat, lon], {
        radius: 7, color: "#ffffff", weight: 2, fillColor: "#3b82f6", fillOpacity: 1, interactive: false,
      }).addTo(map);
    }

    // نقشه را روی زمین‌لرزهٔ انتخاب‌شده می‌برد (در صورت نیاز)
    function reveal(id) {
      if (!map || !index) return;
      render();
      const q = id ? byId.get(id) : null;
      if (!q) return;
      let revealZoom = 6;
      for (let z = 2; z <= 12; z += 1) {
        const found = index
          .getClusters([q.lon - 12, q.lat - 12, q.lon + 12, q.lat + 12], z)
          .some((f) => !isCluster(f.properties) && f.properties.id === q.id);
        if (found) {
          revealZoom = z;
          break;
        }
      }
      const ll = [q.lat, q.lon];
      const visible = map.getBounds().contains(ll) && map.getZoom() + 0.01 >= revealZoom;
      if (!visible) map.flyTo(ll, Math.max(revealZoom, 3), { duration: prefersStill() ? 0 : 0.6 });
    }

    return { init, setBasemap, setQuakes, render, fit, flyTo, showMe, reveal };
  })();

  /* ------------------------------------------------------------
     ۷) لیست مجازی‌سازی‌شدهٔ رویدادها
  ------------------------------------------------------------ */
  const list = (function () {
    const sc = $("qList");
    let rows = [];
    let spacer = null;
    let raf = 0;

    function rowHtml(q, i) {
      const tone = magTone(q.mag);
      const depth = q.depth == null ? "عمق نامشخص" : fmtInt(q.depth) + " کیلومتر";
      return (
        '<div class="q-slot" style="top:' + i * ROW + 'px">' +
        '<button type="button" class="q-row" data-id="' + esc(q.id) + '" aria-pressed="' + (state.selectedId === q.id) + '">' +
        '<span class="mag tone-' + tone + '">' + fmtMag(q.mag) + "</span>" +
        '<span class="q-copy"><span class="q-place">' + esc(placeFa(q.place)) + "</span>" +
        '<span class="q-meta"><span>' + depth + '</span><span data-ago="' + q.time + '">' + fmtAgo(q.time, state.now) + "</span>" +
        (q.tsunami ? '<span class="tag-alert">سونامی</span>' : "") +
        "</span></span></button></div>"
      );
    }

    function paint() {
      raf = 0;
      if (rows.length === 0) {
        sc.classList.add("q-list-empty");
        sc.innerHTML = "<p>زمین‌لرزه‌ای با این فیلترها نیست.</p>";
        spacer = null;
        return;
      }
      sc.classList.remove("q-list-empty");
      if (!spacer || !spacer.isConnected) {
        sc.innerHTML = "";
        spacer = document.createElement("div");
        spacer.className = "q-spacer";
        sc.appendChild(spacer);
      }
      spacer.style.height = rows.length * ROW + "px";
      const h = sc.clientHeight || 420;
      const start = Math.max(0, Math.floor(sc.scrollTop / ROW) - 6);
      const end = Math.min(rows.length, Math.ceil((sc.scrollTop + h) / ROW) + 6);
      let html = "";
      for (let i = start; i < end; i += 1) html += rowHtml(rows[i], i);
      spacer.innerHTML = html;
    }

    const schedule = () => { if (!raf) raf = requestAnimationFrame(paint); };

    sc.addEventListener("scroll", schedule, { passive: true });
    new ResizeObserver(schedule).observe(sc);
    sc.addEventListener("click", (e) => {
      const b = e.target.closest(".q-row");
      if (b) select(b.dataset.id, false);
    });

    return {
      setRows(r, resetScroll) {
        rows = r;
        if (resetScroll) sc.scrollTop = 0;
        paint();
      },
      skeleton() {
        sc.classList.add("q-list-empty");
        sc.setAttribute("aria-busy", "true");
        sc.innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel short"></div><p>در حال دریافت زمین‌لرزه‌ها…</p>';
        spacer = null;
      },
      done() { sc.removeAttribute("aria-busy"); },
      markSelected() {
        sc.querySelectorAll(".q-row").forEach((b) => {
          b.setAttribute("aria-pressed", String(b.dataset.id === state.selectedId));
        });
      },
      updateTimes() {
        sc.querySelectorAll("[data-ago]").forEach((el) => {
          el.textContent = fmtAgo(Number(el.dataset.ago), state.now);
        });
      },
      scrollToId(id) {
        const idx = rows.findIndex((q) => q.id === id);
        if (idx < 0) return;
        sc.scrollTop = Math.max(0, idx * ROW - sc.clientHeight / 2 + ROW / 2);
        paint();
      },
    };
  })();

  /* ------------------------------------------------------------
     ۸) رندر بخش‌های مختلف رابط
  ------------------------------------------------------------ */
  function renderChart(rows) {
    const host = $("chartHost");
    if (rows.length === 0) {
      host.innerHTML = '<p class="muted">موردی برای نمودار نیست.</p>';
      return;
    }
    const counts = [0, 0, 0, 0, 0, 0];
    for (const q of rows) counts[bucketIndex(q.mag)] += 1;
    const max = Math.max.apply(null, counts) || 1;
    host.innerHTML =
      '<div class="chart" role="img" aria-label="توزیع بزرگی زمین‌لرزه‌ها">' +
      MAG_BUCKETS.map((b, i) => {
        const pct = (counts[i] / max) * 100;
        return (
          '<div class="chart-col" title="' + esc(b.label) + ": " + fmtInt(counts[i]) + '">' +
          '<span class="chart-val">' + fmtInt(counts[i]) + "</span>" +
          '<div class="chart-bar' + (counts[i] === 0 ? " is-zero" : "") + '" style="height:calc((100% - 34px) * ' + (pct / 100).toFixed(3) + ');background:' + MAG_COLORS[b.tone] + '"></div>' +
          '<span class="chart-label">' + esc(b.label) + "</span></div>"
        );
      }).join("") +
      "</div>";
  }

  function renderStats() {
    const f = state.filtered;
    $("statCountVal").textContent = state.feed ? fmtInt(f.length) : "—";
    const strongest = f.reduce((best, q) => (!best || q.mag > best.mag ? q : best), null);
    const newest = f.reduce((best, q) => (!best || q.time > best.time ? q : best), null);
    state.strongestId = strongest ? strongest.id : null;
    state.newestId = newest ? newest.id : null;
    $("statStrong").disabled = !strongest;
    $("statNew").disabled = !newest;
    $("statStrongVal").textContent = strongest ? fmtMag(strongest.mag) : "—";
    $("statNewVal").textContent = newest ? fmtAgo(newest.time, state.now) : "—";
    $("listCount").textContent = state.loading && !state.feed ? "…" : fmtInt(state.sorted.length);
  }

  function renderNotable() {
    const host = $("notableHost");
    const t = Date.now();
    let best = null;
    for (const q of state.quakes) {
      if (!inRegion(q, state.region)) continue;
      if (t - q.time > TIME_MS.week) continue;
      if (!best || q.mag > best.mag) best = q;
    }
    const notable = best && best.mag >= 5.5 ? best : null;
    const show = notable && (notable.mag >= 6 || !state.filtered.some((q) => q.id === notable.id));
    if (!show) {
      host.innerHTML = "";
      state.notableId = null;
      return;
    }
    state.notableId = notable.id;
    host.innerHTML =
      '<button type="button" class="notable" id="notableBtn">' +
      '<span class="mag tone-' + magTone(notable.mag) + '">' + fmtMag(notable.mag) + "</span>" +
      '<span class="q-copy"><span class="q-place">قوی‌ترین هفته</span>' +
      '<span class="q-meta"><span>' + esc(placeFa(notable.place)) + "</span></span></span></button>";
  }

  function renderStatus() {
    const live = $("live");
    const down = state.error && !state.feed;
    live.classList.toggle("is-down", !!down);
    $("liveText").textContent = state.loading && !state.feed ? "دریافت" : down ? "قطع" : "زنده";
    const banner = $("banner");
    banner.hidden = !state.error;
    banner.textContent = state.error || "";
    $("refreshBtn").disabled = state.loading;
    $("refreshIcon").classList.toggle("is-spin", state.loading);
    $("creditAgo").textContent = state.feed ? " · " + fmtAgo(state.feed.fetchedAt, state.now) : "";
  }

  let lastDetailId = null;

  function renderDetail() {
    const host = $("detailHost");
    const q = state.filtered.find((x) => x.id === state.selectedId) || null;
    $("stage").classList.toggle("has-detail", !!q);
    if (!q) {
      host.innerHTML = "";
      lastDetailId = null;
      return;
    }
    if (lastDetailId === q.id) {
      const w = host.querySelector(".js-when");
      if (w) w.textContent = fmtWhen(q.time) + " · " + fmtAgo(q.time, state.now);
      return;
    }
    lastDetailId = q.id;
    const fa = placeFa(q.place);
    const metaBits = [];
    if (q.magType) metaBits.push("<span>" + esc(q.magType) + "</span>");
    if (statusFa(q.status)) metaBits.push("<span>" + statusFa(q.status) + "</span>");
    if (alertFa(q.alert)) metaBits.push("<span>هشدار " + esc(alertFa(q.alert)) + "</span>");

    host.innerHTML =
      '<article class="detail">' +
      '<div class="detail-top">' +
      '<span class="mag mag-lg tone-' + magTone(q.mag) + '">' + fmtMag(q.mag) + "</span>" +
      '<div class="detail-title"><h2>' + esc(fa) + "</h2>" +
      (fa !== q.place ? '<p lang="en" dir="ltr">' + esc(q.place) + "</p>" : "") +
      '<p class="q-meta">' + metaBits.join("") + "</p></div>" +
      '<button type="button" class="icon-btn" id="detailClose" aria-label="بستن">' + ICON_X + "</button>" +
      "</div>" +
      '<dl class="facts">' +
      '<div><dt>زمان</dt><dd class="js-when">' + fmtWhen(q.time) + " · " + fmtAgo(q.time, state.now) + "</dd></div>" +
      "<div><dt>عمق</dt><dd>" + (q.depth == null ? "نامشخص" : fmtInt(q.depth) + " کیلومتر") + "</dd></div>" +
      '<div><dt>مختصات</dt><dd dir="ltr">' + fmtCoord(q.lat, q.lon) + "</dd></div>" +
      (q.felt != null ? "<div><dt>احساس‌شده</dt><dd>" + fmtInt(q.felt) + " نفر</dd></div>" : "") +
      "</dl>" +
      (q.tsunami ? '<p class="tsunami">پرچم سونامی در گزارش USGS روشن است.</p>' : "") +
      '<div class="detail-actions">' +
      '<a class="btn btn-primary" href="' + esc(q.url) + '" target="_blank" rel="noreferrer">' + ICON_LINK + "جزئیات USGS</a>" +
      '<button type="button" class="btn" id="copyBtn">' + ICON_COPY + "<span>مختصات</span></button>" +
      "</div></article>";

    $("detailClose").addEventListener("click", () => select(null));
    $("copyBtn").addEventListener("click", async (e) => {
      const label = e.currentTarget.querySelector("span");
      try {
        await navigator.clipboard.writeText(q.lat.toFixed(4) + ", " + q.lon.toFixed(4));
        label.textContent = "کپی شد";
        setTimeout(() => { label.textContent = "مختصات"; }, 1400);
      } catch (err) {
        toast("کپی مختصات ممکن نشد");
      }
    });
  }

  let toastTimer = 0;
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  /* ------------------------------------------------------------
     ۹) فیلتر، مرتب‌سازی و به‌روزرسانی کلی
  ------------------------------------------------------------ */
  function computeFilters() {
    const t = Date.now();
    const windowMs = TIME_MS[state.timeRange];
    const q = normFa(state.searchQ);
    state.filtered = state.quakes.filter((item) => {
      if (item.mag < state.minMagQ) return false;
      if (t - item.time > windowMs) return false;
      if (!depthOk(item.depth, state.depth)) return false;
      if (!inRegion(item, state.region)) return false;
      if (q && !normFa(item.place + " " + placeFa(item.place)).includes(q)) return false;
      return true;
    });
    const rows = state.filtered.slice();
    rows.sort((a, b) => {
      if (state.sort === "mag") return b.mag - a.mag || b.time - a.time;
      if (state.sort === "depth") return (b.depth == null ? -1 : b.depth) - (a.depth == null ? -1 : a.depth);
      return b.time - a.time;
    });
    state.sorted = rows;
  }

  let lastListKey = "";

  function refresh(opts) {
    opts = opts || {};
    computeFilters();
    if (state.selectedId && !state.filtered.some((q) => q.id === state.selectedId)) {
      state.selectedId = null;
    }
    syncControls();
    renderStatus();
    renderStats();
    renderNotable();
    renderChart(state.filtered);

    if (state.loading && !state.feed) {
      list.skeleton();
    } else {
      list.done();
      const key = [state.region, state.timeRange, state.minMagQ, state.depth, state.searchQ, state.sort].join("|");
      list.setRows(state.sorted, key !== lastListKey);
      lastListKey = key;
    }

    mapView.setQuakes(state.filtered);
    renderDetail();
    if (opts.fit) mapView.fit();
  }

  function select(id, scrollList) {
    state.selectedId = id;
    list.markSelected();
    renderDetail();
    mapView.reveal(id);
    if (id && scrollList) requestAnimationFrame(() => list.scrollToId(id));
  }

  /* ------------------------------------------------------------
     ۱۰) دریافت داده
  ------------------------------------------------------------ */
  function setFeed(feed) {
    state.feed = feed;
    state.quakes = feed.quakes;
  }

  let firstFit = true;

  async function loadFeed() {
    state.loading = true;
    renderStatus();
    try {
      const res = await fetch(USGS_URL, { headers: { accept: "application/geo+json, application/json" } });
      if (!res.ok) throw new Error(String(res.status));
      const raw = await res.json();
      const quakes = [];
      for (const f of raw.features || []) {
        const q = normalizeFeature(f);
        if (q) quakes.push(q);
      }
      quakes.sort((a, b) => b.time - a.time);
      const feed = { fetchedAt: Date.now(), count: quakes.length, quakes };
      setFeed(feed);
      state.error = null;
      const json = JSON.stringify(feed);
      if (json.length < 4500000) store(CACHE_KEY, json);
    } catch (e) {
      state.error = state.feed ? "به‌روزرسانی ناموفق بود." : "اتصال به USGS برقرار نشد.";
    } finally {
      state.loading = false;
      state.now = Date.now();
      refresh({ fit: firstFit && !!state.feed });
      if (state.feed) firstFit = false;
    }
  }

  /* ------------------------------------------------------------
     ۱۱) رویدادها و راه‌اندازی
  ------------------------------------------------------------ */
  function applyMag(v) {
    state.minMag = round1(v);
    state.minMagQ = state.minMag;
    refresh();
  }

  function setTheme(next) {
    state.theme = next;
    document.documentElement.dataset.theme = next;
    store("rasad-theme", next);
    $("themeBtn").innerHTML = next === "dark" ? ICON_SUN : ICON_MOON;
    document.querySelector('meta[name="theme-color"]').setAttribute("content", next === "dark" ? "#101114" : "#f3f2ee");
  }

  function wire() {
    buildSeg($("segRegion"), UI.regions, (id) => {
      state.region = id;
      store("rasad-region", id);
      refresh({ fit: true });
    });
    buildSeg($("segTime"), UI.times, (id) => { state.timeRange = id; refresh(); });
    buildSeg($("segMag"), UI.mags, (id) => applyMag(Number(id)));
    buildSeg($("segDepth"), UI.depths, (id) => { state.depth = id; refresh(); });
    buildSeg($("segSort"), UI.sorts, (id) => { state.sort = id; refresh(); });
    buildSeg($("segBase"), UI.bases, (id) => {
      state.basemap = id;
      store("rasad-basemap", id);
      syncSeg($("segBase"), id);
      mapView.setBasemap(id);
    });

    // اسلایدر دقیق (با debounce)
    let magTimer = 0;
    $("magRange").addEventListener("input", (e) => {
      state.minMag = round1(Number(e.target.value));
      $("magValue").textContent = fmtMag(state.minMag);
      syncSeg($("segMag"), String(state.minMag));
      clearTimeout(magTimer);
      magTimer = setTimeout(() => {
        state.minMagQ = state.minMag;
        refresh();
      }, 140);
    });

    // جستجو (با debounce)
    let searchTimer = 0;
    $("searchInput").addEventListener("input", (e) => {
      state.search = e.target.value;
      $("searchClear").hidden = state.search === "";
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.searchQ = state.search.trim();
        refresh();
      }, 180);
    });
    $("searchClear").addEventListener("click", () => {
      $("searchInput").value = "";
      state.search = "";
      state.searchQ = "";
      refresh();
    });

    $("moreBtn").addEventListener("click", () => {
      const open = $("advanced").classList.toggle("open");
      $("moreBtn").setAttribute("aria-expanded", String(open));
      $("moreBtn").textContent = open ? "بستن تنظیم دقیق" : "تنظیم دقیق‌تر";
    });

    $("resetBtn").addEventListener("click", () => {
      state.minMag = state.minMagQ = DEFAULTS.minMag;
      state.timeRange = DEFAULTS.timeRange;
      state.depth = DEFAULTS.depth;
      state.region = DEFAULTS.region;
      state.search = state.searchQ = "";
      $("searchInput").value = "";
      store("rasad-region", DEFAULTS.region);
      refresh({ fit: true });
    });

    $("refreshBtn").addEventListener("click", loadFeed);

    $("themeBtn").addEventListener("click", () => {
      const next = state.theme === "dark" ? "light" : "dark";
      setTheme(next);
      if (state.basemap !== "sat") {
        state.basemap = next === "dark" ? "night" : "paper";
        store("rasad-basemap", state.basemap);
        syncSeg($("segBase"), state.basemap);
        mapView.setBasemap(state.basemap);
      }
    });

    $("statCount").addEventListener("click", () => mapView.fit());
    $("statStrong").addEventListener("click", () => state.strongestId && select(state.strongestId, true));
    $("statNew").addEventListener("click", () => state.newestId && select(state.newestId, true));
    $("fitBtn").addEventListener("click", () => mapView.fit());

    $("notableHost").addEventListener("click", (e) => {
      if (!e.target.closest("#notableBtn")) return;
      const q = state.quakes.find((x) => x.id === state.notableId);
      if (!q) return;
      state.timeRange = Date.now() - q.time > TIME_MS.week ? "month" : "week";
      state.minMag = state.minMagQ = 0;
      state.depth = "all";
      state.search = state.searchQ = "";
      $("searchInput").value = "";
      if (!inRegion(q, state.region)) {
        state.region = "world";
        store("rasad-region", "world");
      }
      refresh();
      select(q.id, true);
    });

    $("locateBtn").addEventListener("click", () => {
      if (!navigator.geolocation) return toast("موقعیت‌یابی در دسترس نیست");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          mapView.showMe(pos.coords.latitude, pos.coords.longitude);
          mapView.flyTo(pos.coords.latitude, pos.coords.longitude, 7);
        },
        () => toast("دسترسی به موقعیت داده نشد"),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
      );
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && state.selectedId) select(null);
    });
  }

  // ساعت درونی: متن «چند دقیقه پیش» و پنجرهٔ زمانی را تازه نگه می‌دارد
  function tick() {
    state.now = Date.now();
    const before = state.filtered;
    computeFilters();
    const after = state.filtered;
    const same =
      before.length === after.length &&
      (before.length === 0 || (before[0].id === after[0].id && before[before.length - 1].id === after[after.length - 1].id));
    if (!same) {
      refresh();
    } else {
      renderStats();
      renderStatus();
      list.updateTimes();
      renderDetail();
    }
  }

  function boot() {
    wire();
    $("themeBtn").innerHTML = state.theme === "dark" ? ICON_SUN : ICON_MOON;
    syncControls();
    mapView.init();

    // نمایش فوری آخرین دادهٔ ذخیره‌شده (تا دادهٔ تازه برسد)
    const cached = load(CACHE_KEY);
    if (cached) {
      try {
        const feed = JSON.parse(cached);
        if (feed && Array.isArray(feed.quakes) && typeof feed.fetchedAt === "number") {
          setFeed(feed);
          refresh({ fit: true });
          firstFit = false;
        }
      } catch (e) { /* کش خراب است؛ نادیده گرفته می‌شود */ }
    }
    if (!state.feed) refresh();

    loadFeed();
    setInterval(tick, CLOCK_MS);
    setInterval(loadFeed, REFRESH_MS);
  }

  boot();
})();
