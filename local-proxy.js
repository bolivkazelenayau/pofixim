const http = require("http");

function buildHeaders(headers) {
  return {
    ...headers,
    host: "localhost:3000",
    origin: "http://localhost:3000",
  };
}

const server = http.createServer((req, res) => {
  const proxy = http.request(
    {
      hostname: "127.0.0.1",
      port: 3000,
      path: req.url,
      method: req.method,
      headers: buildHeaders(req.headers),
    },
    (targetRes) => {
      res.writeHead(targetRes.statusCode ?? 502, targetRes.headers);
      targetRes.pipe(res);
    },
  );

  proxy.on("error", (err) => {
    if (!res.headersSent) {
      res.statusCode = 502;
    }
    res.end(String(err));
  });

  req.pipe(proxy);
});

server.on("upgrade", (req, socket, head) => {
  const proxy = http.request({
    hostname: "127.0.0.1",
    port: 3000,
    path: req.url,
    method: req.method,
    headers: buildHeaders(req.headers),
  });

  proxy.on("upgrade", (targetRes, targetSocket, targetHead) => {
    const responseHeaders = Object.entries(targetRes.headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\r\n");

    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n${responseHeaders}\r\n\r\n`,
    );

    if (targetHead?.length) {
      socket.write(targetHead);
    }
    if (head?.length) {
      targetSocket.write(head);
    }

    targetSocket.pipe(socket);
    socket.pipe(targetSocket);
  });

  proxy.on("response", (targetRes) => {
    socket.write(
      `HTTP/1.1 ${targetRes.statusCode ?? 502} ${targetRes.statusMessage ?? "Bad Gateway"}\r\n`,
    );
    for (const [key, value] of Object.entries(targetRes.headers)) {
      socket.write(`${key}: ${value}\r\n`);
    }
    socket.write("\r\n");
    targetRes.pipe(socket);
  });

  proxy.on("error", () => {
    socket.destroy();
  });

  proxy.end();
});

server.listen(3001, "0.0.0.0", () => {
  console.log("Proxy listening on http://0.0.0.0:3001 -> http://localhost:3000");
});
