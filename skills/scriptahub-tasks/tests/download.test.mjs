import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { downloadDocument, chooseRepository } from '../scripts/run.mjs';

test('repository choice stays within matching configured destinations and deduplicates candidates', () => {
    const first = 'https://example.test/books-one/collection.json';
    const second = 'https://example.test/books-two/collection.json';
    const third = 'https://example.test/books-three/collection.json';
    const repositories = [first, second, third];
    for (let index = 0; index < 20; index++) {
        const result = chooseRepository({ repositories, candidates: [first, first, second] });
        assert.deepEqual(result.candidates, [first, second]);
        assert.ok([first, second].includes(result.repository));
    }
    assert.equal(chooseRepository({ repositories, candidates: [second] }).repository, second);
    assert.throws(() => chooseRepository({ repositories, candidates: [] }), /matching candidates/);
    assert.throws(() => chooseRepository({ repositories: [first], candidates: [third] }), /outside/);
    const credentialUrl = 'https://user:password@example.test/collection.json';
    assert.throws(() => chooseRepository({ repositories: [credentialUrl], candidates: [credentialUrl] }), /Invalid catalogue/);
});

test('download verifies complete content and rejects path escapes, links, replacement and corruption', async () => {
    const previous = process.cwd();
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'scripta-download-'));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'scripta-outside-'));
    try {
        process.chdir(directory);
        const bytes = Buffer.from('%PDF-1.7\nverified manuscript\n');
        const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
        const source = async (tool, { offset }) => {
            assert.equal(tool, 'scriptahub_task_document_read');
            const data = bytes.subarray(offset, offset + 5);
            return { encoding:'base64', sha256, size:bytes.length, offset,
                nextOffset:offset+data.length, eof:offset+data.length===bytes.length, data:data.toString('base64') };
        };
        const input = { executionId:'execution-one', index:0, destination:'sources/main.pdf' };
        const result = await downloadDocument(source,input);
        assert.equal(result.sha256,sha256); assert.deepEqual(await fs.readFile(result.path),bytes);
        await assert.rejects(downloadDocument(source,input), /already exists/);
        await assert.rejects(downloadDocument(source,{...input,destination:'../escape.pdf'}), /inside/);
        await fs.symlink(outside,'linked');
        await assert.rejects(downloadDocument(source,{...input,destination:'linked/escape.pdf'}), /symlinks/);
        assert.deepEqual(await fs.readdir(outside),[]);
        const corrupt = async (tool,args) => ({...await source(tool,args),sha256:'0'.repeat(64)});
        await assert.rejects(downloadDocument(corrupt,{...input,destination:'sources/corrupt.pdf'}), /checksum/);
        assert.deepEqual(await fs.readdir('sources'),['main.pdf'], 'partial and corrupt files are removed');
        const broken = async () => { throw new Error('Execution is not running'); };
        await assert.rejects(downloadDocument(broken,{...input,destination:'sources/stopped.pdf'}), /not running/);
        assert.deepEqual(await fs.readdir('sources'),['main.pdf']);
    } finally {
        process.chdir(previous);
        await fs.rm(directory,{recursive:true,force:true});
        await fs.rm(outside,{recursive:true,force:true});
    }
});
