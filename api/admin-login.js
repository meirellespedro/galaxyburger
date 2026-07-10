const {
  assertLoginRateLimitNotExceeded,
  clearAdminSessionCookie,
  clearLoginRateLimit,
  createAdminError,
  getAdminSession,
  registerFailedLoginAttempt,
  setAdminSessionCookie,
  validateAdminPassword
} = require("../lib/_admin-auth");
const { parseJsonBody, sendJsonError } = require("../lib/_http-helpers");

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
      await assertLoginRateLimitNotExceeded(req);

      const payload = await parseJsonBody(req);
      const password = String(payload.password || "");

      if (!validateAdminPassword(password)) {
        await registerFailedLoginAttempt(req);
        throw createAdminError("invalid_admin_password", "Senha inválida. Confira e tente novamente.", 401);
      }

      await clearLoginRateLimit(req);
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
    sendJsonError(res, error, {
      routeName: "admin-login",
      fallbackMessage: "Nao foi possivel autenticar no painel agora."
    });
  }
};
