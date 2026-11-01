// history.js — conversation list, in-memory for Step 1.
// Real Supabase persistence in BUILD.md Step 5. Same function names later.
import { escapeHtml } from "./context.js";

export function renderConversationList(listEl, noEl, conversations, currentId, onOpen, onRename, onDelete) {
  listEl.innerHTML = "";
  noEl.classList.toggle("is-hidden", conversations.length > 0);
  conversations.forEach((c) => {
    const li = document.createElement("li");
    li.className = "conversation-item" + (c.id === currentId ? " is-active" : "");
    const openBtn = document.createElement("button");
    openBtn.className = "button is-light is-small is-fullwidth has-text-left mb-1";
    openBtn.textContent = c.title || "New chat";
    openBtn.addEventListener("click", () => onOpen(c.id));
    const renameBtn = document.createElement("button");
    renameBtn.className = "button is-small mr-1";
    renameBtn.textContent = "Rename";
    renameBtn.addEventListener("click", () => onRename(c.id));
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "button is-small is-danger is-light";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => onDelete(c.id));
    li.appendChild(openBtn);
    const row = document.createElement("div");
    row.appendChild(renameBtn);
    row.appendChild(deleteBtn);
    li.appendChild(row);
    listEl.appendChild(li);
  });
  void escapeHtml;
}

export function createConversation(conversations, title) {
  const c = { id: "local-" + Date.now(), title: title || "New chat", updated_at: new Date().toISOString() };
  conversations.unshift(c);
  return c;
}
