// supabase/functions/notify-trophy-unlock/index.ts
// Deno Edge Function. Reads pending trophy unlocks via the
// pending_trophy_notifications() helper, sends one email per unlock through
// Resend, and marks user_trophies.notified_at on success.
//
// Env vars:
//   RESEND_API_KEY     - required, Resend API key
//   RESEND_FROM        - required, e.g. "Phelierium <noreply@phelierium.app>"
//   APP_BASE_URL       - optional, defaults to https://checkpointlauncher.com
//   DRY_RUN            - optional "1" to skip the actual Resend call (tests)
//   CRON_SECRET        - optional dedicated secret for cron callers
//   SUPABASE_SERVICE_ROLE_KEY - required; also accepted as Bearer auth
//
// Auth: only service-role or CRON_SECRET Bearer tokens are accepted.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createResendClient,
  type ResendClient,
} from "../_shared/resend.ts";
import { renderTrophyUnlockEmail } from "../_shared/email-template.ts";

interface PendingRow {
  user_trophy_id: string;
  user_id: string;
  email: string | null;
  locale: string;
  email_min_tier: string;
  email_enabled: boolean;
  push_enabled: boolean;
  cadence: string;
  trophy_title: string;
  trophy_description: string;
  trophy_tier: string;
  trophy_xp: number;
  unlocked_at: string;
}

const TIER_RANK: Record<string, number> = { bronze: 0, silver: 1, gold: 2, platinum: 3 };

function tierAtLeast(actual: string, min: string): boolean {
  return (TIER_RANK[actual] ?? 0) >= (TIER_RANK[min] ?? 0);
}

function getEnv(name: string, fallback?: string): string {
  const v = Deno.env.get(name);
  if (v != null && v !== "") return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required env var: ${name}`);
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  const enc = new TextEncoder();
  const left = enc.encode(a);
  const right = enc.encode(b);
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left[i] ^ right[i];
  }
  return mismatch === 0;
}

function isAuthorizedCaller(req: Request): boolean {
  const authHeader = req.headers.get("Authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  const token = (match?.[1] || "").trim();
  if (!token) return false;

  const serviceRoleKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  const cronSecret = (Deno.env.get("CRON_SECRET") || "").trim();

  if (serviceRoleKey && timingSafeEqualString(token, serviceRoleKey)) return true;
  if (cronSecret && timingSafeEqualString(token, cronSecret)) return true;
  return false;
}

const supabaseUrl = getEnv("SUPABASE_URL");
const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
const apiKey = getEnv("RESEND_API_KEY");
const fromAddress = getEnv("RESEND_FROM", "Phelierium <noreply@phelierium.app>");
const baseUrl = getEnv("APP_BASE_URL", "https://checkpointlauncher.com");
const dryRun = Deno.env.get("DRY_RUN") === "1";

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const resend: ResendClient = createResendClient({ apiKey });

Deno.serve(async (req: Request): Promise<Response> => {
  // Only POST is allowed (Supabase Edge Function convention).
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  if (!isAuthorizedCaller(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  let batchSize = 25;
  try {
    const body = (await req.json().catch(() => ({}))) as { batchSize?: number };
    if (typeof body.batchSize === "number" && body.batchSize > 0) {
      batchSize = Math.min(200, Math.floor(body.batchSize));
    }
  } catch {
    // empty body is fine; use the default
  }

  const { data: rows, error: pendingErr } = await supabase.rpc(
    "pending_trophy_notifications",
    { p_limit: batchSize },
  );

  if (pendingErr) {
    return new Response(
      JSON.stringify({ error: "pending query failed", detail: pendingErr.message }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  const pending = (rows as PendingRow[] | null) || [];
  const results: Array<{
    user_trophy_id: string;
    status: "sent" | "skipped" | "failed";
    reason?: string;
  }> = [];

  for (const row of pending) {
    // Skip silent: disabled, missing email, or tier below threshold.
    if (!row.email_enabled) {
      results.push({ user_trophy_id: row.user_trophy_id, status: "skipped", reason: "email disabled" });
      continue;
    }
    if (!row.email) {
      results.push({ user_trophy_id: row.user_trophy_id, status: "skipped", reason: "missing email" });
      continue;
    }
    if (!tierAtLeast(row.trophy_tier, row.email_min_tier)) {
      results.push({ user_trophy_id: row.user_trophy_id, status: "skipped", reason: "below min tier" });
      continue;
    }
    if (row.cadence !== "instant") {
      // Digest cadence: leave notified_at=NULL so the digest worker can pick it up.
      results.push({ user_trophy_id: row.user_trophy_id, status: "skipped", reason: "digest cadence" });
      continue;
    }

    const email = renderTrophyUnlockEmail(
      {
        trophyTitle: row.trophy_title,
        trophyDescription: row.trophy_description,
        tier: row.trophy_tier as "platinum" | "gold" | "silver" | "bronze",
        xp: row.trophy_xp,
        unlockedAtIso: row.unlocked_at,
        playerName: row.email.split("@")[0],
        trophyPageUrl: `${baseUrl.replace(/\/$/, "")}/trophies`,
      },
      row.locale,
    );

    if (dryRun) {
      results.push({ user_trophy_id: row.user_trophy_id, status: "sent" });
      continue;
    }

    const sendRes = await resend.send({
      from: fromAddress,
      to: row.email,
      subject: email.subject,
      text: email.text,
      html: email.html,
      tags: [
        { name: "category", value: "trophy_unlock" },
        { name: "tier", value: row.trophy_tier },
      ],
    });

    if (!sendRes.ok) {
      results.push({
        user_trophy_id: row.user_trophy_id,
        status: "failed",
        reason: sendRes.error || `HTTP ${sendRes.status}`,
      });
      continue;
    }

    // Mark as notified only after Resend returns ok so retries re-send.
    const { error: updErr } = await supabase
      .from("user_trophies")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", row.user_trophy_id);

    if (updErr) {
      results.push({
        user_trophy_id: row.user_trophy_id,
        status: "failed",
        reason: `notified_at update failed: ${updErr.message}`,
      });
      continue;
    }

    results.push({ user_trophy_id: row.user_trophy_id, status: "sent" });
  }

  const counts = results.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    },
    { sent: 0, skipped: 0, failed: 0 } as Record<string, number>,
  );

  return new Response(
    JSON.stringify({ processed: results.length, counts, results }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
});
