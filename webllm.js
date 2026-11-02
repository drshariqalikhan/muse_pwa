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

// Default model, changed 2 Nov 2026 at Shariq's decision to work
// with Gemma: Gemma 2 2B is now the default, not Llama 1B.
export const BROWSER_LLM_MODEL = "gemma-2-2b-it-q4f32_1-MLC";

// Model selector (added 2 Nov 2026 after the Llama 1B model kept
// inventing defaults in PICO JSON). All three IDs are from WebLLM's
// prebuilt model list, q4f32_1 quantisation (no shader-f16 needed).
// - Llama 3.2 1B: current default, ~1.1 GB VRAM, smallest/fastest.
// - Qwen 2.5 1.5B (Alibaba): similar size to Llama 1B, often
//   stronger at instruction-following / JSON.
// - Hermes 3 8B (Nous Research, Llama 3.1 8B base): much stronger
//   instruction-following, but a ~5 GB download and ~5-6 GB VRAM —
//   only for a strong desktop GPU, and a long first load.
export const BROWSER_LLM_MODELS = [
  { id: "Llama-3.2-1B-Instruct-q4f32_1-MLC", label: "Llama 3.2 1B (small, fast)" },
  { id: "Qwen2.5-1.5B-Instruct-q4f32_1-MLC", label: "Qwen 2.5 1.5B (Alibaba)" },
  { id: "Hermes-3-Llama-3.1-8B-q4f32_1-MLC", label: "Hermes 3 8B (Nous Research, large)" },
  // Added 2 Nov 2026 from developer-forum recommendations for
  // structured JSON / extraction, all WebLLM prebuilt q4f32_1:
  // Llama 3.2 3B (~2 GB, good balance), Phi-3.5-mini (Microsoft,
  // ~2 GB, extraction/function-calling family), Gemma 2 2B (Google,
  // ~1.5 GB, used in a schema-constrained browser JSON example).
  { id: "Llama-3.2-3B-Instruct-q4f32_1-MLC", label: "Llama 3.2 3B (balanced)" },
  { id: "Phi-3.5-mini-instruct-q4f32_1-MLC", label: "Phi-3.5-mini (Microsoft)" },
  { id: "gemma-2-2b-it-q4f32_1-MLC", label: "Gemma 2 2B (Google)" },
];

let selectedModelId = BROWSER_LLM_MODEL;

export function getBrowserLLMModel() {
  return selectedModelId;
}

export function setBrowserLLMModel(id) {
  if (BROWSER_LLM_MODELS.some((m) => m.id === id)) {
    selectedModelId = id;
    return true;
  }
  return false;
}

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

// Proper JSON Schema for WebLLM's schema-constrained decoding
// (added 2 Nov 2026 for the constrained-JSON Gemma test). Passed as
// response_format { type: "json_object", schema: JSON.stringify(...) }
// in PICO mode only, so the engine masks any token that would break
// the shape — the reply must be a JSON object with exactly these
// six keys, with null allowed for any unstated PICO component.
// This guarantees shape, not truth: a model can still emit an
// invented string value, which is why the code validation below
// (no-defaults, missing_fields, clarification) still runs.
export const PICO_JSON_SCHEMA = {
  type: "object",
  properties: {
    population: { type: ["string", "null"] },
    intervention: { type: ["string", "null"] },
    comparison: { type: ["string", "null"] },
    outcome: { type: ["string", "null"] },
    missing_fields: { type: "array", items: { type: "string" } },
    clarification_question: { type: ["string", "null"] },
  },
  required: [
    "population",
    "intervention",
    "comparison",
    "outcome",
    "missing_fields",
    "clarification_question",
  ],
  additionalProperties: false,
};

// Shortened 2 Nov 2026 for speed: the previous prompt was ~450
// words, and every word is re-processed (prefill) on every turn,
// which is a large share of the ~60-170s reply times seen with
// Qwen/Gemma. This version keeps only the rules the code cannot
// enforce itself; clarification wording and confirmed-field
// preservation are now enforced in code below, not by the prompt.
const PICO_SYSTEM_PROMPT =
  "You are a PICO parser, not a medical advisor. Do NOT answer the clinical question. " +
  "Parse only what is stated into JSON matching exactly this schema, no other text, no fences: " +
  '{"population": string|null, "intervention": string|null, "comparison": string|null, ' +
  '"outcome": string|null, "missing_fields": [string], "clarification_question": string|null}. ' +
  "Use null for any component not stated; never infer a diagnosis, comparator, dose, or outcome. " +
  "Never default population to adults or to people with the outcome; a symptom alone is an outcome, not a population. " +
  "Never default comparison to placebo; comparison is null unless a comparator is explicitly named (compared with, versus, vs, placebo, control, or another treatment). " +
  "Never copy question wording into comparison. " +
  "If the user explicitly says there is no comparator (nothing, none, no comparison), set comparison to \"none\", not null. " +
  "If history contains a previous PICO JSON and the user is supplying missing information, update that JSON and keep previously stated fields. " +
  "A new question about a different intervention or outcome starts a NEW PICO; do not carry fields from an unrelated earlier question. " +
  "Example: In adults with atrial fibrillation, does apixaban compared with warfarin reduce stroke? " +
  '-> {"population": "adults with atrial fibrillation", "intervention": "apixaban", ' +
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
        await engine.reload(selectedModelId, { initProgressCallback: progressCallback });
        return engine;
      } catch (reloadError) {
        engine = null;
        void reloadError;
      }
    }
    engine = await webllm.CreateMLCEngine(selectedModelId, {
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

export async function chatWithBrowserLLM(text, priorHistory, onChunk) {
  if (!engine) throw new Error("Browser LLM is not loaded yet");
  // Faster: PICO history capped to 6 prior messages (3 exchanges)
  // instead of 10. The last model message already carries the full
  // previous PICO JSON, so confirmed fields are not lost by the cap
  // — and the code preservation below restores them explicitly.
  // Normal chat keeps the full 10.
  const historyLimit = picoMode ? 6 : MAX_PRIOR_MESSAGES;
  const historyMessages = Array.isArray(priorHistory)
    ? priorHistory.slice(-historyLimit).map((m) => ({
        role: m.role === "model" ? "assistant" : "user",
        content: m.content,
      }))
    : [];
  let reply;
  try {
    const request = {
      messages: [
        {
          role: "system",
          content: picoMode ? PICO_SYSTEM_PROMPT : "You are a helpful assistant. Answer concisely.",
        },
        ...historyMessages,
        { role: "user", content: text },
      ],
    };
    // PICO mode only: schema-constrained JSON. In normal chat this
    // is deliberately NOT passed, so normal replies stay prose.
    if (picoMode) {
      request.response_format = {
        type: "json_object",
        schema: JSON.stringify(PICO_JSON_SCHEMA),
      };
    }
    // Faster (perceived): stream tokens as they arrive, so the
    // user sees output in the first seconds instead of waiting for
    // the whole ~60-170s reply. The streamed text is raw model
    // output; the validated PICO JSON below still replaces it at
    // the end. If streaming fails, fall back to non-streaming.
    const streamRequest = async (req) => {
      if (typeof onChunk !== "function") {
        return engine.chat.completions.create(req);
      }
      try {
        const stream = await engine.chat.completions.create({ ...req, stream: true });
        let accumulated = "";
        for await (const chunk of stream) {
          const delta = chunk && chunk.choices && chunk.choices[0] && chunk.choices[0].delta
            ? chunk.choices[0].delta.content || ""
            : "";
          if (delta) {
            accumulated += delta;
            onChunk(accumulated);
          }
        }
        if (!accumulated) return engine.chat.completions.create(req);
        return { choices: [{ message: { content: accumulated } }] };
      } catch (streamError) {
        void streamError;
        return engine.chat.completions.create(req);
      }
    };
    try {
      reply = await streamRequest(request);
    } catch (schemaError) {
      // If this WebLLM build rejects the schema form, fall back to
      // the previous prompt-only path rather than failing the whole
      // reply — and let the caller see the (prompt-only) result, so
      // the fallback is visible in testing instead of hidden.
      if (picoMode && /response_format|schema|grammar|invalid/i.test(schemaError.message || "")) {
        delete request.response_format;
        reply = await streamRequest(request);
      } else {
        throw schemaError;
      }
    }
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
  // 1b. No default inventions, enforced from the user's own words
  // (seen 2 Nov 2026: "will ondansetron reduce nausea" came back
  // with population "adults with nausea" and comparison "placebo",
  // neither of which was stated). A comparator only counts if the
  // user actually used a comparative phrase or named placebo/control
  // or another treatment as the comparator. A population only counts
  // if the user actually described people (patient, adult, child,
  // men/women, an age, elderly, pregnant, etc.); a symptom alone
  // does not describe a population.
  const hasComparatorPhrase = /compared|versus|\bvs\b|placebo|\bcontrol\b|instead of/i.test(text);
  if (!hasComparatorPhrase) parsed.comparison = null;
  const hasPeopleDescription = /patient|people|adult|child|men\b|women\b|elderly|pregnant|\d+\s*(yr|years?|yo)\b|\bold\b/i.test(text);
  if (!hasPeopleDescription) parsed.population = null;
  // 1c. Confirmed-field preservation (the loop fix, 2 Nov 2026):
  // Qwen dropped "adults" and Gemma dropped "elderly" the moment
  // the user answered a different field ("sunlight", "nothing"),
  // because each reply was validated in isolation. Restore a
  // previously confirmed field when the new reply drops it to
  // null, unless the current message looks like a new question
  // (then it is a new PICO and old fields must NOT leak in — that
  // case is covered by the new-chat prompt in chat.js). A new
  // non-null value always wins over the old one (refinements
  // like cancer -> skin cancer, sunlight -> sunlight tanning).
  const looksLikeNewQuestion = /^(do|does|will|can|is|are|should)\b/i.test(text.trim()) ||
    (text.includes("?") && text.split(/\s+/).length >= 4);
  if (!looksLikeNewQuestion && Array.isArray(priorHistory)) {
    let priorPico = null;
    for (let i = priorHistory.length - 1; i >= 0; i--) {
      const msg = priorHistory[i];
      if (!msg || msg.role !== "model" || typeof msg.content !== "string") continue;
      const s = msg.content.indexOf("{");
      const e = msg.content.lastIndexOf("}");
      if (s < 0 || e <= s) continue;
      try {
        const candidate = JSON.parse(msg.content.slice(s, e + 1));
        if (candidate && picoFields.every((f) => f in candidate)) { priorPico = candidate; break; }
      } catch (err) { void err; }
    }
    if (priorPico) {
      picoFields.forEach((f) => {
        if ((parsed[f] == null || parsed[f] === "") && priorPico[f] != null && priorPico[f] !== "") {
          parsed[f] = priorPico[f];
        }
      });
    }
  }
  // 1d. An explicit "no comparator" is an answer, not a missing
  // field (Qwen loop: user said "nothing" and the system looped
  // back to asking for population). Set comparison to "none" so
  // it stops counting as missing.
  if (/^\s*(nothing|none|no(ne)?\s*(comparison|comparator|control)?)\s*[.!?]?\s*$/i.test(text) ||
      /no\s+(comparison|comparator)/i.test(text)) {
    parsed.comparison = "none";
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
    // Enforced clarification (loop fix, 2 Nov 2026): the old rule
    // kept the model's clarification if it was any real question,
    // so Qwen asked about a stated outcome and Gemma asked about
    // cancer type / exposure type while population was missing.
    // Now the clarification is ALWAYS the canned question for the
    // first missing field, so it can never mismatch missing_fields
    // or drift to refining a detail that is already known.
    parsed.clarification_question = clarificationFor(missing[0]);
  }
  void normalise;
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
