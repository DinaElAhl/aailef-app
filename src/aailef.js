// ─────────────────────────────────────────────────────────────────────────────
// AAILEF — Arabic AI Linguistic Evaluation Framework
// إطار تقييم المخرجات اللغوية العربية للذكاء الاصطناعي
//
// This module is the single source of truth for the framework: the ten axes,
// their weights, the error taxonomy, the grading bands, and the scoring math.
// The UI and the Claude prompt are both derived from the data defined here.
// ─────────────────────────────────────────────────────────────────────────────

export const API_VERSION = "2023-06-01";
export const MODEL = "claude-opus-4-8";

// The ten evaluation axes. `guide` is extra scoring guidance sent to the model
// so its 1–5 judgement is consistent and reproducible across runs.
export const AXES = [
  {
    id: "A1",
    name: "سلامة الكتابة",
    name_en: "Orthographic Integrity",
    weight: 1.0,
    color: "#475569",
    desc: "الإملاء، الهمزات، التاء المربوطة، الترقيم، اتصال الحروف.",
    guide:
      "قيّم صحة الإملاء ورسم الهمزات والتاء المربوطة/المفتوحة والألف المقصورة وعلامات الترقيم. 5 = خالٍ من الأخطاء، 3 = أخطاء قليلة لا تعيق الفهم، 1 = أخطاء إملائية متكررة تعيق القراءة.",
  },
  {
    id: "A2",
    name: "التشكيل والغموض",
    name_en: "Diacritics & Ambiguity",
    weight: 1.5,
    color: "#2563AB",
    desc: "تمييز المعنى بغياب التشكيل، إزالة الغموض الدلالي WSD.",
    guide:
      "قيّم قدرة النص على إزالة الغموض الناتج عن غياب التشكيل، وصحة أي تشكيل مستخدم. 5 = لا لبس في المعنى المقصود، 3 = غموض محدود يُحَلّ من السياق، 1 = غموض يُربك القارئ أو تشكيل خاطئ.",
  },
  {
    id: "A3",
    name: "الاتساق الصرفي",
    name_en: "Morphological Consistency",
    weight: 1.5,
    color: "#2563AB",
    desc: "صحة الاشتقاق، اتساق اللمّة، منع الصيغ الشاذة.",
    guide:
      "قيّم صحة الاشتقاق والأوزان الصرفية واتساق الجموع والمصادر. 5 = صرف سليم متسق، 3 = هفوات صرفية قليلة، 1 = صيغ شاذة أو اشتقاقات خاطئة.",
  },
  {
    id: "A4",
    name: "المطابقة النحوية",
    name_en: "Grammatical Agreement",
    weight: 1.0,
    color: "#475569",
    desc: "التذكير/التأنيث، المفرد/الجمع، توافق الفعل والفاعل.",
    guide:
      "قيّم المطابقة في التذكير والتأنيث والعدد بين الفعل والفاعل والصفة والموصوف. 5 = مطابقة تامة، 3 = خطأ مطابقة عرضي، 1 = أخطاء مطابقة متكررة.",
  },
  {
    id: "A5",
    name: "سلامة التركيب",
    name_en: "Syntactic Well-formedness",
    weight: 1.0,
    color: "#475569",
    desc: "ترتيب الجملة، الروابط، الخلو من التراكيب المترجمة حرفياً.",
    guide:
      "قيّم سلامة بناء الجملة وترتيب عناصرها وصحة الروابط، وخلوّها من التراكيب المترجمة حرفياً (calque). 5 = تركيب عربي سليم، 3 = تراكيب ثقيلة لكنها مفهومة، 1 = جمل مفككة أو مترجمة حرفياً.",
  },
  {
    id: "A6",
    name: "وضوح المعنى",
    name_en: "Semantic Clarity",
    weight: 1.5,
    color: "#2563AB",
    desc: "المعنى مفهوم بلا لبس، لا تناقض داخلي، لا تعميم مُخل.",
    guide:
      "قيّم وضوح المعنى وخلوّه من التناقض الداخلي أو التعميم المُخل. 5 = معنى واضح متماسك، 3 = وضوح جزئي مع لبس بسيط، 1 = معنى غامض أو متناقض.",
  },
  {
    id: "A7",
    name: "الحساسية للسياق",
    name_en: "Context Sensitivity",
    weight: 2.0,
    color: "#B45309",
    desc: "التمييز الدقيق بين السياق الاجتماعي والطبي/العلمي.",
    guide:
      "قيّم ملاءمة النص للسياق المطلوب (طبي/علمي مقابل اجتماعي/عام) ودقّة التمييز بينها. 5 = ملائم تماماً للسياق، 3 = ملاءمة عامة مع هفوة سياقية، 1 = خلط بين السياقات يُغيّر المعنى.",
  },
  {
    id: "A8",
    name: "ثبات السجل اللغوي",
    name_en: "Register & Dialect Control",
    weight: 1.5,
    color: "#2563AB",
    desc: "الالتزام بالمستوى اللغوي المطلوب (فصحى/عامية).",
    guide:
      "قيّم التزام النص بالسجل المطلوب (فصحى أكاديمية، فصحى مبسطة، عامية…) دون انزلاق غير مقصود بين المستويات. 5 = ثبات تام على السجل، 3 = انزلاق محدود عن السجل، 1 = تذبذب يُخالف المطلوب.",
  },
  {
    id: "A9",
    name: "دقة المصطلح",
    name_en: "Terminological Accuracy",
    weight: 2.0,
    color: "#B45309",
    desc: "المصطلح العربي المعتمد، تجنب الترجمة الحرفية المُخِلَّة.",
    guide:
      "قيّم استخدام المصطلحات العربية المعتمدة (خصوصاً الطبية/العلمية) وتجنّب الترجمة الحرفية المُخِلّة. 5 = مصطلحات دقيقة معتمدة، 3 = مصطلح غير معتمد لكنه مفهوم، 1 = مصطلحات خاطئة أو مترجمة حرفياً.",
  },
  {
    id: "A10",
    name: "جودة أداء المهمة",
    name_en: "Task Performance Quality",
    weight: 2.0,
    color: "#B45309",
    desc: "النجاح الكامل في تحقيق الهدف الوظيفي للمهمة.",
    guide:
      "قيّم مدى تحقيق النص للهدف الوظيفي للمهمة المطلوبة (تلخيص/إجابة/ترجمة…) بصرف النظر عن اللغة وحدها. 5 = حقّق الهدف بالكامل، 3 = حقّقه جزئياً، 1 = أخفق في المهمة.",
  },
];

// Error taxonomy — each axis maps to a recognised error class.
export const ERRORS = [
  { id: "E1", label: "كتابي/إملائي" },
  { id: "E2", label: "تشكيل/غموض" },
  { id: "E3", label: "صرفي" },
  { id: "E4", label: "نحوي/تركيبي" },
  { id: "E5", label: "دلالي" },
  { id: "E6", label: "سياقي" },
  { id: "E7", label: "سجل لغوي" },
  { id: "E8", label: "مصطلحي" },
  { id: "E9", label: "أداء المهمة" },
];

export const NO_ERROR = "لا يوجد";

// Grading bands applied to a 1–5 score.
export function grade(s) {
  if (s >= 4.5) return { label: "ممتاز ✨", color: "#059669", bg: "#ECFDF5", border: "#6EE7B7" };
  if (s >= 3.5) return { label: "جيد جداً", color: "#1D4ED8", bg: "#EFF6FF", border: "#93C5FD" };
  if (s >= 2.5) return { label: "جيد", color: "#D97706", bg: "#FFFBEB", border: "#FCD34D" };
  if (s >= 1.5) return { label: "مقبول", color: "#EA580C", bg: "#FFF7ED", border: "#FDBA74" };
  return { label: "ضعيف", color: "#DC2626", bg: "#FEF2F2", border: "#FCA5A5" };
}

// Weighted scoring.
//   LQ (Language Quality)  = weighted average of axes A1–A9, expressed on a 1–5 scale.
//   TQ (Task Quality)      = the A10 score directly.
//   Overall                = 0.7 · LQ + 0.3 · TQ.
// Returns numbers (not strings) so the caller controls formatting/rounding once.
export function computeScores(scores) {
  let weighted = 0;
  let maxWeighted = 0;
  for (const ax of AXES.slice(0, 9)) {
    const s = scores?.[ax.id]?.score || 0;
    weighted += s * ax.weight;
    maxWeighted += 5 * ax.weight;
  }
  const lq = maxWeighted > 0 ? (weighted / maxWeighted) * 5 : 0;
  const tq = scores?.A10?.score || 0;
  const overall = 0.7 * lq + 0.3 * tq;
  return {
    lq: round2(lq),
    tq: round2(tq),
    overall: round2(overall),
  };
}

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// True when an axis result carries a flagged error (not the "no error" sentinel).
export function hasError(errorValue) {
  return Boolean(errorValue) && errorValue !== NO_ERROR && errorValue !== "—";
}
