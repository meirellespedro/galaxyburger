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
    res.status(Number(error.statusCode || 500)).json({
      ok: false,
      code: error.code || "admin_delivery_areas_failed",
      message: error.message || "Não foi possível salvar as regiões agora."
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
