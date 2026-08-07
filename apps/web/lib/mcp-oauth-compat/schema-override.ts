import type { BetterAuthPlugin } from "better-auth";

/**
 * Renames the legacy `mcp()` plugin's three OAuth tables (`oauthApplication`
 * / `oauthAccessToken` / `oauthConsent`) to the snake_case, `mcp_`-prefixed
 * names used by infra/database/migrations/0004_mcp_oauth_provider_schema.sql
 * (`mcp_oauth_applications` / `mcp_oauth_access_tokens` / `mcp_oauth_consents`).
 *
 * Why this exists as its own synthetic plugin instead of `mcp({ oidcConfig:
 * { schema: {...} } })`: `mcp()` (better-auth@1.6.23,
 * `plugins/mcp/index.mjs`) wraps `oidcProvider()` internally to build its
 * `authorizeMCPOAuth` logic, but the *plugin object it returns* re-exports
 * the raw, un-renamed `schema` imported directly from
 * `plugins/oidc-provider/schema.mjs` — not `oidcProvider(...).schema`
 * (which is the one that actually applies `mergeSchema(schema,
 * options.schema)`). Concretely, at the bottom of `mcp()`:
 *
 * ```js
 * import { schema } from "../oidc-provider/schema.mjs";
 * const provider = oidcProvider({ ...opts, __skipDeprecationWarning: true });
 * return { id: "mcp", ..., schema, options };  // <- raw `schema`, not `provider.schema`
 * ```
 *
 * So anything passed to `mcp({ oidcConfig: { schema: {...} } })` is silently
 * dropped for table/field naming purposes — it never reaches the object
 * Better Auth actually reads schema from for that plugin.
 *
 * What Better Auth *does* read: `@better-auth/core`'s `getAuthTables()`
 * (`db/get-tables.mjs`) builds its final table map by reducing over
 * `options.plugins` in array order:
 *
 * ```js
 * const pluginSchema = (options.plugins ?? []).reduce((acc, plugin) => {
 *   const schema = plugin.schema;
 *   if (!schema) return acc;
 *   for (const [key, value] of Object.entries(schema)) {
 *     acc[key] = {
 *       fields: { ...acc[key]?.fields, ...value.fields },
 *       modelName: value.modelName || key,
 *       ...
 *     };
 *   }
 *   return acc;
 * }, {});
 * ```
 *
 * For a given table key (e.g. `oauthApplication`), the *last* plugin in the
 * array whose `schema[key]` is present wins `modelName` outright, and wins
 * `fields[fieldKey]` on a per-field-key basis (each key's whole
 * `DBFieldAttribute` object is replaced, not deep-merged). This plugin is
 * appended *after* `mcp()` in `apps/web/lib/auth.ts`'s `plugins` array for
 * exactly that reason, and every field below repeats the *complete* field
 * definition from `plugins/oidc-provider/schema.mjs` (type, `unique`,
 * `required`, `references`, `defaultValue`) plus `fieldName` — omitting any
 * of those would silently revert that attribute to `getAuthTables()`'s
 * default (usually fine) or drop a `unique`/`references` constraint the
 * adapter relies on at query time (not fine).
 *
 * This merge behavior was confirmed directly against
 * `@better-auth/core@1.6.23`'s compiled `db/get-tables.mjs`, and this
 * specific plugin object is exercised end-to-end by the real
 * `/mcp/register` -> `/mcp/authorize` -> `/oauth2/consent` -> `/mcp/token`
 * flow against the actual `mcp_oauth_*` tables in
 * apps/web/tests/mcp-oauth.http.db.test.ts. Any Better Auth version bump MUST
 * re-run that suite before assuming this still holds — see this
 * directory's README.md.
 */
export const mcpOAuthSchemaOverridePlugin: BetterAuthPlugin = {
  id: "mcp-oauth-schema-rename",
  schema: {
    oauthApplication: {
      modelName: "mcp_oauth_applications",
      fields: {
        name: { type: "string", fieldName: "name" },
        icon: { type: "string", required: false, fieldName: "icon" },
        metadata: { type: "string", required: false, fieldName: "metadata" },
        clientId: { type: "string", unique: true, fieldName: "client_id" },
        clientSecret: {
          type: "string",
          required: false,
          fieldName: "client_secret",
        },
        redirectUrls: { type: "string", fieldName: "redirect_urls" },
        type: { type: "string", fieldName: "type" },
        disabled: {
          type: "boolean",
          required: false,
          defaultValue: false,
          fieldName: "disabled",
        },
        userId: {
          type: "string",
          required: false,
          references: { model: "user", field: "id", onDelete: "cascade" },
          index: true,
          fieldName: "user_id",
        },
        createdAt: { type: "date", fieldName: "created_at" },
        updatedAt: { type: "date", fieldName: "updated_at" },
      },
    },
    oauthAccessToken: {
      modelName: "mcp_oauth_access_tokens",
      fields: {
        accessToken: {
          type: "string",
          unique: true,
          fieldName: "access_token",
        },
        refreshToken: {
          type: "string",
          unique: true,
          fieldName: "refresh_token",
        },
        accessTokenExpiresAt: {
          type: "date",
          fieldName: "access_token_expires_at",
        },
        refreshTokenExpiresAt: {
          type: "date",
          fieldName: "refresh_token_expires_at",
        },
        clientId: {
          type: "string",
          references: {
            model: "oauthApplication",
            field: "clientId",
            onDelete: "cascade",
          },
          index: true,
          fieldName: "client_id",
        },
        userId: {
          type: "string",
          required: false,
          references: { model: "user", field: "id", onDelete: "cascade" },
          index: true,
          fieldName: "user_id",
        },
        scopes: { type: "string", fieldName: "scopes" },
        createdAt: { type: "date", fieldName: "created_at" },
        updatedAt: { type: "date", fieldName: "updated_at" },
      },
    },
    oauthConsent: {
      modelName: "mcp_oauth_consents",
      fields: {
        clientId: {
          type: "string",
          references: {
            model: "oauthApplication",
            field: "clientId",
            onDelete: "cascade",
          },
          index: true,
          fieldName: "client_id",
        },
        userId: {
          type: "string",
          references: { model: "user", field: "id", onDelete: "cascade" },
          index: true,
          fieldName: "user_id",
        },
        scopes: { type: "string", fieldName: "scopes" },
        createdAt: { type: "date", fieldName: "created_at" },
        updatedAt: { type: "date", fieldName: "updated_at" },
        consentGiven: { type: "boolean", fieldName: "consent_given" },
      },
    },
  },
};
