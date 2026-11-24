import nextVitals from 'eslint-config-next/core-web-vitals';
import root from '../../eslint.config.mjs';

// Next's rules first, then the shared root config, so the typescript-eslint
// parser (which the root's TypeScript rules need) wins for every file.
const config = [...nextVitals, ...root];

export default config;
