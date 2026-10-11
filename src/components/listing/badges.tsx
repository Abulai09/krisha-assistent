import { Badge } from "@/components/ui/badge";
import { formatPercent } from "@/domain/format";
import { cn } from "@/lib/utils";

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
