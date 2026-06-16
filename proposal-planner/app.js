const DEFAULT_NODE_URL = "http://node1.gonka.ai:8000";
const SAMPLE_BLOCK_DISTANCE = 5000;
const TARGET_MIN_SEC = 30 * 60;
const TARGET_MAX_SEC = 60 * 60;
const DISPLAY_EPOCH_COUNT = 5;
const SVG_NS = "http://www.w3.org/2000/svg";

const state = {
  nodeUrl: DEFAULT_NODE_URL,
  tzOffsetMinutes: browserOffsetMinutes(),
  snapshot: null,
  epochs: [],
  startTimeMs: null,
  dragging: false,
};

const $ = (id) => document.getElementById(id);

function browserOffsetMinutes() {
  return -new Date().getTimezoneOffset();
}

function offsetToLabel(minutes) {
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

function parseOffset(value) {
  const match = String(value || "").trim().match(/^UTC([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) throw new Error("Timezone must use UTC+03:00 format");
  const sign = match[1] === "+" ? 1 : -1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] || "0");
  if (hours > 14 || minutes > 59) throw new Error("Timezone offset is out of range");
  return sign * (hours * 60 + minutes);
}

function parseDurationSec(value) {
  const text = String(value || "").trim();
  if (text.endsWith("s")) return Number(text.slice(0, -1));
  return Number(text);
}

function formatDuration(seconds) {
  const sign = seconds < 0 ? "-" : "";
  const abs = Math.abs(Math.round(seconds));
  const days = Math.floor(abs / 86400);
  const hours = Math.floor((abs % 86400) / 3600);
  const minutes = Math.floor((abs % 3600) / 60);
  const chunks = [];
  if (days) chunks.push(`${days}d`);
  if (hours || days) chunks.push(`${hours}h`);
  chunks.push(`${minutes}m`);
  return sign + chunks.join(" ");
}

function formatHeight(value) {
  return Math.round(Number(value)).toLocaleString("en-US");
}

function asDate(value) {
  return new Date(value);
}

function formatLocalTime(ms) {
  const shifted = new Date(ms + state.tzOffsetMinutes * 60000);
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const min = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min} ${offsetToLabel(state.tzOffsetMinutes)}`;
}

function toDatetimeLocal(ms) {
  const shifted = new Date(ms + state.tzOffsetMinutes * 60000);
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-") + "T" + [
    String(shifted.getUTCHours()).padStart(2, "0"),
    String(shifted.getUTCMinutes()).padStart(2, "0"),
  ].join(":");
}

function fromDatetimeLocal(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) throw new Error("Invalid proposal start time");
  const [, year, month, day, hour, minute] = match.map(Number);
  return Date.UTC(year, month - 1, day, hour, minute) - state.tzOffsetMinutes * 60000;
}

function setNotice(kind, message) {
  const node = $("status");
  node.hidden = !message;
  node.className = `notice ${kind || ""}`.trim();
  node.textContent = message || "";
}

function chainUrl(path) {
  return `${state.nodeUrl.replace(/\/+$/, "")}${path}`;
}

async function fetchJson(path) {
  const response = await fetch(chainUrl(path));
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response.json();
}

function getHeader(blockResponse) {
  return blockResponse.block?.header || blockResponse.sdk_block?.header;
}

async function loadChainSnapshot() {
  state.nodeUrl = $("node-url").value.trim() || DEFAULT_NODE_URL;
  const [latestBlock, params, voting] = await Promise.all([
    fetchJson("/chain-api/cosmos/base/tendermint/v1beta1/blocks/latest"),
    fetchJson("/chain-api/productscience/inference/inference/params"),
    fetchJson("/chain-api/cosmos/gov/v1/params/voting"),
  ]);

  const latestHeader = getHeader(latestBlock);
  const latestHeight = Number(latestHeader.height);
  const latestTimeMs = asDate(latestHeader.time).getTime();
  const sampleHeight = Math.max(1, latestHeight - SAMPLE_BLOCK_DISTANCE);
  const sampleBlock = await fetchJson(`/chain-api/cosmos/base/tendermint/v1beta1/blocks/${sampleHeight}`);
  const sampleHeader = getHeader(sampleBlock);
  const sampleTimeMs = asDate(sampleHeader.time).getTime();
  const avgBlockSec = Math.max(0.1, (latestTimeMs - sampleTimeMs) / 1000 / (latestHeight - sampleHeight));
  const epochParams = params.params.epoch_params;
  const votingParams = voting.params || voting.voting_params || {};

  const snapshot = {
    latestHeight,
    latestTimeMs,
    avgBlockSec,
    epochLength: Number(epochParams.epoch_length),
    epochShift: Number(epochParams.epoch_shift),
    votingPeriodSec: parseDurationSec(votingParams.voting_period),
  };
  snapshot.currentEpoch = await resolveCurrentEpoch(snapshot);
  state.snapshot = snapshot;
  state.epochs = buildEpochWindows(snapshot);
  if (!state.startTimeMs) setRecommendedStart();
}

async function resolveCurrentEpoch(snapshot) {
  const candidate = Math.floor((snapshot.latestHeight - snapshot.epochShift) / snapshot.epochLength);
  const checks = [candidate - 2, candidate - 1, candidate, candidate + 1, candidate + 2]
    .filter((epoch) => epoch >= 0);
  const results = await Promise.all(checks.map(async (epoch) => {
    try {
      const data = await fetchJson(`/chain-api/productscience/inference/inference/epoch_group_data/${epoch}`);
      return normalizeEpochFromApi(data.epoch_group_data, snapshot, epoch);
    } catch {
      return null;
    }
  }));
  const matching = results.find((epoch) => epoch && snapshot.latestHeight >= epoch.startHeight && snapshot.latestHeight <= epoch.endHeight);
  if (matching) return matching;
  return {
    epoch: candidate,
    startHeight: snapshot.epochShift + candidate * snapshot.epochLength,
    endHeight: snapshot.epochShift + (candidate + 1) * snapshot.epochLength - 1,
  };
}

function normalizeEpochFromApi(raw, snapshot, fallbackEpoch) {
  if (!raw) return null;
  const epoch = Number(raw.epoch_index ?? fallbackEpoch);
  const startHeight = Number(raw.effective_block_height || raw.poc_start_block_height || (snapshot.epochShift + epoch * snapshot.epochLength));
  const apiEnd = Number(raw.last_block_height || 0);
  const endHeight = apiEnd > 0 ? apiEnd : startHeight + snapshot.epochLength - 1;
  return { epoch, startHeight, endHeight };
}

function heightToTimeMs(height) {
  return state.snapshot.latestTimeMs + (height - state.snapshot.latestHeight) * state.snapshot.avgBlockSec * 1000;
}

function timeToHeight(ms) {
  return state.snapshot.latestHeight + (ms - state.snapshot.latestTimeMs) / 1000 / state.snapshot.avgBlockSec;
}

function buildEpochWindows(snapshot) {
  const current = snapshot.currentEpoch;
  return Array.from({ length: DISPLAY_EPOCH_COUNT }, (_, index) => {
    const startHeight = current.startHeight + index * snapshot.epochLength;
    const endHeight = startHeight + snapshot.epochLength - 1;
    return {
      epoch: current.epoch + index,
      startHeight,
      endHeight,
      startTimeMs: heightToTimeMs(startHeight),
      endTimeMs: heightToTimeMs(endHeight),
    };
  });
}

function getPlan() {
  const startTimeMs = state.startTimeMs;
  const endTimeMs = startTimeMs + state.snapshot.votingPeriodSec * 1000;
  const endHeight = timeToHeight(endTimeMs);
  const targetEpoch = state.epochs.find((epoch) => endTimeMs >= epoch.startTimeMs && endTimeMs <= epoch.endTimeMs) || null;
  const nearestEpoch = targetEpoch || state.epochs.reduce((best, epoch) => {
    const distance = Math.abs(endTimeMs - epoch.endTimeMs);
    return !best || distance < best.distance ? { epoch, distance } : best;
  }, null)?.epoch;
  const deltaToEpochEndSec = nearestEpoch ? (nearestEpoch.endTimeMs - endTimeMs) / 1000 : null;
  let status = "outside";
  if (deltaToEpochEndSec !== null) {
    if (deltaToEpochEndSec >= TARGET_MIN_SEC && deltaToEpochEndSec <= TARGET_MAX_SEC) status = "ok";
    else if (deltaToEpochEndSec > TARGET_MAX_SEC) status = "too_early";
    else status = "too_late";
  }
  return {
    startTimeMs,
    startHeight: timeToHeight(startTimeMs),
    endTimeMs,
    endHeight,
    targetEpoch: nearestEpoch,
    deltaToEpochEndSec,
    status,
  };
}

function setRecommendedStart() {
  const now = state.snapshot.latestTimeMs;
  const viable = state.epochs
    .map((epoch) => epoch.endTimeMs - TARGET_MAX_SEC * 1000 - state.snapshot.votingPeriodSec * 1000)
    .filter((startMs) => startMs >= now);
  state.startTimeMs = viable[0] || now;
}

function render() {
  if (!state.snapshot) return;
  $("timezone-offset").value = offsetToLabel(state.tzOffsetMinutes);
  $("start-time").value = toDatetimeLocal(state.startTimeMs);
  $("start-height").value = formatHeight(timeToHeight(state.startTimeMs));
  renderMetrics();
  renderPlanDetails();
  renderEpochTable();
  renderTimeline();
  renderPlanStatus();
}

function renderMetrics() {
  const s = state.snapshot;
  const metrics = [
    ["Current block", formatHeight(s.latestHeight)],
    ["Current epoch", s.currentEpoch.epoch],
    ["Latest block time", formatLocalTime(s.latestTimeMs)],
    ["Avg block time", `${s.avgBlockSec.toFixed(2)}s`],
    ["Voting period", formatDuration(s.votingPeriodSec)],
  ];
  $("metrics").innerHTML = metrics.map(([label, value]) => (
    `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`
  )).join("");
}

function renderPlanDetails() {
  const plan = getPlan();
  const target = plan.targetEpoch ? `Epoch ${plan.targetEpoch.epoch}` : "Outside displayed epochs";
  const rows = [
    ["Start", formatLocalTime(plan.startTimeMs)],
    ["Start UTC", new Date(plan.startTimeMs).toISOString().slice(0, 16).replace("T", " ")],
    ["End", formatLocalTime(plan.endTimeMs)],
    ["End UTC", new Date(plan.endTimeMs).toISOString().slice(0, 16).replace("T", " ")],
    ["Start block", formatHeight(plan.startHeight)],
    ["End block", formatHeight(plan.endHeight)],
    ["Target epoch", target],
    ["Before epoch end", plan.deltaToEpochEndSec === null ? "n/a" : formatDuration(plan.deltaToEpochEndSec)],
  ];
  $("plan-details").innerHTML = rows.map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`).join("");
}

function renderEpochTable() {
  $("epochs-body").innerHTML = state.epochs.map((epoch) => {
    const targetStart = epoch.endTimeMs - TARGET_MAX_SEC * 1000;
    const targetEnd = epoch.endTimeMs - TARGET_MIN_SEC * 1000;
    return `<tr>
      <td>${epoch.epoch}</td>
      <td>${formatLocalTime(epoch.startTimeMs)}</td>
      <td>${formatLocalTime(epoch.endTimeMs)}</td>
      <td class="num">${formatHeight(epoch.endHeight - epoch.startHeight + 1)}</td>
      <td>${formatLocalTime(targetStart)} - ${formatLocalTime(targetEnd)}</td>
    </tr>`;
  }).join("");
}

function renderPlanStatus() {
  const plan = getPlan();
  if (plan.status === "ok") {
    setNotice("ok", `OK: vote ends ${formatDuration(plan.deltaToEpochEndSec)} before epoch ${plan.targetEpoch.epoch} ends.`);
    return;
  }
  if (!plan.targetEpoch) {
    setNotice("warn", "Vote end is outside the displayed current + next 4 epochs.");
    return;
  }
  if (plan.status === "too_early") {
    const shiftSec = plan.deltaToEpochEndSec - TARGET_MAX_SEC;
    setNotice("warn", `Too early: move start later by about ${formatDuration(shiftSec)} to enter the target window.`);
    return;
  }
  const shiftSec = TARGET_MIN_SEC - plan.deltaToEpochEndSec;
  setNotice("warn", `Too late: move start earlier by about ${formatDuration(shiftSec)} to enter the target window.`);
}

function svgEl(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function renderTimeline() {
  const svg = $("timeline");
  svg.textContent = "";
  const width = 1200;
  const height = 300;
  const left = 56;
  const right = 28;
  const top = 42;
  const bandY = 92;
  const bandH = 72;
  const axisY = 212;
  const firstMs = state.epochs[0].startTimeMs;
  const lastMs = state.epochs[state.epochs.length - 1].endTimeMs;
  const span = lastMs - firstMs;
  const xOf = (ms) => left + ((ms - firstMs) / span) * (width - left - right);
  const clampX = (x) => Math.max(left, Math.min(width - right, x));
  const plan = getPlan();

  svg.appendChild(svgEl("rect", { x: 0, y: 0, width, height, fill: "transparent" }));

  state.epochs.forEach((epoch, index) => {
    const x = xOf(epoch.startTimeMs);
    const w = xOf(epoch.endTimeMs) - x;
    svg.appendChild(svgEl("rect", {
      x, y: bandY, width: w, height: bandH,
      fill: index % 2 ? "#f1f5f7" : "#ffffff",
      stroke: "#d7dde3",
    }));
    svg.appendChild(svgEl("text", {
      x: x + 10, y: bandY + 24, fill: "#17202a", "font-size": 15, "font-weight": 700,
    })).textContent = `Epoch ${epoch.epoch}`;
    svg.appendChild(svgEl("text", {
      x: x + 10, y: bandY + 48, fill: "#617082", "font-size": 12,
    })).textContent = formatLocalTime(epoch.endTimeMs);

    const targetX = xOf(epoch.endTimeMs - TARGET_MAX_SEC * 1000);
    const targetW = xOf(epoch.endTimeMs - TARGET_MIN_SEC * 1000) - targetX;
    svg.appendChild(svgEl("rect", {
      x: targetX, y: bandY + bandH + 16, width: Math.max(2, targetW), height: 18,
      fill: "#159447", opacity: 0.85, rx: 3,
    }));
  });

  svg.appendChild(svgEl("line", { x1: left, y1: axisY, x2: width - right, y2: axisY, stroke: "#9aa6b2", "stroke-width": 1 }));

  const nowX = clampX(xOf(state.snapshot.latestTimeMs));
  svg.appendChild(svgEl("line", { x1: nowX, y1: 58, x2: nowX, y2: 236, stroke: "#17202a", "stroke-width": 2 }));
  svg.appendChild(svgEl("text", { x: nowX + 6, y: 56, fill: "#17202a", "font-size": 12 })).textContent = "Now";

  const startX = clampX(xOf(plan.startTimeMs));
  const endX = clampX(xOf(plan.endTimeMs));
  svg.appendChild(svgEl("rect", {
    x: Math.min(startX, endX),
    y: 183,
    width: Math.max(2, Math.abs(endX - startX)),
    height: 18,
    fill: "#3858c9",
    opacity: 0.82,
    rx: 4,
  }));
  svg.appendChild(svgEl("line", { x1: startX, y1: 170, x2: startX, y2: 234, stroke: "#3858c9", "stroke-width": 3 }));
  svg.appendChild(svgEl("circle", { id: "start-handle", cx: startX, cy: 170, r: 9, fill: "#3858c9", stroke: "#ffffff", "stroke-width": 3 }));
  svg.appendChild(svgEl("text", { x: startX + 10, y: 172, fill: "#3858c9", "font-size": 12, "font-weight": 700 })).textContent = "Start";
  svg.appendChild(svgEl("line", { x1: endX, y1: 170, x2: endX, y2: 234, stroke: "#3858c9", "stroke-width": 2, "stroke-dasharray": "5 4" }));
  svg.appendChild(svgEl("text", { x: endX + 10, y: 198, fill: "#3858c9", "font-size": 12, "font-weight": 700 })).textContent = "End";

  const captionStart = formatLocalTime(firstMs);
  const captionEnd = formatLocalTime(lastMs);
  $("timeline-caption").textContent = `${captionStart} to ${captionEnd}; drag the blue start marker or edit the start time.`;

  svg.onpointerdown = (event) => {
    const pointMs = eventToTime(event, svg, xOf, firstMs, span, left, width - right);
    if (Math.abs(xOf(pointMs) - startX) <= 28) {
      state.dragging = true;
      svg.setPointerCapture(event.pointerId);
    }
  };
  svg.onpointermove = (event) => {
    if (!state.dragging) return;
    state.startTimeMs = eventToTime(event, svg, xOf, firstMs, span, left, width - right);
    render();
  };
  svg.onpointerup = (event) => {
    state.dragging = false;
    try {
      svg.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
  };
}

function eventToTime(event, svg, xOf, firstMs, span, minX, maxX) {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const local = point.matrixTransform(svg.getScreenCTM().inverse());
  const clamped = Math.max(minX, Math.min(maxX, local.x));
  return firstMs + ((clamped - minX) / (maxX - minX)) * span;
}

function wireEvents() {
  $("refresh").addEventListener("click", refresh);
  $("fit-target").addEventListener("click", () => {
    if (!state.snapshot) return;
    setRecommendedStart();
    render();
  });
  $("timezone-offset").addEventListener("change", () => {
    try {
      state.tzOffsetMinutes = parseOffset($("timezone-offset").value);
      render();
    } catch (error) {
      setNotice("error", error.message);
    }
  });
  $("start-time").addEventListener("change", () => {
    try {
      state.startTimeMs = fromDatetimeLocal($("start-time").value);
      render();
    } catch (error) {
      setNotice("error", error.message);
    }
  });
}

async function refresh() {
  try {
    setNotice("", "Loading chain data...");
    await loadChainSnapshot();
    render();
  } catch (error) {
    console.error(error);
    setNotice("error", `Failed to load planner data: ${error.message}`);
  }
}

function init() {
  $("node-url").value = DEFAULT_NODE_URL;
  $("timezone-offset").value = offsetToLabel(state.tzOffsetMinutes);
  wireEvents();
  refresh();
}

init();
