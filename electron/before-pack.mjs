import { cpSync, existsSync, mkdirSync, rmSync } from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const src = join(projectRoot, ".next", "standalone");
const dst = join(__dirname, "_standalone");

if (!existsSync(src)) {
  console.error(
    `[before-pack] Standalone not found at ${src}. Run 'npm run build' first.`,
  );
  process.exit(1);
}

if (existsSync(dst)) rmSync(dst, { recursive: true });
mkdirSync(dst, { recursive: true });

const EXCLUDE = new Set([
  "dist-electron",
  "electron",
  "e2e",
  ".git",
  ".scratch",
  "docs",
]);

const filter = (srcPath) => {
  const rel = relative(src, srcPath);
  if (!rel) return true;
  const topDir = rel.split(/[\\/]/)[0];
  if (EXCLUDE.has(topDir)) return false;
  // Source maps and TS declaration files are never loaded at runtime (~8.3k files, 39%)
  if (/\.map$/i.test(srcPath)) return false;
  if (/\.d\.(ts|mts|cts)$/i.test(srcPath)) return false;
  // Strip .ts/.tsx from project source only (keep node_modules .ts — pi runtime may load them)
  if (!rel.includes("node_modules") && /\.(ts|tsx)$/.test(srcPath))
    return false;
  return true;
};

console.log(`[before-pack] Copying ${src} -> ${dst}`);
cpSync(src, dst, { recursive: true, filter, dereference: true });

const staticSrc = join(projectRoot, ".next", "static");
if (existsSync(staticSrc)) {
  mkdirSync(join(dst, ".next"), { recursive: true });
  cpSync(staticSrc, join(dst, ".next", "static"), { recursive: true });
  console.log("[before-pack] Copied .next/static");
}

const publicSrc = join(projectRoot, "public");
if (existsSync(publicSrc)) {
  cpSync(publicSrc, join(dst, "public"), { recursive: true });
  console.log("[before-pack] Copied public/");
}

console.log("[before-pack] Done.");
