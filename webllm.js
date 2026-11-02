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
  "Comparison rule: comparison is null unless the question explicitly names a comparator " +
  "with a comparative phrase such as compared with, versus, vs, placebo, or control, or " +
  "names another treatment as the thing being compared against. NEVER copy the question " +
  "wording, or a question sentence, into comparison. A question sentence is not a comparator. " +
  "Population rule: population is null if the current question does not state who the " +
  "patients are, even if an earlier question in the history mentioned a population. " +
  "Clarification rule: clarification_question must be a NEW question asking for missing " +
  "information. It must NEVER restate or repeat the user's question. " +
  "New-topic rule: a new question about a different intervention or outcome starts a NEW " +
  "PICO. Do not carry population, intervention, comparison, or outcome from an earlier, " +
  "unrelated question in the history into the new PICO, unless the user message is clearly " +
  "answering a clarification question (for example, just a comparator name) or explicitly " +
  "says same patient or same population. " +
  "If the conversation history contains a previous PICO JSON and the user is supplying " +
  "missing information, update that JSON with the new information and keep the previously " +
  "stated fields, instead of starting over. " +
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

// Chat history for the browser LLM (added 2 Nov 2026, after the
// PICO clarification problem: without history, a follow-up answer
// like "warfarin" meant nothing, because the model never saw the
// original apixaban question). History is the prior messages of the
// CURRENT conversation only, oldest first, each {role, content}
// with role "user" or "model". It is capped to the last 10 prior
// messages (5 exchanges) so a small 1B model is not swamped, and so
// a long chat does not blow up the context. The current message is
// appended after the history, never duplicated from it.
const MAX_PRIOR_MESSAGES = 10;

export async function chatWithBrowserLLM(text, priorHistory) {
  if (!engine) throw new Error("Browser LLM is not loaded yet");
  const historyMessages = Array.isArray(priorHistory)
    ? priorHistory.slice(-MAX_PRIOR_MESSAGES).map((m) => ({
        role: m.role === "model" ? "assistant" : "user",
        content: m.content,
      }))
    : [];
  let reply;
  try {
    reply = await engine.chat.completions.create({
      messages: [
        {
          role: "system",
          content: picoMode ? PICO_SYSTEM_PROMPT : "You are a helpful assistant. Answer concisely.",
        },
        ...historyMessages,
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
  let parsed;
  try {
    parsed = JSON.parse(content.slice(start, end + 1));
  } catch (e) {
    void e;
    return content;
  }
  // Code validation, because a small model does not reliably hold
  // the prompt rules on its own (seen 2 Nov 2026: comparison copied
  // from the question wording, clarification restating the question,
  // and a population carried over from an unrelated earlier question).
  // These checks fix the mechanically detectable failures instead of
  // trusting the model's missing_fields / clarification_question.
  const picoFields = ["population", "intervention", "comparison", "outcome"];
  // 1. A question sentence is never a comparator. Examples seen:
  // "will apixaban reduce stroke risk in", "do statins cause headaches?"
  if (typeof parsed.comparison === "string") {
    const c = parsed.comparison.trim();
    if (c.includes("?") || /^(do|does|will|can|is|are|should)\b/i.test(c) || /reduce stroke risk in$/i.test(c)) {
      parsed.comparison = null;
    }
  }
  // 2. missing_fields must exactly match the null fields.
  const missing = picoFields.filter((f) => parsed[f] == null || parsed[f] === "");
  picoFields.forEach((f) => {
    if (parsed[f] == null || parsed[f] === "") parsed[f] = null;
  });
  parsed.missing_fields = missing;
  // 3. Clarification must be a real question for missing information,
  // never a restatement of the user's question, and null when complete.
  const normalise = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const clarificationFor = (field) => {
    if (field === "population") return "Who are the patients in this question?";
    if (field === "intervention") return "What intervention are you asking about?";
    if (field === "comparison") return "What is the intervention being compared with?";
    if (field === "outcome") return "What outcome are you asking about?";
    return "What information is missing from this question?";
  };
  if (missing.length === 0) {
    parsed.clarification_question = null;
  } else {
    // Keep the model's clarification only if it is a real question
    // and not just the user's question restated (normalise strips
    // case/punctuation, so "Do statins cause headaches?" matches
    // "do statins cause headaches"). Otherwise ask for the first
    // missing field.
    const q = typeof parsed.clarification_question === "string" ? parsed.clarification_question.trim() : "";
    if (!q.endsWith("?") || normalise(q) === normalise(text)) {
      parsed.clarification_question = clarificationFor(missing[0]);
    }
  }
  return JSON.stringify(
    {
      population: parsed.population ?? null,
      intervention: parsed.intervention ?? null,
      comparison: parsed.comparison ?? null,
      outcome: parsed.outcome ?? null,
      missing_fields: parsed.missing_fields,
      clarification_question: parsed.clarification_question,
    },
    null,
    2
  );
}
