import Node from '../../syntax/node';
import NodeKind from '../../syntax/nodeKind';
import Emitter, {identifierHasDefinition} from '../../emit/emitter';
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
    if (node.kind === NodeKind.IDENTIFIER) {
        const decl = emitter.findDefInScope(node.text);
        return decl && decl.type === 'XML';
    } else {
        return false;
    }
}

export function producesXmlListValue(emitter: Emitter, node: Node): boolean {
    if (node.kind === NodeKind.IDENTIFIER) {
        if (isAnAccessorOnAnXmlOrXmlListValue(emitter, node)) {
            return true;
        }

        const decl = emitter.findDefInScope(node.text);
        return decl && decl.type === 'XMLList';
    } else if (node.kind === NodeKind.E4X_ATTR || node.kind === NodeKind.E4X_ATTR_ARRAY_ACCESS || node.kind === NodeKind.E4X_FILTER || node.kind === NodeKind.E4X_STAR) {
        return true;
    } else if (node.kind === NodeKind.DOT || node.kind === NodeKind.ARRAY_ACCESSOR) {
        assert(node.children.length > 0);
        return producesXmlOrXmlListValue(emitter, node.children[0]);
    } else {
        return false;
    }
}