import type { ArkSetupConfig, ParsedRules } from '../types';
/**
 * YamlCompiler — Reads ark.setup.yaml and produces ParsedRules.
 */
export declare class YamlCompiler {
    private readonly _mapper;
    constructor(language?: string, customMappings?: Record<string, string[]>);
    /** Compile a setup config object to ParsedRules (constitutional + general). */
    compile(config: ArkSetupConfig): {
        constitutional: ParsedRules;
        general: ParsedRules;
    };
    /** Compile constitutional rules from natural language statements. */
    private _compileConstitution;
    /** Compile general rules from the rules section. */
    private _compileGeneralRules;
    /** Parse a flow string → transitions. "빌드 → 테스트 → 스테이징" */
    private _parseFlow;
    /** Convert display name to slug. */
    private _slugify;
    /** Load and parse a YAML setup file. */
    static loadSetupFile(filePath: string): ArkSetupConfig | null;
    static parseSimpleYaml(source: string): ArkSetupConfig;
    /**
     * Parse YAML lines into target object. Returns next line index.
     * @param lines     - filtered lines (no comments/blanks)
     * @param idx       - current line index
     * @param target    - object to write into
     * @param minIndent - minimum indent for this block
     */
    private static _parseYamlBlock;
    /**
     * Parse array items (lines starting with "- "). Returns next line index.
     */
    private static _parseYamlArray;
    /** Parse a scalar YAML value (string, boolean, number). */
    private static _parseScalar;
}
