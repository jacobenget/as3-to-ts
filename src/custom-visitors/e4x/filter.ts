import Node from '../../syntax/node';
import Emitter, { visitNode } from '../../emit/emitter';
import * as assert from 'assert';

export const state = {
    inE4XFilter: false,
};

export default function(emitter: Emitter, node: Node) {
    assert(node.children.length === 2);
    
    const thatBeingFiltered = node.children[0];
    const filter = node.children[1];

    visitNode(emitter, thatBeingFiltered);
    emitter.catchup(thatBeingFiltered.end);
    
    assert(emitter.sourceBetween(emitter.index, emitter.index + 2) === '.('); // ensure we aren't skipping any comments between these tokens
    
    emitter.skip(2);    // skip the '.('
    emitter.insert(`.filter((n$) =>`);
    // ensure there's a space after the fat arrow
    if (/\S/.test(emitter.sourceBetween(emitter.index, emitter.index + 1))) {
        emitter.insert(' ');
    }
    
    state.inE4XFilter = true;

    visitNode(emitter, filter);

    state.inE4XFilter = false;
    emitter.catchup(node.end);  // catchup all the way to the end ')'

    return true;
}
