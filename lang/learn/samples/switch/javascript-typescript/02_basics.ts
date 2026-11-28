// Variables, types, and functions in TypeScript
const language: string = "TypeScript";
let counter: number = 0;
counter += 3;

function greet(who: string, times: number = 1): string {
  return `hi ${who} x${times}`;
}

const square = (n: number): number => n * n;

console.log(language, counter);
console.log(greet("Ada", 2));
console.log(square(6));
