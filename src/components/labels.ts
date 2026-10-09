// Русские подписи для значений, которые показываются в нескольких местах интерфейса.

export const CONFIDENCE_LABELS = { LOW: "Низкая", MEDIUM: "Средняя", HIGH: "Высокая" } as const;
export const RISK_LABELS = { LOW: "Низкий", MEDIUM: "Средний", HIGH: "Высокий" } as const;

export const SOURCE_STATUS_LABELS: Record<string, string> = {
  CONNECTED: "Подключён",
  NOT_CONNECTED: "Не подключён",
  ERROR: "Ошибка",
  DISABLED: "Отключён",
};

export const RUN_STATUS_LABELS: Record<string, string> = {
  QUEUED: "В очереди",
  RUNNING: "Выполняется",
  SUCCESS: "Успешно",
  PARTIAL: "С ошибками в данных",
  FAILED: "Ошибка",
};

export const RUN_TRIGGER_LABELS: Record<string, string> = {
  SCHEDULED: "По расписанию",
  MANUAL: "Вручную",
  CLI: "Команда",
};

export const SCOPE_LABELS: Record<string, string> = {
  SAME_COMPLEX: "Тот же ЖК",
  SAME_MICRODISTRICT: "Тот же микрорайон",
  SAME_DISTRICT_SIMILAR_BUILDING: "Район, похожий дом",
  SAME_DISTRICT: "Район, та же эпоха застройки",
};
