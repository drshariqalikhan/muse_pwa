// webllm.js — SIDE EXPERIMENT, not part of BUILD.md Steps 2–9.
// Runs a small LLM entirely in the browser with MLC WebLLM (WebGPU),
// so chat replies come from a model on the device — no Supabase,
// no Edge Function, no Gemini key, no server. The placeholder reply
// in api.js stays the default; this only takes over once a model has
// been loaded AND the user has ticked "Use browser LLM".
//
// The WebLLM library itself is NOT in the repo: it is imported on
// demand (dynamic import) the first time the user clicks "Load
// browser LLM", so a normal page load is unchanged if the user never
// tries the experiment, and a CDN failure cannot break the scaffold.
// Model: Llama-3.2-1B-Instruct, q4f32_1 quantisation. The q4f32_1
// variant is deliberate: it does not need the shader-f16 WebGPU
// feature, so it runs on more devices than f16 models. First load
// downloads the model weights (hundreds of MB) and caches them in
// the browser, so later loads are much faster. WebGPU requires a
// secure context (localhost or https) and a WebGPU-capable browser
// (Chrome/Edge on desktop is the safe bet; Safari support varies).

export const BROWSER_LLM_MODEL = "Llama-3.2-1B-Instruct-q4f32_1-MLC";

let engine = null;
let enabled = false;
let loading = false;

export function isBrowserLLMReady() {
  return engine !== null;
}

export function isBrowserLLMActive() {
  return enabled && engine !== null;
}

export function setBrowserLLMEnabled(value) {
  enabled = !!value;
}

export async function loadBrowserLLM(onProgress) {
  if (engine) return engine;
  if (loading) throw new Error("Browser LLM is already loading");
  if (!navigator.gpu) {
    throw new Error("WebGPU is not available in this browser — try Chrome or Edge on a desktop");
  }
  loading = true;
  try {
    // Pinned version, from WebLLM's own CDN example usage.
    const webllm = await import("https://esm.run/@mlc-ai/web-llm@0.2.85");
    engine = await webllm.CreateMLCEngine(BROWSER_LLM_MODEL, {
      initProgressCallback: (report) => {
        if (onProgress) onProgress(report.text, report.progress);
      },
    });
    return engine;
  } finally {
    loading = false;
  }
}

export async function chatWithBrowserLLM(text) {
  if (!engine) throw new Error("Browser LLM is not loaded yet");
  const reply = await engine.chat.completions.create({
    messages: [
      { role: "system", content: "You are a helpful assistant. Answer concisely." },
      { role: "user", content: text },
    ],
  });
  const content = reply && reply.choices && reply.choices[0] && reply.choices[0].message
    ? reply.choices[0].message.content
    : "";
  if (!content) throw new Error("Browser LLM returned an empty reply");
  return content;
}
