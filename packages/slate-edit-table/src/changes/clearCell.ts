import { Block, Change } from '@gitbook/slate';

import Options from '../options';

/*
 * Clear the content of the given cell
 */
function clearCell(
    opts: Options,
    change: Change,
    cell: Block,
    options: { normalize: boolean } = {}
): Change {
    const normalize = change.getFlag('normalize', options);
    const newBlock = Block.create({ type: opts.typeContent });
    const { nodes } = cell;

    // Insert a new empty node
    change.insertNodeByKey(cell.key, 0, newBlock, { normalize: false });

    // Remove all previous nodes
    nodes.forEach(node => {
        change.removeNodeByKey(node.key, { normalize: false });
    });

    if (normalize) {
        change.normalizeNodeByKey(cell.key);
    }

    return change;
}

export default clearCell;
