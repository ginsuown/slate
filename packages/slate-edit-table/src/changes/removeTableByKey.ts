import { Block, Change, Text } from '@gitbook/slate';

import Options from '../options';
import { TablePosition } from '../utils';

/*
 * Delete the whole table at the given node key
 */

function removeTableByKey(
    opts: Options,
    change: Change,
    key: string,
    options: {
        normalize?: boolean;
    } = {}
): Change {
    const { value } = change;

    const pos = TablePosition.create(opts, value.document, key);
    const { table } = pos;
    const { document } = change.value;
    let nextFocusBlock = null;
    let shouldCollapseToEnd = false;

    const nextBlock = change.value.document.getNextBlock(table.key);

    if (nextBlock) {
        nextFocusBlock = nextBlock;
    } else {
        const prevBlock = change.value.document.getPreviousBlock(table.key);

        if (prevBlock) {
            nextFocusBlock = prevBlock;
            shouldCollapseToEnd = true;
        } else if (opts.exitBlockType) {
            nextFocusBlock = Block.create({
                type: opts.exitBlockType,
                nodes: [Text.create('')]
            });

            const tableParent = document.getParent(table.key);
            const insertionIndex = tableParent.nodes.indexOf(table) + 1;

            change.insertNodeByKey(
                tableParent.key,
                insertionIndex,
                nextFocusBlock,
                options
            );
        }
    }

    change.removeNodeByKey(table.key, options);

    if (!nextFocusBlock) {
        return change;
    }

    if (shouldCollapseToEnd) {
        change.collapseToEndOf(nextFocusBlock).focus();
    } else {
        change.collapseToStartOf(nextFocusBlock).focus();
    }
    return change;
}

export default removeTableByKey;
