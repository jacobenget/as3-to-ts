import Node from '../../syntax/node';
import Emitter, { visitNode } from '../../emit/emitter';

import { isAccessor, isXMLRoot } from './lib';

export const state = {
    inAssignment: 0,
};

export default function(emitter: Emitter, node: Node) {
    const lhs = node.children[0];
    const rhs = node.children[2];
    if (isAccessor(lhs) && isXMLRoot(emitter, lhs)) {
        state.inAssignment += 1;

        visitNode(emitter, lhs);

        state.inAssignment -= 1;
        emitter.insert(', ');
        emitter.skipTo(rhs.start);
        visitNode(emitter, rhs);

        emitter.insert(')');

        return true;
    }
    
    return false;
}
