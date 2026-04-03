// n2-ark — Natural language to regex pattern mapper. Deterministic, no LLM dependency.
import * as fs from 'fs';
import * as path from 'path';

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
export class NaturalLangMapper {
  private readonly _mappings: MappingTable;
  private readonly _customMappings: MappingTable;

  constructor(language: string = 'en', customMappings: MappingTable = {}) {
    this._mappings = this._loadMappings(language);
    this._customMappings = customMappings;
  }

  /**
   * Convert a natural language statement to regex patterns.
   * Returns empty array if no keywords match — caller should warn the user.
   */
  compile(statement: string): RegExp[] {
    const patterns: RegExp[] = [];
    const normalizedStatement = statement.toLowerCase().trim();

    // 1. Check custom mappings first (user-defined, highest priority)
    //    Custom mappings use the same format as built-in: regex pattern strings.
    for (const [keyword, regexStrings] of Object.entries(this._customMappings)) {
      if (normalizedStatement.includes(keyword.toLowerCase())) {
        for (const rs of regexStrings) {
          try {
            patterns.push(new RegExp(rs, 'i'));
          } catch { /* skip invalid regex */ }
        }
      }
    }

    // 2. Check built-in mappings
    for (const [keyword, regexStrings] of Object.entries(this._mappings)) {
      if (normalizedStatement.includes(keyword.toLowerCase())) {
        for (const rs of regexStrings) {
          try {
            patterns.push(new RegExp(rs, 'i'));
          } catch { /* skip invalid */ }
        }
      }
    }

    return patterns;
  }

  /**
   * Compile multiple statements and return a flat array of unique patterns.
   */
  compileAll(statements: string[]): RegExp[] {
    const seen = new Set<string>();
    const result: RegExp[] = [];

    for (const stmt of statements) {
      for (const pattern of this.compile(stmt)) {
        const key = pattern.source + pattern.flags;
        if (!seen.has(key)) {
          seen.add(key);
          result.push(pattern);
        }
      }
    }

    return result;
  }

  /** Load language-specific mapping table from JSON. */
  private _loadMappings(language: string): MappingTable {
    const mappingPath = path.join(__dirname, '..', 'compiler', 'mappings', `${language}.json`);

    if (!fs.existsSync(mappingPath)) {
      // Fallback to English
      const fallback = path.join(__dirname, '..', 'compiler', 'mappings', 'en.json');
      if (fs.existsSync(fallback)) {
        return JSON.parse(fs.readFileSync(fallback, 'utf-8')) as MappingTable;
      }
      console.error(`[n2-ark] No mapping table found for language '${language}'`);
      return {};
    }

    return JSON.parse(fs.readFileSync(mappingPath, 'utf-8')) as MappingTable;
  }
}
