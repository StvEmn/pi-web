// electron/after-pack.mjs — copy node_modules that electron-builder skips
import { cpSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default async function afterPack(context) {
  const appOutDir = context.appOutDir;
  const resourcesDir = join(appOutDir, "resources");
  const src = join(__dirname, "_standalone", "node_modules");
  const dst = join(resourcesDir, "standalone", "node_modules");

  if (!existsSync(src)) {
    console.warn("[after-pack] No node_modules to copy:", src);
    return;
  }

  console.log(`[after-pack] Copying node_modules: ${src} -> ${dst}`);
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true, dereference: true });
  console.log("[after-pack] Done.");
}
