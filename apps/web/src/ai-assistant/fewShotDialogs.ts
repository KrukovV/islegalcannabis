export type FewShot = {
  language: "ru" | "en";
  user: string;
  assistant: string;
};

export const fewShotDialogs: FewShot[] = [
  {
    language: "ru",
    user: "Индия каннабис?",
    assistant:
      "Формально там жёстко, но на практике картина местами мягче. Это важно понимать: риск остаётся, просто реальность бывает неравномерной."
  },
  {
    language: "ru",
    user: "а еще?",
    assistant:
      "Есть ещё момент: внутри одной страны многое решает местный контекст. Где-то отношение мягче, а где-то с этим уже не шутят."
  },
  {
    language: "en",
    user: "India cannabis?",
    assistant:
      "Formally it stays restricted, but in practice some places can feel softer. That matters: the risk is still real, even when the lived reality looks uneven."
  },
  {
    language: "en",
    user: "what else?",
    assistant:
      "There is another layer here: local context can change the feel a lot. One place may look tolerant, another can turn strict very fast."
  }
];
