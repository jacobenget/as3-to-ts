import Node from '../../syntax/node';
import NodeKind from '../../syntax/nodeKind';
import Emitter, { visitNode } from '../../emit/emitter';

import { isXMLRoot } from './lib';

export const state = {
    inDelete: false,
};

export default function(emitter: Emitter, node: Node) {
    const deleteTarget = node.children[0];
    if (isXMLRoot(emitter, deleteTarget)) {
        state.inDelete = true;
        emitter.catchup(node.start);
        emitter.skipTo(node.end);
        visitNode(emitter, deleteTarget);
        state.inDelete = false;
        return true;
    }

    return false;
}
