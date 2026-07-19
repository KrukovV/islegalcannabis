#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCREEN = "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current";
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const write = (p, v) => fs.writeFileSync(path.join(ROOT, p), `${JSON.stringify(v, null, 2)}\n`);

const raw = [
  ["AL","DIRECT_OFFICIAL_CANNABIS_LAW","https://www.nacc.gov.al/wp-content/uploads/2024/10/Law-no.-61-2023-On-the-control-of-the-cultivation-and-processing-of-the-cannabis-plant-and-the-production-of-its-by-products-for-medical-and-industrial-purposes.pdf","Law 61/2023 заново отрендерен на точной странице 3: Article 5 запрещает в Albania внутренние retail/wholesale sale, distribution, acquisition и consumption cannabis products for medical purposes, одновременно регулируя лицензированное медицинское производство и экспорт. Это зелёный REGULATED по цветовой модели, но без вывода о patient access."],
  ["AQ","OFFICIAL_TREATY_JURISDICTION_CONTEXT_ONLY_NO_UNITARY_CANNABIS_LAW","https://www.ats.aq/devAS/Ats/NationalCompetentAuthorities?lang=e","Второй поиск по официальной базе Antarctic Treaty Secretariat закрыт. Визуально проверенная страница прямо говорит, что стороны реализуют договор через собственные national legislations и отдельные national competent authorities. Сам Antarctic Treaty сохраняет несовместимые позиции по территориальным притязаниям и предусматривает национальную юрисдикцию для определённых категорий лиц; единого суверена, единого уголовного cannabis режима и единой medical-cannabis нормы для всего GEO AQ нет. Поэтому переносить цвет любой одной страны на Antarctica нельзя: AQ остаётся честно серым как многоюрисдикционный treaty area."],
  ["AM","DIRECT_OFFICIAL_DRUG_LAW","https://arlis.am/en/acts/216352","Действующий административный кодекс визуально показывает штрафы за малые количества наркотиков и употребление без назначения."],
  ["AZ","COMPOSITE_DIRECT_OFFICIAL_CANNABIS_PROHIBITED_CIRCULATION_AND_CULTIVATION_LAW","https://sehiyye.gov.az/site/assets/files/1645/960.pdf","Официальный PDF Ministry of Health визуально показывает Law 960-IIQ и List I запрещённых к обороту наркотических/психотропных веществ; пункт 56 прямо включает cannabis resin, extract и tincture. Отдельная действующая таблица e-Qanun визуально запрещает культивирование çətənə. Общие правила медицинского использования других narcotic medicines не отменяют cannabis-specific List I prohibition; официальный цвет — красный."],
  ["BJN","COMPOSITE_DIRECT_COLOMBIA_CANNABIS_LAW_AND_TERRITORIAL_JURISDICTION","https://www1.funcionpublica.gov.co/eva/gestornormativo/norma_pdf.php?i=80394","Официальный Decreto 1946/2013 визуально включает Cayos de Bajo Nuevo в Departamento Archipiélago de San Andrés, Providencia y Santa Catalina и прямо фиксирует полную суверенную юрисдикцию Colombia над этими островными территориями. Поэтому национальная Ley 1787/2016, которая на видимой странице распространяет медицинский и научный cannabis framework на всю национальную территорию Colombia, и решение Corte Constitucional C-127/23 о personal dose образуют прямую применимую cannabis-law цепочку. Для колумбийской административной юрисдикции BJN официальный цвет — зелёный; наличие международных притязаний остаётся явно указанным scope caveat и не выдаётся за отдельный закон, изданный самим BJN."],
  ["BRT","OFFICIAL_UNCLAIMED_TERRITORY_NEGATIVE_EVIDENCE_NO_PUBLIC_LAWMAKER","https://sdgs.un.org/partnerships/new-kush","Второй поиск по источникам ООН, Egypt и Sudan не выявил публичного органа, издающего право для Bir Tawil. Официально размещённый материал ООН визуально называет Bir Tawil unclaimed region, а New Kush — частной инициативой/партнёрством, не государством и не законодательным порталом. Египетские и суданские официальные материалы относятся к спору о Hala'ib и не создают cannabis юрисдикцию Bir Tawil. Следовательно, нет честного суверенного cannabis-law и нет цвета, который можно вывести из частной декларации: BRT остаётся серым."],
  ["BV","COMPOSITE_OFFICIAL_CRIMINAL_APPLICABILITY_AND_CANNABIS_CONTROL_MEDICAL_SCOPE_UNPROVEN","https://lovdata.no/dokument/NL/lov/1930-02-27-3","Второй поиск по Lovdata и regjeringen.no закрыт без недосмотренных кандидатов. Bilandsloven §2 и действующий straffeloven визуально подтверждают применение норвежского уголовного права к Bouvetøya; narkotikaforskriften визуально называет Cannabis и Cannabisharpiks и запрещает их по §5. Но сама narkotikaforskriften и медицинское регулирование помечены как действующие для «Norge», тогда как Bouvetøya — норвежское biland вне Kongeriket Norge, и отдельного акта о распространении legemiddelloven/narkotikaforskriften на Bouvetøya не найдено. Поэтому recreational/enforcement chain сильная, но полный medical-компонент для цветовой модели не доказан: BV остаётся честно серым, а норвежский medical-cannabis режим не переносится автоматически."],
  ["BF","DIRECT_OFFICIAL_CANNABIS_LAW_WITH_MEDICAL_PRESCRIPTION_EXCEPTION","https://www.an.bf/storage/Loi/n53UNiWibGu7dOfkIqc0pgYQpwb51QUX0rDJsCvg.pdf","Страница 156 официального закона визуально связывает две нормы: Article 385-1 запрещает употребление контролируемых наркотиков вне медицинского назначения, а Article 385-2 прямо называет cannabis oil и иные производные cannabis и наказывает незаконные приобретение, хранение или культивирование. Это доказывает узкое исключение по медицинскому назначению, но не наличие доступной пациентской программы или зарегистрированных cannabis-препаратов."],
  ["CM","DIRECT_OFFICIAL_CANNABIS_LAW","http://www.minjustice.gov.cm/index.php/fr/textes-lois/lois/download/128/351/18?method=view","Официальная газета, стр. 985: section 8 прямо запрещает cultivation of cannabis plants на всей национальной территории."],
  ["TD","COMPOSITE_DIRECT_NATIONAL_INCORPORATION_OF_CURRENT_INCB_CANNABIS_SCHEDULE","https://www.unodc.org/cld/uploads/res/document/tcd/loi-no-24_html/loi_no_24.pdf","Официальная копия Chad Loi 024/PR/2000 визуально показывает в Article 36, что Республика Чад принимает списки narcotics ратифицированных международных конвенций и регулирует их prescription/dispensing; актуальный официальный INCB Yellow List 64th edition (July 2025), страница 3, визуально включает CANNABIS и CANNABIS RESIN, EXTRACTS and TINCTURES в Schedule I. Articles 134–136 визуально устанавливают 1–6 лет за нарушения controlled-narcotic rules и удвоение за незаконное изготовление/выращивание. Это прямая составная cannabis-law цепочка: recreational незаконен, enforcement строгий, а medical — только узкий общий prescription framework без доказанной cannabis patient programme или доступного продукта. Официальный цвет TD — жёлтый; project medical=NONE требует пересмотра, SSOT не меняется."],
  ["DJ","COMPOSITE_DIRECT_OFFICIAL_CANNABIS_SCHEDULE_THERAPEUTIC_PRESCRIPTION_AND_LEGAL_CONTINUITY","https://www.journalofficiel.dj/texte-juridique/arrete-n-18-427-1932-commerce-detention-et-vente-des-substances-veneneuses-a-la-cote-francaise-des-somalis/","Официальный eJO визуально показывает, что Arrêté 1932 относит chanvre indien, его смолу, препараты, экстракт и настойку к Tableau B; операции без разрешения запрещены, а статья 37 допускает отпуск для терапевтического применения по рецепту. Статья 5 конституционного акта LR/77-001 визуально сохраняет действовавшие на день независимости законы до их законной отмены или изменения. Официальный декрет 2026 года отдельно подтверждает существующие приговоры за drogue и trafic de stupéfiant. Официальный цвет — жёлтый: незаконный оборот запрещён, но имеется узкое разрешительно-рецептурное медицинское исключение."],
  ["DM","DIRECT_OFFICIAL_CANNABIS_LAW","https://dominica.gov.dm/laws/2020/Drug%20Prevention%20%28Amendment%29%20Act%202020.pdf","Поправка 2020 визуально исключает из преступления владение не более 28 г и регулирует публичное употребление; отдельная норма допускает до трёх растений."],
  ["ET","COMPOSITE_DIRECT_HISTORIC_CANNABIS_LAW_AND_CURRENT_GENERIC_NARCOTIC_CONTROL_CURRENT_FORCE_UNPROVEN","https://www.unodc.org/cld/uploads/res/document/eth/proclamation-no-24_html/ethiopia-A_PROCLAMATION_GOVERNING_THE_SALE_AND_IMPORTATION_OF_CERTAIN_DRUGS.pdf","Второй поиск по EFDA, федеральным правовым индексам и repeal/current-force записям не нашёл отдельного официального подтверждения, что Dangerous Drugs Proclamation No. 24/1942 продолжает действовать без релевантного изменения. Сам исторический акт остаётся реальной визуально проверенной CannabisLawPage: canabis indica можно импортировать только по permit, продавать в licensed pharmacy и по medical prescription. Действующий EFDA Proclamation 1112/2019 визуально регулирует narcotic prescriptions и делает неприменимыми прежние нормы лишь в части противоречия, но это не равнозначно подтверждению всего cannabis-specific режима 1942 года. Поэтому исторический и текущий слои показаны раздельно, а текущий цвет ET остаётся серым без домысла."],
  ["FR","DIRECT_CURRENT_OFFICIAL_CANNABIS_ENFORCEMENT_PAGE","https://drogues-info-service.fr/content/view/pdf/19975","Актуальная страница от 18 июля 2026: употребление наркотиков запрещено, ст. L3421-1 — до года и €3,750; cannabis прямо назван, возможен фиксированный штраф €200."],
  ["PF","DIRECT_OFFICIAL_CANNABIS_REGULATORY_PAGE","https://www.service-public.pf/dgae/wp-content/uploads/sites/44/2025/07/CBD.pdf","Официальная записка 2025 визуально перечисляет Loi du pays 2024-19 и условия для cannabis/cannabinoid products и лекарств во French Polynesia."],
  ["TF","COMPOSITE_DIRECT_FRANCE_CANNABIS_LAW_AND_TAAF_TOXICOMANIA_LAW_APPLICABILITY","https://drogues-info-service.fr/content/view/pdf/19975","Официальная страница France визуально называет cannabis, запрет употребления, статью L3421-1, наказание до года и €3,750 и фиксированный штраф €200. Принятый amendment Assemblée nationale 2025 визуально показывает актуализацию L3833-1 для Terres australes et antarctiques françaises и прямо относит её к применению раздела Code de la santé publique о toxicomanie в TAAF. Медицинский cannabis-доступ для TAAF не подтверждён и не выдумывается; официальный цвет — жёлтый из доказанного запрета со смешанной фиксированной/судебной санкцией."],
  ["GD","COMPOSITE_CURRENT_OFFICIAL_CANNABIS_LAW_AND_NOT_IN_FORCE_REFORM_STATUS","https://grenadaparliament.gd/wp-content/uploads/2021/08/Cap84A-DRUG-ABUSE-PREVENTION-AND-CONTROL-ACT.pdf","Действующий Cap.84A визуально включает Cannabis и Cannabis resin в перечень controlled drugs, запрещает cultivation и в section 12 создаёт лицензионный и practitioner/pharmacist prescription framework. Cannabis Commission отдельно визуально подтверждает, что Act 1/2026 ещё не вступил в силу и до formal commencement действует прежний закон. Поэтому текущий цвет — жёлтый только как узкое разрешительно-рецептурное исключение; доступная cannabis patient programme не доказана, а будущие лимиты реформы в текущий статус не засчитываются."],
  ["US-IN","COMPOSITE_OFFICIAL_CANNABIS_SCHEDULE_AND_CURRENT_ENFORCEMENT","https://www.in.gov/health/overdose-prevention/general-information/drug-schedules-1-5/","Indiana Health визуально относит marijuana (cannabis) к Schedule I и прямо определяет Schedule I как не имеющий accepted medical use; ранее свежо просмотренная страница Fort Wayne Police показывает действующие обвинения за Possession of Marijuana Class A/B misdemeanor. В совокупности официальный цвет — красный."],
  ["US-IA","DIRECT_CURRENT_OFFICIAL_CANNABIS_LAW","https://www.legis.iowa.gov/docs/code/2026/124E.12.pdf","Iowa Code 2026 §124E.12 визуально даёт полную защиту пациентам/карточкам medical cannabidiol; §124.401 визуально наказывает marijuana possession до 6 месяцев/$1,000 вне Chapter 124E."],
  ["IM","DIRECT_OFFICIAL_CANNABIS_LAW","https://legislation.gov.im/cms/images/LEGISLATION/PRINCIPAL/1976/1976-0021/1976-0021.pdf","Страница 12 визуально запрещает cultivation of cannabis plant и показывает исключения для cannabis-based medicinal products."],
  ["LV","DIRECT_CURRENT_OFFICIAL_CANNABIS_LAW","https://likumi.lv/ta/en/en/id/40283-law-on-the-legal-trade-of-narcotic-and-psychotropic-substances-and-medicinal-products-and-also-precursors","Section 6 визуально запрещает Cannabis indica cultivation и допускает только сертифицированный industrial/horticultural Cannabis sativa."],
  ["LS","DIRECT_OFFICIAL_GAZETTE_MIRROR_CANNABIS_LAW","https://archive.gazettes.africa/archive/ls/2022/ls-government-gazette-dated-2022-01-27-no-4.pdf","Точная копия Lesotho Government Gazette визуально определяет medical hemp/cannabis, разрешает possession по prescription для medical purpose, запрещает unlawful cultivation/manufacture/possession и устанавливает до 1 млн maloti и до 20 лет за trafficking. Вместе с LNDC Cannabis Regulations 2018/2025 официальный цвет — жёлтый."],
  ["MO","COMPOSITE_DIRECT_OFFICIAL_CANNABIS_CRIMINAL_AND_THERAPEUTIC_AUTHORIZATION_LAW","https://bo.dsaj.gov.mo/bo/i/2009/32/lei17.asp?printer=1","Закон Macao 17/2009 визуально включает Cannabis sativa и её производные в таблицу I-C. Переизданный Законом 27/2024 Decreto-Lei 34/99/M визуально распространяет контроль легального рынка на таблицы I-IV, требует разрешений для выращивания, производства, оборота, хранения и использования и допускает разрешение лишь для терапевтических, научных, аналитических или учебных целей. Это доказывает ограниченный разрешительный медицинский режим, но не доказывает действующую пациентскую программу; Article 9 о 30-дневном ввозе не используется, поскольку его перечень не включает таблицу I-C."],
  ["MS","DIRECT_CURRENT_OFFICIAL_CANNABIS_LAW","https://www.gov.ms/wp-content/uploads/2026/02/4.07-Drugs-Prevention-of-Misuse-Act.pdf","Текущая revised Act визуально запрещает cannabis cultivation (s.8), но допускает лицензированное культивирование/курение для research; Act No.24 For Assent не принят как действующий источник."],
  ["KP","OFFICIAL_FOREIGN_LAW_DATABASE_TWO_FULL_CURRENT_GENERIC_DPRK_DRUG_LAWS_CONTEXT_ONLY","https://www.unilaw.go.kr/bbs/selectBoardArticleSearch.do?bbsId=BBSMSTR_000000000004&nttId=4100","Второй поиск закрыт по двум полным законам КНДР в официальной базе Ministry of Justice Republic of Korea. Визуально проверенный Drug Management Law в редакции 14 декабря 2021 года регулирует государственное производство и медицинское применение наркотических средств по диагнозу и рецепту, но оставляет конкретный перечень Кабинету. Визуально проверенный Drug Crime Prevention Act от 1 июля 2021 года применяется к учреждениям, гражданам и иностранцам на территории КНДР и строго запрещает незаконные производство, хранение, оборот, ввоз и употребление наркотиков. Однако его собственное определение называет опий, морфин, кокаин, героин и наркотические растения вообще, но не cannabis, marijuana или 대마. Найденные в 1163-страничном комментарии слова 대마 относятся к сравнительному описанию законов других стран, а не к тексту закона КНДР. Без отдельного действующего перечня, прямо включающего cannabis, оба источника остаются сильным официальным контекстом, но не доказанной CannabisLawPage; цвет KP остаётся серым."],
  ["PN","OFFICIAL_LAWBOOK_AND_APPLICABILITY_NEGATIVE_EVIDENCE","https://www.government.pn/laws","Второй поиск закрыт по официальному laws portal, двум полным revised-law volumes, списку UK Orders in Council и опубликованным решениям судов Pitcairn. Визуально подтверждены только общие нормы: запрет ввоза drugs любого вида с medical officer/prescription exceptions, почтовый запрет narcotics и определение drug-dealing offence. Cannabis, marijuana, marihuana и hemp не названы; отдельного акта или Order in Council, прямо распространяющего UK Misuse of Drugs Act и его cannabis schedules на Pitcairn, не найдено. Конституционная формула о statutes of general application сама по себе не доказывает применимость конкретного cannabis act. PN поэтому остаётся честно серым, а UK cannabis status автоматически не переносится."],
  ["BL","COMPOSITE_DIRECT_FRANCE_CANNABIS_LAW_AND_OFFICIAL_TERRITORY_APPLICABILITY","https://drogues-info-service.fr/content/view/pdf/19975","Официальная страница France визуально называет cannabis, запрет употребления, статью L3421-1, наказание до года и €3,750 и фиксированный штраф €200. Свежая официальная étude d'impact Sénat визуально цитирует LO 6213-1 о применении законов и регламентов de plein droit в Saint-Barthélemy, а официальный доклад Sénat подтверждает, что health и hospital financing остаются компетенцией государства. Префектура в 2026 визуально называет употребление cannabis на наших территориях. Переходный медицинский режим закончился 31 марта 2026, более поздний действующий пациентский доступ не подтверждён. Официальный цвет BL — жёлтый из-за смешанного штрафного/судебного исполнения."],
  ["MF","COMPOSITE_DIRECT_FRANCE_CANNABIS_LAW_AND_OFFICIAL_TERRITORY_APPLICABILITY","https://drogues-info-service.fr/content/view/pdf/19975","Официальная страница France визуально называет cannabis, запрет употребления, статью L3421-1, наказание до года и €3,750 и фиксированный штраф €200. Свежая официальная étude d'impact Sénat визуально подтверждает идентичный LO 6313-1 о применении законов и регламентов de plein droit в Saint-Martin; официальный парламентский разбор визуально перечисляет нормативные компетенции территории и не относит к ним cannabis/health regulation, сохраняя за государством уголовное право. Префектура в 2026 визуально называет употребление cannabis на наших территориях. Переходный медицинский режим закончился 31 марта 2026, более поздний действующий пациентский доступ не подтверждён. Официальный цвет MF — жёлтый из-за смешанного штрафного/судебного исполнения."],
  ["PM","COMPOSITE_DIRECT_FRANCE_CANNABIS_LAW_AND_OFFICIAL_TERRITORY_APPLICABILITY","https://drogues-info-service.fr/content/view/pdf/19975","Официальная страница France визуально называет cannabis, запрет употребления, статью L3421-1, наказание до года и €3,750 и фиксированный штраф €200. Официальный отчёт префекта Saint-Pierre-et-Miquelon визуально фиксирует пресечение местного оборота herbe и résine de cannabis; Sénat визуально подтверждает принцип применения французских законов и регламентов de plein droit в архипелаге вне узких местных компетенций. Service Public визуально показывает окончание переходного медицинского режима 31 марта 2026 и отсутствие новых пациентов с марта 2024; более поздний действующий пациентский доступ не подтверждён. Поэтому официальный цвет PM — жёлтый как незаконное употребление со смешанным штрафным/судебным исполнением, а не красный по умолчанию."],
  ["SCR","COMPETING_CLAIMANT_CANNABIS_LAWS_CONTEXT_ONLY_NO_SETTLED_TERRITORIAL_LAW","https://lawphil.net/statutes/repacts/ra2002/ra_9165_2002.html","Второй поиск закрыт по официальным источникам обеих конкурирующих юрисдикций. Philippines RA 9522 визуально включает Bajo de Masinloc / Scarborough Shoal в режим островов, над которыми государство заявляет sovereignty and jurisdiction, а RA 9165 визуально определяет cannabis/marijuana/Indian hemp, количественные пороги и строгие наказания. Официальная Embassy of China визуально заявляет Huangyan Island частью территории China и описывает государственную деятельность/юрисдикцию; официальный текст Criminal Law China визуально называет marijuana в статьях 351 и 357 и устанавливает строгие уголовные санкции. Источники подтверждают два claimant-law режима, но не дают нейтрально установленного единого суверена или отдельного SCR lawgiver. Поэтому ни филиппинский, ни китайский цвет автоматически не присваивается объединённой спорной строке SCR; она остаётся серой с явным конфликтом scope."],
  ["SER","COMPOSITE_DIRECT_COLOMBIA_CANNABIS_LAW_AND_TERRITORIAL_JURISDICTION","https://www1.funcionpublica.gov.co/eva/gestornormativo/norma_pdf.php?i=80394","Официальный Decreto 1946/2013 визуально включает Cayos de Serranilla в Departamento Archipiélago de San Andrés, Providencia y Santa Catalina и прямо фиксирует полную суверенную юрисдикцию Colombia над этими островными территориями. Национальная Ley 1787/2016 на видимой странице распространяет медицинский и научный cannabis framework на всю национальную территорию Colombia, а решение Corte Constitucional C-127/23 фиксирует personal dose. Для колумбийской административной юрисдикции SER официальный цвет — зелёный; спорный международный статус остаётся scope caveat и не маскируется под отдельный SER-issued закон."],
  ["KAS","COMPETING_CLAIMANT_CANNABIS_REGIMES_CONTEXT_ONLY_NO_SINGLE_SIACHEN_LAW","https://www.indiacode.nic.in/bitstream/123456789/18974/1/narcotic-drugs-and-psychotropic-substances-act-1985.pdf","Второй поиск закрыт по четырём официальным документам и восьми заново просмотренным релевантным страницам. India Code NDPS Act визуально действует на whole of India, определяет cannabis (hemp), charas/hashish oil/liquid hashish, ganja и cannabis plant, запрещает выращивание и операции/употребление кроме разрешённого режима и устанавливает section 20 penalties. Gazette of Pakistan Cannabis Control and Regulatory Authority Act 2024 визуально действует на whole of Pakistan, определяет cannabis/CBD/THC и создаёт национальную лицензируемую систему выращивания, производства и продажи для medicinal, industrial и иных public uses. Официальные документы India MEA и Pakistan MOFA визуально подтверждают, что Siachen севернее NJ 9842 остаётся недемаркированной зоной с противоположными позициями и военным присутствием. Поскольку claimant cannabis regimes дают разные медицинские выводы и ни один источник не устанавливает нейтрально единую юрисдикцию либо KAS lawgiver, единый официальный цвет KAS не выводится; строка остаётся серой, а оба режима показаны как claimant context."],
  ["SPI","COMPETING_CLAIMANT_CANNABIS_REGIMES_AND_PENDING_BOUNDARY_CONTEXT_ONLY","https://www.argentina.gob.ar/normativa/nacional/ley-27350-273801/actualizacion","Второй поиск закрыт по официальным cannabis-law страницам обеих сторон и отдельному официальному boundary source. Argentina Ley 27.350 и Health Ministry Cannabis Medicinal page визуально подтверждают национальную regulated medical programme, доступ к производным, аптечным formulations и REPROCANN controlled cultivation. Chile LeyChile Decreto 404 визуально запрещает cannabis/resin/extracts/tinctures в национальной территории, но допускает ISP authorization для research и human-use pharmaceutical products. Свежая визуальная проверка Ministry of Foreign Affairs Chile подтверждает действующий Agreement 1998, завершённую линию Section A и продолжающуюся работу Comisión Mixta над общей картографией/трассировкой Section B. В цветовой модели claimant regimes не совпадают, а общий официальный документ не назначает весь SPI одной национальной юрисдикции. Поэтому единый цвет SPI не выводится: серый означает unresolved territorial scope, а не отсутствие cannabis-law evidence."],
  ["PGA","SIX_COMPETING_CLAIMANT_CANNABIS_REGIMES_CONTEXT_ONLY_NO_WHOLE_SPRATLY_LAW","https://lawphil.net/statutes/repacts/ra2002/ra_9165_2002.html","Второй поиск исправляет прежнюю одностороннюю ветку Philippines. Официальный UN report A/47/623 визуально перечисляет шесть сторон Spratly: China, Taiwan and Viet Nam claim the whole archipelago; Malaysia, Brunei Darussalam and Philippines claim various atolls. Заново просмотрены официальные CannabisLawPages всех шести: Brunei Cap.27 относит cannabis/resin к Class A и запрещает possession/trafficking; China Criminal Law прямо называет marijuana и строгие уголовные санкции; Malaysia Act 234 определяет cannabis и предусматривает вплоть до life/death для trafficking; Philippines RA 9165 определяет cannabis и допускает лишь research/medical-experiment carve-out; Taiwan FDA прямо отвечает, что cannabis незаконен как Category II drug; Vietnam Decree 28/2026 включает cannabis plant/preparations в List I, а Law 73/2021 определяет cây cần sa и контролируемые/запрещённые операции. Claimant regimes дают неодинаковые медицинские и цветовые выводы, а PGA не является единым законодателем. Поэтому whole-Spratly строка остаётся серой с шестью явными ветками, а не получает цвет выбранного claimant."],
  ["SJ","COMPOSITE_OFFICIAL_CRIMINAL_AND_PARTIAL_MEDICAL_APPLICABILITY_CONTEXT_ONLY","https://lovdata.no/dokument/SF/forskrift/2015-06-22-747","Второй поиск закрыт без недосмотренных CannabisLawPage-кандидатов. Lov om Jan Mayen §1–2 визуально подтверждает, что Jan Mayen является частью Kingdom of Norway и что норвежское уголовное право действует там прямо; правительственный материал отдельно подтверждает тот же уголовно-правовой принцип для Svalbard. Официальный норвежский cannabis-контекст визуально показывает незаконность possession/use вне медицинского и научного режима, а DMP — действующий путь Sativex/Epidyolex и named-patient permits. Но действующая Forskrift 747 визуально распространяет legemiddelloven/apotekloven на Svalbard (§11), тогда как исчерпывающий информационный перечень для Jan Mayen (§18) их не содержит. Поэтому recreational=ILLEGAL и strict criminal enforcement подтверждены для обеих частей, medical=LIMITED — только для Svalbard; единый полный цвет объединённого GEO SJ не доказан и честно остаётся серым."],
  ["SY","COMPOSITE_DIRECT_OFFICIAL_UN_MIRROR_CANNABIS_ENFORCEMENT_AND_MEDICAL_NARCOTIC_FRAMEWORK","https://digitallibrary.un.org/record/190631/files/e-nl-1994-57-e.pdf","Law No.2/1993, официально переданный Government of Syria в UN, визуально показывает medical prescription, patient possession и ministerial authorization framework для narcotic medicines и отдельный запрет выращивания Schedule 4 plants. Свежая SANA визуально показывает задержание за выращивание القنّب для производства narcotic hashish, а SANA 2026 подтверждает продолжающее действие Law No.2/1993. Это жёлтый только как общий разрешительно-рецептурный режим для narcotic medicines; конкретный cannabis medicine и его фактическая доступность не доказаны."],
  ["TK","DIRECT_CANNABIS_LAW_VIA_EXACT_ARCHIVE_MIRROR","https://www.paclii.org/tk/legis/consol_act_2016/cpaer2003302.pdf","Rule 49 Drugs визуально определяет cannabis plant or seed и производные; import/possession — offence, есть written-prescription exception. Точная архивная копия использована из-за блокировки PacLII."],
  ["UZ","DIRECT_CURRENT_OFFICIAL_CANNABIS_THRESHOLD_LAW","https://lex.uz/pdffile/4025388","Официальная таблица визуально перечисляет гашиш/смолу cannabis и cannabis/marijuana с порогами small/large/especially large quantities."],
  ["VE","DIRECT_CANNABIS_LAW_ON_OFFICIAL_UN_MIRROR","https://sherloc.unodc.org/cld/uploads/res/document/ven/ley-drogas_html/Venezuela_Ley_Organzia_De_Drogas_R-10-92.pdf","Страница 13 Gaceta reproduction на UNODC SHERLOC визуально показывает arts.150-153, marijuana thresholds и personal consumption up to 20g; это исправляет прежний ложный NO_DIRECT."],
];

const rows = raw.map(([geo, classification, url, visibleConclusionRu]) => ({
  geo,
  reviewedAt: "2026-07-19T22:28:00.000Z",
  reviewMethod: classification.includes("PDF") || /\.pdf|pdffile\//i.test(url)
    ? "RENDERED_RELEVANT_PDF_PAGE_AND_HUMAN_VISUAL_INSPECTION"
    : "ISOLATED_HEADLESS_RENDER_AND_HUMAN_VISUAL_INSPECTION",
  classification,
  visualVerdict: "HUMAN_VISUALLY_ACCEPTED_WITH_STATED_SCOPE",
  acceptedUrl: url,
  screenshotPaths: [path.join(SCREEN, `${geo}.jpg`)],
  visibleConclusionRu,
}));

const extras = {
  AL: ["AL-law-61-2023-article-5.jpg"],
  AZ: ["AZ-prohibited-list-title.jpg", "AZ-prohibited-cannabis.jpg"],
  BL: ["BL-MF-current-applicability.jpg", "BL-health-state-competence.jpg", "PM-medical-expiry.jpg", "FR.jpg"],
  BV: ["BV-cannabis.jpg", "BV-prohibition.jpg"],
  DJ: ["DJ-1932-therapeutic-prescription.jpg", "DJ-1932-cannabis-schedule.jpg", "DJ-1977-legal-continuity.jpg", "DJ-2026-drug-enforcement-context.jpg"],
  ET: ["ET-dangerous-drugs-1942.jpg", "ET-current-prescription-law-p35.jpg", "ET-current-repeal-law-p72.jpg", "ET-NPS-formulary-p3.jpg"],
  GD: ["GD-current-act-s12.jpg", "GD-current-act-cannabis-schedule.jpg", "GD-act-four-plants.jpg", "GD-act-quantities.jpg"],
  KP: ["KP-drug-law-2021-title.png", "KP-drug-law-2021-medical-use.png", "KP-drug-crime-law-title-scope.png", "KP-drug-crime-law-penalties.png"],
  SCR: ["SCR-china-embassy-claim.png"],
  PGA: ["PGA-UN-six-claimants-p15.png"],
  MS: ["MS-research.jpg"],
  LS: ["LS-gazette-2022-p3.jpg", "LS-gazette-2022-p9.jpg", "LS-gazette-2022-p10.jpg", "LS-gazette-2022-p11.jpg"],
  MO: ["MO-law17-cannabis.jpg", "MO-law34-scope.jpg", "MO-law34-therapeutic.jpg"],
  MF: ["BL-MF-current-applicability.jpg", "MF-normative-competences.jpg", "PM-medical-expiry.jpg", "FR.jpg"],
  PM: ["PM-local-cannabis-enforcement.jpg", "PM-senat-applicability.jpg", "PM-medical-expiry.jpg", "FR.jpg"],
  "US-IA": ["US-IA-medical-defense.jpg", "US-IA-possession.jpg"],
  "US-IN": ["US-IN-schedule-no-medical.jpg", "US-IN-schedule-cannabis.jpg"],
  SJ: ["SJ-Svalbard-medicines-law.jpg", "SJ-Jan-Mayen-health-list.jpg"],
  SY: ["SY-law-medical-prescriptions.jpg", "SY-law-medical-manufacture.jpg", "SY-current-cannabis-enforcement.jpg"],
  TD: ["TD-INCB-yellow-list-2025-p3.png"],
  TF: ["TF-L3833-1-current-amendment.jpg", "FR.jpg"],
};
for (const row of rows) row.screenshotPaths.push(...(extras[row.geo] || []).map((f) => path.join(SCREEN, f)));
const externalExtras = {
  BJN: [
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/CO-medical-law.png",
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/CO-personal-dose-ruling.png",
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/BJN/pdf_pages/BJN-dimar-decreto-1946-2013-page-3.png",
  ],
  SER: [
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/CO-medical-law.png",
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/CO-personal-dose-ruling.png",
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-41/SER/screenshots/SER-dimar-decreto-1946-2013-page03-3.png",
  ],
  SCR: [
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-43/SCR/screenshots/SCR-judiciary-ra9522-bajo-de-masinloc-focused.png",
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-43/SCR/screenshots/SCR-ddb-ra9165-cannabis-definition-page05.png",
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-43/SCR/screenshots/SCR-ddb-ra9165-marijuana-thresholds-page12.png",
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-43/SCR/screenshots/SCR-ddb-ra9165-cannabis-schedule-page60.png",
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/CN/CN-official-criminal-law-cannabis-evidence.png",
  ],
  KAS: [
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-39/KAS/screenshots/KAS-india-ndps-page05-05.png",
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-39/KAS/screenshots/KAS-india-ndps-page11-11.png",
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-39/KAS/screenshots/KAS-india-ndps-page16-16.png",
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-39/KAS/screenshots/KAS-pakistan-cannabis-act-2024-page01-01.png",
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-39/KAS/screenshots/KAS-pakistan-cannabis-act-2024-page02-02.png",
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-39/KAS/screenshots/KAS-pakistan-cannabis-act-2024-page12-12.png",
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-39/KAS/screenshots/KAS-pakistan-mofa-kashmir-dispute-page16-16.png",
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-39/KAS/screenshots/KAS-india-mea-siachen-context-page157-157.png",
  ],
  SPI: [
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-30/SPI/screenshots/SPI-argentina-ley-27350-cannabis-law.png",
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-30/SPI/screenshots/SPI-argentina-cannabis-medicinal-program.png",
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-30/SPI/screenshots/SPI-chile-leychile-decreto-404-cannabis-pharmaceuticals.png",
  ],
  PGA: [
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-29/PGA/screenshots/PGA-lawphil-pd-1596-kalayaan-island-group-clean.png",
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-29/PGA/screenshots/PGA-lawphil-ra-12064-west-philippine-sea-kalayaan-clean.png",
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-29/PGA/screenshots/PGA-lawphil-ra-9165-cannabis-definition-clean.png",
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/BN/BN-class-a.png",
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/CN/CN-official-criminal-law-cannabis-evidence.png",
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/MY/MY-act234-page-007-cannabis-definition.png",
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/former-62-countries-batch2/TW-fda-cannabis.png",
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-5/VN/screenshots/pdf_pages/VN-decree-28-2026-list-i-cannabis-plant.png",
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-5/VN/screenshots/pdf_pages/VN-law-73-2021-title-page-01.png",
  ],
  SJ: [
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/former-62-countries-batch2/SJ-Svalbard-law-applicability.png",
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/former-62-countries-batch2/SJ-Norway-cannabis-context.png",
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/NO-current-possession-penalty.png",
    "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/NO-medical-cannabis-current.png",
  ],
};
for (const row of rows) row.screenshotPaths.push(...(externalExtras[row.geo] || []));
if (rows.length !== 39 || new Set(rows.map((r) => r.geo)).size !== 39) throw new Error("Expected 39 unique acceptance rows");

const acceptance = {
  schemaVersion: 1,
  reviewedAt: "2026-07-19T22:28:00.000Z",
  method: "Каждый из исходных 39 GEO повторно открыт и просмотрен глазами: HTML только в изолированном headless Chromium; PDF — по отрендеренной релевантной странице. Контекст, claimant law и negative evidence не выдаются за прямой территориальный cannabis-law.",
  sourceGreyCount: 39,
  humanVisualAcceptedCount: 39,
  directOrCompositeCannabisPages: rows.filter((r) => /^(DIRECT|COMPOSITE)/.test(r.classification)).length,
  contextClaimantOrNegativeOnly: rows.filter((r) => !/^(DIRECT|COMPOSITE)/.test(r.classification)).length,
  rows,
};
write("data/reviews/wiki-truth-grey-39-human-visual-acceptance.json", acceptance);

const re = read("data/reviews/wiki-truth-grey-color-reaudit-39.json");
const previousMatrix = read("data/reviews/wiki-truth-cannabis-law-matrix-307.json");
const previousMatrixByGeo = new Map(previousMatrix.rows.map((row) => [row.geo, row]));
const resolved = new Set(["AL","AM","AZ","BF","BJN","BL","CM","DJ","DM","FR","PF","TF","GD","US-IN","US-IA","IM","LV","LS","MF","MO","MS","PM","SER","SY","TD","TK","UZ","VE"]);
const patches = {
  AL:{recreational:"ILLEGAL_DOMESTIC_RETAIL_DISTRIBUTION_ACQUISITION_AND_CONSUMPTION_PROHIBITED",medical:"LICENSED_PRODUCTION_FOR_MEDICINAL_AND_EXPORT_ONLY_NO_DOMESTIC_PATIENT_ACCESS",enforcement:"STRICT_PROHIBITIONS_WITH_LICENSED_PRODUCTION_SCOPE"},
  AM:{recreational:"ILLEGAL_EXCEPT_LICENSED_INDUSTRIAL_HEMP_AT_OR_BELOW_0_3_PERCENT_THC",medical:"NONE_NO_PATIENT_CANNABIS_ACCESS_CONFIRMED",enforcement:"SOFT_ADMINISTRATIVE_FINE_FOR_SMALL_PERSONAL_SCOPE"},
  AZ:{recreational:"ILLEGAL_CANNABIS_PRODUCTS_AND_CULTIVATION_PROHIBITED",medical:"NONE_CANNABIS_RESIN_EXTRACT_AND_TINCTURE_ARE_IN_PROHIBITED_CIRCULATION_LIST",enforcement:"STRICT_CRIMINAL_THRESHOLD_FRAMEWORK"},
  BF:{recreational:"ILLEGAL_PERSONAL_ACQUISITION_POSSESSION_OR_CULTIVATION_PUNISHED",medical:"LIMITED_BY_MEDICAL_PRESCRIPTION_EXCEPTION_NO_PATIENT_PROGRAM_OR_PRODUCT_AVAILABILITY_PROVEN",enforcement:"STRICT_IMPRISONMENT_AND_FINE_OUTSIDE_MEDICAL_PRESCRIPTION"},
  BJN:{recreational:"NOT_LEGAL_PERSONAL_DOSE_PROTECTED_SUBJECT_TO_CONTEXTUAL_PUBLIC_SPACE_LIMITS_UNDER_COLOMBIAN_JURISDICTION",medical:"REGULATED_UNDER_COLOMBIA_NATIONAL_MEDICAL_AND_SCIENTIFIC_CANNABIS_FRAMEWORK",enforcement:"SOFT_FOR_PERSONAL_POSSESSION_CONTEXTUAL_PUBLIC_RESTRICTIONS_AND_SUPPLY_OFFENCES_REMAIN_UNDER_COLOMBIAN_JURISDICTION"},
  BL:{recreational:"ILLEGAL_CANNABIS_USE_UNDER_APPLICABLE_FRENCH_LAW",medical:"NONE_CURRENT_PATIENT_ACCESS_NOT_CONFIRMED_AFTER_TRANSITION_ENDED_2026_03_31",enforcement:"MIXED_FIXED_FINE_OR_JUDICIAL_WITH_CURRENT_TERRITORY_CANNABIS_CONTEXT"},
  CM:{recreational:"ILLEGAL_WITH_CRIMINAL_PENALTIES",medical:"NONE_NO_MEDICAL_INTEREST_FOR_TABLE_I_CANNABIS",enforcement:"STRICT_CRIMINAL_PENALTIES"},
  DJ:{recreational:"ILLEGAL_UNAUTHORISED_CANNABIS_TABLE_B_OPERATIONS",medical:"LIMITED_THERAPEUTIC_USE_BY_PRESCRIPTION_UNDER_RETAINED_PRE_INDEPENDENCE_LAW",enforcement:"STRICT_CRIMINAL_CONVICTIONS_AND_CONTROLLED_OPERATIONS"},
  PF:{recreational:"ILLEGAL_GENERAL_PAKALOLO_CONDUCT",medical:"LIMITED_REGULATED_CANNABIS_PRODUCTS_AND_MEDICINES",enforcement:"STRICT_OUTSIDE_AUTHORIZED_PRODUCT_SCOPE"},
  FR:{recreational:"ILLEGAL",medical:"NONE_CURRENT_PATIENT_ACCESS_NOT_CONFIRMED_AFTER_TRANSITION",enforcement:"MIXED_FIXED_FINE_OR_JUDICIAL"},
  GD:{recreational:"ILLEGAL_UNDER_CURRENT_CAP84A_UNTIL_FORMAL_COMMENCEMENT_OF_ACT_1_2026",medical:"LIMITED_CURRENT_MINISTERIAL_LICENSE_AND_PRACTITIONER_PRESCRIPTION_FRAMEWORK_NO_PATIENT_PROGRAM_PROVEN",enforcement:"STRICT_EXISTING_LAW_REMAINS_ENFORCEABLE"},
  MS:{recreational:"ILLEGAL_EXCEPT_LICENSED_RESEARCH",medical:"LIMITED_RESEARCH_LICENSE_ONLY_NO_PATIENT_ACCESS_CONFIRMED",enforcement:"STRICT_FOR_UNLICENSED_CULTIVATION_AND_POSSESSION"},
  SY:{recreational:"ILLEGAL_CANNABIS_CULTIVATION_AND_UNAUTHORIZED_NARCOTIC_POSSESSION_OR_TRADE",medical:"LIMITED_GENERAL_MEDICAL_PRESCRIPTION_AND_MINISTERIAL_AUTHORIZATION_FRAMEWORK_NO_SPECIFIC_CANNABIS_PRODUCT_AVAILABILITY_PROVEN",enforcement:"STRICT_CRIMINAL_ENFORCEMENT"},
  TD:{recreational:"ILLEGAL_UNAUTHORISED_CANNABIS_OPERATIONS_AND_ILLICIT_CULTIVATION",medical:"LIMITED_GENERIC_NARCOTIC_PRESCRIPTION_AND_DISPENSING_FRAMEWORK_NO_CANNABIS_PATIENT_PROGRAM_OR_PRODUCT_AVAILABILITY_PROVEN",enforcement:"STRICT_ONE_TO_SIX_YEARS_WITH_DOUBLED_PENALTY_FOR_ILLICIT_CULTIVATION_OR_MANUFACTURE"},
  TF:{recreational:"ILLEGAL_CANNABIS_USE_UNDER_EXTENDED_FRENCH_PUBLIC_HEALTH_CODE",medical:"UNCONFIRMED_FOR_TAAF",enforcement:"MIXED_FIXED_FINE_OR_JUDICIAL"},
  IM:{recreational:"ILLEGAL_UNLESS_AUTHORIZED_UNDER_MISUSE_OF_DRUGS_ACT",medical:"LIMITED_PRESCRIPTION_AND_DISPENSING_WITH_IMPORT_LICENSING",enforcement:"STRICT_CRIMINAL_OFFENCE_OUTSIDE_AUTHORIZATION"},
  LV:{recreational:"CANNABIS_CULTIVATION_PROHIBITED_EXCEPT_INDUSTRIAL_HEMP",medical:"NONE_NO_PATIENT_CANNABIS_ACCESS_CONFIRMED",enforcement:"STRICT_CRIMINAL_CULTIVATION_OFFENCE"},
  LS:{recreational:"ILLEGAL_UNLICENSED_CANNABIS_CULTIVATION_MANUFACTURE_POSSESSION_AND_TRAFFICKING",medical:"LIMITED_LICENSED_AND_PRESCRIPTION_DRUG_OF_ABUSE_FRAMEWORK_FOR_CANNABIS",enforcement:"STRICT_UP_TO_ONE_MILLION_MALOTI_OR_TWENTY_YEARS_FOR_TRAFFICKING"},
  MF:{recreational:"ILLEGAL_CANNABIS_USE_UNDER_APPLICABLE_FRENCH_LAW",medical:"NONE_CURRENT_PATIENT_ACCESS_NOT_CONFIRMED_AFTER_TRANSITION_ENDED_2026_03_31",enforcement:"MIXED_FIXED_FINE_OR_JUDICIAL_WITH_CURRENT_TERRITORY_CANNABIS_CONTEXT"},
  MO:{recreational:"ILLEGAL_WITH_CRIMINAL_PENALTIES_FOR_UNAUTHORIZED_USE_POSSESSION_CULTIVATION_AND_TRAFFICKING",medical:"LIMITED_AUTHORIZATION_FOR_THERAPEUTIC_USE_OF_TABLE_I_TO_IV_SUBSTANCES_INCLUDING_TABLE_I_C_CANNABIS",enforcement:"STRICT_CRIMINAL_PENALTIES_OUTSIDE_AUTHORIZATION"},
  PM:{recreational:"ILLEGAL_CANNABIS_USE_UNDER_APPLICABLE_FRENCH_LAW",medical:"NONE_CURRENT_PATIENT_ACCESS_NOT_CONFIRMED_AFTER_TRANSITION_ENDED_2026_03_31",enforcement:"MIXED_FIXED_FINE_OR_JUDICIAL_WITH_LOCAL_CANNABIS_TRAFFICKING_ENFORCEMENT"},
  SER:{recreational:"NOT_LEGAL_PERSONAL_DOSE_PROTECTED_SUBJECT_TO_CONTEXTUAL_PUBLIC_SPACE_LIMITS_UNDER_COLOMBIAN_JURISDICTION",medical:"REGULATED_UNDER_COLOMBIA_NATIONAL_MEDICAL_AND_SCIENTIFIC_CANNABIS_FRAMEWORK",enforcement:"SOFT_FOR_PERSONAL_POSSESSION_CONTEXTUAL_PUBLIC_RESTRICTIONS_AND_SUPPLY_OFFENCES_REMAIN_UNDER_COLOMBIAN_JURISDICTION"},
  TK:{recreational:"ILLEGAL_IMPORT_OR_POSSESSION_OFFENCE",medical:"LIMITED_BY_WRITTEN_PRESCRIPTION_EXCEPTION",enforcement:"STRICT_OFFENCE_FRAMEWORK"},
  "US-IA":{recreational:"ILLEGAL_OUTSIDE_CHAPTER_124E_MEDICAL_EXCEPTIONS",medical:"LIMITED_REGULATED_MEDICAL_CANNABIS_PROGRAM",enforcement:"STRICT_JAIL_OR_FINE_FOR_UNLAWFUL_MARIJUANA_POSSESSION"},
  "US-IN":{recreational:"ILLEGAL_WITH_CURRENT_MISDEMEANOR_POSSESSION_ENFORCEMENT",medical:"NONE_MARIJUANA_IS_SCHEDULE_I_WITH_NO_ACCEPTED_MEDICAL_USE",enforcement:"STRICT_CURRENT_CLASS_A_OR_B_MISDEMEANOR_POSSESSION_CHARGES"},
  UZ:{recreational:"CANNABIS_AND_CANNABIS_RESIN_PROHIBITED_FROM_CIRCULATION",medical:"NONE_CONFIRMED_FOR_LIST_I_CANNABIS",enforcement:"STRICT_CRIMINAL_THRESHOLD_FRAMEWORK"},
  VE:{recreational:"DECRIMINALIZED_OR_LIMITED_PERSONAL_USE_UP_TO_20G_MARIJUANA",medical:"UNCONFIRMED_BY_REVIEWED_ARTICLES",enforcement:"MIXED_PERSONAL_DOSE_EXCLUDED_BUT_TRAFFICKING_STRICT"},
};
const byGeo = new Map(rows.map((r) => [r.geo, r]));
re.schemaVersion = 2;
re.reviewedAt = acceptance.reviewedAt;
re.method = acceptance.method;
re.humanVisualAcceptedCount = acceptance.humanVisualAcceptedCount;
re.directOrCompositeCannabisPages = acceptance.directOrCompositeCannabisPages;
re.contextClaimantOrNegativeOnly = acceptance.contextClaimantOrNegativeOnly;
re.resolvedColorCount = resolved.size;
re.retainedGreyCount = 39 - resolved.size;
for (const row of re.rows) {
  const a = byGeo.get(row.geo);
  row.result = resolved.has(row.geo) ? "COLOR_RESOLVED" : "HONEST_GREY_RETAINED";
  row.reasonRu = a.visibleConclusionRu;
  const previousSupplemental = previousMatrixByGeo.get(row.geo)?.latestColorReaudit?.freshOfficialSources || [];
  row.freshOfficialSources = [...new Map([
    ...previousSupplemental,
    {title:`Повторно визуально проверенный источник ${row.geo}`,url:a.acceptedUrl,role:a.classification,visualReview:"FRESH_HUMAN_VISUAL_ACCEPTANCE_2026_07_19"},
  ].map((source) => [source.url, source])).values()];
  if (patches[row.geo]) row.officialStatusPatch = patches[row.geo];
  else delete row.officialStatusPatch;
}
write("data/reviews/wiki-truth-grey-color-reaudit-39.json", re);

const reviews = read("data/official/cannabis_law_visual_reviews.audit.json");
const reviewByGeo = new Map(reviews.rows.map((r) => [r.geo, r]));
for (const a of rows) {
  const r = reviewByGeo.get(a.geo);
  r.fresh_grey_39_reaudit = {
    reviewed_at: acceptance.reviewedAt,
    classification: a.classification,
    visual_verdict: a.visualVerdict,
    accepted_url: a.acceptedUrl,
    screenshot_paths: a.screenshotPaths,
    visible_conclusion_ru: a.visibleConclusionRu,
  };
}
const directPatch = (geo, source, status, comparison) => {
  const r = reviewByGeo.get(geo);
  r.status = "VISUALLY_VERIFIED";
  r.screenshot_paths = byGeo.get(geo).screenshotPaths;
  r.verified_sources = source;
  r.official_status = status;
  r.project_comparison = comparison;
  r.conclusion = byGeo.get(geo).visibleConclusionRu;
};
directPatch("BJN", [{
  title: "Colombia Law 1787/2016 medical and scientific cannabis framework applying throughout the national territory",
  url: byGeo.get("BJN").acceptedUrl,
  source_kind: "COLOMBIA_NATIONAL_DIRECT_MEDICAL_CANNABIS_LAW_APPLIED_TO_BAJO_NUEVO_BY_OFFICIAL_TERRITORIAL_DECREE",
  screenshot_path: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/CO-medical-law.png",
}, {
  title: "Colombia Constitutional Court C-127/23 personal-dose cannabis judgment",
  url: "https://www.corteconstitucional.gov.co/relatoria/2023/C-127-23",
  source_kind: "COLOMBIA_NATIONAL_CONSTITUTIONAL_COURT_DIRECT_CANNABIS_STATUS_APPLIED_TO_BAJO_NUEVO_BY_OFFICIAL_TERRITORIAL_DECREE",
  screenshot_path: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/CO-personal-dose-ruling.png",
}], patches.BJN, {status:"NO_PROJECT_STATUS_COLOR_RESOLVED_FOR_COLOMBIAN_JURISDICTION_WITH_DISPUTED_TERRITORY_SCOPE_CAVEAT",reason:byGeo.get("BJN").visibleConclusionRu});
const bjn = reviewByGeo.get("BJN");
bjn.verified_context_sources = [...new Map([...(bjn.verified_context_sources || []), {
  title: "Colombia Decreto 1946/2013 listing Cayos de Bajo Nuevo within its archipelago department and asserting full jurisdiction",
  url: "https://www.dimar.mil.co/sites/default/files/normatividad/dec19462013.pdf",
  source_kind: "COLOMBIA_OFFICIAL_TERRITORIAL_APPLICABILITY_AND_JURISDICTION_CONTEXT_WITH_DISPUTED_SCOPE_CAVEAT",
  screenshot_path: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/BJN/pdf_pages/BJN-dimar-decreto-1946-2013-page-3.png",
}].map((source) => [source.url, source])).values()];
directPatch("SER", [{
  title: "Colombia Law 1787/2016 medical and scientific cannabis framework applying throughout the national territory",
  url: byGeo.get("SER").acceptedUrl,
  source_kind: "COLOMBIA_NATIONAL_DIRECT_MEDICAL_CANNABIS_LAW_APPLIED_TO_SERRANILLA_BY_OFFICIAL_TERRITORIAL_DECREE",
  screenshot_path: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/CO-medical-law.png",
}, {
  title: "Colombia Constitutional Court C-127/23 personal-dose cannabis judgment",
  url: "https://www.corteconstitucional.gov.co/relatoria/2023/C-127-23",
  source_kind: "COLOMBIA_NATIONAL_CONSTITUTIONAL_COURT_DIRECT_CANNABIS_STATUS_APPLIED_TO_SERRANILLA_BY_OFFICIAL_TERRITORIAL_DECREE",
  screenshot_path: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/CO-personal-dose-ruling.png",
}], patches.SER, {status:"NO_PROJECT_STATUS_COLOR_RESOLVED_FOR_COLOMBIAN_JURISDICTION_WITH_DISPUTED_TERRITORY_SCOPE_CAVEAT",reason:byGeo.get("SER").visibleConclusionRu});
const ser = reviewByGeo.get("SER");
ser.verified_context_sources = [...new Map([...(ser.verified_context_sources || []), {
  title: "Colombia Decreto 1946/2013 listing Cayos de Serranilla within its archipelago department and asserting full jurisdiction",
  url: "https://www.dimar.mil.co/sites/default/files/normatividad/dec19462013.pdf",
  source_kind: "COLOMBIA_OFFICIAL_TERRITORIAL_APPLICABILITY_AND_JURISDICTION_CONTEXT_WITH_DISPUTED_SCOPE_CAVEAT",
  screenshot_path: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-41/SER/screenshots/SER-dimar-decreto-1946-2013-page03-3.png",
}].map((source) => [source.url, source])).values()];
directPatch("TD", [{
  title: "Chad Loi No. 024/PR/2000 adopting ratified-convention narcotics schedules and regulating prescription, dispensing and offences",
  url: byGeo.get("TD").acceptedUrl,
  source_kind: "UNODC_OFFICIAL_COPY_OF_CHAD_NATIONAL_LAW_INCORPORATING_CURRENT_INTERNATIONAL_NARCOTICS_SCHEDULES",
  screenshot_path: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/TD/TD-unodc-loi-024-convention-list-10.png",
  additional_screenshot_path: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/TD/TD-unodc-loi-024-articles134-136-penalties-38.png",
}, {
  title: "INCB Yellow List 64th edition listing cannabis and cannabis resin, extracts and tinctures in Schedule I",
  url: "https://www.incb.org/incb/uploads/documents/Narcotic-Drugs/Yellow_List/64th_edition/YL_64th_E.pdf",
  source_kind: "CURRENT_OFFICIAL_INCB_CANNABIS_SCHEDULE_INCORPORATED_BY_CHAD_LAW_ARTICLE_36",
  screenshot_path: path.join(SCREEN, "TD-INCB-yellow-list-2025-p3.png"),
}], patches.TD, {status:"PROJECT_MEDICAL_STATUS_MISMATCH_GENERIC_PRESCRIPTION_FRAMEWORK_WITHOUT_PROVEN_CANNABIS_PRODUCT_ACCESS",reason:byGeo.get("TD").visibleConclusionRu});
directPatch("BF", [{title:"Burkina Faso cannabis-specific personal-use provisions and medical-prescription exception",url:byGeo.get("BF").acceptedUrl,source_kind:"NATIONAL_ASSEMBLY_DIRECT_CANNABIS_LAW_WITH_MEDICAL_PRESCRIPTION_EXCEPTION",screenshot_path:path.join(SCREEN,"BF.jpg")}], patches.BF, {status:"DIRECT_PAGE_FOUND_PREVIOUS_NO_DIRECT_CORRECTED_AND_COLOR_RESOLVED_FROM_MEDICAL_PRESCRIPTION_EXCEPTION",reason:byGeo.get("BF").visibleConclusionRu});
directPatch("AL", [{title:"Albania Law No. 61/2023 cannabis medical-production and domestic-access prohibitions",url:byGeo.get("AL").acceptedUrl,source_kind:"NATIONAL_CANNABIS_CONTROL_AGENCY_DIRECT_CANNABIS_LAW",screenshot_path:path.join(SCREEN,"AL-law-61-2023-article-5.jpg"),retrieval_alias:"https://nacc.gov.al/wp-content/uploads/2024/10/Law-no.-61-2023-On-the-control-of-the-cultivation-and-processing-of-the-cannabis-plant-and-the-production-of-its-by-products-for-medical-and-industrial-purposes.pdf"}], patches.AL, {status:"PROJECT_COLOR_MISMATCH_EXPORT_PRODUCTION_IS_REGULATED_BUT_DOMESTIC_PATIENT_ACCESS_PROHIBITED",reason:byGeo.get("AL").visibleConclusionRu});
directPatch("AZ", [
  {title:"Azerbaijan Law 960-IIQ List I prohibited cannabis resin, extract and tincture",url:byGeo.get("AZ").acceptedUrl,source_kind:"MINISTRY_OF_HEALTH_DIRECT_CANNABIS_PROHIBITED_CIRCULATION_LAW",screenshot_path:path.join(SCREEN,"AZ-prohibited-list-title.jpg"),additional_screenshot_path:path.join(SCREEN,"AZ-prohibited-cannabis.jpg")},
  {title:"Azerbaijan prohibited cannabis-hemp cultivation threshold table",url:"https://frameworks.e-qanun.az/34/f_34951.html",source_kind:"OFFICIAL_LEGAL_DATABASE_DIRECT_CANNABIS_CULTIVATION_PROHIBITION",screenshot_path:path.join(SCREEN,"AZ.jpg")},
], patches.AZ, {status:"MATCH_WITH_FRESH_CANNABIS_SPECIFIC_PROHIBITION_PROOF",reason:byGeo.get("AZ").visibleConclusionRu});
directPatch("VE", [{title:"Venezuela Organic Drug Law on UNODC SHERLOC official mirror",url:byGeo.get("VE").acceptedUrl,source_kind:"OFFICIAL_UN_LEGAL_MIRROR_DIRECT_CANNABIS_LAW",screenshot_path:path.join(SCREEN,"VE.jpg")}], patches.VE, {status:"DIRECT_PAGE_FOUND_PREVIOUS_NO_DIRECT_CORRECTED",reason:byGeo.get("VE").visibleConclusionRu});
directPatch("TK", [{title:"Tokelau Crimes, Procedure and Evidence Rules 2003, consolidated 2016",url:byGeo.get("TK").acceptedUrl,source_kind:"PACIFIC_LEGAL_DATABASE_DIRECT_CANNABIS_LAW_WITH_EXACT_ARCHIVE_RETRIEVAL_MIRROR",screenshot_path:path.join(SCREEN,"TK.jpg"),retrieval_mirror:"https://web.archive.org/web/20211030105515id_/http://www.paclii.org/tk/legis/consol_act_2016/cpaer2003302.pdf"}], patches.TK, {status:"PROJECT_MEDICAL_AND_ENFORCEMENT_SCOPE_REVIEW",reason:byGeo.get("TK").visibleConclusionRu});
directPatch("MS", [{title:"Montserrat current revised Drugs (Prevention of Misuse) Act",url:byGeo.get("MS").acceptedUrl,source_kind:"TERRITORY_GOVERNMENT_CURRENT_REVISED_DIRECT_CANNABIS_LAW",screenshot_path:path.join(SCREEN,"MS.jpg")}], patches.MS, {status:"CURRENT_ACT_REPLACES_UNPROVEN_ACT_24_ASSENT_ASSUMPTION",reason:byGeo.get("MS").visibleConclusionRu});
directPatch("LS", [{title:"Lesotho Drugs of Abuse (Amendment) Act 2022 official Gazette reproduction",url:byGeo.get("LS").acceptedUrl,source_kind:"EXACT_GOVERNMENT_GAZETTE_MIRROR_DIRECT_CANNABIS_LAW",screenshot_path:path.join(SCREEN,"LS-gazette-2022-p3.jpg"),additional_screenshot_paths:[path.join(SCREEN,"LS-gazette-2022-p9.jpg"),path.join(SCREEN,"LS-gazette-2022-p10.jpg"),path.join(SCREEN,"LS-gazette-2022-p11.jpg")]}], patches.LS, {status:"MATCH_WITH_LICENSED_MEDICAL_AND_STRICT_UNLAWFUL_CONDUCT_SCOPE",reason:byGeo.get("LS").visibleConclusionRu});
directPatch("MO", [
  {title:"Macao Law 17/2009 Table I-C cannabis schedule and illicit-conduct law",url:byGeo.get("MO").acceptedUrl,source_kind:"MACAO_OFFICIAL_GAZETTE_DIRECT_CANNABIS_LAW",screenshot_path:path.join(SCREEN,"MO-law17-cannabis.jpg")},
  {title:"Macao Decree-Law 34/99/M lawful-market scope and therapeutic authorization rules, republished by Law 27/2024",url:"https://bo.dsaj.gov.mo/bo/i/99/29/declei34.asp?printer=1",source_kind:"MACAO_OFFICIAL_GAZETTE_DIRECT_CONTROLLED_SUBSTANCE_THERAPEUTIC_AUTHORIZATION_LAW",screenshot_path:path.join(SCREEN,"MO-law34-scope.jpg"),additional_screenshot_path:path.join(SCREEN,"MO-law34-therapeutic.jpg")},
  {title:"Macao Judiciary Police cannabis offences and penalties",url:"https://www.pj.gov.mo/Web/Policia/law0102/20220110/13093.html",source_kind:"MACAO_JUDICIARY_POLICE_CURRENT_CANNABIS_ENFORCEMENT",screenshot_path:path.join(SCREEN,"MO.jpg")},
], patches.MO, {status:"PROJECT_COLOR_MISMATCH_LIMITED_THERAPEUTIC_AUTHORIZATION_REGIME",reason:byGeo.get("MO").visibleConclusionRu});
directPatch("US-IA", [
  {title:"Iowa Code 2026 §124E.12 medical cannabidiol affirmative defenses",url:"https://www.legis.iowa.gov/docs/code/2026/124E.12.pdf",source_kind:"STATE_LEGISLATURE_CURRENT_DIRECT_MEDICAL_CANNABIS_LAW",screenshot_path:path.join(SCREEN,"US-IA-medical-defense.jpg")},
  {title:"Iowa Code 2026 §124.401 marijuana possession penalties",url:"https://www.legis.iowa.gov/docs/code/2026/124.401.pdf",source_kind:"STATE_LEGISLATURE_CURRENT_DIRECT_MARIJUANA_POSSESSION_LAW",screenshot_path:path.join(SCREEN,"US-IA-possession.jpg")},
], patches["US-IA"], {status:"MATCH_WITH_FRESH_DIRECT_STATUTE_PROOF",reason:byGeo.get("US-IA").visibleConclusionRu});
directPatch("US-IN", [
  {title:"Indiana Health Schedule I cannabis status",url:byGeo.get("US-IN").acceptedUrl,source_kind:"STATE_HEALTH_OFFICIAL_CANNABIS_SCHEDULE_AND_NO_ACCEPTED_MEDICAL_USE",screenshot_path:path.join(SCREEN,"US-IN-schedule-cannabis.jpg"),additional_screenshot_path:path.join(SCREEN,"US-IN-schedule-no-medical.jpg")},
  {title:"Fort Wayne Police current marijuana possession enforcement",url:"https://www.cityoffortwayne.in.gov/CivicAlerts.aspx?AID=265",source_kind:"MUNICIPAL_POLICE_CURRENT_CANNABIS_ENFORCEMENT",screenshot_path:path.join(SCREEN,"US-IN.jpg")},
], patches["US-IN"], {status:"MATCH_WITH_FRESH_COMPOSITE_OFFICIAL_STATUS_PROOF",reason:byGeo.get("US-IN").visibleConclusionRu});
directPatch("SY", [
  {title:"Syria Narcotic Drugs Law No.2/1993 communicated by the Government of Syria",url:byGeo.get("SY").acceptedUrl,source_kind:"OFFICIAL_UN_GOVERNMENT_COMMUNICATED_DIRECT_NARCOTIC_AND_MEDICAL_PRESCRIPTION_LAW",screenshot_path:path.join(SCREEN,"SY-law-medical-prescriptions.jpg"),additional_screenshot_path:path.join(SCREEN,"SY-law-medical-manufacture.jpg")},
  {title:"SANA current cannabis cultivation arrest and enforcement",url:"https://sana.sy/locals/2303302/",source_kind:"SYRIAN_OFFICIAL_NEWS_CURRENT_DIRECT_CANNABIS_ENFORCEMENT",screenshot_path:path.join(SCREEN,"SY-current-cannabis-enforcement.jpg")},
  {title:"SANA 2026 decree confirming current Narcotic Drugs Law No.2/1993",url:"https://sana.sy/presidency/2407527/",source_kind:"SYRIAN_PRESIDENCY_CURRENT_LAW_STATUS",screenshot_path:path.join(SCREEN,"SY.jpg")},
], patches.SY, {status:"PROJECT_COLOR_REVIEW_GENERAL_MEDICAL_NARCOTIC_FRAMEWORK_WITHOUT_SPECIFIC_PRODUCT_AVAILABILITY",reason:byGeo.get("SY").visibleConclusionRu});
directPatch("GD", [
  {title:"Grenada current Drug Abuse (Prevention and Control) Act Cap.84A",url:byGeo.get("GD").acceptedUrl,source_kind:"GRENADA_PARLIAMENT_CURRENT_DIRECT_CANNABIS_LAW",screenshot_path:path.join(SCREEN,"GD-current-act-s12.jpg"),additional_screenshot_path:path.join(SCREEN,"GD-current-act-cannabis-schedule.jpg")},
  {title:"Grenada Act No.1 of 2026 cannabis amendment, enacted but not formally commenced",url:"https://grenadaparliament.gd/wp-content/uploads/2026/02/Act-No.-1-of-2026-Drug-Abuse-Prevention-and-Control-Amendment-Act-2026.pdf",source_kind:"GRENADA_PARLIAMENT_DIRECT_CANNABIS_LAW_ENACTED_NOT_FORMALLY_COMMENCED",screenshot_path:path.join(SCREEN,"GD-act-four-plants.jpg"),additional_screenshot_path:path.join(SCREEN,"GD-act-quantities.jpg")},
], patches.GD, {status:"CURRENT_LAW_COLOR_RESOLVED_AND_ACT_1_2026_NOT_YET_COMMENCED",reason:byGeo.get("GD").visibleConclusionRu});
directPatch("PM", [
  {title:"France current cannabis-use prohibition and Article L3421-1 penalties",url:byGeo.get("PM").acceptedUrl,source_kind:"NATIONAL_PUBLIC_HEALTH_SERVICE_DIRECT_CURRENT_CANNABIS_LAW_STATUS_APPLICABLE_TO_PM",screenshot_path:path.join(SCREEN,"FR.jpg")},
  {title:"Service Public medical-cannabis transition ending 31 March 2026",url:"https://www.service-public.fr/particuliers/actualites/A16479?lang=fr",source_kind:"DILA_DIRECT_MEDICAL_CANNABIS_REGULATORY_STATUS_WITH_EXPLICIT_EXPIRY",screenshot_path:path.join(SCREEN,"PM-medical-expiry.jpg")},
], patches.PM, {status:"COLOR_RESOLVED_BY_DIRECT_FRANCE_CANNABIS_STATUS_PLUS_VISUALLY_VERIFIED_PM_APPLICABILITY_AND_ENFORCEMENT",reason:byGeo.get("PM").visibleConclusionRu});
const pm = reviewByGeo.get("PM");
pm.verified_context_sources = [...new Map([...(pm.verified_context_sources || []),
  {title:"French Senate report on application of laws and regulations in Saint-Pierre-et-Miquelon",url:"https://www.senat.fr/rap/l06-025-1/l06-025-1104.html",source_kind:"OFFICIAL_LEGISLATIVE_TERRITORIAL_APPLICABILITY_CONTEXT",screenshot_path:path.join(SCREEN,"PM-senat-applicability.jpg")},
  {title:"Saint-Pierre-et-Miquelon prefect annual report documenting local cannabis trafficking enforcement",url:"https://www.saint-pierre-et-miquelon.gouv.fr/contenu/telechargement/6429/51904/file/Rapport%20d%27activit%C3%A9%2015-01-2020.pdf",source_kind:"TERRITORY_GOVERNMENT_DIRECT_CANNABIS_ENFORCEMENT_CONTEXT",screenshot_path:path.join(SCREEN,"PM-local-cannabis-enforcement.jpg")},
].map((source) => [source.url, source])).values()];
for (const geo of ["BL", "MF"]) {
  directPatch(geo, [
    {title:"France current cannabis-use prohibition and Article L3421-1 penalties",url:byGeo.get(geo).acceptedUrl,source_kind:`NATIONAL_PUBLIC_HEALTH_SERVICE_DIRECT_CURRENT_CANNABIS_LAW_STATUS_APPLICABLE_TO_${geo}`,screenshot_path:path.join(SCREEN,"FR.jpg")},
    {title:"Service Public medical-cannabis transition ending 31 March 2026",url:"https://www.service-public.fr/particuliers/actualites/A16479?lang=fr",source_kind:"DILA_DIRECT_MEDICAL_CANNABIS_REGULATORY_STATUS_WITH_EXPLICIT_EXPIRY",screenshot_path:path.join(SCREEN,"PM-medical-expiry.jpg")},
  ], patches[geo], {status:"COLOR_RESOLVED_BY_DIRECT_FRANCE_CANNABIS_STATUS_PLUS_VISUALLY_VERIFIED_TERRITORY_APPLICABILITY",reason:byGeo.get(geo).visibleConclusionRu});
  const review = reviewByGeo.get(geo);
  review.verified_context_sources = [...new Map([...(review.verified_context_sources || []),
    {title:"French Senate 2025 impact study quoting direct application statutes for Saint-Barthélemy and Saint-Martin",url:"https://www.senat.fr/leg/etudes-impact/pjl25-118-ei/pjl25-118-ei.html",source_kind:"OFFICIAL_CURRENT_LEGISLATIVE_TERRITORY_APPLICABILITY_CONTEXT",screenshot_path:path.join(SCREEN,"BL-MF-current-applicability.jpg")},
    {title:"Saint-Barthélemy and Saint-Martin prefecture 2026 cannabis-use context",url:"https://www.saint-barth-saint-martin.gouv.fr/Actualites/Appel-a-Projets/APPEL-A-PROJET-2026-MILDECA",source_kind:"CURRENT_TERRITORY_GOVERNMENT_DIRECT_CANNABIS_CONTEXT",screenshot_path:path.join(SCREEN,`${geo}.jpg`)},
    geo === "BL"
      ? {title:"French Senate report confirming health and hospital-financing fields remain state competence in Saint-Barthélemy",url:"https://www.senat.fr/rap/l22-404/l22-4041.html",source_kind:"OFFICIAL_LEGISLATIVE_HEALTH_COMPETENCE_CONTEXT",screenshot_path:path.join(SCREEN,"BL-health-state-competence.jpg")}
      : {title:"French Senate report listing Saint-Martin normative competences and retained state criminal-law competence",url:"https://www.senat.fr/rap/l06-025-1/l06-025-1_mono.html",source_kind:"OFFICIAL_LEGISLATIVE_TERRITORY_COMPETENCE_CONTEXT",screenshot_path:path.join(SCREEN,"MF-normative-competences.jpg")},
  ].map((source) => [source.url, source])).values()];
}
directPatch("TF", [
  {title:"France current cannabis-use prohibition and Article L3421-1 penalties",url:byGeo.get("TF").acceptedUrl,source_kind:"NATIONAL_PUBLIC_HEALTH_SERVICE_DIRECT_CURRENT_CANNABIS_LAW_STATUS_EXTENDED_TO_TAAF",screenshot_path:path.join(SCREEN,"FR.jpg")},
  {title:"French National Assembly adopted 2025 amendment updating TAAF Article L3833-1 toxicomania-law applicability",url:"https://www.assemblee-nationale.fr/dyn/17/amendements/1277/AN/2",source_kind:"NATIONAL_ASSEMBLY_DIRECT_TAAF_PUBLIC_HEALTH_CODE_APPLICABILITY_LAW",screenshot_path:path.join(SCREEN,"TF-L3833-1-current-amendment.jpg")},
], patches.TF, {status:"COLOR_RESOLVED_BY_DIRECT_CANNABIS_STATUS_AND_TAAF_TOXICOMANIA_LAW_APPLICABILITY_WITH_MEDICAL_SCOPE_UNCONFIRMED",reason:byGeo.get("TF").visibleConclusionRu});
const gd = reviewByGeo.get("GD");
gd.verified_context_sources = [...new Map([...(gd.verified_context_sources || []), {title:"Grenada Cannabis Commission current force FAQ",url:"https://mail.cannabiscommission.gov.gd/faqs",source_kind:"NATIONAL_CANNABIS_REGULATOR_CURRENT_FORCE_STATUS",screenshot_path:path.join(SCREEN,"GD.jpg"),note:"Formal commencement of Act 1/2026 has not yet occurred; existing cannabis laws remain enforceable."}].map((source) => [source.url, source])).values()];
const fr = reviewByGeo.get("FR");
fr.verified_sources.push({title:"Drogues Info Service current cannabis enforcement page",url:byGeo.get("FR").acceptedUrl,source_kind:"NATIONAL_PUBLIC_HEALTH_SERVICE_CURRENT_CANNABIS_LAW_STATUS",screenshot_path:path.join(SCREEN,"FR.jpg")});
fr.screenshot_paths.push(path.join(SCREEN,"FR.jpg"));
fr.official_status = patches.FR;
fr.project_comparison = {status:"PROJECT_STATUS_REVIEW_CURRENT_JULY_2026",reason:byGeo.get("FR").visibleConclusionRu};
fr.conclusion = byGeo.get("FR").visibleConclusionRu;
directPatch("DJ", [{
  title: "Djibouti Arrêté 1932 controlling Indian hemp, resin, preparations, extract and tincture with therapeutic prescription exception",
  url: byGeo.get("DJ").acceptedUrl,
  source_kind: "TERRITORIAL_CANNABIS_SCHEDULE_AND_THERAPEUTIC_PRESCRIPTION_LAW_RETAINED_BY_INDEPENDENCE_CONTINUITY_CLAUSE",
  screenshot_path: path.join(SCREEN, "DJ-1932-cannabis-schedule.jpg"),
  additional_screenshot_path: path.join(SCREEN, "DJ-1932-therapeutic-prescription.jpg"),
}, {
  title: "Djibouti Free Zone Decree 2003 article 13 cannabis, Indian hemp, hashish and resin import prohibition",
  url: "https://www.journalofficiel.dj/texte-juridique/decret-n2003-0202-pre-portant-reglementation-des-activites-economiques-des-zones-franches-a-djibouti/",
  source_kind: "CURRENT_SCOPE_LIMITED_FREE_ZONE_DIRECT_CANNABIS_PROHIBITION",
  screenshot_path: path.join(SCREEN, "DJ.jpg"),
}], patches.DJ, {status:"PROJECT_COLOR_MISMATCH_LIMITED_THERAPEUTIC_PRESCRIPTION_EXCEPTION",reason:byGeo.get("DJ").visibleConclusionRu});
const dj = reviewByGeo.get("DJ");
dj.verified_context_sources = [...new Map([...(dj.verified_context_sources || []),
  {
    title: "Djibouti constitutional law LR/77-001 Article 5 retaining pre-independence laws until repeal or amendment",
    url: "https://www.journalofficiel.dj/texte-juridique/proclamation-nlr-77-001-du-27-juin-1977-dite-loi-constitutionnelle-n1-de-proclamation-de-la-republique-de-djibouti-une-et-indivisible-independante-et-souveraine/",
    source_kind: "OFFICIAL_CONSTITUTIONAL_LEGAL_CONTINUITY_CONTEXT",
    screenshot_path: path.join(SCREEN, "DJ-1977-legal-continuity.jpg"),
  },
  {
    title: "Djibouti 2026 presidential clemency decree excluding drug and narcotics-trafficking convictions",
    url: "https://www.journalofficiel.dj/texte-juridique/decret-n2026-104-pr-mjdh-portant-mesures-de-grace-presidentielle/",
    source_kind: "CURRENT_OFFICIAL_DRUG_CONVICTION_ENFORCEMENT_CONTEXT",
    screenshot_path: path.join(SCREEN, "DJ-2026-drug-enforcement-context.jpg"),
  },
].map((source) => [source.url, source])).values()];
const et = reviewByGeo.get("ET");
et.status = "VISUALLY_VERIFIED";
et.screenshot_paths = byGeo.get("ET").screenshotPaths;
et.verified_sources = [{
  title: "Ethiopia Dangerous Drugs Proclamation naming canabis indica, pharmacy sale and medical prescription",
  url: byGeo.get("ET").acceptedUrl,
  source_kind: "OFFICIAL_UN_GOVERNMENT_COMMUNICATED_DIRECT_HISTORIC_CANNABIS_LAW_CURRENT_FORCE_UNCONFIRMED",
  screenshot_path: path.join(SCREEN, "ET-dangerous-drugs-1942.jpg"),
}];
et.verified_context_sources = [...new Map([...(et.verified_context_sources || []),
  {
    title: "Ethiopia Food and Medicine Administration Proclamation 1112/2019 current narcotic prescription and prior-law consistency rules",
    url: "https://www.efda.gov.et/wp-content/uploads/2020/06/Food-and-Medicine-Administration-Proclamation-1112.pdf",
    source_kind: "CURRENT_GENERIC_NARCOTIC_MEDICINE_CONTROL_AND_REPEAL_CONTEXT",
    screenshot_path: path.join(SCREEN, "ET-current-prescription-law-p35.jpg"),
    additional_screenshot_path: path.join(SCREEN, "ET-current-repeal-law-p72.jpg"),
  },
  {
    title: "Ethiopia NPS Formulary historical background naming cannabis products",
    url: "https://www.efda.gov.et/wp-content/plugins/download-attachments/includes/download.php?id=3319",
    source_kind: "OFFICIAL_FORMULARY_BACKGROUND_CONTEXT_NOT_OPERATIVE_CANNABIS_STATUS",
    screenshot_path: path.join(SCREEN, "ET-NPS-formulary-p3.jpg"),
  },
].map((source) => [source.url, source])).values()];
et.official_status = {
  recreational: "CURRENT_STATUS_UNCONFIRMED_HISTORIC_CANNABIS_SPECIFIC_RESTRICTIONS_VISUALLY_PROVEN",
  medical: "CURRENT_STATUS_UNCONFIRMED_HISTORIC_PRESCRIPTION_EXCEPTION_AND_CURRENT_GENERIC_NARCOTIC_PRESCRIPTION_FRAMEWORK",
  enforcement: "UNCONFIRMED_CURRENT_CANNABIS_SPECIFIC_ENFORCEMENT",
};
et.project_comparison = {status:"DIRECT_HISTORIC_CANNABIS_PAGE_FOUND_CURRENT_FORCE_NOT_PROVEN_COLOR_REMAINS_GREY",reason:byGeo.get("ET").visibleConclusionRu};
et.conclusion = byGeo.get("ET").visibleConclusionRu;
const kp = reviewByGeo.get("KP");
kp.verified_context_sources = [...new Map([...(kp.verified_context_sources || []), {
  title: "DPRK Drug Management Law amended 14 December 2021 full PDF",
  url: "https://www.unilaw.go.kr/cmm/fms/FileDown.do?atchFileId=FILE_000000000001294&fileSn=2&mblSe=W",
  source_kind: "OFFICIAL_FOREIGN_GOVERNMENT_DATABASE_FULL_DPRK_GENERIC_NARCOTIC_LAW_NO_CANNABIS_TERM",
  screenshot_path: path.join(SCREEN, "KP-drug-law-2021-title.png"),
  additional_screenshot_path: path.join(SCREEN, "KP-drug-law-2021-medical-use.png"),
}, {
  title: "DPRK Drug Crime Prevention Act enacted 1 July 2021 in Commentary on DPRK Criminal Law 2025",
  url: "https://www.unilaw.go.kr/cmm/fms/FileDown.do?atchFileId=META_000000000036791&fileSn=0&mblSe=W",
  source_kind: "OFFICIAL_FOREIGN_GOVERNMENT_DATABASE_FULL_DPRK_GENERIC_DRUG_CRIME_LAW_NO_CANNABIS_TERM",
  screenshot_path: path.join(SCREEN, "KP-drug-crime-law-title-scope.png"),
  additional_screenshot_path: path.join(SCREEN, "KP-drug-crime-law-penalties.png"),
}].map((source) => [source.url, source])).values()];
kp.conclusion = byGeo.get("KP").visibleConclusionRu;
const scr = reviewByGeo.get("SCR");
scr.screenshot_paths = byGeo.get("SCR").screenshotPaths;
scr.verified_context_sources = [...new Map([...(scr.verified_context_sources || []), {
  title: "Embassy of China statement asserting sovereignty and governmental jurisdiction over Huangyan Island / Scarborough Shoal",
  url: "https://ph.china-embassy.gov.cn/eng/xwfb/201206/t20120608_1180427.htm",
  source_kind: "CHINA_CLAIMANT_SOVEREIGNTY_AND_JURISDICTION_CONTEXT_ONLY",
  screenshot_path: path.join(SCREEN, "SCR-china-embassy-claim.png"),
}, {
  title: "Criminal Law of China articles 351 and 357 naming marijuana and narcotic-drug penalties",
  url: "https://english.court.gov.cn/2015-12/01/c_761557_32.htm",
  source_kind: "CHINA_CLAIMANT_DIRECT_CANNABIS_CRIMINAL_LAW_CONTEXT_ONLY_FOR_DISPUTED_SCR",
  screenshot_path: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/CN/CN-official-criminal-law-cannabis-evidence.png",
}].map((source) => [source.url, source])).values()];
scr.project_comparison = {
  status: "COMPETING_CLAIMANT_CANNABIS_LAWS_NO_SETTLED_TERRITORIAL_STATUS_COLOR_REMAINS_GREY",
  reason: byGeo.get("SCR").visibleConclusionRu,
};
scr.conclusion = byGeo.get("SCR").visibleConclusionRu;
const kas = reviewByGeo.get("KAS");
kas.screenshot_paths = byGeo.get("KAS").screenshotPaths;
kas.project_comparison = {
  status: "COMPETING_CLAIMANT_CANNABIS_REGIMES_NO_SINGLE_SIACHEN_STATUS_COLOR_REMAINS_GREY",
  reason: byGeo.get("KAS").visibleConclusionRu,
};
kas.conclusion = byGeo.get("KAS").visibleConclusionRu;
const spi = reviewByGeo.get("SPI");
spi.screenshot_paths = byGeo.get("SPI").screenshotPaths;
spi.verified_context_sources = [...new Map([...(spi.verified_context_sources || []), {
  title: "Chile Ministry of Foreign Affairs statement on Southern Patagonian Ice Field boundary work under the 1998 Agreement",
  url: "https://www.minrel.gob.cl/sala-de-prensa/comunicado-por-inventario-nacional-de-glaciares-de-argentina",
  source_kind: "CHILE_OFFICIAL_PENDING_JOINT_BOUNDARY_CARTOGRAPHY_CONTEXT_ONLY",
  screenshot_path: path.join(SCREEN, "SPI-chile-foreign-ministry-boundary.png"),
}].map((source) => [source.url, source])).values()];
spi.project_comparison = {
  status: "COMPETING_CLAIMANT_CANNABIS_REGIMES_AND_PENDING_BOUNDARY_COLOR_REMAINS_GREY",
  reason: byGeo.get("SPI").visibleConclusionRu,
};
spi.conclusion = byGeo.get("SPI").visibleConclusionRu;
const pga = reviewByGeo.get("PGA");
pga.screenshot_paths = byGeo.get("PGA").screenshotPaths;
pga.verified_context_sources = [...new Map([...(pga.verified_context_sources || []),
  {title:"United Nations report A/47/623 identifying the six competing Spratly claimants",url:"https://digitallibrary.un.org/record/155981/files/A_47_623-EN.pdf",source_kind:"UNITED_NATIONS_SIX_PARTY_SPRATLY_DISPUTE_CONTEXT",screenshot_path:path.join(SCREEN,"PGA-UN-six-claimants-p15.png")},
  {title:"Brunei Misuse of Drugs Act Cap. 27 cannabis and cannabis resin Class A controls",url:"https://www.agc.gov.bn/AGC%20Images/LAWS/ACT_PDF/cap027.pdf",source_kind:"BRUNEI_CLAIMANT_DIRECT_CANNABIS_LAW_CONTEXT_ONLY_FOR_PGA",screenshot_path:"/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/BN/BN-class-a.png"},
  {title:"China Criminal Law articles 347, 348 and 351 narcotic-drug and marijuana offences",url:"https://english.court.gov.cn/2015-12/01/c_761557_31.htm",source_kind:"CHINA_CLAIMANT_DIRECT_CANNABIS_LAW_CONTEXT_ONLY_FOR_PGA",screenshot_path:"/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/CN/CN-official-criminal-law-cannabis-evidence.png"},
  {title:"China Criminal Law article 357 definition naming marijuana",url:"https://english.court.gov.cn/2015-12/01/c_761557_32.htm",source_kind:"CHINA_CLAIMANT_DIRECT_CANNABIS_DEFINITION_CONTEXT_ONLY_FOR_PGA",screenshot_path:"/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/CN/CN-official-criminal-law-cannabis-evidence.png"},
  {title:"Malaysia Dangerous Drugs Act 1952 Act 234 cannabis definition and penalties",url:"https://lom.agc.gov.my/ilims/upload/portal/akta/outputaktap/1840725_BI/22.11.2023%20-%20Act%20234.pdf",source_kind:"MALAYSIA_CLAIMANT_DIRECT_CANNABIS_LAW_CONTEXT_ONLY_FOR_PGA",screenshot_path:"/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/MY/MY-act234-page-007-cannabis-definition.png"},
  {title:"Taiwan FDA cannabis legality page",url:"https://www.fda.gov.tw/TC/newsContent.aspx?id=25250",source_kind:"TAIWAN_CLAIMANT_DIRECT_CANNABIS_STATUS_CONTEXT_ONLY_FOR_PGA",screenshot_path:"/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/former-62-countries-batch2/TW-fda-cannabis.png"},
  {title:"Vietnam Decree 28/2026 controlled lists naming cannabis plant and cannabis preparations",url:"https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/01/28-cp.signed.pdf",source_kind:"VIETNAM_CLAIMANT_DIRECT_CANNABIS_SCHEDULE_CONTEXT_ONLY_FOR_PGA",screenshot_path:"/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-5/VN/screenshots/pdf_pages/VN-decree-28-2026-list-i-cannabis-plant.png"},
  {title:"Vietnam Law 73/2021 on Drug Prevention and Control defining cannabis plant",url:"https://datafiles.chinhphu.vn/cpp/files/vbpq/2022/01/73luat.pdf",source_kind:"VIETNAM_CLAIMANT_DIRECT_CANNABIS_DRUG_LAW_CONTEXT_ONLY_FOR_PGA",screenshot_path:"/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-5/VN/screenshots/pdf_pages/VN-law-73-2021-title-page-01.png"},
].map((source) => [source.url, source])).values()];
pga.project_comparison = {
  status: "SIX_COMPETING_CLAIMANT_CANNABIS_REGIMES_NO_WHOLE_SPRATLY_STATUS_COLOR_REMAINS_GREY",
  reason: byGeo.get("PGA").visibleConclusionRu,
};
pga.conclusion = byGeo.get("PGA").visibleConclusionRu;
const sj = reviewByGeo.get("SJ");
sj.screenshot_paths = byGeo.get("SJ").screenshotPaths;
sj.verified_context_sources = [...new Map([...(sj.verified_context_sources || []),
  {
    title: "Lov om Jan Mayen sections 1 and 2: Norwegian criminal law applies to Jan Mayen",
    url: "https://lovdata.no/dokument/NL/lov/1930-02-27-2",
    source_kind: "JAN_MAYEN_OFFICIAL_CRIMINAL_LAW_APPLICABILITY_CONTEXT",
    screenshot_path: path.join(SCREEN, "SJ.jpg"),
  },
  {
    title: "Health-law applicability regulation: Medicines Act applies to Svalbard but is absent from the Jan Mayen section",
    url: "https://lovdata.no/dokument/SF/forskrift/2015-06-22-747",
    source_kind: "COMBINED_GEO_OFFICIAL_PARTIAL_MEDICAL_LAW_APPLICABILITY_CONTEXT",
    screenshot_path: path.join(SCREEN, "SJ-Svalbard-medicines-law.jpg"),
    additional_screenshot_path: path.join(SCREEN, "SJ-Jan-Mayen-health-list.jpg"),
  },
  {
    title: "Norway Medicines Act section 31 current narcotics possession and use penalty",
    url: "https://lovdata.no/dokument/NL/lov/1992-12-04-132/KAPITTEL_12",
    source_kind: "NORWAY_DIRECT_CURRENT_NARCOTICS_PENALTY_CONTEXT_APPLIED_BY_CRIMINAL_LAW_BRIDGE",
    screenshot_path: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/NO-current-possession-penalty.png",
  },
  {
    title: "Norwegian Medical Products Agency cannabis treatment under current regulations",
    url: "https://www.dmp.no/en/special-permit-named-patient/for-physicians-and-dentists/medicinal-products-frequently-inquired-about-for-special-permit-named-patient/procedure-for-treatment-with-cannabis-within-current-regulations",
    source_kind: "NORWAY_DIRECT_CURRENT_MEDICAL_CANNABIS_CONTEXT_WITH_SVALBARD_ONLY_APPLICABILITY_PROVEN",
    screenshot_path: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/NO-medical-cannabis-current.png",
  },
].map((source) => [source.url, source])).values()];
sj.project_comparison = {
  status: "CRIMINAL_STATUS_PROVEN_FOR_BOTH_COMPONENTS_MEDICAL_STATUS_PROVEN_FOR_SVALBARD_ONLY_COLOR_REMAINS_GREY",
  reason: byGeo.get("SJ").visibleConclusionRu,
};
sj.conclusion = byGeo.get("SJ").visibleConclusionRu;
for (const a of rows) {
  const r = reviewByGeo.get(a.geo);
  const previous = previousMatrixByGeo.get(a.geo);
  const existingUrls = new Set([
    ...(r.verified_sources || []),
    ...(r.verified_context_sources || []),
  ].map((source) => source.url));
  for (const link of [...(previous?.directOfficialCannabisLawLinks || []), ...(previous?.officialContextLinks || [])]) {
    if (existingUrls.has(link.url)) continue;
    (r.verified_context_sources ||= []).push({
      title: link.title,
      url: link.url,
      source_kind: `PRESERVED_PREVIOUSLY_PUBLISHED_LINK_RECLASSIFIED_AS_CONTEXT_${link.sourceKind || "UNKNOWN"}`,
      screenshot_path: link.screenshotPath || a.screenshotPaths[0],
      note: "Ссылка сохранена anti-shrink правилом. После свежего визуального аудита она не повышает доказательство выше явно указанного контекстного статуса.",
    });
    existingUrls.add(link.url);
  }
}
for (const review of reviews.rows) {
  for (const key of ["verified_sources", "verified_context_sources"]) {
    if (!Array.isArray(review[key])) continue;
    review[key] = [...new Map(review[key].map((source) => [source.url, source])).values()];
  }
}
reviews.reviewed_at = acceptance.reviewedAt;
reviews.review_rule = "VISUALLY_VERIFIED requires a fresh isolated HTML render or exact relevant PDF page viewed by eye. Claimant/context/negative evidence is separately classified and never promoted to territorial law.";
write("data/official/cannabis_law_visual_reviews.audit.json", reviews);

console.log(`ACCEPTANCE_ROWS=${rows.length}`);
console.log(`DIRECT_OR_COMPOSITE=${acceptance.directOrCompositeCannabisPages}`);
console.log(`CONTEXT_CLAIMANT_NEGATIVE=${acceptance.contextClaimantOrNegativeOnly}`);
console.log(`COLOR_RESOLVED=${resolved.size}`);
console.log(`HONEST_GREY=${39 - resolved.size}`);
