function errorHandler(err, req, res, next) {
  console.error(`[Unhandled Error] ${req.method} ${req.url}:`, err);

  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  res.status(statusCode).json({
    success: false,
    error: message
  });
}

module.exports = errorHandler;
