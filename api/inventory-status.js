const {
  getInventoryCounts,
  getInventorySnapshot
} = require("./_inventory-store");

module.exports = function inventoryStatusHandler(req, res) {
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
      const snapshot = await getInventorySnapshot();

      res.status(200).json({
        ok: true,
        status: "ready",
        updatedAt: snapshot.updatedAt,
        storageMode: snapshot.storageMode,
        persistenceConfigured: snapshot.persistenceConfigured,
        counts: getInventoryCounts(snapshot),
        products: snapshot.products.map(product => ({
          id: product.id,
          name: product.name,
          category: product.category,
          available: Boolean(product.available),
          stockUpdatedAt: product.stockUpdatedAt || snapshot.updatedAt
        }))
      });
    } catch (error) {
      res.status(Number(error.statusCode || 500)).json({
        ok: false,
        code: error.code || "inventory_status_failed",
        message: error.message || "Nao foi possivel consultar o estoque agora."
      });
    }
  })();
};
