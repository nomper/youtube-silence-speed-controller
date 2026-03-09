(() => {
  const WATCH_URL_PATTERN = /^https:\/\/www\.youtube\.com\/watch(?:\?|$)/;

  const SETTINGS_DEFAULTS = Object.freeze({
    normalSpeed: 1.0,
    silentSpeed: 3.0,
    silenceSensitivity: 60,
    silenceHoldSeconds: 1.5,
    extensionEnabled: true,
    popupStatusVisible: true
  });

  const MODE_LABELS = Object.freeze({
    inactive: "Inactive",
    normal: "Normal",
    pending_silence: "Waiting",
    accelerated: "Accelerated"
  });

  const REASON_DESCRIPTIONS = Object.freeze({
    not_youtube: "This extension only works on YouTube.",
    not_watch_page: "Open a standard YouTube watch page to use the controller.",
    reload_required: "Reload the YouTube tab once after reloading the extension.",
    no_video: "No playable YouTube video is connected yet.",
    disabled: "Automatic speed control is turned off.",
    paused: "Playback is paused or seeking.",
    ad: "Ads are excluded from silence control.",
    live: "Live streams are excluded from silence control.",
    active: "Silence detection is active on this video."
  });

  const EMPTY_STATUS = Object.freeze({
    isEligible: false,
    isControlling: false,
    currentRate: SETTINGS_DEFAULTS.normalSpeed,
    mode: "inactive",
    reason: "not_watch_page"
  });

  const EMPTY_AUDIO_DEBUG = Object.freeze({
    currentRms: 0,
    baseline: 0,
    threshold: 0,
    silenceHoldProgress: 0,
    isSilent: false,
    reason: "not_watch_page",
    mode: "inactive",
    currentRate: SETTINGS_DEFAULTS.normalSpeed,
    isEligible: false,
    isControlling: false
  });

  function clampNumber(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, parsed));
  }

  function sanitizeSettings(nextSettings = {}) {
    const normalSpeed = clampNumber(nextSettings.normalSpeed, 0.25, 4.0, SETTINGS_DEFAULTS.normalSpeed);
    const silentSpeed = clampNumber(nextSettings.silentSpeed, normalSpeed, 4.0, SETTINGS_DEFAULTS.silentSpeed);
    const silenceSensitivity = clampNumber(
      nextSettings.silenceSensitivity,
      0,
      100,
      SETTINGS_DEFAULTS.silenceSensitivity
    );
    const silenceHoldSeconds = clampNumber(
      nextSettings.silenceHoldSeconds,
      0.1,
      10.0,
      SETTINGS_DEFAULTS.silenceHoldSeconds
    );

    return {
      normalSpeed: Math.round(normalSpeed * 100) / 100,
      silentSpeed: Math.round(silentSpeed * 100) / 100,
      silenceSensitivity: Math.round(silenceSensitivity),
      silenceHoldSeconds: Math.round(silenceHoldSeconds * 10) / 10,
      extensionEnabled: nextSettings.extensionEnabled !== false,
      popupStatusVisible: nextSettings.popupStatusVisible !== false
    };
  }

  function isWatchUrl(url) {
    return typeof url === "string" && WATCH_URL_PATTERN.test(url);
  }

  function getReasonForUrl(url) {
    if (typeof url !== "string" || url.length === 0) {
      return "not_watch_page";
    }

    try {
      const parsed = new URL(url);
      if (parsed.hostname !== "www.youtube.com") {
        return "not_youtube";
      }

      return isWatchUrl(url) ? "no_video" : "not_watch_page";
    } catch (error) {
      return "not_watch_page";
    }
  }

  globalThis.YTSSC = Object.freeze({
    WATCH_URL_PATTERN,
    SETTINGS_DEFAULTS,
    MODE_LABELS,
    REASON_DESCRIPTIONS,
    EMPTY_STATUS,
    EMPTY_AUDIO_DEBUG,
    clampNumber,
    sanitizeSettings,
    isWatchUrl,
    getReasonForUrl
  });
})();
