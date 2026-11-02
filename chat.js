// chat.js — chat rendering + sending logic (in-memory, Step 1)
import { escapeHtml, tokensApprox } from "./context.js";
import { sendChatMessage } from "./api.js";
import { isBrowserLLMPicoMode } from "./webllm.js";

// New-patient / new-question prompt (PICO mode only, added 2 Nov
// 2026 after history leakage: a statins question in the same chat
// as an apixaban question inherited "adults with atrial
// fibrillation" as its population). The app cannot reliably know
// from the model whether the user means a new patient, so it asks
// the user instead — before sending — whenever the next message
// looks like a new clinical question rather than an answer to a
// clarification question.
// Follow-up answers are usually short statements with no question
// mark ("compared with warfarin", "adults with high cholesterol"),
// so they do NOT prompt. New questions do prompt when they:
// - explicitly mention a new/another/different patient, or
// - are phrased as a question (start with do/does/will/can/is/are/
//   should, or contain "?" with at least 4 words).
export function shouldPromptNewChat(text, messages) {
  if (!isBrowserLLMPicoMode()) return false;
  if (!Array.isArray(messages) || messages.length === 0) return false;
  const t = text.trim();
  if (!t) return false;
  if (/new patient|another patient|different patient|new case|another case/i.test(t)) return true;
  if (/^(do|does|will|can|is|are|should)\b/i.test(t)) return true;
  if (t.includes("?") && t.split(/\s+/).length >= 4) return true;
  return false;
}

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
    // Chat history for the model: the prior messages of this
    // conversation only (state.messages is reset on open/new
    // conversation in app.js, and switching conversations does not
    // restore old messages — Step 1 limitation — so history can
    // never leak from another conversation). The current message
    // is NOT in priorHistory; webllm.js appends it after history.
    const priorHistory = Array.isArray(state.messages) ? [...state.messages] : [];
    state.messages.push({ role: "user", content: text });
    // Streaming (2 Nov 2026 speed fix): if the browser LLM streams
    // partial replies, show them live in one bubble instead of
    // waiting for the full reply, then replace its content with
    // the final validated reply (PICO validation runs at the end).
    // Placeholders and errors never stream, so they still render
    // as a single bubble below.
    let streamingBubble = null;
    let streamingCodeEl = null;
    const onChunk = (partial) => {
      if (!streamingBubble) {
        streamingBubble = renderMessage(listEl, "model", partial);
        streamingCodeEl = streamingBubble.querySelector("code");
        thinkingEl.classList.add("is-hidden");
      } else if (streamingCodeEl) {
        streamingCodeEl.textContent = partial;
      }
      scrollToLatest(listEl, true);
    };
    const result = await sendChatMessage(state.currentConversationId, text, priorHistory, onChunk);
    if (streamingBubble && streamingCodeEl) {
      streamingCodeEl.textContent = result.reply;
    } else {
      renderMessage(listEl, "model", result.reply);
    }
    state.messages.push({ role: "model", content: result.reply });
    scrollToLatest(listEl, true);
  } catch (e) {
    renderMessage(listEl, "model", "Error: " + (e && e.message ? e.message : "send failed") + " — please try again.");
  } finally {
    state.isSending = false;
    sendBtn.disabled = false;
    thinkingEl.classList.add("is-hidden");
  }
}
