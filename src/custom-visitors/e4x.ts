import Node, { createNode } from '../syntax/node';
import NodeKind from '../syntax/nodeKind';
import Emitter, { EmitterOptions, visitNode } from '../emit/emitter';
import { isXMLMethod } from '../emit/lib';

function visit(emitter: Emitter, node: Node): boolean {
    let transformed = false;

    if (node.kind === NodeKind.DOT || node.kind === NodeKind.ARRAY_ACCESSOR) {
        let accessingXML = false;
        let leaf = node;
        while ((leaf.kind == NodeKind.ARRAY_ACCESSOR || leaf.kind === NodeKind.DOT) && leaf.children.length) {
            leaf = leaf.children[0];
        }

        if (leaf.kind === NodeKind.IDENTIFIER) {
            const decl = emitter.scope.declarations.find(
                n => n.name === leaf.text
            );
            if (decl && decl.type === 'XML') {
                accessingXML = true;
            }
        }

        const sibling = leaf.parent.children[1];
        if (!accessingXML && !(sibling.text && sibling.text[0] === '@')) {
            return false;
        }

        transformed = true;

        emitter.dotChainDepth += 1;
        emitter.isAccessingXML.push(accessingXML);

        visitNode(emitter, node.children[0]);
        const child = node.children[1];

        if (isXMLMethod(child.text)) {
            emitter.catchup(node.end);
            emitter.isAccessingXML.pop();
            emitter.dotChainDepth -= 1;
            return true;
        }

        // if (child.kind !== NodeKind.LITERAL && child.kind !== NodeKind.IDENTIFIER && child.kind !== NodeKind.ARRAY_ACCESSOR) {
        //     console.log(node.toString())
        //     throw new Error('Was never expecting this to be not true');
        // }

        let text = '';
        const isAttribute = child.text && child.text[0] === '@';

        if (node.kind === NodeKind.ARRAY_ACCESSOR) {
            emitter.skip(1);
        }

        if (node.kind === NodeKind.DOT && child.kind === NodeKind.LITERAL) {
            emitter.catchup(child.start);
            text = `'${child.text.slice(isAttribute ? 1 : 0)}'`;
        } else if (child.kind === NodeKind.LITERAL || child.kind == NodeKind.IDENTIFIER) {
            emitter.insert('.');
            text = child.text;
        // } else if (child.kind === NodeKind.ARRAY_ACCESSOR) {
        //     emitter.insert('.');
        //     emitter.skip(1);
        } else {
            emitter.insert('.');
        }     

        if (emitter.inAssign && emitter.dotChainDepth === 1) { 
            if (isAttribute) {
                emitter.insert(`setAttribute(${text}`);
            } else {
                emitter.insert(`setChild(${text}`);
            }

            if (!text) {
                visitNode(emitter, child);
                emitter.catchup(child.end);
            }

        } else {
            if (isAttribute) {
                emitter.insert(`attribute(${text}`);
            } else {
                emitter.insert(`child(${text}`);
            }

            if (!text) {
                visitNode(emitter, child);
                emitter.catchup(child.end);
            }

            emitter.insert(')');
        }

        emitter.skipTo(node.end);

        emitter.isAccessingXML.pop();
        emitter.dotChainDepth -= 1;
    }

    return transformed;
}

export default {
    visit: visit
};
