importScripts("shared.js");

const { SETTINGS_DEFAULTS, EMPTY_STATUS, EMPTY_AUDIO_DEBUG, getReasonForUrl, isWatchUrl } = globalThis.YTSSC;

const ACTIVE_ICON_PATHS = {
  16: "icons/icon-16.png",
  32: "icons/icon-32.png",
  48: "icons/icon-48.png",
  128: "icons/icon-128.png"
};

const DISABLED_ICON_PATHS = {
  16: "icons/icon-disabled-16.png",
  32: "icons/icon-disabled-32.png",
  48: "icons/icon-disabled-48.png",
  128: "icons/icon-disabled-128.png"
};

let lastEligibleTabId = null;

function isMissingReceiverError(error) {
  return String(error?.message ?? error).includes("Receiving end does not exist");
}

function createStatusFallback(reason) {
  return {
    ...EMPTY_STATUS,
    reason
  };
}

function createAudioDebugFallback(reason) {
  return {
    ...EMPTY_AUDIO_DEBUG,
    reason
  };
}

async function getExtensionSettings() {
  const stored = await chrome.storage.sync.get(SETTINGS_DEFAULTS);
  return {
    extensionEnabled: stored.extensionEnabled !== false
  };
}

async function setTabActionEnabled(tabId, enabled) {
  if (typeof tabId !== "number") {
    return;
  }

  if (enabled) {
    await chrome.action.enable(tabId);
    return;
  }

  await chrome.action.disable(tabId);
}

async function setTabIcon(tabId, iconPaths) {
  if (typeof tabId !== "number") {
    return;
  }

  await chrome.action.setIcon({
    tabId,
    path: iconPaths
  });
}

async function applyActionPresentation(tabId, url, settings) {
  const watchTab = isWatchUrl(url);
  const resolvedSettings = settings ?? (await getExtensionSettings());

  if (watchTab) {
    lastEligibleTabId = tabId;
  } else if (lastEligibleTabId === tabId) {
    lastEligibleTabId = null;
  }

  await setTabActionEnabled(tabId, watchTab);
  await setTabIcon(tabId, watchTab && resolvedSettings.extensionEnabled ? ACTIVE_ICON_PATHS : DISABLED_ICON_PATHS);
}

async function disableEverywhere() {
  try {
    await chrome.action.disable();
    await chrome.action.setIcon({ path: DISABLED_ICON_PATHS });
  } catch (error) {
    console.warn("Failed to disable action by default", error);
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

async function getRememberedEligibleTab() {
  if (typeof lastEligibleTabId !== "number") {
    return null;
  }

  try {
    const tab = await chrome.tabs.get(lastEligibleTabId);
    const reason = getReasonForUrl(tab.url ?? tab.pendingUrl ?? "");
    if (reason === "no_video") {
      return tab;
    }
  } catch (error) {
    console.warn("Failed to resolve remembered eligible tab", error);
  }

  lastEligibleTabId = null;
  return null;
}

async function getPreferredMonitorTab() {
  const activeTab = await getActiveTab();
  const activeReason = getReasonForUrl(activeTab?.url ?? activeTab?.pendingUrl ?? "");
  if (activeReason === "no_video") {
    return activeTab;
  }

  return getRememberedEligibleTab();
}

async function requestTabState(tab, requestType, fallbackFactory) {
  if (!tab?.id) {
    return fallbackFactory("not_watch_page");
  }

  try {
    return await chrome.tabs.sendMessage(tab.id, { type: requestType });
  } catch (error) {
    const reason = getReasonForUrl(tab.url ?? tab.pendingUrl ?? "");
    if (reason !== "no_video") {
      return fallbackFactory(reason);
    }

    return fallbackFactory(isMissingReceiverError(error) ? "reload_required" : "no_video");
  }
}

async function getPageStatusForTab(tab) {
  return requestTabState(tab, "GET_PAGE_STATUS", createStatusFallback);
}

async function getAudioDebugForTab(tab) {
  return requestTabState(tab, "GET_AUDIO_DEBUG", createAudioDebugFallback);
}

function refreshAllTabsForSettings(extensionEnabled) {
  chrome.tabs
    .query({})
    .then((tabs) =>
      Promise.all(
        tabs
          .filter((tab) => typeof tab.id === "number")
          .map((tab) =>
            applyActionPresentation(tab.id, tab.url ?? tab.pendingUrl ?? "", {
              extensionEnabled
            })
          )
      )
    )
    .catch((error) => {
      console.warn("Failed to refresh action state after settings change", error);
    });
}

chrome.runtime.onInstalled.addListener(() => {
  disableEverywhere();
});

chrome.runtime.onStartup.addListener(() => {
  disableEverywhere();
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await applyActionPresentation(tabId, tab.url ?? tab.pendingUrl ?? "");
  } catch (error) {
    console.warn("Failed to update action on activation", error);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const nextUrl = changeInfo.url ?? tab.url ?? tab.pendingUrl;
  if (typeof nextUrl !== "string") {
    return;
  }

  applyActionPresentation(tabId, nextUrl).catch((error) => {
    console.warn("Failed to update action on tab update", error);
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync" || !Object.prototype.hasOwnProperty.call(changes, "extensionEnabled")) {
    return;
  }

  refreshAllTabsForSettings(changes.extensionEnabled.newValue !== false);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "SET_TAB_ELIGIBILITY") {
    if (sender.tab?.id && typeof sender.tab.url === "string") {
      if (message.eligible) {
        lastEligibleTabId = sender.tab.id;
      } else if (lastEligibleTabId === sender.tab.id) {
        lastEligibleTabId = null;
      }
    }

    applyActionPresentation(sender.tab?.id, sender.tab?.url ?? "")
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.warn("Failed to set tab eligibility", error);
        sendResponse({ ok: false });
      });
    return true;
  }

  if (message?.type === "GET_ACTIVE_PAGE_STATUS") {
    (async () => {
      try {
        const tab = await getPreferredMonitorTab();
        sendResponse(await getPageStatusForTab(tab));
      } catch (error) {
        console.warn("Failed to fetch active page status", error);
        sendResponse(createStatusFallback("not_watch_page"));
      }
    })();
    return true;
  }

  if (message?.type === "GET_ACTIVE_AUDIO_DEBUG") {
    (async () => {
      try {
        const tab = await getPreferredMonitorTab();
        sendResponse(await getAudioDebugForTab(tab));
      } catch (error) {
        console.warn("Failed to fetch active audio debug", error);
        sendResponse(createAudioDebugFallback("not_watch_page"));
      }
    })();
    return true;
  }

  return false;
});
