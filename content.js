(() => {
if (globalThis.__youtubeSilenceSpeedControllerLoaded) {
  return;
}

globalThis.__youtubeSilenceSpeedControllerLoaded = true;

const { SETTINGS_DEFAULTS, EMPTY_STATUS, sanitizeSettings, isWatchUrl } = globalThis.YTSSC;

const STATUS = {
  ...EMPTY_STATUS
};

const AUDIO_DEBUG = {
  currentRms: 0,
  baseline: 0,
  threshold: 0,
  silenceHoldProgress: 0,
  isSilent: false,
  reason: "not_watch_page",
  mode: "inactive"
};

const SAMPLE_INTERVAL_MS = 100;
const HISTORY_WINDOW_MS = 20000;
const MIN_HISTORY_SAMPLES = 20;
const HISTORY_SAMPLE_LIMIT = HISTORY_WINDOW_MS / SAMPLE_INTERVAL_MS;
const sourceNodes = new WeakMap();
const FALLBACK_STATUS = { ...EMPTY_STATUS };

let settings = { ...SETTINGS_DEFAULTS };
let currentUrl = location.href;
let monitoredVideo = null;
let audioContext = null;
let mediaSource = null;
let analyser = null;
let gainNode = null;
let sampleTimer = null;
let ensureVideoTimer = null;
let urlTimer = null;
let observer = null;
let ensureScheduled = false;
let interactionListenersInstalled = false;
let audioSamples = [];
let silenceCandidateSince = null;
let lastAppliedRate = null;
let lastReportedEligibility = null;
let runtimeAvailable = true;
let controllerStopped = false;

function isWatchPage(url = location.href) {
  return isWatchUrl(url);
}

function isAdShowing() {
  return Boolean(document.querySelector("#movie_player.ad-showing"));
}

function isLiveStream(video) {
  if (!video) {
    return false;
  }

  const watchFlexy = document.querySelector("ytd-watch-flexy");
  if (watchFlexy?.hasAttribute("is-live")) {
    return true;
  }

  return false;
}

async function loadSettings() {
  if (!isRuntimeAvailable()) {
    return;
  }

  const stored = await chrome.storage.sync.get(SETTINGS_DEFAULTS);
  settings = sanitizeSettings(stored);
}

function sensitivityToFactor(sensitivity) {
  return 0.15 + (sensitivity / 100) * 0.55;
}

function isContextInvalidationError(error) {
  return String(error?.message ?? error).includes("Extension context invalidated");
}

function isRuntimeAvailable() {
  if (!runtimeAvailable) {
    return false;
  }

  try {
    if (!chrome?.runtime?.id) {
      runtimeAvailable = false;
      return false;
    }

    return true;
  } catch (error) {
    runtimeAvailable = false;
    return false;
  }
}

function handleRuntimeFailure(error) {
  if (!isContextInvalidationError(error)) {
    return false;
  }

  runtimeAvailable = false;
  stopController({ resetRate: false });
  return true;
}

function setStatus(nextStatus) {
  const safeStatus =
    nextStatus && typeof nextStatus === "object"
      ? {
          ...FALLBACK_STATUS,
          ...nextStatus
        }
      : FALLBACK_STATUS;

  STATUS.isEligible = safeStatus.isEligible;
  STATUS.isControlling = safeStatus.isControlling;
  STATUS.currentRate = safeStatus.currentRate;
  STATUS.mode = safeStatus.mode;
  STATUS.reason = safeStatus.reason;
  AUDIO_DEBUG.reason = safeStatus.reason;
  AUDIO_DEBUG.mode = safeStatus.mode;
}

function updateAudioDebug(partialDebug) {
  Object.assign(AUDIO_DEBUG, partialDebug);
}

function reportEligibility(eligible) {
  if (controllerStopped || lastReportedEligibility === eligible || !isRuntimeAvailable()) {
    return;
  }

  lastReportedEligibility = eligible;
  try {
    chrome.runtime.sendMessage({ type: "SET_TAB_ELIGIBILITY", eligible }).catch((error) => {
      handleRuntimeFailure(error);
    });
  } catch (error) {
    handleRuntimeFailure(error);
  }
}

function clearSilenceTracking() {
  audioSamples = [];
  silenceCandidateSince = null;
  updateAudioDebug({
    currentRms: 0,
    baseline: 0,
    threshold: 0,
    silenceHoldProgress: 0,
    isSilent: false
  });
}

function disconnectAudioGraph() {
  if (analyser) {
    analyser.disconnect();
    analyser = null;
  }

  if (gainNode) {
    gainNode.disconnect();
    gainNode = null;
  }

  if (mediaSource) {
    mediaSource.disconnect();
    mediaSource = null;
  }
}

function stopSampling() {
  if (sampleTimer) {
    clearInterval(sampleTimer);
    sampleTimer = null;
  }
}

function removeInteractionListeners() {
  if (!interactionListenersInstalled) {
    return;
  }

  interactionListenersInstalled = false;
  document.removeEventListener("click", resumeAudioContextFromInteraction, true);
  document.removeEventListener("keydown", resumeAudioContextFromInteraction, true);
}

function stopController({ resetRate = false } = {}) {
  if (controllerStopped) {
    return;
  }

  controllerStopped = true;

  if (urlTimer) {
    clearInterval(urlTimer);
    urlTimer = null;
  }

  if (ensureVideoTimer) {
    clearInterval(ensureVideoTimer);
    ensureVideoTimer = null;
  }

  if (observer) {
    observer.disconnect();
    observer = null;
  }

  removeInteractionListeners();
  detachVideo({ resetRate });
}

function resetPlaybackRate() {
  if (controllerStopped) {
    return;
  }

  if (monitoredVideo && Number.isFinite(settings.normalSpeed)) {
    monitoredVideo.playbackRate = settings.normalSpeed;
    lastAppliedRate = settings.normalSpeed;
  }
}

function detachVideo({ resetRate = true } = {}) {
  stopSampling();

  if (monitoredVideo) {
    if (resetRate) {
      monitoredVideo.playbackRate = settings.normalSpeed;
      lastAppliedRate = settings.normalSpeed;
    }

    monitoredVideo.removeEventListener("play", onPlaybackEvent);
    monitoredVideo.removeEventListener("pause", onPlaybackEvent);
    monitoredVideo.removeEventListener("ended", onPlaybackEvent);
    monitoredVideo.removeEventListener("seeking", onPlaybackEvent);
    monitoredVideo.removeEventListener("seeked", onPlaybackEvent);
    monitoredVideo.removeEventListener("ratechange", onPlaybackEvent);
  }

  disconnectAudioGraph();
  monitoredVideo = null;
  clearSilenceTracking();
  setStatus({
    isEligible: isWatchPage(),
    isControlling: false,
    currentRate: settings.normalSpeed,
    mode: "inactive",
    reason: isWatchPage() ? "no_video" : "not_watch_page"
  });
}

async function resumeAudioContextFromInteraction() {
  if (controllerStopped) {
    return;
  }

  if (!audioContext || audioContext.state !== "suspended") {
    return;
  }

  try {
    await audioContext.resume();
    if (monitoredVideo) {
      onPlaybackEvent();
    }
  } catch (error) {
    console.warn("Failed to resume audio context", error);
  }
}

function installInteractionListeners() {
  if (interactionListenersInstalled) {
    return;
  }

  interactionListenersInstalled = true;
  document.addEventListener("click", resumeAudioContextFromInteraction, true);
  document.addEventListener("keydown", resumeAudioContextFromInteraction, true);
}

async function ensureAudioGraph(video) {
  if (controllerStopped) {
    return false;
  }

  if (!video) {
    return false;
  }

  if (!audioContext) {
    audioContext = new AudioContext();
  }

  if (audioContext.state === "suspended") {
    try {
      await audioContext.resume();
    } catch (error) {
      return false;
    }
  }

  if (mediaSource && monitoredVideo === video && analyser && gainNode) {
    return true;
  }

  disconnectAudioGraph();

  try {
    mediaSource = sourceNodes.get(video) ?? audioContext.createMediaElementSource(video);
    sourceNodes.set(video, mediaSource);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.2;
    gainNode = audioContext.createGain();
    gainNode.gain.value = 1;

    mediaSource.connect(analyser);
    analyser.connect(gainNode);
    gainNode.connect(audioContext.destination);
    return true;
  } catch (error) {
    console.warn("Failed to build audio graph", error);
    disconnectAudioGraph();
    return false;
  }
}

function getCurrentReason(video) {
  if (!isWatchPage()) {
    return "not_watch_page";
  }

  if (!video) {
    return "no_video";
  }

  if (isAdShowing()) {
    return "ad";
  }

  if (isLiveStream(video)) {
    return "live";
  }

  if (video.paused || video.ended || video.seeking) {
    return "paused";
  }

  return "active";
}

function updateInactiveState(reason) {
  updateAudioDebug({
    currentRms: 0,
    baseline: 0,
    threshold: 0,
    silenceHoldProgress: 0,
    isSilent: false,
    reason,
    mode: "inactive"
  });

  if (!monitoredVideo) {
    setStatus({
      isEligible: isWatchPage(),
      isControlling: false,
      currentRate: settings.normalSpeed,
      mode: "inactive",
      reason
    });
    return;
  }

  if (reason !== "active") {
    monitoredVideo.playbackRate = settings.normalSpeed;
    lastAppliedRate = settings.normalSpeed;
  }

  setStatus({
    isEligible: isWatchPage(),
    isControlling: false,
    currentRate: monitoredVideo.playbackRate,
    mode: "inactive",
    reason
  });
}

function pushAudioSample(value) {
  audioSamples.push(value);
  if (audioSamples.length > HISTORY_SAMPLE_LIMIT) {
    audioSamples = audioSamples.slice(audioSamples.length - HISTORY_SAMPLE_LIMIT);
  }
}

function computeRms() {
  if (!analyser) {
    return 0;
  }

  const buffer = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buffer);

  let sum = 0;
  for (const sample of buffer) {
    sum += sample * sample;
  }

  return Math.sqrt(sum / buffer.length);
}

function getRelativeBaseline() {
  if (audioSamples.length < MIN_HISTORY_SAMPLES) {
    return null;
  }

  const sorted = [...audioSamples].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.8));
  return sorted[index];
}

function applyPlaybackRate(nextRate) {
  if (controllerStopped || !monitoredVideo) {
    return;
  }

  if (lastAppliedRate === nextRate && Math.abs(monitoredVideo.playbackRate - nextRate) < 0.01) {
    return;
  }

  monitoredVideo.playbackRate = nextRate;
  lastAppliedRate = nextRate;
}

function tick() {
  if (controllerStopped) {
    return;
  }

  if (!settings.extensionEnabled) {
    clearSilenceTracking();
    updateInactiveState("disabled");
    return;
  }

  const reason = getCurrentReason(monitoredVideo);
  if (reason !== "active") {
    clearSilenceTracking();
    updateInactiveState(reason);
    return;
  }

  const rms = computeRms();
  pushAudioSample(rms);

  const baseline = getRelativeBaseline();
  if (!baseline || baseline <= 0) {
    updateAudioDebug({
      currentRms: rms,
      baseline: 0,
      threshold: 0,
      silenceHoldProgress: 0,
      isSilent: false,
      reason: "active",
      mode: "normal"
    });
    applyPlaybackRate(settings.normalSpeed);
    setStatus({
      isEligible: true,
      isControlling: true,
      currentRate: monitoredVideo.playbackRate,
      mode: "normal",
      reason: "active"
    });
    return;
  }

  const threshold = Math.max(baseline * sensitivityToFactor(settings.silenceSensitivity), 0.002);
  const isSilent = rms < threshold;
  const now = Date.now();
  const holdProgress = silenceCandidateSince === null
    ? 0
    : Math.min((now - silenceCandidateSince) / (settings.silenceHoldSeconds * 1000), 1);

  if (isSilent) {
    if (silenceCandidateSince === null) {
      silenceCandidateSince = now;
    }

    const heldForMs = now - silenceCandidateSince;
    updateAudioDebug({
      currentRms: rms,
      baseline,
      threshold,
      silenceHoldProgress: Math.min(heldForMs / (settings.silenceHoldSeconds * 1000), 1),
      isSilent: true,
      reason: "active",
      mode: heldForMs >= settings.silenceHoldSeconds * 1000 ? "accelerated" : "pending_silence"
    });
    if (heldForMs >= settings.silenceHoldSeconds * 1000) {
      applyPlaybackRate(settings.silentSpeed);
      setStatus({
        isEligible: true,
        isControlling: true,
        currentRate: monitoredVideo.playbackRate,
        mode: "accelerated",
        reason: "active"
      });
      return;
    }

    applyPlaybackRate(settings.normalSpeed);
    setStatus({
      isEligible: true,
      isControlling: true,
      currentRate: monitoredVideo.playbackRate,
      mode: "pending_silence",
      reason: "active"
    });
    return;
  }

  silenceCandidateSince = null;
  updateAudioDebug({
    currentRms: rms,
    baseline,
    threshold,
    silenceHoldProgress: holdProgress,
    isSilent: false,
    reason: "active",
    mode: "normal"
  });
  applyPlaybackRate(settings.normalSpeed);
  setStatus({
    isEligible: true,
    isControlling: true,
    currentRate: monitoredVideo.playbackRate,
    mode: "normal",
    reason: "active"
  });
}

function startSampling() {
  if (controllerStopped) {
    return;
  }

  stopSampling();
  sampleTimer = setInterval(() => {
    tick();
  }, SAMPLE_INTERVAL_MS);
}

function onPlaybackEvent() {
  if (controllerStopped) {
    return;
  }

  if (!settings.extensionEnabled) {
    clearSilenceTracking();
    updateInactiveState("disabled");
    return;
  }

  const reason = getCurrentReason(monitoredVideo);
  if (reason !== "active") {
    clearSilenceTracking();
    updateInactiveState(reason);
    return;
  }

  ensureAudioGraph(monitoredVideo).then((ready) => {
    if (!ready) {
      updateInactiveState("paused");
      return;
    }

    startSampling();
  });
}

function attachVideo(video) {
  if (controllerStopped) {
    return;
  }

  if (monitoredVideo === video) {
    return;
  }

  detachVideo();
  monitoredVideo = video;
  lastAppliedRate = null;

  monitoredVideo.addEventListener("play", onPlaybackEvent);
  monitoredVideo.addEventListener("pause", onPlaybackEvent);
  monitoredVideo.addEventListener("ended", onPlaybackEvent);
  monitoredVideo.addEventListener("seeking", onPlaybackEvent);
  monitoredVideo.addEventListener("seeked", onPlaybackEvent);
  monitoredVideo.addEventListener("ratechange", onPlaybackEvent);

  setStatus({
    isEligible: true,
    isControlling: false,
    currentRate: monitoredVideo.playbackRate,
    mode: "inactive",
    reason: getCurrentReason(monitoredVideo)
  });

  onPlaybackEvent();
}

function ensureVideoConnection() {
  if (controllerStopped) {
    return;
  }

  if (!isWatchPage()) {
    detachVideo();
    reportEligibility(false);
    setStatus({
      isEligible: false,
      isControlling: false,
      currentRate: settings.normalSpeed,
      mode: "inactive",
      reason: "not_watch_page"
    });
    return;
  }

  reportEligibility(true);
  const nextVideo = document.querySelector("video.html5-main-video");
  if (!nextVideo) {
    detachVideo({ resetRate: false });
    setStatus({
      isEligible: true,
      isControlling: false,
      currentRate: settings.normalSpeed,
      mode: "inactive",
      reason: "no_video"
    });
    return;
  }

  attachVideo(nextVideo);
  if (!settings.extensionEnabled) {
    updateInactiveState("disabled");
  }
}

function scheduleEnsureVideoConnection() {
  if (controllerStopped || ensureScheduled) {
    return;
  }

  ensureScheduled = true;
  requestAnimationFrame(() => {
    ensureScheduled = false;
    ensureVideoConnection();
  });
}

function watchUrlChanges() {
  if (controllerStopped) {
    return;
  }

  if (urlTimer) {
    clearInterval(urlTimer);
  }

  urlTimer = setInterval(() => {
    if (location.href === currentUrl) {
      return;
    }

    currentUrl = location.href;
    clearSilenceTracking();
    scheduleEnsureVideoConnection();
  }, 500);
}

function watchDomChanges() {
  if (controllerStopped) {
    return;
  }

  if (observer) {
    observer.disconnect();
  }

  observer = new MutationObserver(() => {
    scheduleEnsureVideoConnection();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

function startEnsuringVideo() {
  if (controllerStopped) {
    return;
  }

  if (ensureVideoTimer) {
    clearInterval(ensureVideoTimer);
  }

  ensureVideoTimer = setInterval(() => {
    ensureVideoConnection();
  }, 1000);
}

if (isRuntimeAvailable()) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "GET_PAGE_STATUS") {
      sendResponse({ ...STATUS });
      return false;
    }

    if (message?.type === "GET_AUDIO_DEBUG") {
      sendResponse({
        ...AUDIO_DEBUG,
        currentRate: monitoredVideo?.playbackRate ?? settings.normalSpeed,
        isEligible: STATUS.isEligible,
        isControlling: STATUS.isControlling
      });
      return false;
    }

    return false;
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (controllerStopped || areaName !== "sync") {
      return;
    }

    const nextSettings = {
      ...settings,
      normalSpeed: changes.normalSpeed?.newValue ?? settings.normalSpeed,
      silentSpeed: changes.silentSpeed?.newValue ?? settings.silentSpeed,
      silenceSensitivity: changes.silenceSensitivity?.newValue ?? settings.silenceSensitivity,
      silenceHoldSeconds: changes.silenceHoldSeconds?.newValue ?? settings.silenceHoldSeconds,
      extensionEnabled: changes.extensionEnabled?.newValue ?? settings.extensionEnabled,
      popupStatusVisible: changes.popupStatusVisible?.newValue ?? settings.popupStatusVisible
    };

    settings = sanitizeSettings(nextSettings);
    if (monitoredVideo) {
      resetPlaybackRate();
      if (!settings.extensionEnabled) {
        updateInactiveState("disabled");
      } else {
        tick();
      }
    }
  });
}

async function initialize() {
  await loadSettings();
  currentUrl = location.href;
  installInteractionListeners();
  ensureVideoConnection();
  watchUrlChanges();
  watchDomChanges();
  startEnsuringVideo();
}

initialize().catch((error) => {
  console.error("Failed to initialize silence controller", error);
  setStatus({
    isEligible: false,
    isControlling: false,
    currentRate: settings.normalSpeed,
    mode: "inactive",
    reason: isWatchPage() ? "no_video" : "not_watch_page"
  });
});
})();
