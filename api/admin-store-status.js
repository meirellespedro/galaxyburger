const {
  getStoreStatusSnapshot,
  updateStoreStatusOverride
} = require("../lib/_store-status-store");
const {
  createAdminError,
  requireAdminSession
} = require("../lib/_admin-auth");
const { parseJsonBody, sendJsonError } = require("../lib/_http-helpers");

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
    sendJsonError(res, error, {
      routeName: "admin-store-status",
      fallbackMessage: "Nao foi possivel atualizar o status da loja agora."
    });
  }
};

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
