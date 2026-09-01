// Phase 2/3 seed dataset: a small, representative English vocabulary set
// used to verify the schema (difficulty spread, multiple parts of speech,
// words with multiple senses, and a couple of synonym/antonym relations),
// and to drive the Phase 3 initial vocabulary assessment with enough
// per-tier variety for a meaningful adaptive test and plausible
// multiple-choice distractors.
//
// License note: every definition and example sentence here was written
// originally for this project - none are copied from a proprietary
// dictionary. Frequency ranks are illustrative placeholders, not sourced
// from a specific corpus. Future phases can enrich real dictionary data
// from an open source (e.g. dictionaryapi.dev, built on Wiktionary/CC
// BY-SA data) as an optional, non-runtime-dependency enrichment step -
// the core app must never require a live external API just to read
// already-seeded words.
//
// Translation is left blank throughout: this seed set is for an English
// speaker growing their own English vocabulary, not translating from
// another language, so there is no target language to translate into yet.
// The `translation` column on word_senses exists for when a learner's
// native language differs from the language being studied (a future
// non-English language, or a future "translate to my language" setting).

export type PartOfSpeech =
  | "noun"
  | "verb"
  | "adjective"
  | "adverb"
  | "pronoun"
  | "preposition"
  | "conjunction"
  | "interjection"
  | "determiner"
  | "other";

export type DifficultyLevel = "beginner" | "intermediate" | "advanced";

export interface SeedSense {
  definition: string;
  partOfSpeech: PartOfSpeech;
  exampleSentence?: string;
  pronunciation?: string;
  phonetic?: string;
}

export interface SeedWord {
  word: string;
  difficultyLevel: DifficultyLevel;
  frequencyRank?: number;
  senses: SeedSense[];
}

export const ENGLISH_SEED_WORDS: SeedWord[] = [
  // --- beginner ---
  {
    word: "happy",
    difficultyLevel: "beginner",
    frequencyRank: 500,
    senses: [
      {
        definition: "Feeling or showing pleasure and contentment.",
        partOfSpeech: "adjective",
        exampleSentence: "She felt happy when she saw her old friend again.",
        pronunciation: "HAP-ee",
        phonetic: "/ˈhæpi/",
      },
    ],
  },
  {
    word: "run",
    difficultyLevel: "beginner",
    frequencyRank: 200,
    senses: [
      {
        definition: "To move at a speed faster than a walk, using the legs to cover ground quickly.",
        partOfSpeech: "verb",
        exampleSentence: "He runs three miles every morning before work.",
        phonetic: "/rʌn/",
      },
    ],
  },
  {
    word: "book",
    difficultyLevel: "beginner",
    frequencyRank: 300,
    senses: [
      {
        definition: "A set of printed or written pages bound together, usually meant to be read.",
        partOfSpeech: "noun",
        exampleSentence: "She borrowed a book about ancient history from the library.",
      },
    ],
  },
  {
    word: "fast",
    difficultyLevel: "beginner",
    frequencyRank: 350,
    senses: [
      {
        definition: "Moving or capable of moving at high speed.",
        partOfSpeech: "adjective",
        exampleSentence: "The new train is much faster than the old one.",
      },
    ],
  },
  {
    word: "eat",
    difficultyLevel: "beginner",
    frequencyRank: 250,
    senses: [
      {
        definition: "To put food into the mouth and swallow it for nourishment.",
        partOfSpeech: "verb",
        exampleSentence: "The children ate breakfast before school.",
      },
    ],
  },
  {
    word: "bank",
    difficultyLevel: "beginner",
    frequencyRank: 150,
    senses: [
      {
        definition: "A financial institution that accepts deposits and provides loans and other services.",
        partOfSpeech: "noun",
        exampleSentence: "She opened a savings account at the bank downtown.",
        pronunciation: "BANGK",
        phonetic: "/bæŋk/",
      },
      {
        definition: "The land alongside or sloping down to a river or lake.",
        partOfSpeech: "noun",
        exampleSentence: "They set up their tent on the bank of the river.",
      },
    ],
  },
  {
    word: "joyful",
    difficultyLevel: "beginner",
    frequencyRank: 3000,
    senses: [
      {
        definition: "Full of joy and happiness.",
        partOfSpeech: "adjective",
        exampleSentence: "The joyful crowd cheered as the team won the championship.",
      },
    ],
  },
  {
    word: "glad",
    difficultyLevel: "beginner",
    frequencyRank: 1000,
    senses: [
      {
        definition: "Pleased or happy about something.",
        partOfSpeech: "adjective",
        exampleSentence: "I'm glad you could make it to the party.",
      },
    ],
  },
  {
    word: "sad",
    difficultyLevel: "beginner",
    frequencyRank: 400,
    senses: [
      {
        definition: "Feeling or showing sorrow; unhappy.",
        partOfSpeech: "adjective",
        exampleSentence: "He felt sad when his favorite show ended.",
      },
    ],
  },

  // --- intermediate ---
  {
    word: "decision",
    difficultyLevel: "intermediate",
    frequencyRank: 600,
    senses: [
      {
        definition: "A choice or judgment made after considering the available options.",
        partOfSpeech: "noun",
        exampleSentence: "Choosing a university was a difficult decision for him.",
      },
    ],
  },
  {
    word: "achieve",
    difficultyLevel: "intermediate",
    frequencyRank: 1200,
    senses: [
      {
        definition: "To successfully complete a goal or reach a desired result through effort.",
        partOfSpeech: "verb",
        exampleSentence: "With steady practice, she finally achieved her goal of running a marathon.",
        pronunciation: "uh-CHEEV",
        phonetic: "/əˈtʃiːv/",
      },
    ],
  },
  {
    word: "confident",
    difficultyLevel: "intermediate",
    frequencyRank: 2000,
    senses: [
      {
        definition: "Feeling sure of one's own abilities or judgment.",
        partOfSpeech: "adjective",
        exampleSentence: "He walked into the interview feeling confident and well-prepared.",
      },
    ],
  },
  {
    word: "opportunity",
    difficultyLevel: "intermediate",
    frequencyRank: 1500,
    senses: [
      {
        definition: "A set of circumstances that makes it possible to do something.",
        partOfSpeech: "noun",
        exampleSentence: "Moving to the city gave her a real opportunity to grow her career.",
      },
    ],
  },
  {
    word: "improve",
    difficultyLevel: "intermediate",
    frequencyRank: 700,
    senses: [
      {
        definition: "To make or become better than before.",
        partOfSpeech: "verb",
        exampleSentence: "Regular practice will improve your pronunciation over time.",
      },
    ],
  },
  {
    word: "challenge",
    difficultyLevel: "intermediate",
    frequencyRank: 900,
    senses: [
      {
        definition: "A task or situation that tests someone's abilities.",
        partOfSpeech: "noun",
        exampleSentence: "Learning a new language is a challenge worth taking on.",
      },
      {
        definition: "To invite someone to compete, or to question the truth of something.",
        partOfSpeech: "verb",
        exampleSentence: "She challenged her classmate to a friendly chess match.",
      },
    ],
  },
  {
    word: "argument",
    difficultyLevel: "intermediate",
    frequencyRank: 1800,
    senses: [
      {
        definition: "An angry disagreement between people.",
        partOfSpeech: "noun",
        exampleSentence: "The neighbors had a loud argument about the fence.",
      },
      {
        definition: "A reason or set of reasons given to support an idea.",
        partOfSpeech: "noun",
        exampleSentence: "His argument for a four-day work week convinced the board.",
      },
    ],
  },
  {
    word: "accomplish",
    difficultyLevel: "intermediate",
    frequencyRank: 2500,
    senses: [
      {
        definition: "To succeed in doing or completing something.",
        partOfSpeech: "verb",
        exampleSentence: "They worked together to accomplish the project on time.",
      },
    ],
  },
  {
    word: "attain",
    difficultyLevel: "intermediate",
    frequencyRank: 4000,
    senses: [
      {
        definition: "To succeed in reaching a goal, usually through sustained effort.",
        partOfSpeech: "verb",
        exampleSentence: "It took years of study to attain fluency in Japanese.",
      },
    ],
  },

  // --- advanced ---
  {
    word: "ambiguous",
    difficultyLevel: "advanced",
    frequencyRank: 7000,
    senses: [
      {
        definition: "Open to more than one interpretation; not having one clear meaning.",
        partOfSpeech: "adjective",
        exampleSentence: "The instructions were so ambiguous that no one knew where to start.",
      },
    ],
  },
  {
    word: "meticulous",
    difficultyLevel: "advanced",
    frequencyRank: 8000,
    senses: [
      {
        definition: "Showing great attention to detail; very careful and precise.",
        partOfSpeech: "adjective",
        exampleSentence: "The watchmaker's meticulous work was obvious in every tiny gear.",
      },
    ],
  },
  {
    word: "ephemeral",
    difficultyLevel: "advanced",
    frequencyRank: 9500,
    senses: [
      {
        definition: "Lasting for a very short time.",
        partOfSpeech: "adjective",
        exampleSentence: "The beauty of the cherry blossoms is ephemeral, fading within days.",
      },
    ],
  },
  {
    word: "ubiquitous",
    difficultyLevel: "advanced",
    frequencyRank: 9000,
    senses: [
      {
        definition: "Present or found everywhere.",
        partOfSpeech: "adjective",
        exampleSentence: "Smartphones have become ubiquitous in modern daily life.",
      },
    ],
  },
  {
    word: "pragmatic",
    difficultyLevel: "advanced",
    frequencyRank: 7500,
    senses: [
      {
        definition: "Dealing with things sensibly and practically rather than idealistically.",
        partOfSpeech: "adjective",
        exampleSentence: "The manager took a pragmatic approach to solving the budget problem.",
      },
    ],
  },
  {
    word: "resilience",
    difficultyLevel: "advanced",
    frequencyRank: 6000,
    senses: [
      {
        definition: "The capacity to recover quickly from difficulties.",
        partOfSpeech: "noun",
        exampleSentence: "Her resilience helped her bounce back after losing her job.",
      },
    ],
  },
  {
    word: "eloquent",
    difficultyLevel: "advanced",
    frequencyRank: 8500,
    senses: [
      {
        definition: "Fluent and persuasive in speaking or writing.",
        partOfSpeech: "adjective",
        exampleSentence: "The speaker gave an eloquent speech that moved the entire audience.",
      },
    ],
  },

  // --- added for Phase 3: more per-tier variety for the assessment ---
  {
    word: "kind",
    difficultyLevel: "beginner",
    frequencyRank: 450,
    senses: [
      {
        definition: "Considerate and generous towards others.",
        partOfSpeech: "adjective",
        exampleSentence: "She was always kind to strangers in need.",
      },
    ],
  },
  {
    word: "quick",
    difficultyLevel: "beginner",
    frequencyRank: 380,
    senses: [
      {
        definition: "Moving fast, or done in a short amount of time.",
        partOfSpeech: "adjective",
        exampleSentence: "He gave a quick answer to the question.",
      },
    ],
  },
  {
    word: "strong",
    difficultyLevel: "beginner",
    frequencyRank: 320,
    senses: [
      {
        definition: "Having great physical power or force.",
        partOfSpeech: "adjective",
        exampleSentence: "The strong wind knocked over the fence.",
      },
    ],
  },
  {
    word: "quiet",
    difficultyLevel: "beginner",
    frequencyRank: 550,
    senses: [
      {
        definition: "Making little or no noise.",
        partOfSpeech: "adjective",
        exampleSentence: "The library was quiet during exam week.",
      },
    ],
  },
  {
    word: "simple",
    difficultyLevel: "beginner",
    frequencyRank: 420,
    senses: [
      {
        definition: "Easy to understand or do; not complicated.",
        partOfSpeech: "adjective",
        exampleSentence: "The instructions were simple enough for a child to follow.",
      },
    ],
  },
  {
    word: "friend",
    difficultyLevel: "beginner",
    frequencyRank: 220,
    senses: [
      {
        definition: "A person one knows well and regards with affection.",
        partOfSpeech: "noun",
        exampleSentence: "She met her best friend in elementary school.",
      },
    ],
  },
  {
    word: "generous",
    difficultyLevel: "intermediate",
    frequencyRank: 2200,
    senses: [
      {
        definition: "Willing to give more of something than is strictly necessary.",
        partOfSpeech: "adjective",
        exampleSentence: "He was generous with his time, helping anyone who asked.",
      },
    ],
  },
  {
    word: "reliable",
    difficultyLevel: "intermediate",
    frequencyRank: 1900,
    senses: [
      {
        definition: "Consistently good in quality and able to be trusted.",
        partOfSpeech: "adjective",
        exampleSentence: "The old car was surprisingly reliable despite its age.",
      },
    ],
  },
  {
    word: "efficient",
    difficultyLevel: "intermediate",
    frequencyRank: 2100,
    senses: [
      {
        definition: "Achieving maximum productivity with minimum wasted effort.",
        partOfSpeech: "adjective",
        exampleSentence: "The new process is far more efficient than the old one.",
      },
    ],
  },
  {
    word: "flexible",
    difficultyLevel: "intermediate",
    frequencyRank: 2400,
    senses: [
      {
        definition: "Able to change or adapt easily to different conditions.",
        partOfSpeech: "adjective",
        exampleSentence: "Her flexible schedule let her work from anywhere.",
      },
    ],
  },
  {
    word: "ambition",
    difficultyLevel: "intermediate",
    frequencyRank: 2800,
    senses: [
      {
        definition: "A strong desire to achieve something.",
        partOfSpeech: "noun",
        exampleSentence: "His ambition to become a doctor drove him through years of study.",
      },
    ],
  },
  {
    word: "persuade",
    difficultyLevel: "intermediate",
    frequencyRank: 3200,
    senses: [
      {
        definition: "To cause someone to believe or do something through reasoning.",
        partOfSpeech: "verb",
        exampleSentence: "She persuaded her manager to approve the new budget.",
      },
    ],
  },
  {
    word: "collaborate",
    difficultyLevel: "intermediate",
    frequencyRank: 3500,
    senses: [
      {
        definition: "To work jointly with others on a shared task.",
        partOfSpeech: "verb",
        exampleSentence: "The two teams collaborated to finish the project early.",
      },
    ],
  },
  {
    word: "tenacious",
    difficultyLevel: "advanced",
    frequencyRank: 8800,
    senses: [
      {
        definition: "Holding firmly to a purpose or course of action; persistent.",
        partOfSpeech: "adjective",
        exampleSentence: "Her tenacious pursuit of the truth eventually solved the case.",
      },
    ],
  },
  {
    word: "candid",
    difficultyLevel: "advanced",
    frequencyRank: 7800,
    senses: [
      {
        definition: "Truthful and straightforward; frank.",
        partOfSpeech: "adjective",
        exampleSentence: "He gave a candid assessment of the company's problems.",
      },
    ],
  },
  {
    word: "inevitable",
    difficultyLevel: "advanced",
    frequencyRank: 7200,
    senses: [
      {
        definition: "Certain to happen; unavoidable.",
        partOfSpeech: "adjective",
        exampleSentence: "Given the circumstances, the delay was inevitable.",
      },
    ],
  },
  {
    word: "discern",
    difficultyLevel: "advanced",
    frequencyRank: 9200,
    senses: [
      {
        definition: "To perceive or recognize something clearly, especially something subtle.",
        partOfSpeech: "verb",
        exampleSentence: "It took her years to discern the difference between the two styles.",
      },
    ],
  },
  {
    word: "lucid",
    difficultyLevel: "advanced",
    frequencyRank: 8900,
    senses: [
      {
        definition: "Expressed clearly and easy to understand.",
        partOfSpeech: "adjective",
        exampleSentence: "His lucid explanation cleared up all our confusion.",
      },
    ],
  },
  {
    word: "prudent",
    difficultyLevel: "advanced",
    frequencyRank: 7600,
    senses: [
      {
        definition: "Acting with care and thought for the future; sensible.",
        partOfSpeech: "adjective",
        exampleSentence: "It was prudent of them to save part of their income each month.",
      },
    ],
  },
  {
    word: "versatile",
    difficultyLevel: "advanced",
    frequencyRank: 7900,
    senses: [
      {
        definition: "Able to adapt to many different functions or activities.",
        partOfSpeech: "adjective",
        exampleSentence: "A versatile employee can step into almost any role.",
      },
    ],
  },
];

export interface SeedRelation {
  word: string;
  relatedWord: string;
  type: "synonym" | "antonym" | "related";
}

export const ENGLISH_SEED_RELATIONS: SeedRelation[] = [
  { word: "happy", relatedWord: "joyful", type: "synonym" },
  { word: "happy", relatedWord: "glad", type: "synonym" },
  { word: "happy", relatedWord: "sad", type: "antonym" },
  { word: "achieve", relatedWord: "accomplish", type: "synonym" },
  { word: "achieve", relatedWord: "attain", type: "synonym" },
];
