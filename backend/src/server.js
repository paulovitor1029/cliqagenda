const app = require("./app");
const { port } = require("./config/env");

app.listen(port, () => {
  console.log(`Servidor CliqAgenda rodando em http://localhost:${port}`);
});
