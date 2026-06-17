// lib/pulse.ts
// ─────────────────────────────────────────────────────────────
// Daily Pulse — check-in (start of day) and check-out (end of day).
// Raw rows are owner-only under RLS; leaders read aggregates via the
// security-definer team_pulse_trend() RPC (k-anonymised, >= 3 responses).
//
// Reads/writes go through the browser client (lib/supabase.ts) + RLS,
// the same pattern as lib/achievements.ts. No service-role key here.
// ─────────────────────────────────────────────────────────────
import { supabase } from "@/lib/supabase";
import { writeAuditLog } from "@/lib/audit";

export type PulseMood = 1 | 2 | 3 | 4 | 5;

export type DailyPulseRow = {
  id: string;
  employee_id: string;
  org_id: string | null;
  pulse_date: string;
  checkin_mood: number | null;
  checkin_note: string | null;
  checkin_at: string | null;
  checkout_sentiment: number | null;
  checkout_note: string | null;
  checkout_at: string | null;
};

export type PulseTrendPoint = {
  pulse_date: string;
  avg_checkin: number | null;
  avg_checkout: number | null;
  responses: number;
};

const PULSE_SELECT =
  "id, employee_id, org_id, pulse_date, checkin_mood, checkin_note, checkin_at, checkout_sentiment, checkout_note, checkout_at";

/** Local YYYY-MM-DD (so "first login of the day" matches the user's calendar day). */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Today's pulse row for this user, or null if they haven't checked in yet. */
export async function fetchTodayPulse(employeeId: string): Promise<DailyPulseRow | null> {
  const { data, error } = await supabase
    .from("daily_pulse")
    .select(PULSE_SELECT)
    .eq("employee_id", employeeId)
    .eq("pulse_date", today())
    .maybeSingle();

  if (error) throw error;
  return (data as DailyPulseRow) ?? null;
}

/** Gate helpers for the app shell. */
export async function needsCheckIn(employeeId: string): Promise<boolean> {
  const row = await fetchTodayPulse(employeeId);
  return !row || row.checkin_mood == null;
}

/**
 * Save the morning check-in. Upserts on (employee_id, pulse_date) so a second
 * login the same day edits rather than duplicates (matches the unique index).
 */
export async function saveCheckIn(
  employeeId: string,
  orgId: string | null,
  mood: PulseMood,
  note?: string,
): Promise<DailyPulseRow> {
  const { data, error } = await supabase
    .from("daily_pulse")
    .upsert(
      {
        employee_id: employeeId,
        org_id: orgId,
        pulse_date: today(),
        checkin_mood: mood,
        checkin_note: note?.trim() || null,
        checkin_at: new Date().toISOString(),
      },
      { onConflict: "employee_id,pulse_date" },
    )
    .select(PULSE_SELECT)
    .single();

  if (error) throw error;

  await writeAuditLog({
    actorId: employeeId,
    action: "pulse_checkin",
    targetTable: "daily_pulse",
    targetId: data.id,
    changes: { mood }, // note text is sensitive — never copied into the audit log
  });

  return data as DailyPulseRow;
}

/** Save the end-of-day check-out (upsert onto today's row). */
export async function saveCheckOut(
  employeeId: string,
  orgId: string | null,
  sentiment: PulseMood,
  note?: string,
): Promise<DailyPulseRow> {
  const { data, error } = await supabase
    .from("daily_pulse")
    .upsert(
      {
        employee_id: employeeId,
        org_id: orgId,
        pulse_date: today(),
        checkout_sentiment: sentiment,
        checkout_note: note?.trim() || null,
        checkout_at: new Date().toISOString(),
      },
      { onConflict: "employee_id,pulse_date" },
    )
    .select(PULSE_SELECT)
    .single();

  if (error) throw error;

  await writeAuditLog({
    actorId: employeeId,
    action: "pulse_checkout",
    targetTable: "daily_pulse",
    targetId: data.id,
    changes: { sentiment },
  });

  return data as DailyPulseRow;
}

/**
 * Aggregated team trend for managers/leaders (security-definer RPC enforces
 * k-anonymity and scope — raw individual rows are never returned).
 */
export async function fetchTeamPulseTrend(days = 14): Promise<PulseTrendPoint[]> {
  const { data, error } = await supabase.rpc("team_pulse_trend", { p_days: days });
  if (error) throw error;
  return (data ?? []) as PulseTrendPoint[];
}
