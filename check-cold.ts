import { analyzeClueWithoutAnswer } from './services/clueParser';
import { lookupSynonyms } from './data/synonymDictionary';

// Analyze what components we can extract from wordplay WITHOUT looking up the definition
const testCases = [
    { clue: 'Boat staff bringing nothing on board (5)', answer: 'CANOE' },
    { clue: 'Dance backwards while gripping a medic (5)', answer: 'SAMBA' },
    { clue: 'Raid spanning a period of a year (5)', answer: 'FORAY' },
];

for (const tc of testCases) {
    console.log('='.repeat(60));
    console.log('Clue:', tc.clue);
    console.log('Answer:', tc.answer);

    const analysis = analyzeClueWithoutAnswer(tc.clue);

    console.log('\nDefinition candidates:', analysis.definitionCandidates);
    console.log('Indicators found:', analysis.indicatorWordsFound);
    console.log('Content words:', analysis.contentWords);

    console.log('\nObvious elements (abbreviations, etc):');
    analysis.obviousElements.forEach(e => {
        if (e.result) {
            console.log('  ' + e.fodder + ' -> ' + e.result + ' (' + e.type + ')');
        }
    });

    // What synonyms do we get for WORDPLAY fodder (not definition)?
    console.log('\nWordplay fodder synonyms:');
    for (const word of analysis.contentWords) {
        // Skip if it's likely the definition
        if (analysis.definitionCandidates.some(d => d.toLowerCase().includes(word.toLowerCase()))) {
            continue;
        }
        const syns = lookupSynonyms(word.toLowerCase());
        if (syns.length > 0) {
            console.log('  ' + word + ' -> [' + syns.slice(0, 5).join(', ') + ']');
        }
    }
    console.log();
}
