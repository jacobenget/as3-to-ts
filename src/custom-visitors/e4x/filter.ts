import Node from '../../syntax/node';
import Emitter, { visitNodes } from '../../emit/emitter';

export const state = {
    inE4XFilter: false,
};

export default function(emitter: Emitter, node: Node) {
    const filter = node.children[node.children.length - 1];
    const lastKid = filter.children[filter.children.length - 1];

    emitter.catchup(node.start - 1);
    emitter.skip(1);
    emitter.insert(`filter((n$) => `);
    state.inE4XFilter = true;

    visitNodes(emitter, node.children);

    state.inE4XFilter = false;
    emitter.insert(')');
    emitter.skipTo(node.end);

    return true;
}
