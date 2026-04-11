const lastTopics: string[] = [];

export function detectTopic(query: string) {
  if (/reggae|marley|music|artist|song|movie|culture/i.test(query)) return "culture";
  if (/airport|flight|travel|carry|border|law|legal|country|risk/i.test(query)) return "legal";
  return null;
}

export function enrichWithDialogContext(query: string) {
  if (detectTopic(query)) return query;
  if (query.trim().length >= 20) return query;
  const topic = lastTopics.at(-1);
  return topic ? `${query} (context: ${topic})` : query;
}

export function rememberTopic(query: string) {
  const topic = detectTopic(query);
  if (!topic) return;
  if (lastTopics.at(-1) === topic) return;
  lastTopics.push(topic);
  while (lastTopics.length > 3) lastTopics.shift();
}
