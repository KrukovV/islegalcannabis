#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REAUDIT_PATH = "data/reviews/wiki-truth-grey-color-reaudit-39.json";
const REVIEWS_PATH = "data/official/cannabis_law_visual_reviews.audit.json";
const read = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const write = (relativePath, value) => fs.writeFileSync(path.join(ROOT, relativePath), `${JSON.stringify(value, null, 2)}\n`);

const resolutions = {
  SCR: {
    reviewedAt: "2026-07-19T22:46:00.000Z",
    color: "ILLEGAL",
    method: "ALL_VISUALLY_VERIFIED_CLAIMANT_REGIMES_CONVERGE",
    reasonRu: "Свежая визуальная перепроверка закрывает SCR красным без выбора спорного суверена. Philippines RA 9522 относит Bajo de Masinloc / Scarborough Shoal к островам под заявленной юрисдикцией Philippines, а RA 9165 прямо определяет cannabis/marijuana/Indian hemp и устанавливает строгие уголовные запреты и наказания. Официальная китайская ветка заявляет Huangyan Island территорией China, а Criminal Law PRC в статьях 351 и 357 прямо называет marijuana и предусматривает строгую уголовную ответственность. Суверенитет остаётся спорным, но цветовой результат не спорен: каждая визуально проверенная применимая claimant-ветка даёт recreational=ILLEGAL, medical=NONE для общего территориального вывода и enforcement=STRICT. Поэтому SCR получает красный по правилу совпадения всех claimant-режимов; это не признание чьего-либо суверенитета.",
    officialStatusPatch: {
      recreational: "ILLEGAL_UNDER_EVERY_VISUALLY_VERIFIED_CLAIMANT_REGIME",
      medical: "NONE_NO_TERRITORY_WIDE_MEDICAL_CANNABIS_ACCESS_PROVEN_UNDER_EITHER_CLAIMANT_BRANCH",
      enforcement: "STRICT_UNDER_EVERY_VISUALLY_VERIFIED_CLAIMANT_REGIME",
    },
    sources: [
      {
        title: "Philippines Supreme Court E-Library — RA 9522, Bajo de Masinloc scope",
        url: "https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/23187",
        role: "CLAIMANT_JURISDICTION_SCOPE",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-43/SCR/screenshots/SCR-judiciary-ra9522-bajo-de-masinloc-focused.png",
      },
      {
        title: "Philippines Dangerous Drugs Board — RA 9165 cannabis definition and penalties",
        url: "https://ddb.gov.ph//images/RA_9165/RA%209165.pdf",
        role: "CLAIMANT_DIRECT_CANNABIS_LAW",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-43/SCR/screenshots/SCR-ddb-ra9165-cannabis-definition-page05.png",
      },
      {
        title: "Lawphil — RA 9165 cannabis definition and penalties",
        url: "https://lawphil.net/statutes/repacts/ra2002/ra_9165_2002.html",
        role: "CLAIMANT_DIRECT_CANNABIS_LAW_OFFICIAL_MIRROR",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-29/PGA/screenshots/PGA-lawphil-ra-9165-cannabis-definition-clean.png",
      },
      {
        title: "Embassy of China — Huangyan Island sovereignty and jurisdiction statement",
        url: "https://ph.china-embassy.gov.cn/eng/xwfb/201206/t20120608_1180427.htm",
        role: "CLAIMANT_JURISDICTION_SCOPE",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/SCR-china-embassy-claim.png",
      },
      {
        title: "Supreme People's Court of China — Criminal Law articles 351 and 357 naming marijuana",
        url: "https://english.court.gov.cn/2015-12/01/c_761557_32.htm",
        role: "CLAIMANT_DIRECT_CANNABIS_LAW",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/CN/CN-official-criminal-law-cannabis-evidence.png",
      },
    ],
  },
  KAS: {
    reviewedAt: "2026-07-19T23:04:24.000Z",
    color: "LIMITED_OR_MEDICAL",
    method: "CONSERVATIVE_INTERSECTION_OF_ALL_VISUALLY_VERIFIED_CLAIMANT_REGIMES",
    reasonRu: "Свежая визуальная перепроверка закрывает KAS жёлтым без выбора суверена. Официальный India Code NDPS Act визуально действует на всю India, определяет cannabis (hemp), запрещает выращивание, производство, владение, продажу, покупку, перевозку, употребление и потребление, но прямо сохраняет лицензируемое исключение для medical/scientific purposes; section 20 устанавливает cannabis-specific наказания. Действующий официальный Pakistan Code CNSA 1997 визуально определяет cannabis/hemp, charas/hashish oil, bhang/siddhi/ganja и cannabis plant; sections 4 и 6 запрещают выращивание, владение, производство, продажу, покупку и перевозку, кроме разрешённых medical/scientific/industrial purposes, а sections 5 и 9 устанавливают строгие сроки лишения свободы. Pakistan Cannabis Control and Regulatory Authority Act 2024 дополнительно создаёт регулируемую medicinal/industrial cannabis-систему. Документы India MEA и Pakistan MOFA подтверждают противоположные позиции по Siachen, поэтому суверен не выбирается. Для KAS применяется явно обозначенный консервативный общий знаменатель всех визуально проверенных claimant-режимов: recreational запрещён, medical/scientific доступ ограничен разрешительным режимом, enforcement строгий. Это даёт жёлтый цвет и не означает признания чьего-либо суверенитета или равенства национальных программ доступа.",
    officialStatusPatch: {
      recreational: "ILLEGAL_OUTSIDE_AUTHORISED_SCOPE_UNDER_EVERY_VISUALLY_VERIFIED_CLAIMANT_REGIME",
      medical: "LIMITED_OR_REGULATED_MEDICAL_SCIENTIFIC_ACCESS_UNDER_EVERY_VISUALLY_VERIFIED_CLAIMANT_REGIME",
      enforcement: "STRICT_OUTSIDE_AUTHORISED_SCOPE_UNDER_EVERY_VISUALLY_VERIFIED_CLAIMANT_REGIME",
    },
    sources: [
      {
        title: "India Code - NDPS Act 1985, cannabis prohibition and medical/scientific exception",
        url: "https://www.indiacode.nic.in/bitstream/123456789/18974/1/narcotic-drugs-and-psychotropic-substances-act-1985.pdf",
        role: "CLAIMANT_DIRECT_CANNABIS_LAW",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-39/KAS/screenshots/KAS-india-ndps-page11-11.png",
      },
      {
        title: "Pakistan Code - Control of Narcotic Substances Act 1997, consolidated cannabis prohibitions",
        url: "https://pakistancode.gov.pk/pdffiles/administrator739c7aa745c5afab5decf2e100caf1c5.pdf",
        role: "CLAIMANT_DIRECT_CANNABIS_LAW",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/PK/png/pages/PK-cnsa-1997-page-11.png",
      },
      {
        title: "Pakistan Code - Cannabis Control and Regulatory Authority Act 2024",
        url: "https://pakistancode.gov.pk/pdffiles/administrator135567794d629a6ce6f1b32daadc651d.pdf",
        role: "CLAIMANT_DIRECT_CANNABIS_LAW",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-39/KAS/screenshots/KAS-pakistan-cannabis-act-2024-page01-01.png",
      },
      {
        title: "Ministry of Foreign Affairs Pakistan - Kashmir dispute and Siachen context",
        url: "https://mofa.gov.pk/storage/files/1/65451083a984b.pdf",
        role: "CLAIMANT_JURISDICTION_SCOPE",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-39/KAS/screenshots/KAS-pakistan-mofa-kashmir-dispute-page16-16.png",
      },
      {
        title: "Ministry of External Affairs India - Siachen and NJ 9842 context",
        url: "https://www.mea.gov.in/Uploads/PublicationDocs/23460_IWM_Book__11-06-2014_.pdf",
        role: "CLAIMANT_JURISDICTION_SCOPE",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-39/KAS/screenshots/KAS-india-mea-siachen-context-page157-157.png",
      },
    ],
  },
  SPI: {
    reviewedAt: "2026-07-19T23:09:00.000Z",
    color: "LIMITED_OR_MEDICAL",
    method: "CONSERVATIVE_INTERSECTION_OF_ALL_VISUALLY_VERIFIED_CLAIMANT_REGIMES",
    reasonRu: "Свежая визуальная перепроверка закрывает SPI жёлтым без выбора стороны незавершённой границы. В аргентинской ветке действующая Ley 23.737 сохраняет наказание за владение, но официальный федеральный приговор 2025 года применяет Arriola и исключает наказание за частное личное владение без конкретного вреда третьим лицам; Ley 27.350 прямо создаёт регулируемый medical/scientific cannabis framework. В чилийской ветке действующая Ley 20.000 Article 8 прямо называет cannabis, наказывает неразрешённое выращивание, выделяет personal-use sanction scope и признаёт medical-treatment cultivation по рецепту врача; Decreto 404 отдельно запрещает операции с cannabis/resin/extracts/tinctures, сохраняя ISP-controlled research и human-use pharmaceutical scope. Chile Ministry of Foreign Affairs визуально подтверждает, что совместная картография Section B по Agreement 1998 ещё выполняется, поэтому суверен для всей SPI не выбирается. Консервативный общий знаменатель двух визуально проверенных claimant-режимов: рекреационный рынок не легализован, ограниченный/регулируемый медицинский путь существует, enforcement варьируется от мягкого personal-use carve-out до уголовного запрета. В трёхцветной модели это жёлтый; вывод не скрывает различия режимов и не признаёт суверенитет.",
    officialStatusPatch: {
      recreational: "ILLEGAL_OR_NOT_GENERALLY_LEGAL_UNDER_EVERY_VISUALLY_VERIFIED_CLAIMANT_REGIME",
      medical: "LIMITED_OR_REGULATED_MEDICAL_ACCESS_UNDER_EVERY_VISUALLY_VERIFIED_CLAIMANT_REGIME",
      enforcement: "SOFT_OR_STRICT_DEPENDING_ON_CLAIMANT_AND_FACTS",
    },
    sources: [
      {
        title: "Argentina - updated Law 23,737 possession rule",
        url: "https://www.argentina.gob.ar/normativa/nacional/ley-23737-138/actualizacion",
        role: "CLAIMANT_NATIONAL_DRUG_LAW_WITH_CANNABIS_CASE_CONTEXT",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/AR-possession-penalty.png",
      },
      {
        title: "Argentina - updated Law 27,350 medical and scientific cannabis",
        url: "https://www.argentina.gob.ar/normativa/nacional/ley-27350-273801/actualizacion",
        role: "CLAIMANT_DIRECT_CANNABIS_LAW",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-30/SPI/screenshots/SPI-argentina-ley-27350-cannabis-law.png",
      },
      {
        title: "Argentina federal judiciary - 2025 Arriola application to private personal possession",
        url: "https://www.csjn.gov.ar/tribunales-federales-nacionales/d/sentencia-SGU-c6f9c533-7cd8-4163-83f2-2d1ee9733d14.pdf",
        role: "CLAIMANT_CURRENT_JUDICIAL_ENFORCEMENT_SCOPE",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/AR-2025-arriola-application.png",
      },
      {
        title: "Chile BCN LeyChile - Ley 20.000 Article 8 cannabis cultivation and medical prescription",
        url: "https://www.bcn.cl/leychile/navegar/imprimir?idNorma=235507&idParte=8652186",
        role: "CLAIMANT_DIRECT_CANNABIS_LAW",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/former-62-countries-batch2/CL-article-8.png",
      },
      {
        title: "Chile BCN LeyChile - Decreto 404 cannabis prohibition and pharmaceutical authorization",
        url: "https://www.bcn.cl/leychile/navegar?idNorma=13057",
        role: "CLAIMANT_DIRECT_CANNABIS_LAW",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-30/SPI/screenshots/SPI-chile-leychile-decreto-404-cannabis-pharmaceuticals.png",
      },
      {
        title: "Chile Ministry of Foreign Affairs - Southern Patagonian Ice Field boundary work",
        url: "https://www.minrel.gob.cl/sala-de-prensa/comunicado-por-inventario-nacional-de-glaciares-de-argentina",
        role: "CLAIMANT_JURISDICTION_SCOPE",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/SPI-chile-foreign-ministry-boundary.png",
      },
    ],
  },
  PGA: {
    reviewedAt: "2026-07-19T23:35:00.000Z",
    color: "ILLEGAL",
    method: "CONSERVATIVE_INTERSECTION_OF_ALL_VISUALLY_VERIFIED_CLAIMANT_REGIMES",
    reasonRu: "Свежая визуальная перепроверка закрывает PGA красным без выбора суверена и без выдумывания единого закона Spratly Islands. Официальный UN report A/47/623 визуально перечисляет шесть claimant-веток: China, Taiwan и Viet Nam заявляют весь архипелаг, а Malaysia, Brunei Darussalam и Philippines — отдельные атоллы. Для каждой ветки заново просмотрена реальная официальная CannabisLawPage: Brunei Cap.27 относит cannabis и cannabis resin к Class A и запрещает неразрешённые possession, consumption, trafficking, manufacture и import/export; China Criminal Law Articles 347, 348, 351 и 357 прямо называют marijuana и устанавливают уголовные наказания; Malaysia Act 234 определяет cannabis, запрещает владение без authorisation и строго наказывает trafficking; Philippines RA 9165 определяет marijuana/Indian hemp, наказывает использование и выращивание, оставляя только medical-experiment/research carve-out; Taiwan FDA визуально называет cannabis незаконным Category II narcotic; Vietnam Decree 28/2026 помещает cannabis plant и preparations в List I, запрещённый для медицинского и социального использования вне специального research/testing/forensic/security режима, а Law 73/2021 прямо определяет cây cần sa и запрещённые операции. Исключения для разрешённой науки, экспериментов или контролируемых целей различаются и не образуют общего пациентского доступа для всей PGA. Поэтому явно обозначенный консервативный общий знаменатель всех шести визуально проверенных claimant-режимов — recreational запрещён, territory-wide medical patient access отсутствует, уголовный enforcement строгий. В трёхцветной модели это красный; вывод не отрицает отдельные национальные исключения и не признаёт чей-либо суверенитет.",
    officialStatusPatch: {
      recreational: "ILLEGAL_UNDER_EVERY_VISUALLY_VERIFIED_CLAIMANT_REGIME",
      medical: "NONE_NO_TERRITORY_WIDE_PATIENT_ACCESS_COMMON_TO_ALL_VISUALLY_VERIFIED_CLAIMANT_REGIMES",
      enforcement: "STRICT_CRIMINAL_PROHIBITION_UNDER_EVERY_VISUALLY_VERIFIED_CLAIMANT_REGIME",
    },
    sources: [
      {
        title: "United Nations A/47/623 - six competing Spratly claimant branches",
        url: "https://digitallibrary.un.org/record/155981/files/A_47_623-EN.pdf",
        role: "MULTI_CLAIMANT_JURISDICTION_SCOPE",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/PGA-UN-six-claimants-p15.png",
      },
      {
        title: "Brunei Attorney General's Chambers - Misuse of Drugs Act Cap. 27",
        url: "https://www.agc.gov.bn/AGC%20Images/LAWS/ACT_PDF/cap027.pdf",
        role: "CLAIMANT_DIRECT_CANNABIS_LAW",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/BN/BN-class-a.png",
      },
      {
        title: "Supreme People's Court of China - Criminal Law narcotic offences",
        url: "https://english.court.gov.cn/2015-12/01/c_761557_31.htm",
        role: "CLAIMANT_DIRECT_CANNABIS_LAW",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/CN/CN-official-criminal-law-cannabis-evidence.png",
      },
      {
        title: "Supreme People's Court of China - Criminal Law definition naming marijuana",
        url: "https://english.court.gov.cn/2015-12/01/c_761557_32.htm",
        role: "CLAIMANT_DIRECT_CANNABIS_LAW",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/CN/CN-official-criminal-law-cannabis-evidence.png",
      },
      {
        title: "Malaysia Attorney General's Chambers - Dangerous Drugs Act 1952 Act 234",
        url: "https://lom.agc.gov.my/ilims/upload/portal/akta/outputaktap/1840725_BI/22.11.2023%20-%20Act%20234.pdf",
        role: "CLAIMANT_DIRECT_CANNABIS_LAW",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/MY/MY-act234-page-013-possession-restriction.png",
      },
      {
        title: "Lawphil - Republic Act No. 9165 cannabis definition, offences and research exception",
        url: "https://lawphil.net/statutes/repacts/ra2002/ra_9165_2002.html",
        role: "CLAIMANT_DIRECT_CANNABIS_LAW",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/PH/png/pages/PH-ra-9165-ddb-14.png",
      },
      {
        title: "Taiwan FDA - cannabis is an illegal Category II narcotic",
        url: "https://www.fda.gov.tw/TC/newsContent.aspx?id=25250",
        role: "CLAIMANT_DIRECT_CANNABIS_STATUS",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/former-62-countries-batch2/TW-fda-cannabis.png",
      },
      {
        title: "Vietnam Government - Decree 28/2026 List I cannabis plant and preparations",
        url: "https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/01/28-cp.signed.pdf",
        role: "CLAIMANT_DIRECT_CANNABIS_LAW",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-5/VN/screenshots/pdf_pages/VN-decree-28-2026-list-i-cannabis-plant.png",
      },
      {
        title: "Vietnam Government - Law 73/2021 on Drug Prevention and Control",
        url: "https://datafiles.chinhphu.vn/cpp/files/vbpq/2022/01/73luat.pdf",
        role: "CLAIMANT_DIRECT_CANNABIS_LAW",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-5/VN/screenshots/pdf_pages/VN-law-73-2021-definition-cannabis-plant-02.png",
      },
    ],
  },
  SJ: {
    reviewedAt: "2026-07-19T23:44:00.000Z",
    color: "ILLEGAL",
    method: "CONSERVATIVE_INTERSECTION_OF_ALL_VISUALLY_VERIFIED_COMPONENT_REGIMES",
    reasonRu: "Свежая визуальная перепроверка закрывает объединённый GEO SJ красным без переноса более благоприятного режима только одной физической части. Lov om Jan Mayen §§1–2 визуально подтверждает, что Jan Mayen является частью Kingdom of Norway и что норвежское уголовное право действует там прямо. Правительственный разбор Svalbardloven отдельно визуально подтверждает действие норвежского уголовного права на Svalbard. Действующий правительственный cannabis-раздел прямо объясняет, что оборот наркотиков допускается только для медицинских и научных целей, лечение cannabis регулируется отдельно, а иные dealing, use и possession уголовно наказуемы. Norwegian Medical Products Agency визуально подтверждает ограниченный пациентский путь через Sativex, Epidyolex и named-patient permits. Однако Forskrift 747 §11 прямо распространяет legemiddelloven и apotekloven на Svalbard, тогда как визуально проверенный исчерпывающий §18 для Jan Mayen их не перечисляет. Поэтому recreational prohibition и criminal enforcement доказаны для обеих частей, а ограниченный cannabis-patient pathway — только для Svalbard. По явно обозначенному консервативному общему знаменателю composite GEO получает красный: единого подтверждённого medical-cannabis access, общего для обеих частей, нет. Это не утверждение, что на Jan Mayen отсутствует любая медицинская помощь; это минимальный доказанный общий цвет объединённой ISO-строки.",
    officialStatusPatch: {
      recreational: "ILLEGAL_UNDER_EVERY_VISUALLY_VERIFIED_COMPONENT_REGIME",
      medical: "NONE_NO_MEDICAL_CANNABIS_PATIENT_PATHWAY_PROVEN_COMMON_TO_BOTH_COMPONENTS",
      enforcement: "STRICT_CRIMINAL_PROHIBITION_PROVEN_FOR_BOTH_COMPONENTS",
    },
    sources: [
      {
        title: "Lovdata - Lov om Jan Mayen sections 1 and 2",
        url: "https://lovdata.no/dokument/NL/lov/1930-02-27-2",
        role: "COMPONENT_CRIMINAL_LAW_APPLICABILITY",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/SJ.jpg",
      },
      {
        title: "Norwegian Government - Svalbardloven criminal-law applicability",
        url: "https://www.regjeringen.no/no/dokumenter/prop.-38-l-20242025/id3078770/?ch=2",
        role: "COMPONENT_CRIMINAL_LAW_APPLICABILITY",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/former-62-countries-batch2/SJ-Svalbard-law-applicability.png",
      },
      {
        title: "Norwegian Government - current cannabis prohibition and medical/scientific exception",
        url: "https://www.regjeringen.no/no/dokumenter/meld.-st.-5-20242025/id3064959/?ch=2",
        role: "NATIONAL_DIRECT_CANNABIS_LEGAL_CONTEXT_APPLIED_BY_COMPONENT_CRIMINAL_BRIDGES",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/former-62-countries-batch2/SJ-Norway-cannabis-context.png",
      },
      {
        title: "Lovdata - health-law applicability regulation for Svalbard and Jan Mayen",
        url: "https://lovdata.no/dokument/SF/forskrift/2015-06-22-747",
        role: "COMPONENT_MEDICAL_LAW_APPLICABILITY_DIFFERENCE",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/SJ-Svalbard-medicines-law.jpg",
      },
      {
        title: "Norwegian Medical Products Agency - cannabis treatment within current regulations",
        url: "https://www.dmp.no/en/special-permit-named-patient/for-physicians-and-dentists/medicinal-products-frequently-inquired-about-for-special-permit-named-patient/procedure-for-treatment-with-cannabis-within-current-regulations",
        role: "COMPONENT_LIMITED_MEDICAL_CANNABIS_PATHWAY_SVALBARD_APPLICABILITY_PROVEN",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/NO-medical-cannabis-current.png",
      },
    ],
  },
  BV: {
    reviewedAt: "2026-07-19T23:53:00.000Z",
    color: "ILLEGAL",
    method: "CONSERVATIVE_MINIMUM_PROVEN_TERRITORIAL_REGIME",
    reasonRu: "Свежая визуальная перепроверка закрывает BV красным без автоматического переноса всего материкового медицинского режима Norway. Bilandsloven визуально подтверждает норвежский суверенитет над Bouvetøya и прямо распространяет на biland норвежское уголовное право. Официальный government analysis Prop. 69 L подтверждает ту же норму: private law, criminal law и law of procedure действуют на bilandene, а специальное законодательство и подзаконные акты требуют отдельного основания. Действующий правительственный cannabis-раздел визуально связывает cannabis с уголовными §§231 и 162: оборот, передача, пересылка, use и possession вне медицинских/научных целей незаконны. Narkotikaforskriften визуально называет Cannabis и Cannabisharpiks и показывает запрет §5, а Penal Code устанавливает строгие сроки за narcotics offences. Но отдельного акта, распространяющего на Bouvetøya материковый patient-access режим legemiddelloven/DMP, не найдено, и национальная medical-cannabis страница не выдаётся за BV-specific право. Поэтому минимально доказанный территориальный режим: recreational запрещён, criminal enforcement строгий, подтверждённого BV medical-cannabis patient pathway нет. В трёхцветной модели это красный; вывод не утверждает, что на необитаемом острове существует абсолютный запрет любой медицинской помощи.",
    officialStatusPatch: {
      recreational: "ILLEGAL_UNDER_CRIMINAL_LAW_EXPRESSLY_APPLICABLE_TO_BOUVETOYA",
      medical: "NONE_NO_BOUVETOYA_MEDICAL_CANNABIS_PATIENT_PATHWAY_PROVEN",
      enforcement: "STRICT_CRIMINAL_NARCOTICS_ENFORCEMENT_APPLICABLE_TO_BOUVETOYA",
    },
    sources: [
      {
        title: "Lovdata - Bilandsloven criminal-law applicability to Bouvetøya",
        url: "https://lovdata.no/dokument/NL/lov/1930-02-27-3",
        role: "TERRITORIAL_CRIMINAL_LAW_APPLICABILITY",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/BV.jpg",
      },
      {
        title: "Norwegian Government Prop. 69 L - law applicability to bilandene",
        url: "https://www.regjeringen.no/no/dokumenter/prop.-69-l-20202021/id2814705/?ch=9",
        role: "TERRITORIAL_APPLICABILITY_EXPLANATION",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/BV.jpg",
      },
      {
        title: "Norwegian Government - cannabis criminal prohibition under Penal Code",
        url: "https://www.regjeringen.no/no/dokumenter/meld.-st.-5-20242025/id3064959/?ch=2",
        role: "DIRECT_CANNABIS_CRIMINAL_LAW_INTERPRETATION_APPLIED_BY_BILANDSLOVEN",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/former-62-countries-batch2/SJ-Norway-cannabis-context.png",
      },
      {
        title: "Lovdata - Narkotikaforskriften cannabis list and section 5 prohibition",
        url: "https://lovdata.no/dokument/SF/forskrift/2013-02-14-199/KAPITTEL_1",
        role: "NATIONAL_DIRECT_CANNABIS_CONTROL_CONTEXT_SPECIAL_REGULATION_NOT_AUTO_EXTENDED",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/BV-cannabis.jpg",
      },
      {
        title: "Lovdata - Penal Code aggravated narcotic drugs offence",
        url: "https://lovdata.no/dokument/NLE/lov/2005-05-20-28/%C2%A7232",
        role: "TERRITORIALLY_APPLICABLE_CRIMINAL_PENALTY",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/BV/BV-lovdata-penal-code-232-narcotics.png",
      },
      {
        title: "Norwegian Medical Products Agency - national cannabis treatment pathway",
        url: "https://www.dmp.no/en/special-permit-named-patient/for-physicians-and-dentists/medicinal-products-frequently-inquired-about-for-special-permit-named-patient/procedure-for-treatment-with-cannabis-within-current-regulations",
        role: "NATIONAL_MEDICAL_CANNABIS_CONTEXT_NOT_AUTO_EXTENDED_TO_BOUVETOYA",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/BV/BV-dmp-cannabis-treatment-regulations-clean.png",
      },
    ],
  },
  ET: {
    reviewedAt: "2026-07-19T23:52:12.000Z",
    color: "LIMITED_OR_MEDICAL",
    method: "CURRENT_DOMESTIC_DEFINITION_PLUS_CURRENT_UN_SCHEDULE_AND_CURRENT_MEDICAL_ONLY_DIRECTIVE",
    reasonRu: "Свежая визуальная перепроверка закрывает ET жёлтым без предположения о текущей силе Dangerous Drugs Proclamation 1942 года. Действующий Food and Medicine Administration Proclamation No. 1112/2019 визуально определяет narcotic drug как medicine, контролируемое по ратифицированной Ethiopia конвенции ООН. Актуальный INCB Yellow List визуально помещает CANNABIS и CANNABIS RESIN, EXTRACTS AND TINCTURES в Schedule I Single Convention 1961. Новая официальная EFDA Narcotic and Psychotropic Medicine Control Directive No. 1121/2025 от December 2025 прямо наследует определения Proclamation 1112, распространяется на production, import, export, distribution, storing, transportation, prescribing, dispensing и use и допускает специальный импорт только для medical treatment, clinical trial и scientific research. Article 7 отдельно визуально подтверждает персональный медицинский путь: назначенное врачом narcotic medicine можно ввезти для personal medical use по prescription. Таким образом cannabis попадает в действующий национальный narcotic-control режим через явный нормативный мост; общего recreational lawful route эти акты не создают, а ограниченный prescription/medical/scientific путь доказан. В трёхцветной модели это жёлтый. Исторический акт 1942 года сохранён как отдельная реальная CannabisLawPage, но больше не используется для вывода о current status.",
    officialStatusPatch: {
      recreational: "ILLEGAL_OUTSIDE_AUTHORISED_MEDICAL_SCIENTIFIC_SCOPE_CANNABIS_CONTROLLED_AS_UN_SCHEDULE_I_NARCOTIC",
      medical: "LIMITED_PRESCRIPTION_AND_SPECIAL_IMPORT_PATHWAY_UNDER_DIRECTIVE_1121_2025",
      enforcement: "CONTROLLED_LICENSING_PRESCRIPTION_AND_USE_REGIME_OUTSIDE_AUTHORISED_SCOPE",
    },
    sources: [
      {
        title: "Ethiopian Food and Drug Authority - Narcotic and Psychotropic Medicine Control Directive No. 1121/2025 title",
        url: "https://www.efda.gov.et/publication/narcotic-and-psychotropic-medicine-control-directive-1121-2018/",
        role: "CURRENT_OFFICIAL_DIRECTIVE_PUBLICATION_AND_DATE",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/ET-directive-1121-2025-title.png",
      },
      {
        title: "Ethiopian Food and Drug Authority - Directive 1121/2025 medical-only special import",
        url: "https://www.efda.gov.et/wp-content/uploads/2025/12/Narcotic-and-Psychotropic-Medicine-Control-Directive-1121-%E1%8B%A8%E1%8A%93%E1%88%AD%E1%8A%AE%E1%89%B2%E1%8A%AD-%E1%8A%A5%E1%8A%93-%E1%8B%A8%E1%88%B3%E1%8B%AD%E1%8A%AE%E1%89%B5%E1%88%AE%E1%8D%92%E1%8A%AD-%E1%88%98%E1%8B%B5%E1%8A%83%E1%8A%92%E1%89%B5-%E1%89%81%E1%8C%A5%E1%8C%A5%E1%88%AD-%E1%88%98%E1%88%98%E1%88%AA%E1%8B%AB-%E1%89%81%E1%8C%A5%E1%88%AD-1121-2018.pdf",
        role: "CURRENT_NARCOTIC_CONTROL_AND_MEDICAL_SCIENTIFIC_ONLY_PATHWAY",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/ET-directive-1121-2025-medical-only.png",
      },
      {
        title: "Ethiopian Food and Drug Authority - Directive 1121/2025 personal medical prescription pathway",
        url: "https://www.efda.gov.et/wp-content/uploads/2025/12/Narcotic-and-Psychotropic-Medicine-Control-Directive-1121-%E1%8B%A8%E1%8A%93%E1%88%AD%E1%8A%AE%E1%89%B2%E1%8A%AD-%E1%8A%A5%E1%8A%93-%E1%8B%A8%E1%88%B3%E1%8B%AD%E1%8A%AE%E1%89%B5%E1%88%AE%E1%8D%92%E1%8A%AD-%E1%88%98%E1%8B%B5%E1%8A%83%E1%8A%92%E1%89%B5-%E1%89%81%E1%8C%A5%E1%8C%A5%E1%88%AD-%E1%88%98%E1%88%98%E1%88%AA%E1%8B%AB-%E1%89%81%E1%8C%A5%E1%88%AD-1121-2018.pdf",
        role: "CURRENT_PERSONAL_MEDICAL_PRESCRIPTION_PATHWAY",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/ET-directive-1121-2025-personal-medical.png",
      },
      {
        title: "Ethiopian Food and Drug Authority - Proclamation 1112/2019 UN-convention narcotic definition",
        url: "https://www.efda.gov.et/wp-content/uploads/2020/06/Food-and-Medicine-Administration-Proclamation-1112.pdf",
        role: "CURRENT_DOMESTIC_UN_CONVENTION_NARCOTIC_DEFINITION",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/ET-proclamation-1112-narcotic-definition.png",
      },
      {
        title: "INCB Yellow List 64th edition - cannabis in Schedule I of the 1961 Convention",
        url: "https://www.incb.org/incb/uploads/documents/Narcotic-Drugs/Yellow_List/64th_edition/YL_64th_E.pdf",
        role: "CURRENT_OFFICIAL_UN_CANNABIS_SCHEDULE_INCORPORATED_BY_ETHIOPIAN_LAW",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/TD-INCB-yellow-list-2025-p3.png",
      },
      {
        title: "UNODC - Ethiopia Dangerous Drugs Proclamation naming canabis indica",
        url: "https://www.unodc.org/cld/uploads/res/document/eth/proclamation-no-24_html/ethiopia-A_PROCLAMATION_GOVERNING_THE_SALE_AND_IMPORTATION_OF_CERTAIN_DRUGS.pdf",
        role: "HISTORIC_DIRECT_CANNABIS_LAW_PRESERVED_NOT_USED_FOR_CURRENT_FORCE",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/ET-dangerous-drugs-1942.jpg",
      },
    ],
  },
  KP: {
    reviewedAt: "2026-07-20T00:20:00.000Z",
    color: "LIMITED_OR_MEDICAL",
    method: "BINDING_UN_CANNABIS_TREATY_PLUS_CURRENT_DPRK_NARCOTIC_CONTROL",
    reasonRu: "Свежая визуальная перепроверка закрывает KP жёлтым композитным, а не одиночным источником. Актуальная UN Treaty Collection визуально показывает Democratic People's Republic of Korea стороной amended Single Convention с 19 March 2007. Официальный текст UNODC самой Convention визуально определяет Cannabis, Cannabis plant и Cannabis resin, определяет drug через Schedules I и II и в Article 4 обязывает стороны реализовать Convention на своей территории и ограничить производство, оборот, use и possession drugs исключительно medical and scientific purposes. Актуальный INCB Yellow List визуально помещает CANNABIS и CANNABIS RESIN, EXTRACTS AND TINCTURES в Schedule I. Действующий DPRK Drug Management Law в редакции 14 December 2021, опубликованный в официальной Unification Law Database Ministry of Government Legislation Republic of Korea, визуально запрещает general-sale supply и разрешает narcotic use только для medicine manufacture, treatment, education and scientific research; пациентский путь требует diagnosis/prescription и контролируемого possession/use. Drug Crime Prevention Act от 1 July 2021 визуально распространяется на учреждения, граждан и иностранцев в DPRK и вводит строгие запреты и ответственность за неразрешённые производство, хранение, торговлю, ввоз и use narcotics. Государственный отчёт DPRK CRC/C/PRK/4 дополнительно визуально подтверждает accession к трём международным drug-control conventions и отсутствие заявленного non-prescription narcotic use. Поэтому cannabis связан с действующим режимом не через непубличный Cabinet list, а через обязательную для DPRK Convention, её прямое cannabis-определение и Schedule I, вместе с текущим внутренним narcotic-control режимом. Общий recreational route незаконен; ограниченный prescription/medical/scientific правовой путь доказан, но фактическая доступность конкретного cannabis medicine не доказана. В трёхцветной модели это жёлтый.",
    officialStatusPatch: {
      recreational: "ILLEGAL_OUTSIDE_MEDICAL_AND_SCIENTIFIC_SCOPE_UNDER_BINDING_UN_TREATY_AND_CURRENT_DPRK_NARCOTIC_CONTROL",
      medical: "LIMITED_GENERIC_NARCOTIC_PRESCRIPTION_PATHWAY_CANNABIS_PRODUCT_AVAILABILITY_NOT_PROVEN",
      enforcement: "STRICT_CURRENT_CRIMINAL_PROHIBITIONS_FOR_UNAUTHORISED_NARCOTIC_PRODUCTION_POSSESSION_TRADE_IMPORT_AND_USE",
    },
    sources: [
      {
        title: "UN Treaty Collection - DPRK participation in amended Single Convention from 19 March 2007",
        url: "https://treaties.un.org/doc/Publication/MTDSG/Volume%20I/Chapter%20VI/vi-18.en.pdf",
        role: "CURRENT_BINDING_TREATY_PARTICIPATION",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/KP-UNTC-amended-single-convention-party.png",
      },
      {
        title: "UNODC - amended Single Convention cannabis definitions",
        url: "https://www.unodc.org/pdf/convention_1961_en.pdf",
        role: "BINDING_TREATY_DIRECT_CANNABIS_DEFINITION",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/KP-UNODC-convention-cannabis-definition.png",
      },
      {
        title: "UNODC - amended Single Convention Article 4 medical and scientific limitation",
        url: "https://www.unodc.org/pdf/convention_1961_en.pdf",
        role: "BINDING_TREATY_TERRITORIAL_IMPLEMENTATION_AND_MEDICAL_SCIENTIFIC_ONLY_RULE",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/KP-UNODC-convention-medical-scientific-only.png",
      },
      {
        title: "INCB Yellow List 64th edition - cannabis in Schedule I of the 1961 Convention",
        url: "https://www.incb.org/incb/uploads/documents/Narcotic-Drugs/Yellow_List/64th_edition/YL_64th_E.pdf",
        role: "CURRENT_OFFICIAL_UN_CANNABIS_SCHEDULE",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/TD-INCB-yellow-list-2025-p3.png",
      },
      {
        title: "Unification Law Database - DPRK Drug Management Law amended 14 December 2021",
        url: "https://www.unilaw.go.kr/bbs/selectBoardArticle.do?alike=&alikeYn=&authFlag=Y&bbsAttrbCode=BBSA02&bbsId=BBSMSTR_000000000021&bbsSubId=&bbsTyCode=BBST01&menuNo=3010000&nttId=112&pageIndex=3&passwordConfirmAt=&recordCountPerPage=10&searchCnd=&searchWrd=&sidx=NTT_ID&sord=DESC&upperMenuId=3000000",
        role: "CURRENT_DPRK_NARCOTIC_CONTROL_LAW_OFFICIAL_FOREIGN_GOVERNMENT_MIRROR",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/KP-drug-law-2021-title.png",
      },
      {
        title: "Unification Law Database - DPRK Drug Management Law prescription medical and scientific pathway",
        url: "https://www.unilaw.go.kr/cmm/fms/FileDown.do?atchFileId=FILE_000000000001294&fileSn=2&mblSe=W",
        role: "CURRENT_DPRK_PRESCRIPTION_MEDICAL_SCIENTIFIC_NARCOTIC_PATHWAY",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/KP-drug-law-2021-medical-use.png",
      },
      {
        title: "Unification Law Database - DPRK Drug Crime Prevention Act territorial scope and offences",
        url: "https://www.unilaw.go.kr/cmm/fms/FileDown.do?atchFileId=META_000000000036791&fileSn=0&mblSe=W",
        role: "CURRENT_DPRK_TERRITORY_WIDE_NARCOTIC_CRIMINAL_CONTROL",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/KP-drug-crime-law-title-scope.png",
      },
      {
        title: "OHCHR state-party report CRC/C/PRK/4 - DPRK treaty accession",
        url: "https://docstore.ohchr.org/SelfServices/FilesHandler.ashx?enc=5Wvm71qLUpWitbKSUnsRBXfhC9SLPOOFf7%2FgtjdbxU4PUmqQmi7JOtYSvuzJwV08qCTHmWWuD4C7E77kz5qWyw%3D%3D",
        role: "DPRK_STATE_PARTY_REPORT_TREATY_ACCESSION_CONTEXT",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/KP-OHCHR-state-report-treaty-accession.png",
      },
      {
        title: "OHCHR state-party report CRC/C/PRK/4 - narcotic penalties and prescription-only context",
        url: "https://docstore.ohchr.org/SelfServices/FilesHandler.ashx?enc=5Wvm71qLUpWitbKSUnsRBXfhC9SLPOOFf7%2FgtjdbxU4PUmqQmi7JOtYSvuzJwV08qCTHmWWuD4C7E77kz5qWyw%3D%3D",
        role: "DPRK_STATE_PARTY_REPORT_HISTORIC_DRUG_CONTROL_CONTEXT",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/KP-OHCHR-state-report-drug-control.png",
      },
    ],
  },
  PN: {
    reviewedAt: "2026-08-03T00:00:00.000Z",
    color: "UNKNOWN",
    result: "HONEST_GREY_RETAINED",
    method: "GENERIC_TERRITORIAL_DRUG_RULE_AND_EXTERNAL_CANNABIS_IDENTIFIER_NOT_APPLICABLE_CANNABIS_LAW",
    reasonRu: "Независимая повторная проверка сохраняет PN неокрашенным. Summary Offences Ordinance section 7 регулирует импорт generic ‘drugs of any kind’ и содержит generic prescription/Medical Officer exception; Health Centre policy регулирует generic medications. Ни один из этих текстов не называет cannabis и не доказывает cannabis product, cannabis prescription, cannabis import, dispensing или patient programme. Current Pitcairn laws portal и lists of UK Orders in Council не дают documented extension of a UK cannabis or Misuse of Drugs Act. INCB Yellow List identifies cannabis internationally, но не является применимым законом Pitcairn. Поэтому generic territorial drug wording, generic prescription и external cannabis identifier не могут образовать YELLOW: PN остаётся UNKNOWN / LEGAL_APPLICABILITY_UNRESOLVED. SSOT не изменён.",
    sources: [
      {
        title: "Pitcairn Government - current laws portal and territorial law sources",
        url: "https://www.government.pn/laws",
        role: "CURRENT_TERRITORY_LAW_PORTAL_AND_SCOPE",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/PN.jpg",
      },
      {
        title: "Pitcairn Government - Summary Offences Ordinance section 7 all-drug import prohibition and prescription exception",
        url: "https://www.government.pn/s/Cap-5-Summary-Offences.pdf",
        role: "TERRITORY_DIRECT_ALL_DRUG_IMPORT_PROHIBITION_AND_MEDICAL_PRESCRIPTION_EXCEPTION",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/PN/png/pages/PN-volume1-summary-offences-drugs-220.png",
      },
      {
        title: "Pitcairn Government - Health Centre Operational Policy July 2025 prescribing, dispensing and medication orders",
        url: "https://www.government.pn/s/GPI_PITCAIRN_HEALTH_CENTRE_OPERATIONAL_POLICY_July6_2025_-1.pdf",
        role: "CURRENT_TERRITORY_PRESCRIBING_DISPENSING_AND_SPECIAL_ORDER_PATHWAY",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/PN-health-centre-2025-prescription-order.png",
      },
      {
        title: "INCB Yellow List 64th edition - cannabis in Schedule I",
        url: "https://www.incb.org/incb/uploads/documents/Narcotic-Drugs/Yellow_List/64th_edition/YL_64th_E.pdf",
        role: "CURRENT_OFFICIAL_CANNABIS_IDENTIFIER_CONTEXT_NOT_PN_TREATY_OR_UK_LAW_TRANSPLANT",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/TD-INCB-yellow-list-2025-p3.png",
      },
    ],
  },
  AQ: {
    reviewedAt: "2026-07-20T00:50:46.000Z",
    color: "LIMITED_OR_MEDICAL",
    method: "ANTARCTIC_TREATY_PERMIT_CONTROL_PLUS_NATIONAL_JURISDICTION",
    reasonRu: "Свежая визуальная перепроверка закрывает AQ жёлтым и не выдаёт Antarctica за единое государство или единый уголовный кодекс. Официальная страница Antarctic Treaty Secretariat прямо говорит, что Parties реализуют Treaty и Environment Protocol через собственные national legislations, а посетители получают разрешения у соответствующих National Competent Authorities. Визуально проверенный Article VIII самого Antarctic Treaty закрепляет национальную юрисдикцию для observers, exchanged scientific personnel и сопровождающего персонала, а споры о юрисдикции для иных случаев решаются консультациями сторон. Одновременно действующий Annex II Article 4 устанавливает общий для Antarctic Treaty area материальный минимум: никакой не местный живой организм нельзя вводить на сушу, ледовые шельфы или в воду без permit; разрешения допускают cultivated plants и reproductive propagules только для controlled use, а living organisms — для controlled experimental use, после чего их требуется удалить или обезвредить. Официальный UNODC Single Convention визуально определяет Cannabis, Cannabis plant и Cannabis resin и показывает международный medical/scientific-only контроль, а актуальный INCB Yellow List визуально включает cannabis и cannabis resin/extracts/tinctures в Schedule I; эти документы используются как прямой cannabis-идентификатор и общий международный контекст, а не как выдуманный единый AQ criminal code. Поэтому для whole-Antarctica нет общего recreational legal market или общего права на выращивание: введение живого cannabis plant permit-only, а медицинское/научное обращение и иные possession/use вопросы зависят от национальной юрисдикции и компетентного органа. В трёхцветной модели такой ограниченный условный режим — жёлтый. Не утверждается, что все национальные режимы одинаковы, что найден единый AQ possession offence, что существует AQ patient programme или что конкретный cannabis medicine доступен. Статус SSOT не изменён.",
    officialStatusPatch: {
      recreational: "NO_GENERAL_LEGAL_MARKET_LIVE_CANNABIS_PLANT_INTRODUCTION_PERMIT_ONLY_NATIONAL_LAW_DEPENDENT",
      medical: "LIMITED_NATIONAL_AUTHORITY_AND_CONTROLLED_SCIENTIFIC_PATHWAY_NO_UNITARY_AQ_PATIENT_PROGRAM_PROVEN",
      enforcement: "PERMIT_AND_NATIONAL_JURISDICTION_DEPENDENT_NO_UNITARY_CANNABIS_POSSESSION_PENALTY_PROVEN",
    },
    sources: [
      {
        title: "Antarctic Treaty Secretariat - National Competent Authorities and national legislation",
        url: "https://www.ats.aq/devAS/Ats/NationalCompetentAuthorities?lang=e",
        role: "CURRENT_TREATY_AREA_NATIONAL_LEGISLATION_AND_PERMITTING_SCOPE",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/AQ.jpg",
      },
      {
        title: "Antarctic Treaty - Article VIII national jurisdiction",
        url: "https://documents.ats.aq/recatt/att005_e.pdf",
        role: "CURRENT_TREATY_JURISDICTION_SCOPE",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/AQ-treaty-article8-jurisdiction.png",
      },
      {
        title: "Antarctic Treaty Environment Protocol Annex II - Article 4 non-native living-organism permit control",
        url: "https://documents.ats.aq/recatt/Att432_e.pdf",
        role: "DIRECT_TREATY_AREA_NON_NATIVE_PLANT_INTRODUCTION_PROHIBITION_AND_CONTROLLED_USE_PERMIT",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/AQ-annex-II-article4-non-native-plants.png",
      },
      {
        title: "UNODC - amended Single Convention cannabis definitions",
        url: "https://www.unodc.org/pdf/convention_1961_en.pdf",
        role: "OFFICIAL_CANNABIS_AND_CANNABIS_PLANT_IDENTIFIER_CONTEXT_NOT_UNITARY_AQ_CRIMINAL_CODE",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/KP-UNODC-convention-cannabis-definition.png",
      },
      {
        title: "UNODC - amended Single Convention Article 4 medical and scientific limitation",
        url: "https://www.unodc.org/pdf/convention_1961_en.pdf",
        role: "INTERNATIONAL_MEDICAL_SCIENTIFIC_CONTROL_CONTEXT_NOT_UNITARY_AQ_CRIMINAL_CODE",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/KP-UNODC-convention-medical-scientific-only.png",
      },
      {
        title: "INCB Yellow List 64th edition - cannabis in Schedule I",
        url: "https://www.incb.org/incb/uploads/documents/Narcotic-Drugs/Yellow_List/64th_edition/YL_64th_E.pdf",
        role: "CURRENT_OFFICIAL_CANNABIS_SCHEDULE_IDENTIFIER_CONTEXT_NOT_UNITARY_AQ_CRIMINAL_CODE",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/TD-INCB-yellow-list-2025-p3.png",
      },
    ],
  },
  BRT: {
    reviewedAt: "2026-07-20T01:12:53.000Z",
    color: "LIMITED_OR_MEDICAL",
    method: "UNCLAIMED_GEO_OPERATIONAL_ACCESS_FALLBACK_EGYPT_SUDAN",
    reasonRu: "Свежая визуальная перепроверка закрывает BRT жёлтым, не изобретая государство, территориальный уголовный кодекс или CannabisLawPage Bir Tawil. В отчёте Генерального секретаря ООН A/80/304 формулировка unclaimed territory приведена в разделе вкладов неправительственных организаций: это официально опубликованное negative/context evidence, но не обязательное юридическое решение ООН. Официальные заявления Egypt и Sudan, опубликованные в UN Law of the Sea Bulletin No. 94, визуально показывают несовместимые пограничные позиции: Egypt считает международной границей 22-ю параллель и относит территории к югу от неё к Sudan, тогда как Sudan заявляет Hala'ib к северу от 22-й параллели по унаследованной границе. Ни одна из просмотренных государственных веток не публикует орган Bir Tawil, территориальный cannabis-law, полицию, суд или patient programme; частные micronation-декларации поэтому отвергнуты. Для обязательного трёхцветного отображения применяется явно обозначенный operational-access fallback, а не территориальный закон: физический сухопутный доступ возможен только через Egypt или Sudan, и обе реальные CannabisLawPage просмотрены глазами. Egypt EDA публикует Law No. 182/1960 и актуальный индекс поправок до 2020 года; закон помещает Cannabis sativa/Indian hemp в запрещённые к выращиванию растения, запрещает неразрешённые cultivation, import, possession и trade, допускает только лицензируемые medical/scientific операции и предусматривает строгие наказания. Sudan Judiciary на действующем официальном сайте в 2026 году продолжает применять Narcotic Drugs and Psychotropic Substances Act 1994 и его таблицы, включая дела о hashish; визуально проверенная копия UNODC Legal Library определяет hashish как Indian hemp, перечисляет cannabis, cannabis resin и tetrahydrocannabinols, запрещает import, production, possession, transport и trade, оставляя только minister-authorized medical/scientific purposes и строгие уголовные наказания. Поэтому доказанного общего recreational legal market нет, а допустимость ограничена разрешительными медицинскими/научными режимами двух единственных сухопутных access states. В трёхцветной модели это жёлтый: зелёный ложно утверждал бы доказанную легальность, красный ложно приписал бы BRT собственный запрет. Enforcement строг на маршрутах Egypt/Sudan, но отдельной BRT enforcement authority нет. Вывод не распространяет автоматически суверенитет Egypt или Sudan на Bir Tawil, не создаёт BRT patient programme и не меняет статус SSOT.",
    officialStatusPatch: {
      recreational: "NO_GENERAL_LEGAL_MARKET_OPERATIONAL_ACCESS_RESTRICTED_UNDER_BOTH_BORDERING_REGIMES_NO_BRT_TERRITORIAL_LAWMAKER",
      medical: "LIMITED_MEDICAL_SCIENTIFIC_AUTHORIZATION_ONLY_UNDER_BOTH_BORDERING_ACCESS_REGIMES_NO_BRT_PATIENT_PROGRAM",
      enforcement: "STRICT_AT_EGYPT_SUDAN_ACCESS_REGIMES_NO_BRT_TERRITORIAL_ENFORCEMENT_AUTHORITY",
    },
    sources: [
      {
        title: "United Nations A/80/304 - NGO contribution describing Bir Tawil as unclaimed territory",
        url: "https://digitallibrary.un.org/record/4087607/files/A_80_304-EN.pdf#page=10",
        role: "UN_OFFICIAL_HOSTED_UNCLAIMED_CONTEXT_RELAYED_FROM_NGO_NOT_BINDING_LEGAL_DETERMINATION",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/BRT-UN-A-80-304-unclaimed-p10.png",
      },
      {
        title: "UN Law of the Sea Bulletin No. 94 - Egypt Ministry of Foreign Affairs 22nd-parallel position",
        url: "https://digitallibrary.un.org/record/3890922/files/LOS_94_WEB.pdf#page=25",
        role: "EGYPT_OFFICIAL_BOUNDARY_POSITION_NO_BRT_TERRITORIAL_LAWMAKER",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/BRT-UN-LOS94-Egypt-22nd-parallel.png",
      },
      {
        title: "UN Law of the Sea Bulletin No. 94 - Sudan Ministry of Foreign Affairs Hala'ib position",
        url: "https://digitallibrary.un.org/record/3890922/files/LOS_94_WEB.pdf#page=26",
        role: "SUDAN_OFFICIAL_BOUNDARY_POSITION_NO_BRT_TERRITORIAL_LAWMAKER",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/BRT-UN-LOS94-Sudan-Halaib-claim.png",
      },
      {
        title: "Egyptian Drug Authority - Law No. 182 of 1960 cannabis plant and controlled operations",
        url: "https://www.edaegypt.gov.eg/media/ekgifxb3/1960-182.pdf#page=13",
        role: "EGYPT_ACCESS_STATE_DIRECT_CANNABIS_LAW",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/EG/pdf_pages/EG-law-182-1960-page-13.png",
      },
      {
        title: "Egyptian Drug Authority - current Law No. 182/1960 amendments index",
        url: "https://edaegypt.gov.eg/ar/%D8%A7%D9%84%D9%85%D8%B1%D8%AC%D8%B9-%D8%A7%D9%84%D8%AA%D9%86%D8%B8%D9%8A%D9%85%D9%8A-%D9%84%D9%87%D9%8A%D8%A6%D8%A9-%D8%A7%D9%84%D8%AF%D9%88%D8%A7%D8%A1-%D8%A7%D9%84%D9%85%D8%B5%D8%B1%D9%8A%D8%A9/%D8%A7%D9%84%D9%82%D9%88%D8%A7%D9%86%D9%8A%D9%86-%D9%88%D8%A7%D9%84%D9%84%D9%88%D8%A7%D8%A6%D8%AD-%D8%A7%D9%84%D8%AA%D9%86%D9%81%D9%8A%D8%B0%D9%8A%D8%A9/%D8%AA%D8%B9%D8%AF%D9%8A%D9%84%D8%A7%D8%AA-%D9%82%D8%A7%D9%86%D9%88%D9%86-%D8%B1%D9%82%D9%85-182-%D9%84%D8%B3%D9%86%D8%A9-1960/",
        role: "EGYPT_ACCESS_STATE_CURRENT_LAW_AND_AMENDMENTS_INDEX",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/BRT-Egypt-EDA-law-182-amendments.png",
      },
      {
        title: "Sudan Judiciary - Supreme Court hashish possession and trafficking judgment applying the 1994 Act",
        url: "https://sj.gov.sd/ar/content/book/%D8%AD%D9%83%D9%88%D9%85%D8%A9-%D8%A7%D9%84%D8%B3%D9%88%D8%AF%D8%A7%D9%86-%D8%B6%D8%AF-%D8%B2-%D8%B9-%D8%B9-%D8%AC-%D9%85-%D8%B9%D9%85-%D9%83-%D8%A7%D9%85%D8%A4%D8%A8%D8%AF152018%D9%85",
        role: "SUDAN_ACCESS_STATE_CURRENT_JUDICIARY_CANNABIS_ENFORCEMENT_CONFIRMATION",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/BRT-Sudan-Judiciary-current-1994-act.png",
      },
      {
        title: "UNODC Legal Library archive - Sudan Narcotic Drugs and Psychotropic Substances Act 1994",
        url: "https://web.archive.org/web/20071004220747/http://www.unodc.org/unodc/en/legal_library/sd/legal_library_1996-12-18_1996-77.html?print=yes",
        role: "SUDAN_ACCESS_STATE_DIRECT_CANNABIS_LAW_OFFICIAL_UNODC_ARCHIVE_COPY",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-27/SD/screenshots/SD-unodc-prohibition-medical-scientific-exception.png",
      },
    ],
  },
};

const requested = process.argv.slice(2);
if (!requested.length) throw new Error(`Usage: ${path.basename(process.argv[1])} GEO [GEO ...]`);
for (const geo of requested) {
  if (!resolutions[geo]) throw new Error(`No zero-grey resolution registered for ${geo}`);
}

const reaudit = read(REAUDIT_PATH);
const reviews = read(REVIEWS_PATH);
for (const geo of requested) {
  const resolution = resolutions[geo];
  const row = reaudit.rows.find((candidate) => candidate.geo === geo);
  const review = reviews.rows.find((candidate) => candidate.geo === geo);
  if (!row || !review) throw new Error(`Missing audit row for ${geo}`);

  const result = resolution.result || "COLOR_RESOLVED";
  row.result = result;
  row.reasonRu = resolution.reasonRu;
  if (resolution.officialStatusPatch) row.officialStatusPatch = resolution.officialStatusPatch;
  else delete row.officialStatusPatch;
  row.freshOfficialSources = [...new Map([
    ...(row.freshOfficialSources || []),
    ...resolution.sources.map((source) => ({
      title: source.title,
      url: source.url,
      role: source.role,
      visualReview: `FRESH_HUMAN_VISUAL_ACCEPTANCE_${resolution.reviewedAt.slice(0, 10).replaceAll("-", "_")}`,
    })),
  ].map((source) => [source.url, source])).values()];

  review.zero_grey_completion = {
    reviewed_at: resolution.reviewedAt,
    resolution_method: resolution.method,
    derived_color: resolution.color,
    visual_verdict: result === "COLOR_RESOLVED"
      ? "HUMAN_VISUALLY_ACCEPTED_WITH_EXPLICIT_SCOPE"
      : "HUMAN_VISUALLY_REVIEWED_CONTEXT_ONLY",
    sources: resolution.sources.map((source) => ({
      title: source.title,
      url: source.url,
      role: source.role,
      screenshot_path: source.screenshotPath,
    })),
    conclusion_ru: resolution.reasonRu,
  };
  review.project_comparison = {
    status: `${result}_${resolution.color}_${resolution.method}`,
    reason: resolution.reasonRu,
  };
}

reaudit.reviewedAt = requested
  .map((geo) => resolutions[geo].reviewedAt)
  .reduce((latest, value) => value > latest ? value : latest, reaudit.reviewedAt);
reaudit.resolvedColorCount = reaudit.rows.filter((row) => row.result === "COLOR_RESOLVED").length;
reaudit.retainedGreyCount = reaudit.rows.filter((row) => row.result === "HONEST_GREY_RETAINED").length;

write(REAUDIT_PATH, reaudit);
write(REVIEWS_PATH, reviews);
console.log(`ZERO_GREY_APPLIED=${requested.join(",")}`);
console.log(`COLOR_RESOLVED=${reaudit.resolvedColorCount}`);
console.log(`HONEST_GREY=${reaudit.retainedGreyCount}`);
