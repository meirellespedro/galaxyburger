const { isKvStorageConfigured, kvGetJSON, kvSetJSON } = require("./_kv-storage");

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

// Contador de janela fixa por IP no Redis. Se o Redis não estiver
// configurado ou falhar, a checagem é ignorada (nunca bloqueia pedido
// real por causa de um problema de storage) — mesma filosofia do
// rate limit já existente no login do painel administrativo.
async function assertRateLimitNotExceeded(req, { scope, maxAttempts, windowSeconds, createError }) {
  if (!isKvStorageConfigured()) {
    return;
  }

  const key = `hamburgeria:rate-limit:${scope}:${getClientIp(req)}`;
  let record = null;

  try {
    record = await kvGetJSON(key);
  } catch {
    return;
  }

  const currentCount = Number(record?.count) || 0;

  if (currentCount >= maxAttempts) {
    throw createError();
  }

  try {
    await kvSetJSON(key, { count: currentCount + 1 }, { expireInSeconds: windowSeconds });
  } catch {
    // Não crítico: se o registro falhar, a próxima requisição tenta de novo.
  }
}

module.exports = {
  assertRateLimitNotExceeded,
  getClientIp
};
