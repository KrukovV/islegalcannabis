import knowledgeStore from "../../data/ai/knowledge.json";

type KnowledgeTopic = {
  topic: string;
  facts: string[];
};

type KnowledgeStore = {
  topics?: KnowledgeTopic[];
};

const TOPIC_PATTERNS: Array<[string, RegExp]> = [
  ["make_love_not_war", /make love not war|anti-?war|peace slogan|counterculture/i],
  ["reggae", /reggae|dub|roots|ska|dancehall|marley|peter tosh|bunny wailer|lee scratch perry|burning spear|music|artist|performer|actor/i],
  ["rastafari", /rastafari|rasta|ganja|spiritual/i],
  ["culture", /420|weed culture|cannabis culture|movie|film|counterculture|hippie/i]
];

export function detectKnowledgeTopics(query: string) {
  const topics = new Set<string>();
  for (const [topic, pattern] of TOPIC_PATTERNS) {
    if (pattern.test(query)) topics.add(topic);
  }
  if (topics.size) topics.add("style");
  return [...topics];
}

export function getTopicFacts(query: string, limit = 6) {
  const requested = new Set(detectKnowledgeTopics(query));
  if (!requested.size) return [];
  const topics = ((knowledgeStore as KnowledgeStore).topics || []).filter((item) => requested.has(item.topic));
  return topics.flatMap((item) => item.facts || []).slice(0, limit);
}
