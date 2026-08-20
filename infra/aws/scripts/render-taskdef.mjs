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
const services = all ? ["web", "api", "mcp", "gotenberg"] : [serviceArg];

const ports = { web: 3000, api: 8000, mcp: 8787, gotenberg: 3000 };
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(scriptDir, ".generated");
mkdirSync(outDir, { recursive: true });

const rendered = services.map((service) => {
  const port = ports[service];
  if (!port) {
    throw new Error(
      `Unknown service "${service}". Expected web|api|mcp|gotenberg.`,
    );
  }
  const family = `ai-catalyst-${envName}-${service}`;
  const isGotenberg = service === "gotenberg";
  const environment = isGotenberg
    ? []
    : [
        { name: "STORAGE_PROVIDER", value: "s3" },
        { name: "EMAIL_PROVIDER", value: "ses" },
        // EMAIL_FROM is required whenever EMAIL_PROVIDER=ses —
        // loadEmailConfigFromEnv() throws without it, so omitting it here
        // rendered a task definition that could not boot. Terraform sets the
        // real value from var.ses_email_identity (envs/staging/main.tf); this
        // renderer is dry-run shape validation only, hence the placeholder.
        {
          name: "EMAIL_FROM",
          value: process.env.EMAIL_FROM ?? "noreply@example.com",
        },
        { name: "AWS_REGION", value: "ap-southeast-2" },
        ...(service === "web"
          ? [
              {
                name: "GOTENBERG_URL",
                value: `http://gotenberg.ai-catalyst-${envName}.local:3000`,
              },
            ]
          : []),
      ];
  const taskDef = {
    family,
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    // Chromium needs more headroom than the thin Next/API shells.
    cpu: isGotenberg ? "1024" : "256",
    memory: isGotenberg ? "2048" : "512",
    containerDefinitions: [
      {
        // Short name matches live task definitions and deploy-aws.yml's
        // jq image rewrite (web / api / mcp). Family stays fully qualified.
        name: service,
        image: isGotenberg
          ? "gotenberg/gotenberg:8"
          : `ACCOUNT.dkr.ecr.ap-southeast-2.amazonaws.com/ai-catalyst-${envName}/${service}:latest`,
        essential: true,
        portMappings: [
          { containerPort: port, hostPort: port, protocol: "tcp" },
        ],
        environment,
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
