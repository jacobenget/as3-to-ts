import Node from '../../syntax/node';
import NodeKind from '../../syntax/nodeKind';
import Emitter from '../../emit/emitter';
import {isAnAccessorOnAnXmlValue} from './lib';
import * as assert from 'assert';

export default function(emitter: Emitter, node: Node) {
    
    if (isAnAccessorOnAnXmlValue(emitter, node)) {
        
        let representsAFunction = node.parent.kind == NodeKind.CALL;
        
        assert(node.text.indexOf('*') === -1);  // no code yet to include accessing either '*' or '@*' in an unqualified way inside a filter callback
        
        if (representsAFunction) {
            // turn:
            //    ident()
            // into:
            //    n$.ident()
            
            emitter.catchup(node.start);
            emitter.insert(`n$.${node.text}`);
            emitter.skipTo(node.end);
            
        } else {
            // turn:
            //    ident
            //    @ident
            // into:
            //    n$.$get('ident')
            //    n$.$getAttribute('ident')
            // respectively

            // General approach:
            //  1. emit 'n$'
            //  2. emit .$get( or .$getAttribute(
            //  3. emit ident
            //  4. emit ')'

            //  1. emit 'n$'
            emitter.catchup(node.start);
            emitter.insert('n$');

            let isReferencingAnAttribute = node.text[0] === '@';

            //  2. emit .$get( or .$getAttribute(
            if (isReferencingAnAttribute) {
                emitter.insert('.$getAttribute(');
            } else {
                emitter.insert('.$get(');
            }

            //  3. emit ident
            emitter.insert(`'${isReferencingAnAttribute ? node.text.slice(1) : node.text}'`);

            //  4. emit ')'
            emitter.insert(')');

            emitter.skipTo(node.end);
        }
        
        return true;
    } else {
        return false;
    }
}
