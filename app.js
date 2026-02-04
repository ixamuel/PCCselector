/* global INDUCTOR_DATA */

const data = Array.isArray(window.INDUCTOR_DATA) ? window.INDUCTOR_DATA : [];

data.forEach((row, index) => {
  row.__index = index;
});

const numericFilters = [
  { key: "Lo (uH)", label: "Inductance (uH)", histogram: true, scale: "log" },
  { key: "Lo Tol. (%)", label: "Tolerance (%)" },
  { key: "DCR Typ (mOhm)", label: "DCR Typ (mΩ)", scale: "log" },
  { key: "DCR Max (mOhm)", label: "DCR Max (mΩ)", scale: "log" },
  { key: "Method B (A typ at 40℃)", label: "Method B (A)", histogram: true, scale: "log" },
  { key: "Method A (A typ at 40℃)", label: "Method A (A)", histogram: true, scale: "log" },
  { key: "⊿L=-30% typ (A)", label: "ΔL -30% (A)" },
  { key: "⊿L=-20% typ (A)", label: "ΔL -20% (A)" },
  { key: "Ir (A)", label: "Ir (A)" },
  { key: "Max Voltage (V)", label: "Max Voltage (V)" },
  { key: "L (mm)", label: "Length (mm)" },
  { key: "W (mm)", label: "Width (mm)" },
  { key: "Max Height (mm)", label: "Max Height (mm)" },
  { key: "__temp_range__", label: "Temp Range (°C)", tempRange: true }
];

const categoricalFilters = [
  { key: "Feature", label: "Feature", twoColumn: true },
  { key: "Series", label: "Series" },
  { key: "Series (Size)", label: "Series (Size)" },
  { key: "Rough Size (mm)", label: "Rough Size" },
  { key: "Core", label: "Core" },
  { key: "Automotive Grade", label: "Automotive Grade" },
  { key: "Status", label: "Status" }
];

const filterGroups = [
  {
    title: "Electrical",
    items: [
      "Lo (uH)",
      "Lo Tol. (%)",
      { combo: true, key: "__dcr__", label: "DCR (mΩ)", items: ["DCR Typ (mOhm)", "DCR Max (mOhm)"] },
      "Method B (A typ at 40℃)",
      "Method A (A typ at 40℃)",
      "⊿L=-30% typ (A)",
      "⊿L=-20% typ (A)",
      "Ir (A)",
      "Max Voltage (V)",
      "__temp_range__"
    ]
  },
  {
    title: "Mechanical",
    items: [
      { combo: true, key: "__lxw__", label: "Length × Width (mm)", items: ["L (mm)", "W (mm)"] },
      "Rough Size (mm)",
      "Max Height (mm)"
    ]
  },
  {
    title: "Family & Grade",
    items: ["Feature", "Series", "Series (Size)", "Core", "Automotive Grade", "Status"]
  }
];

const resultColumns = [
  { key: "__select__", label: "", sub: "", type: "select", sortable: false },
  { key: "Part Number", label: "PN", sub: "", type: "pn" },
  { key: "Lo (uH)", label: "L", sub: "uH", type: "number" },
  { key: "Lo Tol. (%)", label: "Tol", sub: "%", type: "number" },
  {
    key: "Method B (A typ at 40℃)",
    label: "I (⊿T=40C)",
    sub: "Method B A",
    type: "number",
    className: "col-tight"
  },
  {
    key: "Method A (A typ at 40℃)",
    label: "I (⊿T=40C)",
    sub: "Method A A",
    type: "number",
    className: "col-tight"
  },
  { key: "⊿L=-30% typ (A)", label: "Isat ΔL -30%", sub: "A", type: "number" },
  { key: "⊿L=-20% typ (A)", label: "Isat ΔL -20%", sub: "A", type: "number" },
  { key: "DCR Typ (mOhm)", label: "DCR", sub: "Typ mΩ", type: "number" },
  { key: "DCR Max (mOhm)", label: "DCR", sub: "Max mΩ", type: "number" },
  { key: "Size (mm)", label: "Size", sub: "mm", type: "size" },
  { key: "Max Height (mm)", label: "Max H", sub: "mm", type: "number" },
  { key: "Temp Range (deg.C)", label: "Temp Range", sub: "°C", type: "text" },
  { key: "Automotive Grade", label: "Auto", sub: "Grade", type: "text" },
  { key: "Feature", label: "Feature", sub: "", type: "text" },
  { key: "Series", label: "Series", sub: "", type: "text" },
  { key: "Status", label: "Status", sub: "", type: "text" }
];

const state = {
  search: "",
  numeric: {},
  categorical: {},
  numericTargets: {},
  selected: [],
  compareOnly: false,
  sortKey: null,
  sortDirection: null,
  baseSidebarHeight: null
};

const numericMeta = {};
const categoricalOptions = {};
const dataByPn = new Map();

const elements = {
  filters: document.getElementById("filters"),
  resultsCount: document.getElementById("resultsCount"),
  resultsBody: document.querySelector("#resultsTable tbody"),
  emptyState: document.getElementById("emptyState"),
  resultsSection: document.querySelector(".results"),
  searchInput: document.getElementById("searchInput"),
  clearButton: document.getElementById("clearButton"),
  activeFilters: document.getElementById("activeFilters"),
  headerRow: document.getElementById("resultsHeaderRow"),
  sidebar: document.querySelector(".sidebar"),
  topbarContent: document.querySelector(".topbar-content"),
  topbar: document.querySelector(".topbar"),
  layout: document.querySelector(".layout"),
  sidebarToggle: document.getElementById("sidebarToggle"),
  selectionPanel: document.getElementById("selectionPanel"),
  selectionTags: document.getElementById("selectionTags"),
  compareButton: document.getElementById("compareButton"),
  exportButton: document.getElementById("exportButton"),
  mouserButton: document.getElementById("mouserButton"),
  octopartButton: document.getElementById("octopartButton"),
  clearSelectedButton: document.getElementById("clearSelectedButton"),
  clearFiltersButton: document.getElementById("clearFiltersButton"),
  sidebarClose: document.getElementById("sidebarClose"),
  sidebarBackdrop: document.getElementById("sidebarBackdrop")
};

function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "");
  const number = parseFloat(cleaned);
  return Number.isFinite(number) ? number : null;
}

function formatNumber(value) {
  if (value === null || value === undefined) return "—";
  const num = toNumber(value);
  if (num === null) return String(value);
  const rounded = Math.round(num * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function displayCategoryValue(value) {
  if (value === null || value === undefined) return "—";
  const text = String(value);
  return text.replace(/^_+/, "").trim();
}

function formatSizeValue(value) {
  if (value === null || value === undefined) return "—";
  const text = String(value).trim();
  if (!text) return "—";
  if (text.includes("x") || text.includes("×")) {
    return text.replace(/\./g, ",");
  }
  const num = toNumber(text);
  if (num === null) return text;
  return formatNumber(num);
}

function prepareData() {
  numericFilters.forEach((filter) => {
    numericMeta[filter.key] = { min: null, max: null, step: 0.01, values: [], baseMin: null, baseMax: null };
  });

  data.forEach((row) => {
    row.__num = {};
    numericFilters.forEach((filter) => {
      if (filter.tempRange) return;
      const value = toNumber(row[filter.key]);
      row.__num[filter.key] = value;
      if (value !== null) {
        const meta = numericMeta[filter.key];
        meta.min = meta.min === null ? value : Math.min(meta.min, value);
        meta.max = meta.max === null ? value : Math.max(meta.max, value);
        if (filter.key === "Lo (uH)") {
          meta.values.push(value);
        }
      }
    });

    row.__tempMin = toNumber(row["Min Temp (deg.C)"]);
    row.__tempMax = toNumber(row["Max Temp (deg.C)"]);
    if (row.__tempMin !== null) {
      const meta = numericMeta["__temp_range__"];
      meta.min = meta.min === null ? row.__tempMin : Math.min(meta.min, row.__tempMin);
    }
    if (row.__tempMax !== null) {
      const meta = numericMeta["__temp_range__"];
      meta.max = meta.max === null ? row.__tempMax : Math.max(meta.max, row.__tempMax);
    }

    const parts = [row["Part Number"], row["Series"], row["Feature"], row["Series (Size)"]]
      .filter(Boolean)
      .join(" ");
    row.__search = parts.toLowerCase();
    if (row["Part Number"]) {
      dataByPn.set(String(row["Part Number"]), row);
    }
  });

  numericFilters.forEach((filter) => {
    const meta = numericMeta[filter.key];
    if (!meta || meta.min === null || meta.max === null) return;
    const range = meta.max - meta.min;
    if (range >= 100) meta.step = 1;
    else if (range >= 10) meta.step = 0.1;
    else meta.step = 0.01;
    if (filter.key === "Lo (uH)") {
      meta.values = Array.from(new Set(meta.values)).sort((a, b) => a - b);
    }
    meta.baseMin = meta.min;
    meta.baseMax = meta.max;
  });

  categoricalFilters.forEach((filter) => {
    const set = new Set();
    data.forEach((row) => {
      const value = row[filter.key];
      if (value !== null && value !== undefined && String(value).trim() !== "") {
        set.add(String(value));
      }
    });
    const list = Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );
    categoricalOptions[filter.key] = list;
  });
}

function initState() {
  numericFilters.forEach((filter) => {
    state.numeric[filter.key] = { min: null, max: null };
    state.numericTargets[filter.key] = null;
  });
  categoricalFilters.forEach((filter) => {
    state.categorical[filter.key] = new Set();
  });
  if (state.categorical.Status) {
    state.categorical.Status.add("MP");
  }
  if (state.categorical["Automotive Grade"]) {
    state.categorical["Automotive Grade"].add("Yes");
  }
  if (state.categorical["Automotive Grade"]) {
    state.categorical["Automotive Grade"].add("Yes");
  }
}

function renderFilters() {
  elements.filters.innerHTML = "";
  const numericMap = new Map(numericFilters.map((f) => [f.key, f]));
  const categoricalMap = new Map(categoricalFilters.map((f) => [f.key, f]));

  filterGroups.forEach((group, groupIndex) => {
    const groupEl = document.createElement("div");
    groupEl.className = "filter-group";
    const title = document.createElement("div");
    title.className = "group-title";
    title.textContent = group.title;
    groupEl.appendChild(title);

    group.items.forEach((key) => {
      if (typeof key === "object" && key.combo) {
        const openByDefault = false;
        groupEl.appendChild(renderComboFilter(key, numericMap, openByDefault));
        return;
      }

      if (numericMap.has(key)) {
        const filter = numericMap.get(key);
        const meta = numericMeta[filter.key];
        if (!meta || meta.min === null || meta.max === null) return;
        const openByDefault = [
          "Lo (uH)",
          "Method B (A typ at 40℃)",
          "Method A (A typ at 40℃)",
          "__temp_range__",
          "Max Height (mm)"
        ].includes(key);
        groupEl.appendChild(renderNumericFilter(filter, meta, openByDefault));
      } else if (categoricalMap.has(key)) {
        const filter = categoricalMap.get(key);
        const options = categoricalOptions[filter.key] || [];
        if (!options.length) return;
        const openByDefault = filter.key === "Status" || filter.key === "Rough Size (mm)" || filter.key === "Feature";
        groupEl.appendChild(renderCategoricalFilter(filter, options, openByDefault));
      }
    });

    elements.filters.appendChild(groupEl);
  });
}

function renderComboFilter(combo, numericMap, openByDefault) {
  const wrapper = document.createElement("details");
  wrapper.className = "filter";
  wrapper.dataset.key = combo.key;
  if (openByDefault) wrapper.open = true;

  const summary = document.createElement("summary");
  summary.innerHTML = `<span>${combo.label}</span><span class=\"accordion-icon\">▾</span>`;
  wrapper.appendChild(summary);

  const body = document.createElement("div");
  body.className = "accordion-body";

  combo.items.forEach((itemKey) => {
    const filter = numericMap.get(itemKey);
    if (!filter) return;
    const meta = numericMeta[filter.key];
    if (!meta || meta.min === null || meta.max === null) return;
    const block = renderNumericBlock(filter, meta);
    body.appendChild(block);
  });

  wrapper.appendChild(body);
  return wrapper;
}

function renderNumericFilter(filter, meta, openByDefault) {
  const wrapper = document.createElement("details");
  wrapper.className = "filter";
  wrapper.dataset.key = filter.key;
  if (openByDefault) wrapper.open = true;

  const summary = document.createElement("summary");
  summary.innerHTML = `<span>${filter.label}</span><span class="accordion-icon">▾</span>`;
  wrapper.appendChild(summary);

  const body = renderNumericBody(filter, meta, false, wrapper);
  wrapper.appendChild(body);
  return wrapper;
}

function updateRangeFill(fill, minRange, maxRange) {
  const min = parseFloat(minRange.min);
  const max = parseFloat(minRange.max);
  const minVal = parseFloat(minRange.value);
  const maxVal = parseFloat(maxRange.value);
  const total = max - min;
  const left = ((minVal - min) / total) * 100;
  const right = ((maxVal - min) / total) * 100;
  fill.style.left = `${left}%`;
  fill.style.width = `${Math.max(right - left, 0)}%`;
}

function shouldUseLogScale(filter, meta) {
  return filter.scale === "log" && meta.min !== null && meta.max !== null && meta.min > 0 && meta.max > 0;
}

function ratioForValue(value, meta) {
  if (!meta || meta.min === null || meta.max === null) return 0;
  const min = Math.log10(meta.min);
  const max = Math.log10(meta.max);
  if (max === min) return 0;
  const v = Math.log10(Math.max(value, meta.min));
  return Math.min(1, Math.max(0, (v - min) / (max - min)));
}

function ratioToValue(ratio, meta) {
  if (!meta || meta.min === null || meta.max === null) return meta.min;
  const min = Math.log10(meta.min);
  const max = Math.log10(meta.max);
  const value = Math.pow(10, min + ratio * (max - min));
  return Math.round(value * 1000) / 1000;
}

function findNearestRange(values, target) {
  if (!values || values.length === 0) return [target, target];
  let lower = null;
  let upper = null;
  for (const v of values) {
    if (v <= target) lower = v;
    if (v >= target) {
      upper = v;
      break;
    }
  }
  if (lower === null) lower = values[0];
  if (upper === null) upper = values[values.length - 1];
  return [lower, upper];
}

function renderNumericBlock(filter, meta) {
  const block = document.createElement("div");
  block.className = "combo-block";
  const title = document.createElement("div");
  title.className = "combo-title";
  title.textContent = filter.label;
  block.appendChild(title);
  const body = renderNumericBody(filter, meta, true, block);
  block.appendChild(body);
  return block;
}

function renderNumericBody(filter, meta, compact = false, rootEl = null) {
  const body = document.createElement("div");
  body.className = compact ? "combo-body" : "accordion-body";

  if (filter.histogram && !compact) {
    const hist = document.createElement("div");
    hist.className = "histogram";
    hist.dataset.key = filter.key;
    for (let i = 0; i < 24; i += 1) {
      const bar = document.createElement("div");
      bar.className = "hist-bar";
      bar.style.height = "10%";
      hist.appendChild(bar);
    }
    body.appendChild(hist);
  }

  const inputs = document.createElement("div");
  inputs.className = "range-inputs";

  const minInput = document.createElement("input");
  minInput.type = "number";
  minInput.value = meta.min;
  minInput.min = meta.min;
  minInput.max = meta.max;
  minInput.step = meta.step;
  minInput.dataset.role = "min";

  const maxInput = document.createElement("input");
  maxInput.type = "number";
  maxInput.value = meta.max;
  maxInput.min = meta.min;
  maxInput.max = meta.max;
  maxInput.step = meta.step;
  maxInput.dataset.role = "max";

  if (filter.key === "Lo (uH)") {
    minInput.value = "";
    maxInput.value = "";
    minInput.placeholder = formatNumber(meta.min);
    maxInput.placeholder = formatNumber(meta.max);
  }
  if (filter.key === "__temp_range__") {
    minInput.value = "";
    maxInput.value = "";
    minInput.placeholder = formatNumber(meta.min);
    maxInput.placeholder = formatNumber(meta.max);
  }

  inputs.appendChild(minInput);
  inputs.appendChild(maxInput);
  body.appendChild(inputs);

  const dual = document.createElement("div");
  dual.className = "dual-range";
  const track = document.createElement("div");
  track.className = "range-track";
  const fill = document.createElement("div");
  fill.className = "range-fill";

  const minRange = document.createElement("input");
  minRange.type = "range";
  minRange.className = "range-input";
  minRange.dataset.role = "min";

  const maxRange = document.createElement("input");
  maxRange.type = "range";
  maxRange.className = "range-input";
  maxRange.dataset.role = "max";

  const logScale = shouldUseLogScale(filter, meta);
  if (logScale) {
    minRange.min = 0;
    minRange.max = 1000;
    minRange.step = 1;
    maxRange.min = 0;
    maxRange.max = 1000;
    maxRange.step = 1;
    minRange.value = ratioForValue(meta.min, meta) * 1000;
    maxRange.value = ratioForValue(meta.max, meta) * 1000;
  } else {
    minRange.min = meta.min;
    minRange.max = meta.max;
    minRange.step = meta.step;
    maxRange.min = meta.min;
    maxRange.max = meta.max;
    maxRange.step = meta.step;
    minRange.value = meta.min;
    maxRange.value = meta.max;
  }

  dual.appendChild(track);
  dual.appendChild(fill);
  dual.appendChild(minRange);
  dual.appendChild(maxRange);
  body.appendChild(dual);

  const hint = document.createElement("div");
  hint.className = "range-hint";
  hint.innerHTML = `<span>${meta.min}</span><span>${meta.max}</span>`;
  body.appendChild(hint);

  const sync = () => {
    const rawMin = minInput.value.trim();
    const rawMax = maxInput.value.trim();
    let minVal = parseFloat(rawMin);
    let maxVal = parseFloat(rawMax);

    if (filter.key === "Lo (uH)") {
      if (rawMin && !rawMax) {
        maxVal = minVal;
      } else if (!rawMin && rawMax) {
        minVal = maxVal;
      }
    }
    minVal = Number.isFinite(minVal) ? minVal : meta.min;
    maxVal = Number.isFinite(maxVal) ? maxVal : meta.max;
    if (minVal > maxVal) {
      const tmp = minVal;
      minVal = maxVal;
      maxVal = tmp;
    }
    minVal = Math.max(meta.min, Math.min(minVal, meta.max));
    maxVal = Math.max(meta.min, Math.min(maxVal, meta.max));

    minInput.value = minVal;
    maxInput.value = maxVal;

    if (logScale) {
      minRange.value = ratioForValue(minVal, meta) * 1000;
      maxRange.value = ratioForValue(maxVal, meta) * 1000;
    } else {
      minRange.value = minVal;
      maxRange.value = maxVal;
    }

    updateRangeFill(fill, minRange, maxRange);

    if (filter.key === "Lo (uH)" && minVal === maxVal) {
      const rangeMin = Math.max(meta.min, minVal * 0.9);
      const rangeMax = Math.min(meta.max, minVal * 1.1);
      state.numericTargets[filter.key] = { target: minVal, rangeMin, rangeMax };
      state.numeric[filter.key].min = rangeMin;
      state.numeric[filter.key].max = rangeMax;
    } else {
      state.numericTargets[filter.key] = null;
      state.numeric[filter.key].min = minVal > meta.min ? minVal : null;
      state.numeric[filter.key].max = maxVal < meta.max ? maxVal : null;
    }
    if (filter.key === "__temp_range__") {
      const muted = !rawMin && !rawMax;
      if (rootEl) {
        rootEl.classList.toggle("temp-muted", muted);
      }
    }
    applyFilters();
  };

  [minInput, maxInput].forEach((input) => {
    input.addEventListener("change", sync);
  });

  [minRange, maxRange].forEach((range) => {
    range.addEventListener("input", () => {
      if (logScale) {
        const minRatio = parseFloat(minRange.value) / 1000;
        const maxRatio = parseFloat(maxRange.value) / 1000;
        minInput.value = ratioToValue(minRatio, meta);
        maxInput.value = ratioToValue(maxRatio, meta);
      } else if (range.dataset.role === "min") {
        minInput.value = range.value;
      } else {
        maxInput.value = range.value;
      }
      sync();
    });
  });

  updateRangeFill(fill, minRange, maxRange);
  if (filter.key === "__temp_range__" && rootEl) {
    rootEl.classList.add("temp-muted");
  }

  return body;
}

function renderCategoricalFilter(filter, options, openByDefault) {
  const wrapper = document.createElement("details");
  wrapper.className = "filter";
  wrapper.dataset.key = filter.key;
  if (openByDefault) wrapper.open = true;

  const summary = document.createElement("summary");
  summary.innerHTML = `<span>${filter.label}</span><span class="accordion-icon">▾</span>`;
  wrapper.appendChild(summary);

  const body = document.createElement("div");
  body.className = "accordion-body";

  const tags = document.createElement("div");
  tags.className = "filter-tags";
  if (filter.twoColumn) tags.classList.add("two-col");

  options.forEach((value) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "filter-tag";
    btn.dataset.value = value;
    btn.innerHTML = `<span>${displayCategoryValue(value)}</span><span class="tag-count">0</span>`;
    btn.addEventListener("click", () => toggleCategorical(filter.key, value));
    tags.appendChild(btn);
  });

  body.appendChild(tags);
  wrapper.appendChild(body);
  return wrapper;
}

function toggleCategorical(key, value) {
  const set = state.categorical[key];
  if (set.has(value)) {
    set.delete(value);
  } else {
    set.add(value);
  }
  applyFilters();
}

function passesNumeric(row, filter) {
  const meta = state.numeric[filter.key];
  if (!meta) return true;
  if (meta.min === null && meta.max === null) return true;

  if (filter.tempRange) {
    const rowMin = row.__tempMin;
    const rowMax = row.__tempMax;
    if (meta.min !== null && (rowMin === null || rowMin > meta.min)) return false;
    if (meta.max !== null && (rowMax === null || rowMax < meta.max)) return false;
    return true;
  }

  const value = row.__num[filter.key];
  if (meta.min !== null && (value === null || value < meta.min)) return false;
  if (meta.max !== null && (value === null || value > meta.max)) return false;
  return true;
}

function passesCategorical(row, filterKey, excludeKey) {
  if (filterKey === excludeKey) return true;
  const set = state.categorical[filterKey];
  if (!set || set.size === 0) return true;
  const value = row[filterKey];
  if (value === null || value === undefined) return false;
  return set.has(String(value));
}

function passesAll(row, excludeCategoryKey = null, excludeNumericKey = null) {
  if (state.search) {
    if (!row.__search.includes(state.search)) return false;
  }

  for (const filter of numericFilters) {
    if (excludeNumericKey && filter.key === excludeNumericKey) continue;
    if (!passesNumeric(row, filter)) return false;
  }

  for (const filter of categoricalFilters) {
    if (!passesCategorical(row, filter.key, excludeCategoryKey)) return false;
  }

  return true;
}

function computeCounts(filterKey) {
  const counts = new Map();
  const options = categoricalOptions[filterKey] || [];
  options.forEach((value) => counts.set(value, 0));

  data.forEach((row) => {
    if (!passesAll(row, filterKey, null)) return;
    const value = row[filterKey];
    if (value === null || value === undefined) return;
    const key = String(value);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return counts;
}

function computeHistogram(filterKey, bins = 24) {
  const meta = numericMeta[filterKey];
  if (!meta || meta.min === null || meta.max === null) return new Array(bins).fill(0);
  const counts = new Array(bins).fill(0);
  const filter = numericFilters.find((item) => item.key === filterKey);
  const logScale = filter ? shouldUseLogScale(filter, meta) : false;
  const min = meta.min;
  const max = meta.max;
  const range = logScale ? Math.log10(max) - Math.log10(min) : max - min;
  if (range <= 0) return counts;

  data.forEach((row) => {
    if (!passesAll(row, null, filterKey)) return;
    const value = row.__num[filterKey];
    if (value === null) return;
    if (logScale && value <= 0) return;
    const ratio = logScale
      ? (Math.log10(value) - Math.log10(min)) / range
      : (value - min) / range;
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(ratio * bins)));
    counts[idx] += 1;
  });

  return counts;
}

function updateHistograms() {
  numericFilters.forEach((filter) => {
    if (!filter.histogram) return;
    const hist = document.querySelector(`.histogram[data-key="${CSS.escape(filter.key)}"]`);
    if (!hist) return;
    const counts = computeHistogram(filter.key, 24);
    const max = Math.max(1, ...counts);
    const bars = hist.querySelectorAll(".hist-bar");
    const meta = numericMeta[filter.key];
    const logScale = shouldUseLogScale(filter, meta);
    const stateRange = state.numeric[filter.key] || {};
    const selMin = stateRange.min !== null && stateRange.min !== undefined ? stateRange.min : meta.min;
    const selMax = stateRange.max !== null && stateRange.max !== undefined ? stateRange.max : meta.max;
    const min = meta.min;
    const maxValue = meta.max;
    const range = logScale ? Math.log10(maxValue) - Math.log10(min) : maxValue - min;
    bars.forEach((bar, index) => {
      const height = (counts[index] / max) * 100;
      bar.style.height = `${Math.max(height, 6)}%`;
      let binStart = min;
      let binEnd = min;
      if (range > 0) {
        if (logScale) {
          const startRatio = index / bars.length;
          const endRatio = (index + 1) / bars.length;
          binStart = Math.pow(10, Math.log10(min) + startRatio * range);
          binEnd = Math.pow(10, Math.log10(min) + endRatio * range);
        } else {
          const binSize = range / bars.length;
          binStart = min + index * binSize;
          binEnd = min + (index + 1) * binSize;
        }
      }
      const outOfSpec = binEnd < selMin || binStart > selMax;
      bar.classList.toggle("is-out", outOfSpec);
    });
  });
}

function updateDynamicNumericFilter(filterKey) {
  const meta = numericMeta[filterKey];
  if (!meta) return;
  const filterEl = document.querySelector(`details.filter[data-key="${CSS.escape(filterKey)}"]`);
  if (!filterEl) return;

  let min = null;
  let max = null;
  data.forEach((row) => {
    if (!passesAll(row, null, filterKey)) return;
    const value = row.__num[filterKey];
    if (value === null || value === undefined) return;
    min = min === null ? value : Math.min(min, value);
    max = max === null ? value : Math.max(max, value);
  });

  if (min === null || max === null) return;

  const minInput = filterEl.querySelector('input[type="number"][data-role="min"]');
  const maxInput = filterEl.querySelector('input[type="number"][data-role="max"]');
  const minRange = filterEl.querySelector('input[type="range"][data-role="min"]');
  const maxRange = filterEl.querySelector('input[type="range"][data-role="max"]');
  const hint = filterEl.querySelector(".range-hint");

  if (!minInput || !maxInput || !minRange || !maxRange) return;

  minInput.min = min;
  minInput.max = max;
  maxInput.min = min;
  maxInput.max = max;

  minRange.min = min;
  minRange.max = max;
  maxRange.min = min;
  maxRange.max = max;

  let currentMin = state.numeric[filterKey].min ?? min;
  let currentMax = state.numeric[filterKey].max ?? max;
  if (currentMin < min) currentMin = min;
  if (currentMax > max) currentMax = max;
  if (currentMin > currentMax) currentMin = currentMax;

  minInput.value = currentMin;
  maxInput.value = currentMax;
  minRange.value = currentMin;
  maxRange.value = currentMax;

  state.numeric[filterKey].min = currentMin > min ? currentMin : null;
  state.numeric[filterKey].max = currentMax < max ? currentMax : null;

  if (hint) {
    const spans = hint.querySelectorAll("span");
    if (spans[0]) spans[0].textContent = min;
    if (spans[1]) spans[1].textContent = max;
  }

  const fill = filterEl.querySelector(".range-fill");
  if (fill) {
    updateRangeFill(fill, minRange, maxRange);
  }
}

function updateCategoricalUI() {
  categoricalFilters.forEach((filter) => {
    const counts = computeCounts(filter.key);
    const filterEl = document.querySelector(`details.filter[data-key="${CSS.escape(filter.key)}"]`);
    if (!filterEl) return;
    const buttons = filterEl.querySelectorAll(".filter-tag");

    buttons.forEach((btn) => {
      const value = btn.dataset.value;
      const count = counts.get(value) || 0;
      const active = state.categorical[filter.key].has(value);

      btn.classList.toggle("is-active", active);
      btn.querySelector(".tag-count").textContent = count;
      if (count === 0 && !active) {
        btn.classList.add("is-disabled");
        btn.disabled = true;
      } else {
        btn.classList.remove("is-disabled");
        btn.disabled = false;
      }
    });
  });
}

function updateActiveFilters() {
  const chips = [];

  numericFilters.forEach((filter) => {
    const meta = state.numeric[filter.key];
    if (!meta) return;
    const target = state.numericTargets[filter.key];
    if (target && typeof target === "object") {
      chips.push({
        label: `${filter.label}: ≈ ${formatNumber(target.target)} (range ${formatNumber(
          target.rangeMin
        )}–${formatNumber(target.rangeMax)})`,
        key: filter.key,
        type: "numeric"
      });
      return;
    }
    if (meta.min !== null || meta.max !== null) {
      const min = meta.min !== null ? meta.min : numericMeta[filter.key].min;
      const max = meta.max !== null ? meta.max : numericMeta[filter.key].max;
      chips.push({ label: `${filter.label}: ${min}–${max}`, key: filter.key, type: "numeric" });
    }
  });

  categoricalFilters.forEach((filter) => {
    const set = state.categorical[filter.key];
    if (!set || set.size === 0) return;
    set.forEach((value) => {
      chips.push({
        label: `${filter.label}: ${displayCategoryValue(value)}`,
        key: filter.key,
        value,
        type: "categorical"
      });
    });
  });

  elements.activeFilters.innerHTML = "";
  chips.forEach((chip) => {
    const el = document.createElement("div");
    el.className = "active-chip";
    const text = document.createElement("span");
    text.textContent = chip.label;
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.addEventListener("click", () => {
      if (chip.type === "numeric") {
        state.numeric[chip.key].min = null;
        state.numeric[chip.key].max = null;
        resetNumericInputs(chip.key);
      } else {
        state.categorical[chip.key].delete(chip.value);
      }
      applyFilters();
    });
    el.appendChild(text);
    el.appendChild(close);
    elements.activeFilters.appendChild(el);
  });
}

function resetNumericInputs(key) {
  const meta = numericMeta[key];
  const filterEl = document.querySelector(`details.filter[data-key="${CSS.escape(key)}"]`);
  if (!filterEl || !meta) return;
  const filter = numericFilters.find((item) => item.key === key);
  const useLog = filter ? shouldUseLogScale(filter, meta) : false;
  const inputs = filterEl.querySelectorAll("input");
  inputs.forEach((input) => {
    if (key === "Lo (uH)" && input.type !== "range") {
      input.value = "";
      return;
    }
    if (key === "__temp_range__" && input.type !== "range") {
      input.value = "";
      return;
    }
    if (input.type === "range" && useLog) {
      if (input.dataset.role === "min") input.value = ratioForValue(meta.min, meta) * 1000;
      if (input.dataset.role === "max") input.value = ratioForValue(meta.max, meta) * 1000;
      return;
    }
    if (input.dataset.role === "min") input.value = meta.min;
    if (input.dataset.role === "max") input.value = meta.max;
  });
  const fill = filterEl.querySelector(".range-fill");
  const ranges = filterEl.querySelectorAll("input[type='range']");
  if (fill && ranges.length === 2) {
    updateRangeFill(fill, ranges[0], ranges[1]);
  }
  state.numericTargets[key] = null;
  if (key === "__temp_range__") {
    filterEl.classList.add("temp-muted");
  }
}

function renderHeader() {
  elements.headerRow.innerHTML = "";
  resultColumns.forEach((column) => {
    const th = document.createElement("th");
    th.dataset.key = column.key;
    if (column.sortable === false) {
      th.classList.add("is-static");
    }
    if (column.className) {
      th.classList.add(column.className);
    }
    const top = document.createElement("div");
    top.className = "th-top";
    const label = document.createElement("span");
    label.textContent = column.label;
    const indicator = document.createElement("span");
    indicator.className = "sort-indicator";
    indicator.textContent = "";
    top.appendChild(label);
    top.appendChild(indicator);
    th.appendChild(top);
    const sub = document.createElement("div");
    sub.className = "th-sub";
    sub.textContent = column.sub || "";
    th.appendChild(sub);
    if (column.sortable !== false) {
      th.addEventListener("click", () => cycleSort(column.key));
    }
    elements.headerRow.appendChild(th);
  });
}

function cycleSort(key) {
  if (key === "__select__") return;
  if (state.sortKey !== key) {
    state.sortKey = key;
    state.sortDirection = "desc";
  } else if (state.sortDirection === "desc") {
    state.sortDirection = "asc";
  } else if (state.sortDirection === "asc") {
    state.sortDirection = null;
    state.sortKey = null;
  } else {
    state.sortDirection = "desc";
  }
  updateSortIndicators();
  applyFilters();
}

function updateSortIndicators() {
  document.querySelectorAll("#resultsHeaderRow th").forEach((th) => {
    const indicator = th.querySelector(".sort-indicator");
    const key = th.dataset.key;
    if (!indicator) return;
    if (state.sortKey === key) {
      th.classList.add("is-active");
      if (state.sortDirection === "desc") indicator.textContent = "▼";
      else if (state.sortDirection === "asc") indicator.textContent = "▲";
      else indicator.textContent = "";
    } else {
      th.classList.remove("is-active");
      indicator.textContent = "";
    }
  });
}

function sortResults(rows) {
  if (!state.sortKey || !state.sortDirection) {
    return rows.sort((a, b) => a.__index - b.__index);
  }
  if (state.sortKey === "__select__") {
    return rows.sort((a, b) => a.__index - b.__index);
  }
  const column = resultColumns.find((col) => col.key === state.sortKey);
  if (!column) return rows;

  return rows.sort((a, b) => {
    let valA = a[state.sortKey];
    let valB = b[state.sortKey];
    if (column.type === "number") {
      valA = toNumber(valA);
      valB = toNumber(valB);
      if (valA === null && valB === null) return a.__index - b.__index;
      if (valA === null) return 1;
      if (valB === null) return -1;
      const diff = valA - valB;
      return state.sortDirection === "asc" ? diff : -diff;
    }
    if (column.type === "pn") {
      valA = valA === null || valA === undefined ? "" : String(valA);
      valB = valB === null || valB === undefined ? "" : String(valB);
      const diff = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: "base" });
      return state.sortDirection === "asc" ? diff : -diff;
    }
    if (column.type === "pn") {
      valA = valA === null || valA === undefined ? "" : String(valA);
      valB = valB === null || valB === undefined ? "" : String(valB);
      const diff = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: "base" });
      return state.sortDirection === "asc" ? diff : -diff;
    }
    valA = valA === null || valA === undefined ? "" : String(valA);
    valB = valB === null || valB === undefined ? "" : String(valB);
    const diff = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: "base" });
    return state.sortDirection === "asc" ? diff : -diff;
  });
}

function renderResults(rows) {
  elements.resultsBody.innerHTML = "";
  const targetInfo = state.numericTargets["Lo (uH)"];
  let minAbsDelta = null;
  let maxAbsDelta = null;
  if (targetInfo && typeof targetInfo === "object") {
    rows.forEach((row) => {
      const value = toNumber(row["Lo (uH)"]);
      if (value === null) return;
      const abs = Math.abs(value - targetInfo.target);
      if (minAbsDelta === null || abs < minAbsDelta) minAbsDelta = abs;
      if (maxAbsDelta === null || abs > maxAbsDelta) maxAbsDelta = abs;
    });
  }

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    if (String(row["Status"] || "").toUpperCase() === "NRND") {
      tr.classList.add("row-nrnd");
    }
    resultColumns.forEach((column) => {
      const td = document.createElement("td");
      if (column.className) {
        td.classList.add(column.className);
      }
      if (column.type === "select") {
        td.className = "select-cell";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        const pn = row["Part Number"];
        checkbox.checked = state.selected.includes(String(pn));
        checkbox.addEventListener("change", () => {
          toggleSelection(String(pn), checkbox.checked);
        });
        td.appendChild(checkbox);
        tr.appendChild(td);
        return;
      }
      if (column.type === "pn") {
        const pn = row["Part Number"];
        const link = document.createElement("a");
        link.className = "pn-link";
        link.href = `https://octopart.com/de/search?q=${encodeURIComponent(pn)}`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = pn || "—";
        td.appendChild(link);
        tr.appendChild(td);
        return;
      }
      if (column.key === "Lo (uH)" && targetInfo && typeof targetInfo === "object") {
        const value = toNumber(row[column.key]);
        const target = targetInfo.target;
        const delta = value === null ? null : value - target;
        const abs = delta === null ? null : Math.abs(delta);
        const isSingleDigitTarget = target !== null && target < 10;
        const isExactMatch = abs !== null && abs === 0;
        const deltaText =
          delta === null
            ? "—"
            : `${delta >= 0 ? "+" : ""}${formatNumber(delta)}`;
        let deltaClass = "delta-tag";
        if (abs !== null && maxAbsDelta !== null && maxAbsDelta > 0) {
          const ratio = abs / maxAbsDelta;
          if (ratio <= 0.33) deltaClass += " delta-tag--near";
          else if (ratio <= 0.66) deltaClass += " delta-tag--mid";
          else deltaClass += " delta-tag--far";
        }
        if (abs !== null && minAbsDelta !== null && Math.abs(abs - minAbsDelta) < 1e-9) {
          deltaClass += " delta-tag--best";
        }
        if (isSingleDigitTarget && isExactMatch) {
          td.innerHTML = `<span class="value-main">${formatNumber(value)}</span>`;
        } else {
          td.innerHTML = `<span class="value-main">${formatNumber(value)}</span><span class="${deltaClass}">${deltaText}</span>`;
        }
      } else if (column.type === "number") {
        td.textContent = formatNumber(row[column.key]);
      } else if (column.type === "size") {
        td.textContent = formatSizeValue(row[column.key]);
      } else if (column.key === "Status") {
        const status = row[column.key] ? String(row[column.key]) : "—";
        const tag = document.createElement("span");
        tag.className = "status-tag";
        const upper = status.toUpperCase();
        if (upper === "MP") tag.classList.add("status-mp");
        if (upper === "NRND") tag.classList.add("status-nrnd");
        tag.textContent = status;
        td.appendChild(tag);
      } else {
        td.textContent = displayCategoryValue(row[column.key]);
      }
      tr.appendChild(td);
    });
    elements.resultsBody.appendChild(tr);
  });

  elements.resultsCount.textContent = `${rows.length} result${rows.length === 1 ? "" : "s"}`;
  elements.emptyState.classList.toggle("hidden", rows.length !== 0);
}

function applyFilters() {
  updateDynamicNumericFilter("Max Height (mm)");
  let filtered = data.filter((row) => passesAll(row));
  if (state.compareOnly && state.selected.length > 0) {
    const selectedSet = new Set(state.selected);
    filtered = filtered.filter((row) => selectedSet.has(String(row["Part Number"])));
  }
  const sorted = sortResults(filtered.slice());
  renderResults(sorted);
  updateCategoricalUI();
  updateActiveFilters();
  updateHistograms();
  syncSidebarHeight();
  updateSelectionPanel();
}

function clearAll() {
  state.search = "";
  elements.searchInput.value = "";

  numericFilters.forEach((filter) => {
    state.numeric[filter.key].min = null;
    state.numeric[filter.key].max = null;
    resetNumericInputs(filter.key);
  });

  categoricalFilters.forEach((filter) => {
    state.categorical[filter.key].clear();
  });
  if (state.categorical.Status) {
    state.categorical.Status.add("MP");
  }

  state.selected = [];
  state.compareOnly = false;

  state.sortKey = null;
  state.sortDirection = null;
  updateSortIndicators();

  applyFilters();
}

function bindEvents() {
  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    applyFilters();
  });

  elements.clearButton.addEventListener("click", clearAll);

  if (elements.sidebarToggle) {
    elements.sidebarToggle.addEventListener("click", () => {
      document.body.classList.toggle("sidebar-hidden");
      syncSidebarHeight();
    });
  }

  if (elements.sidebarClose) {
    elements.sidebarClose.addEventListener("click", () => {
      document.body.classList.add("sidebar-hidden");
      syncSidebarHeight();
    });
  }

  if (elements.sidebarBackdrop) {
    elements.sidebarBackdrop.addEventListener("click", () => {
      document.body.classList.add("sidebar-hidden");
      syncSidebarHeight();
    });
  }

  if (elements.clearFiltersButton) {
    elements.clearFiltersButton.addEventListener("click", () => {
      clearFiltersOnly();
    });
  }

  if (elements.compareButton) {
    elements.compareButton.addEventListener("click", () => {
      state.compareOnly = !state.compareOnly;
      elements.compareButton.textContent = state.compareOnly ? "Show All" : "Compare PN";
      applyFilters();
    });
  }

  if (elements.clearSelectedButton) {
    elements.clearSelectedButton.addEventListener("click", () => {
      state.selected = [];
      state.compareOnly = false;
      applyFilters();
    });
  }

  if (elements.exportButton) {
    elements.exportButton.addEventListener("click", () => {
      openExportTable();
    });
  }

  if (elements.mouserButton) {
    elements.mouserButton.addEventListener("click", () => {
      openEachLink("https://www.mouser.de/c/?q=", "m=Panasonic");
    });
  }

  if (elements.octopartButton) {
    elements.octopartButton.addEventListener("click", () => {
      openEachLink("https://octopart.com/de/search?q=");
    });
  }

  window.addEventListener("resize", () => {
    syncSidebarHeight();
  });
}

function clearFiltersOnly() {
  state.search = "";
  elements.searchInput.value = "";

  numericFilters.forEach((filter) => {
    state.numeric[filter.key].min = null;
    state.numeric[filter.key].max = null;
    resetNumericInputs(filter.key);
  });

  categoricalFilters.forEach((filter) => {
    state.categorical[filter.key].clear();
  });
  if (state.categorical.Status) {
    state.categorical.Status.add("MP");
  }
  if (state.categorical["Automotive Grade"]) {
    state.categorical["Automotive Grade"].add("Yes");
  }

  applyFilters();
}

function toggleSelection(pn, isSelected) {
  const current = state.selected.slice();
  const index = current.indexOf(pn);
  if (isSelected && index === -1) {
    current.push(pn);
  } else if (!isSelected && index !== -1) {
    current.splice(index, 1);
  }
  state.selected = current;
  applyFilters();
}

function updateSelectionPanel() {
  if (!elements.selectionTags || !elements.selectionPanel) return;
  elements.selectionTags.innerHTML = "";
  state.selected.forEach((pn) => {
    const tag = document.createElement("div");
    tag.className = "selection-tag";
    const text = document.createElement("span");
    text.textContent = pn;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.addEventListener("click", () => toggleSelection(pn, false));
    tag.appendChild(text);
    tag.appendChild(remove);
    elements.selectionTags.appendChild(tag);
  });

  const disabled = state.selected.length === 0;
  elements.selectionPanel.style.display = disabled ? "none" : "grid";
  elements.selectionTags.style.display = disabled ? "none" : "flex";
  if (elements.compareButton) {
    elements.compareButton.disabled = disabled;
    if (disabled) {
      elements.compareButton.textContent = "Compare PN";
      state.compareOnly = false;
    }
  }
  if (elements.clearSelectedButton) elements.clearSelectedButton.disabled = disabled;
  if (elements.exportButton) elements.exportButton.disabled = disabled;
  if (elements.mouserButton) elements.mouserButton.disabled = disabled;
  if (elements.octopartButton) elements.octopartButton.disabled = disabled;
}

function openEachLink(baseUrl, extraParams = "") {
  if (state.selected.length === 0) return;
  state.selected.forEach((pn) => {
    const query = encodeURIComponent(pn);
    const url = extraParams ? `${baseUrl}${query}&${extraParams}` : `${baseUrl}${query}`;
    window.open(url, "_blank");
  });
}

function openExportTable() {
  if (state.selected.length === 0) return;
  const rows = state.selected
    .map((pn) => dataByPn.get(pn))
    .filter(Boolean);
  const exportColumns = resultColumns.filter((col) => col.type !== "select");
  const header = exportColumns.map((col) => `${col.label}${col.sub ? " " + col.sub : ""}`);
  const bodyRows = rows.map((row) =>
    exportColumns.map((col) => {
      if (col.type === "pn") return row["Part Number"] || "";
      if (col.type === "number") return formatNumber(row[col.key]);
      if (col.type === "size") return formatSizeValue(row[col.key]);
      return displayCategoryValue(row[col.key]);
    })
  );
  const tsv = [header.join("\t"), ...bodyRows.map((r) => r.join("\t"))].join("\n");

  const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Selected Inductors</title>
<style>
body{font-family:Arial,sans-serif;padding:24px;background:#f6f7f9;color:#111}
button{padding:8px 12px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer;margin-bottom:12px}
table{border-collapse:collapse;width:100%;font-size:13px;background:#fff}
th,td{border:1px solid #ddd;padding:8px;text-align:left}
th{background:#f0f2f4}
</style>
</head><body>
<button id="copyBtn">Copy to Clipboard</button>
<table><thead><tr>${header.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
<tbody>${bodyRows
      .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
      .join("")}</tbody></table>
<script>
const tsv = ${JSON.stringify(tsv)};
const btn = document.getElementById('copyBtn');
btn.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(tsv); btn.textContent = 'Copied'; }
  catch (e) { btn.textContent = 'Copy failed'; }
});
</script>
</body></html>`;
  const win = window.open("", "_blank");
  if (win) {
    win.document.open();
    win.document.write(html);
    win.document.close();
  }
}

function syncSidebarHeight() {
  if (!elements.sidebar || !elements.topbarContent || !elements.resultsSection) return;
  if (document.body.classList.contains("sidebar-hidden")) {
    elements.sidebar.style.height = "";
    elements.sidebar.style.marginTop = "";
    return;
  }
  const topbarRect = elements.topbarContent.getBoundingClientRect();
  const resultsRect = elements.resultsSection.getBoundingClientRect();
  const gap = Math.max(resultsRect.top - topbarRect.bottom, 0);
  const totalHeight = topbarRect.height + gap + resultsRect.height;
  if (state.baseSidebarHeight === null || totalHeight > state.baseSidebarHeight) {
    state.baseSidebarHeight = totalHeight;
  }
  const targetHeight = Math.max(totalHeight, state.baseSidebarHeight, 240);
  elements.sidebar.style.height = `${targetHeight}px`;
  elements.sidebar.style.marginTop = `-${topbarRect.height + gap}px`;
}

prepareData();
initState();
renderFilters();
renderHeader();
updateSortIndicators();
bindEvents();
applyFilters();
syncSidebarHeight();
