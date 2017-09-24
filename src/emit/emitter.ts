import NodeKind, { nodeKindName } from '../syntax/nodeKind';
import * as Keywords from '../syntax/keywords';
import Node, { createNode } from '../syntax/node';
import assign = require('object-assign');
import { CustomVisitor } from '../custom-visitors';
import { VERBOSE, WARNINGS } from '../config';
import * as Operators from '../syntax/operators';
import * as assert from 'assert';

const util = require('util');

export const GLOBAL_NAMES = [
    'undefined',
    'NaN',
    'Infinity',
    'Array',
    'Boolean',
    'decodeURI',
    'decodeURIComponent',
    'encodeURI',
    'encodeURIComponent',
    'escape',
    'int',
    'isFinite',
    'isNaN',
    'isXMLName',
    'Number',
    'Object',
    'parseFloat',
    'parseInt',
    'String',
    'trace',
    'uint',
    'unescape',
    'Vector',
    'arguments',
    'Class',
    'Date',
    'Function',
    'Math',
    'RegExp',
    'JSON',
    'Error',
    'EvalError',
    'RangeError',
    'ReferenceError',
    'SyntaxError',
    'TypeError',
    'URIError',
    'Element',
    'DOMParser',
    'Document',
    'Node',
    'Attr'
];

export const TYPE_REMAP: { [id: string]: string } = {
    Class: 'any', // 80pro: was mapped to 'Object' before
    Object: 'any',
    String: 'string',
    Boolean: 'boolean',
    Number: 'number',
    int: 'number',
    uint: 'number',
    '*': 'any',
    Array: 'any[]',
    Dictionary: 'Object', // 80pro: was mapped to 'Map<any, any>' before

    // Inexistent errors
    ArgumentError: 'Error',
    DefinitionError: 'Error',
    SecurityError: 'Error',
    VerifyError: 'Error'
};

// TODO: improve me (used only on emitType())
export const TYPE_REMAP_VALUES = ['void'];
for (var k in TYPE_REMAP) {
    TYPE_REMAP_VALUES.push(TYPE_REMAP[k]);
}

const IDENTIFIER_REMAP: { [id: string]: string } = {
    Dictionary: 'Object',
    
    // Inexistent errors
    ArgumentError: 'Error',
    DefinitionError: 'Error',
    SecurityError: 'Error',
    VerifyError: 'Error'
};

interface Scope {
    parent: Scope;
    declarations: Declaration[];
    className?: string;
}

interface Declaration {
    name: string;
    type?: string;
    bound?: string;
}

export interface EmitterOptions {
    lineSeparator: string;
    useNamespaces: boolean;
    customVisitors: CustomVisitor[];
    definitionsByNamespace?: { [ns: string]: string[] };
}

interface NodeVisitor {
    (emitter: Emitter, node: Node): void;
}

const VISITORS: { [kind: number]: NodeVisitor } = {
    [NodeKind.PACKAGE]: emitPackage,
    [NodeKind.META]: emitMeta,
    [NodeKind.IMPORT]: emitImport,
    [NodeKind.EMBED]: emitEmbed,
    [NodeKind.USE]: emitUse,
    [NodeKind.FUNCTION]: emitFunction,
    [NodeKind.LAMBDA]: emitFunction,
    [NodeKind.FOREACH]: emitForEach,
    [NodeKind.FORIN]: emitForIn,
    [NodeKind.INTERFACE]: emitInterface,
    [NodeKind.CLASS]: emitClass,
    [NodeKind.VECTOR]: emitVector,
    [NodeKind.SHORT_VECTOR]: emitShortVector,
    [NodeKind.TYPE]: emitType,
    [NodeKind.CALL]: emitCall,
    [NodeKind.CATCH]: emitCatch,
    [NodeKind.NEW]: emitNew,
    [NodeKind.RELATION]: emitRelation,
    [NodeKind.OP]: emitOp,
    [NodeKind.OR]: emitOr,
    [NodeKind.IDENTIFIER]: emitIdent,
    [NodeKind.XML_LITERAL]: emitXMLLiteral,
    [NodeKind.CONST_LIST]: emitConstList,
    [NodeKind.NAME_TYPE_INIT]: emitNameTypeInit,
    [NodeKind.VALUE]: emitObjectValue,
    [NodeKind.DOT]: emitDot,
    [NodeKind.LITERAL]: emitLiteral,
    [NodeKind.ARRAY]: emitArray,
    [NodeKind.ARRAY_ACCESSOR]: emitArrayAccessor,
    [NodeKind.BREAK]: emitLoopBranch,
    [NodeKind.CONTINUE]: emitLoopBranch,
    [NodeKind.ASSIGN]: emitAssignment,
    [NodeKind.BLOCK]: emitBlock,
};

export function visitNodes(emitter: Emitter, nodes: Node[]): void {
    if (nodes) {
        nodes.forEach(node => visitNode(emitter, node));
    }
}

export function visitNode(emitter: Emitter, node: Node): void {
    if (!node) {
        return;
    }

    // use custom visitor. allow custom node manipulation
    for (let i = 0, l = emitter.options.customVisitors.length; i < l; i++) {
        let customVisitor = emitter.options.customVisitors[i];
        if (customVisitor.visit(emitter, node) === true) {
            return;
        }
    }

    let visitor =
        VISITORS[node.kind] ||
        function(emitter: Emitter, node: Node): void {
            emitter.catchup(node.start);
            visitNodes(emitter, node.children);
        };

    if (VERBOSE >= 2 && VISITORS[node.kind]) {
        console.log(
            'visit:' +
                VISITORS[node.kind].name +
                '() <====================================='
        );
        console.log('node: ' + node.toString());
    }
    visitor(emitter, node);
}

function filterAST(node: Node): Node {
    function isInteresting(child: Node): boolean {
        // we don't care about comment
        return (
            !!child &&
            child.kind !== NodeKind.AS_DOC &&
            child.kind !== NodeKind.MULTI_LINE_COMMENT
        );
    }

    let newNode = createNode(
        node.kind,
        node,
        ...node.children.filter(isInteresting).map(filterAST)
    );

    newNode.children.forEach(child => (child.parent = newNode));

    return newNode;
}

export class ImportStatement {
    public constructor(public identifier: string, public source: string) {}
}

export default class Emitter {
    public isNew: boolean = false;

    private _emitThisForNextIdent: boolean = true;
    get emitThisForNextIdent(): boolean {
        return this._emitThisForNextIdent;
    }
    set emitThisForNextIdent(val: boolean) {
        this._emitThisForNextIdent = val;
    }

    public source: string;
    public options: EmitterOptions;

    public extraImportsNeeded: ImportStatement[] = [];

    public output: string = '';
    public index: number = 0;

    public rootScope: Scope = null;
    public scope: Scope = null;

    // public dotChainDepth: number = 0;

    constructor(source: string, options?: EmitterOptions) {
        this.source = source;
        this.options = assign(
            {
                includePath: '',
                lineSeparator: '\n',
                useNamespaces: false,
                customVisitors: []
            },
            options || {}
        );
    }

    emit(ast: Node): string {
        if (VERBOSE >= 1) {
            console.log('emit() ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑');
        }

        this.withScope([], rootScope => {
            this.rootScope = rootScope;
            visitNode(this, filterAST(ast));
            this.catchup(this.source.length - 1);
        });

        // notify all customVisitors about the extra imports that were needed,
        // if the CustomVisitor wishes to hear about this information
        this.options.customVisitors.forEach((visitor: CustomVisitor) => {
            if (visitor.respondToExtraImportsNeeded) {
                visitor.respondToExtraImportsNeeded(this.extraImportsNeeded);
            }
        });

        let headOutput = this.extraImportsNeeded
            .map(extraImportsNeeded => {
                return `import { ${extraImportsNeeded.identifier} } from "${extraImportsNeeded.source}";`;
            })
            .join('\n');

        if (headOutput.length > 0) {
            headOutput += '\n';
        }

        return headOutput + this.output;
    }

    enterScope(declarations: Declaration[]): Scope {
        return (this.scope = { parent: this.scope, declarations });
    }

    exitScope(checkScope: Scope = null): void {
        if (checkScope && this.scope !== checkScope) {
            throw new Error('Mismatched enterScope() / exitScope().');
        }
        if (!this.scope) {
            throw new Error('Unmatched exitScope().');
        }
        this.scope = this.scope.parent;
    }

    withScope(declarations: Declaration[], body: (scope: Scope) => void): void {
        let scope = this.enterScope(declarations);
        try {
            body(scope);
        } finally {
            this.exitScope(scope);
        }
    }

    get currentClassName(): string {
        for (var scope = this.scope; scope; scope = scope.parent) {
            if (scope.className) {
                return scope.className;
            }
        }
        return null;
    }

    declareInScope(declaration: Declaration): void {
        let previousDeclaration: Declaration = null;
        for (var i = 0, len = this.scope.declarations.length; i < len; i++) {
            if (this.scope.declarations[i].name === declaration.name) {
                previousDeclaration = this.scope.declarations[i];
            }
        }

        if (previousDeclaration) {
            if (declaration.type !== undefined)
                previousDeclaration.type = declaration.type;
            if (declaration.bound !== undefined)
                previousDeclaration.bound = declaration.bound;
        } else {
            this.scope.declarations.push(declaration);
        }
    }

    findDefInScope(text: string): Declaration {
        let scope = this.scope;
        while (scope) {
            for (let i = 0; i < scope.declarations.length; i++) {
                if (scope.declarations[i].name === text) {
                    return scope.declarations[i];
                }
            }
            scope = scope.parent;
        }
        return null;
    }

    commentNode(node: Node, catchSemi: boolean): void {
        this.catchup(node.start);
        this.insert('/*');
        const source = this.sourceBetween(this.index, node.end).replace(
            /\*\//g,
            ''
        );
        this.insert(source);
        this.skipTo(node.end);

        let index = this.index;
        if (catchSemi) {
            while (true) {
                if (index >= this.source.length) {
                    break;
                }
                if (this.source[index] === '\n') {
                    this.catchup(index);
                    break;
                }
                if (this.source[index] === ';') {
                    this.catchup(index + 1);
                    break;
                }
                index++;
            }
        }
        this.insert('*/');
    }

    catchup(index: number): void {
        if (this.index >= index) {
            return;
        }
        let text = this.sourceBetween(this.index, index);
        this.index = index;
        this.insert(text);
    }

    sourceBetween(start: number, end: number) {
        return this.source.substring(start, end);
    }

    skipTo(index: number): void {
        this.index = index;
    }

    skip(number: number): void {
        this.index += number;
    }

    insert(str: string): void {
        this.output += str;

        // Debug util (comment out on production).
        // let split = this.output.split(" ");
        // let lastWord = split[split.length - 1];
        // console.log("    emitter.ts - output += " + lastWord);
        // process.stdout.write(" " + lastWord);
        // console.log("+++++++++ " + (string.indexOf("for(") !== -1));
        if (VERBOSE >= 2) {
            console.log('output (all): ' + this.output);
            // let a = 1; // insert breakpoint here
        }
    }

    consume(string: string, limit: number): void {
        let index = this.source.indexOf(string, this.index) + string.length;
        if (index > limit || index < this.index) {
            throw new Error('invalid consume');
        }
        this.index = index;
    }

    /**
     * Utilities
     */
    ensureImportIdentifier(
        identifier: string,
        from = `./${identifier}`,
        checkGlobals: boolean = true
    ): void {
        // warning if this is a as3-path, not a plain name (like shared.Node should error)
        if (WARNINGS >= 1 && identifier.split('.').length > 1) {
            console.log(
                `emitter.ts: *** MAJOR WARNING *** ensureImportIdentifier() => : invalid object name identifier: ${identifier}`
            );
        }

        let isGloballyAvailable = checkGlobals
            ? GLOBAL_NAMES.indexOf(identifier) >= 0
            : false;

        // change to root scope temporarily
        let previousScope = this.scope;
        this.scope = this.rootScope;

        // Ensure this file is not declaring this class
        if (
            new RegExp(`class\\s+${identifier}\\s`).test(this.source) ===
                false &&
            !isGloballyAvailable &&
            !this.findDefInScope(identifier)
        ) {
            this.extraImportsNeeded.push(new ImportStatement(identifier, from));
            this.declareInScope({ name: identifier });
        }

        // change back to previous scope
        this.scope = previousScope;
    }

    getTypeRemap(text: string): string {
        for (let i = 0, l = this.options.customVisitors.length; i < l; i++) {
            let customVisitor = this.options.customVisitors[i];
            if (customVisitor.typeMap && customVisitor.typeMap[text]) {
                return customVisitor.typeMap[text];
            }
        }
        return TYPE_REMAP[text];
    }

    getIdentifierRemap(text: string): string {
        for (let i = 0, l = this.options.customVisitors.length; i < l; i++) {
            let customVisitor = this.options.customVisitors[i];
            if (
                customVisitor.identifierMap &&
                customVisitor.identifierMap[text]
            ) {
                return customVisitor.identifierMap[text];
            }
        }
        return IDENTIFIER_REMAP[text];
    }
}

function emitPackage(emitter: Emitter, node: Node): void {
    if (emitter.options.useNamespaces) {
        emitter.catchup(node.start);
        emitter.skip(Keywords.PACKAGE.length);
        emitter.insert('namespace');
        visitNodes(emitter, node.children);
    } else {
        emitter.catchup(node.start);

        // skip to just past the opening left curly bracket
        emitter.skipTo(
            emitter.source.indexOf(Operators.LEFT_CURLY_BRACKET, node.start) + 1
        );

        let indexBeforePackageContents = emitter.output.length;

        visitNodes(emitter, node.children);

        let indexAfterPackageContents = emitter.output.length;

        // because we're removing the 'package' declaration and, therefore, a logical scoping/indentation level,
        // physically remove any addition indentation this package scope introduced

        // pull out all lines added by visiting the package contents
        let linesInPackageContents = emitter.output
            .substring(indexBeforePackageContents)
            .split('\n');

        // ignore the first line, which is the line that contains the package's left curly bracket, and should just contain whitespace
        let lineContainingLeftCurlyBracket = linesInPackageContents[0];
        linesInPackageContents.shift();

        let linesBeginningWithExportModifer = linesInPackageContents.filter(
            line => /^\s*export/.test(line)
        );

        if (!/^\s*$/.test(lineContainingLeftCurlyBracket)) {
            if (WARNINGS >= 1) {
                console.log(
                    `emitter.ts: *** MINOR WARNING *** emitPackage() => : package open curly bracket isn't only followed by whitespace, which is unexpected. Result: package indentation not corrected`
                );
            }
        } else if (linesBeginningWithExportModifer.length == 0) {
            if (WARNINGS >= 1) {
                console.log(
                    `emitter.ts: *** MINOR WARNING *** emitPackage() => : no lines in the package definition begin with 'export', which is unexpected. Result: package indentation not corrected`
                );
            }
        } else {
            // and remove the leading whitespace from all lines
            let leftPaddingToRemove = linesBeginningWithExportModifer[0].match(
                /^(\s*)export/
            )[1];
            let regexMatchingLeftPadding = RegExp('^' + leftPaddingToRemove);
            let linesWithLeftPaddingRemoved = linesInPackageContents.map(line =>
                line.replace(regexMatchingLeftPadding, '')
            );
            let adjustedLinesInPackageContents = linesWithLeftPaddingRemoved.join(
                '\n'
            );
            emitter.output =
                emitter.output.substring(0, indexBeforePackageContents) +
                adjustedLinesInPackageContents;
        }

        emitter.catchup(node.end - 1); // catchup to *just* before the closing bracket of the package declaration
        emitter.skip(1); // skip the closing bracket
    }
}

function emitMeta(emitter: Emitter, node: Node): void {
    emitter.catchup(node.start);

    if (emitter.index === node.start) {
        emitter.commentNode(node, false);
    } else {
        // emitter is already past this node's starting point,
        // which can happen because some statements (e.g. imports) can appear between metadata and the thing the metadata decorates,
        // which means the other statement (e.g. the import) has been emitted, moving the emitter well past the point where this metadata appears in the source (e.g. it appears before the 'import'),
        // likely meaning that the text in the source for this metadata was just skipped and faithfully copied to the output,
        // meaning that we just have to find this text as it already exists in the output and 'comment' it there
        let metaToComment = emitter.sourceBetween(node.start, node.end);
        let startInOutput = emitter.output.lastIndexOf(metaToComment);
        if (startInOutput === -1) {
            if (WARNINGS >= 1) {
                console.log(
                    `emitter.ts: *** MAJOR WARNING *** emitMeta() => : attempted to comment metadata '${metaToComment}' but emitter has already emitted output past this point, and this text in metadata in question doesn't already appear in the output.  No idea what could cause this`
                );
            }
        } else {
            emitter.output =
                emitter.output.slice(0, startInOutput) +
                '/*' +
                metaToComment +
                '*/' +
                emitter.output.slice(startInOutput + metaToComment.length);
        }
    }
}

function emitUse(emitter: Emitter, node: Node): void {
    emitter.catchup(node.start);
    emitter.commentNode(node, false);
}

function emitEmbed(emitter: Emitter, node: Node): void {
    emitter.catchup(node.start);
    emitter.commentNode(node, false);
}

function emitImport(emitter: Emitter, node: Node): void {
    let statement = Keywords.IMPORT + ' ';

    // emit one import statement for each definition found in that namespace
    if (node.text.indexOf('*') !== -1) {
        let ns = node.text.substring(0, node.text.length - 2);
        let definitions = emitter.options.definitionsByNamespace[ns];

        let skipTo = node.end;

        if (definitions && definitions.length > 0) {
            emitter.catchup(node.start); // to ensure that left padding on the '*' import is correctly recognized and duplicated across all generated imports below
            let leftPadding = /[ \t]*$/.exec(emitter.output)[0]; // all trailing whitespace

            definitions.forEach(definition => {
                let importNode = createNode(node.kind, node);
                importNode.text = `${ns}.${definition}`;
                importNode.parent = node.parent;
                emitImport(emitter, importNode);
                emitter.insert(';\n' + leftPadding);
            });

            skipTo = node.end + Keywords.IMPORT.length + 2;
        } else {
            emitter.catchup(node.start);
            node.end += node.text.length - ns.length + 6;
            emitter.commentNode(node, true);
            skipTo = node.end;
            if (WARNINGS >= 1) {
                console.log(
                    `emitter.ts: *** MINOR WARNING *** emitImport() => : nothing found to import on namespace ${ns}. (import ${node.text})`
                );
            }
        }

        emitter.skipTo(skipTo);
        return;
    }

    let text = node.text.concat();
    let hasCustomVisitor = false;

    // apply custom visitor import maps
    for (let i = 0, l = emitter.options.customVisitors.length; i < l; i++) {
        let customVisitor = emitter.options.customVisitors[i];
        if (customVisitor.imports) {
            hasCustomVisitor = true;
            customVisitor.imports.forEach((replacement, regexp) => {
                text = text.replace(regexp, replacement);
            });
        }
    }

    // // apply "bridge" translation
    // if (emitter.hasBridge && emitter.options.bridge.imports) {
    //     text = node.text.concat();
    //     emitter.options.bridge.imports.forEach((replacement, regexp) => {
    //         text = text.replace(regexp, replacement);
    //     });
    // }

    if (emitter.options.useNamespaces) {
        emitter.catchup(node.start);
        emitter.insert(statement);

        let split = node.text.split('.');
        let name = split[split.length - 1];
        emitter.insert(name + ' = ');

        // apply custom visitor translation
        if (hasCustomVisitor) {
            let diff = node.text.length - text.length;

            emitter.insert(text);
            emitter.skipTo(node.end);
        } else {
            emitter.catchup(node.end);
        }

        emitter.declareInScope({ name });
    } else {
        emitter.catchup(node.start);
        emitter.insert(Keywords.IMPORT + ' ');

        let split = text.split('.');
        let name = split.pop();

        // Find current module name to output relative import
        let currentModule = '';
        let parentNode = node.parent;
        while (parentNode) {
            if (parentNode.kind === NodeKind.PACKAGE) {
                currentModule = parentNode.children[0].text;
                break;
            }
            parentNode = parentNode.parent;
        }

        // const importPath = getRelativePath(currentModule.split("."), text.split("."));
        const importPath = text.replace(/\./g, '/');

        text = `{ ${name} } from "${importPath}"`;
        emitter.insert(text);
        emitter.skipTo(node.end);
        emitter.declareInScope({ name });
    }
}

function getRelativePath(currentPath: string[], targetPath: string[]) {
    while (currentPath.length > 0 && targetPath[0] === currentPath[0]) {
        currentPath.shift();
        targetPath.shift();
    }

    let relative =
        currentPath.length === 0 ? '.' : currentPath.map(() => '..').join('/');

    return `${relative}/${targetPath.join('/')}`;
}

function getDeclarationType(emitter: Emitter, node: Node): string {
    let declarationType: string = null;
    let typeNode = node && node.findChild(NodeKind.TYPE);

    if (typeNode) {
        declarationType = emitter.getTypeRemap(typeNode.text) || typeNode.text;
    }

    return declarationType;
}

function emitInterface(emitter: Emitter, node: Node): void {
    emitDeclaration(emitter, node);

    //we'll catchup the other part
    emitter.declareInScope({
        name: node.findChild(NodeKind.NAME).text
    });

    // ensure extends identifiers are being imported
    let extendsNodes = node.findChildren(NodeKind.EXTENDS);
    extendsNodes.forEach(extendsNode => {
        emitter.ensureImportIdentifier(extendsNode.text);
    });

    let content = node.findChild(NodeKind.CONTENT);
    let contentsNode = content && content.children;
    let foundVariables: { [name: string]: boolean } = {};
    if (contentsNode) {
        contentsNode.forEach(node => {
            visitNode(emitter, node.findChild(NodeKind.META_LIST));
            emitter.catchup(node.start);
            let type = node.findChild(NodeKind.TYPE) || node.children[2];

            if (node.kind === NodeKind.TYPE && node.text === 'function') {
                emitter.skip(Keywords.FUNCTION.length + 1);
                visitNode(emitter, node.findChild(NodeKind.PARAMETER_LIST));
                visitNode(emitter, type);
            } else if (
                node.kind === NodeKind.GET ||
                node.kind === NodeKind.SET
            ) {
                let name = node.findChild(NodeKind.NAME);
                let parameterList = node.findChild(NodeKind.PARAMETER_LIST);
                if (!foundVariables[name.text]) {
                    emitter.skipTo(name.start);
                    emitter.catchup(name.end);
                    foundVariables[name.text] = true;

                    if (node.kind === NodeKind.GET) {
                        emitter.skipTo(parameterList.end);
                        if (type) {
                            visitNode(emitter, type);
                        }
                    } else if (node.kind === NodeKind.SET) {
                        let parameterNode = parameterList.findChild(
                            NodeKind.PARAMETER
                        );
                        let nameTypeInit = parameterNode.findChild(
                            NodeKind.NAME_TYPE_INIT
                        );
                        emitter.skipTo(
                            nameTypeInit.findChild(NodeKind.NAME).end
                        );
                        type = nameTypeInit.findChild(NodeKind.TYPE);
                        if (type) {
                            visitNode(emitter, type);
                        }
                        emitter.skipTo(node.end);
                    }
                } else {
                    emitter.commentNode(node, true);
                }
            } else {
                //include or import or metadata in interface content not supported
                emitter.commentNode(node, true);
            }
        });
    }
}

function getFunctionDeclarations(emitter: Emitter, node: Node): Declaration[] {
    let decls: Declaration[] = [];
    let params = node.findChild(NodeKind.PARAMETER_LIST);
    if (params && params.children.length) {
        decls = params.children.map(param => {
            let nameTypeInit = param.findChild(NodeKind.NAME_TYPE_INIT);
            if (nameTypeInit) {
                return {
                    name: nameTypeInit.findChild(NodeKind.NAME).text,
                    type: getDeclarationType(emitter, nameTypeInit)
                };
            }
            let rest = param.findChild(NodeKind.REST);
            return { name: rest.text };
        });
    }
    let block = node.findChild(NodeKind.BLOCK);
    if (block) {
        function traverse(node: Node): Declaration[] {
            let result: Declaration[] = [];
            if (
                node.kind === NodeKind.VAR_LIST ||
                node.kind === NodeKind.CONST_LIST ||
                node.kind === NodeKind.VAR ||
                node.kind === NodeKind.CONST
            ) {
                result = result.concat(
                    node.findChildren(NodeKind.NAME_TYPE_INIT).map(node => ({
                        name: node.findChild(NodeKind.NAME).text
                    }))
                );
            }
            if (
                node.kind !== NodeKind.FUNCTION &&
                node.kind !== NodeKind.LAMBDA &&
                node.children &&
                node.children.length
            ) {
                result = Array.prototype.concat.apply(
                    result,
                    node.children.map(traverse)
                );
            }
            return result.filter(decl => !!decl);
        }

        decls = decls.concat(traverse(block));
    }
    return decls;
}

export function hasStaticModifer(setOrGetNode: Node): boolean {
    return (
        setOrGetNode
            .findChild(NodeKind.MOD_LIST)
            .findChildren(NodeKind.MODIFIER)
            .filter(modifier => modifier.text === Keywords.STATIC).length > 0
    );
}

function emitFunction(emitter: Emitter, node: Node): void {
    assert(node.kind === NodeKind.FUNCTION || node.kind === NodeKind.LAMBDA);

    // figure out if we are we inside a class function definition
    // Note: "ActionScript 3.0 supports neither nested nor private classes" (http://help.adobe.com/en_US/ActionScript/3.0_ProgrammingAS3/WS5b3ccc516d4fbf351e63e3d118a9b90204-7f9e.html)
    // so if we're inside a class function definition we must be inside only ONE class function definition, and we can just find the first one
    let classFunctionContainingThisFunction = node
        .getParentChain()
        .find(ancestor => {
            if (ancestor.kind === NodeKind.FUNCTION) {
                return (
                    // Note: Nodes with kind NodeKind.FUNCTION always have two generations of parents, so checking for null/undefined in the accessors below is unnecessary
                    ancestor.parent.kind === NodeKind.CONTENT &&
                    ancestor.parent.parent.kind == NodeKind.CLASS
                );
            }
            return false;
        });

    if (node.text != null) {
        emitter.declareInScope({ name: node.text });
    }

    if (
        !(
            typeof classFunctionContainingThisFunction === 'undefined' ||
            hasStaticModifer(classFunctionContainingThisFunction)
        )
    ) {
        // we're emitting a function that's defined inside a member function,
        // meaning that the object that this member function is being called upon has its member variables in scope,
        // so we should transform this function declaration into a fat arrow function to capture the value of 'this'
        // (elsewhere, the emitter will be prepending 'this' to references to variables that weren't defined locally)
        // NOTE: this choice to transform the lambda expression into a fat arrow function is likely wrong if the lambda body already references 'this',
        // TODO: detect this usage of 'this' inside the body and avoid such a transformation to a fat arrow function,
        // such functions in ActionScript will only become correct TypeScript if they don't reference the 'this' instance in the lambda statement's scope through the scope chain,
        // but instead assign that value to something like 'self' in the scope where the lambda is declared and then access this value in the lambda body through 'self'.

        // assert that there is no reason to call 'emitDeclaration', because there's no metadata or modifications on this function
        assert(node.findChild(NodeKind.META_LIST) === null);
        assert(node.findChild(NodeKind.MOD_LIST) === null);

        // assume a certain structure for the children
        assert(node.children.length === 3);
        assert(node.children[0].kind === NodeKind.PARAMETER_LIST);
        assert(
            node.children[1].kind === NodeKind.VECTOR ||
                node.children[1].kind === NodeKind.TYPE
        );
        assert(node.children[2].kind === NodeKind.BLOCK);

        let parameterList = node.children[0];
        let returnType = node.children[1];
        let functionBody = node.children[2];

        emitter.catchup(node.start);

        if (node.parent.kind === NodeKind.BLOCK) {
            let functionName = node.text;
            assert(functionName != null);
            emitter.insert(`let ${functionName} = `);
        } else if (node.text != null) {
            // this function, whose definition doesn't not appear as a statement, has a name
            // which means we have a possible recursive lambda (which we can't easily replace with a fat arrow function,
            // because we need to generate a statement to assign a name to this lambda, and this fat arrow function doesn't appear at a statement level, make it harder to figure out where to put the statement)

            // search for the function's name within the function body to see if this function might be recursive
            let functionName = node.text;
            let functionBodySource = emitter.sourceBetween(
                functionBody.start,
                functionBody.end
            );
            let functionMightBeRecursive = new RegExp(
                String.raw`\b${functionName}\b`
            ).test(functionBodySource);
            assert(
                !functionMightBeRecursive,
                `Lambda function named ${node.text} appears to be recursive, so replacing it with a fat-arrow function would be an error`
            );
        }

        emitter.withScope(getFunctionDeclarations(emitter, node), () => {
            emitter.consume(Keywords.FUNCTION, parameterList.start);
            // skip all whitespace appearing after Keywords.FUNCTION
            while (
                /\s/.test(
                    emitter.sourceBetween(emitter.index, emitter.index + 1)
                )
            ) {
                emitter.skip(1);
            }
            emitter.skipTo(parameterList.start);
            visitNode(emitter, parameterList);
            visitNode(emitter, returnType);
            emitter.catchup(functionBody.start);
            // ensure there's some whitespace between the return type and the fat arrow
            if (/\S/.test(emitter.output.slice(-1))) {
                emitter.insert(' ');
            }
            emitter.insert('=> ');
            visitNode(emitter, functionBody);
        });
    } else {
        emitDeclaration(emitter, node);
        emitter.withScope(getFunctionDeclarations(emitter, node), () => {
            let rest = node.getChildFrom(NodeKind.MOD_LIST);
            visitNodes(emitter, rest);
        });
    }
}

function emitForIn(emitter: Emitter, node: Node): void {
    let initNode = node.children[0];
    let varNode = initNode.children[0];
    let inNode = node.children[1];
    let blockNode = node.children[2];
    let nameTypeInitNode = varNode.findChild(NodeKind.NAME_TYPE_INIT);
    if (nameTypeInitNode) {
        // emit variable type on for..of statements, but outside of the loop header.
        let nameNode = nameTypeInitNode.findChild(NodeKind.NAME);
        let typeNode = nameTypeInitNode.findChild(NodeKind.TYPE);
        if (typeNode) {
            emitter.declareInScope({name: nameNode.text, type: emitter.getTypeRemap(typeNode.text) || typeNode.text});
        } else {
            let vecNode = nameTypeInitNode.findChild(NodeKind.VECTOR);
            if (vecNode) {
                if (WARNINGS >= 1) {
                    console.log(
                        "emitter.ts: *** WARNING *** for iterators of type vector not supported. Please declare iterator outside of the for's header"
                    );
                }
            }
        }
        emitter.catchup(node.start + Keywords.FOR.length + 1);
        emitter.catchup(varNode.start);
        emitter.insert('var ');
        emitter.insert(`${nameNode.text}`);
        emitter.skipTo(varNode.end);
    } else {
        emitter.catchup(node.start + Keywords.FOR.length + 1);
        visitNode(emitter, initNode);
    }

    emitter.catchup(inNode.start);
    emitter.skip(Keywords.IN.length + 1); // replace "in " with "of "
    emitter.insert('of ');

    visitNode(emitter, inNode);
    visitNode(emitter, blockNode);
}

function emitForEach(emitter: Emitter, node: Node): void {
    let varNode = node.children[0];
    let inNode = node.children[1];
    let blockNode = node.children[2];
    let nameTypeInitNode = varNode.findChild(NodeKind.NAME_TYPE_INIT);
    if (nameTypeInitNode) {
        // emit variable type on for..of statements, but outside of the loop header.
        let nameNode = nameTypeInitNode.findChild(NodeKind.NAME);
        let typeNode = nameTypeInitNode.findChild(NodeKind.TYPE);
        if (typeNode) {
            emitter.declareInScope({name: nameNode.text, type: emitter.getTypeRemap(typeNode.text) || typeNode.text});
        } else {
            let vecNode = nameTypeInitNode.findChild(NodeKind.VECTOR);
            if (vecNode) {
                if (WARNINGS >= 1) {
                    console.log(
                        "emitter.ts: *** WARNING *** for iterators of type vector not supported. Please declare iterator outside of the for's header"
                    );
                }
            }
        }
        emitter.catchup(node.start + Keywords.FOR.length);
        emitter.consume('each', varNode.start);
        emitter.catchup(varNode.start);
        emitter.insert('var ');
        emitter.insert(`${nameNode.text}`);
        emitter.skipTo(varNode.end);
    } else {
        emitter.catchup(node.start + Keywords.FOR.length);
        emitter.consume('each', varNode.start);
        visitNode(emitter, varNode);
    }

    emitter.catchup(inNode.start);
    emitter.skip(Keywords.IN.length + 1); // replace "in " with "of "
    emitter.insert('of ');

    visitNode(emitter, inNode);
    visitNode(emitter, blockNode);
}

function getClassDeclarations(
    emitter: Emitter,
    className: string,
    contentsNode: Node[]
): Declaration[] {
    let found: { [name: string]: boolean } = {};

    return contentsNode
        .map(node => {
            let nameNode: Node;

            switch (node.kind) {
                case NodeKind.SET:
                case NodeKind.GET:
                case NodeKind.FUNCTION:
                    nameNode = node.findChild(NodeKind.NAME);
                    break;
                case NodeKind.VAR_LIST:
                case NodeKind.CONST_LIST:
                    nameNode = node
                        .findChild(NodeKind.NAME_TYPE_INIT)
                        .findChild(NodeKind.NAME);
                    break;
                default:
                    break;
            }
            if (!nameNode || found[nameNode.text]) {
                return null;
            }
            found[nameNode.text] = true;
            if (nameNode.text === className) {
                return;
            }

            let modList = node.findChild(NodeKind.MOD_LIST);
            let isStatic =
                modList && modList.children.some(mod => mod.text === 'static');
            return {
                name: nameNode.text,
                type: getDeclarationType(
                    emitter,
                    node.findChild(NodeKind.NAME_TYPE_INIT)
                ),
                bound: isStatic ? className : 'this'
            };
        })
        .filter(el => !!el);
}

function emitClass(emitter: Emitter, node: Node): void {
    emitDeclaration(emitter, node);

    let name = node.findChild(NodeKind.NAME);

    let content = node.findChild(NodeKind.CONTENT);
    let contentsNode = content && content.children;
    if (!contentsNode) {
        return;
    }

    // ensure extends identifier is being imported
    let extendsNode = node.findChild(NodeKind.EXTENDS);
    if (extendsNode) {
        emitIdent(emitter, extendsNode);
        emitter.ensureImportIdentifier(extendsNode.text);
    }

    // ensure implements identifiers are being imported
    let implementsNode = node.findChild(NodeKind.IMPLEMENTS_LIST);
    if (implementsNode) {
        implementsNode.children.forEach(node =>
            emitter.ensureImportIdentifier(node.text)
        );
    }

    emitter.withScope(
        getClassDeclarations(emitter, name.text, contentsNode),
        scope => {
            scope.className = name.text;

            contentsNode.forEach(node => {
                visitNode(emitter, node.findChild(NodeKind.META_LIST));
                emitter.catchup(node.start);
                switch (node.kind) {
                    case NodeKind.SET:
                        emitSet(emitter, node);
                        break;
                    case NodeKind.GET:
                    case NodeKind.FUNCTION:
                        emitMethod(emitter, node);
                        break;
                    case NodeKind.VAR_LIST:
                        emitPropertyDecl(emitter, node);
                        break;
                    case NodeKind.CONST_LIST:
                        emitPropertyDecl(emitter, node, true);
                        break;
                    default:
                        visitNode(emitter, node);
                }
            });
        }
    );

    emitter.catchup(node.end);
}

function emitSet(emitter: Emitter, node: Node): void {
    emitClassField(emitter, node);

    let name = node.findChild(NodeKind.NAME);
    emitter.consume('function', name.start);

    let params = node.findChild(NodeKind.PARAMETER_LIST);
    visitNode(emitter, params);
    emitter.catchup(params.end);

    let type = node.findChild(NodeKind.TYPE);
    if (type) {
        emitter.skipTo(type.end);
    }

    emitter.withScope(getFunctionDeclarations(emitter, node), () => {
        visitNodes(emitter, node.getChildFrom(NodeKind.TYPE));
    });
}

function emitConstList(emitter: Emitter, node: Node): void {
    emitter.catchup(node.start);
    let nameTypeInit = node.findChild(NodeKind.NAME_TYPE_INIT);
    emitter.skipTo(nameTypeInit.start);
    emitter.insert('const ');
    visitNode(emitter, nameTypeInit);
}

function emitObjectValue(emitter: Emitter, node: Node): void {
    visitNodes(emitter, node.children);
}

// returns 'true' or 'false', based on whether or not the chain of parents from 'node' on upwards
// have 'kind' values that match the array of kind values given (starting from index 0 on up)
function parentChainHasKinds(node: Node, arrayOfKinds: number[]): boolean {
    if (arrayOfKinds.length === 0 || node === null) {
        return true;
    } else {
        if (node.parent.kind !== arrayOfKinds[0]) {
            return false;
        } else {
            return parentChainHasKinds(node.parent, arrayOfKinds.slice(1));
        }
    }
}

function emitNameTypeInit(emitter: Emitter, node: Node): void {
    emitter.declareInScope({
        name: node.findChild(NodeKind.NAME).text,
        type: getDeclarationType(emitter, node)
    });
    emitter.catchup(node.start);
    
    assert(node.children[0].kind === NodeKind.NAME);
    assert(node.children[1].kind === NodeKind.TYPE || node.children[1].kind === NodeKind.VECTOR);
    assert(node.children.length === 2 || (node.children.length === 3 && node.children[2].kind === NodeKind.INIT));
    
    let nameNode = node.children[0];
    let typeNode = node.children[1];
    let initNode = node.children[2] || null;

    // we need to know whether or not we're emitting an init statement on a function declaration on an interface,
    // because such functions can't have initialization expressions, and so we need to skip this 'init' expression and add a '?' to the arg name to denote that it's optional
    let isParameterOnInterfaceFunction = false;

    if (parentChainHasKinds(node, [NodeKind.PARAMETER, NodeKind.PARAMETER_LIST, NodeKind.TYPE, NodeKind.CONTENT, NodeKind.INTERFACE])) {
        if (node.getParentChain().filter(ancestor => ancestor.kind === NodeKind.TYPE)[0].text === 'function') {
            isParameterOnInterfaceFunction = true;
        }
    }
    
    visitNode(emitter, nameNode);
    
    if (isParameterOnInterfaceFunction && initNode) {
        emitter.catchup(nameNode.end);
        emitter.insert('?');
    }
    
    visitNode(emitter, typeNode);
    
    if (initNode) {
        if (isParameterOnInterfaceFunction) {
            emitter.commentNode(initNode, false);
        } else {
            visitNode(emitter, initNode);
        }
    }
}

function emitMethod(emitter: Emitter, node: Node): void {
    let name = node.findChild(NodeKind.NAME);
    if (
        node.kind !== NodeKind.FUNCTION ||
        name.text !== emitter.currentClassName
    ) {
        emitClassField(emitter, node);
        emitter.consume('function', name.start);
        emitter.catchup(name.end);
    } else {
        let mods = node.findChild(NodeKind.MOD_LIST);
        if (mods) {
            emitter.catchup(mods.start);
        }
        emitter.insert('constructor');
        emitter.skipTo(name.end);

        // // find "super" on constructor and move it to the beginning of the
        // // block
        // let blockNode = node.findChild(NodeKind.BLOCK);
        // let blockSuperIndex = -1;
        // for (var i = 0, len = blockNode.children.length; i < len; i++) {
        //     let blockChildNode = blockNode.children[i];
        //     if (blockChildNode.kind === NodeKind.CALL
        //         && blockChildNode.children[0].text === "super") {
        //         blockSuperIndex = i;
        //         break;
        //     }
        // }
        //
        // if (childCalls.length > 0) {
        //     console.log(childCalls)
        //     let superIndex = -1;
        //     childCalls.forEach((child, i) => {
        //         if (child.children[0].text === "super") superIndex = blockNode.children.indexOf(child);
        //     })
        //     console.log("super index:", superIndex)
        // }
    }

    emitter.withScope(getFunctionDeclarations(emitter, node), () => {
        visitNodes(emitter, node.getChildFrom(NodeKind.NAME));
    });
}

function emitBlock(emitter: Emitter, node: Node): void {
    if (parentChainHasKinds(node, [NodeKind.FUNCTION, NodeKind.CONTENT, NodeKind.CLASS]) && node.parent.findChild(NodeKind.NAME).text === emitter.currentClassName) {
        // we're emitting the body of a constructor

        // so ensure there is a call to 'super' in this constructor if and only if this class has a parent class
        let hasParentClass = node.parent.parent.parent.findChild(NodeKind.EXTENDS) !== null;

        let isCallToSuper = (node: Node) =>
            node.kind === NodeKind.CALL &&
            node.children[0].kind === NodeKind.IDENTIFIER &&
            node.children[0].text === 'super';

        if (hasParentClass) {

            // insert a generic call to 'super' if no such call exists

            // search for an already existing call to 'super'
            let callsToSuper = node.children.filter(isCallToSuper);

            assert(callsToSuper.length <= 1);   // should be at most one call to 'super'

            emitter.catchup(node.start);
            
            if (node.children.length > 0) {
                emitter.catchup(node.children[0].start);
            }
            
            if (callsToSuper.length !== 1) {
                let [terminatingCharacter, leftPadding] = /(\n|\{)(.*)?$/.exec(emitter.output).slice(1);
                
                // if we didn't encounter a call to the super constructor, add our own call with 0 args
                // Which also happens to be just what Flash does in this case:
                //      "If flash doesn't detect a call to super() in your child constructor then flash will implicitly call super() before your child's constructor."
                //      https://stackoverflow.com/a/7538926/2969105
                emitter.insert('super();');
                if (terminatingCharacter === '\n') {
                    emitter.insert('\n');
                }
                emitter.insert(leftPadding);
            }

            visitNodes(emitter, node.children);
            
        } else {
            // avoid emitting any call to 'super', but visit all other children normally
            emitter.catchup(node.start);
            node.children.forEach(child => {
                if (isCallToSuper(child)) {
                    emitter.commentNode(child, true);
                } else {
                    visitNode(emitter, child);
                }
            });
        }
    } else {
        // default behavior
        emitter.catchup(node.start);
        visitNodes(emitter, node.children);
    }
}

function emitPropertyDecl(emitter: Emitter, node: Node, isConst = false): void {
    emitClassField(emitter, node);
    let names = node.findChildren(NodeKind.NAME_TYPE_INIT);
    names.forEach((name, i) => {
        if (i === 0) {
            emitter.consume(
                isConst ? Keywords.CONST : Keywords.VAR,
                name.start
            );
        }
        visitNode(emitter, name);
    });
}

function emitClassField(emitter: Emitter, node: Node): void {
    let mods = node.findChild(NodeKind.MOD_LIST);
    if (mods) {
        emitter.catchup(mods.start);

        let modifiersToEmit = [
            Keywords.PRIVATE,
            Keywords.PUBLIC,
            Keywords.PROTECTED,
            Keywords.STATIC
        ];

        let mapFromModifiersToTextToEmit: any = {};
        modifiersToEmit.forEach(keyword => {
            mapFromModifiersToTextToEmit[keyword] = keyword;
        });

        // visibility modifiers on related 'get' and 'set' methods must be the same in TypeScript,
        // so if this is a 'get' or a 'set', look for the related method and choose to use the 'most visible' modifier that exists on either of them
        if ((node.kind === NodeKind.GET) || (node.kind === NodeKind.SET)) {
            
            // NOTE: the order of these enums completely decides the priority of Visibility settings, higher values overtaking lower values (i.e. Public preferred over Private)
            enum Visibility {
                Private,
                Protected,
                Public,
                NotSpecified    // even though not specifying visibility means a default of 'public' is applied,
                                // this state of not specifying visibility is *not* seen equivalent to specifying 'public',
                                // (when on has to get the visibility of the getter and the setter to be the same)
                                // so we have to account for this extra state
            }
            
            function effectiveVisibilityFromModList(modList: Node): Visibility {
                if (modList !== null) {
                    if (modList.children.findIndex(node => node.text === Keywords.PRIVATE) !== -1) {
                        return Visibility.Private;
                    } else if (modList.children.findIndex(node => node.text === Keywords.PROTECTED) !== -1) {
                        return  Visibility.Protected;
                    } else if (modList.children.findIndex(node => node.text === Keywords.PUBLIC) !== -1) {
                        return  Visibility.Public;
                    }
                }
                
                return Visibility.NotSpecified;
            }

            function keywordFromSpecifiedVisibility(visibility: Visibility): string {
                if (visibility === Visibility.Public) {
                    return Keywords.PUBLIC;
                } else if (visibility === Visibility.Protected) {
                    return Keywords.PROTECTED;
                } else if (visibility === Visibility.Private) {
                    return Keywords.PRIVATE;
                } else {
                    assert(false);
                }
            }
            
            let effectiveVisibility = effectiveVisibilityFromModList(mods);

            let getIsStatic = hasStaticModifer(node);

            let relatedKind = node.kind === NodeKind.GET ? NodeKind.SET : NodeKind.GET;

            // find all related nodes that appear in the same class, that have the same name, and are the same 'static-ness'
            let relatedNodes = node.parent
                .findChildren(relatedKind)
                .filter(sibling => sibling.text === node.text)
                .filter(sibling => getIsStatic === hasStaticModifer(sibling));

            assert(relatedNodes.length <= 1); // there should be at most one such matching set node

            if (relatedNodes.length > 0) {
                // and if we found a matching related node, possibly use its effective visibility to influence the visibility of this node
                let relatedModList = relatedNodes[0].findChild(NodeKind.MOD_LIST);
                let effectiveVisibilityOfRelatedNode = effectiveVisibilityFromModList(relatedModList);
                
                if (effectiveVisibilityOfRelatedNode > effectiveVisibility) {
                    let newVisibility: string;

                    if (effectiveVisibilityOfRelatedNode === Visibility.NotSpecified) {
                        newVisibility = `/*${keywordFromSpecifiedVisibility(effectiveVisibility)}*/`;
                    } else {
                        newVisibility = keywordFromSpecifiedVisibility(effectiveVisibilityOfRelatedNode);
                    }
                    
                    mapFromModifiersToTextToEmit[Keywords.PRIVATE] = newVisibility;
                    mapFromModifiersToTextToEmit[Keywords.PROTECTED] = newVisibility;
                    mapFromModifiersToTextToEmit[Keywords.PUBLIC] = newVisibility;
                }
            }
        }

        // Need to fix this difference:
        //  ActionScript: 'static' modifier can appear before or after access modifier
        //  TypeScript: 'static' modifier must appear after access modifier
        if (
            mods.children.findIndex(node => node.text === Keywords.STATIC) !==
            -1
        ) {
            // if the 'static' modifier exists
            let modifiersToEmit = mods.children
                .map(node => node.text)
                .filter(modifier =>
                    mapFromModifiersToTextToEmit.hasOwnProperty(modifier)
                );
            let lastModifierToEmit =
                modifiersToEmit[modifiersToEmit.length - 1];
            if (lastModifierToEmit !== Keywords.STATIC) {
                // and the last effective modifier is *not* 'static'
                // then swap the last one with 'static'
                mapFromModifiersToTextToEmit[
                    Keywords.STATIC
                ] = lastModifierToEmit;
                mapFromModifiersToTextToEmit[lastModifierToEmit] =
                    Keywords.STATIC;
            }
        }

        mods.children.forEach(node => {
            emitter.catchup(node.start);
            if (mapFromModifiersToTextToEmit.hasOwnProperty(node.text)) {
                emitter.insert(mapFromModifiersToTextToEmit[node.text]);
                emitter.skipTo(node.end);
            } else {
                emitter.commentNode(node, false);
            }
        });
    }
}

function emitDeclaration(emitter: Emitter, node: Node): void {
    emitter.catchup(node.start);
    visitNode(emitter, node.findChild(NodeKind.META_LIST));
    let mods = node.findChild(NodeKind.MOD_LIST);
    if (mods && mods.children.length) {
        emitter.catchup(mods.start);
        let insertExport = false;
        mods.children.forEach(node => {
            if (node.text !== 'private') {
                insertExport = true;
            }
            emitter.skipTo(node.end);
        });
        assert(insertExport || node.kind !== NodeKind.CLASS);   // assert that no classes have a 'private' modifier (otherwise, the fix below to ensure *all* classes are 'export'ed doesn't work)
        if (insertExport) {
            emitter.insert('export');
        }
    } else if (node.kind === NodeKind.CLASS) {
        // In AS3, public classes are allowed to have public methods return instances of non-public classes,
        // for such code to produce valid TypeScript we have to export all such non-public classes,
        // so forcefully emit 'export ' just before the 'class' declaration
        emitter.catchup(node.findChild(NodeKind.NAME).start);
        let classKeywordOnwards = /class\s+.*?$/.exec(emitter.output)[0];
        emitter.output = emitter.output.slice(0, -classKeywordOnwards.length) + 'export ' + classKeywordOnwards;
    }
}

function emitType(emitter: Emitter, node: Node): void {
    // Don't emit type on 'constructor' functions.
    if (node.parent.kind === NodeKind.FUNCTION) {
        let name = node.parent.findChild(NodeKind.NAME);
        if (name && name.text === emitter.currentClassName) {
            emitter.catchup(node.previousSibling.end);
            emitter.skipTo(node.end);
            return;
        }
    }

    emitter.catchup(node.start);

    if (!node.text) {
        if (node.kind === NodeKind.VECTOR) {
            emitVector(emitter, node);
        }
        return;
    }

    emitter.skipTo(node.end);

    // ensure type is imported
    if (
        GLOBAL_NAMES.indexOf(node.text) === -1 &&
        !emitter.getTypeRemap(node.text) &&
        TYPE_REMAP_VALUES.indexOf(node.text) === -1
    ) {
        emitter.ensureImportIdentifier(node.text);
    }

    let typeName = emitter.getTypeRemap(node.text) || node.text;

    emitter.insert(typeName);
}

function emitVector(emitter: Emitter, node: Node): void {
    if (!emitter.isNew) {
        emitter.catchup(node.start);
    }

    let type = node.findChild(NodeKind.TYPE);
    if (!type) {
        type = createNode(NodeKind.TYPE, {
            text: 'any',
            start: node.start,
            end: node.end
        });
        type.parent = node;
    }

    emitter.skipTo(type.start);

    if (!emitter.isNew) {
        emitType(emitter, type);
    }

    emitter.insert('[]');

    emitter.skipTo(node.end);
}

function emitShortVector(emitter: Emitter, node: Node): void {
    emitter.catchup(node.start);
    let vector = node.findChild(NodeKind.VECTOR);
    emitter.insert('Array');
    let type = vector.findChild(NodeKind.TYPE);
    if (type) {
        emitType(emitter, type);
    } else {
        emitter.insert('any');
    }
    emitter.catchup(vector.end);
    emitter.insert('(');
    let arrayLiteral = node.findChild(NodeKind.ARRAY);
    emitArray(emitter, arrayLiteral);
    emitter.insert(')');
    emitter.skipTo(node.end);
}

function emitNew(emitter: Emitter, node: Node): void {
    emitter.catchup(node.start);
    emitter.isNew = true;
    emitter.emitThisForNextIdent = false;
    visitNodes(emitter, node.children);
    emitter.isNew = false;
    emitter.emitThisForNextIdent = true;
}

function emitArrayAccessor(emitter: Emitter, node: Node) {
    if (emitter.source[node.start - 2] === '.') {
        emitter.catchup(node.start - 1);
        emitter.skip(1);
    } else {
        emitter.catchup(node.start);
    }

    visitNodes(emitter, node.children);
}

function emitCall(emitter: Emitter, node: Node): void {
    if (node.children[0].kind === NodeKind.VECTOR) {
        if (emitter.isNew) {
            emitter.isNew = false;
            let vector = node.children[0];
            let args = node.children[1];
            emitter.insert('[');
            if (WARNINGS >= 2 && args.children.length > 0) {
                console.log(
                    'emitter.ts: *** MINOR WARNING *** emitCall() => NodeKind.VECTOR with arguments not implemented.'
                );
            }
            emitter.insert(']');
            emitter.skipTo(args.end);
            return;
        } else {
            if (isCast(emitter, node)) {
                emitter.catchup(node.start);
                emitter.insert('<');
                const vec: Node = node.findChild(NodeKind.VECTOR);
                visitNodes(emitter, [vec]);
                emitter.insert('>');
                const args: Node = node.findChild(NodeKind.ARGUMENTS);
                emitter.skipTo(args.start);
                visitNodes(emitter, [args]);
                return;
            }
        }
    } else {
        if (!emitter.isNew && isCast(emitter, node)) {
            const type: Node = node.findChild(NodeKind.IDENTIFIER);
            const args: Node = node.findChild(NodeKind.ARGUMENTS);
            const rtype: string = emitter.getTypeRemap(type.text) || type.text;
            emitter.catchup(node.start);
            if (rtype === 'string' || rtype === 'number') {
                emitter.catchup(node.start);
            } else {
                emitter.insert('<');
                emitter.insert(rtype);
                emitter.insert('>');
                emitter.skipTo(args.start);
                visitNodes(emitter, [args]);
                return;
            }
        } else {
            if (emitter.source[node.start - 2] === '.') {
                emitter.catchup(node.start - 1);
                emitter.skip(1);
            } else {
                emitter.catchup(node.start);
            }
        }
    }

    // emit the expression that represents the function that is being called
    visitNode(emitter, node.children[0]);
    // now that the expression representing the function has been emitted, we can consider ourselves no longer emitting an effective part of a 'new' statement
    emitter.isNew = false;
    visitNodes(emitter, node.children.slice(1));
}

function isCast(emitter: Emitter, node: Node): boolean {
    if (node.children.length == 0) {
        return false;
    }

    const isVector = node.children[0].kind === NodeKind.VECTOR;
    if (isVector && !emitter.isNew) {
        return true;
    }

    const type: Node = node.findChild(NodeKind.IDENTIFIER);
    if (!type || !type.text) {
        return false;
    }

    const declaration = emitter.findDefInScope(type.text);

    if (declaration) {
        return false;
    }

    // If the declaration is not found in scope, AND
    // starts with an uppercase, consider it a cast.
    // (this is quite vague, but its a start)
    const firstLetter = type.text.substring(0, 1);
    if (firstLetter === firstLetter.toLowerCase()) {
        return false;
    }

    return true;
}

function emitCatch(emitter: Emitter, node: Node): void {
    let exceptionName = node.children[0].text;

    emitter.declareInScope({ name: exceptionName });
    emitter.catchup(node.start);

    // accept the exception's name
    emitter.catchup(node.children[0].end);
    let leftPaddingAtCatch = /\n([ \t]*)[^\n]*$/.exec(emitter.output)[1]; // all whitespace indenting the line that contains 'catch'

    let block: Node = null;
    let exceptionType: Node = null;

    if (node.children[1].kind == NodeKind.TYPE) {
        exceptionType = node.children[1];
        block = node.children[2];
    } else {
        block = node.children[1];
    }

    console.assert(!exceptionType || exceptionType.kind == NodeKind.TYPE);
    console.assert(block.kind == NodeKind.BLOCK);

    if (exceptionType !== null) {
        // skip the variable type, because specifying the type of the exception caught here isn't supported in TypeScript
        emitter.skipTo(exceptionType.end);
    }

    let outputLengthBeforeBlockEmit = emitter.output.length;
    visitNode(emitter, block);

    // to duplicate the behavior in ActionScript of being able to have the 'catch' body gaurded by a type check on the exception type,
    // surround the 'catch' body with an 'if' statement that checks the type of the exception with a call to 'instanceof'
    if (exceptionType !== null) {
        let exceptionTypeName =
            emitter.getTypeRemap(exceptionType.text) || exceptionType.text;
        if (exceptionTypeName === 'any') {
            // don't build an 'if' statement to check for an instance of this type, because all values are of type 'any', so the 'if' will never be false
        } else {
            // Surround the 'catch' body (after giving it an extra level of indentation) with an 'if' that appropriately checks the type of the exception being thrown,
            // and end the 'if' with an 'else' that re-throws the exception in the case where the type didn't match
            emitter.catchup(block.end);
            let blockBeginIndex = emitter.output.indexOf(
                '{',
                outputLengthBeforeBlockEmit
            );
            let emittedBlock = emitter.output.slice(blockBeginIndex + 1);
            emittedBlock = emittedBlock.replace(/\n/g, '\n\t'); // indent the full block an extra level (here we're assuming that 'tabs' are used instead of 'spaces' for indenting)
            let leftPaddingForIfStatement = leftPaddingAtCatch + '\t';

            emitter.output =
                emitter.output.slice(0, blockBeginIndex + 1) +
                `\n${leftPaddingForIfStatement}if (${exceptionName} instanceof `;
            // perform a little hackery to properly emit the exception's type
            let indexBeforeSkip = emitter.index;
            emitter.skipTo(exceptionType.start);
            visitNode(emitter, exceptionType);
            emitter.skipTo(indexBeforeSkip);

            emitter.output +=
                ') {' +
                emittedBlock +
                `\n${leftPaddingForIfStatement}else { throw ${exceptionName}; }\n${leftPaddingAtCatch}}`;
        }
    }
}

function emitRelation(emitter: Emitter, node: Node): void {
    emitter.catchup(node.start);
    let as = node.findChild(NodeKind.AS);
    if (as) {
        // TODO: implement relation with type cast to vectors
        //       e.g. (myVector as Vector.<Boolean>)
        if (node.lastChild.kind === NodeKind.IDENTIFIER) {
            emitter.insert('(<');
            
            let typeName = node.lastChild.text;

            // ensure type is imported
            if (
                GLOBAL_NAMES.indexOf(typeName) === -1 &&
                !emitter.getTypeRemap(typeName) &&
                TYPE_REMAP_VALUES.indexOf(typeName) === -1
            ) {
                emitter.ensureImportIdentifier(typeName);
            }

            typeName = emitter.getTypeRemap(typeName) || typeName;
            
            emitter.insert(typeName);
            
            emitter.insert('>');
            visitNodes(emitter, node.getChildUntil(NodeKind.AS));
            emitter.catchup(as.start);
            emitter.insert(')');
            emitter.skipTo(node.end);
        } else if (node.lastChild.kind === NodeKind.VECTOR) {
            visitNodes(emitter, node.children);
        } else {
            emitter.commentNode(node, false);
        }
        return;
    }

    let is = node.findChild(NodeKind.IS);
    if (is) {
        assert(
            node.children.length === 3 && node.children[1].kind == NodeKind.IS
        );

        let valueExpression = node.children[0];
        let constructorExpression = node.children[2];

        let typeFromPrimitiveActionScriptType: { [id: string]: string } = {
            String: 'string',
            Number: 'number',
            Boolean: 'boolean'
        };

        if (
            constructorExpression.kind === NodeKind.IDENTIFIER &&
            typeFromPrimitiveActionScriptType.hasOwnProperty(
                constructorExpression.text
            )
        ) {
            // 'instanceof' doesn't work for primitive types, so we have to resort to 'typeof' instead
            emitter.insert('typeof ');
            visitNode(emitter, node.children[0]);
            emitter.catchup(is.start);
            emitter.insert('===');
            emitter.skipTo(is.end);
            emitter.catchup(constructorExpression.start);
            emitter.insert(
                `'${typeFromPrimitiveActionScriptType[
                    constructorExpression.text
                ]}'`
            );
            emitter.skipTo(constructorExpression.end);
        } else {

            visitNode(emitter, valueExpression);
            emitter.catchup(is.start);

            if (constructorExpression.kind === NodeKind.IDENTIFIER) {

                let typeName = constructorExpression.text;

                // ensure type is imported
                if (
                    GLOBAL_NAMES.indexOf(typeName) === -1 &&
                    !emitter.getTypeRemap(typeName) &&
                    TYPE_REMAP_VALUES.indexOf(typeName) === -1 &&
                    emitter.findDefInScope(typeName) === null
                ) {
                    emitter.ensureImportIdentifier(typeName);
                }
                
                let remappedType = emitter.getTypeRemap(typeName);
                // 'instanceof' doesn't work with on array types, so avoid the remapping if the remapped type ends with '[]'
                // (truly this probably hints to a larger issue if it occurs, but currently this is the best fix, and any custom visitor fighting with this workaround can handle this in a custom way)
                if (remappedType && !remappedType.endsWith('[]')) {
                    typeName = remappedType;
                }
                
                if (typeName === 'any') {
                    // every value other than 'null' and 'undefined' in ActionScript evaluate to 'true' when tested if they're instances of 'Object'
                    // so just change this expression to 'x != null', which will be equivalent to this check

                    emitter.insert('!=');
                    emitter.skipTo(is.end);

                    emitter.catchup(constructorExpression.start);
                    emitter.insert('null');
                } else {
                    emitter.insert(Keywords.INSTANCE_OF);
                    emitter.skipTo(is.end);

                    emitter.catchup(constructorExpression.start);
                    emitter.insert(typeName);
                }
                emitter.skipTo(constructorExpression.end);
            } else {
                emitter.insert(Keywords.INSTANCE_OF);
                emitter.skipTo(is.end);

                visitNode(emitter, constructorExpression);
            }
        }

        return;
    }

    visitNodes(emitter, node.children);
}

function emitOp(emitter: Emitter, node: Node): void {
    emitter.catchup(node.start);
    emitter.catchup(node.end);
}

function emitOr(emitter: Emitter, node: Node): void {
    // // TODO: support for `value ||= 10` expressions;
    // if (node.children.length === 3 && node.children[2].text === "=")
    // {
    //     node.children[2].text = node.children[0].text + " =";
    // }

    emitter.catchup(node.start);
    visitNodes(emitter, node.children);
}

export function identifierHasDefinition(emitter: Emitter, identifier: string) {
    return !(!emitter.findDefInScope(identifier) &&
        emitter.currentClassName &&
        GLOBAL_NAMES.indexOf(identifier) === -1 &&
        !TYPE_REMAP.hasOwnProperty(identifier) &&
        identifier !== emitter.currentClassName);
}

export function emitIdent(emitter: Emitter, node: Node): void {
    emitter.catchup(node.start);

    if (node.parent && node.parent.kind === NodeKind.DOT) {
        //in case of dot just check the first
        if (node.parent.children[0] !== node) {
            return;
        }
    }

    if (Keywords.isKeyWord(node.text)) {
        emitter.insert(node.text);
        emitter.skipTo(node.end);
        return;
    }

    let def = emitter.findDefInScope(node.text);
    if (def && def.bound) {
        emitter.insert(def.bound + '.');
    }

    // HACK: loop labels (e.g. 'outerloop:') are currently parsed as two sibling identifiers (e.g. 'outerloop' and ':'),
    // and some magic has been added here so these labels are emitter exactly as is (which results in valid TypeScript)
    let identifierIsPartOfALoopLabel = node.text === Operators.COLUMN || (node.nextSibling && node.nextSibling.text === Operators.COLUMN);
   
    if (!identifierIsPartOfALoopLabel && !identifierHasDefinition(emitter, node.text)) {
        if (node.text.match(/^[A-Z]/)) {
            // Import missing identifier from this namespace
            if (!emitter.options.useNamespaces) {
                emitter.ensureImportIdentifier(node.text);
            }
        } else if (emitter.emitThisForNextIdent) {
            // Identifier belongs to `this.` scope.
            emitter.insert('this.');
        }
    }

    node.text = emitter.getIdentifierRemap(node.text) || node.text;

    emitter.insert(node.text);
    
    // if this identifer represents a parametrized type, which is the direct target of a 'new' statement, append the needed parenthesis
    if (node.text.slice(-1) === '>' && node.parent.kind === NodeKind.NEW) {
        emitter.insert('()');
    }

    emitter.skipTo(node.end);
    emitter.emitThisForNextIdent = true;
}

function emitDot(emitter: Emitter, node: Node) {
    let dotSibling = node.nextSibling;
    let isConditionalCompilation =
        dotSibling && dotSibling.kind === NodeKind.BLOCK;
    let template = 'if ($1)';

    if (!isConditionalCompilation && node.parent.kind === NodeKind.CONDITION) {
        let separator = emitter.sourceBetween(
            node.children[0].end,
            node.children[0].end + 2
        );
        isConditionalCompilation = separator === '::';
        template = '$1';
    }

    // wrap conditional compilation into Node.js conditional for
    // `process.env.VARIABLE`
    //
    // More info about Flex conditional compilation:
    // http://help.adobe.com/en_US/flex/using/WS2db454920e96a9e51e63e3d11c0bf69084-7abd.html

    if (isConditionalCompilation) {
        emitter.catchup(node.start);
        emitter.insert(
            template.replace(
                '$1',
                `process.env.${node.children[1].text.toUpperCase()}`
            )
        );
        emitter.skipTo(node.end);
        return;
    } else {
        // TODO: allow conditional compilation for function/class definitions
    }

    visitNodes(emitter, node.children);
}

function emitXMLLiteral(emitter: Emitter, node: Node): void {
    emitter.catchup(node.start);
    emitter.insert(JSON.stringify(node.text));
    emitter.skipTo(node.end);
}

function emitLiteral(emitter: Emitter, node: Node): void {
    emitter.catchup(node.start);

    emitter.insert(node.text);

    emitter.skipTo(node.end);
}

function emitArray(emitter: Emitter, node: Node): void {
    emitter.catchup(node.start);
    emitter.insert('[');
    if (node.children.length > 0) {
        emitter.skipTo(node.children[0].start);
        visitNodes(emitter, node.children);
        emitter.catchup(node.lastChild.end);
    }
    emitter.insert(']');
    emitter.skipTo(node.end);
}

export function emit(
    ast: Node,
    source: string,
    options?: EmitterOptions
): string {
    let emitter = new Emitter(source, options);
    return emitter.emit(ast);
}

function emitLoopBranch(emitter: Emitter, node: Node): void {
    // The only thing that can be in a break is a label and it shouldn't
    //  need any special treatment.  Just bundle it all up and call it good.
    emitter.catchup(node.end);
}

function emitAssignment(emitter: Emitter, node: Node): void {
     let operation = node.findChild(NodeKind.OP);
    
     if (operation.text === Operators.DOUBLE_AND_EQUAL || operation.text === Operators.DOUBLE_OR_EQUAL) {
         assert(node.children.length === 3);    // not yet coding to handle multiple assignments in a row here

         let lhs =  node.children[0];
         let rhs =  node.children[2];

         emitter.catchup(node.start);
         visitNode(emitter, lhs);
         emitter.catchup(operation.start);
         emitter.insert('=');
         emitter.skipTo(operation.end);
         emitter.catchup(rhs.start);
         
         emitter.skipTo(lhs.start);
         visitNode(emitter, lhs);
         emitter.catchup(lhs.end);
         
         if (operation.text === Operators.DOUBLE_AND_EQUAL) {
             emitter.insert(' && ');
         } else if ( operation.text === Operators.DOUBLE_OR_EQUAL) {
             emitter.insert(' || ');
         } else {
             assert(false);
         }
         
         emitter.skipTo(rhs.start);
         visitNode(emitter, rhs);
         
     } else {
         // default behavior
         emitter.catchup(node.start);
         visitNodes(emitter, node.children);
     }
}
