// chat.js — chat rendering + sending logic (in-memory, Step 1)
import { escapeHtml, tokensApprox } from "./context.js";
import { sendChatMessage } from "./api.js";

export function renderMessage(listEl, role, content) {
  const div = document.createElement("div");
  div.className = "message-bubble " + (role === "user" ? "message-user" : "message-model");
  const label = role === "user" ? "You" : "AI";
  const time = new Date().toLocaleTimeString();
  div.innerHTML =
    "<p class=\"message-label\">" + escapeHtml(label) + " · " + escapeHtml(time) +
    (role === "model" ? " · ~" + tokensApprox(content) + " tokens" : "") + "</p>" +
    "<pre><code>" + escapeHtml(content) + "</code></pre>";
  listEl.appendChild(div);
  return div;
}

export function scrollToLatest(listEl, force) {
  // Framework7 shell: the page-content scrolls, the message list no
  // longer scrolls on its own. Scroll whichever one actually scrolls
  // (page-content in the Framework7 shell, listEl in any fallback).
  const pageContent = listEl.closest ? listEl.closest(".page-content") : null;
  if (pageContent && pageContent.scrollHeight > pageContent.clientHeight) {
    const nearBottom = pageContent.scrollHeight - pageContent.scrollTop - pageContent.clientHeight < 200;
    if (force || nearBottom) pageContent.scrollTop = pageContent.scrollHeight;
    return;
  }
  const nearBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 200;
  if (force || nearBottom) {
    listEl.scrollTop = listEl.scrollHeight;
  }
}

export async function handleSend(state, listEl, thinkingEl, sendBtn, inputEl) {
  const text = inputEl.value.trim();
  if (!text || state.isSending) return;
  state.isSending = true;
  sendBtn.disabled = true;
  thinkingEl.classList.remove("is-hidden");
  try {
    if (!state.currentConversationId) {
      // In-memory conversation for Step 1; real persistence in Step 5
      state.currentConversationId = "local-" + Date.now();
      state.conversations.unshift({ id: state.currentConversationId, title: text.slice(0, 50), updated_at: new Date().toISOString() });
    }
    renderMessage(listEl, "user", text);
    document.getElementById("welcome").classList.add("is-hidden");
    inputEl.value = "";
    scrollToLatest(listEl, true);
    const result = await sendChatMessage(state.currentConversationId, text);
    renderMessage(listEl, "model", result.reply);
    scrollToLatest(listEl, true);
  } catch (e) {
    renderMessage(listEl, "model", "Error: " + (e && e.message ? e.message : "send failed") + " — please try again.");
  } finally {
    state.isSending = false;
    sendBtn.disabled = false;
    thinkingEl.classList.add("is-hidden");
  }
}
