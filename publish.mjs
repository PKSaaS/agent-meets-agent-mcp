// Publishes server.json to the official MCP Registry.
// The registry confirms the domain through https://agentmeetsagent.com/.well-known/mcp-registry-auth,
// which holds the public half of a key. The private half is in the owner's macOS Keychain
// (service "agent-meets-agent-mcp-registry-key") and never leaves it.
//
//   node publish.mjs          check server.json only
//   node publish.mjs publish  publish it (raise "version" in server.json first)
import crypto from "node:crypto";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const REGISTRY = "https://registry.modelcontextprotocol.io";
const stored = execFileSync("security", ["find-generic-password", "-s", "agent-meets-agent-mcp-registry-key", "-w"]).toString().trim();
const key = crypto.createPrivateKey({ key: Buffer.from(stored, "base64"), format: "der", type: "pkcs8" });
const post = async (path, body, headers = {}) => {
  const response = await fetch(REGISTRY + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  return [response.status, await response.text()];
};

const server = JSON.parse(fs.readFileSync(new URL("./server.json", import.meta.url), "utf8"));
const timestamp = new Date().toISOString().replace(/\.\d+Z$/, "Z");
const [status, text] = await post("/v0/auth/http", { domain: "agentmeetsagent.com", timestamp, signed_timestamp: crypto.sign(null, Buffer.from(timestamp), key).toString("hex") });
if (status !== 200) { console.error("The registry did not accept the domain proof:", status, text.slice(0, 300)); process.exit(1); }
const authorization = "Bearer " + JSON.parse(text).registry_token;

const [checked, report] = await post("/v0/validate", server, { authorization });
console.log("check:", checked, report.slice(0, 300));
if (process.argv[2] !== "publish") process.exit(checked === 200 ? 0 : 1);

const [published, result] = await post("/v0/publish", server, { authorization });
console.log("publish:", published, result.slice(0, 600));
process.exit(published === 200 ? 0 : 1);
