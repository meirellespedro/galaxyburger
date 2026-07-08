const { getStoreStatusSnapshot } = require("../lib/_store-status-store");

module.exports = function storeStatusHandler(req, res) {
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
      const snapshot = await getStoreStatusSnapshot();

      res.status(200).json({
        ok: true,
        status: "ready",
        updatedAt: snapshot.updatedAt,
        storageMode: snapshot.storageMode,
        persistenceConfigured: snapshot.persistenceConfigured,
        overrideMode: snapshot.overrideMode
      });
    } catch (error) {
      res.status(Number(error.statusCode || 500)).json({
        ok: false,
        code: error.code || "store_status_failed",
        message: error.message || "Nao foi possivel consultar o status da loja agora."
      });
    }
  })();
};
