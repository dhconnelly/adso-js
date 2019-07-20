'use strict';

// syntactical structure
// ArithExpr := Expr ('*' | '-') Expr ;
// Expr := number | ident | FnCall | ArithExpr ;
// FnCall := ident '(' Expr ')' ';' ;
// FnCallSt := FnCall ';' ;
// ReturnSt := 'return' expr ';' ;
// IfSt := 'if' '(' Expr ')' '{' body '}' ;
// St := IfSt | ReturnSt | FnCallSt ;
// body := St* ;
// FnDef := ident ident '(' (ident ident)? ')' '{' body '}' ;
// Program := FnDef+ ;

class ParserError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ParserError';
  }
}

function parse(lexer) {
  function ident() {
    let tok = lexer.next();
    if (tok.type !== 'ident') {
      throw new ParserError(`Expected ident, found ${tok}`);
    }
    return tok.value;
  }

  function arithExpr(first_tok) {
    let next = lexer.next();
    let op;
    if (next.value === '*') {
      op = '*';
    } else if (next.value === '-') {
      op = '-';
    } else if (next.value === '<') {
      op = '<';
    } else {
      throw new ParserError(`Expected operation, found ${next}`);
    }
    return {
      type: 'ArithExpr',
      left: first_tok,
      op: op,
      right: expr(),
    };
  }

  function peek() {
    lexer.eatWhitespace();  // hack
    return lexer.peek();
  }

  function expr() {
    let tok = lexer.next();
    if (!['ident', 'number'].includes(tok.type)) {
      throw new ParserError(`Expected expr, found ${tok}`);
    }
    let tok_value = { type: tok.type, value: tok.value };
    if (tok.type === 'ident' && peek() == '(') {
      return fnCallWithName(tok.value);
    } else if (['*', '-', '<'].includes(peek())) {
      return arithExpr(tok_value);
    } else {
      return tok_value;
    }
  }

  function eat(terminal, token) {
    let next = lexer.next();
    for (let [prop, val] of Object.entries(token)) {
      if (next[prop] !== val) {
        let expected = `${val}`;
        let actual = `${next[prop]}`;
        throw new ParserError(
          `failed to parse ${terminal}: ` +
          `expected ${expected}, found ${actual}`);
      }
    }
    return next;
  }

  function fnCallWithName(name) {
    eat('FnCall', { value: '(' });
    let arg = expr();
    eat('FnCall', { value: ')' });
    return {
      type: 'FnCall',
      fn_name: name,
      arg: arg,
    };
  }

  function fnCall() {
    return fnCallWithName(ident());
  }

  function returnSt() {
    let value = expr();
    eat('ReturnSt', { value: ';' });
    return {
      type: 'ReturnSt',
      value: value,
    };
  }

  function until(ch, fn) {
    let results = [];
    while (peek() !== ch) results.push(fn());
    return results;
  }

  function ifSt() {
    eat('IfSt', { value: '(' });
    let condition = expr();
    eat('IfSt', { value: ')' });
    eat('IfSt', { value: '{' });
    let body = until('}', statement);
    eat('IfSt', { value: '}' });
    return {
      type: 'IfSt',
      condition: condition,
      body: body,
    };
  }

  function statement() {
    let tok = lexer.next();
    if (!['keyword', 'ident'].includes(tok.type)) {
      throw new ParserError(`expected statement, found ${tok}`);
    }
    switch (tok.value) {
      case 'if': return ifSt();
      case 'return': return returnSt();
      default: {
        let st = fnCallWithName(tok.value);
        eat('St', { value: ';' });
        return st;
      }
    }
  }

  function fnDef() {
    let ret_type = ident();
    let name = ident();
    eat('FnDef', { value: '(' });
    let param_type = null;
    let param_name = null;
    if (peek() !== ')') {
      param_type = ident();
      param_name = ident();
    }
    eat('FnDef', { value: ')' });
    eat('FnDef', { value: '{' });
    let body = until('}', statement);
    eat('FnDef', { value: '}' });
    return {
      type: 'FnDef',
      return_type: ret_type,
      name: name,
      param_type: param_type,
      param_name: param_name,
      body: body,
    };
  }

  function program() {
    let body = [];
    while (!lexer.atEnd()) {
      body.push(fnDef());
    }
    return {
      type: 'Program',
      body: body,
    };
  }

  return program();
}

// lexical structure
// keyword  := 'if' | 'return' ;
// ident    := [a-z|A-Z]+ ;
// symbol   := '(' | ')' | '{' | '}' | ';' | '<' | '*' | '-' ;
// number   := [0-9]+ ;
// token    := keyword | ident | symbol | number ;

class LexingError extends Error {
  constructor(message, line, col) {
    super(`Lexing error at ${line}:${col}: ${message}`);
    this.name = 'LexingError';
  }
}

class Lexer {
  constructor(text) {
    this.text = text;
    this.pos = 0;
    this.line = 1;
    this.col = 1;
  }

  emit(token) {
    return Object.assign(token, {
      line: this.line,
      col: this.col,
      toString() { return JSON.stringify(this); },
    });
  }

  error(message) {
    return new LexingError(message, this.line, this.col);
  }

  peek() {
    return this.text[this.pos];
  }

  eat() {
    this.col++;
    return this.text[this.pos++];
  }

  isNumber() {
    if (this.atEnd()) return false;
    let ch = this.peek();
    return '0123456789'.includes(ch);
  }

  scanNumber() {
    let number = this.eat();
    while (this.isNumber()) {
      number += this.eat();
    }
    try {
      return parseInt(number, 10);
    } catch (err) {
      throw this.error(`can't parse ${number} as a number`);
    }
  }

  isIdent() {
    if (this.atEnd()) return false;
    let ch = this.peek();
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
  }

  scanIdent() {
    let ident = this.eat();
    while (this.isIdent()) {
      ident += this.eat();
    }
    return ident;
  }

  eatWhitespace() {
    while (!this.atEnd() && ' \n\t'.includes(this.peek())) {
      if (this.peek() == '\n') {
        this.line++;
        this.col = 0;
      }
      this.eat();
    }
  }

  next() {
    this.eatWhitespace();
    if (this.atEnd()) {
      return this.emit({ type: 'eof', value: 'eof' });
    }
    let ch = this.peek();
    if ('(){};<*-'.includes(ch)) {
      return this.emit({ type: 'symbol', value: this.eat() });
    } else if (this.isNumber()) {
      return this.emit({ type: 'number', value: this.scanNumber() });
    } else if (this.isIdent()) {
      let ident = this.scanIdent();
      let type = ['if', 'return'].includes(ident) ? 'keyword' : 'ident';
      return this.emit({ type: type, value: ident });
    }
    throw this.error(`Invalid lexical element starting with ${ch}`);
  }

  atEnd() {
    return this.pos >= this.text.length;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const util = require('util');

function main() {
  const fs = require('fs');
  const args = process.argv.slice(2);
  if (args.length != 1) {
    fail('Usage: node adso.js <file>');
  }
  const file = args[0];
  let text;
  try {
    text = fs.readFileSync(file, 'utf8').trim();
  } catch (err) {
    fail(`failed to read ${file}: ${err}`);
  }
  let lexer = new Lexer(text);
  let ast = parse(lexer);
  console.log(util.inspect(ast, { depth: null }));
}

main();
