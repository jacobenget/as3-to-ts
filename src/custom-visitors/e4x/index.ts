import Node from '../../syntax/node';
import NodeKind from '../../syntax/nodeKind';
import Emitter from '../../emit/emitter';

import emitAssign from './assignment';
import emitFilter from './filter';
import emitIdent from './identifier';
import emitAccessor from './accessors';
import emitDelete from './delete';

function visit(emitter: Emitter, node: Node): boolean {

    if (node.kind === NodeKind.TYPE || node.kind === NodeKind.IDENTIFIER) {
        if (["XML", "XMLList", "QName", "Namespace"].indexOf(node.text) !== -1) {
            emitter.ensureImportIdentifier(node.text, "e4x_shim", false);
        }
    }
    
    if (node.kind === NodeKind.ASSIGN) {
        return emitAssign(emitter, node);
    } else if (node.kind === NodeKind.E4X_FILTER) {
        return emitFilter(emitter, node);
    } else if (node.kind === NodeKind.IDENTIFIER) {
        return emitIdent(emitter, node);
    } else if (node.kind === NodeKind.DELETE) {
        return emitDelete(emitter, node);
    } else {
        return emitAccessor(emitter, node);
    }
}

export default {
    visit: visit
};
