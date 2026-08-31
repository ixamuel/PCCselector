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
  { key: "Lo (uH)", label: "L", sub: "µH", type: "number" },
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
  copyPnsButton: document.getElementById("copyPnsButton"),
  exportButton: document.getElementById("exportButton"),
  productsButton: document.getElementById("productsButton"),
  mouserButton: document.getElementById("mouserButton"),
  farnellButton: document.getElementById("farnellButton"),
  octopartButton: document.getElementById("octopartButton"),
  clearSelectedButton: document.getElementById("clearSelectedButton"),
  clearFiltersButton: document.getElementById("clearFiltersButton"),
  sidebarClose: document.getElementById("sidebarClose"),
  sidebarBackdrop: document.getElementById("sidebarBackdrop"),
  sidebarClear: document.getElementById("sidebarClear")
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
  // Remove leading underscores and square symbol (□) from "High Current (≥□12)"
  return text.replace(/^_+/, "").replace(/□/g, "").trim();
}

function formatSizeValue(value) {
  if (value === null || value === undefined) return "—";
  const text = String(value).trim();
  if (!text) return "—";
  if (text.includes("x") || text.includes("×")) {
    return text.replace(/,/g, ".");
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
    const pn = String(row["Part Number"]);
    if (state.selected.includes(pn)) {
      tr.classList.add("results-row--selected");
    }
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
        const container = document.createElement("div");
        container.className = "pn-container";

        const link = document.createElement("a");
        link.className = "pn-link";
        link.href = `https://octopart.com/de/search?q=${encodeURIComponent(pn)}`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = pn || "—";

        const copyBtn = document.createElement("button");
        copyBtn.className = "copy-btn";
        copyBtn.type = "button";
        copyBtn.title = "Copy Part Number";
        copyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;

        copyBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          navigator.clipboard.writeText(pn).then(() => {
            copyBtn.classList.add("copied");
            const originalIcon = copyBtn.innerHTML;
            copyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            setTimeout(() => {
              copyBtn.classList.remove("copied");
              copyBtn.innerHTML = originalIcon;
            }, 2000);
          });
        });

        container.appendChild(link);
        container.appendChild(copyBtn);
        td.appendChild(container);
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
        // Convert tolerance from decimal (0.2) to percentage (20%)
        if (column.key === "Lo Tol. (%)") {
          const val = toNumber(row[column.key]);
          td.textContent = val !== null ? String(Math.round(val * 100)) : "—";
        } else {
          td.textContent = formatNumber(row[column.key]);
        }
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

  elements.resultsCount.innerHTML = `<span class="count-num">${rows.length}</span><span class="count-label">Matches</span>`;
  elements.emptyState.classList.toggle("hidden", rows.length !== 0);
}

function applyFilters() {
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
  if (state.categorical["Automotive Grade"]) {
    state.categorical["Automotive Grade"].add("Yes");
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

  if (elements.sidebarClear) {
    elements.sidebarClear.addEventListener("click", () => {
      clearFiltersOnly();
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

  if (elements.copyPnsButton) {
    elements.copyPnsButton.addEventListener("click", () => {
      copySelectedPartNumbers();
    });
  }

  if (elements.exportButton) {
    elements.exportButton.addEventListener("click", () => {
      openExportTable();
    });
  }

  if (elements.productsButton) {
    elements.productsButton.addEventListener("click", () => {
      openProducts();
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

  if (elements.farnellButton) {
    elements.farnellButton.addEventListener("click", () => {
      openEachLink("https://de.farnell.com/search?st=");
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
  elements.selectionPanel.style.display = disabled ? "none" : "";
  // Removed elements.selectionTags.style.display override to allow CSS Grid on mobile
  // and ensured tag creation uses .selection-tag
  if (elements.compareButton) {
    elements.compareButton.disabled = disabled;
    if (disabled) {
      elements.compareButton.textContent = "Compare PN";
      state.compareOnly = false;
    }
  }
  if (elements.clearSelectedButton) elements.clearSelectedButton.disabled = disabled;
  if (elements.copyPnsButton) elements.copyPnsButton.disabled = disabled;
  if (elements.exportButton) elements.exportButton.disabled = disabled;
  if (elements.productsButton) elements.productsButton.disabled = disabled;
  if (elements.mouserButton) elements.mouserButton.disabled = disabled;
  if (elements.octopartButton) elements.octopartButton.disabled = disabled;
  if (elements.farnellButton) elements.farnellButton.disabled = disabled;
}

function openProducts() {
  if (state.selected.length === 0) return;
  state.selected.forEach((pn) => {
    const row = dataByPn.get(pn);
    if (row && row.URL) {
      window.open(row.URL, "_blank");
    }
  });
}

function openEachLink(baseUrl, extraParams = "") {
  if (state.selected.length === 0) return;
  state.selected.forEach((pn) => {
    const query = encodeURIComponent(pn);
    const url = extraParams ? `${baseUrl}${query}&${extraParams}` : `${baseUrl}${query}`;
    window.open(url, "_blank");
  });
}

function copySelectedPartNumbers() {
  if (state.selected.length === 0) return;
  const pns = state.selected.join("\n");
  navigator.clipboard.writeText(pns).then(() => {
    // Provide brief visual feedback on the button
    if (elements.copyPnsButton) {
      const originalText = elements.copyPnsButton.textContent;
      elements.copyPnsButton.textContent = "Copied!";
      elements.copyPnsButton.classList.add("copied");
      setTimeout(() => {
        elements.copyPnsButton.textContent = originalText;
        elements.copyPnsButton.classList.remove("copied");
      }, 2000);
    }
  });
}

// Helper functions for summary table formatting
function formatTemperature(tempRange) {
  if (!tempRange) return "";
  // Convert "to" to "~", remove + signs, and ensure °C is present
  let formatted = tempRange
    .replace(/\s*to\s*/g, "~")
    .replace(/deg\.C/g, "°C")
    .replace(/\+/g, "")  // Remove any + signs
    .trim();

  // Ensure °C is at the end if not already present
  if (!formatted.includes("°C")) {
    formatted += "°C";
  }

  return formatted;
}

function formatDimensions(L, W, H) {
  if (!L || !W || !H) return "";
  // Use period for decimal (not comma)
  const lengthFormatted = String(L);
  const widthFormatted = String(W);
  const heightFormatted = String(H);
  return `${lengthFormatted} x ${widthFormatted} x ${heightFormatted}mm`;
}

function formatSummaryDesc(row, options = {}) {
  if (!row) return "";

  // Default options: showBasicInfo = false (hide PCC, SMD, ±20%, AECQ-200)
  const showBasicInfo = options.showBasicInfo !== undefined ? options.showBasicInfo : false;

  const parts = [];

  // Category (PCC) - hide if showBasicInfo is false
  if (showBasicInfo && row.Category) parts.push(row.Category);

  // Type (SMD) - hide if showBasicInfo is false
  if (showBasicInfo && row.Type) parts.push(row.Type);

  // Inductance (0.33µH) with tolerance directly after
  if (row["Lo (uH)"]) {
    const inductance = formatNumber(row["Lo (uH)"]);
    parts.push(`${inductance}µH`);

    // Tolerance (±20%) - multiply by 100 - hide if showBasicInfo is false
    if (showBasicInfo && row["Lo Tol. (%)"]) {
      const tolValue = toNumber(row["Lo Tol. (%)"]);
      if (tolValue !== null) {
        const tolPercent = tolValue * 100;
        parts.push(`±${formatNumber(tolPercent)}%`);
      }
    }
  }

  // Irms (Method B current)
  if (row["Method B (A typ at 40℃)"]) {
    const irms = formatNumber(row["Method B (A typ at 40℃)"]);
    parts.push(`Irms ${irms}A`);
  }

  // Isat (ΔL -30%)
  if (row["⊿L=-30% typ (A)"]) {
    const isat = formatNumber(row["⊿L=-30% typ (A)"]);
    parts.push(`Isat ${isat}A`);
  }

  // DCR only (R: 1.1mΩ)
  if (row["DCR Typ (mOhm)"]) {
    const dcr = formatNumber(row["DCR Typ (mOhm)"]);
    parts.push(`DCR: ${dcr}mΩ`);
  }

  // Dimensions (10.9 x 10 x 5mm) - before temperature
  if (row["L (mm)"] && row["W (mm)"] && row["Max Height (mm)"]) {
    const dims = formatDimensions(row["L (mm)"], row["W (mm)"], row["Max Height (mm)"]);
    parts.push(dims);
  }

  // Temperature Range (-40~150°C)
  if (row["Temp Range (deg.C)"]) {
    const temp = formatTemperature(row["Temp Range (deg.C)"]);
    parts.push(temp);
  }

  // Feature (High Isat (Standard))
  if (row.Feature) {
    // Remove square symbol (□) from Feature values
    const cleanedFeature = row.Feature.replace(/□/g, "");
    parts.push(cleanedFeature);
  }

  // Automotive Grade (AECQ-200 if Yes) - last position - hide if showBasicInfo is false
  if (showBasicInfo && row["Automotive Grade"] === "Yes") {
    parts.push("AECQ-200");
  }

  return parts.join(", ");
}

function openExportTable() {
  if (state.selected.length === 0) return;
  const rows = state.selected
    .map((pn) => dataByPn.get(pn))
    .filter(Boolean);
  // Filter out select column and Max Height (merged into Size)
  const exportColumns = resultColumns.filter(
    (col) => col.type !== "select" && col.key !== "Max Height (mm)"
  );
  const header = exportColumns.map((col) => {
    if (col.key === "Automotive Grade") return "AECQ-200";
    if (col.key === "Feature") return "Datasheet";
    const sub = col.sub || "";
    // DCR columns: sub is "Typ mΩ" / "Max mΩ" - bracket only the unit
    if (col.key === "DCR Typ (mOhm)" || col.key === "DCR Max (mOhm)") {
      const parts = sub.split(" ");
      const unit = parts.pop();
      return `${col.label} ${parts.join(" ")} [${unit}]`;
    }
    // Method A column: sub is "Method A A" - keep descriptor outside, bracket only the unit
    if (col.key === "Method A (A typ at 40℃)") {
      const parts = sub.split(" ");
      const unit = parts.pop();
      return `${col.label} ${parts.join(" ")} [${unit}]`;
    }
    return `${col.label}${sub ? " [" + sub + "]" : ""}`;
  });
  const buildExportCells = (row) =>
    exportColumns.map((col) => {
      if (col.type === "pn") return row["Part Number"] || "";
      if (col.type === "number") {
        // Convert tolerance from decimal (0.2) to percentage (20%)
        if (col.key === "Lo Tol. (%)") {
          const val = toNumber(row[col.key]);
          return val !== null ? String(Math.round(val * 100)) : "—";
        }
        return formatNumber(row[col.key]);
      }
      if (col.type === "size") {
        // Integrate Max Height into Size: "L x W x Max H"
        const L = row["L (mm)"] ? String(row["L (mm)"]) : "";
        const W = row["W (mm)"] ? String(row["W (mm)"]) : "";
        const H = row["Max Height (mm)"] ? String(row["Max Height (mm)"]) : "";
        if (L && W && H) return `${L} x ${W} x ${H}`;
        return formatSizeValue(row[col.key]);
      }
      if (col.key === "Feature") {
        const url = row.URL;
        const text = displayCategoryValue(row[col.key]);
        if (url) return `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
        return text;
      }
      return displayCategoryValue(row[col.key]);
  });
  const bodyRows = rows.map(buildExportCells);
  const partNumberCatalog = data
    .map((row) => ({ pn: String(row["Part Number"] || ""), cells: buildExportCells(row) }))
    .filter((row) => row.pn)
    .sort((a, b) => a.pn.localeCompare(b.pn));
  // Escape angle brackets so an unusual data value cannot end the generated
  // export-window script early.
  const partNumberCatalogJson = JSON.stringify(partNumberCatalog).replace(/</g, "\\u003c");
  // Generate summary data for each selected row - two versions
  const summaryRowsBasicHidden = rows.map((row) => ({
    pn: row["Part Number"] || "",
    desc: formatSummaryDesc(row, { showBasicInfo: false }), // default: hidden
    remarks: "" // empty remarks initially
  }));

  const summaryRowsBasicShown = rows.map((row) => ({
    pn: row["Part Number"] || "",
    desc: formatSummaryDesc(row, { showBasicInfo: true }), // when toggle ON
    remarks: "" // empty remarks initially
  }));

  const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Selected Inductors</title>
<style>
body{font-family:Arial,sans-serif;padding:24px;background:#f6f7f9;color:#111}
button{padding:8px 12px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer;margin-bottom:12px;min-width:100px}
table{border-collapse:collapse;width:100%;font-size:13px;background:#fff}
th,td{border:1px solid #ddd;padding:8px;text-align:left}
th{background:#f0f2f4}
.summary-table { margin-top: 32px; }
.summary-table th { background: #e8f0fb; }
.summary-header { margin-top: 40px; margin-bottom: 12px; font-size: 16px; font-weight: 600; color: #0058a3; }
/* Window controls are deliberately styled independently from the tables below.
   The export tables retain their original presentation for Outlook copying. */
.export-toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
.export-toolbar button { margin-bottom: 0; }
.export-toolbar .copy-action {
  background: rgba(0, 88, 163, 0.12);
  border-color: rgba(0, 88, 163, 0.4);
  color: #0058a3;
}
.export-toolbar .copy-action:hover {
  background: rgba(0, 88, 163, 0.18);
  border-color: #0058a3;
  color: #0058a3;
}
.export-toolbar .toolbar-separator { width: 1px; height: 24px; background: #d7dce2; margin: 0 2px; }
.export-toolbar .toolbar-hint { color: #69727d; font-size: 12px; margin-left: 2px; }
.summary-section { margin: 0 36px 0 30px; }
/* Toggle switch styles */
.toggle-container { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.toggle-label { font-size: 14px; color: #555; }
.toggle-switch { position: relative; display: inline-block; width: 50px; height: 24px; }
.toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; border-radius: 24px; transition: .3s; }
.toggle-slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; border-radius: 50%; transition: .3s; }
.toggle-checkbox:checked + .toggle-slider { background-color: #0058a3; }
.toggle-checkbox:checked + .toggle-slider:before { transform: translateX(26px); }
.toggle-checkbox { display: none; }

/* Remarks editable cell styling */
td.remarks-column[contenteditable="true"] {
  padding: 6px 8px;
  min-height: 32px;
  cursor: text;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
  box-sizing: border-box;
}
td.remarks-column[contenteditable="true"]:focus {
  outline: none;
  border-color: #0058a3;
  box-shadow: 0 0 0 2px rgba(0, 88, 163, 0.1);
  background: #f8fbff;
}
td.remarks-column[contenteditable="true"]:empty:before {
  content: "Enter remarks";
  color: #999;
  font-style: italic;
}

/* Table column widths */
.summary-table th:nth-child(1) { width: 120px; } /* PN */
.summary-table th:nth-child(2) { width: auto; }   /* Description */
.summary-table th:nth-child(3) { width: 200px; }  /* Remarks */

/* Remarks column visibility */
.summary-table.hide-remarks .remarks-column,
.summary-table.hide-remarks th.remarks-column,
.summary-table.hide-remarks td.remarks-column {
  display: none;
}
#mainDataTable.hide-remarks .remarks-column,
#mainDataTable.hide-remarks th.remarks-column,
#mainDataTable.hide-remarks td.remarks-column {
  display: none;
}
/* Extra columns toggle */
.extra-cols-hidden th.extra-col,
.extra-cols-hidden td.extra-col {
  display: none;
}
/* Competitor rows keep the original table borders while using a subtle tint. */
tr.competitor-row td { background: #fffdf5; border-color: #ddd; }
td.competitor-cell[contenteditable="true"] {
  padding: 6px 8px;
  min-height: 32px;
  cursor: text;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
  box-sizing: border-box;
}
td.competitor-cell[contenteditable="true"]:focus {
  outline: none;
  border-color: #0058a3;
  box-shadow: 0 0 0 2px rgba(0, 88, 163, 0.1);
  background: #f8fbff;
}
td.competitor-cell[contenteditable="true"]:empty:before {
  content: attr(data-ph);
  color: #999;
  font-style: italic;
}
/* The control rail is a sibling of the table content.  It never participates
   in a table selection, so manual copy/paste to Outlook remains clean. */
#mainTableWrap {
  position: relative;
  padding: 0 36px 0 30px;
}
.summary-table {
  margin-left: 0;
}
.row-control-rail {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 30px;
  pointer-events: none;
  z-index: 5;
}
.row-remove-rail {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 36px;
  pointer-events: auto;
  z-index: 5;
}
.row-grip {
  position: absolute;
  left: 3px;
  width: 24px;
  height: 28px;
  padding: 0;
  min-width: 0;
  margin: 0;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  cursor: grab;
  pointer-events: auto;
  transition: background 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}
.row-grip::before {
  content: "";
  display: block;
  width: 11px;
  height: 11px;
  margin: auto;
  opacity: 0.6;
  background: repeating-linear-gradient(to bottom, #5d7185 0 1px, transparent 1px 4px);
}
.row-grip:hover {
  background: #edf5fc;
  border-color: #b9d5ed;
  box-shadow: 0 1px 3px rgba(0, 88, 163, 0.12);
}
.row-grip:active { cursor: grabbing; }
.row-grip.dragging {
  background: #dceefa;
  border-color: #8dc0e5;
  box-shadow: 0 2px 8px rgba(0, 88, 163, 0.2);
}
#mainTableBody tr.dragging { opacity: 0.48; }
.drop-indicator {
  position: absolute;
  left: 30px;
  right: 36px;
  height: 2px;
  display: none;
  background: #0058a3;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.92), 0 1px 4px rgba(0,88,163,0.35);
  pointer-events: none;
  z-index: 6;
}
/* Per-row remove action in the external rail (never over Remarks or copied). */
.remove-competitor-btn {
  position: absolute;
  left: 5px;
  width: 24px;
  height: 28px;
  margin: 0;
  padding: 0;
  min-width: 0;
  border: 1px solid transparent;
  border-radius: 7px;
  color: #a33;
  background: transparent;
  box-shadow: none;
  cursor: pointer;
  font-size: 17px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
  transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
}
.remove-competitor-btn:hover {
  background: #fde8e8;
  border-color: #efb6b6;
  color: #8b0000;
  box-shadow: 0 2px 8px rgba(163, 51, 51, 0.3);
}
.part-suggestion-menu {
  position: fixed;
  display: none;
  max-height: 240px;
  overflow-y: auto;
  min-width: 220px;
  padding: 6px;
  background: linear-gradient(180deg, #ffffff, #f8fbfe);
  border: 1px solid #c7dcec;
  border-radius: 10px;
  box-shadow: 0 12px 28px rgba(23, 57, 82, 0.2), 0 2px 6px rgba(23, 57, 82, 0.08);
  z-index: 30;
}
.part-suggestion-title {
  position: sticky;
  top: -6px;
  z-index: 1;
  margin: -6px -6px 0;
  padding: 11px 13px 6px;
  background: #ffffff;
  color: #69727d;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.part-suggestion-option {
  display: block;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #243342;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease;
}
.part-suggestion-option:hover,
.part-suggestion-option.is-active { background: #e8f3fc; color: #0058a3; }
@media (max-width: 700px), (pointer: coarse) {
  body { padding: 14px; }
  .export-toolbar { gap: 6px; }
  .export-toolbar button { min-height: 40px; }
  .export-toolbar .toolbar-hint { width: 100%; margin: 0 0 4px; }
  .toggle-container { align-items: flex-start; }
  #mainTableWrap { padding: 0 42px; }
  .summary-section { margin: 0 42px; }
  .row-control-rail, .row-remove-rail { width: 42px; }
  .row-grip { left: 3px; width: 36px; height: 40px; touch-action: none; }
  .remove-competitor-btn { left: 3px; width: 36px; height: 40px; font-size: 21px; }
  .drop-indicator { left: 42px; right: 42px; }
  .part-suggestion-menu { max-height: 200px; }
}
</style>
</head><body>
<div class="export-toolbar">
<button id="copyPnsBtn" class="copy-action">Copy PNs</button>
<button id="copyTableBtn" class="copy-action">Copy Table</button>
<button id="addCompetitorBtn">Add Competitor</button>
<button id="clearCompetitorsBtn">Clear Competitors</button>
<span class="toolbar-separator" aria-hidden="true"></span>
<span class="toolbar-hint">Use the handle beside a row to reorder it.</span>
</div>
<div class="toggle-container">
  <span class="toggle-label">Show Tol %, I (⊿T=40C) Method A A, Isat ΔL -20% A, DCR Max mΩ</span>
  <label class="toggle-switch">
    <input type="checkbox" class="toggle-checkbox" id="extraColsToggle">
    <span class="toggle-slider"></span>
  </label>
</div>
<div class="toggle-container">
  <span class="toggle-label">Remarks Column</span>
  <label class="toggle-switch">
    <input type="checkbox" class="toggle-checkbox" id="remarksToggle">
    <span class="toggle-slider"></span>
  </label>
</div>
<div id="mainTableWrap"><div id="rowControlRail" class="row-control-rail" aria-label="Row order controls"></div><div id="rowRemoveRail" class="row-remove-rail" aria-label="Row removal controls"></div><div id="dropIndicator" class="drop-indicator" aria-hidden="true"></div><table id="mainDataTable" class="extra-cols-hidden"><thead><tr>${header.map((h, i) => {
  const extraCols = new Set([2, 4, 6, 8]);
  const extraCls = extraCols.has(i) ? 'extra-col' : '';
  // Method B column is at index 3; render with toggleable sub text inline
  if (i === 3) {
    return `<th class="${extraCls} method-b-header">I (⊿T=40C) <span class="method-b-sub">Method B [A]</span></th>`;
  }
  return `<th${extraCls ? ' class="' + extraCls + '"' : ''}>${h}</th>`;
}).join("")}<th class="remarks-column">Remarks</th></tr></thead>
<tbody id="mainTableBody"></tbody></table></div>
<div id="partSuggestionMenu" class="part-suggestion-menu" role="listbox" aria-label="Panasonic part-number suggestions"></div>

<div class="summary-section">
<div class="summary-header">Part Number Summary</div>
<div class="toggle-container">
  <span class="toggle-label">Show PCC, SMD, Tol., Automotive</span>
  <label class="toggle-switch">
    <input type="checkbox" class="toggle-checkbox" id="basicInfoToggle">
    <span class="toggle-slider"></span>
  </label>
</div>
<table class="summary-table">
<thead><tr><th>PN</th><th>Description</th><th class="remarks-column">Remarks</th></tr></thead>
<tbody id="summaryTableBody">${summaryRowsBasicHidden
      .map((r) => `<tr><td>${r.pn}</td><td class="desc-cell">${r.desc}</td><td class="remarks-column" contenteditable="true" data-pn="${r.pn}">${r.remarks}</td></tr>`)
      .join("")}</tbody></table>
</div>

<script>
const exportColumns = ${JSON.stringify(exportColumns)};
const panasonicBodyRows = ${JSON.stringify(bodyRows)};
const partNumberCatalog = ${partNumberCatalogJson};
const extraColSet = new Set([2, 4, 6, 8]);

// Build the ordered row model. Panasonic rows keep their precomputed HTML cells.
const panasonicRows = panasonicBodyRows.map(function (cells, index) {
  return { id: 'panasonic-' + index, type: 'panasonic', pn: cells[0] || '', cells: cells, remarks: '' };
});
let competitorRows = [];
let competitorIdCounter = 0;
let mainRows = panasonicRows.slice();

const mainTableBody = document.getElementById('mainTableBody');
const mainTableWrap = document.getElementById('mainTableWrap');
const rowControlRail = document.getElementById('rowControlRail');
const rowRemoveRail = document.getElementById('rowRemoveRail');
const dropIndicator = document.getElementById('dropIndicator');
const partSuggestionMenu = document.getElementById('partSuggestionMenu');
let suggestionState = null;

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, function (character) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character];
  });
}

function hidePartSuggestions() {
  suggestionState = null;
  partSuggestionMenu.innerHTML = '';
  partSuggestionMenu.style.display = 'none';
}

function findPartMatches(query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return partNumberCatalog.slice(0, 8);
  const startsWith = partNumberCatalog.filter(function (part) {
    return part.pn.toLowerCase().startsWith(normalized);
  });
  const contains = partNumberCatalog.filter(function (part) {
    const pn = part.pn.toLowerCase();
    return !pn.startsWith(normalized) && pn.includes(normalized);
  });
  return startsWith.concat(contains).slice(0, 8);
}

function renderPartSuggestions() {
  if (!suggestionState) return;
  partSuggestionMenu.innerHTML = '<div class="part-suggestion-title">Panasonic part numbers</div>' + suggestionState.matches.map(function (part, index) {
    return '<button type="button" class="part-suggestion-option' + (index === suggestionState.index ? ' is-active' : '') + '" role="option" aria-selected="' + (index === suggestionState.index) + '" data-index="' + index + '">' + escapeHtml(part.pn) + '</button>';
  }).join('');
}

function positionPartSuggestions() {
  if (!suggestionState || !suggestionState.cell || !suggestionState.cell.isConnected) return;
  const rect = suggestionState.cell.getBoundingClientRect();
  partSuggestionMenu.style.left = Math.max(8, rect.left) + 'px';
  partSuggestionMenu.style.top = (rect.bottom + 4) + 'px';
  partSuggestionMenu.style.width = Math.max(220, rect.width) + 'px';
  partSuggestionMenu.style.maxHeight = Math.max(80, Math.min(240, window.innerHeight - rect.bottom - 12)) + 'px';
}

function showPartSuggestions(cell, row) {
  const matches = findPartMatches(cell.textContent);
  if (!matches.length) {
    hidePartSuggestions();
    return;
  }
  suggestionState = { rowId: row.id, cell: cell, matches: matches, index: 0 };
  positionPartSuggestions();
  partSuggestionMenu.style.display = 'block';
  renderPartSuggestions();
}

function selectSuggestedPart(rowId, part) {
  const row = mainRows.find(function (item) { return item.id === rowId; });
  if (!row || row.type !== 'competitor') return;
  row.values = part.cells.slice();
  hidePartSuggestions();
  renderMainTable();
}

function renderMainTable() {
  mainTableBody.innerHTML = mainRows.map(function (row) {
    var cellsHtml;
    if (row.type === 'panasonic') {
      cellsHtml = row.cells.map(function (c, i) {
        return '<td' + (extraColSet.has(i) ? ' class="extra-col"' : '') + '>' + c + '</td>';
      }).join('');
      cellsHtml += '<td class="remarks-column" contenteditable="true" data-pn="' + row.pn + '">' + (row.remarks || '') + '</td>';
      return '<tr data-type="panasonic" data-id="' + row.id + '">' + cellsHtml + '</tr>';
    } else {
      cellsHtml = row.values.map(function (v, i) {
        var ph = i === 0 ? 'Enter competitor PN' : '';
        // Datasheets arrive as an anchor from the selected Panasonic row. Keep
        // that cell out of the contenteditable surface so browsers follow the
        // link on click instead of only placing an edit caret in the cell.
        var isDatasheet = exportColumns[i] && exportColumns[i].key === 'Feature';
        return '<td class="competitor-cell' + (isDatasheet ? ' datasheet-cell' : '') + (extraColSet.has(i) ? ' extra-col' : '') + '" contenteditable="' + (!isDatasheet) + '" data-ph="' + ph + '">' + v + '</td>';
      }).join('');
      cellsHtml += '<td class="remarks-column" contenteditable="true" data-pn="' + row.id + '">' + (row.remarks || '') + '</td>';
      return '<tr class="competitor-row" data-type="competitor" data-id="' + row.id + '">' + cellsHtml + '</tr>';
    }
  }).join('');
  positionRowControls();
}

// Keep edits in the row model immediately.  This prevents typed competitor
// PNs and remarks from being lost when a row is reordered or another row is
// added, while leaving ordinary table selection untouched.
mainTableBody.addEventListener('input', function (e) {
  var cell = e.target.closest('td[contenteditable="true"]');
  if (!cell) return;
  var tr = cell.closest('tr');
  if (!tr) return;
  var row = mainRows.find(function (item) { return item.id === tr.dataset.id; });
  if (!row) return;
  if (cell.classList.contains('remarks-column')) {
    row.remarks = cell.textContent;
    return;
  }
  if (row.type === 'competitor') {
    var cells = Array.from(tr.querySelectorAll('td.competitor-cell'));
    var index = cells.indexOf(cell);
    if (index !== -1) {
      row.values[index] = cell.textContent;
      if (index === 0) showPartSuggestions(cell, row);
    }
  }
});

mainTableBody.addEventListener('focusin', function (e) {
  const cell = e.target.closest('td.competitor-cell[contenteditable="true"]');
  if (!cell) return;
  const tr = cell.closest('tr');
  const row = tr && mainRows.find(function (item) { return item.id === tr.dataset.id; });
  const cells = tr ? Array.from(tr.querySelectorAll('td.competitor-cell')) : [];
  if (row && row.type === 'competitor' && cells.indexOf(cell) === 0) showPartSuggestions(cell, row);
});

mainTableBody.addEventListener('keydown', function (e) {
  if (!suggestionState) return;
  const cell = e.target.closest('td.competitor-cell[contenteditable="true"]');
  const tr = cell && cell.closest('tr');
  if (!cell || !tr || tr.dataset.id !== suggestionState.rowId) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const delta = e.key === 'ArrowDown' ? 1 : -1;
    suggestionState.index = (suggestionState.index + delta + suggestionState.matches.length) % suggestionState.matches.length;
    renderPartSuggestions();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    selectSuggestedPart(suggestionState.rowId, suggestionState.matches[suggestionState.index]);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    hidePartSuggestions();
  }
});

mainTableBody.addEventListener('focusout', function () {
  window.setTimeout(hidePartSuggestions, 150);
});

partSuggestionMenu.addEventListener('mousedown', function (e) {
  e.preventDefault();
  const option = e.target.closest('.part-suggestion-option');
  if (!option || !suggestionState) return;
  const part = suggestionState.matches[Number(option.dataset.index)];
  if (part) selectSuggestedPart(suggestionState.rowId, part);
});

// The export window can scroll after several competitor rows are added.  Keep
// the fixed suggestion surface attached to its live cell in every scrollable
// ancestor, not only the first cell that originally opened it.
window.addEventListener('scroll', positionPartSuggestions, true);
window.addEventListener('resize', positionPartSuggestions);

function getPnsList() {
  return mainRows.map(function (row) {
    if (row.type === 'panasonic') return row.pn;
    var v = (row.values[0] || '').trim();
    return v === 'Enter competitor PN' ? '' : v;
  }).filter(Boolean);
}

function resetCopyBtn(btn, originalText) {
  setTimeout(function () { btn.textContent = originalText; }, 2000);
}

const copyPnsBtn = document.getElementById('copyPnsBtn');
copyPnsBtn.addEventListener('click', async function () {
  const original = copyPnsBtn.textContent;
  try { await navigator.clipboard.writeText(getPnsList().join('\\n')); copyPnsBtn.textContent = 'Copied!'; }
  catch (e) { copyPnsBtn.textContent = 'Copy failed'; }
  resetCopyBtn(copyPnsBtn, original);
});

function buildOutlookTable() {
  const headerRow = mainDataTable.tHead.rows[0];
  const visibleColumns = Array.from(headerRow.cells).map(function (cell, index) {
    return getComputedStyle(cell).display !== 'none' ? index : -1;
  }).filter(function (index) { return index !== -1; });
  const output = document.createElement('table');
  output.style.cssText = 'border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:13px;color:#111;background:#fff;';
  const plainRows = [];

  Array.from(mainDataTable.rows).forEach(function (sourceRow, rowIndex) {
    const outputRow = document.createElement('tr');
    const plainCells = [];
    visibleColumns.forEach(function (columnIndex) {
      const sourceCell = sourceRow.cells[columnIndex];
      if (!sourceCell) return;
      const cell = sourceCell.cloneNode(true);
      cell.removeAttribute('contenteditable');
      cell.querySelectorAll('[contenteditable]').forEach(function (element) { element.removeAttribute('contenteditable'); });
      cell.style.cssText = 'border:1px solid #ddd;padding:8px;text-align:left;vertical-align:top;';
      if (rowIndex === 0) cell.style.background = '#f0f2f4';
      outputRow.appendChild(cell);
      plainCells.push(sourceCell.innerText.trim());
    });
    output.appendChild(outputRow);
    plainRows.push(plainCells.join('\\t'));
  });

  return { html: output.outerHTML, text: plainRows.join('\\n') };
}

function legacyCopyTable(html) {
  const holder = document.createElement('div');
  holder.contentEditable = 'true';
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;opacity:0;pointer-events:none;';
  holder.innerHTML = html;
  document.body.appendChild(holder);
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(holder);
  selection.removeAllRanges();
  selection.addRange(range);
  const copied = document.execCommand && document.execCommand('copy');
  selection.removeAllRanges();
  holder.remove();
  return copied;
}

const copyTableBtn = document.getElementById('copyTableBtn');
copyTableBtn.addEventListener('click', async function () {
  const original = copyTableBtn.textContent;
  const payload = buildOutlookTable();
  try {
    if (navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([payload.html], { type: 'text/html' }),
        'text/plain': new Blob([payload.text], { type: 'text/plain' })
      })]);
    } else if (!legacyCopyTable(payload.html)) {
      throw new Error('Clipboard unavailable');
    }
    copyTableBtn.textContent = 'Table Copied!';
  } catch (e) {
    copyTableBtn.textContent = 'Copy failed';
  }
  resetCopyBtn(copyTableBtn, original);
});

// Add Competitor button
const addCompetitorBtn = document.getElementById('addCompetitorBtn');
addCompetitorBtn.addEventListener('click', function () {
  const id = 'comp-' + (++competitorIdCounter);
  const comp = { type: 'competitor', id: id, values: exportColumns.map(function () { return ''; }), remarks: '' };
  competitorRows.push(comp);
  // First competitor row goes to the top; subsequent rows go to the bottom
  if (competitorRows.length === 1) {
    mainRows.unshift(comp);
  } else {
    mainRows.push(comp);
  }
  renderMainTable();
});

// Clear Competitors button
const clearCompetitorsBtn = document.getElementById('clearCompetitorsBtn');
clearCompetitorsBtn.addEventListener('click', function () {
  if (competitorRows.length === 0) return;
  competitorRows = [];
  mainRows = mainRows.filter(function (r) { return r.type !== 'competitor'; });
  renderMainTable();
});

// A direct listener on the dedicated right rail keeps removal reliable while
// leaving the copied table and its Remarks column untouched.
rowRemoveRail.addEventListener('click', function (e) {
  const btn = e.target.closest('.remove-competitor-btn');
  if (!btn) return;
  const id = btn.dataset.id;
  competitorRows = competitorRows.filter(function (r) { return r.id !== id; });
  mainRows = mainRows.filter(function (r) { return r.id !== id; });
  renderMainTable();
  updateSummaryTable(basicInfoToggle.checked);
});

// Position controls outside the table.  The dedicated rail is intentionally
// not a table column, so it cannot be selected or pasted into Outlook.
function positionRowControls() {
  rowControlRail.innerHTML = '';
  rowRemoveRail.innerHTML = '';
  var rows = mainTableBody.querySelectorAll('tr');
  rows.forEach(function (tr) {
    var top = tr.offsetTop;
    var height = tr.offsetHeight;
    var grip = document.createElement('button');
    grip.type = 'button';
    grip.className = 'row-grip';
    grip.dataset.id = tr.dataset.id;
    grip.title = 'Drag to reorder';
    grip.setAttribute('aria-label', 'Reorder row ' + (Array.from(rows).indexOf(tr) + 1));
    grip.style.top = (top + Math.max(0, (height - 28) / 2)) + 'px';
    rowControlRail.appendChild(grip);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'remove-competitor-btn';
    btn.dataset.id = tr.dataset.id;
    btn.title = 'Remove this row from the export';
    btn.setAttribute('aria-label', 'Remove row ' + (Array.from(rows).indexOf(tr) + 1) + ' from the export');
      btn.textContent = '\u00d7';
    btn.style.top = (top + Math.max(0, (height - 28) / 2)) + 'px';
    rowRemoveRail.appendChild(btn);
  });
}

// Pointer-based sorting is used instead of native HTML drag/drop.  Native
// dragging interferes with text selection; this only begins on the external
// handle and waits for a small movement threshold before changing state.
let activeDrag = null;

function clearActiveDrag() {
  if (!activeDrag) return;
  activeDrag.row.classList.remove('dragging');
  activeDrag.handle.classList.remove('dragging');
  dropIndicator.style.display = 'none';
  activeDrag = null;
}

function getDropTarget(clientY, sourceRow) {
  const candidates = Array.from(mainTableBody.querySelectorAll('tr')).filter(function (tr) {
    return tr !== sourceRow;
  });
  for (const tr of candidates) {
    const rect = tr.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return { tr: tr, before: true };
  }
  const last = candidates[candidates.length - 1];
  return last ? { tr: last, before: false } : null;
}

function showDropIndicator(target) {
  if (!target) {
    dropIndicator.style.display = 'none';
    return;
  }
  const wrapRect = mainTableWrap.getBoundingClientRect();
  const rect = target.tr.getBoundingClientRect();
  dropIndicator.style.top = ((target.before ? rect.top : rect.bottom) - wrapRect.top) + 'px';
  dropIndicator.style.display = 'block';
}

rowControlRail.addEventListener('pointerdown', function (e) {
  const grip = e.target.closest('.row-grip');
  if (!grip) return;
  const tr = mainTableBody.querySelector('tr[data-id="' + grip.dataset.id + '"]');
  if (!tr) return;
  e.preventDefault();
  grip.setPointerCapture(e.pointerId);
  activeDrag = { row: tr, handle: grip, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, started: false, target: null };
});

rowControlRail.addEventListener('pointermove', function (e) {
  if (!activeDrag || e.pointerId !== activeDrag.pointerId) return;
  if (!activeDrag.started) {
    const distance = Math.hypot(e.clientX - activeDrag.startX, e.clientY - activeDrag.startY);
    if (distance < 5) return;
    activeDrag.started = true;
    activeDrag.row.classList.add('dragging');
    activeDrag.handle.classList.add('dragging');
  }
  activeDrag.target = getDropTarget(e.clientY, activeDrag.row);
  showDropIndicator(activeDrag.target);
});

rowControlRail.addEventListener('pointerup', function (e) {
  if (!activeDrag || e.pointerId !== activeDrag.pointerId) return;
  const drag = activeDrag;
  if (drag.started && drag.target) {
    const sourceIndex = mainRows.findIndex(function (row) { return row.id === drag.row.dataset.id; });
    const moved = mainRows.splice(sourceIndex, 1)[0];
    const targetIndex = mainRows.findIndex(function (row) { return row.id === drag.target.tr.dataset.id; });
    mainRows.splice(drag.target.before ? targetIndex : targetIndex + 1, 0, moved);
    clearActiveDrag();
    renderMainTable();
    return;
  }
  clearActiveDrag();
});

rowControlRail.addEventListener('pointercancel', clearActiveDrag);
window.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') clearActiveDrag();
});
window.addEventListener('resize', positionRowControls);

// Initial render
renderMainTable();

// Toggle functionality
const basicInfoToggle = document.getElementById('basicInfoToggle');
const remarksToggle = document.getElementById('remarksToggle');
const summaryTableBody = document.getElementById('summaryTableBody');
const summaryTable = document.querySelector('.summary-table');
const summaryRowsBasicHidden = ${JSON.stringify(summaryRowsBasicHidden)};
const summaryRowsBasicShown = ${JSON.stringify(summaryRowsBasicShown)};

function updateSummaryTable(showBasicInfo) {
  // Collect current remarks before updating
  const remarkCells = document.querySelectorAll('td.remarks-column[contenteditable="true"]');
  const remarksMap = {};
  remarkCells.forEach(cell => {
    remarksMap[cell.dataset.pn] = cell.textContent.trim();
  });
  
  const rows = showBasicInfo ? summaryRowsBasicShown : summaryRowsBasicHidden;
  // Update remarks in rows with saved values
  rows.forEach(r => {
    if (remarksMap[r.pn] !== undefined) {
      r.remarks = remarksMap[r.pn];
    }
  });
  
  summaryTableBody.innerHTML = rows.map(r =>
    '<tr><td>' + r.pn + '</td><td class="desc-cell">' + r.desc + '</td><td class="remarks-column" contenteditable="true" data-pn="' + r.pn + '">' + (r.remarks || '') + '</td></tr>'
  ).join('');
}

function updateRemarksColumnVisibility(showRemarks) {
  mainDataTable.classList.toggle('hide-remarks', !showRemarks);
  summaryTable.classList.toggle('hide-remarks', !showRemarks);
  requestAnimationFrame(positionRowControls);
}

const extraColsToggle = document.getElementById('extraColsToggle');
const mainDataTable = document.getElementById('mainDataTable');

function updateMethodBHeader(showExtra) {
  const subSpan = mainDataTable.querySelector('th.method-b-header .method-b-sub');
  if (!subSpan) return;
  // When extra cols are hidden (toggle OFF), remove "Method B" from the sub text
  // When extra cols are shown (toggle ON), show full "Method B A" to distinguish from Method A
  subSpan.textContent = showExtra ? 'Method B [A]' : '[A]';
}

extraColsToggle.addEventListener('change', (e) => {
  localStorage.setItem('pcc_export_extraCols', e.target.checked);
  if (e.target.checked) {
    mainDataTable.classList.remove('extra-cols-hidden');
  } else {
    mainDataTable.classList.add('extra-cols-hidden');
  }
  updateMethodBHeader(e.target.checked);
  requestAnimationFrame(positionRowControls);
});

basicInfoToggle.addEventListener('change', (e) => {
  localStorage.setItem('pcc_export_basicInfo', e.target.checked);
  updateSummaryTable(e.target.checked);
});

remarksToggle.addEventListener('change', (e) => {
  localStorage.setItem('pcc_export_remarks', e.target.checked);
  updateRemarksColumnVisibility(e.target.checked);
});

// Initialize with localStorage-persisted toggle states
const savedExtraCols = localStorage.getItem('pcc_export_extraCols');
const savedBasicInfo = localStorage.getItem('pcc_export_basicInfo');
const savedRemarks = localStorage.getItem('pcc_export_remarks');

extraColsToggle.checked = savedExtraCols === 'true';
basicInfoToggle.checked = savedBasicInfo === 'true';
remarksToggle.checked = savedRemarks === 'true';

// Apply initial states
if (extraColsToggle.checked) mainDataTable.classList.remove('extra-cols-hidden');
updateSummaryTable(basicInfoToggle.checked);
updateRemarksColumnVisibility(remarksToggle.checked);
updateMethodBHeader(extraColsToggle.checked);
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
  // Manual height/margin synchronization disabled to fix layout jumping.
  // We now rely on CSS: position: sticky; top: 0; height: 100vh;
  return;
}

prepareData();
initState();
renderFilters();
renderHeader();
updateSortIndicators();
bindEvents();
applyFilters();
syncSidebarHeight();
