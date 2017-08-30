import Node, { createNode } from '../../syntax/node';
import NodeKind from '../../syntax/nodeKind';
import Emitter, {
    EmitterOptions,
    visitNode,
    visitNodes
} from '../../emit/emitter';
import { isXMLMethod } from './lib';
import { isAccessor, isXMLRoot, findLeafNode } from './lib';

import emitAssign from './assignment';
import emitFilter from './filter';
import emitIdent from './identifier';
import emitAccessor from './accessors';
import emitDelete from './delete';

function visit(emitter: Emitter, node: Node): boolean {

    if (node.kind === NodeKind.ASSIGN) {
        return emitAssign(emitter, node);
    } else if (node.kind === NodeKind.E4X_FILTER) {
        return emitFilter(emitter, node);
    } else if (node.kind === NodeKind.IDENTIFIER) {
        return emitIdent(emitter, node);
    } else if (node.kind === NodeKind.DELETE) {
        return emitDelete(emitter, node);
    } else if (isAccessor(node)) {
        return emitAccessor(emitter, node);
    }

    return false;
}

export default {
    visit: visit
};
