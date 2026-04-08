import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { URL } from "node:url";
import nextEnv from "@next/env";

const DEFAULT_PORT = 3000;
const LOCAL_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
]);
const { loadEnvConfig } = nextEnv;
const require = createRequire(import.meta.url);

function assertDatabaseSchemaIsCurrent(mode) {
  if (process.env.SKIP_PRISMA_MIGRATION_CHECK === "1") {
    return;
  }

  let prismaCliPath;

  try {
    prismaCliPath = require.resolve("prisma/build/index.js");
  } catch (error) {
    console.warn(
      `[startup] Skipping Prisma migration preflight because the Prisma CLI is unavailable in ${mode} mode.`,
      error instanceof Error ? error.message : error,
    );
    return;
  }

  const result = spawnSync(
    process.execPath,
    [prismaCliPath, "migrate", "status"],
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
    },
  );

  if (result.status === 0) {
    return;
  }

  const details = [result.stdout, result.stderr]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join("\n")
    .trim();

  console.error(
    `[startup] Prisma schema drift detected. Apply the pending migration before starting the app.\n` +
      `Run: npx prisma migrate deploy\n`,
  );

  if (details) {
    console.error(details);
  }

  process.exit(result.status ?? 1);
}

function getMode() {
  const mode = process.argv[2];

  if (mode === "dev" || mode === "start") {
    return mode;
  }

  console.error("Usage: node scripts/run-next.mjs <dev|start> [next args]");
  process.exit(1);
}

function parsePort(rawValue) {
  const parsed = Number(rawValue);

  if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) {
    return parsed;
  }

  return DEFAULT_PORT;
}

function isLocalUrl(value) {
  try {
    return LOCAL_HOSTNAMES.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

function buildLocalUrl(port) {
  return `http://localhost:${port}`;
}

function resolveBaseUrl(value, port) {
  if (!value) {
    return buildLocalUrl(port);
  }

  if (!isLocalUrl(value)) {
    return value;
  }

  const resolved = new URL(value);
  resolved.hostname = "localhost";
  resolved.port = String(port);

  return resolved.toString().replace(/\/$/, "");
}

function checkPortAvailability(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", (error) => {
      if (error?.code === "EADDRINUSE") {
        resolve(false);
        return;
      }

      reject(error);
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port);
  });
}

function reserveEphemeralPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", reject);
    server.once("listening", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to resolve dynamic port.")));
        return;
      }

      server.close(() => resolve(address.port));
    });

    server.listen(0);
  });
}

async function resolvePort(preferredPort) {
  const preferredPortAvailable = await checkPortAvailability(preferredPort);

  if (preferredPortAvailable) {
    return preferredPort;
  }

  return reserveEphemeralPort();
}

async function main() {
  const mode = getMode();
  const forwardedArgs = process.argv.slice(3);
  loadEnvConfig(process.cwd(), mode === "dev");
  assertDatabaseSchemaIsCurrent(mode);

  const preferredPort = parsePort(process.env.PORT ?? DEFAULT_PORT);
  const resolvedPort = await resolvePort(preferredPort);
  const resolvedBaseUrl = buildLocalUrl(resolvedPort);
  const childEnv = {
    ...process.env,
    PORT: String(resolvedPort),
    NEXTAUTH_URL: resolveBaseUrl(process.env.NEXTAUTH_URL, resolvedPort),
    APP_BASE_URL: resolveBaseUrl(process.env.APP_BASE_URL, resolvedPort),
  };

  if (resolvedPort !== preferredPort) {
    console.warn(
      `[startup] Port ${preferredPort} is unavailable. Falling back to ${resolvedPort}.`,
    );
  }

  console.log(`[startup] ${mode} server URL: ${resolvedBaseUrl}`);

  const child = spawn(
    process.execPath,
    ["./node_modules/next/dist/bin/next", mode, "--port", String(resolvedPort), ...forwardedArgs],
    {
      cwd: process.cwd(),
      env: childEnv,
      stdio: "inherit",
    },
  );

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error("[startup] Unable to launch Next.js.", error);
  process.exit(1);
});
