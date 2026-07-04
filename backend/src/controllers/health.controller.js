function getHealth(req, res) {
  res.json({
    status: "ok",
    service: "cliqagenda-api"
  });
}

module.exports = {
  getHealth
};
