import Node from '../../syntax/node';
import * as Operators from '../../syntax/operators'
import Emitter, { visitNode } from '../../emit/emitter';
import * as assert from 'assert';

import { isAccessor, isXMLRoot } from './lib';

export const state = {
    inAssignment: 0,
};

export default function(emitter: Emitter, node: Node) {
    const lhs = node.children[0];
    const op = node.children[1];
    const rhs = node.children[2];
    if (isAccessor(lhs) && isXMLRoot(emitter, lhs)) {
        assert(op.text === Operators.EQUAL);    // we have no logic yet to handle expressions like '+=' when the rhs is XML/XMLList, so assert if something like this is encountered
        
        state.inAssignment += 1;

        visitNode(emitter, lhs);

        state.inAssignment -= 1;
        
        emitter.catchup(op.start);
        // remove any trailing whitespace, so the comma inserted below directly follows the closest non-whitespace character before it
        emitter.output = emitter.output.replace(/\s+$/, '');
        emitter.insert(',');
        emitter.skipTo(op.end);
        
        visitNode(emitter, rhs);

        emitter.catchup(node.end);
        emitter.insert(')');

        return true;
    }
    
    return false;
}
