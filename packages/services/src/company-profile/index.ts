import type { PoolClient } from "pg";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { CompanyProfile } from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { getVenture } from "@ai-catalyst/services/venture";
import {
  resolveFounderWorkspace,
  resolveFounderWorkspaceId,
} from "@ai-catalyst/services/workspace";
import { assertWorkspaceActive } from "@ai-catalyst/services/internal/workspace";
import { getActiveContext } from "@ai-catalyst/services/workspace/active-context";

const COMPANY_PROFILE_COLUMNS = `
  id, workspace_id, venture_id, name, website_url, linkedin_url,
  one_liner, description, hq_country, hq_state, hq_city, hq_street,
  hq_postal_code, hq_address_full, founded_year, status, created_at, updated_at
`;

interface CompanyProfileRow {
  id: string;
  workspace_id: string;
  venture_id: string;
  name: string;
  website_url: string | null;
  linkedin_url: string | null;
  one_liner: string | null;
  description: string | null;
  hq_country: string | null;
  hq_state: string | null;
  hq_city: string | null;
  hq_street: string | null;
  hq_postal_code: string | null;
  hq_address_full: string | null;
  founded_year: number | null;
  status: "active" | "archived";
  created_at: Date;
  updated_at: Date;
}

function mapCompanyProfileRow(row: CompanyProfileRow): CompanyProfile {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ventureId: row.venture_id,
    name: row.name,
    websiteUrl: row.website_url,
    linkedinUrl: row.linkedin_url,
    oneLiner: row.one_liner,
    description: row.description,
    hqCountry: row.hq_country,
    hqState: row.hq_state,
    hqCity: row.hq_city,
    hqStreet: row.hq_street,
    hqPostalCode: row.hq_postal_code,
    hqAddressFull: row.hq_address_full,
    foundedYear: row.founded_year,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function emptyCompanyProfile(workspaceId: string): CompanyProfile {
  return {
    id: null,
    workspaceId,
    ventureId: null,
    name: null,
    websiteUrl: null,
    linkedinUrl: null,
    oneLiner: null,
    description: null,
    hqCountry: null,
    hqState: null,
    hqCity: null,
    hqStreet: null,
    hqPostalCode: null,
    hqAddressFull: null,
    foundedYear: null,
    status: null,
    createdAt: null,
    updatedAt: null,
  };
}

const MAX_NAME_LENGTH = 200;
const MAX_ONE_LINER_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_URL_LENGTH = 500;
const MAX_LOCATION_LENGTH = 120;
const MAX_POSTAL_CODE_LENGTH = 20;
const MAX_COUNTRY_LENGTH = 2;

const EDITABLE_FIELDS = [
  "name",
  "websiteUrl",
  "linkedinUrl",
  "oneLiner",
  "description",
  "hqCountry",
  "hqState",
  "hqCity",
  "hqStreet",
  "hqPostalCode",
  "foundedYear",
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];

const COLUMN_BY_FIELD: Record<EditableField, string> = {
  name: "name",
  websiteUrl: "website_url",
  linkedinUrl: "linkedin_url",
  oneLiner: "one_liner",
  description: "description",
  hqCountry: "hq_country",
  hqState: "hq_state",
  hqCity: "hq_city",
  hqStreet: "hq_street",
  hqPostalCode: "hq_postal_code",
  foundedYear: "founded_year",
};

const MAX_LENGTH_BY_FIELD: Record<
  Exclude<EditableField, "foundedYear">,
  number
> = {
  name: MAX_NAME_LENGTH,
  websiteUrl: MAX_URL_LENGTH,
  linkedinUrl: MAX_URL_LENGTH,
  oneLiner: MAX_ONE_LINER_LENGTH,
  description: MAX_DESCRIPTION_LENGTH,
  hqCountry: MAX_COUNTRY_LENGTH,
  hqState: MAX_LOCATION_LENGTH,
  hqCity: MAX_LOCATION_LENGTH,
  hqStreet: MAX_LOCATION_LENGTH,
  hqPostalCode: MAX_POSTAL_CODE_LENGTH,
};

const FIELD_LABEL: Record<EditableField, string> = {
  name: "Company name",
  websiteUrl: "Website",
  linkedinUrl: "LinkedIn",
  oneLiner: "One-liner",
  description: "Description",
  hqCountry: "Country",
  hqState: "State or region",
  hqCity: "City",
  hqStreet: "Street address",
  hqPostalCode: "Postcode",
  foundedYear: "Year founded",
};

function normalizeHttpUrl(field: EditableField, value: string): string {
  const label = FIELD_LABEL[field];
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ServiceError(
      "VALIDATION_ERROR",
      `${label} must be a full URL, including https://.`,
    );
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new ServiceError(
      "VALIDATION_ERROR",
      `${label} must be an http or https URL.`,
    );
  }
  return value;
}

function normalizeField(
  field: EditableField,
  rawValue: unknown,
): string | number | null {
  if (field === "foundedYear") {
    if (rawValue === null) return null;
    if (typeof rawValue === "string" && rawValue.trim() === "") return null;
    const numeric =
      typeof rawValue === "number"
        ? rawValue
        : typeof rawValue === "string"
          ? Number(rawValue.trim())
          : NaN;
    if (!Number.isInteger(numeric)) {
      throw new ServiceError(
        "VALIDATION_ERROR",
        "Year founded must be a whole number.",
      );
    }
    if (numeric < 1800 || numeric > 2100) {
      throw new ServiceError(
        "VALIDATION_ERROR",
        "Year founded must be between 1800 and 2100.",
      );
    }
    return numeric;
  }

  if (rawValue === null) return null;
  if (typeof rawValue !== "string") {
    throw new ServiceError(
      "VALIDATION_ERROR",
      `${FIELD_LABEL[field]} must be text.`,
    );
  }

  const value = rawValue.trim();
  if (value.length === 0) return null;

  const maxLength = MAX_LENGTH_BY_FIELD[field];
  if (value.length > maxLength) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      `${FIELD_LABEL[field]} must be ${maxLength} characters or fewer.`,
    );
  }

  if (field === "websiteUrl" || field === "linkedinUrl") {
    return normalizeHttpUrl(field, value);
  }

  if (field === "hqCountry" && value.length !== 2) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "Country must be a two-letter code (for example, AU).",
    );
  }

  return value;
}

function normalizeUpdateInput(
  input: unknown,
): Map<EditableField, string | number | null> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "A company profile object is required.",
    );
  }

  const record = input as Record<string, unknown>;
  const updates = new Map<EditableField, string | number | null>();

  for (const field of EDITABLE_FIELDS) {
    if (!(field in record)) continue;
    if (record[field] === undefined) continue;
    updates.set(field, normalizeField(field, record[field]));
  }

  if (updates.size === 0) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "No editable company profile fields were supplied.",
    );
  }

  return updates;
}

async function loadCompanyProfileRow(
  workspaceId: string,
  client: PoolClient | typeof pool = pool,
): Promise<CompanyProfileRow | null> {
  const result = await client.query<CompanyProfileRow>(
    `select ${COMPANY_PROFILE_COLUMNS}
     from company_profiles
     where workspace_id = $1`,
    [workspaceId],
  );
  return result.rows[0] ?? null;
}

/**
 * Reads the signed-in Founder's company profile for their Workspace.
 * Returns an empty profile when no row exists yet.
 */
export async function getMyCompanyProfile(
  actor: ActorContext,
): Promise<CompanyProfile> {
  assertRole(actor, ["founder"]);
  const workspaceId = await resolveFounderWorkspaceId(actor);

  const row = await loadCompanyProfileRow(workspaceId);
  return row ? mapCompanyProfileRow(row) : emptyCompanyProfile(workspaceId);
}

/**
 * Creates or updates the Workspace's single company profile.
 *
 * First save requires an active Venture selection and a non-empty company
 * name. Subsequent saves are partial updates against the existing row.
 */
export async function updateMyCompanyProfile(
  actor: ActorContext,
  input: unknown,
): Promise<CompanyProfile> {
  assertRole(actor, ["founder"]);
  const updates = normalizeUpdateInput(input);

  const client = await pool.connect();
  try {
    await client.query("begin");

    const workspace = await resolveFounderWorkspace(actor, client);
    assertWorkspaceActive(workspace.status);

    const existing = await loadCompanyProfileRow(workspace.id, client);

    if (existing) {
      if (existing.status === "archived") {
        throw new ServiceError(
          "FORBIDDEN",
          "This company profile is archived and can no longer be edited.",
        );
      }

      if (updates.has("name") && updates.get("name") === null) {
        throw new ServiceError(
          "VALIDATION_ERROR",
          "Company name cannot be cleared.",
        );
      }

      const fields = [...updates.keys()];
      const columns = fields.map((field) => COLUMN_BY_FIELD[field]);
      const values = fields.map((field) => updates.get(field) ?? null);
      const setClause = columns
        .map((column, index) => `${column} = $${index + 2}`)
        .join(", ");

      const result = await client.query<CompanyProfileRow>(
        `update company_profiles
         set ${setClause}, updated_at = now()
         where workspace_id = $1
         returning ${COMPANY_PROFILE_COLUMNS}`,
        [workspace.id, ...values],
      );

      await client.query("commit");
      const row = result.rows[0];
      if (!row) {
        throw new ServiceError(
          "INTERNAL_INVARIANT_ERROR",
          "Company profile update returned no row.",
        );
      }
      return mapCompanyProfileRow(row);
    }

    const activeContext = await getActiveContext(actor);
    if (!activeContext.ventureId) {
      throw new ServiceError(
        "VALIDATION_ERROR",
        "Choose your current idea before your first save.",
      );
    }

    await getVenture(actor, activeContext.ventureId);

    const name = updates.get("name");
    if (typeof name !== "string" || name.trim().length === 0) {
      throw new ServiceError(
        "VALIDATION_ERROR",
        "Company name is required on first save.",
      );
    }

    const fields = [...updates.keys()];
    const columns = fields.map((field) => COLUMN_BY_FIELD[field]);
    const values = fields.map((field) => updates.get(field) ?? null);

    const insertPlaceholders = values.map((_, index) => `$${index + 3}`);
    const result = await client.query<CompanyProfileRow>(
      `insert into company_profiles (workspace_id, venture_id, ${columns.join(", ")})
       values ($1, $2, ${insertPlaceholders.join(", ")})
       returning ${COMPANY_PROFILE_COLUMNS}`,
      [workspace.id, activeContext.ventureId, ...values],
    );

    await client.query("commit");
    const row = result.rows[0];
    if (!row) {
      throw new ServiceError(
        "INTERNAL_INVARIANT_ERROR",
        "Company profile insert returned no row.",
      );
    }
    return mapCompanyProfileRow(row);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
