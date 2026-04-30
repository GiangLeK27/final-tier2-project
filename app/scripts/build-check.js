import fs from "node:fs";
import path from "node:path";

const serverFile = path.resolve("src/server.js");

if (!fs.existsSync(serverFile)) {
  console.error("Build check failed: src/server.js not found");
  process.exit(1);
}

console.log("Build check passed: application source is present.");
