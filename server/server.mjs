import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let Pool;
try {
  ({ Pool } = await import("pg"));
} catch {
  console.error("Missing dependency: pg. Run `npm install` before starting the PostgreSQL server.");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 8080);
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required, for example: postgres://user:password@localhost:5432/jira_kpi");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
await ensureSchema();

const server = createServer(async (request, response) => {
  setCorsHeaders(response);
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }
    await serveStatic(response, url.pathname);
  } catch (error) {
    sendJson(response, statusFor(error), { error: error.message || "Unexpected server error" });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Jira KPI dashboard with PostgreSQL storage: http://127.0.0.1:${port}`);
});

async function ensureSchema() {
  const sql = await readFile(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(sql);
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, storage: "postgres" });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/reports") {
    const result = await pool.query(`
      SELECT id, team_name, sprint_name, date_from, date_to, created_at, calculation_version
      FROM jira_kpi_reports
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
    `);
    sendJson(response, 200, { reports: result.rows.map(toSummary) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/reports") {
    const payload = await readJsonBody(request);
    const report = payload.report || payload;
    validateReport(report);
    await pool.query(`
      INSERT INTO jira_kpi_reports (id, team_name, sprint_name, date_from, date_to, created_at, calculation_version, report, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE SET
        team_name = EXCLUDED.team_name,
        sprint_name = EXCLUDED.sprint_name,
        date_from = EXCLUDED.date_from,
        date_to = EXCLUDED.date_to,
        created_at = EXCLUDED.created_at,
        calculation_version = EXCLUDED.calculation_version,
        report = EXCLUDED.report,
        deleted_at = NULL,
        updated_at = NOW()
    `, [
      report.id,
      report.teamName || "",
      report.sprintName || "",
      report.dateFrom || "",
      report.dateTo || "",
      report.createdAt || new Date().toISOString(),
      report.calculationVersion || "",
      JSON.stringify(report)
    ]);
    sendJson(response, 200, { report: toSummary(report) });
    return;
  }

  const reportMatch = url.pathname.match(/^\/api\/reports\/([^/]+)$/);
  if (reportMatch && request.method === "GET") {
    const id = decodeURIComponent(reportMatch[1]);
    const result = await pool.query("SELECT report FROM jira_kpi_reports WHERE id = $1 AND deleted_at IS NULL", [id]);
    if (!result.rowCount) throw httpError(404, "Report not found");
    sendJson(response, 200, { report: result.rows[0].report });
    return;
  }

  if (reportMatch && request.method === "DELETE") {
    const id = decodeURIComponent(reportMatch[1]);
    const result = await pool.query(`
      UPDATE jira_kpi_reports
      SET deleted_at = COALESCE(deleted_at, NOW()), updated_at = NOW()
      WHERE id = $1
      RETURNING deleted_at
    `, [id]);
    if (!result.rowCount) throw httpError(404, "Report not found");
    sendJson(response, 200, { ok: true, deletedAt: normalizeDate(result.rows[0].deleted_at) });
    return;
  }

  throw httpError(404, "API route not found");
}

async function serveStatic(response, pathname) {
  const relative = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  const absolute = path.resolve(rootDir, `.${relative}`);
  if (!absolute.startsWith(rootDir + path.sep)) throw httpError(403, "Forbidden");
  const fileStat = await stat(absolute).catch(() => null);
  if (!fileStat?.isFile()) throw httpError(404, "Not found");
  const contentType = mimeType(absolute);
  response.writeHead(200, { "Content-Type": contentType });
  createReadStream(absolute).pipe(response);
}

function validateReport(report) {
  if (!report || typeof report !== "object") throw httpError(400, "Report payload is required");
  if (!report.id) throw httpError(400, "Report id is required");
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 30 * 1024 * 1024) throw httpError(413, "Request body is too large");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function toSummary(row) {
  return {
    id: row.id,
    teamName: row.teamName ?? row.team_name ?? "",
    sprintName: row.sprintName ?? row.sprint_name ?? "",
    dateFrom: row.dateFrom ?? row.date_from ?? "",
    dateTo: row.dateTo ?? row.date_to ?? "",
    createdAt: normalizeDate(row.createdAt ?? row.created_at),
    calculationVersion: row.calculationVersion ?? row.calculation_version ?? ""
  };
}

function normalizeDate(value) {
  if (!value) return "";
  return value instanceof Date ? value.toISOString() : String(value);
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function statusFor(error) {
  return error.status || (error instanceof SyntaxError ? 400 : 500);
}

function mimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  }[extension] || "application/octet-stream";
}
