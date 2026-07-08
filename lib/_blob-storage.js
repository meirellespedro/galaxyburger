const BLOB_READ_WRITE_TOKEN_ENV_KEY = "BLOB_READ_WRITE_TOKEN";
const BLOB_STORE_ID_ENV_KEY = "BLOB_STORE_ID";
const VERCEL_OIDC_TOKEN_ENV_KEY = "VERCEL_OIDC_TOKEN";
const REQUIRED_BLOB_SDK_METHODS = ["put", "get", "del", "head", "list"];

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function hasBlobReadWriteToken() {
  return Boolean(normalizeText(process.env[BLOB_READ_WRITE_TOKEN_ENV_KEY]));
}

function hasBlobOidcToken() {
  return Boolean(normalizeText(process.env[VERCEL_OIDC_TOKEN_ENV_KEY]));
}

function hasBlobStoreId() {
  return Boolean(normalizeText(process.env[BLOB_STORE_ID_ENV_KEY]));
}

function hasBlobOidcCredentials() {
  return hasBlobOidcToken() && hasBlobStoreId();
}

function hasBlobStorageConfigured() {
  return hasBlobOidcCredentials() || hasBlobReadWriteToken();
}

function decodeJwtPayload(token) {
  const payload = normalizeText(token).split(".")[1];
  if (!payload) {
    return null;
  }

  try {
    const normalizedPayload = payload
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(payload.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(normalizedPayload, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function getOidcTokenDiagnostics() {
  const payload = decodeJwtPayload(process.env[VERCEL_OIDC_TOKEN_ENV_KEY]);
  const expiresAtMs = Number(payload?.exp || 0) * 1000;

  return {
    oidcTokenHasPayload: Boolean(payload),
    oidcTokenEnvironment: normalizeText(payload?.environment),
    oidcTokenProject: normalizeText(payload?.project),
    oidcTokenExpired: Boolean(expiresAtMs && Date.now() >= expiresAtMs)
  };
}

function getBlobAuthDiagnostics() {
  const authMode = hasBlobOidcCredentials()
    ? "oidc"
    : hasBlobReadWriteToken()
      ? "read_write_token"
      : "none";

  return {
    authMode,
    hasBlobReadWriteToken: hasBlobReadWriteToken(),
    hasBlobStoreId: hasBlobStoreId(),
    hasVercelOidcToken: hasBlobOidcToken(),
    ...getOidcTokenDiagnostics()
  };
}

function sanitizeBlobError(error) {
  return {
    name: normalizeText(error?.name),
    code: normalizeText(error?.code),
    status: normalizeText(error?.status),
    statusCode: Number(error?.statusCode || error?.status || 0) || undefined,
    message: normalizeText(error?.message).slice(0, 300)
  };
}

function resolveBlobUpstreamStatus(error) {
  const explicitStatus = Number(error?.statusCode || error?.status || 0);
  if (Number.isFinite(explicitStatus) && explicitStatus >= 100) {
    return explicitStatus;
  }

  const blobModule = tryLoadBlobModuleSync();
  if (blobModule) {
    if (error instanceof blobModule.BlobNotFoundError) return 404;
    if (error instanceof blobModule.BlobAccessError) return 403;
    if (error instanceof blobModule.BlobStoreNotFoundError) return 404;
    if (error instanceof blobModule.BlobStoreSuspendedError) return 403;
    if (error instanceof blobModule.BlobServiceRateLimited) return 429;
  }

  const message = normalizeText(error?.message);
  const match = message.match(/\b(401|403|404|409|429|500|502|503|504)\b/);
  return match ? Number(match[1]) : 0;
}

function logBlobStorageEvent(level, eventName, details = {}) {
  const logger = typeof console[level] === "function" ? console[level] : console.log;
  logger(`[blob-storage] ${eventName}`, {
    ...details,
    auth: getBlobAuthDiagnostics()
  });
}

function tryLoadBlobModuleSync() {
  try {
    return require("@vercel/blob");
  } catch {
    return null;
  }
}

async function getBlobSdk(createStorageError, missingSdkCode, missingSdkMessage) {
  if (!hasBlobStorageConfigured()) {
    return null;
  }

  let blob;
  try {
    blob = require("@vercel/blob");
  } catch (error) {
    logBlobStorageEvent("error", "sdk_missing", {
      error: sanitizeBlobError(error)
    });
    throw createStorageError(missingSdkCode, missingSdkMessage, 500);
  }

  const missingMethods = REQUIRED_BLOB_SDK_METHODS.filter(method => typeof blob[method] !== "function");
  if (missingMethods.length) {
    logBlobStorageEvent("error", "sdk_incompatible", {
      missingMethods,
      installedVersion: getInstalledBlobSdkVersion()
    });
    throw createStorageError(
      missingSdkCode,
      `${missingSdkMessage} (versao instalada do @vercel/blob nao possui: ${missingMethods.join(", ")}). Atualize a dependencia para a versao mais recente.`,
      500
    );
  }

  return blob;
}

function getInstalledBlobSdkVersion() {
  try {
    // eslint-disable-next-line global-require
    return require("@vercel/blob/package.json").version;
  } catch {
    return "unknown";
  }
}

function buildBlobRuntimeError(code, message, statusCode) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  return err;
}

async function resolveBlobSdkOrThrow() {
  const blob = await getBlobSdk(
    (code, msg, status) => buildBlobRuntimeError(code, msg, status),
    "blob_sdk_missing",
    "Vercel Blob SDK is not available"
  );

  if (!blob) {
    throw buildBlobRuntimeError("blob_not_configured", "Vercel Blob is not configured", 503);
  }

  return blob;
}

async function blobPut(pathname, content, options = {}) {
  const blob = await resolveBlobSdkOrThrow();
  const { access, addRandomSuffix, allowOverwrite, contentType, cacheControlMaxAge, ...rest } = options;

  return blob.put(pathname, content, {
    ...rest,
    access: access || "private",
    addRandomSuffix: addRandomSuffix !== undefined ? addRandomSuffix : false,
    allowOverwrite: allowOverwrite !== undefined ? allowOverwrite : true,
    contentType: contentType || "application/json",
    cacheControlMaxAge: cacheControlMaxAge || 3600
  });
}

async function blobGet(pathname, options = {}) {
  const blob = await resolveBlobSdkOrThrow();
  const { access, useCache, ...rest } = options;

  return blob.get(pathname, {
    ...rest,
    access: access || "private",
    // Reads back a value that was just written moments ago (admin edits),
    // so we bypass the CDN edge cache to avoid serving stale config for
    // up to `cacheControlMaxAge` seconds after a save.
    useCache: useCache !== undefined ? useCache : false
  });
}

async function blobHead(urlOrPathname, options = {}) {
  const blob = await resolveBlobSdkOrThrow();
  return blob.head(urlOrPathname, options);
}

async function blobDel(urlOrPathname, options = {}) {
  const blob = await resolveBlobSdkOrThrow();
  return blob.del(urlOrPathname, options);
}

async function blobList(options = {}) {
  const blob = await resolveBlobSdkOrThrow();
  return blob.list(options);
}

function createBlobStorageAccessError(error, {
  createStorageError,
  codePrefix,
  operation,
  pathname,
  fallbackMessage
}) {
  const upstreamStatus = resolveBlobUpstreamStatus(error);
  const isAuthFailure = upstreamStatus === 401 || upstreamStatus === 403;

  logBlobStorageEvent("error", `${codePrefix}_${operation}_failed`, {
    operation,
    pathname,
    upstreamStatus,
    error: sanitizeBlobError(error)
  });

  if (isAuthFailure) {
    return createStorageError(
      `${codePrefix}_blob_access_forbidden`,
      "O Vercel Blob recusou o acesso ao arquivo privado. Verifique se o Blob Store esta conectado ao projeto correto e se as credenciais do Blob (BLOB_READ_WRITE_TOKEN ou VERCEL_OIDC_TOKEN + BLOB_STORE_ID) pertencem a esse store.",
      503
    );
  }

  return createStorageError(
    `${codePrefix}_blob_unavailable`,
    fallbackMessage || "Nao foi possivel acessar o Vercel Blob agora.",
    503
  );
}

module.exports = {
  BLOB_READ_WRITE_TOKEN_ENV_KEY,
  BLOB_STORE_ID_ENV_KEY,
  VERCEL_OIDC_TOKEN_ENV_KEY,
  blobDel,
  blobGet,
  blobHead,
  blobList,
  blobPut,
  createBlobStorageAccessError,
  getBlobAuthDiagnostics,
  getBlobSdk,
  getInstalledBlobSdkVersion,
  hasBlobStorageConfigured,
  logBlobStorageEvent,
  resolveBlobUpstreamStatus,
  sanitizeBlobError
};
