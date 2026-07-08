const {
  getStoreStatusSnapshot,
  updateStoreStatusOverride
} = require("../lib/_store-status-store");
const {
  createAdminError,
  requireAdminSession
} = require("../lib/_admin-auth");

module.exports = async function adminStoreStatusHandler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  try {
    requireAdminSession(req);

    if (req.method === "GET") {
      res.status(200).json(await buildAdminStoreStatusPayload());
      return;
    }

    if (req.method === "POST" || req.method === "PUT") {
      const payload = await parseJsonBody(req);
      const overrideMode = String(payload.overrideMode || payload.mode || "").trim();

      if (!overrideMode) {
        throw createAdminError("missing_store_status_override_mode", "Informe se a loja deve abrir, fechar ou seguir o horario automatico.", 422);
      }

      await updateStoreStatusOverride(overrideMode);

      res.status(200).json({
        ok: true,
        status: "saved",
        ...(await buildAdminStoreStatusPayload())
      });
      return;
    }

    res.status(405).json({
      ok: false,
      code: "method_not_allowed",
      message: "Metodo nao suportado."
    });
  } catch (error) {
    res.status(Number(error.statusCode || 500)).json({
      ok: false,
      code: error.code || "admin_store_status_failed",
      message: error.message || "Nao foi possivel atualizar o status da loja agora."
    });
  }
};

function parseJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return Promise.resolve(req.body);
  }

  if (typeof req.body === "string" && req.body.trim()) {
    try {
      return Promise.resolve(JSON.parse(req.body));
    } catch {
      throw createAdminError("invalid_json", "JSON invalido no corpo da requisicao.", 400);
    }
  }

  return (async () => {
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
      throw createAdminError("invalid_json", "JSON invalido no corpo da requisicao.", 400);
    }
  })();
}

async function buildAdminStoreStatusPayload() {
  const snapshot = await getStoreStatusSnapshot();

  return {
    ok: true,
    status: "ready",
    storeStatus: {
      updatedAt: snapshot.updatedAt,
      storageMode: snapshot.storageMode,
      persistenceConfigured: snapshot.persistenceConfigured,
      storageLabel: snapshot.storageLabel,
      overrideMode: snapshot.overrideMode
    }
  };
}
