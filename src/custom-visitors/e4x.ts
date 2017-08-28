import Node, { createNode } from '../syntax/node';
import NodeKind from '../syntax/nodeKind';
import Emitter, { EmitterOptions, visitNode, visitNodes } from '../emit/emitter';
import { isXMLMethod } from '../emit/lib';

function isAccessor(node: Node) {
    return node.kind === NodeKind.DOT || node.kind === NodeKind.ARRAY_ACCESSOR;
}

function findLeafNode(leaf: Node) {
    while ((isAccessor(leaf) || leaf.kind === NodeKind.E4X_ATTR) && leaf.children.length) {
        leaf = leaf.children[0];
    }

    return leaf;
}

function isXMLRoot(emitter: Emitter, node: Node) {
    let leaf = findLeafNode(node);

    if (leaf.kind === NodeKind.IDENTIFIER) {
        const decl = emitter.scope.declarations.find(
            n => n.name === leaf.text
        );
        if (decl && decl.type === 'XML') {
            return true;
        }
    } 

    const sibling = leaf.parent.children[1];
    if (sibling && sibling.text && sibling.text[0] === '@') {
        return true;
    }

    if (node.children[1] && node.children[1].text && node.children[1].text[0] === '@') {
        return true;
    }

    return false;    
}


let inAssign = 0;
let inDelete = false;

function visit(emitter: Emitter, node: Node): boolean {
    let transformed = false;

    if (node.kind === NodeKind.ASSIGN) {
        const lhs = node.children[0];
        const rhs = node.children[2];
        if (isAccessor(lhs) && isXMLRoot(emitter, lhs)) {

            inAssign += 1;
            visitNode(emitter, lhs);
            inAssign -= 1;
            emitter.insert(', ');
            emitter.skipTo(rhs.start);
            visitNode(emitter, rhs);
            
            emitter.insert(')')

            transformed = true;
        } else {
            return false;
        }
    } else if (node.kind === NodeKind.E4X_ATTR) {
        visitNodes(emitter, node.children);
        return true;
    } else if (node.kind === NodeKind.DELETE) {
        const deleteTarget = node.children[0];
        if (isXMLRoot(emitter, deleteTarget)) {
            inDelete = true;
            emitter.catchup(node.start); 
            emitter.skipTo(node.end); 
            visitNode(emitter, deleteTarget);
            inDelete = false;
            transformed = true;
        }
   } else if (isAccessor(node)) {
        let accessingXML = isXMLRoot(emitter, node);
        const leaf = findLeafNode(node);
        const sibling = leaf.parent.children[1];

        if (!accessingXML) {
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

        let text = '';
        const isAttribute = (child.text && child.text[0] === '@') || (node.children[0].kind === NodeKind.E4X_ATTR);

        if (node.kind === NodeKind.ARRAY_ACCESSOR) {
            emitter.skip(1);
        }

        if (node.kind === NodeKind.DOT && child.kind === NodeKind.LITERAL) {
            emitter.catchup(child.start);
            text = `'${child.text.slice(isAttribute ? 1 : 0)}'`;
        } else if (child.kind === NodeKind.LITERAL || child.kind == NodeKind.IDENTIFIER) {
            emitter.insert('.');
            text = child.text;
        } else {
            emitter.insert('.');
        }     


        if (inAssign && emitter.dotChainDepth === 1) { 
            if (isAttribute) {
                emitter.insert(`setAttribute(${text}`);
            } else {
                emitter.insert(`setChild(${text}`);
            }

            if (!text) {
                visitNode(emitter, child);
                emitter.catchup(child.end);
            }
        } else if (inDelete && emitter.dotChainDepth === 1) {
            if (isAttribute) {
                emitter.insert(`removeAttributeByName(${text}`)
            } else {
                emitter.insert(`removeChildByName(${text}`)
            }

            if (!text) {
                visitNode(emitter, child);
                emitter.catchup(child.end);
            }

            emitter.insert(')');


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
