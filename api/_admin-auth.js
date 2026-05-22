const { createHash, createHmac, timingSafeEqual } = require("crypto");

const ADMIN_SESSION_COOKIE_NAME = "gb_admin_session";
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_DEV_ADMIN_PASSWORD = "galaxy-admin-local";
const DEFAULT_DEV_ADMIN_SECRET = "galaxy-admin-local-secret";

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

  if (isProductionRuntime()) {
    throw createAdminError(
      "missing_admin_password",
      "A senha do painel administrativo ainda não foi configurada no servidor.",
      500
    );
  }

  return DEFAULT_DEV_ADMIN_PASSWORD;
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

  if (isProductionRuntime()) {
    throw createAdminError(
      "missing_admin_session_secret",
      "O painel administrativo ainda não foi configurado corretamente no servidor.",
      500
    );
  }

  return DEFAULT_DEV_ADMIN_SECRET;
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

function requireAdminSession(req) {
  const session = getAdminSession(req);
  if (!session) {
    throw createAdminError("admin_unauthorized", "Faça login para acessar o painel administrativo.", 401);
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
  clearAdminSessionCookie,
  createAdminError,
  getAdminSession,
  requireAdminSession,
  setAdminSessionCookie,
  validateAdminPassword
};
