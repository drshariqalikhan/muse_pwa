// context.js — frontend display helpers only.
// The authoritative context-window logic lives in the Edge Function
// shared module (SPEC §7, BUILD Step 3). Do NOT duplicate that algorithm here.
// This file only provides the same token estimate formula for display.
export function tokensApprox(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
