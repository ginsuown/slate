/* @jsx h */

import { Inline } from '@gitbook/slate';
import h from '../../../helpers/h';

export default function(change) {
    change.insertInline(
        Inline.create({
            type: 'emoji',
            isVoid: true
        })
    );
}

export const input = (
    <value>
        <document>
            <paragraph>
                wo
                <cursor />
                rd
            </paragraph>
        </document>
    </value>
);

export const output = (
    <value>
        <document>
            <paragraph>
                wo
                <emoji>
                    <cursor />
                </emoji>
                rd
            </paragraph>
        </document>
    </value>
);
