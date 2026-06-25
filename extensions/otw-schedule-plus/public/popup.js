const CHAT_LOGIN_STORAGE_KEY = "otwSchedulePlusChatLoginBridgeEnabled";
const PLAYER_OPTIMIZATION_STORAGE_KEY =
  "otw:schedule-plus:multiview:player-optimization-enabled";
const CHAT_LOGIN_COOKIE_PERMISSION = {
  origins: ["https://nid.naver.com/*"],
  permissions: ["cookies"],
};

const setText = (id, value) => {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
};

const setStatus = (id, enabled) => {
  const element = document.getElementById(id);
  if (!element) return;

  element.textContent = enabled ? "켜짐" : "꺼짐";
  element.classList.toggle("off", !enabled);
};

const setToggle = (id, enabled) => {
  const button = document.getElementById(id);
  if (!button) return;

  button.setAttribute("aria-pressed", enabled ? "true" : "false");
};

const setChatPermissionButtonVisible = (visible) => {
  const button = document.getElementById("chat-permission-button");
  if (!button) return;

  button.hidden = !visible;
};

const hasChatLoginPermission = (callback) => {
  if (!chrome.permissions?.contains) {
    callback(Boolean(chrome.cookies));
    return;
  }

  chrome.permissions.contains(CHAT_LOGIN_COOKIE_PERMISSION, (granted) => {
    callback(Boolean(granted));
  });
};

const refreshPopupState = () => {
  chrome.storage.local.get(
    {
      [CHAT_LOGIN_STORAGE_KEY]: false,
      [PLAYER_OPTIMIZATION_STORAGE_KEY]: true,
    },
    (items) => {
      const chatLoginEnabled = items[CHAT_LOGIN_STORAGE_KEY] === true;
      const playerOptimizationEnabled =
        items[PLAYER_OPTIMIZATION_STORAGE_KEY] !== false;

      setStatus("player-status", playerOptimizationEnabled);
      setToggle("player-optimization-toggle", playerOptimizationEnabled);
      setStatus("chat-status", chatLoginEnabled);
      setToggle("chat-login-toggle", chatLoginEnabled);

      hasChatLoginPermission((granted) => {
        if (chatLoginEnabled && !granted) {
          setText("chat-status", "권한 필요");
        }
        setChatPermissionButtonVisible(chatLoginEnabled && !granted);
      });
    },
  );
};

const setStorageValue = (key, value, callback = refreshPopupState) => {
  chrome.storage.local.set({ [key]: value }, callback);
};

const manifest = chrome.runtime.getManifest();
setText("extension-version", `Version ${manifest.version}`);

document
  .getElementById("player-optimization-toggle")
  ?.addEventListener("click", () => {
    chrome.storage.local.get(
      { [PLAYER_OPTIMIZATION_STORAGE_KEY]: true },
      (items) => {
        setStorageValue(
          PLAYER_OPTIMIZATION_STORAGE_KEY,
          items[PLAYER_OPTIMIZATION_STORAGE_KEY] === false,
        );
      },
    );
  });

document.getElementById("chat-login-toggle")?.addEventListener("click", () => {
  chrome.storage.local.get({ [CHAT_LOGIN_STORAGE_KEY]: false }, (items) => {
    const nextEnabled = items[CHAT_LOGIN_STORAGE_KEY] !== true;

    if (!nextEnabled) {
      setStorageValue(CHAT_LOGIN_STORAGE_KEY, false);
      return;
    }

    const enable = () => setStorageValue(CHAT_LOGIN_STORAGE_KEY, true);

    if (!chrome.permissions?.request) {
      enable();
      return;
    }

    chrome.permissions.request(CHAT_LOGIN_COOKIE_PERMISSION, (granted) => {
      if (granted) enable();
      else refreshPopupState();
    });
  });
});

document
  .getElementById("chat-permission-button")
  ?.addEventListener("click", () => {
    if (!chrome.permissions?.request) return;

    chrome.permissions.request(CHAT_LOGIN_COOKIE_PERMISSION, () => {
      refreshPopupState();
    });
  });

refreshPopupState();
