import Link from "next/link";
import { EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <EmptyState
      title="Страница не найдена"
      description="Возможно, объявление удалено из базы или ссылка устарела."
      action={
        <Button asChild variant="outline">
          <Link href="/listings">К списку квартир</Link>
        </Button>
      }
    />
  );
}
