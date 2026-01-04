import { batchParse } from '../services/clueParser';

const clues = [
    // Across
    { clue: 'Hit Philip with eastern weapon (8)', answer: 'BLOWPIPE' },
    { clue: 'Inferior blessing not entirely needed (4)', answer: 'LESS' },
    { clue: 'Fine material wrapping new blade (5)', answer: 'LANCE' },
    { clue: 'Elegant silver over in US city (7)', answer: 'CHICAGO' },
    { clue: 'American/Irish song (3)', answer: 'AIR' },
    { clue: 'Indian Premier League welcomed by member of royal family (9)', answer: 'PRINCIPLE' },
    { clue: 'Leave Antarctica? (6)', answer: 'DESERT' },
    { clue: 'Upset, wearing green (6)', answer: 'INVERT' },
    { clue: 'Failing like gun turned the other way around (4,5)', answer: 'VICEVERSA' },
    { clue: 'I hate this short novel? (3)', answer: 'BOO' },
    { clue: 'At first, some heard, I nearly dominated in Green Party (7)', answer: 'SHINDIG' },
    { clue: 'Pigs blood putting off outsiders in White House (5)', answer: 'IGLOO' },
    { clue: 'Disgusting position (4)', answer: 'RANK' },
    { clue: 'Model bear next to A road (8)', answer: 'STANDARD' },
    // Down
    { clue: 'Post openings of love letters penned by committee (7)', answer: 'BOLLARD' },
    { clue: 'One admitting wife in Nevadan city is upset (5)', answer: 'OWNER' },
    { clue: 'New paper established it is agreed beforehand (11)', answer: 'PREAPPROVED' },
    { clue: 'Walk in the park, and what comes next? (6)', answer: 'PICNIC' },
    { clue: 'More than enough to support former partner, for instance (7)', answer: 'EXAMPLE' },
    { clue: 'Small ice cream cake (5)', answer: 'SCONE' },
    { clue: 'Spell in prison headquarters initially overlooked (11)', answer: 'INCANTATION' },
    { clue: 'Coe isnt running district (7)', answer: 'SECTION' },
    { clue: 'Double act slow to riff, so fall behind ultimately (7)', answer: 'TWOFOLD' },
    { clue: 'Alarm following fit (6)', answer: 'FRIGHT' },
    { clue: 'Shade of some Levis originally (5)', answer: 'VISOR' },
    { clue: 'Like dog to upend wood (5)', answer: 'BALSA' }
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
    console.log(status.padEnd(5) + item.answer.padEnd(12) + 'conf=' + String(item.result.confidence).padEnd(4) + pattern.padEnd(20) + 'def: ' + def);
});
