import { spawn } from "node:child_process";

const port = 4199;
const child = spawn(process.execPath, ["server.mjs"], {
  env: { ...process.env, PORT: String(port), GOOGLE_CLIENT_ID: "" },
  stdio: "ignore",
});

try {
  let healthy = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      healthy = response.ok && (await response.json()).ok === true;
      if (healthy) break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  if (!healthy) throw new Error("API health check failed");
  const accountResponse = await fetch(`http://127.0.0.1:${port}/api/account`, {
    method: "DELETE",
  });
  if (accountResponse.status !== 401) throw new Error("Account deletion guard failed");
  console.log("API smoke test passed");
} finally {
  child.kill("SIGTERM");
}
