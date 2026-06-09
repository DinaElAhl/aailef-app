// ─────────────────────────────────────────────────────────────────────────────
// Claude API client (bring-your-own-key, browser-direct)
//
// The user supplies their own Anthropic API key, which is kept only in their
// browser (localStorage) and sent directly to api.anthropic.com. The
// `anthropic-dangerous-direct-browser-access` header is required for the
// browser to be allowed to call the API at all; it is acceptable here because
// each user uses their OWN key — no shared secret is ever exposed.
//
// Robustness comes from Structured Outputs: we pass a JSON Schema via
// `output_config.format`, so the model is constrained to return valid,
// parseable JSON in the exact shape we expect. No fragile ```json stripping.
// ─────────────────────────────────────────────────────────────────────────────

import { AXES, ERRORS, API_VERSION, MODEL, NO_ERROR } from "./aailef.js";

const ENDPOINT = "https://api.anthropic.com/v1/messages";

// JSON Schema for the evaluation result. Note the constraints supported by
// Anthropic structured outputs: `additionalProperties: false` is required on
// every object, and numeric ranges are expressed via `enum` (min/max are not
// supported), so scores are pinned to the integers 1–5.
function buildSchema() {
  const axisSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      score: { type: "integer", enum: [1, 2, 3, 4, 5] },
      reason: { type: "string" },
      error: { type: "string", enum: [...ERRORS.map((e) => e.id), NO_ERROR] },
    },
    required: ["score", "reason", "error"],
  };

  const scoreProps = {};
  for (const ax of AXES) scoreProps[ax.id] = axisSchema;

  return {
    type: "object",
    additionalProperties: false,
    properties: {
      scores: {
        type: "object",
        additionalProperties: false,
        properties: scoreProps,
        required: AXES.map((a) => a.id),
      },
      summary: { type: "string" },
      recommendations: { type: "array", items: { type: "string" } },
    },
    required: ["scores", "summary", "recommendations"],
  };
}

// Stable system prompt describing the framework and the rubric. Kept frozen
// (no per-request interpolation) so prompt caching stays effective.
function buildSystem() {
  const axesBlock = AXES.map(
    (ax) =>
      `${ax.id} — ${ax.name} (${ax.name_en}) [الوزن ×${ax.weight}]: ${ax.guide}`
  ).join("\n");

  const errorBlock = [
    "E1 = خطأ كتابي/إملائي",
    "E2 = خطأ تشكيل/غموض",
    "E3 = خطأ صرفي",
    "E4 = خطأ نحوي/تركيبي",
    "E5 = خطأ دلالي",
    "E6 = خطأ سياقي",
    "E7 = خطأ في السجل اللغوي",
    "E8 = خطأ مصطلحي",
    "E9 = خطأ في أداء المهمة",
  ].join("، ");

  return `أنت مُقيّم لغوي عربي خبير، متخصص في تقييم مخرجات أنظمة الذكاء الاصطناعي وفق إطار AAILEF (إطار تقييم المخرجات اللغوية العربية للذكاء الاصطناعي).

ستقيّم النص المُعطى عبر عشرة محاور، وتمنح كل محور درجة صحيحة من 1 إلى 5 (1 = ضعيف جداً، 5 = ممتاز)، مع سبب موجز ومحدد بالعربية يستند إلى دليل من النص، ورمز الخطأ الأبرز إن وُجد.

المحاور العشرة ومعايير منحها:
${axesBlock}

رموز الأخطاء: ${errorBlock}.
في حقل "error" لكل محور: ضع رمز الخطأ الأبرز المرتبط بذلك المحور (مثل "E5") إن وُجد خطأ فعلي، وإلا ضع "${NO_ERROR}".

التزم بالموضوعية: استند إلى أدلة من النص، ولا تُجامل ولا تُقسُ بلا مبرر. اجعل حقل "reason" لكل محور جملة واحدة موجزة تستشهد بدليل محدد من النص. واجعل "summary" تقييماً عاماً موجزاً (2–4 جمل)، و"recommendations" قائمة من 2 إلى 4 توصيات عملية لتحسين النص.`;
}

function buildUserPrompt({ text, task, reg }) {
  return `قيّم النص العربي التالي وفق إطار AAILEF.

السجل اللغوي المطلوب: ${reg}
نوع المهمة: ${task}

النص المراد تقييمه (مخرج النظام الذكي):
"""
${text}
"""`;
}

// Translate an HTTP/network failure into a clear Arabic message.
function arabicError(status, type) {
  if (status === 401) return "مفتاح API غير صالح أو منتهٍ. تأكدي من المفتاح في الإعدادات.";
  if (status === 403) return "المفتاح لا يملك صلاحية الوصول إلى النموذج المطلوب.";
  if (status === 404) return "معرّف النموذج غير صحيح. تأكدي من تحديث التطبيق.";
  if (status === 429) return "تم تجاوز حد الطلبات. انتظري قليلاً ثم أعيدي المحاولة.";
  if (status === 413) return "النص طويل جداً. اختصريه ثم أعيدي المحاولة.";
  if (status >= 500) return "خطأ مؤقت في خدمة Claude. أعيدي المحاولة بعد لحظات.";
  if (type === "network")
    return "تعذّر الاتصال. تحقّقي من الإنترنت — وقد يكون المفتاح غير صحيح (يمنع المتصفح رؤية التفاصيل).";
  return "حدث خطأ غير متوقع أثناء التقييم. أعيدي المحاولة.";
}

/**
 * Evaluate a text with the AAILEF rubric.
 * @returns {Promise<{scores, summary, recommendations}>}
 * @throws  {Error} with an Arabic, user-facing message.
 */
export async function evaluate({ apiKey, text, task, reg, deepReasoning = true }) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("أدخلي مفتاح Anthropic API في الإعدادات أولاً.");
  }

  const body = {
    model: MODEL,
    // Generous ceiling: max_tokens caps thinking + output together, so adaptive
    // thinking across 10 axes needs headroom to avoid truncating the JSON.
    // 16000 is the safe non-streaming default.
    max_tokens: 16000,
    system: buildSystem(),
    messages: [{ role: "user", content: buildUserPrompt({ text, task, reg }) }],
    output_config: {
      format: { type: "json_schema", schema: buildSchema() },
      effort: "high", // pin depth for consistent, reproducible scoring
    },
  };
  if (deepReasoning) body.thinking = { type: "adaptive" };

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey.trim(),
        "anthropic-version": API_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(arabicError(0, "network"));
  }

  if (!res.ok) {
    let detail = "";
    try {
      const errJson = await res.json();
      detail = errJson?.error?.message || "";
    } catch {
      /* ignore */
    }
    const msg = arabicError(res.status);
    throw new Error(detail ? `${msg} (${detail})` : msg);
  }

  const data = await res.json();

  if (data?.stop_reason === "refusal") {
    throw new Error("رفض النموذج تقييم هذا النص. جرّبي نصاً آخر.");
  }

  if (data?.stop_reason === "max_tokens") {
    throw new Error("لم يكتمل التقييم لأن المخرجات تجاوزت الحد المسموح. اختصري النص ثم أعيدي المحاولة.");
  }

  // With structured outputs, the first text block is guaranteed valid JSON
  // matching our schema. (Thinking blocks, if any, precede it.)
  const textBlock = (data.content || []).find((b) => b.type === "text");
  if (!textBlock?.text) {
    throw new Error("لم يُرجع النموذج نتيجة قابلة للقراءة. أعيدي المحاولة.");
  }

  let parsed;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new Error("تعذّرت قراءة نتيجة التقييم. أعيدي المحاولة.");
  }
  return parsed;
}
