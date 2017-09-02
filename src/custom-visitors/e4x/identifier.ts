import Node from '../../syntax/node';
import NodeKind from '../../syntax/nodeKind';
import Emitter, { visitNodes } from '../../emit/emitter';
import * as Keywords from '../../syntax/keywords';

import { GLOBAL_NAMES, TYPE_REMAP } from '../../emit/emitter';

import { isXMLMethod } from './lib';
import { state as filterState } from './filter';

export default function(emitter: Emitter, node: Node) {
    if (!filterState.inE4XFilter) {
        return false;
    }

    if (node.parent && node.parent.kind === NodeKind.DOT) {
        //in case of dot just check the first
        if (node.parent.children[0] !== node) {
            return false;
        }
    }

    if (Keywords.isKeyWord(node.text)) {
        return false;
    }

    emitter.catchup(node.start);

    let def = emitter.findDefInScope(node.text);
    if (def && def.bound) {
        emitter.insert(def.bound + '.');
    }

    let thisAttached = false;

    if (
        !def &&
        emitter.currentClassName &&
        GLOBAL_NAMES.indexOf(node.text) === -1 &&
        TYPE_REMAP[node.text] === undefined &&
        node.text !== emitter.currentClassName
    ) {
        if (node.text.match(/^[A-Z]/)) {
            // Import missing identifier from this namespace
            if (!emitter.options.useNamespaces) {
                emitter.ensureImportIdentifier(node.text);
            }
        } else if (emitter.emitThisForNextIdent) {
            thisAttached = true;
            // Identifier belongs to `this.` scope.
            emitter.insert('n$.');
        }
    }

    node.text = emitter.getIdentifierRemap(node.text) || node.text;

    let nodeVal = node.text;

    if (node.text[0] === '@') {
        emitter.insert(`$getAttribute('${node.text.slice(1)}')`);
    } else if (thisAttached && !isXMLMethod(node.text)) {
        emitter.insert(`$get('${node.text}')`);
    } else {
        emitter.insert(node.text);
    }

    emitter.skipTo(node.end);
    emitter.emitThisForNextIdent = true;

    return true;
}
