import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import type { ESLint, Linter } from 'eslint';
import { toolVersion } from './provenance.js';

// SonarJS 1 supports ESLint 9 at runtime but publishes ESLint 8 context types.
const sonarPlugin: ESLint.Plugin = { meta: { name: 'eslint-plugin-sonarjs', version: toolVersion('eslint-plugin-sonarjs') },
  rules: sonarjs.rules as unknown as ESLint.Plugin['rules'] };

export const lintProfile = { id: 'panopticode-baseline', version: 1 };
export const sonarRules: Linter.RulesRecord = {
  'sonarjs/no-identical-expressions': 'warn',
  'sonarjs/no-duplicated-branches': 'warn',
  'sonarjs/no-identical-functions': 'warn',
  'sonarjs/no-collection-size-mischeck': 'warn',
  'sonarjs/cognitive-complexity': ['warn', 15],
};

export function baselineConfig(root: string, typed = true): Linter.Config[] {
  const configs = [js.configs.recommended, ...tseslint.configs.recommended] as Linter.Config[];
  const base: Linter.Config = {
    name: 'panopticode/baseline-v1', files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
    languageOptions: { parser: tseslint.parser, globals: { ...globals.node, ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true }, tsconfigRootDir: root } },
    plugins: { sonarjs: sonarPlugin }, rules: { ...sonarRules },
  };
  if (!typed) return [...configs, base];
  const typedConfig: Linter.Config = {
    name: 'panopticode/typed-v1', files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: { parserOptions: { projectService: true } },
    rules: { '@typescript-eslint/no-floating-promises': 'warn', '@typescript-eslint/no-misused-promises': 'warn' },
  };
  return [...configs, base, typedConfig];
}
