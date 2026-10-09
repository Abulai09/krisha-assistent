import { z } from "zod";
import type { ValuationExplanation } from "@/domain/valuation/types";

// Объяснение хранится в JSON-колонке. При чтении проверяем форму:
// старые записи или ручные правки в БД не должны ронять страницу.

const stringList = z.array(z.string()).catch([]);

const explanationSchema = z.object({
  scope: z.enum(["SAME_COMPLEX", "SAME_MICRODISTRICT", "SAME_DISTRICT_SIMILAR_BUILDING", "SAME_DISTRICT"]).nullable().catch(null),
  comparablesUsed: z.number().catch(0),
  comparablesExcluded: z.number().catch(0),
  medianPricePerSqm: z.string().nullable().catch(null),
  pricePerSqmLow: z.string().nullable().catch(null),
  pricePerSqmHigh: z.string().nullable().catch(null),
  positives: stringList,
  negatives: stringList,
  differences: stringList,
  missingFields: stringList,
  caveats: stringList,
});

export function readExplanation(value: unknown): ValuationExplanation {
  const parsed = explanationSchema.safeParse(value);
  return parsed.success ? parsed.data : explanationSchema.parse({});
}
