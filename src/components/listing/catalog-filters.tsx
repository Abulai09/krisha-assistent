import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { CONDITION_LABELS, CONDITIONS, DISTRICT_LABELS, DISTRICTS } from "@/domain/listing/enums";
import { DEFAULT_MIN_DISCOUNT, type CatalogFilters } from "@/lib/validation/catalogFilters";
import type { ComplexOption } from "@/server/services/listingQueryService";
import { FiltersDisclosure } from "./filters-disclosure";

/**
 * Фильтры — обычная GET-форма: работает без JavaScript, а состояние живёт в URL,
 * поэтому подборку можно сохранить в закладки или отправить ссылкой.
 * На телефоне фильтры свёрнуты, чтобы список был виден сразу; на широком экране раскрыты.
 */
export function CatalogFiltersForm({
  filters,
  complexes,
  activeCount,
}: {
  filters: CatalogFilters;
  complexes: ComplexOption[];
  activeCount: number;
}) {
  const discountValue = filters.discount === undefined ? String(DEFAULT_MIN_DISCOUNT) : String(filters.discount);

  return (
    <FiltersDisclosure className="group rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 font-medium">
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          Фильтры{activeCount > 0 ? ` (${activeCount})` : ""}
        </span>
        <span className="text-sm text-muted-foreground group-open:hidden">Показать</span>
        <span className="hidden text-sm text-muted-foreground group-open:inline">Скрыть</span>
      </summary>
      <form method="get" action="/listings" className="space-y-4 border-t px-4 pt-4 pb-4">
        <input type="hidden" name="mode" value={filters.mode} />

        <Field label="Скидка к рынку от" htmlFor="discount">
          <NativeSelect id="discount" name="discount" defaultValue={discountValue} className="w-full">
            <NativeSelectOption value="any">Все объявления</NativeSelectOption>
            {[0, 5, 8, 10, 15, 20].map((value) => (
              <NativeSelectOption key={value} value={String(value)}>
                {value}%{value === DEFAULT_MIN_DISCOUNT ? " (по умолчанию)" : ""}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Район" htmlFor="district">
          <NativeSelect id="district" name="district" defaultValue={filters.district ?? ""} className="w-full">
            <NativeSelectOption value="">Все районы</NativeSelectOption>
            {DISTRICTS.map((district) => (
              <NativeSelectOption key={district} value={district}>
                {DISTRICT_LABELS[district]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Комнат" htmlFor="rooms">
          <NativeSelect id="rooms" name="rooms" defaultValue={filters.rooms ?? ""} className="w-full">
            <NativeSelectOption value="">Любое</NativeSelectOption>
            {["1", "2", "3", "4", "5"].map((rooms) => (
              <NativeSelectOption key={rooms} value={rooms}>
                {rooms === "5" ? "5 и более" : rooms}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>

        <RangeField label="Цена, млн ₸" name="price" min={filters.priceMin} max={filters.priceMax} step="0.1" />
        <RangeField label="Площадь, м²" name="area" min={filters.areaMin} max={filters.areaMax} step="1" />

        <Field label="Deal Score от" htmlFor="scoreMin">
          <Input id="scoreMin" name="scoreMin" type="number" inputMode="numeric" min={0} max={100} placeholder="0–100" defaultValue={filters.scoreMin} />
        </Field>

        <Field label="Состояние" htmlFor="condition">
          <NativeSelect id="condition" name="condition" defaultValue={filters.condition ?? ""} className="w-full">
            <NativeSelectOption value="">Любое</NativeSelectOption>
            {CONDITIONS.map((condition) => (
              <NativeSelectOption key={condition} value={condition}>
                {CONDITION_LABELS[condition]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>

        <Field label="ЖК" htmlFor="complex">
          <NativeSelect id="complex" name="complex" defaultValue={filters.complex ?? ""} className="w-full">
            <NativeSelectOption value="">Любой</NativeSelectOption>
            {complexes.map((complex) => (
              <NativeSelectOption key={complex.key} value={complex.key}>
                {complex.name} ({complex.count})
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Этаж" htmlFor="floor">
          <NativeSelect id="floor" name="floor" defaultValue={filters.floor ?? ""} className="w-full">
            <NativeSelectOption value="">Любой</NativeSelectOption>
            <NativeSelectOption value="not_first">Не первый</NativeSelectOption>
            <NativeSelectOption value="not_last">Не последний</NativeSelectOption>
            <NativeSelectOption value="middle">Не первый и не последний</NativeSelectOption>
          </NativeSelect>
        </Field>

        <RangeField label="Год постройки" name="year" min={filters.yearMin} max={filters.yearMax} step="1" />

        <Field label="Уверенность оценки" htmlFor="confidence">
          <NativeSelect id="confidence" name="confidence" defaultValue={filters.confidence ?? ""} className="w-full">
            <NativeSelectOption value="">Любая</NativeSelectOption>
            <NativeSelectOption value="MEDIUM">Средняя и высокая</NativeSelectOption>
            <NativeSelectOption value="HIGH">Только высокая</NativeSelectOption>
          </NativeSelect>
        </Field>

        <Field label="Уровень риска" htmlFor="risk">
          <NativeSelect id="risk" name="risk" defaultValue={filters.risk ?? ""} className="w-full">
            <NativeSelectOption value="">Любой</NativeSelectOption>
            <NativeSelectOption value="MEDIUM">Низкий и средний</NativeSelectOption>
            <NativeSelectOption value="LOW">Только низкий</NativeSelectOption>
          </NativeSelect>
        </Field>

        <Field label="Опубликовано" htmlFor="published">
          <NativeSelect id="published" name="published" defaultValue={filters.published ?? ""} className="w-full">
            <NativeSelectOption value="">За всё время</NativeSelectOption>
            <NativeSelectOption value="1">За сутки</NativeSelectOption>
            <NativeSelectOption value="7">За неделю</NativeSelectOption>
            <NativeSelectOption value="30">За месяц</NativeSelectOption>
            <NativeSelectOption value="90">За 3 месяца</NativeSelectOption>
          </NativeSelect>
        </Field>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1">
            Показать
          </Button>
          <Button asChild variant="outline">
            <Link href={filters.mode === "discount" ? "/listings?mode=discount" : "/listings"}>Сбросить</Link>
          </Button>
        </div>
      </form>
    </FiltersDisclosure>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function RangeField({ label, name, min, max, step }: { label: string; name: string; min?: number; max?: number; step: string }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex items-center gap-2">
        <Input name={`${name}Min`} type="number" inputMode="decimal" step={step} min={0} placeholder="от" aria-label={`${label}: от`} defaultValue={min} />
        <span className="text-muted-foreground" aria-hidden="true">
          –
        </span>
        <Input name={`${name}Max`} type="number" inputMode="decimal" step={step} min={0} placeholder="до" aria-label={`${label}: до`} defaultValue={max} />
      </div>
    </fieldset>
  );
}
