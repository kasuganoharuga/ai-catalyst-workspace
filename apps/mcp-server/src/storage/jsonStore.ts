import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Atomic file write: write to a uniquely-named temp file in the same
 * directory, fsync it, then rename it over the target. Avoids leaving a
 * half-written file if the process dies mid-write. Cleans up the temp
 * file on failure. No file locking - this POC is single-process.
 */
export async function writeFileAtomic(targetPath: string, contents: string): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(tempPath, "w");
    await handle.writeFile(contents);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(tempPath, targetPath);
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => undefined);
    }
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function writeJsonAtomic(targetPath: string, data: unknown): Promise<void> {
  await writeFileAtomic(targetPath, JSON.stringify(data, null, 2));
}

export async function readJsonArray<T>(targetPath: string): Promise<T[]> {
  try {
    const raw = await fs.readFile(targetPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error(`Expected an array in ${targetPath}, got ${typeof parsed}`);
    }
    return parsed as T[];
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return [];
    }
    throw error;
  }
}

export async function readJsonObject<T>(targetPath: string): Promise<T | undefined> {
  try {
    const raw = await fs.readFile(targetPath, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(`Expected a JSON object in ${targetPath}, got ${Array.isArray(parsed) ? "array" : typeof parsed}`);
    }
    return parsed as T;
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return undefined;
    }
    throw error;
  }
}

export async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function readTextFile(targetPath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(targetPath, "utf8");
  } catch {
    return undefined;
  }
}

function isFileNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
}
