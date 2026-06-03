/**
 * Client-side parsers for password manager export formats.
 * All parsing happens in the browser — plaintext never leaves the client.
 */

import type { EntryType } from "@/types";

export interface ParsedEntry {
  entry_type: EntryType;
  title: string;
  fields: Record<string, string>;
}

export type ImportFormat =
  | "bitwarden"
  | "lastpass"
  | "keepass"
  | "1password"
  | "csv";

// ─── Format detection ──────────────────────────────────────────────────────

export function detectFormat(filename: string, text: string): ImportFormat | null {
  const ext = filename.split(".").pop()?.toLowerCase();

  if (ext === "xml" || text.trimStart().startsWith("<KeePassFile")) return "keepass";

  if (ext === "json") {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed?.items) || Array.isArray(parsed?.data?.items)) return "bitwarden";
    } catch { /* not JSON */ }
    return null;
  }

  if (ext === "csv" || ext === "tsv") {
    const firstLine = text.split("\n")[0].toLowerCase();
    if (firstLine.includes("grouping") && firstLine.includes("extra")) return "lastpass";
    if (firstLine.includes("notetype") || firstLine.includes("otp auth") || firstLine.includes("otpauth")) return "1password";
    if (firstLine.includes("username") && firstLine.includes("password")) return "1password";
    return "csv";
  }

  return null;
}

// ─── Bitwarden JSON ────────────────────────────────────────────────────────

export function parseBitwarden(text: string): ParsedEntry[] {
  const raw = JSON.parse(text);
  const items: unknown[] = raw?.items ?? raw?.data?.items ?? [];
  const results: ParsedEntry[] = [];

  for (const item of items) {
    const i = item as Record<string, unknown>;
    const name = (i.name as string) || "Untitled";
    const notes = (i.notes as string) || "";
    const type = i.type as number;

    if (type === 1) {
      // Login
      const login = (i.login ?? {}) as Record<string, unknown>;
      const uris = (login.uris as { uri?: string }[]) ?? [];
      results.push({
        entry_type: "login",
        title: name,
        fields: {
          username: (login.username as string) || "",
          password: (login.password as string) || "",
          url: uris[0]?.uri || "",
          totp: (login.totp as string) || "",
          notes,
        },
      });
    } else if (type === 2) {
      // Secure note
      results.push({
        entry_type: "note",
        title: name,
        fields: { content: notes },
      });
    } else if (type === 3) {
      // Card
      const card = (i.card ?? {}) as Record<string, unknown>;
      const expMonth = (card.expMonth as string) || "";
      const expYear = (card.expYear as string) || "";
      results.push({
        entry_type: "card",
        title: name,
        fields: {
          cardholder_name: (card.cardholderName as string) || "",
          card_number: (card.number as string) || "",
          expiration: expMonth && expYear ? `${expMonth}/${expYear.slice(-2)}` : "",
          cvv: (card.code as string) || "",
          card_type: (card.brand as string) || "",
          notes,
        },
      });
    } else if (type === 4) {
      // Identity
      const id = (i.identity ?? {}) as Record<string, unknown>;
      const firstName = (id.firstName as string) || "";
      const lastName = (id.lastName as string) || "";
      results.push({
        entry_type: "identity",
        title: name,
        fields: {
          doc_type: "Identity",
          doc_number: (id.ssn as string) || (id.licenseNumber as string) || (id.passportNumber as string) || "",
          issuing_country: (id.country as string) || "",
          notes: [notes, firstName && lastName ? `Name: ${firstName} ${lastName}` : ""].filter(Boolean).join("\n"),
        },
      });
    } else {
      // Unknown — treat as custom
      results.push({
        entry_type: "custom",
        title: name,
        fields: { details: notes },
      });
    }
  }

  return results;
}

// ─── LastPass CSV ──────────────────────────────────────────────────────────
// Format: url,username,password,totp,extra,name,grouping,fav

export function parseLastPass(text: string): ParsedEntry[] {
  const rows = parseCSVRows(text);
  if (rows.length < 2) return [];

  const header = rows[0].map((h) => h.toLowerCase().trim());
  const col = (name: string) => header.indexOf(name);

  const results: ParsedEntry[] = [];
  for (const row of rows.slice(1)) {
    const get = (name: string) => row[col(name)] ?? "";
    const url = get("url");
    const name = get("name") || get("title") || "Untitled";
    const extra = get("extra") || get("notes") || "";

    // LastPass encodes secure notes as url = "http://sn"
    if (url === "http://sn" || url === "https://sn") {
      results.push({
        entry_type: "note",
        title: name,
        fields: { content: extra },
      });
    } else {
      results.push({
        entry_type: "login",
        title: name,
        fields: {
          username: get("username"),
          password: get("password"),
          url,
          notes: extra,
        },
      });
    }
  }

  return results;
}

// ─── KeePass XML ───────────────────────────────────────────────────────────

export function parseKeePass(text: string): ParsedEntry[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "application/xml");
  const results: ParsedEntry[] = [];
  extractKeePassEntries(doc.documentElement, results);
  return results;
}

function extractKeePassEntries(node: Element, results: ParsedEntry[]): void {
  for (const entry of Array.from(node.querySelectorAll(":scope > Entry"))) {
    const get = (key: string) => {
      for (const s of Array.from(entry.querySelectorAll(":scope > String"))) {
        const k = s.querySelector("Key")?.textContent?.trim();
        if (k === key) return s.querySelector("Value")?.textContent?.trim() || "";
      }
      return "";
    };

    const title = get("Title") || "Untitled";
    const username = get("UserName");
    const password = get("Password");
    const url = get("URL");
    const notes = get("Notes");

    if (!username && !password && !url && notes) {
      results.push({ entry_type: "note", title, fields: { content: notes } });
    } else {
      results.push({
        entry_type: "login",
        title,
        fields: { username, password, url, notes },
      });
    }
  }

  for (const group of Array.from(node.querySelectorAll(":scope > Group"))) {
    extractKeePassEntries(group, results);
  }
}

// ─── 1Password CSV ─────────────────────────────────────────────────────────
// 1Password exports vary by version. Common columns:
// Title, Username, Password, URL, Notes, Tags, OTPAuth
// Or: Title, Username, Password, URL, OTPAuth, Notes, Type

export function parse1Password(text: string): ParsedEntry[] {
  const rows = parseCSVRows(text);
  if (rows.length < 2) return [];

  const header = rows[0].map((h) => h.toLowerCase().trim().replace(/\s+/g, "_"));
  const col = (name: string) =>
    header.findIndex((h) => h === name || h.includes(name));

  const results: ParsedEntry[] = [];
  for (const row of rows.slice(1)) {
    const get = (name: string) => {
      const i = col(name);
      return i >= 0 ? (row[i] ?? "") : "";
    };

    const title = get("title") || "Untitled";
    const type = get("type").toLowerCase();
    const notes = get("notes") || get("note");

    if (type === "secure_note" || type === "note") {
      results.push({ entry_type: "note", title, fields: { content: notes } });
    } else if (type === "credit_card" || type === "card") {
      results.push({
        entry_type: "card",
        title,
        fields: {
          cardholder_name: get("cardholder_name") || get("name"),
          card_number: get("card_number") || get("number"),
          expiration: get("expiry_date") || get("expiration"),
          cvv: get("cvv") || get("verification_number"),
          notes,
        },
      });
    } else {
      results.push({
        entry_type: "login",
        title,
        fields: {
          username: get("username"),
          password: get("password"),
          url: get("url") || get("website"),
          notes,
        },
      });
    }
  }

  return results;
}

// ─── Generic CSV mapping ───────────────────────────────────────────────────

export interface CSVMappingState {
  headers: string[];
  rows: string[][];
}

export function parseGenericCSVHeaders(text: string): CSVMappingState {
  const rows = parseCSVRows(text);
  return {
    headers: rows[0] ?? [],
    rows: rows.slice(1),
  };
}

export function applyGenericCSVMapping(
  state: CSVMappingState,
  mapping: Record<string, string> // our field → csv column header
): ParsedEntry[] {
  const { headers, rows } = state;
  const col = (header: string) => headers.indexOf(header);

  return rows
    .filter((row) => row.some((c) => c.trim()))
    .map((row) => {
      const get = (field: string) => {
        const header = mapping[field];
        if (!header) return "";
        const i = col(header);
        return i >= 0 ? (row[i] ?? "") : "";
      };

      const entryType = (mapping["__type"] as EntryType) || "login";
      const title = get("title") || row[0] || "Untitled";

      const fields: Record<string, string> = {};
      for (const [field, header] of Object.entries(mapping)) {
        if (field.startsWith("__") || field === "title") continue;
        if (header) fields[field] = get(field);
      }

      return { entry_type: entryType, title, fields };
    });
}

// ─── CSV parser ────────────────────────────────────────────────────────────

export function parseCSVRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  const flush = () => {
    row.push(cell);
    cell = "";
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { flush(); }
      else if (ch === "\r" && next === "\n") { flush(); rows.push(row); row = []; i++; }
      else if (ch === "\n" || ch === "\r") { flush(); rows.push(row); row = []; }
      else cell += ch;
    }
  }
  flush();
  if (row.some((c) => c)) rows.push(row);

  return rows;
}
