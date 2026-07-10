const { createHash, createHmac, timingSafeEqual } = require("crypto");
const { isKvStorageConfigured, kvGetJSON, kvSetJSON } = require("./_kv-storage");

const ADMIN_SESSION_COOKIE_NAME = "gb_admin_session";
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 8;
const LOGIN_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function createAdminError(code, message, statusCode = 401) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.status = "error";
  return error;
}

function isProductionRuntime() {
  return String(process.env.VERCEL || "") === "1"
    || Boolean(process.env.VERCEL_ENV)
    || normalizeText(process.env.NODE_ENV).toLowerCase() === "production";
}

function secureCompare(leftValue, rightValue) {
  const leftHash = createHash("sha256").update(String(leftValue || "")).digest();
  const rightHash = createHash("sha256").update(String(rightValue || "")).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function getAdminPassword() {
  const configuredPassword = normalizeText(process.env.ADMIN_PANEL_PASSWORD);

  if (configuredPassword) {
    return configuredPassword;
  }

  throw createAdminError(
    "missing_admin_password",
    "A senha do painel administrativo ainda nao foi configurada neste ambiente.",
    500
  );
}

function getAdminSessionSecret() {
  const configuredSecret = normalizeText(
    process.env.ADMIN_PANEL_SECRET
    || process.env.ORDER_TICKET_SECRET
    || process.env.DELIVERY_QUOTE_SECRET
  );

  if (configuredSecret) {
    return configuredSecret;
  }

  throw createAdminError(
    "missing_admin_session_secret",
    "O painel administrativo ainda nao foi configurado corretamente neste ambiente.",
    500
  );
}

function validateAdminPassword(password) {
  const candidatePassword = normalizeText(password);
  if (!candidatePassword) {
    return false;
  }

  return secureCompare(candidatePassword, getAdminPassword());
}

function signAdminSessionToken() {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + ADMIN_SESSION_TTL_MS;
  const payload = `${issuedAt}.${expiresAt}`;
  const signature = createHmac("sha256", getAdminSessionSecret()).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

function verifyAdminSessionToken(token) {
  const [issuedAtRaw, expiresAtRaw, receivedSignature] = String(token || "").split(".");
  const issuedAt = Number(issuedAtRaw);
  const expiresAt = Number(expiresAtRaw);

  if (!issuedAtRaw || !expiresAtRaw || !receivedSignature) {
    return null;
  }

  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    return null;
  }

  const payload = `${issuedAtRaw}.${expiresAtRaw}`;
  const expectedSignature = createHmac("sha256", getAdminSessionSecret()).update(payload).digest("hex");

  if (!secureCompare(receivedSignature, expectedSignature)) {
    return null;
  }

  return {
    issuedAt,
    expiresAt
  };
}

function parseCookies(cookieHeader) {
  return String(cookieHeader || "")
    .split(";")
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((cookies, chunk) => {
      const separatorIndex = chunk.indexOf("=");
      if (separatorIndex <= 0) {
        return cookies;
      }

      const key = chunk.slice(0, separatorIndex).trim();
      const value = chunk.slice(separatorIndex + 1).trim();
      if (key) {
        cookies[key] = decodeURIComponent(value);
      }

      return cookies;
    }, {});
}

function getClientIp(req) {
  const forwardedFor = normalizeText(req?.headers?.["x-forwarded-for"]);
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return normalizeText(req?.socket?.remoteAddress) || "unknown";
}

function buildLoginRateLimitKey(ip) {
  return `hamburgeria:admin-login-attempts:${ip}`;
}

async function assertLoginRateLimitNotExceeded(req) {
  if (!isKvStorageConfigured()) {
    return;
  }

  let record = null;

  try {
    record = await kvGetJSON(buildLoginRateLimitKey(getClientIp(req)));
  } catch {
    return;
  }

  if (record && Number(record.count) >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS) {
    throw createAdminError(
      "admin_login_rate_limited",
      "Muitas tentativas de login. Aguarde alguns minutos antes de tentar novamente.",
      429
    );
  }
}

async function registerFailedLoginAttempt(req) {
  if (!isKvStorageConfigured()) {
    return;
  }

  const key = buildLoginRateLimitKey(getClientIp(req));

  try {
    const record = await kvGetJSON(key);
    const nextCount = (Number(record?.count) || 0) + 1;
    await kvSetJSON(key, { count: nextCount }, { expireInSeconds: LOGIN_RATE_LIMIT_WINDOW_SECONDS });
  } catch {
    // A falha já foi registrada em kvGetJSON/kvSetJSON; não deve travar o login.
  }
}

async function clearLoginRateLimit(req) {
  if (!isKvStorageConfigured()) {
    return;
  }

  try {
    await kvSetJSON(buildLoginRateLimitKey(getClientIp(req)), { count: 0 }, { expireInSeconds: 60 });
  } catch {
    // Não crítico: se a limpeza falhar, o contador expira sozinho pelo TTL.
  }
}

function getRequestSessionToken(req) {
  const authHeader = normalizeText(req?.headers?.authorization);
  if (/^Bearer\s+/i.test(authHeader)) {
    return authHeader.replace(/^Bearer\s+/i, "").trim();
  }

  const cookies = parseCookies(req?.headers?.cookie);
  return normalizeText(cookies[ADMIN_SESSION_COOKIE_NAME]);
}

function getAdminSession(req) {
  return verifyAdminSessionToken(getRequestSessionToken(req));
}

function assertTrustedRequestOrigin(req) {
  const host = normalizeText(req?.headers?.host);
  const candidate = normalizeText(req?.headers?.origin) || normalizeText(req?.headers?.referer);

  if (!host || !candidate) {
    return;
  }

  let candidateHost = "";
  try {
    candidateHost = new URL(candidate).host;
  } catch {
    return;
  }

  if (candidateHost !== host) {
    throw createAdminError("admin_untrusted_origin", "Requisição bloqueada por origem não confiável.", 403);
  }
}

function requireAdminSession(req) {
  const session = getAdminSession(req);
  if (!session) {
    throw createAdminError("admin_unauthorized", "Faca login para acessar o painel administrativo.", 401);
  }

  if (req?.method && req.method !== "GET" && req.method !== "HEAD") {
    assertTrustedRequestOrigin(req);
  }

  return session;
}

function buildCookieAttributes(req, maxAgeSeconds) {
  const secure = String(req?.headers?.["x-forwarded-proto"] || "").toLowerCase() === "https" || isProductionRuntime();
  return [
    `Max-Age=${Math.max(0, Math.round(maxAgeSeconds))}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : ""
  ].filter(Boolean).join("; ");
}

function setAdminSessionCookie(res, req) {
  const token = signAdminSessionToken();
  const cookie = [
    `${ADMIN_SESSION_COOKIE_NAME}=${token}`,
    buildCookieAttributes(req, ADMIN_SESSION_TTL_MS / 1000)
  ].filter(Boolean).join("; ");
  res.setHeader("Set-Cookie", cookie);
  return token;
}

function clearAdminSessionCookie(res, req) {
  const expiredCookie = [
    `${ADMIN_SESSION_COOKIE_NAME}=`,
    buildCookieAttributes(req, 0)
  ].filter(Boolean).join("; ");
  res.setHeader("Set-Cookie", expiredCookie);
}

module.exports = {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_TTL_MS,
  assertLoginRateLimitNotExceeded,
  clearAdminSessionCookie,
  clearLoginRateLimit,
  createAdminError,
  getAdminSession,
  registerFailedLoginAttempt,
  requireAdminSession,
  setAdminSessionCookie,
  validateAdminPassword
};
