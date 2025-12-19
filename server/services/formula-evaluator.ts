/**
 * Safe Formula Evaluator
 * 
 * This module provides a secure way to evaluate custom trading formulas
 * without using `new Function()` or `eval()` which are security risks.
 * 
 * It implements a simple expression parser that only allows:
 * - Numeric literals
 * - Predefined variables (price, ema50, ema200, high, low, open, close, volume)
 * - Comparison operators (>, <, >=, <=, ==, !=)
 * - Logical operators (&&, ||, !)
 * - Arithmetic operators (+, -, *, /)
 * - Parentheses for grouping
 * - Math functions (abs, min, max, round, floor, ceil)
 */

export interface FormulaContext {
  price: number;
  ema50: number;
  ema200: number;
  high: number;
  low: number;
  open: number;
  close?: number;
  volume?: number;
}

export interface FormulaValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// Token types
type TokenType = 
  | 'NUMBER'
  | 'VARIABLE'
  | 'OPERATOR'
  | 'COMPARISON'
  | 'LOGICAL'
  | 'LPAREN'
  | 'RPAREN'
  | 'FUNCTION'
  | 'COMMA'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string | number;
  position: number;
}

// Allowed variables (lowercase)
const ALLOWED_VARIABLES = new Set([
  'price', 'ema50', 'ema200', 'high', 'low', 'open', 'close', 'volume'
]);

// Variable name mappings (uppercase with underscores to lowercase)
const VARIABLE_MAPPINGS: Record<string, string> = {
  'ema_50': 'ema50',
  'ema_200': 'ema200',
  'ema50': 'ema50',
  'ema200': 'ema200',
  'price': 'price',
  'close': 'close',
  'high': 'high',
  'low': 'low',
  'open': 'open',
  'volume': 'volume',
};

// Allowed functions
const ALLOWED_FUNCTIONS = new Set([
  'abs', 'min', 'max', 'round', 'floor', 'ceil', 'sqrt', 'pow'
]);

// Operator precedence
const PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '==': 3, '!=': 3,
  '<': 4, '>': 4, '<=': 4, '>=': 4,
  '+': 5, '-': 5,
  '*': 6, '/': 6,
  '!': 7,
};

/**
 * Tokenizer - converts formula string into tokens
 */
function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < formula.length) {
    const char = formula[pos];

    // Skip whitespace
    if (/\s/.test(char)) {
      pos++;
      continue;
    }

    // Numbers (including decimals)
    if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(formula[pos + 1]))) {
      let numStr = '';
      while (pos < formula.length && /[0-9.]/.test(formula[pos])) {
        numStr += formula[pos++];
      }
      tokens.push({ type: 'NUMBER', value: parseFloat(numStr), position: pos - numStr.length });
      continue;
    }

    // Identifiers (variables and functions)
    if (/[a-zA-Z_]/.test(char)) {
      let identifier = '';
      const startPos = pos;
      while (pos < formula.length && /[a-zA-Z0-9_]/.test(formula[pos])) {
        identifier += formula[pos++];
      }
      
      const lowerIdentifier = identifier.toLowerCase();
      
      // Check if it's a function (followed by parenthesis)
      if (ALLOWED_FUNCTIONS.has(lowerIdentifier)) {
        tokens.push({ type: 'FUNCTION', value: lowerIdentifier, position: startPos });
      } else if (VARIABLE_MAPPINGS[lowerIdentifier]) {
        // Use mapped variable name
        tokens.push({ type: 'VARIABLE', value: VARIABLE_MAPPINGS[lowerIdentifier], position: startPos });
      } else if (ALLOWED_VARIABLES.has(lowerIdentifier)) {
        tokens.push({ type: 'VARIABLE', value: lowerIdentifier, position: startPos });
      } else {
        throw new Error(`Unknown identifier: ${identifier} at position ${startPos}`);
      }
      continue;
    }

    // Two-character operators
    const twoChar = formula.slice(pos, pos + 2);
    if (['&&', '||', '==', '!=', '<=', '>='].includes(twoChar)) {
      if (['&&', '||'].includes(twoChar)) {
        tokens.push({ type: 'LOGICAL', value: twoChar, position: pos });
      } else {
        tokens.push({ type: 'COMPARISON', value: twoChar, position: pos });
      }
      pos += 2;
      continue;
    }

    // Single-character operators
    if (['+', '-', '*', '/'].includes(char)) {
      tokens.push({ type: 'OPERATOR', value: char, position: pos++ });
      continue;
    }

    if (['<', '>'].includes(char)) {
      tokens.push({ type: 'COMPARISON', value: char, position: pos++ });
      continue;
    }

    if (char === '!') {
      tokens.push({ type: 'LOGICAL', value: char, position: pos++ });
      continue;
    }

    if (char === '(') {
      tokens.push({ type: 'LPAREN', value: char, position: pos++ });
      continue;
    }

    if (char === ')') {
      tokens.push({ type: 'RPAREN', value: char, position: pos++ });
      continue;
    }

    if (char === ',') {
      tokens.push({ type: 'COMMA', value: char, position: pos++ });
      continue;
    }

    throw new Error(`Unexpected character: ${char} at position ${pos}`);
  }

  tokens.push({ type: 'EOF', value: '', position: pos });
  return tokens;
}

/**
 * AST Node types
 */
type ASTNode =
  | { type: 'number'; value: number }
  | { type: 'variable'; name: string }
  | { type: 'binary'; operator: string; left: ASTNode; right: ASTNode }
  | { type: 'unary'; operator: string; operand: ASTNode }
  | { type: 'function'; name: string; args: ASTNode[] };

/**
 * Parser - converts tokens into AST
 */
class Parser {
  private tokens: Token[];
  private pos: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private current(): Token {
    return this.tokens[this.pos];
  }

  private consume(expectedType?: TokenType): Token {
    const token = this.current();
    if (expectedType && token.type !== expectedType) {
      throw new Error(`Expected ${expectedType} but got ${token.type} at position ${token.position}`);
    }
    this.pos++;
    return token;
  }

  parse(): ASTNode {
    const result = this.parseExpression(0);
    if (this.current().type !== 'EOF') {
      throw new Error(`Unexpected token at position ${this.current().position}`);
    }
    return result;
  }

  private parseExpression(minPrecedence: number): ASTNode {
    let left = this.parseUnary();

    while (true) {
      const token = this.current();
      const tokenValue = String(token.value);
      
      if (!['OPERATOR', 'COMPARISON', 'LOGICAL'].includes(token.type)) {
        break;
      }

      const precedence = PRECEDENCE[tokenValue];
      if (precedence === undefined || precedence < minPrecedence) {
        break;
      }

      this.consume();
      const right = this.parseExpression(precedence + 1);
      left = { type: 'binary', operator: tokenValue, left, right };
    }

    return left;
  }

  private parseUnary(): ASTNode {
    const token = this.current();
    
    if (token.type === 'LOGICAL' && token.value === '!') {
      this.consume();
      const operand = this.parseUnary();
      return { type: 'unary', operator: '!', operand };
    }

    if (token.type === 'OPERATOR' && token.value === '-') {
      this.consume();
      const operand = this.parseUnary();
      return { type: 'binary', operator: '*', left: { type: 'number', value: -1 }, right: operand };
    }

    return this.parsePrimary();
  }

  private parsePrimary(): ASTNode {
    const token = this.current();

    if (token.type === 'NUMBER') {
      this.consume();
      return { type: 'number', value: token.value as number };
    }

    if (token.type === 'VARIABLE') {
      this.consume();
      return { type: 'variable', name: token.value as string };
    }

    if (token.type === 'FUNCTION') {
      const funcName = token.value as string;
      this.consume();
      this.consume('LPAREN');
      
      const args: ASTNode[] = [];
      if (this.current().type !== 'RPAREN') {
        args.push(this.parseExpression(0));
        while (this.current().type === 'COMMA') {
          this.consume();
          args.push(this.parseExpression(0));
        }
      }
      
      this.consume('RPAREN');
      return { type: 'function', name: funcName, args };
    }

    if (token.type === 'LPAREN') {
      this.consume();
      const expr = this.parseExpression(0);
      this.consume('RPAREN');
      return expr;
    }

    throw new Error(`Unexpected token: ${token.type} at position ${token.position}`);
  }
}

/**
 * Evaluator - evaluates AST with given context
 */
function evaluate(node: ASTNode, context: FormulaContext): number | boolean {
  switch (node.type) {
    case 'number':
      return node.value;

    case 'variable':
      const value = context[node.name as keyof FormulaContext];
      if (value === undefined) {
        throw new Error(`Undefined variable: ${node.name}`);
      }
      return value;

    case 'binary': {
      const left = evaluate(node.left, context);
      const right = evaluate(node.right, context);
      
      switch (node.operator) {
        case '+': return (left as number) + (right as number);
        case '-': return (left as number) - (right as number);
        case '*': return (left as number) * (right as number);
        case '/': 
          if (right === 0) throw new Error('Division by zero');
          return (left as number) / (right as number);
        case '<': return (left as number) < (right as number);
        case '>': return (left as number) > (right as number);
        case '<=': return (left as number) <= (right as number);
        case '>=': return (left as number) >= (right as number);
        case '==': return left === right;
        case '!=': return left !== right;
        case '&&': return Boolean(left) && Boolean(right);
        case '||': return Boolean(left) || Boolean(right);
        default:
          throw new Error(`Unknown operator: ${node.operator}`);
      }
    }

    case 'unary': {
      const operand = evaluate(node.operand, context);
      if (node.operator === '!') {
        return !Boolean(operand);
      }
      throw new Error(`Unknown unary operator: ${node.operator}`);
    }

    case 'function': {
      const args = node.args.map(arg => evaluate(arg, context) as number);
      
      switch (node.name) {
        case 'abs': return Math.abs(args[0]);
        case 'min': return Math.min(...args);
        case 'max': return Math.max(...args);
        case 'round': return Math.round(args[0]);
        case 'floor': return Math.floor(args[0]);
        case 'ceil': return Math.ceil(args[0]);
        case 'sqrt': return Math.sqrt(args[0]);
        case 'pow': return Math.pow(args[0], args[1]);
        default:
          throw new Error(`Unknown function: ${node.name}`);
      }
    }

    default:
      throw new Error(`Unknown node type`);
  }
}

/**
 * Formula Evaluator Class
 */
export class FormulaEvaluator {
  private cache: Map<string, ASTNode> = new Map();

  /**
   * Validate a formula without executing it
   */
  validate(formula: string): FormulaValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!formula || formula.trim().length === 0) {
      return { valid: false, errors: ['Formula cannot be empty'], warnings: [] };
    }

    // Check for dangerous patterns
    const dangerousPatterns = [
      /\beval\b/i,
      /\bfunction\b/i,
      /\bnew\b/i,
      /\bimport\b/i,
      /\brequire\b/i,
      /\bprocess\b/i,
      /\bglobal\b/i,
      /\bwindow\b/i,
      /\bdocument\b/i,
      /\bfetch\b/i,
      /\bXMLHttpRequest\b/i,
      /\bsetTimeout\b/i,
      /\bsetInterval\b/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(formula)) {
        errors.push(`Formula contains forbidden keyword: ${pattern.source}`);
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors, warnings };
    }

    try {
      const tokens = tokenize(formula);
      const parser = new Parser(tokens);
      parser.parse();

      // Warn about potentially confusing constructs
      if (formula.includes('==') && formula.includes('=') && !formula.includes('==') && !formula.includes('!=')) {
        warnings.push('Use == for equality comparison, not =');
      }

      return { valid: true, errors: [], warnings };
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Invalid formula syntax'],
        warnings,
      };
    }
  }

  /**
   * Evaluate a formula with the given context
   */
  evaluate(formula: string, context: FormulaContext): boolean {
    // Check cache first
    let ast = this.cache.get(formula);
    
    if (!ast) {
      const tokens = tokenize(formula);
      const parser = new Parser(tokens);
      ast = parser.parse();
      this.cache.set(formula, ast);
    }

    const result = evaluate(ast, context);
    return Boolean(result);
  }

  /**
   * Clear the formula cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get list of allowed variables
   */
  getAllowedVariables(): string[] {
    return Array.from(ALLOWED_VARIABLES);
  }

  /**
   * Get list of allowed functions
   */
  getAllowedFunctions(): string[] {
    return Array.from(ALLOWED_FUNCTIONS);
  }
}

export const formulaEvaluator = new FormulaEvaluator();

/**
 * Example formulas:
 * 
 * Simple comparisons:
 *   - "price > ema50"
 *   - "ema50 > ema200"
 *   - "price >= ema200 && ema50 > ema200"
 * 
 * Complex conditions:
 *   - "price > ema50 && ema50 > ema200 && (high - low) < price * 0.02"
 *   - "abs(price - ema200) < ema200 * 0.01"
 *   - "min(high, ema50) > ema200"
 * 
 * Pullback detection:
 *   - "low <= ema200 && price > ema200 && ema50 > ema200"
 * 
 * Crossover detection:
 *   - "price > ema50 && ema50 > ema200"
 */
