import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'preview/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Control-character regexes intentionally sanitize YAML copy and XML text.
  { rules: { 'no-control-regex': 'off' } }
)
