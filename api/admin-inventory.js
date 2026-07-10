const {
  getInventoryCounts,
  getInventorySnapshot,
  setBulkInventoryStatus
} = require("../lib/_inventory-store");
const {
  createAdminError,
  requireAdminSession
} = require("../lib/_admin-auth");
const { parseJsonBody, sendJsonError } = require("../lib/_http-helpers");

module.exports = async function adminInventoryHandler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  try {
    requireAdminSession(req);

    if (req.method === "GET") {
      res.status(200).json(await buildAdminInventoryPayload());
      return;
    }

    if (req.method === "POST") {
      const payload = await parseJsonBody(req);
      const updates = normalizeInventoryUpdates(payload);

      if (!updates.length) {
        throw createAdminError("missing_inventory_updates", "Informe ao menos um produto para atualizar o estoque.", 422);
      }

      const updatedProducts = await setBulkInventoryStatus(updates);

      res.status(200).json({
        ok: true,
        status: "saved",
        updatedProducts,
        ...(await buildAdminInventoryPayload())
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
      routeName: "admin-inventory",
      fallbackMessage: "Nao foi possivel carregar o estoque do painel agora."
    });
  }
};

function normalizeInventoryUpdates(payload = {}) {
  const sourceUpdates = Array.isArray(payload.updates) ? payload.updates : [payload];

  return sourceUpdates
    .map(update => ({
      productId: String(update?.productId || "").trim(),
      available: Boolean(update?.available)
    }))
    .filter(update => update.productId);
}

async function buildAdminInventoryPayload() {
  const snapshot = await getInventorySnapshot();

  return {
    ok: true,
    status: "ready",
    inventory: {
      updatedAt: snapshot.updatedAt,
      storageMode: snapshot.storageMode,
      persistenceConfigured: snapshot.persistenceConfigured,
      storageLabel: snapshot.storageLabel,
      counts: getInventoryCounts(snapshot),
      products: snapshot.products
    }
  };
}
