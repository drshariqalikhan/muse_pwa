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

// PICO JSON schema for the PICO mode below. Fixed fields only:
// population, intervention, comparison, outcome, plus two fields
// that carry the incomplete case inside the JSON itself, so the
// output is always parseable JSON: missing_fields (what was not
// stated) and clarification_question (what to ask for next, or
// null when nothing is missing).
export const PICO_SCHEMA = {
  population: "string|null",
  intervention: "string|null",
  comparison: "string|null",
  outcome: "string|null",
  missing_fields: ["string"],
  clarification_question: "string|null",
};

const PICO_SYSTEM_PROMPT =
  "You are a PICO parser for evidence-based medicine. You do NOT give medical advice " +
  "and you do NOT answer the clinical question. You only parse the user's question into " +
  "PICO components. Output ONLY valid JSON, no other text and no markdown fences, " +
  "matching exactly this schema: " +
  '{"population": string|null, "intervention": string|null, "comparison": string|null, ' +
  '"outcome": string|null, "missing_fields": [string], "clarification_question": string|null}. ' +
  "Rules: use only information stated in the question; do not infer a diagnosis, comparator, " +
  "dose, or outcome that is not stated. Use null for any PICO component not stated. " +
  "List every missing required component (population, intervention, comparison, outcome) " +
  "in missing_fields. If any component is missing, set clarification_question to a single " +
  "question asking for the most important missing information. If nothing is missing, " +
  "clarification_question is null. " +
  "Example input: In adults with atrial fibrillation, does apixaban compared with warfarin reduce stroke? " +
  'Example output: {"population": "adults with atrial fibrillation", "intervention": "apixaban", ' +
  '"comparison": "warfarin", "outcome": "stroke", "missing_fields": [], "clarification_question": null}';

let engine = null;
let enabled = false;
let picoMode = false;
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

export function setBrowserLLMPicoMode(value) {
  picoMode = !!value;
}

export function isBrowserLLMPicoMode() {
  return picoMode;
}

export async function loadBrowserLLM(onProgress) {
  if (loading) throw new Error("Browser LLM is already loading");
  if (!navigator.gpu) {
    throw new Error("WebGPU is not available in this browser — try Chrome or Edge on a desktop");
  }
  loading = true;
  try {
    // Pinned version, from WebLLM's own CDN example usage.
    const webllm = await import("https://esm.run/@mlc-ai/web-llm@0.2.85");
    const progressCallback = (report) => {
      if (onProgress) onProgress(report.text, report.progress);
    };
    if (engine) {
      // Reload path (this is the fix for the 2 Nov 2026 bug where the
      // Load button did nothing after a first successful load, and
      // did nothing again after the engine was disposed): try the
      // engine's own reload first, and if that fails because the
      // engine was disposed, create a fresh engine instead. The
      // model weights are cached in the browser, so a reload is
      // much faster than the first download.
      try {
        await engine.reload(BROWSER_LLM_MODEL, { initProgressCallback: progressCallback });
        return engine;
      } catch (reloadError) {
        engine = null;
        void reloadError;
      }
    }
    engine = await webllm.CreateMLCEngine(BROWSER_LLM_MODEL, {
      initProgressCallback: progressCallback,
    });
    return engine;
  } finally {
    loading = false;
  }
}

export async function chatWithBrowserLLM(text) {
  if (!engine) throw new Error("Browser LLM is not loaded yet");
  let reply;
  try {
    reply = await engine.chat.completions.create({
      messages: [
        {
          role: "system",
          content: picoMode ? PICO_SYSTEM_PROMPT : "You are a helpful assistant. Answer concisely.",
        },
        { role: "user", content: text },
      ],
    });
  } catch (e) {
    // A disposed/unloaded engine must not stay stuck as "ready":
    // clear it so the next Load click creates a fresh engine
    // instead of retrying a dead one.
    if (e && /disposed|not loaded/i.test(e.message || "")) engine = null;
    throw e;
  }
  const content = reply && reply.choices && reply.choices[0] && reply.choices[0].message
    ? reply.choices[0].message.content
    : "";
  if (!content) throw new Error("Browser LLM returned an empty reply");
  if (!picoMode) return content;
  // PICO mode: the reply must be JSON. If the model wrapped it in
  // extra text or fences despite the prompt, extract the first
  // {...} block and pretty-print it, so the chat bubble shows clean
  // JSON. If it is not JSON at all, return the raw reply so the
  // failure is visible instead of silently inventing JSON.
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) return content;
  try {
    return JSON.stringify(JSON.parse(content.slice(start, end + 1)), null, 2);
  } catch (e) {
    void e;
    return content;
  }
}
