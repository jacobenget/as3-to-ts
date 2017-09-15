import Node from '../../syntax/node';
import NodeKind from '../../syntax/nodeKind';
import * as Operators from '../../syntax/operators'
import Emitter, { visitNode } from '../../emit/emitter';
import * as assert from 'assert';

import { isAnAccessorOnAnXmlValue } from './lib';

export default function(emitter: Emitter, node: Node) {
    const lhs = node.children[0];
    const op = node.children[1];
    const rhs = node.children[2];
    
    if (isAnAccessorOnAnXmlValue(emitter, lhs)) {

        assert(op.text === Operators.EQUAL);    // we have no logic yet to handle expressions like '+=' when the rhs is XML/XMLList, so assert if something like this is encountered

        let root = lhs.children[0];
        let tail = lhs.children[1];
        
        // turn:
        //    root.tail = rhs     // (includes tail === '*')
        //    root.@tail = rhs     // (includes tail === '*')
        //    root[tail] = rhs
        //    root.@[tail] = rhs
        // into:
        //    root.$put('tail', rhs)
        //    root.$putAttribute('tail', rhs)
        //    root.$put(tail, rhs)
        //    root.$putAttribute(tail, rhs)
        // respectively
        
        // NOTE: some comments/whitespace in original source will be lost, due to what information is retained by the parser, but this is currently acceptable
        // I.e. this:
        //      root/*comment lost*/ . /*comment lost*/ tail /*comment lost*/ = /*comment kept*/ rhs
        // becomes this:
        //      root.$put('tail', /*comment kept*/ rhs)
        
        // General approach:
        //  1. emit root
        //  2. emit .$put( or .$putAttribute(
        //  3. emit tail
        //  4. emit ','
        //  5. emit everything between operator and rhs
        //  6. emit rhs
        //  7. catchup to end of rhs
        //  8. emit ')'

        //  1. emit root
        visitNode(emitter, root);
        emitter.catchup(root.end);

        //  2. emit .$put( or .$putAttribute(
        if (lhs.kind === NodeKind.DOT || lhs.kind === NodeKind.ARRAY_ACCESSOR || lhs.kind === NodeKind.E4X_STAR) {
            emitter.insert('.$put(');
        } else if (lhs.kind === NodeKind.E4X_ATTR || lhs.kind === NodeKind.E4X_ATTR_ARRAY_ACCESS) {
            emitter.insert('.$putAttribute(');
        } else {
            assert(false);
        }

        //  3. emit tail
        if (lhs.kind === NodeKind.DOT || lhs.kind === NodeKind.E4X_ATTR) {
            assert(tail.kind === NodeKind.LITERAL);
            emitter.insert(`'${tail.text}'`);
        } else if (lhs.kind === NodeKind.E4X_STAR) {
            assert(typeof tail === 'undefined');
            emitter.insert(`'*'`);
        } else if (lhs.kind === NodeKind.ARRAY_ACCESSOR || lhs.kind === NodeKind.E4X_ATTR_ARRAY_ACCESS) {
            emitter.skipTo(tail.start);
            visitNode(emitter, tail);
            emitter.catchup(tail.end);
        } else {
            assert(false);
        }
        
        //  4. emit ','
        emitter.insert(',');
        
        //  5. emit everything between operator and rhs
        emitter.skipTo(op.end);
        emitter.catchup(rhs.start);
        
        //  6. emit rhs
        visitNode(emitter, rhs);
        
        //  7. catchup to end of rhs
        emitter.catchup(rhs.end);
        
        //  8. emit ')'
        emitter.insert(')');
        
        return true;
    }
    
    return false;
}
