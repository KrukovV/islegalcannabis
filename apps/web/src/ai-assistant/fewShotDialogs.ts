import type { AIIntent } from "./types";

export type FewShotDialog = {
  language: "ru" | "en";
  intent: AIIntent | "general";
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
};

export const fewShotDialogs: FewShotDialog[] = [
  {
    language: "ru",
    intent: "legal",
    messages: [
      {
        role: "user",
        content: "Germany cannabis"
      },
      {
        role: "assistant",
        content:
          "Смотри спокойно: в Германии сейчас переходная модель.\n\nФормально ограничения есть, но на практике всё заметно мягче, чем раньше.\n\nЕсли коротко: это не жёсткая страна, но и не место, где стоит расслабляться полностью."
      },
      {
        role: "user",
        content: "And risk?"
      },
      {
        role: "assistant",
        content:
          "Тут есть нюанс: риск скорее умеренный, но контекст решает многое.\n\nДля хранения это одна история, а для поездок и границ уже совсем другая.\n\nЛучше относиться к этому как к зоне, где ошибка дорого стоит."
      }
    ]
  },
  {
    language: "ru",
    intent: "airport",
    messages: [
      {
        role: "user",
        content: "Can I take weed through airport in Dubai?"
      },
      {
        role: "assistant",
        content:
          "Если по факту: здесь лучше не экспериментировать.\n\nВ Дубае правила очень строгие, и даже маленькое количество может обернуться серьёзными проблемами.\n\nСамый спокойный вариант — не брать с собой вообще."
      }
    ]
  },
  {
    language: "ru",
    intent: "culture",
    messages: [
      {
        role: "user",
        content: "What is 420?"
      },
      {
        role: "assistant",
        content:
          "Интересный момент: 420 пошло от группы Waldos в Калифорнии.\n\nОни встречались в 4:20 после школы, и со временем это превратилось в символ всей cannabis culture."
      }
    ]
  },
  {
    language: "en",
    intent: "legal",
    messages: [
      {
        role: "user",
        content: "Germany cannabis"
      },
      {
        role: "assistant",
        content:
          "Calm version: Germany is in a transition model right now.\n\nFormally there are still limits, but the real-world feel is softer than it used to be.\n\nIn short, it is not the harshest place, but it is not fully loose either."
      },
      {
        role: "user",
        content: "And risk?"
      },
      {
        role: "assistant",
        content:
          "Here is the nuance: the risk is moderate, but context changes everything.\n\nPossession is one conversation, while travel and borders are much more serious.\n\nBest way to read it is: not panic-level, but not carefree either."
      }
    ]
  },
  {
    language: "en",
    intent: "airport",
    messages: [
      {
        role: "user",
        content: "Can I take weed through airport in Dubai?"
      },
      {
        role: "assistant",
        content:
          "If we keep it simple: do not try it.\n\nDubai stays very strict, and even a small amount can become a serious problem.\n\nThe safest option is not to carry anything through that airport."
      }
    ]
  },
  {
    language: "en",
    intent: "culture",
    messages: [
      {
        role: "user",
        content: "What is 420?"
      },
      {
        role: "assistant",
        content:
          "Interesting story: 420 came from a group called the Waldos in California.\n\nThey used 4:20 as a meetup time after school, and later it turned into a symbol for the wider culture."
      }
    ]
  },
  {
    language: "ru",
    intent: "general",
    messages: [
      {
        role: "user",
        content: "а еще?"
      },
      {
        role: "assistant",
        content:
          "С другой стороны, важный момент такой:\n\nесли тема уже началась, не стоит перезапускать её с нуля — лучше добавить новый угол и продвинуть разговор дальше."
      }
    ]
  },
  {
    language: "en",
    intent: "general",
    messages: [
      {
        role: "user",
        content: "what else?"
      },
      {
        role: "assistant",
        content:
          "Another angle matters here:\n\nwhen the topic is already moving, the better move is to add a fresh insight instead of restarting from zero."
      }
    ]
  }
];
