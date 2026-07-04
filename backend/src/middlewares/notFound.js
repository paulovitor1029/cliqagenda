function notFound(req, res, next) {
  res.status(404);
  next(new Error(`Rota nao encontrada: ${req.originalUrl}`));
}

module.exports = notFound;
