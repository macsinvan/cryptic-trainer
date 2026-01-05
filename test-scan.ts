// Import directly 
import { scanClueForObviousElements, guessDefinitionFromClue } from './services/clueParser';

console.log('=== Scan test ===');
const clue = 'Delay in hospital department following slander (9)';
const guessedDef = guessDefinitionFromClue(clue);
console.log('Guessed definition:', guessedDef);

const scanned = scanClueForObviousElements(clue, guessedDef?.text);
console.log('Scanned elements:');
scanned.forEach((elem: any) => {
  console.log('  -', elem.type + ':', elem.fodder, '=>', elem.result || '?');
});
