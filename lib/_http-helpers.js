function createHttpError(code, message, statusCode = 500, extra = {}) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  Object.assign(error, extra);
  return error;
}

async function parseJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string" && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      throw createHttpError("invalid_json", "JSON inválido no corpo da requisição.", 400);
    }
  }

  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw createHttpError("invalid_json", "JSON inválido no corpo da requisição.", 400);
  }
}

function isKnownDomainError(error) {
  return Boolean(error?.code) && Number.isFinite(Number(error?.statusCode));
}

function sendJsonError(res, error, { routeName = "", fallbackMessage = "Não foi possível concluir a operação agora." } = {}) {
  const knownError = isKnownDomainError(error);
  const statusCode = knownError ? Number(error.statusCode) : 500;
  const code = error?.code || "internal_error";

  if (!knownError || statusCode >= 500) {
    console.error(`[api${routeName ? `:${routeName}` : ""}]`, code, error?.message, error?.stack || "");
  }

  if (res.headersSent) {
    return;
  }

  res.status(statusCode).json({
    ok: false,
    status: error?.status || "error",
    code,
    message: knownError ? (error.message || fallbackMessage) : fallbackMessage,
    ...(error?.officialAddress ? { officialAddress: error.officialAddress } : {})
  });
}

module.exports = {
  createHttpError,
  isKnownDomainError,
  parseJsonBody,
  sendJsonError
};
