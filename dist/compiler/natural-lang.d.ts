/** Mapping entry: keyword → array of regex pattern strings */
type MappingTable = Record<string, string[]>;
/**
 * NaturalLangMapper — Converts human-readable security statements to regex patterns.
 *
 * Strategy: deterministic keyword-based mapping (no LLM dependency).
 * A security tool must NEVER depend on non-deterministic inference.
 *
 * Flow: "파일 시스템 전체 삭제 금지" → keyword extraction → pattern lookup → RegExp[]
 */
export declare class NaturalLangMapper {
    private readonly _mappings;
    private readonly _customMappings;
    constructor(language?: string, customMappings?: MappingTable);
    /**
     * Convert a natural language statement to regex patterns.
     * Returns empty array if no keywords match — caller should warn the user.
     */
    compile(statement: string): RegExp[];
    /**
     * Compile multiple statements and return a flat array of unique patterns.
     */
    compileAll(statements: string[]): RegExp[];
    /** Load language-specific mapping table from JSON. */
    private _loadMappings;
}
export {};
