import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

// Same rule set the Obsidian community directory runs on each release.
export default defineConfig([
    globalIgnores(["main.js", "node_modules/", "test/", "docs/", "*.mjs", "*.cjs"]),
    ...obsidianmd.configs.recommended,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
]);
