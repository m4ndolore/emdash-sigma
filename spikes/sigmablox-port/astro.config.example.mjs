// Spike astro.config.mjs — drop this into the root of a `create-emdash`
// project, side-by-side with the seed.json + src/auth/authentik.ts files.
//
// The only sigmablox-specific block is the `auth:` descriptor under `emdash()`.
// Everything else is stock create-emdash defaults; tweak to your environment.

import { defineConfig } from "astro/config";
import emdash from "emdash";
import { authentik } from "./src/auth/authentik.ts";

export default defineConfig({
	output: "server",
	integrations: [
		emdash({
			// Pick up the spike's success_stories schema + sample content.
			seed: "./seed/seed.json",

			// Authentik as the single source of identity.
			//
			// Replace AUTHENTIK_* with secrets in .env / wrangler.toml.
			// `roleMapping` keys must match the EXACT group names in your
			// Authentik tenant — confirm against your authentik-middleware.js
			// before relying on them.
			auth: authentik({
				issuer: process.env.AUTHENTIK_ISSUER,
				audience: process.env.AUTHENTIK_AUDIENCE,

				// Pick ONE delivery mechanism that matches your existing setup.
				// If your edge worker (cloudflare/wrangler.toml) injects the JWT
				// as `Authorization: Bearer`, leave `cookieName` unset.
				cookieName: process.env.AUTHENTIK_JWT_COOKIE, // e.g. "authentik_jwt"
				// headerName: "Authorization",

				defaultRole: 30, // AUTHOR for any authenticated user we don't recognize
				roleMapping: {
					"sigmablox-admins": 50, // ADMIN
					"sigmablox-editors": 40, // EDITOR
					"sigmablox-staff": 40, // EDITOR
					"sigmablox-founders": 30, // AUTHOR
					"sigmablox-members": 10, // SUBSCRIBER
				},
			}),
		}),
	],
});
