import { connection } from "next/server";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CatalogFiltersForm } from "@/components/listing/catalog-filters";
import { ListingCard } from "@/components/listing/listing-card";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, pluralize } from "@/domain/format";
import {
  effectiveMinDiscount,
  parseCatalogFilters,
  toCatalogQuery,
  type CatalogFilters,
} from "@/lib/validation/catalogFilters";
import { cn } from "@/lib/utils";
import { listCatalog, listComplexOptions } from "@/server/services/listingQueryService";

export const metadata: Metadata = { title: "Квартиры" };

const MODES = [
  { value: "deal", label: "Самые выгодные", title: "По Deal Score: скидка с учётом надёжности оценки и рисков" },
  { value: "discount", label: "Самая большая скидка", title: "Самые дешёвые относительно рынка — по проценту скидки" },
] as const;

export default function ListingsPage(props: PageProps<"/listings">) {
  return (
    <>
      <PageHeader
        title="Квартиры"
        description="Квартиры, которые дешевле похожих объявлений поблизости."
      />
      <Suspense fallback={<CatalogSkeleton />}>
        <Catalog searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Catalog({ searchParams }: Pick<PageProps<"/listings">, "searchParams">) {
  await connection();
  const filters = parseCatalogFilters(await searchParams);
  const catalog = await listCatalog(filters);
  const complexes = await listComplexOptions(catalog.realm);
  const minDiscount = effectiveMinDiscount(filters);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside aria-label="Фильтры" className="lg:sticky lg:top-4 lg:self-start">
        <CatalogFiltersForm filters={filters} complexes={complexes} activeCount={countActiveFilters(filters)} />
      </aside>

      <section aria-labelledby="results-heading" className="min-w-0 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <ModeTabs filters={filters} />
        <p id="results-heading" className="text-sm text-muted-foreground" aria-live="polite">
          {catalog.total === 0
            ? "Ничего не найдено"
            : `Найдено ${formatNumber(catalog.total)} ${pluralize(catalog.total, ["квартира", "квартиры", "квартир"])}`}
          {minDiscount !== null && ` со скидкой от ${minDiscount}%`}
        </p>
        </div>

        {catalog.realm === "empty" ? (
          <EmptyState
            title="Объявлений пока нет"
            description="База пуста. Данные появятся после первого обновления источника или импорта файла."
            action={
              <Button asChild variant="outline">
                <Link href="/admin">Перейти в управление</Link>
              </Button>
            }
          />
        ) : catalog.items.length === 0 ? (
          <EmptyState
            title="По этим условиям квартир нет"
            description={
              minDiscount !== null
                ? "Попробуйте снизить минимальную скидку или убрать часть фильтров."
                : "Попробуйте убрать часть фильтров."
            }
            action={
              <Button asChild variant="outline">
                <Link href={`/listings${toCatalogQuery({ mode: filters.mode, discount: "any" })}`}>Показать все объявления</Link>
              </Button>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {catalog.items.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
            <Pagination filters={filters} page={catalog.page} pageCount={catalog.pageCount} />
          </>
        )}
      </section>
    </div>
  );
}

function ModeTabs({ filters }: { filters: CatalogFilters }) {
  return (
    <nav aria-label="Сортировка">
      <div className="inline-flex rounded-lg bg-muted p-1" role="group">
        {MODES.map((mode) => {
          const active = filters.mode === mode.value;
          return (
            <Link
              key={mode.value}
              href={`/listings${toCatalogQuery({ ...stringifyFilters(filters), mode: mode.value, page: undefined })}`}
              aria-current={active ? "true" : undefined}
              title={mode.title}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
                active ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {mode.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function Pagination({ filters, page, pageCount }: { filters: CatalogFilters; page: number; pageCount: number }) {
  if (pageCount <= 1) return null;
  const href = (target: number) => `/listings${toCatalogQuery({ ...stringifyFilters(filters), page: target })}`;
  return (
    <nav aria-label="Страницы" className="flex items-center justify-between gap-2 pt-2">
      {page > 1 ? (
        <Button asChild variant="outline">
          <Link href={href(page - 1)}>← Назад</Link>
        </Button>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted-foreground">
        Страница {page} из {pageCount}
      </span>
      {page < pageCount ? (
        <Button asChild variant="outline">
          <Link href={href(page + 1)}>Дальше →</Link>
        </Button>
      ) : (
        <span />
      )}
    </nav>
  );
}

function stringifyFilters(filters: CatalogFilters): Record<string, string | number | undefined> {
  return Object.fromEntries(Object.entries(filters).map(([key, value]) => [key, value as string | number | undefined]));
}

const NON_FILTER_KEYS = new Set(["mode", "page", "discount"]);

function countActiveFilters(filters: CatalogFilters): number {
  return Object.entries(filters).filter(([key, value]) => !NON_FILTER_KEYS.has(key) && value !== undefined).length;
}

function CatalogSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]" aria-busy="true" aria-label="Загрузка">
      <Skeleton className="h-12 rounded-xl lg:h-[36rem]" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-72 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
