
import { Publication, DojoRules, Setter, ClueType } from './types';
import { LOCKED_HINTS } from './data/designTemplates';

export const CRYPTIC_GLOSSARY = {
    indicators: {
        anagram: ["broken", "mixed", "crazy", "new", "running", "confused", "off", "badly", "cooked", "wild", "strange", "distributed", "pants", "disorder", "working", "roughly", "dancing", "unusual", "development", "frenzied", "scrambled", "changed", "ordered", "upset", "mad", "in disorder", "odd", "out"],
        container: ["in", "around", "holds", "contains", "has", "carrying", "embraces", "about", "within", "inside", "accepting", "wrapping", "clasping", "boarding", "holding"],
        reversal: ["back", "over", "returning", "around", "up", "rising", "climbing", "reversed", "flipped", "backwards", "sent back", "recalled", "retracing"],
        hidden: ["in", "part of", "held by", "some", "found in", "concealed by", "within", "boarding", "selection of", "clue to"],
        deletion: ["without", "losing", "missing", "headless", "endless", "heartless", "gutted", "unfinished", "not having started", "shortened", "clipped", "dropped", "stripped", "snubbed", "short"],
        homophone: ["we hear", "reportedly", "by the sound of it", "spoken", "broadcast", "vocal", "aloud", "said", "vocalised", "heard", "they say", "on the radio", "so they say"],
        cryptic_definition: ["perhaps", "maybe", "in a way"]
    },
    abbreviations: {
        "credit": ["CR"],
        "debit": ["DR"],
        "old": ["O", "EX"],
        "new": ["N"],
        "right": ["R"],
        "left": ["L"],
        "number": ["NO", "N", "ONE", "TEN"],
        "street": ["ST"],
        "road": ["RD"],
        "saint": ["ST"],
        "piano": ["P"],
        "forte": ["F"],
        "soft": ["P"],
        "loud": ["F"],
        "quiet": ["P", "SH"],
        "king": ["K", "R"],
        "queen": ["Q", "ER", "R"],
        "one": ["I", "A"],
        "bridge": ["N", "S", "E", "W"],
        "point": ["N", "S", "E", "W"],
        "doctor": ["DR", "MO", "MD"],
        "husband": ["H"],
        "wife": ["W"],
        "pence": ["P", "D"],
        "pound": ["LB"],
        "north": ["N"],
        "south": ["S"],
        "university": ["U"]
    }
};

// LINKED TO IMMUTABLE DESIGN TEMPLATE
export const MASTER_COACHING_SCROLL = {
    DEFINITION: LOCKED_HINTS.DEFINITION,
    INDICATOR: LOCKED_HINTS.WP_INDICATOR,
    FODDER: LOCKED_HINTS.WP_FODDER,
    SYNONYM: LOCKED_HINTS.WP_DECODE_TEMPLATE,
    FINAL_SOLVE: LOCKED_HINTS.FINAL_SOLVE
};

export const STANDARD_CLUE_TYPES: ClueType[] = [
    {
        id: 'anagram',
        label: 'Anagram',
        name: 'Anagram',
        icon: '🔄',
        description: 'Rearranging the letters of one or more words.',
        mechanism: 'Rearrange fodder letters based on a scramble indicator.',
        theTell: ["broken", "mixed", "crazy", "new", "running", "confused", "off", "badly", "cooked", "wild", "strange", "distributed", "pants", "disorder", "working", "roughly", "dancing", "unusual", "development", "frenzied", "scrambled", "changed", "ordered", "upset", "mad", "in disorder", "odd", "out"],
        strategy: 'Look for an indicator near a set of letters that matches the count.',
        examples: []
    },
    {
        id: 'charade',
        label: 'Charade',
        name: 'Charade',
        icon: '🧱',
        description: 'Stringing together short words or abbreviations.',
        mechanism: 'Building the answer block by block.',
        theTell: ['with', 'on', 'and', 'next to'],
        strategy: 'Break the clue into short synonyms or abbreviations.',
        examples: []
    },
    {
        id: 'container',
        label: 'Container',
        name: 'Container',
        icon: '📥',
        description: 'One word placed inside another.',
        mechanism: 'Word A goes inside Word B.',
        theTell: ['in', 'around', 'holding', 'contains'],
        strategy: 'Identify the outer word and the inner word.',
        examples: []
    },
    {
        id: 'deletion',
        label: 'Deletion',
        name: 'Deletion',
        icon: '✂️',
        description: 'Removing letters from a word.',
        mechanism: 'A word minus its head, tail, or specific letters.',
        theTell: ['without', 'headless', 'losing', 'unfinished', 'snubbed', 'short'],
        strategy: 'Find a word that, when clipped, matches the definition.',
        examples: []
    },
    {
        id: 'reversal',
        label: 'Reversal',
        name: 'Reversal',
        icon: '◀️',
        description: 'A word spelled backwards.',
        mechanism: 'Reverse a synonym or component.',
        theTell: ['back', 'over', 'returning', 'up'],
        strategy: 'Check if a synonym of a clue part spelled backwards fits.',
        examples: []
    },
    {
        id: 'hidden',
        label: 'Hidden Word',
        name: 'Hidden Word',
        icon: '🔍',
        description: 'The answer is hiding in plain sight within the clue.',
        mechanism: 'A sequence of letters across multiple words.',
        theTell: ['in', 'part of', 'concealed by'],
        strategy: 'Scan the letters of the clue regardless of word boundaries.',
        examples: []
    },
    {
        id: 'cryptic_definition',
        label: 'Cryptic Definition',
        name: 'Cryptic Definition',
        icon: '❓',
        description: 'A single, whimsical definition that describes the answer in a puzzling way.',
        mechanism: 'A clever misdirection or play on words.',
        theTell: ['perhaps', 'maybe', '?', 'in a way'],
        strategy: 'Think laterally. The definition is rarely literal.',
        examples: []
    }
];

const TIMES_RULES: DojoRules = {
  ximeneanStrictness: 10,
  indicatorStyle: 'classic',
  commonAbbreviations: ['P', 'D', 'LB', 'N', 'S', 'O'],
  forbiddenTechniques: ['indirect anagrams', 'loose definitions'],
  bias: { 
    preferredWordplay: ['anagram', 'deletion', 'containment'], 
    hintEscalationSpeed: 'slow', 
    ambiguityTolerance: 'low' 
  }
};

const GUARDIAN_RULES: DojoRules = {
  ximeneanStrictness: 6,
  indicatorStyle: 'modern',
  commonAbbreviations: ['N', 'S', 'O', 'U', 'LB'],
  forbiddenTechniques: [],
  bias: { 
    preferredWordplay: ['anagram', 'cryptic_definition', 'homophone', 'deletion', 'container', 'hidden', 'double_definition'], 
    hintEscalationSpeed: 'fast', 
    ambiguityTolerance: 'high' 
  }
};

const TELEGRAPH_RULES: DojoRules = {
  ximeneanStrictness: 8,
  indicatorStyle: 'classic',
  commonAbbreviations: ['LB', 'N', 'S', 'O', 'U'],
  forbiddenTechniques: ['loose synonyms', 'indirect anagrams'],
  bias: { 
    preferredWordplay: ['anagram', 'deletion', 'container', 'hidden', 'double_definition'], 
    hintEscalationSpeed: 'slow', 
    ambiguityTolerance: 'low' 
  }
};

const EXPRESS_RULES: DojoRules = {
  ximeneanStrictness: 9,
  indicatorStyle: 'classic',
  commonAbbreviations: ['LB', 'P', 'N', 'S', 'O'],
  forbiddenTechniques: [],
  bias: { 
    preferredWordplay: ['anagram', 'deletion', 'hidden', 'double_definition'], 
    hintEscalationSpeed: 'fast', 
    ambiguityTolerance: 'low' 
  }
};

export const PUBLICATIONS: Publication[] = [
  {
    id: 'times',
    name: 'The Times',
    description: 'The pinnacle of cryptic excellence. Strictly fair, flawlessly smooth, and notoriously disciplined.',
    established: 1785,
    logoColor: '#111827',
    countryFlag: '🇬🇧',
    defaultRules: TIMES_RULES,
    setters: [
      {
        id: 'wurm',
        pseudonym: 'Wurm',
        realName: 'Unknown',
        difficulty: 6,
        activeFrom: 2010,
        famousQuote: "A clue must be a perfectly engineered mechanism.",
        description: "Known for concise, almost clinical clues with dry wit and high fairness. Clues are engineered with precision.",
        solvingTips: ["Don't overthink.", "Focus on steady parsing.", "Spot the indicators like 'changed', 'ordered', or 'upset'."],
        commonThemes: ["Classical History", "Literature", "French", "Latin"],
        clueTypes: STANDARD_CLUE_TYPES
      },
      {
        id: 'pasquale',
        pseudonym: 'Pasquale',
        realName: 'Don Manley',
        difficulty: 7,
        activeFrom: 1980,
        famousQuote: "Precision is the first duty of the setter.",
        description: "The Don. Master of the elegant and high-fairness clue. Known for a clinical approach to cluing that rewards precise parsing and indicator discipline.",
        solvingTips: ["Beware of surface distractions.", "Focus on clean and watertight parsing.", "Look for standard indicators like 'mixed', 'changed', or 'in disorder'.", "Definitions are almost always clean and literal."],
        commonThemes: ["Religious terminology", "Traditional vocabulary", "Academic topics"],
        clueTypes: STANDARD_CLUE_TYPES
      }
    ]
  },
  {
    id: 'guardian',
    name: 'The Guardian',
    description: 'Progressive, playful, and often humorous. Known for its relaxed "modern" style, frequent use of foreign languages, and loose indicators that prioritize wit over strict rules.',
    established: 1929,
    logoColor: '#052962',
    countryFlag: '🇬🇧',
    defaultRules: GUARDIAN_RULES,
    setters: [
      {
        id: 'paul',
        pseudonym: 'Paul',
        realName: 'John Halpern',
        difficulty: 9,
        activeFrom: 1995,
        famousQuote: "Cryptic crosswords should be fun first.",
        description: "Master of the playful and whimsical. Known for cheeky clues, common homophones, and frequent cryptic definitions. Fairness can be variable as he favors wit over strict Ximenean rules.",
        solvingTips: ["Consider whimsical readings and playful definitions.", "Watch for 'perhaps' or 'maybe' signaling a cryptic definition.", "Lateral thinking is often required.", "Check for homophones like 'heard' or 'on the radio'."],
        commonThemes: ["Wordplay puns", "Food", "Whimsy", "French", "Latin", "German", "Italian"],
        clueTypes: STANDARD_CLUE_TYPES
      }
    ]
  },
  {
    id: 'telegraph',
    name: 'Daily Telegraph',
    description: 'Elegant surfaces and consistent mechanisms. Home of the legendary "Quick" and "Cryptic" puzzles with high fairness and precise definitions.',
    established: 1855,
    logoColor: '#ee1c2e',
    countryFlag: '🇬🇧',
    defaultRules: TELEGRAPH_RULES,
    setters: [
      {
        id: 'enigmatist',
        pseudonym: 'Enigmatist',
        realName: 'John Henderson',
        difficulty: 10,
        activeFrom: 1978,
        famousQuote: "I like to push the boundaries of what a clue can be.",
        description: "A master of mischievous complexity and misdirection. Enigmatist is famous for pushing the limits of cryptic logic, often using whimsical definitions and multi-layered wordplay that rewards solvers who can embrace ambiguity.",
        solvingTips: [
            "Expect misdirection at every turn; nothing is as it seems.", 
            "Be wary of loose or highly whimsical definitions.", 
            "Don't be afraid to revisit your basic assumptions about the clue's structure.",
            "Look for indicators like 'strange', 'odd', or 'out' for anagrams.",
            "Watch for 'in a way' signaling a cryptic definition.",
            "Question mark usage is very frequent and usually significant."
        ],
        commonThemes: ["Complexity", "Multi-stage mechanisms", "Mischief", "Abstract definitions"],
        clueTypes: STANDARD_CLUE_TYPES
      }
    ]
  },
  {
    id: 'express',
    name: 'Daily Express',
    description: 'Home of the Crusader. Characterized by high fairness, very precise definitions, and straightforward surfaces. Anagrams and double definitions are mainstay mechanics here, with low tolerance for ambiguity.',
    established: 1900,
    logoColor: '#1e3a8a',
    countryFlag: '🇬🇧',
    defaultRules: EXPRESS_RULES,
    setters: []
  }
];

export const SETTER_MECHANISMS = {
  paul: ["Playful puns", "Cheeky homophones", "Themed grids"],
  wurm: ["Clinical precision", "Classical references", "Strict Ximenean rules"],
  pasquale: ["Obscure vocabulary", "Flawless wordplay logic"]
};
