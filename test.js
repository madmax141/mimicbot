import { checkForHaiku } from './index.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}`);
    console.log(`  ${e.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${expected}, got ${actual}`);
  }
}

console.log('Running haiku tests...\n');

test('valid haiku: "this is five words and this is seven words and a this is five words and"', () => {
  const input = "this is five words and this is seven words and a this is five words and";
  const result = checkForHaiku(input);
  assertEqual(result.isHaiku, true, 'should be a haiku');
});

test('invalid haiku: "this is five words and htis is seven words and a this is five words and a"', () => {
  const input = "this is five words and htis is seven words and a this is five words and a";
  const result = checkForHaiku(input);
  assertEqual(result.isHaiku, false, 'should not be a haiku');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
