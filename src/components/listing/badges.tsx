import { Badge } from "@/components/ui/badge";
import { CONFIDENCE_LABELS, RISK_LABELS } from "@/components/labels";
import { formatPercent } from "@/domain/format";
import { cn } from "@/lib/utils";

type Level = "LOW" | "MEDIUM" | "HIGH";

/** Скидка относительно рынка. Цвет дублируется знаком и словом — не полагаемся только на цвет. */
export function DiscountBadge({ percent, className }: { percent: number | null; className?: string }) {
  if (percent === null) {
    return (
      <Badge variant="outline" className={className}>
        Нет оценки
      </Badge>
    );
  }
  const below = percent > 0;
  return (
    <Badge
      variant="outline"
      className={cn(
        "tabular border-transparent font-semibold",
        below ? "bg-positive-muted text-positive" : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {below ? `−${formatPercent(percent)} к рынку` : `+${formatPercent(Math.abs(percent))} к рынку`}
    </Badge>
  );
}

export function ConfidenceBadge({ level }: { level: Level | null }) {
  if (!level) return null;
  return (
    <Badge variant="outline" className={cn(level === "LOW" && "border-warning/50 text-warning")}>
      Уверенность: {CONFIDENCE_LABELS[level].toLowerCase()}
    </Badge>
  );
}

export function RiskBadge({ level }: { level: Level | null }) {
  if (!level) return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        level === "HIGH" && "border-transparent bg-danger-muted text-destructive",
        level === "MEDIUM" && "border-transparent bg-warning-muted text-warning",
      )}
    >
      Риск: {RISK_LABELS[level].toLowerCase()}
    </Badge>
  );
}

/** Deal Score 0–100: число + полоска. Число — главное, полоска — для быстрого сравнения карточек. */
export function DealScore({ score, size = "default" }: { score: number | null; size?: "default" | "lg" }) {
  if (score === null) return <span className="text-sm text-muted-foreground">Deal Score —</span>;
  return (
    <div className="flex items-center gap-2" aria-label={`Deal Score ${score} из 100`}>
      <span className={cn("tabular font-semibold", size === "lg" ? "text-3xl" : "text-base")}>{score}</span>
      <div className={cn("h-1.5 overflow-hidden rounded-full bg-muted", size === "lg" ? "w-24" : "w-12")} aria-hidden="true">
        <div
          className={cn("h-full rounded-full", score >= 70 ? "bg-positive" : score >= 45 ? "bg-foreground/60" : "bg-muted-foreground/40")}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}
