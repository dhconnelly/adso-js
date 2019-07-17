"use strict";

// lexical structure
// keyword  := 'if' | 'return' ;
// ident    := [a-z|A-Z]+ ;
// symbol   := '(' | ')' | '{' | '}' | ';' | '<' | '*' | '-' ;
// number   := [0-9]+ ;
// token    := keyword | ident | symbol | number ;

function makeEnum(values) {
    return Object.fromEntries(values.map(val => [val, Symbol.for(val)]));
}

const TokenType = makeEnum([
    "if",
    "return",
    "ident",
    "number",
    "(",
    ")",
    "{",
    "}",
    ";",
    "<",
    "*",
    "-",
    "eof"
]);

class Token {
    constructor(type, contents, line, col) {
        this.type = type;
        this.contents = contents;
        this.line = line;
        this.col = col;
    }

    toString() {
        let sym = Symbol.keyFor(this.type);
        return `Token(${sym}, ${this.contents}, ${this.line}:${this.col}`;
    }
}

class LexingError extends Error {
    constructor(message, line, col) {
        super(`Lexing error at ${line}:${col}: ${message}`);
        this.name = "LexingError";
    }
}

class Lexer {
    constructor(text) {
        this.text = text;
        this.pos = 0;
        this.line = 1;
        this.col = 1;
    }

    emit(type, contents) {
        return new Token(type, contents, this.line, this.col);
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

    static isKeyword(str) {
        return ["return", "if"].includes(str);
    }

    isNumber() {
        if (this.atEnd()) return false;
        let ch = this.peek();
        return "0123456789".includes(ch);
    }

    eatNumber() {
        let number = this.eat();
        while (this.isNumber()) {
            number += this.eat();
        }
        let value;
        try {
            value = parseInt(number, 10);
        } catch (err) {
            throw this.error(`can't parse ${number} as a number`);
        }
        return this.emit(TokenType.number, value);
    }

    isIdent() {
        if (this.atEnd()) return false;
        let ch = this.peek();
        return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
    }

    eatIdent() {
        let ident = this.eat();
        while (this.isIdent()) {
            ident += this.eat();
        }
        if (Lexer.isKeyword(ident)) {
            return this.emit(TokenType[ident], ident);
        } else {
            return this.emit(TokenType.ident, ident);
        }
    }

    eatWhitespace() {
        while (!this.atEnd() && " \n\t".includes(this.peek())) {
            if (this.peek() == "\n") this.line++;
            this.eat();
        }
    }

    next() {
        this.eatWhitespace();
        if (this.atEnd()) {
            return this.emit(TokenType.eof, '\0');
        }
        let ch = this.peek();
        if ("(){};<*-".includes(ch)) {
            return this.emit(TokenType[this.eat()], ch);
        } else if (this.isNumber()) {
            return this.eatNumber();
        } else if (this.isIdent()) {
            return this.eatIdent();
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
    const fs = require("fs");
    const args = process.argv.slice(2);
    if (args.length != 1) {
        fail("Usage: node adso.js <file>");
    }
    const file = args[0];
    let text;
    try {
        text = fs.readFileSync(file, "utf8").trim();
    } catch (err) {
        fail(`failed to read ${file}: ${err}`);
    }
    let lexer = new Lexer(text);
    let tok;
    while (!lexer.atEnd()) {
        try {
            tok = lexer.next();
        } catch (err) {
            fail(`failed to lex ${file}: ${err} ${err.stack}`);
        }
        console.log("token:", tok);
    }
}

main();
