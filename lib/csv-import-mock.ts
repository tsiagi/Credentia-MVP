/** Mock CSV parsing + row validation for admin bulk import (Step 10e). */

export type CsvPeopleRow = {
  rowNum: number;
  name: string;
  email: string;
  role: string;
  department: string;
  managerEmail: string;
};

export type RowValidation = {
  rowNum: number;
  name: string;
  email: string;
  role: string;
  department: string;
  managerEmail: string;
  valid: boolean;
  errors: string[];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const SAMPLE_PEOPLE_CSV = `name,email,role,department,manager_email
Maya Chen,maya.chen@demo.corp.com,Employee,Operations,jordan.lee@demo.corp.com
Sam Ortiz,sam.ortiz@demo.corp.com,Employee,Engineering,jordan.lee@demo.corp.com
Bad Row,not-an-email,Employee,Finance,unknown@demo.corp.com
Priya Nair,priya.nair@demo.corp.com,Manager,Operations,alex.rivera@demo.corp.com`;

export const SAMPLE_SUPERADMIN_CSV = `name,email,role,department
Alex Rivera,alex.rivera@acme.com,Executive,People & HR
Jordan Lee,jordan.lee@acme.com,Manager,Engineering
Invalid User,bad-email,Employee,Operations`;

export function parsePeopleCsv(text: string): CsvPeopleRow[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const idx = (key: string) => header.indexOf(key);
  const rows: CsvPeopleRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    rows.push({
      rowNum: i + 1,
      name: cols[idx("name")] ?? "",
      email: cols[idx("email")] ?? "",
      role: cols[idx("role")] ?? "",
      department: cols[idx("department")] ?? "",
      managerEmail: cols[idx("manager_email")] ?? cols[idx("manager email")] ?? "",
    });
  }
  return rows;
}

export function validatePeopleRows(
  rows: CsvPeopleRow[],
  knownManagerEmails: Set<string>,
): RowValidation[] {
  return rows.map((r) => {
    const errors: string[] = [];
    if (!r.name.trim()) errors.push("Name is required");
    if (!r.email.trim()) errors.push("Email is required");
    else if (!EMAIL_RE.test(r.email)) errors.push("Invalid email format");
    if (!r.role.trim()) errors.push("Role is required");
    if (r.managerEmail && !EMAIL_RE.test(r.managerEmail)) errors.push("Invalid manager email");
    else if (r.managerEmail && !knownManagerEmails.has(r.managerEmail.toLowerCase())) {
      errors.push("Unknown manager email");
    }
    return { ...r, valid: errors.length === 0, errors };
  });
}

export type SimpleCsvRow = { rowNum: number; name: string; email: string; role: string; department: string };

export function parseSimpleCsv(text: string): SimpleCsvRow[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const idx = (key: string) => header.indexOf(key);
  const rows: SimpleCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    rows.push({
      rowNum: i + 1,
      name: cols[idx("name")] ?? "",
      email: cols[idx("email")] ?? "",
      role: cols[idx("role")] ?? "",
      department: cols[idx("department")] ?? "",
    });
  }
  return rows;
}

export function validateSimpleRows(rows: SimpleCsvRow[]) {
  return rows.map((r) => {
    const errors: string[] = [];
    if (!r.name.trim()) errors.push("Name is required");
    if (!r.email.trim()) errors.push("Email is required");
    else if (!EMAIL_RE.test(r.email)) errors.push("Invalid email format");
    if (!r.role.trim()) errors.push("Role is required");
    return { ...r, valid: errors.length === 0, errors };
  });
}

export type ImportBatchResult = {
  id: string;
  rowCount: number;
  successCount: number;
  errorCount: number;
  errors: { row: number; message: string }[];
  createdAt: string;
};

export function buildBatchResult(
  validations: { rowNum: number; valid: boolean; errors: string[] }[],
): ImportBatchResult {
  const errors = validations
    .filter((v) => !v.valid)
    .flatMap((v) => v.errors.map((msg) => ({ row: v.rowNum, message: msg })));
  const successCount = validations.filter((v) => v.valid).length;
  return {
    id: `batch-${Date.now()}`,
    rowCount: validations.length,
    successCount,
    errorCount: validations.length - successCount,
    errors,
    createdAt: new Date().toISOString(),
  };
}
