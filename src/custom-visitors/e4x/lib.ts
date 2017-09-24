import Node from '../../syntax/node';
import NodeKind from '../../syntax/nodeKind';
import Emitter, {identifierHasDefinition, visitNode} from '../../emit/emitter';
import * as assert from 'assert';
import * as Keywords from '../../syntax/keywords';

function isInsideE4xFilterBody(node: Node) {

    let isE4xFilterBody = (node: Node) => {
        // Note: the 2nd child of an E4X_FILTER is the expression inside the E4X filter
        return node.parent && node.parent.kind === NodeKind.E4X_FILTER && node.parent.children[1] === node;
    };
    
    return node.getParentChain().filter(ancestor => isE4xFilterBody(ancestor)).length > 0;
}

export function isAnAccessorOnAnXmlOrXmlListValue(emitter: Emitter, node: Node): boolean {
    if (node.kind === NodeKind.DOT || node.kind === NodeKind.ARRAY_ACCESSOR || node.kind === NodeKind.E4X_ATTR || node.kind === NodeKind.E4X_ATTR_ARRAY_ACCESS || node.kind === NodeKind.E4X_STAR) {
        if (node.kind === NodeKind.DOT || node.kind === NodeKind.ARRAY_ACCESSOR) {
            return producesXmlOrXmlListValue(emitter, node.children[0]);
        } else {
            return true;
        }
    } else if (node.kind === NodeKind.IDENTIFIER) {
        let isKeyword = Keywords.isKeyWord(node.text);
        let weAreInsideAnE4xFilter = isInsideE4xFilterBody(node);
        let identifierDoesNotHaveDefinition = !identifierHasDefinition(emitter, node.text);
        let identiferLikelyReferencesAType = /^[A-Z]/.test(node.text);

        if (!isKeyword && identifierDoesNotHaveDefinition && weAreInsideAnE4xFilter && !identiferLikelyReferencesAType) {
            return true;
        }
    } else {
        return false;
    }
}

export function producesXmlOrXmlListValue(emitter: Emitter, node: Node): boolean {
    return producesXmlValue(emitter, node) || producesXmlListValue(emitter, node);
}

export function producesXmlValue(emitter: Emitter, node: Node): boolean {
    return getExpressionType(emitter, node) === 'XML'
}

export function producesXmlListValue(emitter: Emitter, node: Node): boolean {
    return getExpressionType(emitter, node) === 'XMLList'
}

let returnTypeFromXmlMethod: { [key: string]: string; } = {
    'attribute': 'XMLList',
    'attributes': 'XMLList',
    'child': 'XMLList',
    'children': 'XMLList',
    'comments': 'XMLList',
    'copy': 'XML',
    'descendants': 'XMLList',
    'elements': 'XMLList',
    'normalize': 'XML',
    'processingInstructions': 'XMLList',
    'text': 'XMLList',
    'valueOf': 'XML',
};

let returnTypeFromXmlListMethod: { [key: string]: string; } = {
    'attribute': 'XMLList',
    'attributes': 'XMLList',
    'child': 'XMLList',
    'children': 'XMLList',
    'comments': 'XMLList',
    'copy': 'XMLList',
    'descendants': 'XMLList',
    'elements': 'XMLList',
    'normalize': 'XMLList',
    'processingInstructions': 'XMLList',
    'text': 'XMLList',
    'valueOf': 'XMLList',
};

export function getExpressionType(emitter: Emitter, node: Node): string {
    if (node.kind === NodeKind.IDENTIFIER) {
        if (isAnAccessorOnAnXmlOrXmlListValue(emitter, node)) {
            return 'XMLList';
        }

        const decl = emitter.findDefInScope(node.text);
        if (decl && decl.type) {
            return decl.type;
        }
    } else if (node.kind === NodeKind.E4X_ATTR || node.kind === NodeKind.E4X_ATTR_ARRAY_ACCESS || node.kind === NodeKind.E4X_FILTER || node.kind === NodeKind.E4X_STAR) {
        return 'XMLList';
    } else if (node.kind === NodeKind.DOT) {
        assert(node.children.length > 0);
        if (producesXmlOrXmlListValue(emitter, node.children[0])) {
            return 'XMLList';
        } else if (node.children[0].kind === NodeKind.IDENTIFIER && node.children[0].text === 'this') { // check if we're directly referencing a value from 'this', which we may know the type of
            assert(node.children[1].kind === NodeKind.LITERAL);
            const decl = emitter.findDefInScope(node.children[1].text);
            if (decl && decl.type) {
                return decl.type;
            }
        }
    } else if (node.kind === NodeKind.ARRAY_ACCESSOR) {
        assert(node.children.length > 0);
        if (producesXmlOrXmlListValue(emitter, node.children[0])) {
            return 'XMLList';
        }
    } else if (node.kind === NodeKind.CALL) {
        if (node.children[0].kind === NodeKind.DOT) {
            if (producesXmlValue(emitter, node.children[0].children[0]) && returnTypeFromXmlMethod.hasOwnProperty(node.children[0].children[1].text)) {
                return returnTypeFromXmlMethod[node.children[0].children[1].text];
            } else if (producesXmlListValue(emitter, node.children[0].children[0]) && returnTypeFromXmlListMethod.hasOwnProperty(node.children[0].children[1].text)) {
                return returnTypeFromXmlListMethod[node.children[0].children[1].text];
            }
        }
    }
    
    return null;
}

export function getConversionFunctionNameFromActionScriptType(emitter: Emitter, targetTypeInActionScript: string) {
    let remappedType = emitter.getTypeRemap(targetTypeInActionScript) || targetTypeInActionScript;

    return getConversionFunctionNameFromTypeScriptType(emitter, remappedType);
}

export function getConversionFunctionNameFromTypeScriptType(emitter: Emitter, targetTypeInTypeScript: string) {
    let conversionFunctionNameFromRemappedType: { [key: string]: string; } = {
        ['string']: 'String',
        ['number']: 'Number',
        ['XML']: 'XML.convertToXml',
    };

    if (conversionFunctionNameFromRemappedType.hasOwnProperty(targetTypeInTypeScript)) {
        return conversionFunctionNameFromRemappedType[targetTypeInTypeScript];
    } else {
        return null;
    }
}

export function emitExpressionWithConversion(emitter: Emitter, expressionNode :Node, conversionFunctionName: string): void {
    emitter.catchup(expressionNode.start);
    emitter.insert(conversionFunctionName);
    emitter.insert('(');
        visitNode(emitter, expressionNode);
        emitter.catchup(expressionNode.end);
    emitter.insert(')');
}