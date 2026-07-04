function errorHandler(err, req, res, next) {
  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
  const isServerError = statusCode >= 500;

  res.status(statusCode).json({
    message: isServerError && process.env.NODE_ENV === "production"
      ? "Erro interno do servidor."
      : (err.message || "Erro interno do servidor")
  });
}

module.exports = errorHandler;
