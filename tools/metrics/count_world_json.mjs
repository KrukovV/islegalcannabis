import fs from "node:fs";
import path from "node:path";

const worldDir = path.join(process.cwd(), "data", "laws", "world");
let count = 0;
if (fs.existsSync(worldDir)) {
  count = fs.readdirSync(worldDir).filter((name) => name.endsWith(".json")).length;
}
process.stdout.write(String(count));
