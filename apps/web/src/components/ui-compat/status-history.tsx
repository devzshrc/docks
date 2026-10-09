"use client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
type StatusLevel = "up" | "degraded" | "down" | "none";
type StatusDay = {
  date: string;
  status?: StatusLevel;
  downtime?: number;
  degraded?: number;
  uptime?: number;
  incidents?: {
    title: string;
    minutes?: number;
    status?: "degraded" | "down";
  }[];
};
const status = (d?: StatusDay) =>
  d?.status ??
  (!d ? "none" : d.downtime ? "down" : d.degraded ? "degraded" : "up");
const labelFor = {
  up: "Operational",
  degraded: "Degraded",
  down: "Unavailable",
  none: "No data",
};
export function StatusBars({
  days,
  label,
  current,
  compact,
}: {
  days: StatusDay[];
  label: string;
  current?: StatusLevel;
  compact?: boolean;
}) {
  const level = current ?? status(days.at(-1));
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-sm">{label}</CardTitle>
          <Badge variant="secondary">{labelFor[level]}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible>
          <AccordionItem value="history" className="border-0">
            <AccordionTrigger>
              Sync history · {days.length} days
            </AccordionTrigger>
            <AccordionContent>
              <div className="max-h-80 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Uptime</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...days].reverse().map((day) => (
                      <TableRow key={day.date}>
                        <TableCell>{day.date}</TableCell>
                        <TableCell>{labelFor[status(day)]}</TableCell>
                        <TableCell>
                          {day.status === "none"
                            ? "—"
                            : `${(day.uptime ?? (1 - (day.downtime ?? 0) / 1440) * 100).toFixed(2)}%`}
                        </TableCell>
                        <TableCell>
                          {day.incidents?.map((i) => i.title).join(" · ") ||
                            "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
