/**
 * Builds the Express API as a Vercel Function using the Build Output API (v3).
 *
 *   npm run build:vercel-api
 *
 * Output (picked up by Vercel after the build command finishes):
 *   .vercel/output/config.json                       routes every request to the function
 *   .vercel/output/functions/api.func/index.js       the bundled API (all dependencies inlined)
 *   .vercel/output/functions/api.func/.vc-config.json
 *
 * Everything is bundled into one file so that path aliases (@/...) and TypeScript are resolved here,
 * not by Vercel. Only optional, never-installed MongoDB add-ons are left external.
 */
import { build } from "esbuild";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outRoot = resolve(root, ".vercel/output");
const funcDir = resolve(outRoot, "functions/api.func");

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(funcDir, { recursive: true });
mkdirSync(resolve(outRoot, "static"), { recursive: true });

const result = await build({
  entryPoints: [resolve(root, "src/vercel.ts")],
  outfile: resolve(funcDir, "index.js"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  tsconfig: resolve(root, "tsconfig.json"),
  logLevel: "info",
  legalComments: "none",
  metafile: true,
  // The MongoDB driver `require`s these only when the matching feature is enabled.
  external: [
    "kerberos",
    "@mongodb-js/zstd",
    "@aws-sdk/credential-providers",
    "gcp-metadata",
    "snappy",
    "socks",
    "aws4",
    "mongodb-client-encryption",
  ],
  // `export default handler` -> make the CommonJS export the handler itself, as the Node launcher expects.
  footer: { js: "module.exports = module.exports.default;" },
});

writeFileSync(resolve(funcDir, "package.json"), JSON.stringify({ type: "commonjs" }) + "\n");
writeFileSync(
  resolve(funcDir, ".vc-config.json"),
  JSON.stringify(
    {
      runtime: "nodejs22.x",
      handler: "index.js",
      launcherType: "Nodejs",
      // Express reads the raw Node request/response; Vercel's helper methods are not needed.
      shouldAddHelpers: false,
      supportsResponseStreaming: true,
      maxDuration: 60,
      memory: 1024,
    },
    null,
    2,
  ) + "\n",
);
writeFileSync(
  resolve(outRoot, "config.json"),
  JSON.stringify({ version: 3, routes: [{ src: "/(.*)", dest: "/api" }] }, null, 2) + "\n",
);

// Some Vercel project presets insist that a `public` directory exists; an empty one is harmless.
mkdirSync(resolve(root, "public"), { recursive: true });

const bytes = Object.values(result.metafile.outputs).reduce((sum, o) => sum + o.bytes, 0);
console.log(`\nVercel API bundle ready: ${(bytes / 1024 / 1024).toFixed(2)} MB at .vercel/output/functions/api.func/index.js`);
