import { batchParse } from '../services/clueParser';

const clues = [
    // Across
    { clue: 'Token function for auditors (4)', answer: 'SIGN' },
    { clue: 'Ravel said, "Brahms and Liszt are dry and chaotic" (10)', answer: 'DISARRAYED' },
    { clue: 'An intricate network under discussion (2,5)', answer: 'AT ISSUE' },
    { clue: 'Half-cut, become noisy and dull (7)', answer: 'BECLOUD' },
    { clue: 'Critic of French treatise in favour of removing introduction (9)', answer: 'DETRACTOR' },
    { clue: 'Idea that is holding school back (5)', answer: 'IMAGE' },
    { clue: 'Shankar flies around India with American fiddle (12)', answer: 'STRADIVARIUS' },
    { clue: 'Spartan feeling unwell after second piece of cake (5,7)', answer: 'PLAINSAILING' },
    { clue: 'Setter had flipped over state of potatoes (5)', answer: 'IDAHO' },
    { clue: 'Outgoing texts exposed right being infiltrated by left (9)', answer: 'EXTROVERT' },
    { clue: 'Poem rejecting first and fourth of Ten Commandments (7)', answer: 'ECLOGUE' },
    { clue: 'Head of Sanitation probing abandoned septic sump (7)', answer: 'CESSPIT' },
    { clue: "Rocky substrate's most difficult to penetrate (10)", answer: 'ABSTRUSEST' },
    { clue: "Prime elements of consul's responsibility (4)", answer: 'ONUS' },
    // Down
    { clue: 'Careless Californian cops frame nurses (8)', answer: 'SLAPDASH' },
    { clue: 'Scintillating chap with baby animals for you (8)', answer: 'GLITTERY' },
    { clue: 'Bungling miner opts to discard clothes (5)', answer: 'INEPT' },
    { clue: 'Doctor bears grim intestinal secretion (9)', answer: 'AMBERGRIS' },
    { clue: 'I consider Tutu fantastically upright, morally (13)', answer: 'RECTITUDINOUS' },
    { clue: 'Vacuous Yorkshire lady leaving with guard (6)', answer: 'YEOMAN' },
    { clue: 'Stranger following lead of Dennis Potter (6)', answer: 'DODDER' },
    { clue: 'Shoe seller inspiring constant gossip (13)', answer: 'SCANDALMONGER' },
    { clue: 'Unspoken love admitted by innocent (9)', answer: 'VOICELESS' },
    { clue: "Agreed Shakespeare's original wordplay is over-subtle (8)", answer: 'FINESPUN' },
    { clue: 'Languid traitress regularly dismissed worries (8)', answer: 'AGITATES' },
    { clue: "Part of medicine man's art (6)", answer: 'CINEMA' },
    { clue: "Reporter's insensitive coverage of individual caused by friction? (6)", answer: 'CALLUS' },
    { clue: 'Cycling, Rick zigzags (5)', answer: 'TACKS' }
];

const result = batchParse(clues);
console.log('Total:', result.total);
console.log('Parsed (no AI needed):', result.parsed);
console.log('Needs AI:', result.needsAI);
console.log('Success rate:', Math.round(result.parsed / result.total * 100) + '%');
console.log('');

// Show all results
result.items.forEach(item => {
    const ok = item.result.success && !item.result.needsAI;
    const status = ok ? 'OK' : 'FAIL';
    const pattern = item.result.patternData?.patternId || '-';
    const def = item.result.parsed?.definition?.text || '-';
    console.log(status.padEnd(5) + item.answer.padEnd(15) + 'conf=' + String(item.result.confidence).padEnd(4) + pattern.padEnd(22) + 'def: ' + def);
});
