import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEAL_SCORE_WEIGHTS, FULL_SCORE_DISCOUNT_BP, RISK_PENALTIES } from "@/domain/deals/dealScore";
import { COMPARABLE_RULES } from "@/domain/valuation/comparables";
import { STANDARD_CAVEATS } from "@/domain/valuation/explanation";
import { WARNING_CODES, WARNING_DESCRIPTIONS, WARNING_LABELS } from "@/domain/valuation/warnings";
import { DEFAULT_MIN_DISCOUNT } from "@/lib/validation/catalogFilters";

export const metadata: Metadata = { title: "Как считаем" };

const percent = (weight: number) => `${Math.round(weight * 100)}%`;

export default function MethodologyPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Как считается оценка"
        description="Прозрачный статистический алгоритм без «чёрного ящика» и платных AI-сервисов. Все числа ниже взяты из кода, который реально считает оценки."
      />

      <div className="space-y-6 text-sm leading-relaxed">
        <Section id="data" title="Откуда данные">
          <p>
            Пользовательское соглашение Krisha.kz (п. 5.3, 5.5.6, 8.1) запрещает автоматизированный доступ к сайту и
            извлечение объявлений без письменного разрешения АО «Колёса». Публичного API нет. Поэтому сервис{" "}
            <strong>не собирает данные с Krisha.kz</strong> и не обходит защиту сайта.
          </p>
          <p>Сейчас доступны два способа получить данные:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Импорт CSV/JSON</strong> — для данных, на использование которых у вас есть права (собственная выгрузка,
              данные партнёра по договору).
            </li>
            <li>
              <strong>Синтетические тестовые данные</strong> — вымышленные объявления для проверки работы сервиса. Они
              всегда помечены и никогда не смешиваются с реальными.
            </li>
          </ul>
          <p>Когда появится разрешённый API, его достаточно подключить как новый источник — остальная система не изменится.</p>
        </Section>

        <Section title="1. Поиск аналогов">
          <p>Квартира сравнивается не со средней ценой по Алматы, а с максимально похожими объявлениями:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>только продажа квартир, тот же район и то же количество комнат (5+ — одна группа);</li>
            <li>площадь отличается не более чем на {percent(COMPARABLE_RULES.maxAreaDifference)};</li>
            <li>объявление видели не позже {COMPARABLE_RULES.maxComparableAgeDays} дней назад, оно не дубликат;</li>
            <li>
              цена за м² в правдоподобном диапазоне ({(Number(COMPARABLE_RULES.minPricePerSqm) / 1000).toLocaleString("ru-RU")}–
              {(Number(COMPARABLE_RULES.maxPricePerSqm) / 1000).toLocaleString("ru-RU")} тыс. ₸).
            </li>
          </ul>
          <p>Затем перебираются уровни близости — берётся первый, где набралось минимум {COMPARABLE_RULES.minComparables} аналогов:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>тот же ЖК;</li>
            <li>тот же микрорайон и похожий дом (тип дома, год постройки ±{COMPARABLE_RULES.maxYearDifference} лет);</li>
            <li>тот же район и похожий дом;</li>
            <li>тот же район и та же эпоха застройки (до 1991, 1991–2010, после 2010).</li>
          </ol>
          <p>
            Сначала все уровни проверяются только среди квартир с тем же классом ремонта (без ремонта / средний / с
            ремонтом): разница в ремонте даёт до 20–25% в цене — больше, чем разница между соседними ЖК. Если таких
            аналогов не хватает, используются квартиры с другим ремонтом, и оценка получает предупреждение.
          </p>
          <p>
            Если подходящих аналогов меньше {COMPARABLE_RULES.minComparables}, показывается «Недостаточно данных для
            надёжной оценки» — рыночная цена не придумывается.
          </p>
        </Section>

        <Section title="2. Рыночная цена">
          <p>
            Из уровня берутся до {COMPARABLE_RULES.maxComparables} самых похожих аналогов. Выбросы — аномально дорогие или
            дешёвые объявления — отсекаются правилом межквартильного размаха (IQR × 1,5) и полосой ±45% от медианы.
          </p>
          <p>
            Цена за м² — <strong>взвешенная медиана</strong> аналогов: более похожие (по площади, ремонту, году и типу дома,
            этажу, свежести) весят больше. Медиана устойчива к единичным ошибкам. Диапазон рыночной стоимости — 25-й и
            75-й перцентили.
          </p>
          <Formula>рыночная стоимость = цена за м² аналогов × площадь квартиры</Formula>
          <Formula>скидка, % = (рыночная стоимость − цена объявления) / рыночная стоимость × 100</Formula>
          <Formula>потенциальная разница = рыночная стоимость − цена объявления</Formula>
          <p>Все деньги считаются в целых тенге без плавающей точки. Пример: при цене 42 000 000 ₸ и рынке 47 000 000 ₸ скидка 10,64%, разница 5 000 000 ₸.</p>
        </Section>

        <Section title="3. Уверенность оценки">
          <p>Число от 0 до 100 из четырёх частей: количество аналогов (30%), согласованность их цен (30%), близость уровня поиска (25%) и средняя похожесть (15%).</p>
          <p>70 и выше — высокая, 45–69 — средняя, ниже 45 — низкая.</p>
        </Section>

        <Section title="4. Deal Score">
          <p>Рейтинг от 0 до 100:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>скидка относительно рынка — {percent(DEAL_SCORE_WEIGHTS.discount)} (максимум при скидке {Number(FULL_SCORE_DISCOUNT_BP) / 100}% и выше);</li>
            <li>уверенность оценки — {percent(DEAL_SCORE_WEIGHTS.confidence)};</li>
            <li>свежесть объявления — {percent(DEAL_SCORE_WEIGHTS.freshness)};</li>
            <li>полнота характеристик — {percent(DEAL_SCORE_WEIGHTS.completeness)}.</li>
          </ul>
          <p>Затем вычитаются штрафы за риски:</p>
          <ul className="list-disc space-y-1 pl-5">
            {Object.entries(RISK_PENALTIES).map(([code, penalty]) => (
              <li key={code}>
                {WARNING_LABELS[code as keyof typeof WARNING_LABELS]} — −{penalty}
              </li>
            ))}
          </ul>
          <p>
            Ликвидность не учитывается: обоснованных данных о сроках продажи нет. Режим «Самые выгодные» сортирует по Deal
            Score, режим «Самые дешёвые относительно рынка» — по скидке. По умолчанию показываются объявления со скидкой от{" "}
            {DEFAULT_MIN_DISCOUNT}% — это ориентир, а не гарантия выгоды.
          </p>
        </Section>

        <Section title="5. Предупреждения">
          <dl className="space-y-2">
            {WARNING_CODES.map((code) => (
              <div key={code}>
                <dt className="font-medium">{WARNING_LABELS[code]}</dt>
                <dd className="text-muted-foreground">{WARNING_DESCRIPTIONS[code]}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title="Ограничения">
          <ul className="list-disc space-y-1 pl-5">
            {STANDARD_CAVEATS.map((caveat) => (
              <li key={caveat}>{caveat}</li>
            ))}
            <li>Данные о реальных сделках недоступны, поэтому завышенные цены предложения на рынке завышают и оценку.</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-4">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function Formula({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md bg-muted px-3 py-2 font-mono text-xs sm:text-sm">{children}</p>;
}
