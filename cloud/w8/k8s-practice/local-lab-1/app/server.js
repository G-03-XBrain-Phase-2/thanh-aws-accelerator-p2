const http = require("http");
const os = require("os");

const PORT = process.env.PORT || 3000;
const OWNER = "Lê Nguyễn Nhật Thành";
const APP_NAME = process.env.APP_NAME || "k8s-local-lab";
const APP_VERSION = process.env.APP_VERSION || "v1";
const MESSAGE = process.env.MESSAGE || "Hello from minikube";

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    owner : OWNER,
    app: APP_NAME,
    version: APP_VERSION,
    message: MESSAGE,
    pod: os.hostname()
  }, null, 2));
});

server.listen(PORT, () => {
  console.log(`${APP_NAME} listening on ${PORT}`);
});