import { batchParse } from '../services/clueParser';

const clues = [
    // Across
    { clue: "Following delay of months, slander hospital department's union (9)", answer: 'ALIGNMENT' },
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
    const diff = item.result.difficulty || '-';
    console.log(status.padEnd(5) + item.answer.padEnd(15) + diff.padEnd(12) + pattern.padEnd(22) + 'def: ' + def);
});
