import { connection } from "next/server";
import { config } from "@/lib/config";
import { parseReportParams } from "@/lib/report-range";
import { getTimeReport, reportToCsv } from "@/lib/time-report";

// CSV of the report currently on screen: /reports/export?from=…&to=…&client=…&user=…
export async function GET(request: Request) {
  await connection();
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const filter = parseReportParams(params, config.timeZone);
  const csv = reportToCsv(await getTimeReport(filter));
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="time-report_${filter.from}_${filter.to}.csv"`,
    },
  });
}
