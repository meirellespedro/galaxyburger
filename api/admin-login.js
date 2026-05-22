const {
  clearAdminSessionCookie,
  createAdminError,
  getAdminSession,
  setAdminSessionCookie,
  validateAdminPassword
} = require("./_admin-auth");

module.exports = async function adminLoginHandler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method === "GET") {
      const session = getAdminSession(req);

      res.status(200).json({
        ok: true,
        authenticated: Boolean(session),
        expiresAt: session ? new Date(session.expiresAt).toISOString() : ""
      });
      return;
    }

    if (req.method === "POST") {
      const payload = await parseJsonBody(req);
      const password = String(payload.password || "");

      if (!validateAdminPassword(password)) {
        throw createAdminError("invalid_admin_password", "Senha inválida. Confira e tente novamente.", 401);
      }

      setAdminSessionCookie(res, req);

      res.status(200).json({
        ok: true,
        authenticated: true,
        message: "Login realizado com sucesso."
      });
      return;
    }

    if (req.method === "DELETE") {
      clearAdminSessionCookie(res, req);
      res.status(200).json({
        ok: true,
        authenticated: false,
        message: "Sessão encerrada."
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
      code: error.code || "admin_login_failed",
      message: error.message || "Nao foi possivel autenticar no painel agora."
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
