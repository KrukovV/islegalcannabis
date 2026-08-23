import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(process.cwd(), "db", "migrations", "20260814_social_layer.sql"),
  "utf8",
);
const allMigrations = fs.readdirSync(path.join(process.cwd(), "db", "migrations"))
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => fs.readFileSync(path.join(process.cwd(), "db", "migrations", file), "utf8"))
  .join("\n");

describe("Social schema privacy and domain boundaries", () => {
  it("has no exact post or user location fields in the first slice and never stores a user location history", () => {
    expect(migration).toContain("future explicit-place feature can add PostGIS only when it is truly used");
    expect(migration).not.toMatch(/\b(?:post_location|user_latitude|user_longitude|latitude|longitude|location_history|previous_cells|current_area|last_seen_location)\b/i);
  });

  it("keeps common discussion, moderation, block, mute, and future-space tables isolated from Legal Truth", () => {
    for (const table of ["social_discussions", "social_comments", "social_votes", "social_reports", "social_blocks", "social_mutes", "social_moderation_actions", "social_communities"]) {
      expect(migration).toContain(`CREATE TABLE ${table}`);
    }
    expect(migration).not.toMatch(/(?:legal_status|truth_ssot|geo_color)\s/i);
  });

  it("makes expired MAP content immediately unreadable through the public RLS policy", () => {
    expect(migration).toContain("status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > now())");
    expect(allMigrations).toContain("social_map_visibility_hard_max");
    expect(allMigrations).toContain("type = 'MAP' THEN LEAST(created_at + interval '72 hours'");
  });

  it("stores only hashed session tokens and separates user and cell rate counters", () => {
    expect(allMigrations).toContain("token_hash text NOT NULL UNIQUE");
    expect(allMigrations).not.toContain("token_plaintext");
    expect(allMigrations).toContain("CREATE TABLE social_user_rate_limits");
    expect(allMigrations).toContain("CREATE TABLE social_cell_rate_limits");
  });

  it("keeps the Internet DM candidate ciphertext-only and separate from Social GEO", () => {
    expect(allMigrations).toContain("CREATE TABLE IF NOT EXISTS dm_devices");
    expect(allMigrations).toContain("CREATE TABLE IF NOT EXISTS dm_relay_envelopes");
    expect(allMigrations).toContain("gift_wrap jsonb NOT NULL");
    expect(allMigrations).toContain("receipt_hash char(64) NOT NULL");
    expect(allMigrations).not.toMatch(/dm_relay_envelopes[\s\S]{0,1600}\b(?:plaintext|sender_user_id|sender_device_id|geo_cell|geo_id|latitude|longitude)\b/i);
  });
});
