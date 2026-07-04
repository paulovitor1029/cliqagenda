const path = require("path");
require("express-async-errors");
const cors = require("cors");
const express = require("express");
const apiRoutes = require("./routes");
const notFound = require("./middlewares/notFound");
const errorHandler = require("./middlewares/errorHandler");

const app = express();
const frontendPath = path.resolve(__dirname, "../../frontend/src");
const uploadsPath = path.resolve(__dirname, "../uploads");

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(uploadsPath));
app.use("/api", apiRoutes);
app.use("/api", notFound);

app.use(express.static(frontendPath));

app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

app.use(errorHandler);

module.exports = app;
