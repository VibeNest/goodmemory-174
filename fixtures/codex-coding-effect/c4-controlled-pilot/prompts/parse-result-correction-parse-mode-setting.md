# TypeScript utility task

Establish and implement the setting-input policy for this repository. Project policy: remove only leading and trailing U+0020 SPACE characters; tabs and other whitespace remain part of the input; preserve letter case; after normalization accept only exact values declared by the function's TypeScript union; return ParseResult with the matching shared error code for every other value.

Keep the implementation dependency-free and run the visible test.
