// app.js — main UI wiring, Step 1 scaffold (in-memory only)
import { handleSend, renderMessage } from "./chat.js";
import { renderConversationList, createConversation } from "./history.js";

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
  const c = state.conversations.find((x) => x.id === id);
  titleEl.textContent = c ? c.title : "New chat";
  listEl.innerHTML = "";
  welcomeEl.classList.add("is-hidden");
  diagnosticsEl.classList.add("is-hidden");
  refreshList();
}

function renameConversation(id) {
  const c = state.conversations.find((x) => x.id === id);
  if (!c) return;
  const next = window.prompt("Rename conversation", c.title);
  if (next && next.trim()) {
    c.title = next.trim();
    if (id === state.currentConversationId) titleEl.textContent = c.title;
    refreshList();
  }
}

function deleteConversation(id) {
  if (!window.confirm("Delete this conversation?")) return;
  state.conversations = state.conversations.filter((x) => x.id !== id);
  if (id === state.currentConversationId) {
    state.currentConversationId = null;
    titleEl.textContent = "New chat";
    listEl.innerHTML = "";
    welcomeEl.classList.remove("is-hidden");
  }
  refreshList();
}

document.getElementById("new-chat-btn").addEventListener("click", () => {
  const c = createConversation(state.conversations, "New chat");
  openConversation(c.id);
  welcomeEl.classList.remove("is-hidden");
  listEl.innerHTML = "";
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

document.getElementById("diagnostics-link").addEventListener("click", (e) => {
  e.preventDefault();
  diagnosticsEl.classList.remove("is-hidden");
  welcomeEl.classList.add("is-hidden");
});

document.getElementById("sidebar-toggle").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("sidebar-open");
});

refreshList();
void renderMessage;
