
// Cryptic Crossword Synonym Dictionary
// Maps common fodder words/phrases to their typical synonyms
// These are the "mental leap" synonyms that solvers need to make

// Format: lowercase fodder -> uppercase synonym(s)
// Multiple synonyms listed in order of commonality

// --- STANDALONE SYNONYMS ---
// Words that commonly appear alone as charade components
// These signal "split here" in multi-part clues like acrostic + synonym
export const STANDALONE_SYNONYMS: Record<string, string> = {
    // Certainty / Affirmation
    'definitely': 'SURE',
    'certainly': 'SURE',
    'surely': 'SURE',
    'positively': 'SURE',
    'absolutely': 'YES',
    'agreed': 'YES',

    // Negation / Nothing
    'nothing': 'NIL',
    'zero': 'O',
    'none': 'NIL',
    'love': 'O',  // Tennis scoring

    // Common short synonyms
    'anger': 'IRE',
    'work': 'OP',
    'operation': 'OP',
    'wearing': 'IN',
    'in': 'IN',
    'soldier': 'ANT',
    'worker': 'ANT',
    'sailor': 'TAR',
    'doctor': 'DR',
    'artist': 'RA',
    'note': 'DO',
    'street': 'ST',
    'road': 'RD',
    'quiet': 'SH',
    'loud': 'FF',
    'soft': 'PP',
    'exercise': 'PE',
    'learner': 'L',
    'queen': 'ER',
    'king': 'R',

    // Direction
    'north': 'N',
    'south': 'S',
    'east': 'E',
    'west': 'W',
    'left': 'L',
    'right': 'R',
    'following': 'F',  // As in "p. 5 f." meaning "and following"

    // Time
    'year': 'Y',
    'time': 'T',
    'age': 'ERA',
    'old': 'O',
    'new': 'N',

    // Misc common
    'about': 'RE',
    'concerning': 'RE',
    'regarding': 'RE',
    'energy': 'E',
    'power': 'P',
};

// --- CRYPTIC DEFINITION MEANINGS ---
// Words with special cryptic meanings that can unlock cryptic definitions
// Format: word -> { meaning: human-readable explanation, synonyms: words this could define }
export const CRYPTIC_MEANINGS: Record<string, { meaning: string; synonyms: string[] }> = {
    'do': { meaning: 'hairstyle', synonyms: ['HAIRDO', 'PERM', 'BOB', 'CUT', 'TONSURE', 'COIF', 'STYLE'] },
    'flower': { meaning: 'river (something that flows)', synonyms: ['RIVER', 'STREAM', 'PO', 'DEE', 'CAM', 'EXE', 'THAMES'] },
    'runner': { meaning: 'river OR smuggler OR blade', synonyms: ['RIVER', 'STREAM', 'BLADE', 'SKI', 'SMUGGLER'] },
    'setter': { meaning: 'dog breed OR crossword compiler', synonyms: ['DOG', 'COMPILER', 'I', 'ME'] },
    'banker': { meaning: 'river (has banks)', synonyms: ['RIVER', 'STREAM', 'AVON', 'NILE'] },
    'see': { meaning: 'bishop\'s territory', synonyms: ['DIOCESE', 'BISHOPRIC', 'ELY', 'BATH'] },
    'number': { meaning: 'anaesthetic (makes numb)', synonyms: ['ANAESTHETIC', 'GAS', 'DRUG', 'ETHER'] },
    'article': { meaning: 'A, AN, or THE', synonyms: ['A', 'AN', 'THE'] },
    'revolutionary': { meaning: 'CHE (Guevara)', synonyms: ['CHE', 'RED', 'REBEL'] },
    'artist': { meaning: 'RA (Royal Academician)', synonyms: ['RA', 'PAINTER', 'ELI'] },
    'record': { meaning: 'LP, EP, or LOG', synonyms: ['LP', 'EP', 'LOG', 'DISC', 'SINGLE'] },
    'bill': { meaning: 'beak OR AC (account) OR note', synonyms: ['BEAK', 'AC', 'NOTE', 'TAB', 'AD'] },
    'bridge': { meaning: 'card game', synonyms: ['GAME', 'CONTRACT', 'RUBBER'] },
    'clubs': { meaning: 'C (card suit)', synonyms: ['C', 'SUIT'] },
    'diamonds': { meaning: 'D (card suit)', synonyms: ['D', 'SUIT', 'ICE'] },
    'hearts': { meaning: 'H (card suit)', synonyms: ['H', 'SUIT'] },
    'spades': { meaning: 'S (card suit)', synonyms: ['S', 'SUIT'] },
    'way': { meaning: 'street/road OR method', synonyms: ['ST', 'RD', 'AVE', 'METHOD', 'MANNER'] },
    'Rex': { meaning: 'king', synonyms: ['KING', 'R', 'ER'] },
    'queen': { meaning: 'ER, R, or HM', synonyms: ['ER', 'R', 'HM', 'REGINA'] },
    'monarch': { meaning: 'ER, R, or butterfly', synonyms: ['ER', 'R', 'KING', 'QUEEN', 'BUTTERFLY'] },
    'church': { meaning: 'CE or CH', synonyms: ['CE', 'CH', 'RC'] },
    'sailor': { meaning: 'AB, TAR, or salt', synonyms: ['AB', 'TAR', 'SALT', 'JACK', 'RATING'] },
    'graduate': { meaning: 'BA, MA, or degree holder', synonyms: ['BA', 'MA', 'BSC'] },
    'party': { meaning: 'DO (social event) or political party', synonyms: ['DO', 'BASH', 'CON', 'LAB', 'LIB', 'RAVE'] },
    'function': { meaning: 'DO (social event) or SINE/COS', synonyms: ['DO', 'SINE', 'COS', 'TAN', 'LOG'] },
};

// --- ABBREVIATION EXPLANATIONS ---
// Teaching content for common cryptic crossword abbreviations
// Used by ClueSolver to explain conventions to students
export const ABBREVIATION_EXPLANATIONS: Record<string, { result: string; explanation: string }> = {
    'hospital department': {
        result: 'ENT',
        explanation: 'In Times-style clueing, "hospital department" very often gives ENT, because ENT is the standard abbreviation for the Ear, Nose and Throat department (you\'ll see it on hospital signage, referrals, etc.).'
    },
    'months': {
        result: 'M',
        explanation: 'M is the standard abbreviation for months (as seen in "3M" = 3 months on contracts, medical notes, etc.)'
    },
    'hospital': {
        result: 'H',
        explanation: 'H is the standard single-letter abbreviation for hospital.'
    },
    'doctor': {
        result: 'DR',
        explanation: 'DR is the standard abbreviation for doctor (as in Dr. Smith).'
    },
    'northern': {
        result: 'N',
        explanation: 'N represents north/northern, as seen on maps and compasses.'
    },
    'eastern': {
        result: 'E',
        explanation: 'E represents east/eastern, as seen on maps and compasses.'
    },
    'southern': {
        result: 'S',
        explanation: 'S represents south/southern, as seen on maps and compasses.'
    },
    'western': {
        result: 'W',
        explanation: 'W represents west/western, as seen on maps and compasses.'
    },
};

export const SYNONYM_DICTIONARY: Record<string, string[]> = {
    // --- PROXIMITY / POSITION ---
    'close': ['NEAR', 'NIGH', 'SHUT', 'END'],
    'close to': ['NEAR', 'BY', 'AT'],
    'near': ['CLOSE', 'BY', 'NIGH', 'AT'],
    'far': ['DISTANT', 'REMOTE', 'OFF'],
    'beside': ['BY', 'NEAR', 'AT'],
    'next to': ['BY', 'BESIDE', 'AT'],

    // --- WATER / STREAMS ---
    'stream': ['BROOK', 'CREEK', 'FLOW', 'RUN', 'BECK', 'BURN', 'RILL'],
    'river': ['PO', 'DEE', 'EXE', 'CAM', 'AVON', 'NILE', 'THAMES'],
    'brook': ['STREAM', 'BECK', 'BURN', 'RILL'],
    'water': ['H2O', 'AQUA', 'SEA', 'RAIN'],
    'sea': ['MED', 'MAIN', 'OCEAN', 'DEEP', 'BRINE'],
    'lake': ['MERE', 'LOCH', 'POND', 'TARN'],
    'pool': ['POND', 'MERE', 'LOCH'],

    // --- SIZE / QUANTITY ---
    'massive': ['WEIGHTY', 'HUGE', 'VAST', 'GIANT', 'LARGE', 'BIG'],
    'big': ['LARGE', 'GREAT', 'HUGE', 'VAST', 'MASSIVE'],
    'large': ['BIG', 'GREAT', 'HUGE', 'VAST', 'L'],
    'small': ['WEE', 'TINY', 'LITTLE', 'MINI', 'S'],
    'tiny': ['WEE', 'SMALL', 'MINI', 'MINUTE'],
    'little': ['WEE', 'SMALL', 'TINY', 'BIT'],
    'great': ['BIG', 'LARGE', 'GRAND', 'G'],
    'huge': ['BIG', 'VAST', 'MASSIVE', 'GIANT', 'ENORMOUS'],
    "that's massive": ['WEIGHTY', 'HUGE', 'VAST'],

    // --- ANIMALS ---
    'bird': ['ROOK', 'CROW', 'JAY', 'TIT', 'OWL', 'EMU', 'HEN', 'SWAN'],
    // ANTEATER: eats soldier ants - "soldier killer" in cryptic
    'soldier killer': ['ANTEATER'],
    'ant eater': ['ANTEATER'],
    'fish': ['COD', 'RAY', 'EEL', 'BASS', 'CARP', 'SOLE', 'DACE'],
    'dog': ['CUR', 'PUP', 'HOUND', 'MUTT', 'SETTER', 'POINTER', 'LAB', 'BOXER', 'POM'],
    'cat': ['TOM', 'TABBY', 'MOGGY', 'KITTY', 'PUSS', 'FELIX'],
    'horse': ['NAG', 'STEED', 'MARE', 'COLT', 'GEE'],
    'snake': ['ASP', 'BOA', 'ADDER', 'VIPER', 'COBRA'],
    'insect': ['ANT', 'BEE', 'FLY', 'MOTH', 'WASP', 'BUG'],
    'ant': ['EMMET'],
    'bee': ['APIS'],

    // --- PEOPLE / ROLES ---
    'man': ['CHAP', 'GUY', 'FELLOW', 'MALE', 'HE', 'BOY', 'GENT'],
    'woman': ['LADY', 'SHE', 'GAL', 'FEMALE', 'DAME', 'HER'],
    'boy': ['LAD', 'SON', 'YOUTH', 'CHAP'],
    'girl': ['LASS', 'MISS', 'GAL', 'MAID'],
    'daughter': ['D', 'GIRL', 'LASS'],
    'son': ['S', 'BOY', 'LAD', 'HEIR'],
    "daughter's": ['D'],
    "son's": ['S'],
    'worker': ['ANT', 'BEE', 'HAND', 'STAFF'],
    'soldier': ['GI', 'RE', 'RA', 'ANT', 'PRIVATE', 'TOMMY'],
    'doctor': ['DR', 'MD', 'DOC', 'GP', 'MO', 'QUACK'],
    'king': ['REX', 'K', 'ER', 'MONARCH', 'R'],
    'knight': ['N', 'SIR', 'K'],
    'bishop': ['B', 'RR', 'BP'],
    'learner': ['L', 'PUPIL', 'STUDENT', 'NOVICE'],
    'writer': ['PEN', 'AUTHOR', 'SCRIBE', 'BARD'],
    'editor': ['ED', 'SUB'],
    'referee': ['REF', 'UMPIRE', 'JUDGE'],
    "ref's assistant": ['VAR'],
    "referee's assistant": ['VAR'],
    'assistant ref': ['VAR'],
    'volunteers': ['TA'],
    'volunteer': ['TA'],
    'territorial army': ['TA'],
    'note': ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DO', 'RE', 'MI', 'FA', 'SO', 'LA', 'TI'],
    'copper': ['CU', 'PENNY', 'P', 'PC'],
    'silver': ['AG'],
    'gold': ['AU', 'OR'],
    'iron': ['FE'],
    'lead': ['PB'],
    'tin': ['SN'],

    // --- DIRECTION / MOVEMENT ---
    'direction': ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW', 'WAY'],
    'north': ['N'],
    'south': ['S'],
    'east': ['E'],
    'west': ['W'],
    'left': ['L', 'PORT'],
    'right': ['R', 'RT', 'STARBOARD', 'CORRECT'],
    'up': ['N', 'NORTH', 'AWAKE', 'RISEN', 'ASTIR', 'ALERT'],
    'down': ['S', 'SOUTH'],

    // --- NUMBERS / AMOUNTS ---
    'one': ['I', 'A', 'AN', 'ACE', 'SINGLE', 'UNIT'],
    'two': ['II', 'PAIR', 'DUO', 'COUPLE', 'BRACE'],
    'three': ['III', 'TRIO', 'TER'],
    'four': ['IV', 'QUAD'],
    'five': ['V', 'CINQUE'],
    'six': ['VI', 'SIXER'],
    'ten': ['X', 'IO'],
    'fifty': ['L'],
    'hundred': ['C', 'TON', 'CENTURY'],
    'thousand': ['M', 'K', 'G'],
    'nothing': ['O', 'NIL', 'ZERO', 'LOVE', 'DUCK'],
    'zero': ['O', 'NIL', 'NOTHING', 'LOVE'],
    'love': ['O', 'NIL', 'ZERO', 'ADORE', 'LIKE', 'FANCY'],
    'many': ['M', 'C', 'D', 'L'],
    'some': ['PART', 'ANY', 'FEW'],

    // --- TIME ---
    'time': ['T', 'AGE', 'ERA', 'HOUR', 'SPELL'],
    // ANTEDATE: to precede in time, "go before"
    'go before': ['ANTEDATE', 'PRECEDE', 'PREDATE'],
    'precede': ['ANTEDATE', 'LEAD', 'PREDATE'],
    'age': ['ERA', 'EON', 'TIME', 'OLD'],
    'year': ['Y', 'YR', 'ANNUM'],
    'month': ['M', 'MO'],
    'day': ['D', 'DATE', 'SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
    'hour': ['H', 'HR', 'TIME'],
    'second': ['S', 'SEC', 'MO', 'TICK'],
    'morning': ['AM', 'MORN'],
    'evening': ['PM', 'EVE', 'EEN'],
    'night': ['PM', 'DARK'],
    'old': ['O', 'EX', 'AGED', 'ANCIENT'],
    'new': ['N', 'NEO', 'FRESH', 'NOVEL'],

    // --- COUNTRIES / PLACES ---
    'america': ['US', 'USA', 'STATES'],
    'american': ['US', 'YANK'],
    'british': ['BR', 'UK', 'B'],
    'english': ['E', 'ENG'],
    'french': ['F', 'FR'],
    'german': ['G', 'GER', 'D'],
    'italian': ['I', 'IT'],
    'spanish': ['E', 'ES', 'SP'],
    'scottish': ['SC'],
    'country': ['LAND', 'NATION', 'STATE'],
    'city': ['TOWN', 'EC', 'BURG'],
    'capital': ['CAP'],
    'island': ['I', 'IS', 'ISLE', 'AIT'],
    'street': ['ST', 'RD', 'WAY', 'AVE'],
    'road': ['RD', 'ST', 'WAY', 'AVE', 'ROUTE'],
    'avenue': ['AVE', 'AV'],

    // --- TRANSPORT ---
    'car': ['AUTO', 'MOTOR', 'BUS', 'MINI', 'FORD', 'BMW'],
    'ship': ['SS', 'HMS', 'BOAT', 'LINER', 'VESSEL', 'CRAFT'],
    'boat': ['SHIP', 'SS', 'ARK', 'CRAFT', 'DINGHY'],
    'plane': ['JET', 'AIRCRAFT', 'KITE'],
    'train': ['BR', 'LOCO', 'TUBE', 'COACH'],

    // --- EMOTIONS / STATES ---
    'anger': ['IRE', 'RAGE', 'FURY', 'WRATH'],
    'angry': ['IRATE', 'MAD', 'CROSS', 'SORE'],
    'happy': ['GAY', 'GLAD', 'JOLLY', 'MERRY'],
    'sad': ['BLUE', 'LOW', 'DOWN', 'GLUM'],
    'fear': ['AWE', 'DREAD', 'TERROR', 'FRIGHT'],
    'hate': ['LOATHE', 'DETEST', 'ABHOR'],
    'i hate this': ['BOO', 'HISS'],  // Expression of disapproval
    'boo': ['JEER', 'HISS', 'HOOT'],
    'awake': ['UP', 'ALERT', 'CONSCIOUS', 'WAKING'],
    'being up': ['AWAKE', 'ALERT', 'ASTIR', 'RISEN', 'RISER'],
    'alert': ['AWAKE', 'AWARE', 'WARY', 'VIGILANT'],
    'asleep': ['OUT', 'DORMANT', 'SLEEPING'],

    // --- CHARACTER / BEHAVIOR ---
    'nuisance': ['PEST', 'VARMINT', 'BOTHER', 'HASSLE', 'ANNOYANCE'],
    'pest': ['VARMINT', 'NUISANCE', 'BUG', 'BOTHER'],
    'perfect': ['MINT', 'IDEAL', 'FLAWLESS', 'PURE', 'ACE'],
    // SCROOGE: miserly character from Dickens
    'money-grubber': ['SCROOGE', 'MISER', 'SKINFLINT'],
    "money-grubber's": ['SCROOGE', 'MISER'],
    'miser': ['SCROOGE', 'SKINFLINT', 'TIGHTWAD'],
    // STOOGE: a pawn or puppet
    'pawn': ['STOOGE', 'PUPPET', 'TOOL', 'DUPE'],
    'puppet': ['STOOGE', 'PAWN', 'TOOL'],

    // --- COMMON WORDS ---
    'the': ['T', 'TH'],
    'a': ['A', 'AN', 'ONE', 'PER'],
    'an': ['A', 'ONE'],
    'in': ['INTO', 'AT', 'AMID'],
    'on': ['UPON', 'AT', 'RE'],
    'for': ['PRO', 'F'],
    'to': ['INTO', 'TOWARD'],
    'of': ['O', 'FROM', 'RE'],
    'about': ['RE', 'CA', 'C', 'CIRCA', 'AROUND'],
    'with': ['W', 'AND', 'PLUS'],
    'and': ['N', 'PLUS', 'ET'],
    'or': ['GOLD', 'AU', 'EITHER', 'ELSE'],  // Gold in heraldry
    'not': ['NO', 'UN'],
    'yes': ['AY', 'AYE', 'YEA', 'OK', 'SI'],
    'no': ['NAY', 'NOT', 'NOPE', 'NIL'],

    // --- ORDERLY / NEAT ---
    'orderly': ['NEAT', 'TIDY', 'TRIM', 'KEMPT'],
    'neat': ['TIDY', 'TRIM', 'ORDERLY'],
    'tidy': ['NEAT', 'TRIM', 'ORDERLY'],
    'messy': ['UNTIDY', 'CHAOTIC', 'SLOVENLY'],

    // --- MUSIC / SOUND ---
    'quiet': ['SH', 'P', 'SOFT', 'STILL', 'MUTE'],
    'loud': ['F', 'FORTE', 'NOISY'],
    'soft': ['P', 'PIANO', 'GENTLE', 'QUIET'],
    'song': ['AIR', 'LAY', 'NUMBER', 'TUNE', 'ARIA'],
    'music': ['TUNE', 'MELODY', 'AIR'],

    // --- STYLE / FASHION ---
    'trendy': ['HIP', 'IN', 'COOL', 'HOT'],
    'fashionable': ['HIP', 'IN', 'CHIC', 'SMART'],

    // --- MISCELLANEOUS ---
    'point': ['N', 'S', 'E', 'W', 'NE', 'DOT', 'TIP', 'END'],
    'end': ['TIP', 'TAIL', 'FINISH', 'CLOSE'],
    'start': ['BEGIN', 'OPEN', 'HEAD', 'TOP'],
    'head': ['TOP', 'NUT', 'NOB', 'CHIEF', 'BOSS'],
    'tail': ['END', 'REAR', 'BACK'],
    'top': ['HEAD', 'TIP', 'PEAK', 'ACE', 'BEST'],
    'bottom': ['BASE', 'REAR', 'FOOT', 'BUM'],
    'side': ['FLANK', 'EDGE', 'TEAM'],
    'edge': ['SIDE', 'RIM', 'BORDER', 'BRIM'],
    'work': ['OP', 'JOB', 'TOIL', 'LABOUR'],
    'job': ['WORK', 'POST', 'OP'],
    'money': ['L', 'P', 'D', 'CASH', 'LOOT', 'BREAD'],
    'credit': ['CR', 'TICK', 'TRUST'],
    "money-grubber's credit": ['CR'],
    'weight': ['TON', 'LB', 'OZ', 'ST', 'STONE', 'GRAM'],
    'power': ['P', 'MIGHT', 'FORCE', 'ENERGY'],
    'energy': ['E', 'POWER', 'PEP', 'ZIP', 'VIM'],
    'force': ['F', 'POWER', 'MAKE', 'ARMY'],
    'current': ['AC', 'DC', 'I', 'NOW', 'TIDE', 'FLOW'],
    'resistance': ['R', 'OHM'],
    'pressure': ['P', 'STRESS'],
    'temperature': ['T', 'TEMP'],
    'degree': ['D', 'BA', 'MA', 'PHD'],
    'circle': ['O', 'RING', 'ROUND', 'LOOP'],
    'ring': ['O', 'CIRCLE', 'BAND', 'CALL', 'BELL'],
    'ball': ['O', 'ORB', 'SPHERE', 'DANCE', 'DO'],

    // --- DRINKS ---
    // KIR: French cocktail (white wine + crème de cassis)
    'drink': ['SUP', 'SIP', 'ALE', 'GIN', 'RUM', 'KIR', 'TEA', 'WINE', 'PORT'],
    'wine': ['VIN', 'PORT', 'RED', 'ROSE', 'CLARET'],
    'beer': ['ALE', 'LAGER', 'PORTER', 'STOUT'],
    'spirit': ['GIN', 'RUM', 'VODKA', 'SOUL', 'GHOST'],

    // --- DAMAGE / TEAR ---
    // RENT as noun = tear/rip in fabric ("the rent in his coat")
    'rent': ['RIP', 'TEAR', 'SPLIT', 'LET', 'HIRE'],
    'tear': ['RIP', 'RENT', 'SPLIT', 'DROP', 'CRY'],
    'rip': ['TEAR', 'RENT', 'SPLIT'],
    'hole': ['O', 'GAP', 'PIT', 'VOID'],
    'book': ['B', 'VOL', 'TOME', 'NT', 'OT'],
    'novel': ['BOOK', 'NEW', 'FRESH', 'ORIGINAL'],
    'volume': ['VOL', 'V', 'BOOK', 'TOME'],
    'paper': ['RAG', 'TIMES', 'MAIL', 'ESSAY', 'SUN'],
    'exercise': ['PE', 'PT', 'DRILL', 'WORKOUT'],
    'game': ['MATCH', 'RU', 'FA', 'SPORT', 'CHESS', 'GO'],
    'sport': ['GAME', 'RU', 'FA', 'WEAR'],
    'team': ['XI', 'XV', 'SIDE', 'CREW', 'SQUAD'],

    // --- ACTIONS / VERBS ---
    'hit': ['BLOW', 'STRIKE', 'SMACK', 'BASH', 'PUNCH', 'SLAP'],
    'blow': ['HIT', 'STRIKE', 'PUFF', 'GUST', 'SHOCK'],
    'strike': ['HIT', 'BLOW', 'BASH'],
    'leave': ['DESERT', 'GO', 'QUIT', 'EXIT', 'ABANDON', 'DEPART'],
    'abandon': ['DESERT', 'LEAVE', 'QUIT', 'DROP'],
    'desert': ['LEAVE', 'ABANDON', 'QUIT', 'SAHARA', 'GOBI'],
    'run': ['MANAGE', 'SPRINT', 'JOG', 'OPERATE', 'TROT', 'FLOW'],
    'running': ['MANAGING', 'JOGGING'],
    'walk': ['STROLL', 'HIKE', 'TREK', 'AMBLE', 'GAIT'],

    // --- QUALITY / STATE ---
    'disgusting': ['RANK', 'VILE', 'FOUL', 'GROSS', 'NASTY'],
    'foul': ['RANK', 'VILE', 'GROSS', 'NASTY', 'SMELLY'],
    'smelly': ['RANK', 'FOUL', 'ODOROUS'],
    'inferior': ['LESS', 'LOWER', 'POOR', 'MINOR', 'SECOND'],
    'less': ['INFERIOR', 'MINOR', 'FEWER', 'MINUS'],
    'elegant': ['CHIC', 'SMART', 'POSH', 'FINE', 'CLASSY'],
    'fine': ['ELEGANT', 'NICE', 'GOOD', 'THIN', 'OK', 'PENALTY'],
    'upset': ['INVERT', 'OVERTURN', 'SAD', 'ANGRY', 'RILED'],
    'green': ['ECO', 'NAIVE', 'ENVIOUS', 'LIME', 'JADE', 'VERT'],
    'wearing': ['IN'],  // As in "dressed in" / "sporting"

    // --- POSITION / RANK ---
    'position': ['RANK', 'PLACE', 'SPOT', 'POST', 'STATION', 'SITE'],
    'rank': ['POSITION', 'TIER', 'GRADE', 'FOUL', 'SMELLY', 'ROW'],
    'post': ['MAIL', 'POLE', 'JOB', 'STATION', 'BOLLARD'],
    'model': ['STANDARD', 'TYPE', 'POSER', 'T', 'IDEAL', 'EXAMPLE'],
    'standard': ['MODEL', 'FLAG', 'NORM', 'PAR', 'USUAL'],
    'bear': ['STAND', 'CARRY', 'BRUIN', 'URSINE', 'TOLERATE', 'ENDURE'],
    'stand': ['BEAR', 'STALL', 'RACK', 'TOLERATE', 'BOOTH', 'ENDURE'],
    'over': ['O', 'DONE', 'FINISHED', 'ACROSS', 'ENDED'],  // O in cricket, also meanings

    // --- WEAPONS / BLADES ---
    'weapon': ['GUN', 'ARM', 'SWORD', 'LANCE', 'SPEAR', 'BLOWPIPE'],
    'blade': ['SWORD', 'KNIFE', 'LANCE', 'EDGE', 'RUNNER'],
    'lance': ['BLADE', 'SPEAR', 'PIERCE', 'CUT'],
    'sword': ['BLADE', 'EPEE', 'SABRE', 'FOIL'],

    // --- MATERIALS ---
    'fine material': ['LACE', 'SILK', 'SATIN', 'CHIFFON'],
    'lace': ['TIE', 'THREAD', 'TRIM'],
    'material': ['CLOTH', 'FABRIC', 'DATA', 'STUFF'],
    'cake': ['SCONE', 'BUN', 'TART', 'GATEAU'],
    'ice cream': ['CONE', 'LOLLY', 'SUNDAE'],

    // --- NAMES / NICKNAMES ---
    'philip': ['PIPE', 'PHIL', 'PIP'],
    'phil': ['PIPE'],

    // --- MUSIC / PERFORMANCE ---
    'air': ['SONG', 'TUNE', 'ARIA', 'MANNER', 'LOOK', 'OXYGEN'],
    'double': ['TWO', 'TWIN', 'COPY', 'DUAL', 'BI'],
    'double act': ['DUO', 'PAIR', 'TWOFOLD'],
    'act': ['DO', 'DEED', 'LAW', 'PLAY', 'PERFORM'],

    // --- US STATES ---
    'state': ['IDAHO', 'OHIO', 'IOWA', 'MAINE', 'TEXAS', 'UTAH', 'NEVADA'],
    'state of potatoes': ['IDAHO'],

    // --- NATIONALITY ---
    'irish': ['EIRE', 'ERIN', 'GAELIC', 'CELTIC'],
    'american/irish': ['AIR'],

    // --- MISCELLANEOUS ---
    'alarm': ['FRIGHT', 'SCARE', 'PANIC', 'BELL', 'ALERT'],
    'fit': ['APT', 'ABLE', 'SUIT', 'RIGHT', 'PROPER', 'SEIZURE'],
    'following': ['F', 'AFTER', 'NEXT', 'FANS', 'POST'],
    'shade': ['HUE', 'TINT', 'VISOR', 'BLIND', 'TONE'],
    'blessing': ['BOON', 'GRACE', 'GIFT'],
    'originally': ['FIRST', 'INITIALLY'],
    'spell': ['INCANTATION', 'BOUT', 'STINT', 'TURN', 'MAGIC'],
    'prison': ['JAIL', 'GAOL', 'NICK', 'CAN', 'STIR'],
    'headquarters': ['HQ', 'BASE', 'HO'],
    'district': ['AREA', 'ZONE', 'SECTION', 'REGION', 'WARD'],
    'park': ['COMMON', 'GREEN', 'GARDENS'],
    'picnic': ['WALK', 'EASY', 'BREEZE', 'CINCH'],
    'walk in the park': ['PICNIC', 'BREEZE', 'CINCH', 'DODDLE'],
    'easy task': ['PICNIC', 'BREEZE', 'CINCH'],
    'rock': ['STONE', 'JEWEL', 'GEM', 'DIAMOND', 'SWAY', 'REEL', 'SHAKE', 'BOULDER', 'CRAG'],
    'stone': ['ROCK', 'GEM', 'JEWEL', 'PIT', 'SEED', 'ST', 'WEIGHT'],
    'wife': ['W', 'SPOUSE', 'MISSUS', 'BRIDE'],
    'committee': ['BOARD', 'PANEL', 'GROUP'],
    'example': ['EG', 'INSTANCE', 'CASE', 'MODEL', 'SAMPLE'],
    'for instance': ['EG', 'SAY', 'EXAMPLE'],
    'instance': ['EXAMPLE', 'CASE', 'OCCURRENCE'],
    'enough': ['AMPLE', 'PLENTY', 'SUFFICIENT'],
    'partner': ['MATE', 'PAL', 'ALLY', 'EX'],
    'former partner': ['EX'],
    'more than enough': ['EXCESS', 'AMPLE', 'PLENTY'],

    // --- GEOGRAPHY ---
    'antarctica': ['DESERT', 'ICE', 'POLE'],  // Antarctica is technically a desert

    // --- HERALDRY / FRENCH ---
    'vert': ['GREEN'],  // Heraldic term for green

    // --- COMPARISON ---
    'like': ['AS', 'SIMILAR', 'LOVE', 'ENJOY', 'FANCY'],
    'as': ['LIKE'],

    // --- MATERIALS / WOOD ---
    'wood': ['BALSA', 'OAK', 'ASH', 'ELM', 'PINE', 'TEAK', 'FOREST'],
    'balsa': ['WOOD'],

    // ============================================================
    // STANDARD CRYPTIC CROSSWORD CONVENTIONS
    // ============================================================

    // --- ROMAN NUMERALS ---
    'five hundred': ['D'],
    'nine': ['IX'],
    'eleven': ['XI'],
    'fifteen': ['XV'],
    'fifty one': ['LI'],
    'one hundred': ['C'],
    'one thousand': ['M'],
    '1': ['I'],
    '5': ['V'],
    '10': ['X'],
    '50': ['L'],
    '100': ['C'],
    '500': ['D'],
    '1000': ['M'],

    // --- COMPASS POINTS ---
    'northeast': ['NE'],
    'northwest': ['NW'],
    'southeast': ['SE'],
    'southwest': ['SW'],
    'pole': ['N', 'S'],

    // --- MUSICAL TERMS ---
    'quietly': ['P'],
    'softly': ['P', 'PP'],
    'piano': ['P', 'SOFT'],
    'loudly': ['F'],
    'forte': ['F', 'LOUD'],
    'very loud': ['FF'],
    'very quiet': ['PP'],
    'very soft': ['PP'],
    'notes': ['MUSIC', 'CASH', 'MEMO'],
    'musical note': ['DO', 'RE', 'MI', 'FA', 'SO', 'LA', 'TI'],
    'key': ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'MAJOR', 'MINOR', 'CLUE'],
    'sharp': ['ACUTE', 'KEEN'],
    'flat': ['B', 'PAD', 'APARTMENT', 'LEVEL', 'EVEN'],
    'chord': ['TRIAD'],
    'scale': ['DO RE MI', 'WEIGH'],
    'tune': ['AIR', 'MELODY', 'SONG'],

    // --- ACADEMIC / PROFESSIONAL ---
    'doctors': ['DRS', 'MBS', 'GPS'],
    'bachelor': ['BA', 'SINGLE'],
    'master': ['MA', 'ACE', 'EXPERT'],
    'masters': ['MA'],
    'theologian': ['DD'],
    'university': ['U', 'VARSITY', 'OXFORD', 'CAMBRIDGE'],
    'uni': ['U'],
    'college': ['U', 'ETON'],
    'school': ['SCH', 'ETON', 'HARROW', 'STOWE', 'RUGBY'],
    'public school': ['ETON', 'HARROW', 'STOWE', 'RUGBY', 'WINCHESTER'],
    'teacher': ['SIR', 'MISS', 'MA', 'MASTER'],
    'pupil': ['L', 'LEARNER', 'EYE', 'STUDENT'],
    'student': ['L', 'PUPIL', 'FRESHER'],
    'lawyer': ['DA', 'QC', 'BRIEF', 'SOLICITOR', 'BARRISTER'],
    'barrister': ['QC', 'KC', 'BL'],
    'judge': ['J', 'RATE', 'ASSESS'],
    'engineer': ['CE', 'RE', 'SAPPER'],
    'accountant': ['CA', 'CPA'],
    'reverend': ['REV', 'RR'],
    'vicar': ['REV', 'VIC'],
    'father': ['FR', 'PA', 'DAD', 'POP', 'SIRE'],
    'archbishop': ['ABP'],
    'saint': ['ST', 'S'],
    'professor': ['PROF', 'DON'],

    // --- COUNTRIES / NATIONALITIES ---
    'france': ['F', 'FR'],
    'germany': ['D', 'GER', 'G'],
    'spain': ['E', 'SP', 'ESP'],
    'italy': ['I', 'IT'],
    'americans': ['GIS', 'YANKS'],
    'britain': ['GB', 'UK'],
    'england': ['E', 'ENG'],
    'scotland': ['SCO', 'S', 'NB'],
    'wales': ['W'],
    'welsh': ['W'],
    'ireland': ['IRL', 'EIRE', 'ERIN'],
    'greece': ['GR'],
    'greek': ['GR', 'HELLENIC'],
    'greek letter': ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'PI', 'MU', 'NU', 'CHI', 'PHI', 'PSI', 'OMEGA', 'ETA', 'IOTA'],
    'russia': ['SU', 'USSR', 'RUS'],
    'russian': ['RED', 'SOVIET'],
    'china': ['PRC', 'CH'],
    'chinese': ['CH'],
    'japan': ['J', 'JAP', 'NIPPON'],
    'japanese': ['J', 'JAP'],
    'india': ['IND', 'I'],
    'indian': ['I', 'HINDU'],
    'of french': ['DE', 'DU', 'LA', 'LE', 'LES'],
    'the french': ['LE', 'LA', 'LES'],
    'the german': ['DER', 'DIE', 'DAS'],
    'the spanish': ['EL', 'LA', 'LOS', 'LAS'],
    'the italian': ['IL', 'LA', 'LO'],
    'in french': ['EN', 'DANS'],
    'in german': ['IN', 'IM'],
    'in spain': ['EN'],
    'parisian': ['FRENCH'],

    // --- CRICKET / SPORTS ---
    'runs': ['R', 'RS', 'SCORE'],
    'wicket': ['W', 'GATE', 'STUMPS'],
    'duck': ['O', 'ZERO', 'NIL', 'BIRD'],
    'maiden': ['M', 'VIRGIN', 'GIRL', 'LASS'],
    'bowled': ['B'],
    'caught': ['C', 'CT'],
    'leg': ['ON', 'LEG', 'LIMB', 'PIN'],
    'leg before wicket': ['LBW'],
    'not out': ['NO'],
    'test': ['MATCH', 'EXAM', 'TRY', 'TRIAL'],
    'match': ['GAME', 'BOUT', 'PAIR', 'EQUAL', 'VESTA', 'LUCIFER'],
    'goal': ['AIM', 'END', 'TARGET', 'G'],
    'bat': ['HIT', 'CLUB', 'MAMMAL'],
    'club': ['BAT', 'ASSOCIATION', 'C'],
    'ace': ['ONE', 'A', 'STAR', 'EXPERT', 'SERVE'],
    'service': ['ACE', 'ARMY', 'NAVY', 'RAF'],
    'set': ['READY', 'KIT', 'GROUP', 'GEL', 'PUT', 'FIRM', 'FIX', 'FIXED'],
    'nil': ['O', 'ZERO', 'NONE', 'NOTHING'],

    // --- MILITARY ---
    'soldiers': ['GIS', 'MEN', 'OR', 'RE', 'RA', 'ANTS', 'ARMY'],
    'private': ['GI', 'SECRET', 'OWN', 'PERSONAL'],
    'general': ['GEN', 'COMMON', 'USUAL', 'BROAD'],
    'colonel': ['COL'],
    'captain': ['CAPT', 'SKIPPER', 'MASTER'],
    'major': ['KEY', 'MAIN', 'CHIEF', 'SENIOR'],
    'minor': ['KEY', 'SMALL', 'LESSER', 'JUNIOR'],
    'sergeant': ['SGT', 'NCO'],
    'corporal': ['CPL', 'NCO', 'BODILY'],
    'regiment': ['RA', 'RE', 'REGT'],
    'artillery': ['RA', 'GUNS'],
    'engineers': ['RE', 'SAPPERS'],
    'royal engineers': ['RE'],
    'royal artillery': ['RA'],
    'navy': ['RN', 'FLEET'],
    'sailors': ['ABS', 'TARS', 'RN', 'CREW'],
    'able seaman': ['AB'],
    'seaman': ['AB', 'TAR', 'SALT'],
    'airman': ['AC', 'PILOT', 'FLIER'],
    'army': ['TA', 'HOST', 'FORCE', 'MILITARY'],
    'air force': ['RAF', 'USAF'],
    'fleet': ['RN', 'NAVY', 'ARMADA'],
    'troop': ['UNIT', 'BAND'],
    'troops': ['MEN', 'ARMY', 'FORCES'],
    'gun': ['ROD', 'GAT', 'PIECE', 'WEAPON', 'CANNON'],
    'bomb': ['SHELL', 'FLOP', 'FAIL'],

    // --- RELIGION ---
    'god': ['ALLAH', 'RA', 'MARS', 'JOVE', 'THOR', 'ODIN', 'ZEUS'],
    'goddess': ['HERA', 'ISIS', 'VENUS', 'DIANA', 'JUNO'],
    'bible': ['AV', 'NT', 'OT', 'SCRIPTURE'],
    'old testament': ['OT'],
    'new testament': ['NT'],
    'church of england': ['CE', 'COE'],
    'roman catholic': ['RC'],
    'prayer': ['AVE', 'ORISON', 'PLEA'],
    'hymn': ['SONG', 'PSALM', 'PAEAN'],
    'cross': ['X', 'ROOD', 'ANGRY', 'IRATE'],
    'crucifix': ['ROOD'],

    // --- UNIONS/GROUPS/ALIGNMENT ---
    'union': ['ALIGNMENT', 'ALLIANCE', 'MERGER', 'TU', 'NUS', 'WEDDING', 'MARRIAGE'],
    'alignment': ['UNION', 'ALLIANCE', 'AGREEMENT', 'LINE'],
    'slander': ['MALIGN', 'LIBEL', 'DEFAME', 'SMEAR', 'SLUR'],
    'malign': ['SLANDER', 'DEFAME', 'LIBEL', 'EVIL', 'BAD'],

    // --- MEDICAL/HOSPITAL ---
    'hospital department': ['ENT', 'ER', 'ICU', 'OR', 'A&E', 'WARD'],
    'hospital departments': ['ENT', 'ER', 'ICU', 'OR', 'A&E', 'WARD'],
    "hospital department's": ['ENT', 'ER', 'ICU', 'OR', 'A&E', 'WARD'],
    'ear nose and throat': ['ENT'],
    'ent': ['ENT'],

    // --- TIME ABBREVIATIONS ---
    'months': ['M', 'MO'],

    // --- COMMON ABBREVIATIONS ---
    'account': ['AC', 'BILL', 'TAB', 'STORY'],
    'advertisement': ['AD', 'ADVERT', 'NOTICE'],
    'afternoon': ['PM'],
    'against': ['V', 'VS', 'ANTI', 'CON'],
    'answer': ['A', 'ANS', 'REPLY', 'SOLUTION'],
    'ante meridiem': ['AM'],
    'before noon': ['AM'],
    'after noon': ['PM'],
    'before': ['ERE', 'PRE', 'AGO', 'PRIOR'],
    'born': ['B', 'NEE'],
    'century': ['C', 'AGE', 'ERA', 'TON'],
    'chapter': ['CH', 'C', 'CHAP'],
    'company': ['CO', 'FIRM', 'TROOP', 'CIA'],
    'court': ['CT', 'LAW', 'WOO'],
    'dead': ['D', 'LATE', 'GONE', 'OB'],
    'died': ['D', 'OB'],
    'eastern': ['E', 'ORIENTAL'],
    'for example': ['EG', 'SAY'],
    'that is': ['IE', 'NAMELY'],
    'good': ['G', 'FINE', 'NICE', 'PI'],
    'half': ['SEMI', 'DEMI', 'HEMI'],
    'hospital': ['H', 'INFIRMARY'],
    'husband': ['H', 'MAN', 'HUBBY', 'SPOUSE'],
    'junction': ['J', 'JCT', 'JOIN', 'MEETING'],
    'line': ['L', 'ROW', 'RY', 'QUEUE', 'ROPE', 'CORD'],
    'lines': ['RY', 'LY', 'VERSE', 'POETRY'],
    'noon': ['N', 'TWELVE', 'MIDDAY'],
    'northern': ['N'],
    'odd': ['O', 'RUM', 'STRANGE', 'PECULIAR', 'QUEER'],
    'origin': ['O', 'ROOT', 'SOURCE', 'START'],
    'ounce': ['OZ'],
    'page': ['P', 'PP', 'LEAF', 'SHEET', 'BOY'],
    'pages': ['PP'],
    'penny': ['P', 'D', 'CENT', 'COPPER'],
    'pence': ['P', 'D'],
    'post meridiem': ['PM'],
    'pound': ['L', 'LB', 'QUID', 'NICKER'],
    'pounds': ['L', 'LBS', 'QUIDS'],
    'question': ['Q', 'QUERY', 'ASK', 'QU'],
    'railway': ['RY', 'LINE', 'BR', 'GWR', 'LMS'],
    'shilling': ['S', 'BOB'],
    'society': ['S', 'SOC', 'CLUB', 'BODY'],
    'southern': ['S'],
    'unknown': ['X', 'Y', 'Z', 'N', 'ANON', 'STRANGER'],
    'unknowns': ['XY', 'XYZ'],
    'versus': ['V', 'VS'],
    'very': ['V', 'SO'],
    'victory': ['V', 'WIN'],
    'volt': ['V'],
    'watt': ['W'],
    'week': ['WK'],
    'western': ['W'],
    'years': ['YRS'],

    // --- COMMON SHORT WORDS ---
    'it': ['IT'],
    'is': ['IS'],
    'are': ['ARE', 'RE'],
    'be': ['AM', 'IS', 'ARE', 'EXIST'],
    'has': ['HAS', 'S'],
    'had': ['HAD', 'D'],
    'have': ['HAVE', 'VE'],
    'i': ['I', 'ME', 'ONE', 'EYE', 'AY', 'AYE'],
    'me': ['ME', 'I'],
    'he': ['HE', 'MAN', 'MALE'],
    'she': ['SHE', 'WOMAN', 'FEMALE', 'HER'],
    'we': ['WE', 'US'],
    'us': ['US', 'WE'],
    'you': ['U', 'YE', 'THEE'],
    'your': ['UR', 'YR'],
    'that': ['IT', 'THAT'],
    'this': ['IT', 'THIS'],
    'at': ['AT', 'IN'],
    'by': ['BY', 'PER', 'X', 'VIA'],
    'from': ['EX', 'FROM'],
    'out': ['EX', 'OUT'],
    'but': ['BUT', 'YET', 'ONLY'],

    // --- SINGLE LETTER EQUIVALENTS ---
    // A
    'amp': ['A'],
    'area': ['A'],
    // B
    'beta': ['B'],
    // C
    'circa': ['C'],
    'cold': ['C'],
    // D (already have daughter, five hundred)
    // E (already have english, east, energy)
    // F
    // G (already have good)
    // H
    'hard': ['H', 'TOUGH', 'DIFFICULT'],
    // I (already have one, single, me, setter)
    // L (already have left, pound)
    // M
    'married': ['M', 'WED', 'HITCHED'],
    'million': ['M'],
    // N (already have new, name)
    // O (already have nothing, love, zero)
    // P
    'parking': ['P'],
    // R
    // S (already have south, small, son)
    // T
    'tea': ['T', 'CHA', 'CHAR', 'BREW'],
    // U (already have you, university)
    // W (already have with)
    // X
    'times': ['X', 'ERA', 'AGE', 'MULTIPLY'],
    // Y
    'why': ['Y'],
    // Z
    'zed': ['Z'],
    'zee': ['Z'],

    // --- VERBS / ACTIONS ---
    'entertains': ['HAS', 'HOLDS', 'CONTAINS', 'AMUSES'],
    'houses': ['HOLDS', 'CONTAINS', 'HAS'],
    'holds': ['HAS', 'CONTAINS', 'GRIPS'],
    'contains': ['HAS', 'HOLDS'],
    'recounted': ['TOLD', 'RELATED', 'SAID'],
    'said': ['SPOKE', 'TOLD', 'QUOTH'],
    'told': ['SAID', 'RELATED', 'RECOUNTED'],
    'goes': ['RUNS', 'TRAVELS', 'LEAVES'],
    'takes': ['GRABS', 'SEIZES', 'CAPTURES'],
    'gets': ['OBTAINS', 'RECEIVES', 'FETCHES'],
    'puts': ['PLACES', 'SETS', 'LAYS'],
    'makes': ['CREATES', 'PRODUCES', 'EARNS'],
    'sees': ['VIEWS', 'WATCHES', 'NOTES'],
    'comes': ['ARRIVES', 'REACHES'],
    'leaves': ['GOES', 'EXITS', 'DEPARTS', 'FOLIAGE'],
    'finds': ['DISCOVERS', 'LOCATES'],
    'gives': ['DONATES', 'PROVIDES', 'OFFERS'],
    'uses': ['EMPLOYS', 'UTILIZES'],
    'wants': ['DESIRES', 'WISHES', 'LACKS'],
    'works': ['OPERATES', 'FUNCTIONS', 'OPS'],
    'shows': ['DISPLAYS', 'REVEALS', 'EXHIBITS'],
    'helps': ['AIDS', 'ASSISTS'],
    'plays': ['PERFORMS', 'ACTS'],
    'moves': ['GOES', 'SHIFTS', 'STIRS'],
    'lives': ['DWELLS', 'RESIDES', 'EXISTS'],
    'believes': ['THINKS', 'FEELS', 'TRUSTS'],
    'brings': ['CARRIES', 'FETCHES'],
    'happens': ['OCCURS', 'BEFALLS'],
    'writes': ['PENS', 'AUTHORS'],
    'provides': ['GIVES', 'SUPPLIES', 'OFFERS'],
    'sits': ['RESTS', 'PERCHES'],
    'stands': ['RISES', 'BEARS', 'TOLERATES'],
    'loses': ['DROPS', 'MISSES', 'SHEDS'],
    'pays': ['REWARDS', 'SETTLES'],
    'meets': ['GREETS', 'ENCOUNTERS'],
    'includes': ['CONTAINS', 'HAS', 'COVERS'],
    'continues': ['PERSISTS', 'LASTS', 'PROCEEDS'],
    'sets': ['PLACES', 'PUTS', 'ARRANGES'],
    'learns': ['STUDIES', 'DISCOVERS'],
    'changes': ['ALTERS', 'MODIFIES', 'COINS'],
    'leads': ['GUIDES', 'HEADS', 'FRONTS'],
    'understands': ['GETS', 'GRASPS', 'SEES'],
    'watches': ['VIEWS', 'OBSERVES', 'GUARDS'],
    'follows': ['TRAILS', 'PURSUES', 'ENSUES'],
    'stops': ['HALTS', 'ENDS', 'CEASES'],
    'creates': ['MAKES', 'PRODUCES', 'FORMS'],
    'speaks': ['TALKS', 'SAYS', 'UTTERS'],
    'reads': ['STUDIES', 'SCANS', 'PERUSES'],
    'allows': ['LETS', 'PERMITS'],
    'adds': ['SUMS', 'APPENDS'],
    'spends': ['USES', 'PASSES'],
    'grows': ['RISES', 'EXPANDS', 'DEVELOPS'],
    'opens': ['UNLOCKS', 'STARTS', 'BEGINS'],
    'walks': ['STRIDES', 'STEPS', 'TREKS'],
    'wins': ['GAINS', 'TRIUMPHS', 'EARNS'],
    'offers': ['GIVES', 'PROVIDES', 'TENDERS'],
    'remembers': ['RECALLS', 'RECOLLECTS'],
    'loves': ['ADORES', 'CHERISHES'],
    'considers': ['PONDERS', 'WEIGHS', 'REGARDS'],
    'appears': ['SEEMS', 'SHOWS', 'EMERGES'],
    'buys': ['PURCHASES', 'ACQUIRES'],
    'waits': ['STAYS', 'LINGERS', 'TARRIES'],
    'serves': ['AIDS', 'HELPS', 'ATTENDS'],
    'dies': ['EXPIRES', 'PERISHES', 'ENDS'],
    'sends': ['POSTS', 'DISPATCHES'],
    'expects': ['AWAITS', 'ANTICIPATES'],
    'builds': ['CONSTRUCTS', 'ERECTS', 'MAKES'],
    'stays': ['REMAINS', 'WAITS', 'LINGERS'],
    'falls': ['DROPS', 'TUMBLES', 'DESCENDS'],
    'cuts': ['SLICES', 'CHOPS', 'SNIPS'],
    'reaches': ['ARRIVES', 'ATTAINS', 'GETS'],
    'kills': ['SLAYS', 'MURDERS', 'ENDS'],
    'remains': ['STAYS', 'LASTS', 'PERSISTS'],
    'suggests': ['HINTS', 'PROPOSES', 'IMPLIES'],
    'raises': ['LIFTS', 'ELEVATES', 'REARS'],
    'passes': ['GOES', 'MOVES', 'DIES'],
    'sells': ['VENDS', 'TRADES', 'HAWKS'],
    'requires': ['NEEDS', 'DEMANDS', 'WANTS'],
    'reports': ['TELLS', 'RELATES', 'STATES'],
    'decides': ['RESOLVES', 'CHOOSES', 'SETTLES'],
    'pulls': ['TUGS', 'DRAWS', 'HAULS'],
    'develops': ['GROWS', 'EVOLVES', 'FORMS'],
    'breaks': ['SNAPS', 'CRACKS', 'SHATTERS'],
    'receives': ['GETS', 'OBTAINS', 'ACCEPTS'],
    'agrees': ['CONCURS', 'ASSENTS', 'ACCORDS'],
    'supports': ['BACKS', 'AIDS', 'UPHOLDS'],
    'hits': ['STRIKES', 'SMACKS', 'BATS'],
    'produces': ['MAKES', 'CREATES', 'YIELDS'],
    'eats': ['DINES', 'CONSUMES', 'DEVOURS'],
    'covers': ['HIDES', 'SPANS', 'INCLUDES'],
    'catches': ['GRABS', 'SNARES', 'TRAPS'],
    'draws': ['SKETCHES', 'PULLS', 'ATTRACTS'],
    'chooses': ['PICKS', 'SELECTS', 'OPTS'],

    // --- EXCLAMATIONS / EMOTIONS ---
    'cry': ['SOB', 'WEEP', 'WAIL', 'CALL', 'SHOUT'],
    'shout': ['CRY', 'YELL', 'BAWL', 'ROAR'],
    'laugh': ['HA', 'HO', 'CHORTLE', 'GIGGLE', 'GUFFAW'],
    'sigh': ['AH', 'OH'],
    'surprise': ['AH', 'OH', 'SHOCK', 'AMAZE'],
    'agreement': ['AY', 'AYE', 'YES', 'YEA'],
    'pain': ['OW', 'OUCH', 'ACHE', 'HURT'],
    'hesitation': ['ER', 'UM', 'AH'],
    'indeed': ['AY', 'SO'],
    'alas': ['AH', 'OH', 'WOE'],
    'hey': ['HI', 'OI', 'HO'],
    'worry': ['FRET', 'CARE', 'CONCERN', 'ANXIETY'],

    // --- BODY PARTS ---
    'face': ['MUG', 'DIAL', 'FRONT', 'VISAGE'],
    'eye': ['I', 'ORB', 'OPTIC', 'PEEPER'],
    'eyes': ['II', 'ORBS', 'PEEPERS'],
    'ear': ['LUG'],
    'nose': ['CONK', 'BEAK', 'SNOUT', 'HOOTER'],
    'mouth': ['GOB', 'TRAP', 'KISSER'],
    'lip': ['RIM', 'EDGE', 'CHEEK'],
    'tooth': ['FANG', 'MOLAR', 'TUSK'],
    'teeth': ['SET', 'FANGS'],
    'hand': ['PAW', 'MITT', 'FIST', 'PALM', 'H'],
    'hands': ['H', 'PAWS', 'MITTS'],
    'arm': ['LIMB', 'WEAPON', 'GUN'],
    'foot': ['PED', 'PAW', 'BASE', 'FT'],
    'feet': ['DOGS', 'PAWS', 'FT'],
    'toe': ['DIGIT'],
    'finger': ['DIGIT'],
    'heart': ['CORE', 'TICKER', 'CENTRE', 'H'],
    'stomach': ['TUM', 'GUT', 'BELLY'],
    'back': ['REAR', 'SPINE', 'SUPPORT'],
    'skin': ['HIDE', 'PELT', 'RIND'],
    'bone': ['RIB', 'ULNA', 'FEMUR', 'TIBIA'],
    'blood': ['GORE'],

    // --- FOOD / DRINK ---
    'spirits': ['GIN', 'RUM', 'MORALE', 'GHOSTS'],
    'whisky': ['RYE', 'SCOTCH', 'MALT'],
    'food': ['FARE', 'GRUB', 'NOSH', 'EATS', 'FEED'],
    'meat': ['BEEF', 'PORK', 'LAMB', 'HAM', 'FLESH'],
    'bread': ['LOAF', 'ROLL', 'DOUGH', 'MONEY'],
    'fruit': ['APPLE', 'PEAR', 'PLUM', 'FIG', 'DATE', 'RESULT'],
    'vegetable': ['PEA', 'BEAN', 'LEEK', 'TURNIP'],
    'sugar': ['SWEET', 'DEAR', 'HONEY'],
    'salt': ['SAILOR', 'TAR', 'NaCl', 'SEASON'],
    'pepper': ['SEASON', 'SPICE'],
    'egg': ['O', 'OVUM', 'BOMB', 'URGE'],
    'cheese': ['BRIE', 'EDAM', 'CHEDDAR'],
    'butter': ['RAM', 'GOAT', 'SPREAD'],
    'milk': ['EXPLOIT'],
    'cream': ['BEST', 'TOP', 'ELITE'],

    // --- CLOTHING ---
    'hat': ['CAP', 'TILE', 'TOPPER', 'BOWLER', 'FEDORA', 'LID'],
    'cap': ['HAT', 'LID', 'TOP', 'LIMIT'],
    'coat': ['JACKET', 'MAC', 'LAYER', 'FUR'],
    'jacket': ['COAT', 'COVER', 'SKIN'],
    'shirt': ['TOP', 'TEE'],
    'trousers': ['PANTS', 'SLACKS', 'JEANS'],
    'pants': ['TROUSERS', 'GASPS'],
    'dress': ['FROCK', 'GOWN', 'ATTIRE', 'CLOTHE', 'GARB'],
    'suit': ['FIT', 'CLUBS', 'HEARTS', 'SPADES', 'DIAMONDS', 'CARDS'],
    'tie': ['BOND', 'DRAW', 'KNOT', 'BIND'],
    'shoe': ['BOOT', 'PUMP', 'LOAFER'],
    'boot': ['SHOE', 'KICK', 'TRUNK'],
    'sock': ['HIT', 'PUNCH', 'HOSE'],
    'belt': ['HIT', 'BAND', 'ZONE', 'STRAP'],
    'glove': ['MITT', 'GAUNTLET'],
    'clothes': ['GARB', 'ATTIRE', 'GEAR', 'DRESS', 'KIT'],
    'outfit': ['KIT', 'RIG', 'GEAR', 'CLOTHES'],
    'fashion': ['MODE', 'STYLE', 'VOGUE', 'MAKE'],

    // --- TRANSPORT ---
    'bus': ['COACH', 'VEHICLE'],
    'vehicle': ['CAR', 'BUS', 'VAN', 'TRUCK'],
    'taxi': ['CAB', 'HACK', 'MINICAB'],
    'cab': ['TAXI', 'HACK'],
    'engine': ['LOCO', 'MOTOR'],
    'wheel': ['CYCLE', 'SPIN', 'TURN', 'HELM'],
    'tyre': ['TIRE', 'RUBBER'],
    'route': ['WAY', 'PATH', 'ROAD', 'RTE'],
    'path': ['WAY', 'ROUTE', 'TRAIL', 'TRACK'],
    'track': ['PATH', 'TRAIL', 'RAIL', 'LINE', 'FOLLOW'],

    // --- BUILDINGS / PLACES ---
    'house': ['HO', 'HOME', 'PAD', 'LODGE', 'MANOR', 'CONTAIN'],
    'home': ['IN', 'PAD', 'HOUSE', 'BASE', 'ABODE'],
    'lodge': ['STOW', 'PUT', 'HOUSE', 'CABIN', 'HUT', 'INN'],
    'room': ['SPACE', 'HALL', 'DEN', 'CHAMBER'],
    'door': ['ENTRY', 'EXIT', 'GATE', 'ACCESS'],
    'window': ['PANE', 'OPENING', 'GAP'],
    'wall': ['BARRIER', 'FENCE', 'SIDE'],
    'floor': ['DECK', 'STOREY', 'LEVEL', 'BASE'],
    'roof': ['TOP', 'COVER', 'CEILING'],
    'garden': ['YARD', 'PLOT', 'EDEN'],
    'pub': ['INN', 'BAR', 'LOCAL', 'TAVERN', 'HOSTELRY'],
    'bar': ['PUB', 'INN', 'BLOCK', 'ROD', 'EXCEPT'],
    'inn': ['PUB', 'HOTEL', 'TAVERN', 'HOSTELRY'],
    'hotel': ['INN', 'H'],
    'bank': ['SIDE', 'RELY', 'SHORE', 'TRUST'],
    'shop': ['STORE', 'BUY', 'GRASS'],
    'store': ['SHOP', 'KEEP', 'STOCK', 'HOARD'],
    'office': ['BUREAU', 'POST', 'JOB', 'DUTY'],
    'station': ['STOP', 'DEPOT', 'BASE', 'RANK'],
    'tower': ['TURRET', 'SPIRE', 'PYLON'],
    'castle': ['FORT', 'ROOK', 'KEEP', 'STRONGHOLD'],
    'jail': ['PRISON', 'GAOL', 'NICK', 'CAN'],
    'theatre': ['STAGE', 'REP', 'DRAMA'],
    'cinema': ['FILM', 'MOVIES', 'PICTURES', 'FLICKS'],
    'gallery': ['ART', 'BALCONY'],
    'museum': ['V AND A', 'BM'],
    'library': ['LIB'],
    'farm': ['RANCH', 'GRANGE', 'TILL'],
    'factory': ['PLANT', 'WORKS', 'MILL'],
    'plant': ['FACTORY', 'WORKS', 'FLORA', 'SPY', 'SET'],
    'town': ['CITY', 'BURG', 'BURGH'],
    'village': ['HAMLET', 'VIL'],
    'nation': ['LAND', 'STATE', 'COUNTRY', 'RACE'],
    'land': ['COUNTRY', 'NATION', 'GROUND', 'SOIL', 'ALIGHT'],
    'isle': ['I', 'ISLAND'],
    'mountain': ['MT', 'PEAK', 'ALP', 'BEN'],
    'hill': ['TOR', 'FELL', 'RISE', 'SLOPE'],
    'valley': ['DALE', 'DELL', 'GLEN', 'VALE', 'DIP'],
    'forest': ['WOOD', 'WOODS', 'TREES'],

    // --- NATURE / WEATHER ---
    'sun': ['SOL', 'STAR', 'RA'],
    'moon': ['LUNA', 'SATELLITE', 'DREAM'],
    'star': ['SUN', 'CELEB', 'ACE', 'LEAD', 'ASTERISK'],
    'sky': ['BLUE', 'HEAVEN', 'AIR'],
    'cloud': ['MIST', 'NIMBUS', 'BLUR'],
    'rain': ['POUR', 'FALL', 'SHOWER', 'WET'],
    'snow': ['WHITE', 'POWDER'],
    'wind': ['GALE', 'BREEZE', 'AIR', 'COIL', 'TWIST'],
    'storm': ['GALE', 'TEMPEST', 'RAGE', 'ATTACK'],
    'thunder': ['ROAR', 'BOOM'],
    'lightning': ['BOLT', 'FLASH', 'FAST'],
    'ice': ['FROST', 'DIAMONDS', 'COLD', 'FREEZE'],
    'fire': ['FLAME', 'BLAZE', 'SACK', 'SHOOT'],
    'flame': ['FIRE', 'BLAZE', 'LOVER'],
    'heat': ['WARMTH', 'RACE', 'ROUND'],
    'hot': ['WARM', 'HEATED', 'SPICY', 'H'],
    'warm': ['HOT', 'TEPID', 'HEATED', 'MILD'],
    'cool': ['COLD', 'HIP', 'CALM', 'C'],
    'wet': ['DAMP', 'MOIST', 'RAINY', 'SODDEN'],
    'dry': ['ARID', 'SEC', 'PARCHED', 'BRUT'],

    // --- TIME ---
    'minute': ['M', 'MIN', 'MO', 'SMALL', 'TINY'],
    'moment': ['MO', 'SEC', 'TICK', 'JIFFY', 'INSTANT'],
    'instant': ['MO', 'SEC', 'FLASH', 'MOMENT'],
    'era': ['AGE', 'PERIOD', 'TIME', 'EPOCH'],
    'period': ['ERA', 'AGE', 'TIME', 'DOT', 'FULL STOP'],
    'date': ['DAY', 'TIME', 'FRUIT', 'APPOINTMENT'],
    'past': ['AGO', 'OVER', 'GONE', 'BY', 'HISTORY'],
    'present': ['NOW', 'GIFT', 'HERE', 'CURRENT'],
    'future': ['TOMORROW', 'AHEAD', 'COMING', 'DESTINY'],
    'now': ['AD', 'TODAY', 'PRESENT', 'CURRENTLY'],
    'then': ['NEXT', 'SO', 'THEREFORE'],
    'never': ['NE', 'NOT EVER'],
    'always': ['EVER', 'AY', 'AYE', 'FOREVER'],
    'often': ['OFT', 'MUCH', 'FREQUENTLY'],
    'sometimes': ['OCCASIONALLY', 'NOW AND THEN'],
    'early': ['SOON', 'PREMATURE', 'FIRST'],
    'late': ['DEAD', 'DECEASED', 'TARDY', 'OVERDUE'],
    'soon': ['ANON', 'SHORTLY', 'PRESENTLY'],
    'today': ['NOW', 'AD'],
    'tomorrow': ['FUTURE', 'MANANA'],
    'yesterday': ['PAST', 'YESTER'],

    // --- COLOURS ---
    'red': ['CRIMSON', 'SCARLET', 'RUBY', 'COMMUNIST', 'R'],
    'blue': ['AZURE', 'NAVY', 'SAD', 'DOWN', 'B'],
    'yellow': ['GOLD', 'AMBER', 'COWARDLY', 'Y'],
    'black': ['JET', 'EBONY', 'DARK', 'NOIR', 'B'],
    'white': ['PALE', 'SNOW', 'PURE', 'BLANK', 'W'],
    'brown': ['TAN', 'BEIGE', 'SEPIA', 'UMBER'],
    'grey': ['ASH', 'GRAY', 'DRAB', 'DULL'],
    'gray': ['ASH', 'GREY', 'DRAB', 'DULL'],
    'orange': ['AMBER', 'FRUIT'],
    'pink': ['ROSE', 'SALMON', 'BLUSH'],
    'purple': ['VIOLET', 'MAUVE', 'PLUM'],
    'colour': ['HUE', 'TINT', 'DYE', 'SHADE', 'TONE'],
    'color': ['HUE', 'TINT', 'DYE', 'SHADE', 'TONE'],

    // --- MISC COMMON ---
    'thing': ['ITEM', 'OBJECT', 'AFFAIR'],
    'something': ['IT', 'THING', 'SOMEWHAT'],
    'everything': ['ALL', 'LOT', 'WHOLE'],
    'anything': ['AUGHT', 'ANY'],
    'part': ['BIT', 'PIECE', 'ROLE', 'SHARE', 'PORTION'],
    'piece': ['BIT', 'PART', 'ITEM', 'MAN', 'GUN'],
    'bit': ['PART', 'PIECE', 'MORSEL', 'JOT', 'BYTE'],
    'lot': ['MUCH', 'FATE', 'PLOT', 'SET', 'BATCH'],
    'group': ['SET', 'BAND', 'TEAM', 'LOT', 'CLASS'],
    'finish': ['END', 'CLOSE', 'COMPLETE', 'DONE'],
    'middle': ['CENTRE', 'CENTER', 'MID', 'MIDST', 'CORE'],
    'centre': ['MIDDLE', 'CORE', 'HUB', 'HEART'],
    'center': ['MIDDLE', 'CORE', 'HUB', 'HEART'],
    'corner': ['ANGLE', 'NOOK', 'BEND'],
    'square': ['FAIR', 'PLAZA', 'PIAZZA', 'OLD'],
    'round': ['O', 'CIRCLE', 'ABOUT', 'BOUT', 'HEAT'],
    'shape': ['FORM', 'FIGURE', 'MOULD', 'CONDITION'],
    'form': ['SHAPE', 'TYPE', 'KIND', 'CLASS', 'MAKE'],
    'type': ['KIND', 'SORT', 'FORM', 'FONT', 'PRINT'],
    'kind': ['TYPE', 'SORT', 'NICE', 'GENTLE', 'BENEVOLENT'],
    'sort': ['TYPE', 'KIND', 'CLASS', 'ORDER', 'ARRANGE'],
    'class': ['TYPE', 'KIND', 'SORT', 'RANK', 'STYLE', 'LESSON'],
    'order': ['COMMAND', 'SORT', 'CLASS', 'SEQUENCE', 'CLUB', 'RANK', 'DECREE'],
    'figure': ['DIGIT', 'FORM', 'SHAPE', 'NUMBER', 'CALCULATE'],
    'letter': ['NOTE', 'MAIL', 'CHARACTER', 'A', 'B', 'C', 'EPISTLE'],
    'word': ['TERM', 'PROMISE', 'NEWS', 'VOW'],
    'name': ['N', 'TAG', 'TITLE', 'CALL', 'DUB', 'NOUN'],
    'title': ['NAME', 'HEADING', 'CLAIM', 'SIR', 'LORD', 'MR'],
    'sign': ['MARK', 'SYMBOL', 'OMEN', 'GESTURE', 'SIGNAL', 'AUTOGRAPH'],
    'mark': ['SIGN', 'SYMBOL', 'SPOT', 'STAIN', 'NOTE', 'SCORE', 'GRADE'],
    'task': ['JOB', 'WORK', 'DUTY', 'CHORE'],
    'duty': ['TASK', 'JOB', 'TAX', 'OBLIGATION'],
    'business': ['FIRM', 'CO', 'TRADE', 'AFFAIR', 'CONCERN'],
    'trade': ['SWAP', 'DEAL', 'BUSINESS', 'CRAFT'],
    'deal': ['LOT', 'TRADE', 'BARGAIN', 'COPE', 'DISTRIBUTE'],
    'problem': ['ISSUE', 'SNAG', 'TROUBLE', 'SUM', 'QUESTION'],
    'idea': ['NOTION', 'THOUGHT', 'CONCEPT', 'PLAN', 'IMAGE'],
    'thought': ['IDEA', 'NOTION', 'OPINION', 'CARE'],
    'opinion': ['VIEW', 'THOUGHT', 'BELIEF', 'IDEA'],
    'view': ['OPINION', 'SCENE', 'SIGHT', 'OUTLOOK', 'SEE'],
    'reason': ['CAUSE', 'MOTIVE', 'LOGIC', 'SENSE', 'GROUND'],
    'cause': ['REASON', 'MOTIVE', 'MAKE', 'CASE'],
    'result': ['OUTCOME', 'EFFECT', 'SCORE', 'END', 'FRUIT'],
    'effect': ['RESULT', 'OUTCOME', 'IMPACT', 'CAUSE'],
    'strength': ['POWER', 'FORCE', 'MIGHT', 'FORTE'],
    'support': ['BACK', 'AID', 'PROP', 'HELP', 'SECOND'],
    'help': ['AID', 'ASSIST', 'SUPPORT', 'HAND'],
    'aid': ['HELP', 'ASSIST', 'SUPPORT', 'GRANT'],
    'chance': ['ODD', 'RISK', 'LUCK', 'OPPORTUNITY', 'RANDOM'],
    'luck': ['FORTUNE', 'CHANCE', 'FATE'],
    'risk': ['CHANCE', 'DANGER', 'HAZARD', 'GAMBLE', 'DARE'],
    'danger': ['RISK', 'PERIL', 'HAZARD', 'THREAT'],
    'trouble': ['PROBLEM', 'BOTHER', 'STRIFE', 'WOE', 'ADO'],
    'difficulty': ['TROUBLE', 'PROBLEM', 'SNAG', 'HARDSHIP'],
    'success': ['HIT', 'WIN', 'TRIUMPH', 'VICTORY'],
    'failure': ['FLOP', 'DUD', 'FIASCO', 'BREAKDOWN'],
    'mistake': ['ERROR', 'SLIP', 'BLUNDER', 'FAULT'],
    'error': ['MISTAKE', 'SLIP', 'FAULT', 'BLUNDER'],
    'fault': ['ERROR', 'FLAW', 'BLAME', 'DEFECT'],
    'truth': ['FACT', 'VERITY', 'REALITY'],
    'lie': ['FIB', 'UNTRUTH', 'RECLINE', 'REST'],
    'fact': ['TRUTH', 'DATUM', 'REALITY', 'DETAIL'],
    'detail': ['ITEM', 'POINT', 'FACT', 'ELEMENT'],
    'secret': ['PRIVATE', 'HIDDEN', 'MYSTERY', 'ARCANUM'],
    'mystery': ['SECRET', 'PUZZLE', 'ENIGMA', 'RIDDLE'],
    'story': ['TALE', 'YARN', 'ACCOUNT', 'FLOOR', 'LIE'],
    'tale': ['STORY', 'YARN', 'FABLE', 'LIE'],
    'news': ['INFO', 'WORD', 'TIDINGS', 'REPORT'],
    'information': ['INFO', 'DATA', 'GEN', 'INTEL', 'NEWS'],
    'message': ['NOTE', 'WORD', 'MEMO', 'TEXT'],
    'speech': ['TALK', 'ADDRESS', 'ORATION', 'TONGUE'],
    'talk': ['CHAT', 'SPEECH', 'CONVERSE', 'DISCUSS'],
    'conversation': ['CHAT', 'TALK', 'DIALOGUE'],
    'argument': ['ROW', 'DISPUTE', 'DEBATE', 'CASE', 'REASON'],
    'fight': ['SCRAP', 'BRAWL', 'BATTLE', 'ROW', 'COMBAT', 'WAR'],
    'war': ['BATTLE', 'CONFLICT', 'COMBAT', 'STRIFE'],
    'peace': ['CALM', 'QUIET', 'HARMONY', 'REST'],
    'attack': ['ASSAULT', 'RAID', 'ONSET', 'FIT', 'CHARGE'],
    'defence': ['GUARD', 'SHIELD', 'PROTECTION'],
    'defense': ['GUARD', 'SHIELD', 'PROTECTION'],
    'defeat': ['LOSS', 'BEAT', 'ROUT', 'FAILURE'],
    'winner': ['VICTOR', 'CHAMPION', 'CHAMP'],
    'loser': ['DUD', 'FAILURE', 'ALSO RAN'],
    'prize': ['AWARD', 'REWARD', 'TROPHY', 'VALUE'],
    'reward': ['PRIZE', 'AWARD', 'BOUNTY'],
    'gift': ['PRESENT', 'TALENT', 'DONATION', 'FLAIR'],
    'play': ['ACT', 'DRAMA', 'GAME', 'FUN'],
    'fun': ['SPORT', 'PLAY', 'JEST', 'AMUSEMENT'],
    'joke': ['JEST', 'GAG', 'PUN', 'QUIP', 'JAPE'],
    'trick': ['RUSE', 'PLOY', 'KNACK', 'FEAT', 'DODGE'],
    'plan': ['SCHEME', 'PLOT', 'DESIGN', 'MAP', 'INTEND'],
    'scheme': ['PLAN', 'PLOT', 'DESIGN', 'PROJECT'],
    'plot': ['PLAN', 'SCHEME', 'STORY', 'PATCH', 'LOT'],
    'project': ['PLAN', 'SCHEME', 'JUT', 'CAST'],
    'aim': ['GOAL', 'TARGET', 'POINT', 'PURPOSE', 'INTEND'],
    'target': ['AIM', 'GOAL', 'OBJECT', 'MARK', 'BUTT'],
    'purpose': ['AIM', 'GOAL', 'INTENT', 'USE', 'POINT'],
    'use': ['EMPLOY', 'UTILISE', 'PURPOSE', 'FUNCTION'],
    'value': ['WORTH', 'PRICE', 'MERIT', 'ESTEEM'],
    'worth': ['VALUE', 'MERIT', 'PRICE'],
    'price': ['COST', 'RATE', 'VALUE', 'FEE', 'CHARGE'],
    'cost': ['PRICE', 'CHARGE', 'EXPENSE', 'FEE'],
    'cash': ['MONEY', 'READY', 'NOTES', 'COINS'],
    'pay': ['WAGE', 'SALARY', 'REMIT', 'REWARD'],
    'wage': ['PAY', 'SALARY', 'FEE', 'CONDUCT'],
    'salary': ['PAY', 'WAGE', 'INCOME', 'EARNINGS'],
    'income': ['PAY', 'SALARY', 'REVENUE', 'EARNINGS'],
    'profit': ['GAIN', 'BENEFIT', 'RETURN'],
    'loss': ['DEFEAT', 'WASTE', 'FORFEIT'],
    'tax': ['DUTY', 'LEVY', 'TOLL', 'VAT', 'STRAIN'],
    'debt': ['IOU', 'OWING', 'LIABILITY', 'ARREARS'],
};

// --- LOOKUP FUNCTIONS ---

/**
 * Look up synonyms for a given word or phrase
 * Returns array of possible synonyms, or empty array if not found
 */
export function lookupSynonyms(fodder: string): string[] {
    const key = fodder.toLowerCase().replace(/[^a-z0-9\s'-]/g, '').trim();
    const staticSyns = SYNONYM_DICTIONARY[key] || [];
    const learnedSyns = learnedSynonyms[key] || [];

    // Combine static and learned, removing duplicates
    return [...new Set([...staticSyns, ...learnedSyns])];
}

/**
 * Find the best synonym that matches a target length
 */
export function findSynonymByLength(fodder: string, targetLength: number): string | null {
    const synonyms = lookupSynonyms(fodder);
    return synonyms.find(s => s.length === targetLength) || null;
}

/**
 * Find a synonym that, after an operation, would produce a result of target length
 * For deletion: synonym.length - 1 = targetLength
 * For first/last letter extraction: targetLength = 1
 */
export function findSynonymForOperation(
    fodder: string,
    operation: 'deletion_first' | 'deletion_last' | 'extract_first' | 'extract_last',
    targetLength: number
): { synonym: string; result: string } | null {
    const synonyms = lookupSynonyms(fodder);

    for (const synonym of synonyms) {
        let result: string;

        switch (operation) {
            case 'deletion_first':
                result = synonym.slice(1);
                break;
            case 'deletion_last':
                result = synonym.slice(0, -1);
                break;
            case 'extract_first':
                result = synonym[0];
                break;
            case 'extract_last':
                result = synonym[synonym.length - 1];
                break;
        }

        if (result.length === targetLength) {
            return { synonym, result };
        }
    }

    return null;
}

/**
 * Apply a letter extraction operation directly to fodder
 * Used for "end of X" type indicators
 */
export function extractLetter(fodder: string, position: 'first' | 'last'): string {
    const clean = fodder.replace(/[^a-zA-Z]/g, '');
    if (!clean) return '';
    return position === 'first' ? clean[0].toUpperCase() : clean[clean.length - 1].toUpperCase();
}

/**
 * Check if a result could be formed by combining parts
 * Useful for charade verification
 */
export function verifyCharade(parts: string[], expectedAnswer: string): boolean {
    const combined = parts.join('').toUpperCase().replace(/[^A-Z]/g, '');
    const answer = expectedAnswer.toUpperCase().replace(/[^A-Z]/g, '');
    return combined === answer;
}

/**
 * Check if a word is a standalone synonym (used in charade splitting)
 * Returns the synonym result if found, null otherwise
 */
export function lookupStandaloneSynonym(word: string): string | null {
    const key = word.toLowerCase().trim();
    return STANDALONE_SYNONYMS[key] || null;
}

/**
 * Find standalone synonym in a phrase and split
 * Returns: { before: string[], synonymWord: string, synonymResult: string, after: string[] } or null
 */
export function splitAtStandaloneSynonym(phrase: string): {
    before: string[];
    synonymWord: string;
    synonymResult: string;
    after: string[];
} | null {
    const words = phrase.split(/\s+/);

    for (let i = 0; i < words.length; i++) {
        const word = words[i].toLowerCase().replace(/[^a-z]/g, '');
        const result = STANDALONE_SYNONYMS[word];

        if (result) {
            return {
                before: words.slice(0, i),
                synonymWord: words[i],
                synonymResult: result,
                after: words.slice(i + 1)
            };
        }
    }

    return null;
}

// ============================================
// LEARNED SYNONYMS - AI-discovered mappings
// ============================================

// In-memory cache of learned synonyms (persisted to localStorage)
let learnedSynonyms: Record<string, string[]> = {};
const LEARNED_SYNONYMS_KEY = 'cryptic_learned_synonyms';

/**
 * Load learned synonyms from localStorage
 */
export function loadLearnedSynonyms(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
        try {
            const stored = localStorage.getItem(LEARNED_SYNONYMS_KEY);
            if (stored) {
                learnedSynonyms = JSON.parse(stored);
            }
        } catch (e) {
            console.error('Failed to load learned synonyms:', e);
            learnedSynonyms = {};
        }
    }
}

/**
 * Save learned synonyms to localStorage
 */
function saveLearnedSynonyms(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
        try {
            localStorage.setItem(LEARNED_SYNONYMS_KEY, JSON.stringify(learnedSynonyms));
        } catch (e) {
            console.error('Failed to save learned synonyms:', e);
        }
    }
}

/**
 * Add a synonym learned from AI validation
 * Called when AI confirms a word→answer mapping we didn't have in dictionary
 */
export function learnSynonym(fodder: string, synonym: string): void {
    const key = fodder.toLowerCase().trim();
    const value = synonym.toUpperCase().trim();

    // Don't learn if already in static dictionary
    if (SYNONYM_DICTIONARY[key]?.includes(value)) {
        return;
    }

    // Add to learned synonyms
    if (!learnedSynonyms[key]) {
        learnedSynonyms[key] = [];
    }
    if (!learnedSynonyms[key].includes(value)) {
        learnedSynonyms[key].push(value);
        saveLearnedSynonyms();
        console.log(`Learned new synonym: "${key}" → ${value}`);
    }
}

/**
 * Get all synonyms (static + learned) for a fodder
 */
export function getAllSynonyms(fodder: string): string[] {
    const key = fodder.toLowerCase().replace(/[^a-z0-9\s'-]/g, '').trim();
    const staticSyns = SYNONYM_DICTIONARY[key] || [];
    const learnedSyns = learnedSynonyms[key] || [];

    // Combine, removing duplicates
    return [...new Set([...staticSyns, ...learnedSyns])];
}

/**
 * Get learned synonyms only (for export/review)
 */
export function getLearnedSynonyms(): Record<string, string[]> {
    return { ...learnedSynonyms };
}

/**
 * Clear all learned synonyms (for testing/reset)
 */
export function clearLearnedSynonyms(): void {
    learnedSynonyms = {};
    if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem(LEARNED_SYNONYMS_KEY);
    }
}

// Initialize on module load
loadLearnedSynonyms();
