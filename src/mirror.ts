import { randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import {
  chmod,
  type FileHandle,
  lstat,
  mkdir,
  mkdtemp,
  open,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ContextDocument, RejectedEdit } from "./document.ts";

// The exact bytes a published document has; any difference is a pending file edit.
export function serialize(document: ContextDocument) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function isMissing(error: unknown) {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export class Mirror {
  private directory: string | undefined;
  private identity: { dev: number; ino: number } | undefined;
  path: string | undefined;
  async create() {
    if (this.path) return;
    const directory = await mkdtemp(
      join(await realpath(tmpdir()), "clearhead-"),
    );
    try {
      await chmod(directory, 0o700);
      this.identity = await lstat(directory);
      this.directory = directory;
      this.path = join(directory, "CONTEXT.json");
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }
  private async checkDirectory(recreateMissing = false) {
    if (!this.directory || !this.identity)
      throw new RejectedEdit("mirror unavailable");
    let current: Stats;
    try {
      current = await lstat(this.directory);
    } catch (error) {
      if (!recreateMissing || !isMissing(error)) throw error;
      // Only recreate our known missing path, never adopt a replacement directory.
      await mkdir(this.directory, { mode: 0o700 });
      current = await lstat(this.directory);
      this.identity = current;
    }
    if (
      !current.isDirectory() ||
      current.isSymbolicLink() ||
      current.dev !== this.identity.dev ||
      current.ino !== this.identity.ino
    )
      throw new RejectedEdit("mirror directory replaced");
    await chmod(this.directory, 0o700);
  }
  private async checkFile(allowMissing = false) {
    if (!this.path) throw new RejectedEdit("mirror unavailable");
    try {
      const info = await lstat(this.path);
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
        throw new RejectedEdit("mirror is not a private regular file");
    } catch (error) {
      if (allowMissing && isMissing(error)) return;
      throw error;
    }
  }
  async read() {
    await this.checkDirectory();
    await this.checkFile();
    const handle = await open(
      this.path!,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.nlink !== 1)
        throw new RejectedEdit("mirror is not a private regular file");
      await handle.chmod(0o600);
      return new TextDecoder("utf-8", { fatal: true }).decode(
        await handle.readFile(),
      );
    } finally {
      await handle.close();
    }
  }
  async publish(document: ContextDocument) {
    await this.checkDirectory(true);
    await this.checkFile(true);
    const staging = `${this.path}.next-${randomUUID()}`;
    let handle: FileHandle | undefined;
    try {
      handle = await open(
        staging,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600,
      );
      await handle.writeFile(serialize(document), "utf8");
      await handle.close();
      handle = undefined;
      await rename(staging, this.path!);
    } finally {
      await handle?.close();
      await rm(staging, { force: true });
    }
  }
  async clear() {
    if (!this.path) return;
    await this.checkDirectory();
    // Unlinking does not follow a symlink. A directory here is never traversed.
    await rm(this.path, { force: true });
  }
  async remove() {
    try {
      if (this.directory) {
        await this.checkDirectory();
        await rm(this.directory, { recursive: true, force: true });
      }
    } catch (error) {
      if (!isMissing(error)) throw error;
    } finally {
      // Refusing unsafe cleanup must not retain ownership of a replaced path.
      this.path = undefined;
      this.directory = undefined;
      this.identity = undefined;
    }
  }
}
