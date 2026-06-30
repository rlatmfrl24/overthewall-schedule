const CHAT_LOGIN_STORAGE_KEY = "otwSchedulePlusChatLoginBridgeEnabled";
const CHAT_LOGIN_STATUS_STORAGE_KEY = "otwSchedulePlusChatLoginBridgeStatus";
const PLAYER_OPTIMIZATION_STORAGE_KEY =
  "otw:schedule-plus:multiview:player-optimization-enabled";
const CHAT_LOGIN_COOKIE_PERMISSION = {
  origins: ["https://nid.naver.com/*"],
  permissions: ["cookies"],
};
const INJECT_BRIDGE_ACTIVE_TAB_KIND = "OTW_EXTENSION_INJECT_BRIDGE_ACTIVE_TAB";
const CHAT_LOGIN_SETTING_CHANGED_KIND =
  "OTW_EXTENSION_CHAT_LOGIN_SETTING_CHANGED";
const CHAT_LOGIN_STATUS_LABELS = {
  disabled: "꺼짐",
  enabled: "켜짐",
  needs_login: "로그인 필요",
  permission_missing: "권한 필요",
  unsupported: "지원 안 됨",
  error: "오류",
};
const CHAT_LOGIN_STATUSES = new Set(Object.keys(CHAT_LOGIN_STATUS_LABELS));
const CHAT_LOGIN_TRANSIENT_FAILURE_STATUSES = new Set(["unsupported"]);

const setText = (id, value) => {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
};

const setStatusText = (id, value, enabled) => {
  const element = document.getElementById(id);
  if (!element) return;

  element.textContent = value;
  element.classList.toggle("off", !enabled);
};

const setStatus = (id, enabled) => {
  setStatusText(id, enabled ? "켜짐" : "꺼짐", enabled);
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

const normalizeChatLoginStatus = (value) =>
  typeof value === "string" && CHAT_LOGIN_STATUSES.has(value) ? value : null;

const renderChatLoginStatus = (status) => {
  const normalizedStatus = normalizeChatLoginStatus(status) ?? "disabled";

  setStatusText(
    "chat-status",
    CHAT_LOGIN_STATUS_LABELS[normalizedStatus],
    normalizedStatus === "enabled",
  );
  setToggle("chat-login-toggle", normalizedStatus === "enabled");
  setChatPermissionButtonVisible(normalizedStatus === "permission_missing");
};

const getDisplayChatLoginStatus = (enabled, storedStatus, permissionGranted) => {
  if (!enabled) return "disabled";
  if (!permissionGranted) return "permission_missing";
  if (
    storedStatus &&
    !CHAT_LOGIN_TRANSIENT_FAILURE_STATUSES.has(storedStatus)
  ) {
    return storedStatus;
  }
  return "enabled";
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
      [CHAT_LOGIN_STATUS_STORAGE_KEY]: "disabled",
      [PLAYER_OPTIMIZATION_STORAGE_KEY]: true,
    },
    (items) => {
      const chatLoginEnabled = items[CHAT_LOGIN_STORAGE_KEY] === true;
      const storedChatLoginStatus = normalizeChatLoginStatus(
        items[CHAT_LOGIN_STATUS_STORAGE_KEY],
      );
      const playerOptimizationEnabled =
        items[PLAYER_OPTIMIZATION_STORAGE_KEY] !== false;

      setStatus("player-status", playerOptimizationEnabled);
      setToggle("player-optimization-toggle", playerOptimizationEnabled);

      hasChatLoginPermission((granted) => {
        renderChatLoginStatus(
          getDisplayChatLoginStatus(
            chatLoginEnabled,
            storedChatLoginStatus,
            granted,
          ),
        );
      });
    },
  );
};

const setStorageValues = (values, callback = refreshPopupState) => {
  chrome.storage.local.set(values, callback);
};

const setStorageValue = (key, value, callback = refreshPopupState) => {
  setStorageValues({ [key]: value }, callback);
};

const setChatLoginEnabled = (enabled) => {
  chrome.runtime.sendMessage(
    { kind: CHAT_LOGIN_SETTING_CHANGED_KIND, enabled },
    (response) => {
      if (chrome.runtime.lastError) {
        const status = enabled ? "error" : "disabled";
        const values = {
          [CHAT_LOGIN_STATUS_STORAGE_KEY]: status,
        };

        if (!enabled) values[CHAT_LOGIN_STORAGE_KEY] = false;
        setStorageValues(values);
        return;
      }

      const status =
        normalizeChatLoginStatus(response?.status) ??
        (enabled ? "error" : "disabled");

      setStorageValue(CHAT_LOGIN_STATUS_STORAGE_KEY, status);
    },
  );
};

const manifest = chrome.runtime.getManifest();
setText("extension-version", `Version ${manifest.version}`);

chrome.runtime.sendMessage({ kind: INJECT_BRIDGE_ACTIVE_TAB_KIND }, () => {
  void chrome.runtime.lastError;
});

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
      setChatLoginEnabled(false);
      return;
    }

    const enable = () => setChatLoginEnabled(true);

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

    chrome.permissions.request(CHAT_LOGIN_COOKIE_PERMISSION, (granted) => {
      if (granted) setChatLoginEnabled(true);
      else refreshPopupState();
    });
  });

refreshPopupState();
