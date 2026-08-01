/* VELVA — Claude model catalog (canonical prefixes for puter.js). */

const CLAUDE_MODELS = [
  { id: "claude-fable-5",            name: "Claude Fable 5",            tier: "flagship",  smart: true  },
  { id: "claude-opus-5",             name: "Claude Opus 5",             tier: "flagship",  smart: true  },
  { id: "claude-sonnet-5",           name: "Claude Sonnet 5",           tier: "smart",     smart: true  },
  { id: "claude-haiku-5",            name: "Claude Haiku 5",            tier: "fast",      smart: false },
  { id: "claude-opus-4-8",           name: "Claude Opus 4.8",           tier: "smart",     smart: true  },
  { id: "claude-sonnet-4-6",         name: "Claude Sonnet 4.6",         tier: "smart",     smart: true  },
  { id: "claude-opus-4-6",           name: "Claude Opus 4.6",           tier: "smart",     smart: true  },
  { id: "claude-sonnet-4-5",         name: "Claude Sonnet 4.5",         tier: "smart",     smart: true  },
  { id: "claude-opus-4-5",           name: "Claude Opus 4.5",           tier: "smart",     smart: true  },
  { id: "claude-sonnet-4",           name: "Claude Sonnet 4",           tier: "smart",     smart: true  },
  { id: "claude-opus-4",             name: "Claude Opus 4",             tier: "smart",     smart: true  },
  { id: "claude-sonnet-3-7",         name: "Claude Sonnet 3.7",         tier: "smart",     smart: true  },
  { id: "claude-opus-3-5",           name: "Claude Opus 3.5",           tier: "smart",     smart: true  },
  { id: "claude-sonnet-3-5",         name: "Claude Sonnet 3.5",         tier: "smart",     smart: true  },
  { id: "claude-haiku-3-5",          name: "Claude Haiku 3.5",          tier: "fast",      smart: false },
  { id: "claude-3-5-haiku",          name: "Claude 3.5 Haiku",          tier: "fast",      smart: false },
];

const MODEL_PREFIXES = CLAUDE_MODELS.map((m) => m.id);

function getModelById(id) {
  return CLAUDE_MODELS.find((m) => m.id === id) || null;
}

/* Auto / smart routing: pick the best smart model by tier for the task. */
function autoModelFor(task) {
  const kind = (task || "").toLowerCase();
  const candidates = CLAUDE_MODELS.filter((m) => m.smart);
  if (/(code|bug|fix|debug|script|function|api|query|sql|regex)/.test(kind)) {
    const code = candidates.find((m) => m.tier === "flagship") || candidates[0];
    return code;
  }
  if (/(plan|architecture|design|strategy|analy|review)/.test(kind)) {
    const deep = candidates.find((m) => m.tier === "flagship") || candidates[0];
    return deep;
  }
  return getModelById("claude-sonnet-5") || candidates[0];
}

function formatModelTier(tier) {
  return { flagship: "Flagship", smart: "Smart", fast: "Fast" }[tier] || tier;
}

const PRESET_MODEL = "claude-sonnet-5";
