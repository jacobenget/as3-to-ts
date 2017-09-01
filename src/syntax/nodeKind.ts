enum NodeKind {
    ADD,
    AND,
    ARGUMENTS,
    ARRAY,
    ARRAY_ACCESSOR,
    AS,
    AS_DOC,
    ASSIGN,
    B_AND,
    B_NOT,
    B_OR,
    B_XOR,
    BLOCK,
    BREAK,
    CALL,
    CASE,
    CASES,
    CATCH,
    CLASS,
    COMPILATION_UNIT,
    COND,
    CONDITION,
    CONDITIONAL,
    CONST,
    CONST_LIST,
    CONTENT,
    CONTINUE,
    DEFAULT,
    DELETE,
    DO,
    DOT,
    E4X_ATTR,
    E4X_FILTER,
    E4X_STAR,
    ENCAPSULATED,
    EQUALITY,
    EXPR_LIST,
    EXTENDS,
    FINALLY,
    FOR,
    FOREACH,
    FORIN,
    FUNCTION,
    GET,
    IF,
    IMPLEMENTS,
    IMPLEMENTS_LIST,
    IMPORT,
    IN,
    INCLUDE,
    INIT,
    INTERFACE,
    IS,
    ITER,
    LABEL,
    LAMBDA,
    LEFT_CURLY_BRACKET,
    META,
    META_LIST,
    MINUS,
    MOD_LIST,
    MODIFIER,
    MULTI_LINE_COMMENT,
    MULTIPLICATION,
    NAME,
    NAME_TYPE_INIT,
    NEW,
    NOT,
    OBJECT,
    OP,
    OR,
    PACKAGE,
    PARAMETER,
    PARAMETER_LIST,
    PLUS,
    POST_DEC,
    POST_INC,
    PRE_DEC,
    PRE_INC,
    PROP,
    RELATION,
    REST,
    RETURN,
    SET,
    SHIFT,
    STAR,
    STMT_EMPTY,
    SWITCH,
    SWITCH_BLOCK,
    TRY,
    TYPE,
    TYPEOF,
    USE,
    VALUE,
    VAR,
    VAR_LIST,
    VECTOR,
    SHORT_VECTOR,
    VOID,
    WHILE,
    XML_LITERAL,
    LITERAL,
    IDENTIFIER,
    EMBED
}

// Can't do 'export default enum Foo {...}' for some reason?
export default NodeKind;

export function nodeKindName(nodeKind:NodeKind):string {
    return NodeKind[nodeKind];
}