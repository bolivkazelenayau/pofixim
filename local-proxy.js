const http = require("http");
const net = require("net");

const PROFILE = process.env.PROXY_PROFILE || process.argv[2] || "dev";
const PROFILE_DEFAULTS = {
  dev: {
    listenPort: 3001,
    targetPort: 3000,
  },
  prod: {
    listenPort: 3003,
    targetPort: 3002,
  },
};
const defaults = PROFILE_DEFAULTS[PROFILE] || PROFILE_DEFAULTS.dev;

const LISTEN_HOST = process.env.PROXY_HOST || "0.0.0.0";
const LISTEN_PORT = Number(process.env.PROXY_PORT || defaults.listenPort);
const TARGET_HOST = process.env.PROXY_TARGET_HOST || "127.0.0.1";
const TARGET_PORT = Number(process.env.PROXY_TARGET_PORT || defaults.targetPort);
const TARGET_ORIGIN =
  process.env.PROXY_TARGET_ORIGIN || `http://localhost:${TARGET_PORT}`;
const DEFAULT_ALLOWED_REMOTE_CIDRS = "127.0.0.1/32,100.64.0.0/10,::1";
const ALLOWED_REMOTE_CIDRS = (process.env.PROXY_ALLOWED_REMOTE_CIDRS || DEFAULT_ALLOWED_REMOTE_CIDRS)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const TRANSIENT_NETWORK_ERRORS = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  "ENOTFOUND",
]);

function isTransientNetworkError(error) {
  return Boolean(error && TRANSIENT_NETWORK_ERRORS.has(error.code));
}

function logProxyError(context, error) {
  const code = error?.code || "ERROR";
  const message = error?.message || String(error);
  console.warn(`[proxy:${context}] ${code}: ${message}`);
}

function appendForwardedFor(existing, remoteAddress) {
  const address = remoteAddress || '';
  if (!address) return existing;
  return existing ? `${existing}, ${address}` : address;
}

function normalizeRemoteAddress(address) {
  if (!address) return "";
  if (address.startsWith("::ffff:")) return address.slice("::ffff:".length);
  return address;
}

function ipv4ToNumber(address) {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts.reduce((acc, part) => (acc << 8) + part, 0) >>> 0;
}

function isIPv4InCidr(address, cidr) {
  const [rangeAddress, prefixRaw] = cidr.split("/");
  const prefix = Number(prefixRaw);
  const addressNumber = ipv4ToNumber(address);
  const rangeNumber = ipv4ToNumber(rangeAddress);
  if (addressNumber === null || rangeNumber === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return false;
  }
  if (prefix === 0) return true;
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (addressNumber & mask) === (rangeNumber & mask);
}

function isRemoteAllowed(remoteAddress) {
  const address = normalizeRemoteAddress(remoteAddress);
  if (!address) return false;
  const ipVersion = net.isIP(address);
  if (!ipVersion) return false;

  return ALLOWED_REMOTE_CIDRS.some((rule) => {
    if (rule.includes("/")) {
      return ipVersion === 4 && isIPv4InCidr(address, rule);
    }
    return address === rule;
  });
}

function writeForbidden(res) {
  if (res.destroyed) return;
  res.writeHead(403, {
    "content-type": "text/plain; charset=utf-8",
  });
  res.end("Forbidden: remote address is not allowed by local proxy");
}

function buildHeaders(req) {
  const headers = req.headers;
  const incomingHost = headers.host || `localhost:${LISTEN_PORT}`;
  const forwardedProto = headers['x-forwarded-proto'] || 'http';

  return {
    ...headers,
    host: incomingHost,
    'x-forwarded-for': appendForwardedFor(
      headers['x-forwarded-for'],
      req.socket.remoteAddress,
    ),
    'x-forwarded-host': headers['x-forwarded-host'] || incomingHost,
    'x-forwarded-port':
      headers['x-forwarded-port'] || String(incomingHost).split(':')[1] || String(LISTEN_PORT),
    'x-forwarded-proto': forwardedProto,
  };
}

function safeDestroy(stream) {
  if (!stream || stream.destroyed) return;
  stream.destroy();
}

function writeBadGateway(res, error) {
  if (res.destroyed) return;
  if (!res.headersSent) {
    res.writeHead(502, {
      "content-type": "text/plain; charset=utf-8",
    });
  }
  res.end(`Bad Gateway: ${error?.code || error?.message || "upstream unavailable"}`);
}

const server = http.createServer((req, res) => {
  if (!isRemoteAllowed(req.socket.remoteAddress)) {
    console.warn(`[proxy:forbidden] ${normalizeRemoteAddress(req.socket.remoteAddress)} ${req.method} ${req.url}`);
    writeForbidden(res);
    return;
  }

  const proxy = http.request(
    {
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      path: req.url,
      method: req.method,
      headers: buildHeaders(req),
    },
    (targetRes) => {
      targetRes.on("error", (error) => {
        logProxyError("target-response", error);
        safeDestroy(res);
      });

      res.writeHead(targetRes.statusCode ?? 502, targetRes.headers);
      targetRes.pipe(res);
    },
  );

  req.on("error", (error) => {
    logProxyError("client-request", error);
    safeDestroy(proxy);
  });

  res.on("error", (error) => {
    logProxyError("client-response", error);
    safeDestroy(proxy);
  });

  proxy.on("error", (error) => {
    logProxyError("upstream-request", error);
    writeBadGateway(res, error);
  });

  req.pipe(proxy);
});

server.on("upgrade", (req, socket, head) => {
  if (!isRemoteAllowed(req.socket.remoteAddress)) {
    console.warn(`[proxy:upgrade-forbidden] ${normalizeRemoteAddress(req.socket.remoteAddress)} ${req.url}`);
    socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    return;
  }

  const proxy = http.request({
    hostname: TARGET_HOST,
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: buildHeaders(req),
  });

  let upgraded = false;

  socket.on("error", (error) => {
    logProxyError("upgrade-client-socket", error);
    safeDestroy(proxy);
  });

  proxy.on("upgrade", (targetRes, targetSocket, targetHead) => {
    upgraded = true;

    targetSocket.on("error", (error) => {
      logProxyError("upgrade-target-socket", error);
      safeDestroy(socket);
    });

    const responseHeaders = Object.entries(targetRes.headers)
      .flatMap(([key, value]) => {
        if (Array.isArray(value)) return value.map((item) => `${key}: ${item}`);
        if (value == null) return [];
        return [`${key}: ${value}`];
      })
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
      if (Array.isArray(value)) {
        for (const item of value) socket.write(`${key}: ${item}\r\n`);
      } else if (value != null) {
        socket.write(`${key}: ${value}\r\n`);
      }
    }
    socket.write("\r\n");

    targetRes.on("error", (error) => {
      logProxyError("upgrade-target-response", error);
      safeDestroy(socket);
    });
    targetRes.pipe(socket);
  });

  proxy.on("error", (error) => {
    logProxyError("upgrade-upstream-request", error);
    if (!upgraded && !socket.destroyed) {
      socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    } else {
      safeDestroy(socket);
    }
  });

  proxy.end();
});

server.on("clientError", (error, socket) => {
  logProxyError("client-error", error);
  if (!socket.destroyed) {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
  }
});

server.on("error", (error) => {
  logProxyError("server", error);
  if (error.code === "EADDRINUSE" || error.code === "EACCES") {
    process.exitCode = 1;
    setImmediate(() => process.exit(1));
  }
});

process.on("uncaughtException", (error) => {
  if (isTransientNetworkError(error)) {
    logProxyError("uncaught-transient", error);
    return;
  }
  throw error;
});

process.on("unhandledRejection", (reason) => {
  if (isTransientNetworkError(reason)) {
    logProxyError("unhandled-transient", reason);
    return;
  }
  console.error("[proxy:unhandled-rejection]", reason);
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(
    `Proxy (${PROFILE}) listening on http://${LISTEN_HOST}:${LISTEN_PORT} -> ${TARGET_ORIGIN}; allowed remotes: ${ALLOWED_REMOTE_CIDRS.join(", ")}`,
  );
});
