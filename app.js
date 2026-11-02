// app.js — main UI wiring, Step 1 scaffold (in-memory only)
import { handleSend, renderMessage } from "./chat.js";
import { renderConversationList, createConversation } from "./history.js";
import { loadBrowserLLM, setBrowserLLMEnabled, setBrowserLLMPicoMode } from "./webllm.js";

// Framework7 shell: panel (sidebar menu), navbar, bottom toolbar,
// system dark theme. darkMode:'auto' follows the device colour scheme,
// so the panel is dark when the rest of the app is dark — the old
// hardcoded-white sidebar is gone. visibleBreakpoint: 769 keeps the
// panel always visible on desktop/tablet widths and a drawer on
// phones; closeByBackdropClick (Framework7 default) is what lets the
// drawer close again by tapping outside it.
let f7 = null;
if (typeof window.Framework7 === "function") {
  f7 = new window.Framework7({
    el: "#app",
    name: "muse_pwa",
    darkMode: "auto",
    panel: { swipe: true, visibleBreakpoint: 769 },
  });
} else {
  console.warn("Framework7 did not load; shell panel/navbar are inactive");
}
function closePanelOnMobile() {
  // On phones the panel is a drawer; close it after a selection so
  // the user lands back on the chat. On desktop the panel is always
  // visible (visibleBreakpoint) and must stay open.
  if (f7 && window.innerWidth < 769) f7.panel.close("left", false);
}

const state = {
  currentConversationId: null,
  conversations: [],
  messages: [],
  isSending: false,
};

const listEl = document.getElementById("message-list");
const thinkingEl = document.getElementById("thinking");
const sendBtn = document.getElementById("send-btn");
const inputEl = document.getElementById("message-input");
const convListEl = document.getElementById("conversation-list");
const noConvEl = document.getElementById("no-conversations");
const titleEl = document.getElementById("conversation-title");
const welcomeEl = document.getElementById("welcome");
const diagnosticsEl = document.getElementById("diagnostics");

function refreshList() {
  renderConversationList(convListEl, noConvEl, state.conversations, state.currentConversationId,
    (id) => openConversation(id),
    (id) => renameConversation(id),
    (id) => deleteConversation(id));
}

function openConversation(id) {
  state.currentConversationId = id;
  // History reset: switching conversations does not restore old
  // messages (Step 1 limitation), so the model's history must reset
  // here too — otherwise a new conversation would inherit the
  // previous conversation's context.
  state.messages = [];
  const c = state.conversations.find((x) => x.id === id);
  titleEl.textContent = c ? c.title : "New chat";
  listEl.innerHTML = "";
  welcomeEl.classList.add("is-hidden");
  diagnosticsEl.classList.add("is-hidden");
  refreshList();
  closePanelOnMobile();
}

function renameConversation(id) {
  const c = state.conversations.find((x) => x.id === id);
  if (!c) return;
  const applyRename = (next) => {
    if (next && next.trim()) {
      c.title = next.trim();
      if (id === state.currentConversationId) titleEl.textContent = c.title;
      refreshList();
    }
  };
  // In-app Framework7 prompt, not window.prompt: a native prompt
  // appears as a computer/browser dialog outside an embedded phone
  // preview (e.g. Responsively), so on a phone preview it looked
  // like Rename did nothing. The Framework7 dialog renders inside
  // the app, on the phone screen itself.
  if (f7 && f7.dialog && typeof f7.dialog.prompt === "function") {
    f7.dialog.prompt("Enter a new name for this conversation", "Rename conversation", applyRename, undefined, c.title);
  } else {
    applyRename(window.prompt("Rename conversation", c.title));
  }
}

function deleteConversation(id) {
  const doDelete = () => {
    state.conversations = state.conversations.filter((x) => x.id !== id);
    if (id === state.currentConversationId) {
      state.currentConversationId = null;
      state.messages = [];
      titleEl.textContent = "New chat";
      listEl.innerHTML = "";
      welcomeEl.classList.remove("is-hidden");
    }
    refreshList();
  };
  // Same native-dialog problem as Rename: window.confirm pops up on
  // the computer, outside the phone preview. Use an in-app
  // Framework7 dialog with an explicit "Are you sure?" + Delete/Cancel.
  if (f7 && f7.dialog && typeof f7.dialog.create === "function") {
    f7.dialog.create({
      title: "Delete chat",
      text: "Are you sure you want to delete this chat?",
      destroyOnClose: true,
      buttons: [
        { text: "Cancel" },
        { text: "Delete", color: "red", strong: true, onClick: doDelete },
      ],
    }).open();
  } else if (window.confirm("Are you sure you want to delete this chat?")) {
    doDelete();
  }
}

document.getElementById("new-chat-btn").addEventListener("click", () => {
  const c = createConversation(state.conversations, "New chat");
  openConversation(c.id);
  welcomeEl.classList.remove("is-hidden");
  listEl.innerHTML = "";
  closePanelOnMobile();
});

document.getElementById("composer").addEventListener("submit", (e) => {
  e.preventDefault();
  diagnosticsEl.classList.add("is-hidden");
  handleSend(state, listEl, thinkingEl, sendBtn, inputEl).then(() => refreshList());
});

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    document.getElementById("composer").requestSubmit();
  }
});

document.querySelectorAll(".example-prompt").forEach((btn) => {
  btn.addEventListener("click", () => {
    inputEl.value = btn.textContent.trim();
    inputEl.focus();
  });
});

// Browser LLM side experiment (webllm.js). Load is explicit and
// one-off: nothing is downloaded and no model runs until the user
// clicks this button, and replies only switch to the model once the
// checkbox below is ticked (it is ticked automatically on a
// successful load). Unticking returns to placeholder replies.
const llmLoadBtn = document.getElementById("browser-llm-load-btn");
const llmStatusEl = document.getElementById("browser-llm-status");
const llmEnabledEl = document.getElementById("browser-llm-enabled");
const llmPicoEl = document.getElementById("browser-llm-pico");
if (llmLoadBtn && llmStatusEl && llmEnabledEl) {
  llmLoadBtn.addEventListener("click", async () => {
    llmLoadBtn.disabled = true;
    llmLoadBtn.textContent = "Loading browser LLM…";
    llmStatusEl.textContent = "Loading browser LLM… first load downloads the model, this can take a few minutes; a reload uses the cached model and is faster.";
    try {
      await loadBrowserLLM((text, progress) => {
        llmStatusEl.textContent = text + (progress != null ? " — " + Math.round(progress * 100) + "%" : "");
      });
      llmStatusEl.textContent = "Browser LLM ready — replies now use the on-device model.";
      llmEnabledEl.disabled = false;
      llmEnabledEl.checked = true;
      setBrowserLLMEnabled(true);
      if (llmPicoEl) llmPicoEl.disabled = false;
      // The button MUST stay enabled after a successful load: the
      // old code disabled it permanently ("Browser LLM loaded"),
      // so after the engine was disposed there was no way to load
      // it again except refreshing the page. Now it becomes Reload.
      llmLoadBtn.disabled = false;
      llmLoadBtn.textContent = "Reload browser LLM";
    } catch (e) {
      llmStatusEl.textContent = "Browser LLM failed: " + (e && e.message ? e.message : "load failed");
      llmLoadBtn.disabled = false;
      llmLoadBtn.textContent = "Load browser LLM";
    }
  });
  llmEnabledEl.addEventListener("change", () => {
    setBrowserLLMEnabled(llmEnabledEl.checked);
    if (!llmEnabledEl.checked) llmStatusEl.textContent = "Browser LLM loaded, but replies are placeholders (unticked).";
  });
  if (llmPicoEl) {
    llmPicoEl.addEventListener("change", () => {
      setBrowserLLMPicoMode(llmPicoEl.checked);
    });
  }
}

document.getElementById("diagnostics-link").addEventListener("click", (e) => {
  e.preventDefault();
  diagnosticsEl.classList.remove("is-hidden");
  welcomeEl.classList.add("is-hidden");
  closePanelOnMobile();
});

// No sidebar-toggle handler here any more: the ☰ link in the navbar
// has Framework7's panel-open class, which opens the panel, and the
// panel's backdrop (or panel-close) closes it. The old handler that
// toggled .sidebar-open is what trapped the drawer open.

// Portrait lock for phones. Installed PWAs use manifest
// "orientation": "portrait"; in a browser, screen.orientation.lock()
// only works in fullscreen, so it is best-effort here, and the overlay
// below is the visible lock: phone-sized landscape windows get a
// "rotate back to portrait" screen, which hides again on portrait.
// Phone-sized = landscape, short side <= 600px, long side <= 1024px.
// That covers phones (e.g. iPhone 17 landscape 852x393) and excludes
// tablets (iPad Mini landscape is 1024x768) and desktops.
const portraitLockEl = document.getElementById("portrait-lock");
function updateOrientationLock() {
  if (!portraitLockEl) return;
  const isPhoneLandscape =
    window.innerWidth > window.innerHeight &&
    window.innerHeight <= 600 &&
    window.innerWidth <= 1024;
  if (isPhoneLandscape) {
    portraitLockEl.classList.add("portrait-lock-show");
    portraitLockEl.setAttribute("aria-hidden", "false");
    if (window.screen && window.screen.orientation && typeof window.screen.orientation.lock === "function") {
      window.screen.orientation.lock("portrait").catch(() => {});
    }
  } else {
    portraitLockEl.classList.remove("portrait-lock-show");
    portraitLockEl.setAttribute("aria-hidden", "true");
  }
}
window.addEventListener("resize", updateOrientationLock);
window.addEventListener("orientationchange", updateOrientationLock);
updateOrientationLock();

refreshList();
void renderMessage;
