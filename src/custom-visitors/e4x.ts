import Node, { createNode } from '../syntax/node';
import NodeKind from '../syntax/nodeKind';
import Emitter, { EmitterOptions, visitNode } from '../emit/emitter';

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

        if (!accessingXML) {
            return false;
        }

        transformed = true;

        emitter.dotChainDepth += 1;
        emitter.isAccessingXML.push(accessingXML);

        visitNode(emitter, node.children[0]);
        const child = node.children[1];

        if (child.kind !== NodeKind.LITERAL) {
            throw new Error('Was never expecting this to be not true');
        }

        let text = '';
        const isAttribute = child.text[0] === '@';

        if (node.kind === NodeKind.DOT) {
            emitter.catchup(child.start);
            text = `'${child.text.slice(isAttribute ? 1 : 0)}'`;
        } else {
            emitter.insert('.');
            text = child.text;
        }       

        if (emitter.inAssign && emitter.dotChainDepth === 1) { 
            if (isAttribute) {
                emitter.insert(`setAttribute(${text}`);
            } else {
                emitter.insert(`setChild(${text}`);
            }
        } else {
            if (isAttribute) {
                emitter.insert(`attribute(${text})`);
            } else {
                emitter.insert(`child(${text})`);
            }
        }

        emitter.skipTo(node.end);

        // if (node.text[0] === '@') {
        //     emitter.insert(
        //         `${lastNode === node
        //             ? 'setAttribute'
        //             : 'attribute'}('${node.text.slice(1)}'`
        //     );

        //     if (lastNode !== node) {
        //         emitter.insert(')');
        //     }
        // } else {
        //     const accessingXML =
        //         emitter.isAccessingXML[emitter.isAccessingXML.length - 1];
        //     console.log('Accessing:', accessingXML);
        //     if (emitter.dotChainDepth && accessingXML && !isXMLMethod(node.text)) {
        //         console.log('CHILD:', emitter.inAssign, emitter.dotChainDepth);
        //         console.log('NODE:', node);
        //         console.log('Last Node:', lastNode);
        //         if (
        //             node === lastNode &&
        //             emitter.inAssign &&
        //             emitter.dotChainDepth === 1
        //         ) {
        //             emitter.insert(`setChild('${node.text}'`);
        //             emitter.settingChild = true;
        //         } else {
        //             emitter.insert(`child('${node.text}')`);
        //             emitter.settingChild = false;
        //             // if (emitter.childIndex) {
        //             //     const idx = emitter.childIndex;
        //             //     emitter.childIndex = null;
        //             //     // emitter.emit(idx);
        //             //     emitter.insert(', ');
        //             // }
        //         }
        //     } else {
        //         emitter.insert(node.text);
        //     }
        // }

        // visitNodes(emitter, node.children);

        emitter.isAccessingXML.pop();
        emitter.dotChainDepth -= 1;
    }

    return transformed;
}

export default {
    visit: visit
};
