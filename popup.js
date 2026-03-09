const {
  SETTINGS_DEFAULTS,
  MODE_LABELS,
  REASON_DESCRIPTIONS,
  EMPTY_AUDIO_DEBUG,
  sanitizeSettings
} = globalThis.YTSSC;

const stateTitleEl = document.getElementById("state-title");
const stateDescriptionEl = document.getElementById("state-description");
const currentRateEl = document.getElementById("current-rate");
const currentModeEl = document.getElementById("current-mode");
const currentRmsEl = document.getElementById("current-rms");
const thresholdRmsEl = document.getElementById("threshold-rms");
const currentRmsBarEl = document.getElementById("current-rms-bar");
const thresholdRmsBarEl = document.getElementById("threshold-rms-bar");
const extensionEnabledEl = document.getElementById("extension-enabled");
const statusVisibleEl = document.getElementById("status-visible");
const statusSectionsEl = document.getElementById("status-sections");
const openOptionsButton = document.getElementById("open-options");

let refreshTimer = null;

function formatRate(rate) {
  return `${Number(rate || 0).toFixed(2)}x`;
}

function formatMeterValue(value) {
  return Number(value || 0).toFixed(4);
}

function setBarWidth(element, ratio) {
  element.style.width = `${Math.max(0, Math.min(ratio, 1)) * 100}%`;
}

function renderStatus(status) {
  const modeLabel = MODE_LABELS[status.mode] ?? "Unknown";
  currentModeEl.textContent = modeLabel;
  currentRateEl.textContent = formatRate(status.currentRate ?? SETTINGS_DEFAULTS.normalSpeed);

  if (status.mode === "accelerated") {
    stateTitleEl.textContent = "Accelerating quiet sections";
  } else if (status.mode === "pending_silence") {
    stateTitleEl.textContent = "Quiet section detected";
  } else if (status.reason === "disabled") {
    stateTitleEl.textContent = "Controller is turned off";
  } else if (status.isControlling) {
    stateTitleEl.textContent = "Monitoring audio";
  } else {
    stateTitleEl.textContent = "Waiting to engage";
  }

  stateDescriptionEl.textContent =
    REASON_DESCRIPTIONS[status.reason] ?? "Status is unavailable for this page.";
}

function renderAudioMonitor(debug) {
  const currentRms = Number(debug.currentRms || 0);
  const threshold = Number(debug.threshold || 0);
  const scale = Math.max(currentRms, threshold, 0.01);

  currentRmsEl.textContent = formatMeterValue(currentRms);
  thresholdRmsEl.textContent = formatMeterValue(threshold);
  setBarWidth(currentRmsBarEl, currentRms / scale);
  setBarWidth(thresholdRmsBarEl, threshold / scale);
}

function renderFallback() {
  renderStatus(EMPTY_AUDIO_DEBUG);
  renderAudioMonitor(EMPTY_AUDIO_DEBUG);
}

function applyStatusVisibility(visible) {
  statusSectionsEl.classList.toggle("hidden", !visible);
}

async function loadPopupSettings() {
  const stored = await chrome.storage.sync.get(SETTINGS_DEFAULTS);
  const settings = sanitizeSettings(stored);

  extensionEnabledEl.checked = settings.extensionEnabled;
  statusVisibleEl.checked = settings.popupStatusVisible;
  applyStatusVisibility(settings.popupStatusVisible);
}

async function refreshPopup() {
  try {
    const debug = await chrome.runtime.sendMessage({ type: "GET_ACTIVE_AUDIO_DEBUG" });
    const payload = {
      ...EMPTY_AUDIO_DEBUG,
      ...debug
    };

    renderStatus(payload);
    renderAudioMonitor(payload);
  } catch (error) {
    console.error(error);
    renderFallback();
  }
}

function startRefreshLoop() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }

  refreshPopup();
  refreshTimer = setInterval(refreshPopup, 250);
}

async function updateSetting(key, value) {
  await chrome.storage.sync.set({ [key]: value });
}

openOptionsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

extensionEnabledEl.addEventListener("change", async () => {
  await updateSetting("extensionEnabled", extensionEnabledEl.checked);
  refreshPopup();
});

statusVisibleEl.addEventListener("change", async () => {
  await updateSetting("popupStatusVisible", statusVisibleEl.checked);
  applyStatusVisibility(statusVisibleEl.checked);
});

window.addEventListener("unload", () => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
});

loadPopupSettings()
  .then(() => {
    startRefreshLoop();
  })
  .catch((error) => {
    console.error(error);
    extensionEnabledEl.checked = true;
    statusVisibleEl.checked = true;
    applyStatusVisibility(true);
    startRefreshLoop();
  });
