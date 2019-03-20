import { Block, Change, EditorContainer, Inline } from '@gitbook/slate';
import Base64 from '@gitbook/slate-base64-serializer';
import * as debug from '@gitbook/slate-debug';
import { IS_IOS } from '@gitbook/slate-dev-environment';
import Hotkeys from '@gitbook/slate-hotkeys';
import Plain from '@gitbook/slate-plain-serializer';
import getWindow from 'get-window';
import * as React from 'react';

import cloneFragment from '../utils/clone-fragment';
import findSlateDOMNode from '../utils/find-dom-node';
import findNode from '../utils/find-node';
import findPoint from '../utils/find-point';
import findRange from '../utils/find-range';
import getEventRange from '../utils/get-event-range';
import getEventTransfer from '../utils/get-event-transfer';
import setEventTransfer from '../utils/set-event-transfer';

import { Plugin } from './plugin';

const logger = debug.Logger('slate:after');

/*
 * The after plugin.
 */
function AfterPlugin(): Plugin {
    let isDraggingInternally = null;

    /*
     * On before input, correct any browser inconsistencies.
     */

    function onBeforeInput(
        event: Event,
        change: Change,
        editor: EditorContainer
    ) {
        logger('onBeforeInput', { event });

        event.preventDefault();
        change.insertText(event.data);
    }

    /*
     * On blur.
     */

    function onBlur(event: Event, change: Change, editor: EditorContainer) {
        logger('onBlur', { event });

        change.blur();
    }

    /*
     * On click.
     */

    function onClick(
        event: Event,
        change: Change,
        editor: EditorContainer
    ): boolean | void {
        if (editor.readOnly) {
            return true;
        }

        const { value } = change;
        const { document } = value;
        const node = findNode(event.target, value);

        if (!node) {
            return;
        }

        const isVoid = node.isVoid || document.hasVoidParent(node.key);

        if (isVoid) {
            // COMPAT: In Chrome & Safari, selections that are at the zero offset of
            // an inline node will be automatically replaced to be at the last offset
            // of a previous inline node, which screws us up, so we always want to set
            // it to the end of the node. (2016/11/29)
            change.focus().collapseToEndOf(node);
        }

        logger('onClick', { event });
    }

    /*
     * On copy.
     */

    function onCopy(event: Event, change: Change, editor: EditorContainer) {
        logger('onCopy', { event });

        cloneFragment(event, change.value);
    }

    /*
     * On cut.
     */

    function onCut(event: Event, change: Change, editor: EditorContainer) {
        logger('onCut', { event });

        const { value } = change;
        cloneFragment(event, value);

        if (editor.readOnly) {
            // We can only copy the content, so stop here
            return;
        }

        const window = getWindow(event.target);

        // Once the fake cut content has successfully been added to the clipboard,
        // delete the content in the current selection.
        window.requestAnimationFrame(() => {
            // If user cuts a void block node or a void inline node,
            // manually removes it since selection is collapsed in this case.
            const { endBlock, endInline, isCollapsed } = value;
            const isVoidBlock = endBlock && endBlock.isVoid && isCollapsed;
            const isVoidInline = endInline && endInline.isVoid && isCollapsed;

            if (isVoidBlock) {
                editor.change(c => c.removeNodeByKey(endBlock.key));
            } else if (isVoidInline) {
                editor.change(c => c.removeNodeByKey(endInline.key));
            } else {
                editor.change(c => c.delete());
            }
        });
    }

    /*
     * On drag end.
     */

    function onDragEnd(event: Event, change: Change, editor: EditorContainer) {
        logger('onDragEnd', { event });

        isDraggingInternally = null;
    }

    /*
     * On drag over.
     */

    function onDragOver(event: Event, change: Change, editor: EditorContainer) {
        logger('onDragOver', { event });
    }

    /*
     * On drag start.
     */

    function onDragStart(
        event: Event,
        change: Change,
        editor: EditorContainer
    ) {
        logger('onDragStart', { event });

        isDraggingInternally = true;

        const { value } = change;
        const { document } = value;
        const node = findNode(event.target, value);
        const isVoid =
            node && (node.isVoid || document.hasVoidParent(node.key));

        if (isVoid) {
            const encoded = Base64.serializeNode(node, { preserveKeys: true });
            setEventTransfer(event, 'node', encoded);
        } else {
            const { fragment } = value;
            const encoded = Base64.serializeNode(fragment);
            setEventTransfer(event, 'fragment', encoded);
        }
    }

    /*
     * On drop.
     */

    function onDrop(event: Event, change: Change, editor: EditorContainer) {
        logger('onDrop', { event });

        const { value } = change;
        const { document, selection } = value;
        const window = getWindow(event.target);
        let target = getEventRange(event, value);
        if (!target) {
            return;
        }

        const transfer = getEventTransfer(event);
        const { type, fragment, node, text } = transfer;

        change.focus();

        // If the drag is internal and the target is after the selection, it
        // needs to account for the selection's content being deleted.
        if (
            isDraggingInternally &&
            selection.endKey === target.endKey &&
            selection.endOffset < target.endOffset
        ) {
            target = target.move(
                selection.startKey === selection.endKey
                    ? 0 - selection.endOffset + selection.startOffset
                    : 0 - selection.endOffset
            );
        }

        if (isDraggingInternally) {
            change.delete();
        }

        change.select(target);

        if (type === 'text' || type === 'html') {
            const { anchorKey } = target;
            let hasVoidParent = document.hasVoidParent(anchorKey);

            if (hasVoidParent) {
                let n = document.getNode(anchorKey);

                while (hasVoidParent) {
                    n = document.getNextText(n.key);
                    if (!n) {
                        break;
                    }
                    hasVoidParent = document.hasVoidParent(n.key);
                }

                if (n) {
                    change.collapseToStartOf(n);
                }
            }

            if (text) {
                text.split('\n').forEach((line, i) => {
                    if (i > 0) {
                        change.splitBlock();
                    }
                    change.insertText(line);
                });
            }
        }

        if (type === 'fragment') {
            change.insertFragment(fragment);
        }

        if (type === 'node' && Block.isBlock(node)) {
            change.insertBlock(node.regenerateKey()).removeNodeByKey(node.key);
        }

        if (type === 'node' && Inline.isInline(node)) {
            change.insertInline(node.regenerateKey()).removeNodeByKey(node.key);
        }

        // COMPAT: React's onSelect event breaks after an onDrop event
        // has fired in a node: https://github.com/facebook/react/issues/11379.
        // Until this is fixed in React, we dispatch a mouseup event on that
        // DOM node, since that will make it go back to normal.
        const focusNode = document.getNode(target.focusKey);
        const el = findSlateDOMNode(focusNode, window);
        if (!el) {
            return;
        }

        el.dispatchEvent(
            new MouseEvent('mouseup', {
                view: window,
                bubbles: true,
                cancelable: true
            })
        );
    }

    /*
     * On input.
     */

    function onInput(event: Event, change: Change, editor: EditorContainer) {
        logger('onInput', { event });

        const window = getWindow(event.target);
        const { value } = change;

        // Get the selection point.
        const native = window.getSelection();
        const { anchorNode } = native;
        const point = findPoint(anchorNode, 0, value);
        if (!point) {
            return;
        }

        // Get the text node and leaf in question.
        const { document, selection } = value;
        const node = document.getDescendant(point.key);
        const block = document.getClosestBlock(node.key);
        const leaves = node.getLeaves();
        const lastText = block.getLastText();
        const lastLeaf = leaves.last();
        let start = 0;
        let end = 0;

        const leaf =
            leaves.find(r => {
                start = end;
                end += r.text.length;
                if (end > point.offset) {
                    return true;
                }
            }) || lastLeaf;

        // Get the text information.
        const { text } = leaf;
        let { textContent } = anchorNode;
        const isLastText = node === lastText;
        const isLastLeaf = leaf === lastLeaf;
        const lastChar = textContent.charAt(textContent.length - 1);

        // COMPAT: If this is the last leaf, and the DOM text ends in a new line,
        // we will have added another new line in <Leaf>'s render method to account
        // for browsers collapsing a single trailing new lines, so remove it.
        if (isLastText && isLastLeaf && lastChar === '\n') {
            textContent = textContent.slice(0, -1);
        }

        // If the text is no different, abort.
        if (textContent === text) {
            return;
        }

        // Determine what the selection should be after changing the text.
        const delta = textContent.length - text.length;
        const corrected = selection.collapseToEnd().move(delta);
        const entire = selection
            .moveAnchorTo(point.key, start)
            .moveFocusTo(point.key, end);

        // Change the current value to have the leaf's text replaced.
        change
            .insertTextAtRange(entire, textContent, leaf.marks)
            .select(corrected);
    }

    /*
     * On key down.
     */

    function onKeyDown(event: Event, change: Change, editor: EditorContainer) {
        logger('onKeyDown', { event });

        const { value } = change;

        // COMPAT: In iOS, some of these hotkeys are handled in the
        // `onNativeBeforeInput` handler of the `<Content>` component in order to
        // preserve native autocorrect behavior, so they shouldn't be handled here.
        if (Hotkeys.isSplitBlock(event) && !IS_IOS) {
            return value.isInVoid
                ? change.collapseToStartOfNextText()
                : change.splitBlock();
        }

        if (Hotkeys.isDeleteCharBackward(event) && !IS_IOS) {
            return change.deleteCharBackward();
        }

        if (Hotkeys.isDeleteCharForward(event) && !IS_IOS) {
            return change.deleteCharForward();
        }

        if (Hotkeys.isDeleteLineBackward(event)) {
            return change.deleteLineBackward();
        }

        if (Hotkeys.isDeleteLineForward(event)) {
            return change.deleteLineForward();
        }

        if (Hotkeys.isDeleteWordBackward(event)) {
            return change.deleteWordBackward();
        }

        if (Hotkeys.isDeleteWordForward(event)) {
            return change.deleteWordForward();
        }

        if (Hotkeys.isRedo(event)) {
            return change.redo();
        }

        if (Hotkeys.isUndo(event)) {
            return change.undo();
        }

        // COMPAT: Certain browsers don't handle the selection updates properly. In
        // Chrome, the selection isn't properly extended. And in Firefox, the
        // selection isn't properly collapsed. (2017/10/17)
        if (Hotkeys.isCollapseLineBackward(event)) {
            event.preventDefault();
            return change.collapseLineBackward();
        }

        if (Hotkeys.isCollapseLineForward(event)) {
            event.preventDefault();
            return change.collapseLineForward();
        }

        if (Hotkeys.isExtendLineBackward(event)) {
            event.preventDefault();
            return change.extendLineBackward();
        }

        if (Hotkeys.isExtendLineForward(event)) {
            event.preventDefault();
            return change.extendLineForward();
        }

        // COMPAT: If a void node is selected, or a zero-width text node adjacent to
        // an inline is selected, we need to handle these hotkeys manually because
        // browsers won't know what to do.
        if (Hotkeys.isCollapseCharBackward(event)) {
            const { document, isInVoid, previousText, startText } = value;
            const isPreviousInVoid =
                previousText && document.hasVoidParent(previousText.key);

            if (isInVoid || isPreviousInVoid || startText.text === '') {
                event.preventDefault();
                return change.collapseCharBackward();
            }
        }

        if (Hotkeys.isCollapseCharForward(event)) {
            const { document, isInVoid, nextText, startText } = value;
            const isNextInVoid =
                nextText && document.hasVoidParent(nextText.key);

            if (isInVoid || isNextInVoid || startText.text === '') {
                event.preventDefault();
                return change.collapseCharForward();
            }
        }

        if (Hotkeys.isExtendCharBackward(event)) {
            const { document, isInVoid, previousText, startText } = value;
            const isPreviousInVoid =
                previousText && document.hasVoidParent(previousText.key);

            if (isInVoid || isPreviousInVoid || startText.text === '') {
                event.preventDefault();
                return change.extendCharBackward();
            }
        }

        if (Hotkeys.isExtendCharForward(event)) {
            const { document, isInVoid, nextText, startText } = value;
            const isNextInVoid =
                nextText && document.hasVoidParent(nextText.key);

            if (isInVoid || isNextInVoid || startText.text === '') {
                event.preventDefault();
                return change.extendCharForward();
            }
        }
    }

    /*
     * On paste.
     */

    function onPaste(event: Event, change: Change, editor: EditorContainer) {
        logger('onPaste', { event });

        const transfer = getEventTransfer(event);
        const { type, fragment, text } = transfer;

        if (type === 'fragment') {
            change.insertFragment(fragment);
        }

        if (type === 'text' || type === 'html') {
            if (!text) {
                return;
            }
            const { value } = change;
            const { document, selection, startBlock } = value;
            if (startBlock.isVoid) {
                return;
            }

            const defaultBlock = startBlock;
            const defaultMarks = document.getInsertMarksAtRange(selection);
            const frag = Plain.deserialize(text, { defaultBlock, defaultMarks })
                .document;
            change.insertFragment(frag);
        }
    }

    /*
     * On select.
     */

    function onSelect(event: Event, change: Change, editor: EditorContainer) {
        logger('onSelect', { event });

        const window = getWindow(event.target);
        const { value } = change;
        const { document } = value;
        const native = window.getSelection();

        // If there are no ranges, the editor was blurred natively.
        if (!native.rangeCount) {
            change.blur();
            return;
        }

        // Otherwise, determine the Slate selection from the native one.
        let range = findRange(native, value);
        if (!range) {
            return;
        }

        const { anchorKey, anchorOffset, focusKey, focusOffset } = range;
        const anchorText = document.getNode(anchorKey);
        const focusText = document.getNode(focusKey);
        const anchorInline = document.getClosestInline(anchorKey);
        const focusInline = document.getClosestInline(focusKey);
        const focusBlock = document.getClosestBlock(focusKey);
        const anchorBlock = document.getClosestBlock(anchorKey);

        // COMPAT: If the anchor point is at the start of a non-void, and the
        // focus point is inside a void node with an offset that isn't `0`, set
        // the focus offset to `0`. This is due to void nodes <span>'s being
        // positioned off screen, resulting in the offset always being greater
        // than `0`. Since we can't know what it really should be, and since an
        // offset of `0` is less destructive because it creates a hanging
        // selection, go with `0`. (2017/09/07)
        if (
            anchorBlock &&
            !anchorBlock.isVoid &&
            anchorOffset === 0 &&
            focusBlock &&
            focusBlock.isVoid &&
            focusOffset !== 0
        ) {
            range = range.set('focusOffset', 0);
        }

        // COMPAT: If the selection is at the end of a non-void inline node, and
        // there is a node after it, put it in the node after instead. This
        // standardizes the behavior, since it's indistinguishable to the user.
        if (
            anchorInline &&
            !anchorInline.isVoid &&
            anchorOffset === anchorText.text.length
        ) {
            const block = document.getClosestBlock(anchorKey);
            const next = block.getNextText(anchorKey);
            if (next) {
                range = range.moveAnchorTo(next.key, 0);
            }
        }

        if (
            focusInline &&
            !focusInline.isVoid &&
            focusOffset === focusText.text.length
        ) {
            const block = document.getClosestBlock(focusKey);
            const next = block.getNextText(focusKey);
            if (next) {
                range = range.moveFocusTo(next.key, 0);
            }
        }

        range = range.normalize(document);

        // Preserve active marks from the current selection.
        // They will be cleared by `change.select` if the selection actually moved.
        range = range.set('marks', value.selection.marks);

        change.select(range);
    }

    /*
     * Render node.
     */

    function renderNode(props) {
        const { attributes, children, node } = props;
        if (node.object !== 'block' && node.object !== 'inline') {
            return;
        }
        const Tag = node.object === 'block' ? 'div' : 'span';
        const style = { position: 'relative' };
        return (
            <Tag {...attributes} style={style}>
                {children}
            </Tag>
        );
    }

    return {
        onBeforeInput,
        onBlur,
        onClick,
        onCopy,
        onCut,
        onDragEnd,
        onDragOver,
        onDragStart,
        onDrop,
        onInput,
        onKeyDown,
        onPaste,
        onSelect,
        renderNode
    };
}

export default AfterPlugin;
