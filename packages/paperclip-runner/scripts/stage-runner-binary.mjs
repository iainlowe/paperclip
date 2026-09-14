import { execFile } from "node:child_process";
import { chmod, copyFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executable = process.platform === "win32" ? "paperclip-runnerd.exe" : "paperclip-runnerd";
// Cargo may be redirected to a writable target directory by managed/source
// installers. Keep staging coupled to the same Cargo contract instead of
// assuming the package-local default.
const cargoTargetDirectory = process.env.CARGO_TARGET_DIR
  ? path.resolve(process.env.CARGO_TARGET_DIR)
  : path.join(packageRoot, "runner", "target");
const directSource = path.join(cargoTargetDirectory, "release", executable);
const targetEntries = await readdir(cargoTargetDirectory, { withFileTypes: true });
const targetSpecificSources = targetEntries
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(cargoTargetDirectory, entry.name, "release", executable));
const sourceCandidates = [directSource, ...targetSpecificSources];
let source;
for (const candidate of sourceCandidates) {
  try {
    await chmod(candidate, 0o755);
    source = candidate;
    break;
  } catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") throw error;
  }
}
if (!source) {
  throw new Error(`Cargo build output ${executable} was not found under ${cargoTargetDirectory}`);
}
const destinationDirectory = path.join(packageRoot, "dist", "bin");
const destination = path.join(destinationDirectory, executable);

await mkdir(destinationDirectory, { recursive: true });
await copyFile(source, destination);
if (process.platform !== "win32") await chmod(destination, 0o755);
// Rust's linker emits an ad-hoc Mach-O signature. Copying that executable to
// its package location preserves the bytes but can leave the kernel rejecting
// the new inode with SIGKILL. Re-sign the staged inode so local packaged-runner
// evals execute the same artifact that was just built.
if (process.platform === "darwin") {
  await execFileAsync("codesign", ["--force", "--sign", "-", destination]);
}
