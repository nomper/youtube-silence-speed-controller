const { SETTINGS_DEFAULTS, MODE_LABELS, REASON_DESCRIPTIONS, EMPTY_AUDIO_DEBUG, sanitizeSettings } = globalThis.YTSSC;

const form = document.getElementById("settings-form");
const normalSpeedInput = document.getElementById("normal-speed");
const silentSpeedInput = document.getElementById("silent-speed");
const silenceHoldInput = document.getElementById("silence-hold-seconds");
const silenceSensitivityInput = document.getElementById("silence-sensitivity");
const sensitivityNote = document.getElementById("sensitivity-note");
const statusEl = document.getElementById("status");
const monitorReasonEl = document.getElementById("monitor-reason");
const currentRmsValueEl = document.getElementById("current-rms-value");
const baselineValueEl = document.getElementById("baseline-value");
const thresholdValueEl = document.getElementById("threshold-value");
const holdProgressValueEl = document.getElementById("hold-progress-value");
const currentRmsBarEl = document.getElementById("current-rms-bar");
const baselineBarEl = document.getElementById("baseline-bar");
const thresholdBarEl = document.getElementById("threshold-bar");
const holdProgressBarEl = document.getElementById("hold-progress-bar");
const monitorModeEl = document.getElementById("monitor-mode");
const monitorRateEl = document.getElementById("monitor-rate");
const monitorSilentEl = document.getElementById("monitor-silent");

let monitorTimer = null;

function getSensitivityLabel(value) {
  if (value >= 75) {
    return "React quickly to quieter audio.";
  }
  if (value >= 45) {
    return "Balanced between stability and responsiveness.";
  }
  return "Prefer staying at normal speed unless the audio becomes very quiet.";
}

function renderSensitivityNote(value) {
  sensitivityNote.textContent = `${value} / 100 - ${getSensitivityLabel(value)}`;
}

function formatMeterValue(value) {
  return Number(value || 0).toFixed(4);
}

function formatRate(rate) {
  return `${Number(rate || 0).toFixed(2)}x`;
}

function setBarWidth(element, ratio) {
  element.style.width = `${Math.max(0, Math.min(ratio, 1)) * 100}%`;
}

function renderAudioDebug(debug) {
  const currentRms = Number(debug.currentRms || 0);
  const baseline = Number(debug.baseline || 0);
  const threshold = Number(debug.threshold || 0);
  const scale = Math.max(currentRms, baseline, threshold, 0.01);

  currentRmsValueEl.textContent = formatMeterValue(currentRms);
  baselineValueEl.textContent = formatMeterValue(baseline);
  thresholdValueEl.textContent = formatMeterValue(threshold);
  holdProgressValueEl.textContent = `${Math.round((debug.silenceHoldProgress || 0) * 100)}%`;

  setBarWidth(currentRmsBarEl, currentRms / scale);
  setBarWidth(baselineBarEl, baseline / scale);
  setBarWidth(thresholdBarEl, threshold / scale);
  setBarWidth(holdProgressBarEl, debug.silenceHoldProgress || 0);

  monitorModeEl.textContent = MODE_LABELS[debug.mode] ?? "Unknown";
  monitorRateEl.textContent = formatRate(debug.currentRate || SETTINGS_DEFAULTS.normalSpeed);
  monitorSilentEl.textContent = debug.isSilent ? "Yes" : "No";
  monitorReasonEl.textContent =
    REASON_DESCRIPTIONS[debug.reason] ?? "Status is unavailable for this tab.";
}

async function refreshAudioDebug() {
  try {
    const debug = await chrome.runtime.sendMessage({ type: "GET_ACTIVE_AUDIO_DEBUG" });
    renderAudioDebug({
      ...EMPTY_AUDIO_DEBUG,
      ...debug
    });
  } catch (error) {
    console.error(error);
    renderAudioDebug(EMPTY_AUDIO_DEBUG);
  }
}

function startMonitor() {
  if (monitorTimer) {
    clearInterval(monitorTimer);
  }

  refreshAudioDebug();
  monitorTimer = setInterval(refreshAudioDebug, 250);
}

window.addEventListener("unload", () => {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
});

function populateForm(settings) {
  normalSpeedInput.value = settings.normalSpeed.toFixed(2);
  silentSpeedInput.value = settings.silentSpeed.toFixed(2);
  silenceHoldInput.value = settings.silenceHoldSeconds.toFixed(1);
  silenceSensitivityInput.value = String(settings.silenceSensitivity);
  renderSensitivityNote(settings.silenceSensitivity);
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get(SETTINGS_DEFAULTS);
  populateForm(sanitizeSettings(stored));
}

silenceSensitivityInput.addEventListener("input", () => {
  renderSensitivityNote(Number(silenceSensitivityInput.value));
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const stored = await chrome.storage.sync.get(SETTINGS_DEFAULTS);
  const nextSettings = sanitizeSettings({
    ...stored,
    normalSpeed: normalSpeedInput.value,
    silentSpeed: silentSpeedInput.value,
    silenceSensitivity: silenceSensitivityInput.value,
    silenceHoldSeconds: silenceHoldInput.value
  });

  populateForm(nextSettings);
  await chrome.storage.sync.set(nextSettings);
  statusEl.textContent = "Settings saved.";
});

loadSettings().catch((error) => {
  console.error(error);
  statusEl.textContent = "Failed to load settings.";
});

startMonitor();
