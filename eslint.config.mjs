import { FlatCompat } from '@eslint/eslintrc'

import eslintPluginPrettier from 'eslint-plugin-prettier'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

import prettierConfig from './.prettierrc.json' with { type: 'json' }

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({
	baseDirectory: __dirname,
})

const config = [
	{
		ignores: ['node_modules/**', '.next/**', 'out/**', 'build/**', 'next-env.d.ts'],
	},
	{
		ignores: [
			'.now/',
			'*.css',
			'.changeset',
			'dist/',
			'esm/',
			'public/',
			'tests/',
			'scripts/',
			'*.config.js',
			'.DS_Store',
			'node_modules/',
			'coverage/',
			'.next/',
			'build/',
		],
	},
	...compat.extends('next/core-web-vitals', 'next/typescript'),
	{
		plugins: {
			prettier: eslintPluginPrettier,
		},
		rules: {
			'prettier/prettier': ['error', prettierConfig],
		},
	},
]

export default config
