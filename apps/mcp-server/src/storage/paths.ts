import path from "node:path";
import { resolveDataDirectory } from "../repoRoot.js";

export function dataDirectory(): string {
  return resolveDataDirectory();
}

export function projectStateFilePath(): string {
  return path.join(dataDirectory(), "project-state.json");
}

export function submissionsFilePath(): string {
  return path.join(dataDirectory(), "submissions.json");
}

export function uploadsProjectDirectory(projectId: string): string {
  return path.join(dataDirectory(), "uploads", projectId);
}

export function serverLogFilePath(): string {
  return path.join(dataDirectory(), "server.log");
}
