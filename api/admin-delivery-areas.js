const {
  createDeliveryArea,
  deleteDeliveryArea,
  getDeliveryAreaCounts,
  getDeliveryAreasSnapshot,
  updateDeliveryArea
} = require("../lib/_delivery-areas-store");
const {
  createAdminError,
  requireAdminSession
} = require("../lib/_admin-auth");
const { parseJsonBody, sendJsonError } = require("../lib/_http-helpers");

module.exports = async function adminDeliveryAreasHandler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  try {
    requireAdminSession(req);

    if (req.method === "GET") {
      res.status(200).json(await buildAdminDeliveryAreasPayload());
      return;
    }

    if (req.method === "POST") {
      const payload = await parseJsonBody(req);
      const area = await createDeliveryArea(payload);

      res.status(200).json({
        ok: true,
        status: "saved",
        area,
        ...(await buildAdminDeliveryAreasPayload())
      });
      return;
    }

    if (req.method === "PUT") {
      const payload = await parseJsonBody(req);
      const areaId = String(payload.id || payload.areaId || "").trim();

      if (!areaId) {
        throw createAdminError("missing_delivery_area_id", "Informe qual região será atualizada.", 422);
      }

      const area = await updateDeliveryArea(areaId, payload);

      res.status(200).json({
        ok: true,
        status: "saved",
        area,
        ...(await buildAdminDeliveryAreasPayload())
      });
      return;
    }

    if (req.method === "DELETE") {
      const payload = await parseJsonBody(req);
      const areaId = String(payload.id || payload.areaId || "").trim();

      if (!areaId) {
        throw createAdminError("missing_delivery_area_id", "Informe qual região será removida.", 422);
      }

      await deleteDeliveryArea(areaId);

      res.status(200).json({
        ok: true,
        status: "deleted",
        ...(await buildAdminDeliveryAreasPayload())
      });
      return;
    }

    res.status(405).json({
      ok: false,
      code: "method_not_allowed",
      message: "Método não suportado."
    });
  } catch (error) {
    sendJsonError(res, error, {
      routeName: "admin-delivery-areas",
      fallbackMessage: "Não foi possível salvar as regiões agora."
    });
  }
};

async function buildAdminDeliveryAreasPayload() {
  const snapshot = await getDeliveryAreasSnapshot();

  return {
    ok: true,
    status: "ready",
    deliveryAreas: {
      updatedAt: snapshot.updatedAt,
      storageMode: snapshot.storageMode,
      persistenceConfigured: snapshot.persistenceConfigured,
      storageLabel: snapshot.storageLabel,
      zones: snapshot.zones,
      counts: getDeliveryAreaCounts(snapshot),
      areas: snapshot.areas
    }
  };
}
