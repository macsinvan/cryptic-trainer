import { parseClue } from './services/clueParser';

const clue = "Public school lodge reported (5)";
const answer = "STOWE";

const result = parseClue(clue, answer);

console.log("=== PARSE RESULT ===");
console.log("Success:", result.success);
console.log("Confidence:", result.confidence);
console.log("Difficulty:", result.difficulty);
console.log("Pattern ID:", result.patternData?.patternId);
console.log("Needs AI:", result.needsAI);
console.log("");

console.log("=== COMPUTED FIELDS (UI-ready) ===");
console.log("isComplete:", result.patternData?.isComplete);
console.log("parsingSummary:", result.patternData?.parsingSummary);
console.log("definitionText:", result.patternData?.definitionText);
console.log("definitionMatchType:", result.patternData?.definitionMatchType);
console.log("definitionExplanation:", result.patternData?.definitionExplanation);
console.log("");

console.log("=== WORDPLAY STEPS (pre-sorted) ===");
result.patternData?.wordplaySteps?.forEach((step, i) => {
  console.log(`Step ${i + 1}:`);
  console.log(`  stepType: ${step.stepType}`);
  console.log(`  explanation: ${step.explanation}`);
  console.log(`  indicator: ${step.indicator || '(none)'}`);
  console.log(`  fodder: ${step.fodder}`);
  console.log(`  result: ${step.result}`);
});
console.log("");

console.log("=== RAW VARIABLES ===");
console.log(JSON.stringify(result.patternData?.variables, null, 2));
