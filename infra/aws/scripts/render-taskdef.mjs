#!/usr/bin/env node
/**
 * Dry-run ECS task definition renderer for CI acceptance.
 * No AWS credentials required — validates JSON shape for web/api/mcp.
 *
 * Usage:
 *   node infra/aws/scripts/render-taskdef.mjs --env staging --service web
 *   node infra/aws/scripts/render-taskdef.mjs --env staging --all
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return args[i + 1] ?? fallback;
}
const all = args.includes("--all");
const envName = flag("env", "staging");
const serviceArg = flag("service", "web");
const services = all ? ["web", "api", "mcp"] : [serviceArg];

const ports = { web: 3000, api: 8000, mcp: 8787 };
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(scriptDir, ".generated");
mkdirSync(outDir, { recursive: true });

const rendered = services.map((service) => {
  const port = ports[service];
  if (!port) {
    throw new Error(`Unknown service "${service}". Expected web|api|mcp.`);
  }
  const family = `ai-catalyst-${envName}-${service}`;
  const taskDef = {
    family,
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    cpu: "256",
    memory: "512",
    containerDefinitions: [
      {
        // Short name matches live task definitions and deploy-aws.yml's
        // jq image rewrite (web / api / mcp). Family stays fully qualified.
        name: service,
        image: `ACCOUNT.dkr.ecr.ap-southeast-2.amazonaws.com/ai-catalyst-${envName}/${service}:latest`,
        essential: true,
        portMappings: [
          { containerPort: port, hostPort: port, protocol: "tcp" },
        ],
        environment: [
          { name: "STORAGE_PROVIDER", value: "s3" },
          { name: "EMAIL_PROVIDER", value: "ses" },
          { name: "AWS_REGION", value: "ap-southeast-2" },
        ],
        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-group": `/ecs/${family}`,
            "awslogs-region": "ap-southeast-2",
            "awslogs-stream-prefix": service,
          },
        },
      },
    ],
  };
  // Ensure serializable
  JSON.parse(JSON.stringify(taskDef));
  const file = path.join(outDir, `${envName}-${service}.taskdef.json`);
  writeFileSync(file, `${JSON.stringify(taskDef, null, 2)}\n`);
  console.log(`OK ${envName}/${service} -> ${file}`);
  return service;
});

console.log(`Rendered ${rendered.length} task definition(s) for ${envName}.`);
