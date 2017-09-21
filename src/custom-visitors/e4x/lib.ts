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
    }
    
    return null;
}

export function getConversionFunctionNameFromActionScriptType(emitter: Emitter, targetTypeInActionScript: string) {
    let remappedType = emitter.getTypeRemap(targetTypeInActionScript) || targetTypeInActionScript;

    let conversionFunctionNameFromRemappedType: { [key: string]: string; } = {
        ['string']: 'String',
        ['number']: 'Number',
        ['XML']: 'XML.convertToXml',
    };

    if (conversionFunctionNameFromRemappedType.hasOwnProperty(remappedType)) {
        return conversionFunctionNameFromRemappedType[remappedType];
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

export function emitExpressionWithPossibleConversionTo(emitter: Emitter, expressionNode: Node, targetTypeInActionScript: string): boolean {
    if (producesXmlListValue(emitter, expressionNode)) {

        // ActionScript appears to perform some auto-conversions from XMLList to 'String', 'Number', 'int', 'unit', and 'XML'
        // based on what the type of the receiving variable when doing assignment.
        // So we'll to detect such situations and inject the needed conversions explicitly

        let conversionFunctionName = getConversionFunctionNameFromActionScriptType(emitter, targetTypeInActionScript);

        if (conversionFunctionName) {
            emitExpressionWithConversion(emitter, expressionNode, conversionFunctionName);
            return true;
        }
    }
    
    return false;
}