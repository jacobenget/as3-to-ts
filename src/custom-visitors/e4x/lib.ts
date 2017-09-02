import Node from '../../syntax/node';
import NodeKind from '../../syntax/nodeKind';
import Emitter from '../../emit/emitter';

export function isAccessor(node: Node) {
    return node.kind === NodeKind.DOT || node.kind === NodeKind.ARRAY_ACCESSOR;
}

export function findLeafNode(leaf: Node) {
    while (
        (isAccessor(leaf) || leaf.kind === NodeKind.E4X_ATTR) &&
        leaf.children.length
    ) {
        leaf = leaf.children[0];
    }

    return leaf;
}

export function isXMLRoot(emitter: Emitter, node: Node) {
    let leaf = findLeafNode(node);

    if (leaf.kind === NodeKind.IDENTIFIER) {
        const decl = emitter.scope.declarations.find(n => n.name === leaf.text);
        if (decl && (decl.type === 'XML' || decl.type === 'XMLList')) {
            return true;
        }
    }

    const sibling = leaf.parent.children[1];
    if (sibling && sibling.text && sibling.text[0] === '@') {
        return true;
    }

    if (
        node.children[1] &&
        node.children[1].text &&
        node.children[1].text[0] === '@'
    ) {
        return true;
    }

    if (node.children[0] && node.children[0].kind === NodeKind.E4X_ATTR) {
        return true;
    }

    return false;
}

export function isXMLMethod(childName: string): boolean {
    return (
        [
            'addNamespace',
            'appendChild',
            'attribute',
            'attributes',
            'child',
            'childIndex',
            'children',
            'comments',
            'contains',
            'copy',
            'defaultSettings',
            'descendants',
            'elements',
            'hasComplexContent',
            'hasOwnProperty',
            'hasSimpleContent',
            'inScopeNamespaces',
            'insertChildAfter',
            'insertChildBefore',
            'length',
            'localName',
            'name',
            'namespace',
            'namespaceDeclarations',
            'nodeKind',
            'normalize',
            'parent',
            'prependChild',
            'processingInstructions',
            'propertyIsEnumerable',
            'removeNamespace',
            'replace',
            'setChildren',
            'setLocalName',
            'setName',
            'setNamespace',
            'setSettings',
            'settings',
            'text',
            'toJSON',
            'toString',
            'toXMLString',
            'valueOf'
        ].indexOf(childName) !== -1
    );
}