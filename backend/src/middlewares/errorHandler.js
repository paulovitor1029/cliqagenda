function errorHandler(err, req, res, next) {
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ message: "A imagem é muito grande. Envie uma foto de até 8 MB." });
  }

  if (err && err.code && String(err.code).startsWith("LIMIT_")) {
    return res.status(400).json({ message: "Não foi possível enviar o arquivo. Verifique a imagem e tente novamente." });
  }

  if (err && err.message === "File too large") {
    return res.status(400).json({ message: "A imagem é muito grande. Envie uma foto de até 8 MB." });
  }

  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
  const isServerError = statusCode >= 500;

  res.status(statusCode).json({
    message: isServerError && process.env.NODE_ENV === "production"
      ? "Erro interno do servidor."
      : (err.message || "Erro interno do servidor")
  });
}

module.exports = errorHandler;
