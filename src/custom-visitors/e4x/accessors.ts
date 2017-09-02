import Node from '../../syntax/node';
import NodeKind from '../../syntax/nodeKind';
import Emitter, { visitNode } from '../../emit/emitter';

import { isXMLRoot, findLeafNode, isXMLMethod } from './lib';
import { state as assignState } from './assignment';
import { state as deleteState } from './delete';

const state = {
    dotChainDepth: 0,
};

export default function emitAccessor(emitter: Emitter, node: Node) {
        let accessingXML = isXMLRoot(emitter, node);
        const leaf = findLeafNode(node);
        const sibling = leaf.parent.children[1];

        if (!accessingXML) {
            return false;
        }

        state.dotChainDepth += 1;
        // isAccessingXML.push(accessingXML);

        visitNode(emitter, node.children[0]);
        const child = node.children[1];

        if (isXMLMethod(child.text)) {
            emitter.catchup(node.end);
            // isAccessingXML.pop();
            state.dotChainDepth -= 1;
            return true;
        }

        let text = '';
        const isAttribute =
            (child.text && child.text[0] === '@') ||
            node.children[0].kind === NodeKind.E4X_ATTR;

        if (node.kind === NodeKind.ARRAY_ACCESSOR) {
            emitter.skip(1);
        }

        if (node.kind === NodeKind.DOT && child.kind === NodeKind.LITERAL) {
            emitter.catchup(child.start);
            text = `'${child.text.slice(isAttribute ? 1 : 0)}'`;
        } else if (
            child.kind === NodeKind.LITERAL ||
            child.kind == NodeKind.IDENTIFIER
        ) {
            emitter.insert('.');
            text = child.text;
        } else {
            emitter.insert('.');
        }

        if (assignState.inAssignment && state.dotChainDepth === 1) {
            if (isAttribute) {
                emitter.insert(`$putAttribute(${text}`);
            } else {
                emitter.insert(`$put(${text}`);
            }

            if (!text) {
                visitNode(emitter, child);
                emitter.catchup(child.end);
            }
        } else if (deleteState.inDelete && state.dotChainDepth === 1) {
            if (isAttribute) {
                emitter.insert(`$deleteAttribute(${text}`);
            } else {
                emitter.insert(`$delete(${text}`);
            }

            if (!text) {
                visitNode(emitter, child);
                emitter.catchup(child.end);
            }

            emitter.insert(')');
        } else {
            if (isAttribute) {
                emitter.insert(`$getAttribute(${text}`);
            } else {
                emitter.insert(`$get(${text}`);
            }

            if (!text) {
                visitNode(emitter, child);
                emitter.catchup(child.end);
            }

            emitter.insert(')');
        }

        emitter.skipTo(node.end);

        // isAccessingXML.pop();
        state.dotChainDepth -= 1;

        return true;
}