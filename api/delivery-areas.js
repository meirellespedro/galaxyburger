const {
  getDeliveryAreaCounts,
  getDeliveryAreasSnapshot
} = require("../lib/_delivery-areas-store");

module.exports = function deliveryAreasHandler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({
      ok: false,
      code: "method_not_allowed",
      message: "Metodo nao suportado."
    });
    return;
  }

  return (async () => {
    try {
      const snapshot = await getDeliveryAreasSnapshot();

      res.status(200).json({
        ok: true,
        status: "ready",
        updatedAt: snapshot.updatedAt,
        persistenceConfigured: snapshot.persistenceConfigured,
        zones: snapshot.zones,
        counts: getDeliveryAreaCounts(snapshot),
        areas: snapshot.areas
      });
    } catch (error) {
      res.status(Number(error.statusCode || 500)).json({
        ok: false,
        code: error.code || "delivery_areas_failed",
        message: error.message || "Nao foi possivel consultar os bairros de entrega agora."
      });
    }
  })();
};
