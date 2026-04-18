import { afterEach, describe, expect, it } from "vitest";
import { answerWithAssistant, buildContext, generateAnswer } from "./aiRuntime";
import { isContinuationQuery, rememberDialog, resetDialogState } from "./dialog";
import { buildMessages, buildPrompt } from "./prompt";

afterEach(() => {
  resetDialogState();
});

describe("aiRuntime", () => {
  it("builds grounded legal context from country storage and query intent", () => {
    const context = buildContext("Can I fly with weed from Iran?", "IR", undefined, [], "en");
    expect(context.intent).toBe("airport");
    expect(context.location.geoHint).toBe("IR");
    expect(context.legal?.resultStatus).toBe("ILLEGAL");
    expect(context.airports.summary).toBeTruthy();
  });

  it("prefers an explicitly mentioned jurisdiction over ambient geo hint", () => {
    const context = buildContext("Germany cannabis?", "NO", undefined, [], "en");
    expect(context.location.geoHint).toBe("DE");
    expect(context.location.name).toMatch(/Germany/);
    expect(context.legal?.resultStatus).toBe("LEGAL");
  });

  it("keeps the locked country on follow-ups instead of falling back to geo hint", () => {
    const firstContext = buildContext("Germany cannabis?", "NO", undefined, [], "en");
    rememberDialog(firstContext, "Germany stays the topic.");

    const followUp = buildContext("And risks?", "NO", undefined, [], "en");
    expect(followUp.location.geoHint).toBe("DE");
    expect(followUp.location.source).toBe("user");
    expect(followUp.compare).toBeNull();
  });

  it("uses a changed selected route country and adds only the compare country on compare prompts", () => {
    const firstContext = buildContext("Germany cannabis?", "NO", undefined, [], "en");
    rememberDialog(firstContext, "Germany stays the topic.");

    const compare = buildContext("Compare with Netherlands", "NO", undefined, [], "en");
    expect(compare.location.geoHint).toBe("NO");
    expect(compare.compare?.geoHint).toBe("NL");
    expect(compare.location.name).toMatch(/Norway/);
    expect(compare.compare?.name).toMatch(/Netherlands/);
  });

  it("keeps the hinted route country as primary on a fresh compare prompt", () => {
    const compare = buildContext("Compare Malaysia with Thailand in plain language.", "MY", undefined, [], "en");
    expect(compare.location.geoHint).toBe("MY");
    expect(compare.location.name).toMatch(/Malaysia/);
    expect(compare.compare?.geoHint).toBe("TH");
    expect(compare.compare?.name).toMatch(/Thailand/);
  });

  it("resolves common English compare aliases when display names include local scripts", () => {
    const vietnam = buildContext("Compare practical risk with Vietnam.", "SG", undefined, [], "en");
    const greece = buildContext("Compare with Greece.", "RO", undefined, [], "en");
    const spain = buildContext("Compare with Spain.", "MA", undefined, [], "en");

    expect(vietnam.compare?.name).toMatch(/Vietnam/);
    expect(greece.compare?.name).toMatch(/Greece/);
    expect(spain.compare?.name).toMatch(/Spain/);
    expect(generateAnswer(vietnam)).toContain("Vietnam");
    expect(generateAnswer(greece)).toContain("Greece");
    expect(generateAnswer(spain)).toContain("Spain");
  });

  it("keeps the locked location for short follow-ups even when the ambient hint changes", () => {
    const firstContext = buildContext("Germany cannabis?", "DE", undefined, [], "en");
    rememberDialog(firstContext, "Germany stays the topic.");

    const followUp = buildContext("Where safer?", "NO", undefined, [], "en");
    expect(followUp.location.geoHint).toBe("DE");
    expect(followUp.location.name).toMatch(/Germany/);
  });

  it("lets a fresh selected route country replace the previous dialog location", () => {
    const firstContext = buildContext("What is cannabis law here?", "PE", undefined, [], "en");
    rememberDialog(firstContext, "Peru was the previous topic.");

    const nextContext = buildContext("объясни, что такое joint и почему это не значит legal", "MA", undefined, [], "ru");
    const answer = generateAnswer(nextContext);

    expect(nextContext.location.geoHint).toBe("MA");
    expect(answer).toContain("Morocco");
    expect(answer).not.toContain("Peru");
    expect(answer).toMatch(/^Смотри/);
    expect(answer).not.toContain("Смотри:\n\nСмотри");
  });

  it("uses the selected route country as primary on a fresh compare prompt", () => {
    const firstContext = buildContext("What is cannabis law here?", "PE", undefined, [], "en");
    rememberDialog(firstContext, "Peru was the previous topic.");

    const compare = buildContext("Compare practical risk with Netherlands", "HR", undefined, [], "en");
    const answer = generateAnswer(compare);

    expect(compare.location.geoHint).toBe("HR");
    expect(compare.location.name).toMatch(/Croatia/);
    expect(compare.compare?.name).toMatch(/Netherlands/);
    expect(answer).toContain("Croatia");
    expect(answer).not.toContain("Peru");
  });

  it("generates a grounded dialogue answer without inventing a legal upgrade", () => {
    const context = buildContext("Что по закону в Иране?", "IR", undefined, [], "ru");
    const answer = generateAnswer(context);
    expect(answer).toContain("каннабис запрещён");
    expect(answer).not.toContain("легален");
  });

  it("continues the previous topic for a short follow-up instead of restarting", () => {
    const firstContext = buildContext("Что по закону в Индии?", "IN", undefined, [], "ru");
    const firstAnswer = generateAnswer(firstContext);
    rememberDialog(firstContext, firstAnswer);

    const followUpContext = buildContext("и?", "IN", undefined, [], "ru");
    const answer = generateAnswer(followUpContext);
    expect(isContinuationQuery("и?")).toBe(true);
    expect(answer).toMatch(/Есть ещё момент|Если копнуть глубже/);
    expect(answer).not.toContain("Смотри спокойно");
  });

  it("injects few-shot style examples into the prompt", () => {
    const context = buildContext("Что по закону в Германии?", "DE", undefined, [], "ru");
    const prompt = buildPrompt({ query: "Что по закону в Германии?", context });
    expect(prompt).toContain("Style examples:");
    expect(prompt).toContain("Germany cannabis");
    expect(prompt).toContain("And risk?");
  });

  it("builds minimal live messages around the last turn only", () => {
    const firstContext = buildContext("Что по закону в Индии?", "IN", undefined, [], "ru");
    rememberDialog(firstContext, "Тестовый прошлый ответ.");
    const nextContext = buildContext("а еще?", "IN", undefined, [], "ru");
    const messages = buildMessages({ query: "а еще?", context: nextContext });
    expect(messages.length).toBeLessThanOrEqual(6);
    expect(messages[0]?.role).toBe("system");
    expect(messages[1]?.role).toBe("system");
    expect(messages[1]?.content).toContain("Location: India");
    expect(messages[2]?.role).toBe("system");
    expect(messages[2]?.content).toContain("Topic:");
    expect(messages[3]?.role).toBe("assistant");
    expect(messages[3]?.content).toContain("Тестовый прошлый ответ.");
    expect(messages[4]?.role).toBe("user");
    expect(messages[4]?.content).toContain("Что по закону в Индии?");
    expect(messages.at(-1)?.role).toBe("user");
  });

  it("adds a hard location anchor and compare guard to the prompt summary", () => {
    const firstContext = buildContext("Germany cannabis?", "DE", undefined, [], "en");
    rememberDialog(firstContext, "Germany stays the topic.");
    const compare = buildContext("Compare with Netherlands", "NO", undefined, [], "en");
    const messages = buildMessages({ query: "Compare with Netherlands", context: compare });

    expect(messages[1]?.content).toContain("Location: Norway");
    expect(messages[2]?.content).toContain("Topic:");
    expect(messages.at(-1)?.content).toContain("Compare ONLY:");
    expect(messages.at(-1)?.content).toContain("Norway");
    expect(messages.at(-1)?.content).toContain("Netherlands");
  });

  it("does not drag the previous subtopic into a new non-follow-up question", () => {
    const firstContext = buildContext("Что такое 420?", "FI", undefined, [], "ru");
    rememberDialog(firstContext, "420 - это культурный шифр вокруг каннабиса.");
    const nextContext = buildContext("Какие фильмы посоветуешь?", "FI", undefined, [], "ru");
    const messages = buildMessages({ query: "Какие фильмы посоветуешь?", context: nextContext });

    expect(messages[1]?.content).toContain("Location: Finland");
    expect(messages[2]?.content).toContain("Topic:");
    expect(messages.at(-1)?.content).toContain("Какие фильмы посоветуешь?");
  });

  it("answers CBD-like product risk questions with a grounded non-empty product answer", () => {
    const context = buildContext("If I carry CBD flower, is that still risky?", "IT", undefined, [], "en");
    const answer = generateAnswer(context);

    expect(answer).toContain("CBD-like products");
    expect(answer).toContain("Italy");
    expect(answer.toLowerCase()).toContain("risk");
    expect(answer.length).toBeGreaterThan(120);
  });

  it("answers ambiguous product questions through product-risk instead of generic legal prose", () => {
    const answer = generateAnswer(buildContext("Could product ambiguity create trouble?", "RO", undefined, [], "en"));

    expect(answer).toContain("Romania");
    expect(answer.toLowerCase()).toContain("product ambiguity");
    expect(answer.toLowerCase()).toContain("risk");
    expect(answer.length).toBeGreaterThan(120);
  });

  it("answers tiny-amount risk questions with a grounded severe-risk answer", () => {
    const context = buildContext(
      "If someone has only a tiny amount in Kuala Lumpur, is that still a very serious situation?",
      "MY",
      undefined,
      [],
      "en"
    );
    const answer = generateAnswer(context);

    expect(answer).toContain("Malaysia");
    expect(answer.toLowerCase()).toContain("tiny amount");
    expect(answer.toLowerCase()).toContain("serious situation");
    expect(answer.length).toBeGreaterThan(120);
  });

  it("answers smell or residue questions with a grounded trace-risk answer", () => {
    const context = buildContext(
      "If police find a grinder with residue, what tends to matter most there?",
      "AT",
      undefined,
      [],
      "en"
    );
    const answer = generateAnswer(context);

    expect(answer).toContain("Austria");
    expect(answer.toLowerCase()).toContain("residue");
    expect(answer.toLowerCase()).toContain("police");
    expect(answer.length).toBeGreaterThan(120);
  });

  it("answers broad smell/residue follow-ups with the trace-risk path", () => {
    const answer = generateAnswer(buildContext("Can smell or residue still create trouble?", "MX", undefined, [], "en"));

    expect(answer).toContain("Mexico");
    expect(answer.toLowerCase()).toMatch(/smell|residue/);
    expect(answer.length).toBeGreaterThan(120);
  });

  it("uses different trace-risk wording for smell-only and grinder-residue prompts", () => {
    const smell = generateAnswer(
      buildContext("If I only smell like weed after a party, is that already dangerous?", "AT", undefined, [], "en")
    );
    const grinder = generateAnswer(
      buildContext("If police find a grinder with residue, what tends to matter most there?", "AT", undefined, [], "en")
    );

    expect(smell).not.toBe(grinder);
    expect(smell.toLowerCase()).toContain("smell");
    expect(grinder.toLowerCase()).toContain("grinder");
  });

  it("answers tourist/public and foreign prescription travel-risk questions with grounded travel wording", () => {
    const tourist = generateAnswer(
      buildContext("Would a tourist being careless in public create a real problem?", "NZ", undefined, [], "en")
    );
    const prescription = generateAnswer(
      buildContext("Does a foreign medical prescription change much on the ground?", "NZ", undefined, [], "en")
    );
    const airport = generateAnswer(
      buildContext("How risky is airport screening if something cannabis-related is forgotten in a bag?", "NZ", undefined, [], "en")
    );

    expect(tourist.toLowerCase()).toContain("tourist");
    expect(tourist.toLowerCase()).toContain("public");
    expect(prescription.toLowerCase()).toContain("prescription");
    expect(airport.toLowerCase()).toContain("airport");
    expect(airport.toLowerCase()).toContain("bag");
  });

  it("answers broad airport, public, and visitor follow-ups with grounded travel wording", () => {
    const airport = generateAnswer(buildContext("What happens around airports or borders?", "SE", undefined, [], "en"));
    const publicUse = generateAnswer(buildContext("What should I avoid doing in public?", "PL", undefined, [], "en"));
    const visitor = generateAnswer(buildContext("Give me the safest summary for a visitor.", "MX", undefined, [], "en"));

    expect(airport).toContain("Sweden");
    expect(airport.toLowerCase()).toMatch(/airport|border/);
    expect(publicUse).toContain("Poland");
    expect(publicUse.toLowerCase()).toContain("public");
    expect(visitor).toContain("Mexico");
    expect(visitor.toLowerCase()).toMatch(/visitor|tourist/);
  });

  it("answers basic law-here prompts through the legal truth path", () => {
    const answer = generateAnswer(buildContext("What is cannabis law here in simple terms?", "ZA", undefined, [], "en"));

    expect(answer).toContain("South Africa");
    expect(answer.toLowerCase()).toMatch(/legal|law|status|risk/);
    expect(answer.length).toBeGreaterThan(120);
  });

  it("routes plain-language and medical/practice prompts through deterministic truth", () => {
    expect(generateAnswer(buildContext("What is cannabis law here in plain language?", "AR", undefined, [], "en"))).toContain("Argentina");
    expect(generateAnswer(buildContext("What is the cannabis situation here in plain English?", "SE", undefined, [], "en"))).toContain("Sweden");
    expect(generateAnswer(buildContext("Give me the current cannabis picture here like a local warning.", "GH", undefined, [], "en"))).toContain("Ghana");
    expect(generateAnswer(buildContext("What is the practical cannabis risk here?", "LA", undefined, [], "en"))).toContain("Laos");
    expect(generateAnswer(buildContext("Is enforcement strict in real life?", "GR", undefined, [], "en"))).toContain("Greece");
    expect(generateAnswer(buildContext("How does medical cannabis change the picture?", "AR", undefined, [], "en"))).toContain("Argentina");
    expect(generateAnswer(buildContext("How does medical cannabis fit the picture?", "ZA", undefined, [], "en"))).toContain("South Africa");
    expect(generateAnswer(buildContext("Is medical or industrial cannabis treated differently?", "GH", undefined, [], "en"))).toContain("Ghana");
    expect(generateAnswer(buildContext("Give me the cannabis situation here like a traveler would understand it.", "CO", undefined, [], "en"))).toContain("Colombia");
    expect(generateAnswer(buildContext("Is personal use tolerated or just culturally visible?", "NP", undefined, [], "en"))).toContain("Nepal");
    expect(generateAnswer(buildContext("How does medical cannabis affect ordinary people?", "IE", undefined, [], "en"))).toContain("Ireland");
    expect(generateAnswer(buildContext("Is enforcement predictable in real life?", "MX", undefined, [], "en"))).toContain("Mexico");
    expect(generateAnswer(buildContext("How strict is enforcement for personal possession?", "RO", undefined, [], "en"))).toContain("Romania");
    expect(generateAnswer(buildContext("What about medical cannabis access?", "RO", undefined, [], "en"))).toContain("Romania");
    const market = generateAnswer(buildContext("Can tourists access the legal market?", "UY", undefined, [], "en"));
    expect(market).toContain("Uruguay");
    expect(market.toLowerCase()).toMatch(/tourist|visitor|access|buy|market/);
  });

  it("answers visitor buy/access prompts through market-access wording", () => {
    const answer = generateAnswer(buildContext("Can a visitor buy anything legally?", "MX", undefined, [], "en"));

    expect(answer).toContain("Mexico");
    expect(answer.toLowerCase()).toMatch(/visitor|buy|access|market/);
    expect(answer.length).toBeGreaterThan(120);
  });

  it("anchors broader luggage and border travel prompts to the current country", () => {
    const luggage = generateAnswer(buildContext("What happens if something is forgotten in luggage?", "EG", undefined, [], "en"));
    const border = generateAnswer(buildContext("What about taking something across a border?", "NP", undefined, [], "en"));
    const exit = generateAnswer(buildContext("What about taking cannabis out of the country?", "UY", undefined, [], "en"));
    const leave = generateAnswer(buildContext("Can cannabis leave the country legally?", "ZA", undefined, [], "en"));
    const paperwork = generateAnswer(buildContext("If it is only medical paperwork from abroad, does it help?", "SE", undefined, [], "en"));

    expect(luggage).toContain("Egypt");
    expect(luggage.toLowerCase()).toMatch(/airport|customs|luggage|bag|border|security/);
    expect(border).toContain("Nepal");
    expect(border.toLowerCase()).toMatch(/border|customs|tourist|risk/);
    expect(exit).toContain("Uruguay");
    expect(exit.toLowerCase()).toMatch(/border|customs|country|risk/);
    expect(leave).toContain("South Africa");
    expect(leave.toLowerCase()).toMatch(/border|customs|country|risk/);
    expect(paperwork).toContain("Sweden");
    expect(paperwork.toLowerCase()).toMatch(/paperwork|medical|border|rules|risk/);
  });

  it("keeps 420 legal follow-ups anchored to the current country", () => {
    const answer = generateAnswer(buildContext("Would 420 culture change anything legally here?", "AR", undefined, [], "en"));

    expect(answer).toContain("Argentina");
    expect(answer.toLowerCase()).toContain("420");
    expect(answer.toLowerCase()).toMatch(/legal|law/);
  });

  it("keeps reggae legal-meaning prompts anchored to the current country", () => {
    const answer = generateAnswer(buildContext("Does reggae culture have any legal meaning here?", "SG", undefined, [], "en"));
    const rastafari = generateAnswer(buildContext("Is Rastafari context legally important or just cultural?", "JM", undefined, [], "en"));

    expect(answer).toContain("Singapore");
    expect(answer.toLowerCase()).toContain("reggae");
    expect(answer.toLowerCase()).toMatch(/legal|law|permission/);
    expect(rastafari).toContain("Jamaica");
    expect(rastafari.toLowerCase()).toMatch(/rastafari|legal|cultural|permission/);
  });

  it("keeps short culture continuations on cannabis, reggae, and law boundaries", () => {
    const first = buildContext("Tell me about weed movies and Rastafari symbols here.", "NO", undefined, [], "en");
    rememberDialog(first, "Norway: cannabis culture is separate from legal permission.");
    const films = generateAnswer(buildContext("films?", "NO", undefined, [], "en"));
    const actors = generateAnswer(buildContext("actors?", "NO", undefined, [], "en"));
    const why = generateAnswer(buildContext("why?", "NO", undefined, [], "en"));

    expect(films).toContain("Norway");
    expect(films.toLowerCase()).toMatch(/film|reggae|cannabis/);
    expect(actors.toLowerCase()).toMatch(/marley|peter tosh|snoop/);
    expect(why.toLowerCase()).toMatch(/cannabis culture|reggae|rastafari|420/);
    expect(why.toLowerCase()).toMatch(/law|legal|permission/);
  });

  it("answers Make Love Not War and music follow-ups as culture, not legal drift", () => {
    const origin = generateAnswer(buildContext("Where does the expression Make Love Not War come from?", "JM", undefined, [], "en"));
    const fit = generateAnswer(buildContext("Where does Make Love Not War fit with cannabis culture?", "AR", undefined, [], "en"));
    const music = generateAnswer(buildContext("music?", "JM", undefined, [], "en"));
    const performers = generateAnswer(buildContext("Which performers should I know if I want the reggae and cannabis-culture angle?", "JM", undefined, [], "en"));

    expect(origin.toLowerCase()).toMatch(/1960s|anti-war|counterculture|vietnam|peace/);
    expect(fit).toContain("Argentina");
    expect(fit.toLowerCase()).toMatch(/anti-war|counterculture|cannabis/);
    expect(music).toContain("Jamaica");
    expect(music.toLowerCase()).toMatch(/reggae|dub|roots|marley/);
    expect(performers.toLowerCase()).toMatch(/bob marley|peter tosh|lee scratch perry|snoop/);
  });

  it("does not carry the previous product subtopic into a fresh compare question", () => {
    const firstContext = buildContext("Would CBD oil be treated clearly different from THC products?", "CL", undefined, [], "en");
    rememberDialog(firstContext, "Chile: CBD-like products are not automatically safe.");
    const compare = buildContext("Compare the practical risk with Portugal, but keep it simple.", "CL", undefined, [], "en");
    const messages = buildMessages({ query: "Compare the practical risk with Portugal, but keep it simple.", context: compare });

    expect(messages.some((message) => message.content.includes("CBD-like products"))).toBe(false);
    expect(messages.at(-1)?.content).toContain("Compare ONLY:");
    expect(messages.at(-1)?.content).toContain("Chile");
    expect(messages.at(-1)?.content).toContain("Portugal");
  });

  it("expands too-short answers instead of returning empty or tiny output", () => {
    const context = buildContext("Germany cannabis?", "DE", undefined, [], "en");
    const short = "Sure.";
    const answer = generateAnswer({ ...context, query: short });
    expect(answer.length).toBeGreaterThanOrEqual(30);
  });

  it("builds nearby truth context for near-me queries", () => {
    const context = buildContext("where can I smoke near me", "DE", { lat: 52.52, lng: 13.405 }, [], "en");
    const answer = generateAnswer(context);
    expect(context.intent).toBe("nearby");
    expect(context.nearby?.results.length || 0).toBeGreaterThan(0);
    expect(context.nearby?.warning).toContain("Crossing borders");
    expect(answer).toContain("Closest places where cannabis is possible:");
    expect(answer).toMatch(/~\d+ km/);
    expect(answer).toContain("Risk:");
    expect(answer).toContain("⚠️ Crossing borders with cannabis is illegal in most countries.");
  });

  it("routes 'куда поехать рядом' into nearby intent", () => {
    const context = buildContext("куда поехать рядом", "DE", { lat: 52.52, lng: 13.405 }, [], "ru");
    expect(context.intent).toBe("nearby");
    expect(context.nearby?.results.length || 0).toBeGreaterThan(0);
    expect(context.nearby?.warning).toBe("Crossing borders with cannabis is illegal in most countries.");
  });

  it("keeps nearby intent on tolerated and safer follow-ups", () => {
    const firstNearby = buildContext(
      "where can I smoke near me",
      "DE",
      { lat: 52.52, lng: 13.405 },
      [],
      "en"
    );
    rememberDialog(firstNearby, generateAnswer(firstNearby));
    const tolerated = buildContext(
      "how do I get to nearest place where weed is tolerated",
      "DE",
      { lat: 52.52, lng: 13.405 },
      [],
      "en"
    );
    const safer = buildContext(
      "which option is safer?",
      "DE",
      { lat: 52.52, lng: 13.405 },
      [],
      "en"
    );
    expect(tolerated.intent).toBe("nearby");
    expect(safer.intent).not.toBe("nearby");
    expect(generateAnswer(tolerated)).toContain("Crossing borders with cannabis is illegal in most countries.");
    expect(generateAnswer(safer)).not.toContain("Crossing borders with cannabis is illegal in most countries.");
  });

  it("normalizes RU slang into nearby without changing engine contract", () => {
    const context = buildContext("че как бро где можно покурить", "DE", { lat: 52.52, lng: 13.405 }, [], "ru");
    const answer = generateAnswer(context);

    expect(context.intent).toBe("nearby");
    expect(context.tone).toBe("street");
    expect(context.slangType).toBe("intent");
    expect(answer).toContain("Смотри, по факту:");
    expect(answer).toMatch(/~\d+ км/);
    expect(answer).toContain("Risk:");
    expect(answer).toContain("Crossing borders with cannabis is illegal in most countries.");
  });

  it("normalizes EN slang into nearby without LLM fallback semantics", () => {
    const context = buildContext("yo bro where weed at", "DE", { lat: 52.52, lng: 13.405 }, [], "en");
    const answer = generateAnswer(context);

    expect(context.intent).toBe("nearby");
    expect(context.tone).toBe("street");
    expect(context.slangType).toBe("intent");
    expect(answer).toContain("Got you.");
    expect(answer).toMatch(/~\d+ km/);
    expect(answer).toContain("Risk:");
    expect(answer).toContain("Crossing borders with cannabis is illegal in most countries.");
  });

  it("answers pure slang greetings without breaking the dialogue", () => {
    const context = buildContext("че как", "DE", undefined, [], "ru");
    const answer = generateAnswer(context);

    expect(context.intent).toBe("general");
    expect(context.tone).toBe("street");
    expect(context.slangType).toBe("greeting");
    expect(answer).toBe("Все норм 🙂");
    expect(answer).not.toContain("где рядом можно");
    expect(answer).not.toContain("Closest places");
    expect(answer.toLowerCase()).not.toContain("request failed");
  });

  it("classifies unknown short greetings automatically without dictionary entries", () => {
    const context = buildContext("Wazzzzzzup", "DE", undefined, [], "en");
    const answer = generateAnswer(context);

    expect(context.intent).toBe("general");
    expect(context.slangType).toBe("greeting");
    expect(answer).toBe("Все норм 🙂");
    expect(answer).not.toContain("где рядом можно");
  });

  it("hard-guards Russian greetings before any LLM path", async () => {
    const response = await answerWithAssistant("Еу, как сам?", "DE", undefined, [], "ru");

    expect(response.model).toBe("companion-engine");
    expect(response.llm_connected).toBe(false);
    expect(response.answer).toBe("Все норм 🙂");
    expect(response.answer).not.toMatch(/wikipedia|страна|cannabis|legal/i);
  });

  it("does not force nearby for greetings, law questions, or explain prompts", () => {
    const greeting = buildContext("че как", "HR", { lat: 45.815, lng: 15.9819 }, [], "ru");
    const law = buildContext("что с каннабисом в Хорватии?", "HR", { lat: 45.815, lng: 15.9819 }, [], "ru");
    const explain = buildContext("объясни, что такое джоинт", "HR", { lat: 45.815, lng: 15.9819 }, [], "ru");

    expect(greeting.intent).not.toBe("nearby");
    expect(law.intent).not.toBe("nearby");
    expect(explain.intent).not.toBe("nearby");
    expect(generateAnswer(greeting)).toBe("Все норм 🙂");
    expect(generateAnswer(law)).not.toContain("Closest places");
    expect(generateAnswer(explain)).not.toContain("Closest places");
  });

  it("explains joint slang deterministically without waiting for LLM", () => {
    const answer = generateAnswer(buildContext("объясни, что такое джоинт простыми словами", "PE", undefined, [], "ru"));

    expect(answer).toContain("джоинт/косяк");
    expect(answer.toLowerCase()).toContain("culture word");
    expect(answer.length).toBeGreaterThan(100);
  });

  it("routes tiny edible mistakes through deterministic small-amount risk", () => {
    const answer = generateAnswer(buildContext("Can I carry one tiny edible by mistake?", "PE", undefined, [], "en"));

    expect(answer).toContain("Peru");
    expect(answer.toLowerCase()).toMatch(/tiny amount|serious situation|small amount/);
    expect(answer.toLowerCase()).not.toContain("request failed");
  });

  it("keeps short follow-ups deterministic instead of leaking to LLM", async () => {
    const first = buildContext("Can I fly with weed from here?", "IE", undefined, [], "en");
    rememberDialog(first, generateAnswer(first));
    const response = await answerWithAssistant("why not?", "IE", undefined, [], "en");

    expect(response.model).toBe("companion-engine");
    expect(response.llm_connected).toBe(false);
    expect(response.answer.length).toBeGreaterThan(60);
  });

  it("routes real-life traveler risk through deterministic travel-risk", async () => {
    const response = await answerWithAssistant("What would be the real-life risk for a traveler here?", "PE", undefined, [], "en");

    expect(response.model).toBe("travel-risk-engine");
    expect(response.llm_connected).toBe(false);
    expect(response.answer).toContain("Peru");
  });

  it("does not misclassify nearest or closest nearby prompts as greetings", () => {
    const nearest = buildContext("nearest tolerated place?", "HR", undefined, [], "en");
    const closest = buildContext("closest safer option?", "IE", undefined, [], "en");

    expect(nearest.intent).toBe("nearby");
    expect(nearest.slangType).toBe("intent");
    expect(generateAnswer(nearest)).toContain("Closest places where cannabis is possible");
    expect(closest.intent).toBe("nearby");
    expect(closest.slangType).toBe("intent");
    expect(generateAnswer(closest)).toContain("Closest places where cannabis is possible");
  });

  it("keeps Iran visible in nearby output instead of collapsing to everything illegal", () => {
    const context = buildContext("where can I smoke near me", "IR", undefined, [], "en");
    const answer = generateAnswer(context);

    expect(context.intent).toBe("nearby");
    expect(answer).toContain("Iran");
    expect(answer).toMatch(/Limited|Tolerated|Risk:/);
    expect(answer.toLowerCase()).not.toContain("everything illegal");
  });

  it("does not reuse nearby for a non-near follow-up", () => {
    const first = buildContext("where can I smoke near me", "DE", { lat: 52.52, lng: 13.405 }, [], "en");
    const firstAnswer = generateAnswer(first);
    rememberDialog(first, firstAnswer);

    const repeated = buildContext("which option is safer?", "DE", { lat: 52.52, lng: 13.405 }, [], "en");
    const repeatedAnswer = generateAnswer(repeated);

    expect(repeated.intent).not.toBe("nearby");
    expect(repeatedAnswer).not.toContain("Closest places where cannabis is possible");
    expect(repeatedAnswer).not.toContain("Crossing borders with cannabis is illegal in most countries.");
    expect(repeatedAnswer).not.toContain("Calm version:");
  });

  it("does not force nearby for short follow-ups after a nearby answer", () => {
    const first = buildContext("where can I smoke near me", "DE", { lat: 52.52, lng: 13.405 }, [], "en");
    const firstAnswer = generateAnswer(first);
    rememberDialog(first, firstAnswer);

    const followUp = buildContext("and?", "DE", { lat: 52.52, lng: 13.405 }, [], "en");
    const followUpAnswer = generateAnswer(followUp);

    expect(followUp.intent).not.toBe("nearby");
    expect(followUpAnswer).not.toContain("Closest places where cannabis is possible");
    expect(followUpAnswer).not.toContain("Crossing borders with cannabis is illegal in most countries.");
  });

  it("does not classify generic compare follow-ups as nearby intent", () => {
    const first = buildContext("Brazil cannabis?", "BR", undefined, [], "en");
    rememberDialog(first, generateAnswer(first));
    const compare = buildContext("Compare with Netherlands", "BR", undefined, [], "en");
    rememberDialog(compare, generateAnswer(compare));
    const safer = buildContext("Where safer?", "BR", undefined, [], "en");

    expect(compare.intent).not.toBe("nearby");
    expect(safer.intent).not.toBe("nearby");
    expect(safer.compare?.name).toMatch(/Netherlands/);
  });

  it("answers why follow-ups after compare without repeating the exact comparison", () => {
    const first = buildContext("Compare this with Denmark.", "SE", undefined, [], "en");
    const firstAnswer = generateAnswer(first);
    rememberDialog(first, firstAnswer);
    const why = generateAnswer(buildContext("why?", "SE", undefined, [], "en"));

    expect(why).toContain("Sweden");
    expect(why).toContain("Denmark");
    expect(why).not.toBe(firstAnswer);
    expect(why.toLowerCase()).toMatch(/reason|differs|risk/);
  });
});
