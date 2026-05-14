/**
 * Authentik OIDC auth provider for emdash.
 *
 * Mirrors the Cloudflare Access provider pattern
 * (packages/cloudflare/src/auth/cloudflare-access.ts) — same `AuthDescriptor`
 * shape, same `AuthProviderModule.authenticate` signature, different IdP.
 *
 * Behavior:
 *   1. Pull a JWT off the request (cookie or Authorization header).
 *   2. Verify it against Authentik's JWKS using `jose`.
 *   3. Read standard OIDC claims: email, name/preferred_username, groups.
 *   4. Map IdP groups to emdash role levels via `roleMapping`.
 *
 * Usage: re-export the factory and the `authenticate` function from this
 * single module so `AuthDescriptor.entrypoint` can point at it directly.
 */

import type { AuthDescriptor, AuthResult } from "emdash";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export interface AuthentikConfig {
	/** Authentik OIDC issuer URL — must match the `iss` claim exactly. */
	issuer: string;

	/** Client / application audience — must match the `aud` claim. */
	audience: string;

	/**
	 * Override the JWKS URL. Defaults to `<issuer>/jwks/` which matches
	 * Authentik's per-application JWKS endpoint.
	 */
	jwksUrl?: string;

	/**
	 * Name of the cookie carrying the JWT, if any.
	 * Check this first (so browser sessions Just Work).
	 */
	cookieName?: string;

	/**
	 * Name of the header carrying the JWT.
	 * Defaults to `Authorization` (expects `Bearer <jwt>`).
	 */
	headerName?: string;

	/** Default emdash role if no group matches. Defaults to 30 (AUTHOR). */
	defaultRole?: number;

	/**
	 * Map of Authentik group name → emdash RoleLevel.
	 * First match wins.
	 *
	 * @example
	 *   { "sigmablox-admins": 50, "sigmablox-staff": 40, "sigmablox-founders": 30 }
	 */
	roleMapping?: Record<string, number>;
}

interface AuthentikJwtPayload extends JWTPayload {
	email?: string;
	preferred_username?: string;
	name?: string;
	groups?: string[];
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(jwksUrl: string) {
	let jwks = jwksCache.get(jwksUrl);
	if (!jwks) {
		jwks = createRemoteJWKSet(new URL(jwksUrl));
		jwksCache.set(jwksUrl, jwks);
	}
	return jwks;
}

function isAuthentikConfig(value: unknown): value is AuthentikConfig {
	return (
		value != null &&
		typeof value === "object" &&
		"issuer" in value &&
		typeof (value as AuthentikConfig).issuer === "string" &&
		"audience" in value &&
		typeof (value as AuthentikConfig).audience === "string"
	);
}

function extractJwt(request: Request, config: AuthentikConfig): string | null {
	if (config.cookieName) {
		const cookies = request.headers.get("Cookie") ?? "";
		const pattern = new RegExp(
			`(?:^|;\\s*)${config.cookieName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]+)`,
		);
		const match = cookies.match(pattern);
		if (match?.[1]) return match[1];
	}

	const headerName = config.headerName ?? "Authorization";
	const headerValue = request.headers.get(headerName);
	if (!headerValue) return null;

	const bearer = headerValue.match(/^Bearer\s+(.+)$/i);
	return bearer?.[1] ?? headerValue;
}

function resolveRole(groups: string[], config: AuthentikConfig): number {
	const fallback = config.defaultRole ?? 30;
	if (!config.roleMapping) return fallback;

	for (const group of groups) {
		const mapped = config.roleMapping[group];
		if (typeof mapped === "number") return mapped;
	}
	return fallback;
}

/**
 * Implements `AuthProviderModule.authenticate`.
 * Called from emdash middleware on every request when the descriptor is wired up.
 */
export async function authenticate(request: Request, config: unknown): Promise<AuthResult> {
	if (!isAuthentikConfig(config)) {
		throw new Error("Invalid Authentik config: issuer and audience are required");
	}

	const jwt = extractJwt(request, config);
	if (!jwt) throw new Error("No Authentik JWT on request");

	const jwksUrl = config.jwksUrl ?? new URL("jwks/", config.issuer).toString();
	const { payload } = await jwtVerify<AuthentikJwtPayload>(jwt, getJwks(jwksUrl), {
		issuer: config.issuer,
		audience: config.audience,
		clockTolerance: 60,
	});

	const email = payload.email;
	if (!email) throw new Error("Authentik JWT missing email claim");

	const name = payload.name ?? payload.preferred_username ?? email.split("@")[0] ?? "Unknown";
	const groups = Array.isArray(payload.groups) ? payload.groups : [];

	return {
		email,
		name,
		role: resolveRole(groups, config),
		subject: payload.sub,
		metadata: { groups },
	};
}

/**
 * Build an `AuthDescriptor` for use in `astro.config.mjs`:
 *
 *   emdash({ auth: authentik({ issuer, audience, roleMapping }) })
 *
 * NOTE: `entrypoint` must be the module specifier that the runtime can
 * dynamically import to find this file's `authenticate` export. For a spike
 * inside a single project, the relative path works. For a real deployment,
 * publish this as a package and use the package name (mirror the
 * `@emdash-cms/cloudflare/auth` pattern).
 */
export function authentik(config: AuthentikConfig): AuthDescriptor {
	return {
		type: "authentik",
		entrypoint: "./src/auth/authentik.ts",
		config,
	};
}
