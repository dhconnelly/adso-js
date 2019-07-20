'use strict';

const util = require('util');

function assert(val, msg='') {
  if (!val) {
    throw new Error(`assertion error: ${val} (${msg})`);
  }
}

class InterpreterError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InterpreterError';
  }
}

class Interpreter {
  constructor() {
    this.scope = { bindings: {
      print: {
        type: 'BuiltInFn',
        param_type: 'int',
        value: function(obj) {
          console.log(obj.value);
        },
      }
    } };
    this.stack = [];
  }

  pushScope() {
    let scope = { bindings: {} };
    if (this.scope) {
      scope.up = this.scope;
    }
    this.scope = scope;
  }

  popScope() {
    this.scope = this.scope.up;
  }

  visitArithExpr(expr) {
    let leftValue;
    switch (expr.left.type) {
      case 'number': {
        leftValue = expr.left.value;
        break;
      }
      case 'ident': {
        let binding = this.lookup(expr.left.value);
        if (binding.type !== 'int') {
          throw new InterpreterError(
            `bad binding ${util.inspect(binding)} ` +
            `in expr ${util.inspect(expr)}`);
        }
        leftValue = binding.value;
        break;
      }
      default:
        throw new InterpreterError(
          `bad left ${util.inspect(expr.left)} ` +
          `in expr ${util.inspect(expr)}`);
    }
    this.visitExpr(expr.right);
    let right = this.stack.pop();
    assert(
      right.type === 'int',
      `bad right ${util.inspect(right)} ` +
      `in expr ${util.inspect(expr)}`);
    let rightValue = right.value;
    switch (expr.op) {
      case '<': return this.stack.push({
        type: 'bool',
        value: leftValue < rightValue,
      });
      case '*': return this.stack.push({ 
        type: 'int', 
        value: leftValue * rightValue 
      });
      case '-': return this.stack.push({ 
        type: 'int', 
        value: leftValue - rightValue 
      });
    }
  }

  visitExpr(expr) {
    switch (expr.type) {
      case 'number': {
        return this.stack.push({
          type: 'int',
          value: expr.value,
        });
      }
      case 'ident': {
        let binding = this.lookup(expr.value);
        return this.stack.push(binding);
      }
      case 'FnCall': return this.visitFnCall(expr);
      case 'ArithExpr': return this.visitArithExpr(expr);
    }
    assert(false);
  }

  visitFnDef(fnDef) {
    this.scope.bindings[fnDef.name] = fnDef;
  }

  checkType(fnDef, argValue) {
    if (!fnDef.param_type && argValue) {
      throw new InterpreterError(
        `no arg expected for ${util.inspect(fnDef)}, got ${argValue.type}`);
    } else if (fnDef.param_type && !argValue) {
      throw new InterpreterError(`no fn arg given for ${util.inspect(fnDef)}`);
    } else if (fnDef.param_type !== argValue.type ) {
      let expected = fnDef.param_type;
      let actual = argValue.type;
      throw new InterpreterError(
        `type mismatch for fn ${util.inspect(fnDef)}, ` +
        `arg ${util.inspect(argValue)}`);
    }
  }

  visitReturnSt(returnSt) {
    this.visitExpr(returnSt.value);
    throw { type: 'ReturnValue', value: this.stack.pop() };
  }

  visitIfSt(ifSt) {
    this.visitExpr(ifSt.condition);
    let condition = this.stack.pop();
    if (condition.type !== 'bool') {
      throw new InterpreterError(
        `if condition not bool: ${util.inspect(condition)}`);
    }
    if (condition.value) {
      ifSt.body.forEach((node) => this.visitSt(node));
    }
  }

  visitSt(st) {
    switch (st.type) {
      case 'IfSt': return this.visitIfSt(st);
      case 'ReturnSt': return this.visitReturnSt(st);
      case 'FnCall': return this.visitFnCall(st);
    }
  }

  lookup(name, scope=this.scope) {
    let binding = scope.bindings[name];
    if (binding) {
      return binding;
    } else if (!binding && scope.up) {
      return this.lookup(name, scope.up);
    } else {
      throw new InterpreterError(`${name} is unbound`);
    }
  }

  visitFnCall(fnCall) {
    let fnDef = this.lookup(fnCall.name);
    if (!['BuiltInFn', 'FnDef'].includes(fnDef.type)) {
      throw new InterpreterError(`not a function: ${fnCall.name}`);
    }
    let argValue;
    if (fnCall.arg) {
      this.visitExpr(fnCall.arg);
      argValue = this.stack.pop();
    }
    if (fnCall.arg || fnDef.param_type ) {
      this.checkType(fnDef, argValue);
    }
    this.pushScope();
    if (fnCall.arg) {
      this.scope.bindings[fnDef.param_name] = argValue;
    }
    if (fnDef.type === 'FnDef') {
      try {
        fnDef.body.forEach((st) => this.visitSt(st));
      } catch (err) {
        if (!err.type || err.type !== 'ReturnValue') {
          throw err;
        } else {
          this.stack.push(err.value);
        }
      }
    } else {
      assert(fnDef.type === 'BuiltInFn');
      fnDef.value(argValue);
    }
    this.popScope();

    // get the return value and re-push it to be explicit
    let retVal = this.stack.pop();
    this.stack.push(retVal);
  }
}

function visit(ast, visitor) {
  ast.body.forEach((node) => {
    switch (node.type) {
      case 'FnDef': return visitor.visitFnDef(node);
      case 'FnCall': return visitor.visitFnCall(node);
    }
  });
}

function interpret(ast) {
  ast.body.push({ type: 'FnCall', name: 'main', arg: null });
  visit(ast, new Interpreter());
}

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
      name: name,
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
  interpret(ast);
}

main();
