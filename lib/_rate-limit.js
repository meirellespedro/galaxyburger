const { defaultKvAdapter } = require("./_kv-storage");

function normalizeText(value) {
  return String(value || "").trim();
}

function getClientIp(req) {
  const forwardedFor = normalizeText(req?.headers?.["x-forwarded-for"]);
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return normalizeText(req?.socket?.remoteAddress) || "unknown";
}

// Contador de janela fixa por IP no Redis, com INCR atômico: requisições
// simultâneas não escapam do limite e a janela não é renovada a cada tentativa.
// Se o Redis não estiver configurado ou falhar, a checagem é ignorada (nunca
// bloqueia pedido real por causa de um problema de storage) — mesma filosofia
// do rate limit do login do painel administrativo.
async function assertRateLimitNotExceeded(req, {
  scope,
  maxAttempts,
  windowSeconds,
  createError,
  storage = defaultKvAdapter
}) {
  if (!storage.isConfigured()) {
    return;
  }

  const key = `hamburgeria:rate-limit-v2:${scope}:${getClientIp(req)}`;
  let count = 0;

  try {
    count = await storage.incrWithExpiry(key, windowSeconds);
  } catch {
    return;
  }

  if (count > maxAttempts) {
    throw createError();
  }
}

module.exports = {
  assertRateLimitNotExceeded,
  getClientIp
};
