import type { Severity, Upload } from "@/app/lib/types";

export interface LibraryRow extends Upload {
  totalEvents: number;
  bySeverity: Record<Severity, number>;
}
