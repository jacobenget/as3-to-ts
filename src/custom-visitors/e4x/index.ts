import Node from '../../syntax/node';
import NodeKind from '../../syntax/nodeKind';
import Emitter from '../../emit/emitter';

import emitAssign from './assignment';
import emitFilter from './filter';
import emitIdent from './identifier';
import emitAccessor from './accessors';
import emitDelete from './delete';
import emitLiteral from './literal';

import * as assert from 'assert';

function visit(emitter: Emitter, node: Node): boolean {

    let typesExportedFromShim = ["XML", "XMLList", "QName", "Namespace"];
    
    // if this node references one of the types exported by 'e4x_shim', make sure there's an import for this type
    if (node.kind === NodeKind.TYPE || node.kind === NodeKind.IDENTIFIER) {
        if (typesExportedFromShim.indexOf(node.text) !== -1) {
            emitter.ensureImportIdentifier(node.text, "e4x_shim", false);
        }
    } else if (node.kind === NodeKind.RELATION) {
        assert(node.children.length === 3);
        
        if (node.findChild(NodeKind.IS)) {
            if (node.lastChild.kind === NodeKind.IDENTIFIER && typesExportedFromShim.indexOf(node.lastChild.text) !== -1) {
                emitter.ensureImportIdentifier(node.lastChild.text, "e4x_shim", false);
            }
        }
    } else if (node.kind === NodeKind.XML_LITERAL) {
        emitter.ensureImportIdentifier('XML', "e4x_shim", false);
    }
    
    if (node.kind === NodeKind.ASSIGN) {
        return emitAssign(emitter, node);
    } else if (node.kind === NodeKind.E4X_FILTER) {
        return emitFilter(emitter, node);
    } else if (node.kind === NodeKind.IDENTIFIER) {
        return emitIdent(emitter, node);
    } else if (node.kind === NodeKind.DELETE) {
        return emitDelete(emitter, node);
    } else if (node.kind === NodeKind.XML_LITERAL) {
        return emitLiteral(emitter, node);
    } else {
        return emitAccessor(emitter, node);
    }
}

export default {
    visit: visit
};
