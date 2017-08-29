import Node, { createNode } from '../syntax/node';
import NodeKind from '../syntax/nodeKind';
import Emitter, { EmitterOptions } from '../emit/emitter';

function visit(emitter: Emitter, node: Node): boolean {
    if (node.kind === NodeKind.CLASS) {
        const name = node.children[0];
        let start = name.start;

        while (emitter.source[start] !== '\n') {
            start -= 1;
        }

        emitter.catchup(start + 1);
        emitter.ensureImportIdentifier('autobind', 'autobind-decorator');
        emitter.insert('@autobind\n');
    }
    return false;
}

export default {
    visit: visit
};
