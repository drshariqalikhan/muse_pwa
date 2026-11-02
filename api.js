// api.js — single place for all backend calls.
// Step 1: no backend yet. These functions are stubs that will be replaced
// in BUILD.md Step 4–5 with Supabase + Edge Function calls.
// They keep the same function names / shapes so chat.js does not change later.
import { config } from "./config.js";
import { isBrowserLLMActive, chatWithBrowserLLM } from "./webllm.js";

export async function listConversations() {
  // TODO Step 5: Supabase query, ordered by updated_at DESC
  return [];
}

export async function sendChatMessage(conversationId, message, priorHistory) {
  // SIDE EXPERIMENT (webllm.js): if a browser LLM is loaded and the
  // user has enabled it, replies come from that on-device model.
  // This is not the planned Step 4–5 backend, and it never runs
  // unless the user loads the model and ticks the checkbox.
  if (isBrowserLLMActive()) {
    try {
      const reply = await chatWithBrowserLLM(message, priorHistory);
      return {
        conversation_id: conversationId,
        reply: reply,
        tokens_approx: Math.ceil(reply.length / 4),
        context_messages_used: 0,
        summarised: false,
      };
    } catch (e) {
      return {
        conversation_id: conversationId,
        reply: "[browser LLM error] " + (e && e.message ? e.message : "failed") + " — reload the model, or untick 'Use browser LLM' to go back to placeholders.",
        tokens_approx: 0,
        context_messages_used: 0,
        summarised: false,
      };
    }
  }
  // TODO Step 4–5: POST to Edge Function /functions/v1/chat
  // Step 1 placeholder reply, clearly marked, no backend involved.
  void config;
  void conversationId;
  return {
    conversation_id: conversationId,
    reply: "[placeholder — Step 1, no backend yet] You said: " + message,
    tokens_approx: Math.ceil(message.length / 4),
    context_messages_used: 0,
    summarised: false,
  };
}

export async function checkHealth() {
  // TODO Step 7: Edge Function health + Supabase read + Gemini check
  return { frontend: "pass", supabase: "not implemented", edge: "not implemented", gemini: "not implemented" };
}
