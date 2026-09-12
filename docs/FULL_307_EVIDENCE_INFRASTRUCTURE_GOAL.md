# Общая цель: актуальная доказательная эксплуатация для 307 GEO

## Назначение

На основе уже принятой локальной инфраструктуры создать полную, воспроизводимую, актуализированную и юридически честную эксплуатацию знаний о каннабис-праве для всех канонических `307/307` территорий. Продукт отвечает не только на вопрос о текущем правовом выводе, но и показывает, **почему** он сделан, к какой территории и действию применим, когда проверялись источники, что изменилось, что ожидает ревью и почему запись магазина может не попасть на карту.

Это не каталог мест покупки, не база лидов и не механизм продажи места на карте. Основа продукта — доказательная цепочка: текущий вывод → применимая официальная норма → цитата и источник → scope и lifecycle → дата проверки → история изменений → честная граница неизвестности.

Техническая полнота Passport `307/307` не равна юридической актуальности `307/307`. Цель считается завершённой только после закрытия или явной честной классификации каждого source/effective-date/semantic/visual/access review, фиксации реальных дат и прохождения полного regression из воспроизводимо доставленной Git-ветки.

## Полный локальный результат

### 1. Evidence Passport для каждого GEO

Для каждого из `307/307` GEO должен существовать воспроизводимый Evidence Passport в трёх представлениях: JSON, print/PDF и script-free embed-card. Каждый Passport содержит:

- current Legal Truth conclusion, confidence и summary;
- отдельный map-display direction, явно не подменяющий Legal Truth, включая `UNKNOWN`;
- rule, territorial applicability, scope, legal effective state и source owner;
- все текущие map/popup/SEO citations с оригинальной ссылкой, цитатой или ограниченной аннотацией;
- source checked-at/access state, source-change и pending-review признаки;
- canonical projection version и content hash;
- явное указание, что status, существенные ограничения и primary official links остаются бесплатными.

### 2. Source Freshness Passport

Для каждого GEO существует public-ready локальная поверхность свежести источников. Она отдельно показывает:

- когда каждый retained official source проверен;
- когда обнаружено изменение content, owner или final URL;
- когда и почему открыт semantic, visual или effective-date review;
- когда опубликован текущий canonical legal conclusion;
- когда предыдущего canonical baseline ещё нет.

Отсутствующая дата остаётся `NOT_RECORDED`. Её нельзя выдумывать из mtime файла, legacy map/SEO/SSOT, попытки fetch, runtime `/api/build-meta` fallback без immutable deployment receipt или иной косвенной метадаты.

### 3. Immutable Snapshot Ledger, Change Monitor и Watchlist

Append-only ledger хранит только реальные версии canonical legal projection для полного `307/307` набора. Он начинается с одного честного baseline и не реконструирует историю из legacy map, SEO, SSOT или profile данных.

Change Monitor и Watchlist показывают три взаимоисключающих класса событий:

| Класс | Значение |
| --- | --- |
| `SOURCE_CHANGE` | Изменился источник, owner или final URL; это не правовой вывод. |
| `PENDING_REVIEW` | Источник ждёт semantic, visual, effective-date или access review; это не правовой вывод. |
| `CANONICAL_LEGAL_CONCLUSION_CHANGE` | Две реальные canonical versions различаются по current legal colour или rule. |

Professional changelog для каждого события хранит время, GEO, old/new evidence identity и класс. Только `CANONICAL_LEGAL_CONCLUSION_CHANGE` содержит отдельно датированную публикацию вывода и prior/current rule или colour. До реального сравнения двух versions не создаётся ни один выдуманный legal-change event.

Каждый source/pending event открывает отдельную immutable review operation. C1-доступность, HTTP 304, совпадение байтов, redirect или новый fetch-state не закрывают semantic, effective-date, visual, applicability или source-change review. Resolution добавляется только после явной человеческой evidence-review с reviewer identity, проверенной ссылкой, заметкой и реальной датой закрытия, которая не может быть существенно в будущем. Перед закрытием sole resolver проверяет весь schema-v5 registry и пересчитывает каждый current payload/preimage/hash. Закрытие привязано одновременно к exact latest attempt ID, signal-identity SHA-256 и SHA-256 точных байтов registry; exclusive owned lock, staged durability write, pre-rename exact-byte CAS и atomic rename отклоняют future-dated/stale/tampered/concurrent/cross-operation state и сохраняют foreign lock/bytes. Каждый новый attempt хранит полный канонический signal payload, его воспроизводимый hash и exact identity preimage; исторические поля, которых в старом событии не было, остаются явно `NOT_RECORDED`, а не восстанавливаются догадкой. `CONFIRMED_CURRENT` и `SUPERSEDED` остаются только исходами source-review, не подтверждают автоматически актуальность закона и не меняют Legal Truth. Закрытая текущая операция исчезает из active Source/Pending очереди, но навсегда остаётся в append-only history.

Локальный read-only Source Review Workbench schema v3 показывает current active, historical open и explicitly resolved операции отдельно, раскрывает полную ordered attempt history и exact close tokens из тех же байтов registry, а для current source — только реально сохранённые owner/applicability, exact fragment, current/effective, visual/screenshot, evidence-scope и confidence поля. Отсутствующее значение остаётся `NOT_RECORDED`, без догадки по другому source/GEO. Workbench фильтрует по canonical GEO, категории, lifecycle и exact operation ID, не имеет write API и отсутствует на production.

Watchlist принимает только канонические GEO. Неизвестный идентификатор одинаково отклоняется UI и API, остаётся видимым пользователю для исправления и никогда не расширяет результат до всех 307 GEO.

### 4. «Почему листика нет?»

Для каждого GEO с сохранёнными, но невыведенными Store Truth records существует public-ready локальная страница с агрегированными fail-closed причинами:

- legal/store-type eligibility;
- lifecycle;
- официальный адрес;
- точная авторитетная координата;
- официальный источник.

Страница не раскрывает точку скрытой записи, не предполагает operating status и не превращает отсутствие листика в утверждение, что магазинов в территории нет.

### 5. Correction request

Стандартный локальный correction request позволяет бизнесу прислать лицензию или официальный источник. Заявка — только untrusted candidate с receipt, provenance, review и outcome state.

Она не изменяет source ledger, Legal Truth, Store record, координаты, eligibility, leaf, map position или ranking до независимой проверки по существующим legal и Store Truth gates. После отдельного человеческого решения `APPROVED_FOR_MANUAL_HANDOFF` canonical handoff повторно проверяет receipt/candidate и source registry на commit boundary, затем связывает exact candidate hash только с уже существующей unresolved source-review operation того же GEO и exact registry hash. Handoff и вся review-цепочка используют fixed lock order, exact-bytes compare-and-swap, staged-file/parent-directory durability sync и exact-owner-only recovery; повтор того же handoff идемпотентен, stale/conflicting/resolved-target/cross-GEO запись отклоняется. Платёж, обещание размещения или приоритет заявителю отсутствуют.

### 6. Editorial legal localisation

Локализация legal assertion публикуется только после editorial review и сохраняет:

- оригинальную official citation и source-language fragment;
- territorial scope, lifecycle и disclaimer;
- границу между current conclusion, supplementary context и historical/profile material.

Machine translation может помочь подготовить draft, но не может самостоятельно публиковать правовой вывод, убирать исключение или заменять источник. Registry — append-only цепочка `DRAFT -> APPROVED -> SUPERSEDED`: каждый event имеет deterministic ID/content hash и `previousEventSha256`, localisation ID глобально уникален, broken/duplicate/tampered chain недействителен; draft не публикуется; approval привязан к exact Passport version/payload, citation, original-fragment, scope и disclaimer hashes; superseded или Passport-drifted approval немедленно перестаёт быть текущей публикацией до нового editorial approval.

## Измеримая приёмка

- `307/307` Passports совпадают с canonical static projection по current status, summary, scope, citations и version identity.
- Для `307/307` GEO созданы проверяемые JSON, print/PDF и embed представления; committed deterministic manifest содержит их content hashes и canonical projection version. Bulk PDF остаются вне репозитория или в disposable build output.
- Между distinct official URLs и owner GEO нет cross-jurisdiction collision пары «цитата + аннотация».
- Freshness и changelog не смешивают source events, pending reviews и canonical legal changes; один baseline даёт `0` legal-change events.
- Controlled two-version fixture доказывает, что all-GEO comparator показывает только реально изменённый GEO и верный event class.
- Вторая canonical version может быть записана только с immutable publication receipt: exact version, canonical UTC published-at строго новее предыдущей записанной публикации, exact 40-hex commit SHA, build ID, actor и exact prior-ledger bytes SHA-256; append использует exclusive lock, staged exact-byte CAS и atomic rename, а tampered receipt/snapshot hash отклоняется до записи. При каждом reload каждый последующий receipt проверяется против SHA-256 канонической сериализации всего предшествующего snapshot-prefix; повторная подпись ложной истории запрещена.
- Invalid Watchlist даёт одинаковое fail-closed поведение в UI и API и не расширяет выдачу.
- «Почему листика нет?» охватывает все GEO с blocked saved Store records, использует только агрегированные reason categories и не раскрывает скрытые координаты.
- Correction request проходит сквозной local proof как untrusted candidate и доказывает отсутствие автоматической мутации любого truth, store или map слоя.
- Каждый локализованный legal assertion имеет editor-review provenance и полный оригинальный citation/scope/disclaimer набор.
- После реализации обязательный local regression проходит lint до smoke; smoke не имеет failed/skipped, а receipt содержит `POST_CHECKS_OK=1` и `HUB_STAGE_REPORT_OK=1`.
- Каждый зарегистрированный `SOURCE_CHANGE` и effective-date review имеет датированное учётное состояние и ссылку на проверенное официальное доказательство. `ACCESS_BLOCKED`, `APPLICABILITY_UNRESOLVED` и `CANONICAL_REVIEW_REQUIRED` — открытые fail-closed классификации, а не resolution. Только отдельно выполненное human evidence review с обязательной provenance может добавить source-review outcome `CONFIRMED_CURRENT` или `SUPERSEDED`; ни одно событие не остаётся неучтённым.
- Каждый оставшийся pending review по всем 307 GEO имеет явную категорию, дату открытия, последнюю попытку проверки, причину незавершённости и безопасное влияние на публикацию. Число неописанных pending review равно `0`.
- `Apply state` не используется как пользовательское обозначение применимости закона: интерфейс явно называет этот факт publication/reconciliation gate и отдельно показывает Legal Truth.
- Реальные source-check/change/review/publication dates имеют provenance; `NOT_RECORDED` остаётся там, где доказуемой даты нет. Каждая вторая и последующая immutable canonical version требует явной реальной publication date и становится полноценной Passport history entry.
- Correction queue имеет сквозной audited lifecycle без автоматической мутации truth/store/map слоёв; одобрение означает только ожидание ручной canonical-передачи, а записанный handoff ссылается только на существующую same-GEO review operation. Опубликованные локализации имеют editor provenance и exact source/Passport binding. Нулевая публикация честнее неподтверждённого перевода.
- Доставка воспроизводима из чистой ветки на базе актуального `origin/main`; смешанные исторические изменения не подменяют уже опубликованный production hotfix.

## Неподвижные инварианты

- Legal Truth и `TRUTH_MAP_DISPLAY_COLOR` — разные слои. Display direction никогда не повышает, не скрывает и не заменяет legal conclusion.
- Timeout, redirect, access failure, profile edit, отсутствие координаты, отсутствие source-check даты, перевод или бизнес-заявка никогда сами по себе не образуют правовой вывод.
- Current legal status, material restrictions и primary official links остаются бесплатными.
- Нельзя продавать leaf, ranking, map position или `verified` badge.
- Weedmaps-подобный коммерческий каталог, scraped business listing, контакты, владельцы и лиды не являются Legal Truth или Store Truth.
- Store Truth остаётся независимым и fail-closed; коррекция не обходит eligibility, lifecycle, address, coordinate или source gates.
- Public production не получает AI, Social, DM, audit UI или B2B-локальные маршруты в рамках этой цели.
- Нет Google Ads до письменного policy decision по exact copy, destination и geography.
- Нет Stripe, другого billing, pricing, account provisioning, commercial data licensing или sales outreach до отдельных письменных разрешений и provider-specific classification.
- Локальная приёмка public-ready интерфейсов не является разрешением на production deployment.
- Publication ledger, correction-review и localisation registry изменяются только exclusive-lock + staged exact-byte CAS + atomic rename writers; чужой lock не удаляется, stale bytes не перезаписываются.

## Граница текущей задачи

Юридическая актуализация может изменить canonical Legal Truth только через существующий независимый 307-GEO review/apply contract и только при полном применимом официальном доказательстве; сама Passport/B2B-инфраструктура ничего не решает и не применяет. Store Truth, координаты и платное размещение остаются вне этого процесса. Работа принимается локально и в reviewable Git-ветке; перенос интерфейсов или новых legal projections в production, billing, реклама и коммерческие отношения требуют отдельного авторизованного release scope и самостоятельной production-приёмки.
