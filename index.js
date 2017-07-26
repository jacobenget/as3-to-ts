/*jshint node:true*/

var Parser = require('./lib/parse/parser'),
    parse = require('./lib/parse'),
    Scanner = require('./lib/parse/scanner'),
    Emitter = require('./lib/emit/emitter'),
    KeyWords = require('./lib/syntax/keywords'),
    Operators = require('./lib/syntax/operators'),
    NodeKind = require('./lib/syntax/nodeKind');

Parser.parse = parse;

module.exports = {
    Parser: Parser,
    Scanner: Scanner,
    Emitter: Emitter,
    KeyWords: KeyWords,
    Operators: Operators,
    NodeKind: NodeKind
};


