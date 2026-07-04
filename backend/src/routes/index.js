const { Router } = require("express");
const barbershopRoutes = require("./barbershop.routes");
const healthRoutes = require("./health.routes");

const router = Router();

router.use("/health", healthRoutes);
router.use("/", barbershopRoutes);

module.exports = router;
