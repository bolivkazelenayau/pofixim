const http = require("http");
const net = require("net");

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
const DEFAULT_ALLOWED_REMOTE_CIDRS = "127.0.0.1/32,100.64.0.0/10,::1";
const ALLOWED_REMOTE_CIDRS = (process.env.PROXY_ALLOWED_REMOTE_CIDRS || DEFAULT_ALLOWED_REMOTE_CIDRS)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const MULTI_PROFILE_ALIASES = new Set(["all", "both", "dev+prod", "dev,prod"]);

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

function logProxyError(context, error, profile) {
  const code = error?.code || "ERROR";
  const message = error?.message || String(error);
  const prefix = profile ? `[proxy:${profile}:${context}]` : `[proxy:${context}]`;
  console.warn(`${prefix} ${code}: ${message}`);
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

function isRemoteAllowed(remoteAddress, allowedRemoteCidrs) {
  const address = normalizeRemoteAddress(remoteAddress);
  if (!address) return false;
  const ipVersion = net.isIP(address);
  if (!ipVersion) return false;

  return allowedRemoteCidrs.some((rule) => {
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

function buildHeaders(req, config) {
  const headers = req.headers;
  const incomingHost = headers.host || `localhost:${config.listenPort}`;
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
      headers['x-forwarded-port'] || String(incomingHost).split(':')[1] || String(config.listenPort),
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

function profileEnv(profile, key) {
  return process.env[`PROXY_${profile.toUpperCase()}_${key}`];
}

function readNumberEnv(value, fallback) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveRequestedProfiles() {
  const rawProfile = process.env.PROXY_PROFILE || process.argv[2] || "dev";
  const normalizedProfile = rawProfile.trim().toLowerCase();

  if (MULTI_PROFILE_ALIASES.has(normalizedProfile)) {
    return ["dev", "prod"];
  }

  const requestedProfiles = normalizedProfile
    .split(",")
    .map((profile) => profile.trim())
    .filter(Boolean);

  return requestedProfiles.length ? requestedProfiles : ["dev"];
}

function createProfileConfig(profile, isMultiProfile) {
  const defaults = PROFILE_DEFAULTS[profile] || PROFILE_DEFAULTS.dev;
  const listenPort = readNumberEnv(
    profileEnv(profile, "PORT") || (isMultiProfile ? undefined : process.env.PROXY_PORT),
    defaults.listenPort,
  );
  const targetHost =
    profileEnv(profile, "TARGET_HOST") ||
    (isMultiProfile ? undefined : process.env.PROXY_TARGET_HOST) ||
    "127.0.0.1";
  const targetPort = readNumberEnv(
    profileEnv(profile, "TARGET_PORT") || (isMultiProfile ? undefined : process.env.PROXY_TARGET_PORT),
    defaults.targetPort,
  );

  return {
    profile,
    isMultiProfile,
    listenHost:
      profileEnv(profile, "HOST") ||
      (isMultiProfile ? undefined : process.env.PROXY_HOST) ||
      "0.0.0.0",
    listenPort,
    targetHost,
    targetPort,
    targetOrigin:
      profileEnv(profile, "TARGET_ORIGIN") ||
      (isMultiProfile ? undefined : process.env.PROXY_TARGET_ORIGIN) ||
      `http://localhost:${targetPort}`,
    allowedRemoteCidrs: ALLOWED_REMOTE_CIDRS,
  };
}

function createProxyServer(config) {
  const server = http.createServer((req, res) => {
    if (!isRemoteAllowed(req.socket.remoteAddress, config.allowedRemoteCidrs)) {
      console.warn(`[proxy:${config.profile}:forbidden] ${normalizeRemoteAddress(req.socket.remoteAddress)} ${req.method} ${req.url}`);
      writeForbidden(res);
      return;
    }

    const proxy = http.request(
      {
        hostname: config.targetHost,
        port: config.targetPort,
        path: req.url,
        method: req.method,
        headers: buildHeaders(req, config),
      },
      (targetRes) => {
        targetRes.on("error", (error) => {
          logProxyError("target-response", error, config.profile);
          safeDestroy(res);
        });

        res.writeHead(targetRes.statusCode ?? 502, targetRes.headers);
        targetRes.pipe(res);
      },
    );

    req.on("error", (error) => {
      logProxyError("client-request", error, config.profile);
      safeDestroy(proxy);
    });

    res.on("error", (error) => {
      logProxyError("client-response", error, config.profile);
      safeDestroy(proxy);
    });

    proxy.on("error", (error) => {
      logProxyError("upstream-request", error, config.profile);
      writeBadGateway(res, error);
    });

    req.pipe(proxy);
  });

  server.on("upgrade", (req, socket, head) => {
    if (!isRemoteAllowed(req.socket.remoteAddress, config.allowedRemoteCidrs)) {
      console.warn(`[proxy:${config.profile}:upgrade-forbidden] ${normalizeRemoteAddress(req.socket.remoteAddress)} ${req.url}`);
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }

    const proxy = http.request({
      hostname: config.targetHost,
      port: config.targetPort,
      path: req.url,
      method: req.method,
      headers: buildHeaders(req, config),
    });

    let upgraded = false;

    socket.on("error", (error) => {
      logProxyError("upgrade-client-socket", error, config.profile);
      safeDestroy(proxy);
    });

    proxy.on("upgrade", (targetRes, targetSocket, targetHead) => {
      upgraded = true;

      targetSocket.on("error", (error) => {
        logProxyError("upgrade-target-socket", error, config.profile);
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
        logProxyError("upgrade-target-response", error, config.profile);
        safeDestroy(socket);
      });
      targetRes.pipe(socket);
    });

    proxy.on("error", (error) => {
      logProxyError("upgrade-upstream-request", error, config.profile);
      if (!upgraded && !socket.destroyed) {
        socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      } else {
        safeDestroy(socket);
      }
    });

    proxy.end();
  });

  server.on("clientError", (error, socket) => {
    logProxyError("client-error", error, config.profile);
    if (!socket.destroyed) {
      socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    }
  });

  server.on("error", (error) => {
    logProxyError("server", error, config.profile);
    if (error.code === "EADDRINUSE" || error.code === "EACCES") {
      if (config.isMultiProfile) {
        console.warn(
          `[proxy:${config.profile}:skip] Cannot listen on ${config.listenHost}:${config.listenPort}; other requested profiles will keep running.`,
        );
        return;
      }

      process.exitCode = 1;
      setImmediate(() => process.exit(1));
    }
  });

  return server;
}

const requestedProfiles = resolveRequestedProfiles();
const profileConfigs = requestedProfiles.map((profile) =>
  createProfileConfig(profile, requestedProfiles.length > 1),
);

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

for (const config of profileConfigs) {
  const server = createProxyServer(config);
  server.listen(config.listenPort, config.listenHost, () => {
    console.log(
      `Proxy (${config.profile}) listening on http://${config.listenHost}:${config.listenPort} -> ${config.targetOrigin}; allowed remotes: ${config.allowedRemoteCidrs.join(", ")}`,
    );
  });
}
