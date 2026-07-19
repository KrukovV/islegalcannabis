"use client";

import type { OfficialOwnershipViewModel } from "@/lib/officialSources/officialOwnershipView";

export default function OfficialOwnershipSummary({
  view,
}: {
  view: OfficialOwnershipViewModel;
}) {
  return (
    <section className="sectionCard" data-testid="official-ownership-summary">
      <h2>Сводка владения официальными ссылками</h2>
      <div className="boundaryGrid">
        <div>
          <strong>Исходный защищённый реестр</strong>
          <div>
            {view.rawTotal} / {view.rawTotal}
          </div>
        </div>
        <div>
          <strong>Строк с определённым владельцем</strong>
          <div>{view.resolvedOwnershipTotal}</div>
        </div>
        <div>
          <strong>Эффективных строк владения</strong>
          <div>{view.effectiveRowsTotal}</div>
        </div>
        <div>
          <strong>Отфильтрованных строк</strong>
          <div>{view.filteredRowsTotal}</div>
        </div>
        <div>
          <strong>Исключённых строк</strong>
          <div>{view.excludedRowsTotal}</div>
        </div>
        <div>
          <strong>Итого после фильтрации</strong>
          <div>{view.effectiveTotal}</div>
        </div>
        <div>
          <strong>Глобальных нормативных ссылок</strong>
          <div>{view.globalTotal}</div>
        </div>
        <div>
          <strong>Стран с сильными официальными ссылками</strong>
          <div>{view.countriesWithStrongOfficialLinks}</div>
        </div>
        <div>
          <strong>Стран только со слабыми ссылками</strong>
          <div>{view.countriesWithWeakOnlyOfficialLinks}</div>
        </div>
        <div>
          <strong>Стран только с резервными ссылками</strong>
          <div>{view.countriesWithFallbackOnlyLinks}</div>
        </div>
        <div>
          <strong>Стран с эффективными ссылками</strong>
          <div>{view.countriesWithEffectiveLinks}</div>
        </div>
        <div>
          <strong>Исключённых защищённых ссылок</strong>
          <div>{view.excludedProtectedTotal}</div>
        </div>
        <div>
          <strong>Запрещённых и отфильтрованных</strong>
          <div>{view.bannedFilteredTotal}</div>
        </div>
        <div>
          <strong>С неизвестным владельцем</strong>
          <div>{view.unknownOwnershipTotal}</div>
        </div>
        <div>
          <strong>Несколько GEO / глобальные</strong>
          <div>
            {view.multiGeoTotal} / {view.globalTotal}
          </div>
        </div>
        <div>
          <strong>Стран без эффективных ссылок</strong>
          <div>{view.countriesWithoutEffectiveLinks}</div>
        </div>
        <div>
          <strong>Стран с 2+ эффективными ссылками</strong>
          <div>{view.countriesWithMultipleEffectiveLinks}</div>
        </div>
        <div>
          <strong>Штатов с эффективными ссылками</strong>
          <div>{view.statesWithEffectiveLinks}</div>
        </div>
      </div>
      <p className="sectionHint">
        Строки исходного реестра защищены от уменьшения. Для покрытия и признака
        «официальный: да» учитываются только эффективные строки, совпавшие с
        владельцем GEO. Глобальные нормативные ссылки видимы, но не считаются
        официальными ссылками конкретной страны.
      </p>
    </section>
  );
}
