import fs from 'node:fs/promises';
import {preflight,writeHandoff,verifyPackage,requirePreflight} from './workflow-checks.mjs';
import { constants } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';

const operations = { claim: 'scriptahub_task_claim', status: 'scriptahub_task_status', finish: 'scriptahub_task_finish' };
export function chooseRepository({ repositories, candidates } = {}) {
    if (!Array.isArray(repositories) || !Array.isArray(candidates) || !candidates.length) throw new Error('Provide configured repositories and matching candidates');
    const unique = [...new Set(candidates)];
    for (const candidate of unique) {
        if (typeof candidate !== 'string' || !repositories.includes(candidate)) throw new Error('Candidate is outside the configured repository list');
        const url = new URL(candidate);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/collection.json')) throw new Error('Invalid catalogue URL');
    }
    return { repository: unique[crypto.randomInt(unique.length)], candidates: unique };
}
function unwrap(response) {
    if (response?.isError) throw new Error('ScriptaHub rejected the task operation');
    const result = Array.isArray(response?.content)
        ? JSON.parse(response.content.filter(item => item.type === 'text').map(item => item.text).join('\n')) : response;
    if (!result || result.error || result.ok === false) throw new Error(result?.error || 'Invalid ScriptaHub response');
    return result;
}

async function loadClient() {
    const directory = '/workspace/ploinky-runtime';
    const setup = JSON.parse(await fs.readFile(path.join(directory, 'context.json'), 'utf8'));
    if (setup.version !== 2 || !path.isAbsolute(setup.workingDir)) throw new Error('A RoboTeam Ploinky task runtime is required');
    for (const [name, value] of Object.entries(setup.env || {})) {
        if (!name.startsWith('PLOINKY_') || /MASTER|PRIVATE_SECRET|SUBJECT|PASSWORD/i.test(name) || typeof value !== 'string') throw new Error('Invalid task SDK environment');
        process.env[name] = value;
    }
    const { createAgentClient } = await import(pathToFileURL(path.join(directory, 'sdk/client/AgentMcpClient.mjs')).href);
    // This is a service call. Never copy setup.userDelegationToken into the client.
    return createAgentClient(process.env.SCRIPTA_TASK_AGENT || 'scriptahubAgent');
}

export async function downloadDocument(call, input) {
    const { executionId, index, destination } = input;
    if (typeof destination !== 'string' || !destination || path.isAbsolute(destination)) throw new Error('Use a relative destination inside the working directory');
    const root = await fs.realpath(process.cwd());
    const target = path.resolve(root, destination);
    if (!target.startsWith(root + path.sep)) throw new Error('Destination must stay inside the working directory');
    let directory = root;
    for (const part of path.relative(root, path.dirname(target)).split(path.sep).filter(Boolean)) {
        directory = path.join(directory, part);
        await fs.mkdir(directory, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
        const stat = await fs.lstat(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Destination directories must not be symlinks');
    }
    if (await fs.lstat(target).then(() => true, error => error.code === 'ENOENT' ? false : Promise.reject(error))) throw new Error('Destination already exists');
    const temporary = target + '.' + crypto.randomUUID() + '.partial';
    const handle = await fs.open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    const hash = crypto.createHash('sha256');
    let offset = 0, expected, total;
    try {
        while (true) {
            const chunk = await call('scriptahub_task_document_read', { executionId, index, offset, length: 196608 });
            if (chunk.encoding !== 'base64' || !/^[a-f0-9]{64}$/.test(chunk.sha256 || '')
                || !Number.isSafeInteger(chunk.size) || chunk.size < 1 || chunk.size > 50000000
                || chunk.offset !== offset || typeof chunk.data !== 'string' || chunk.data.length > 262144) throw new Error('Invalid document chunk');
            expected ??= chunk.sha256; total ??= chunk.size;
            const bytes = Buffer.from(chunk.data, 'base64');
            if (expected !== chunk.sha256 || total !== chunk.size || bytes.length < 1
                || chunk.nextOffset !== offset + bytes.length || chunk.nextOffset > total
                || chunk.eof !== (chunk.nextOffset === total)) throw new Error('Document changed during download');
            await handle.writeFile(bytes); hash.update(bytes); offset = chunk.nextOffset;
            if (chunk.eof) break;
        }
        if (offset !== total || hash.digest('hex') !== expected) throw new Error('Downloaded document checksum mismatch');
        await handle.sync();
        // link creates the final file without overwriting an existing destination.
        await fs.link(temporary, target);
        return { path: target, sha256: expected, size: offset };
    } finally { await handle.close(); await fs.rm(temporary, { force: true }); }
}

// Transfer validated bytes, never a server-side filesystem path or Git credential.
export async function publishPackage(call, input) {
    const run = await fs.realpath(process.cwd());
    const localPath = async value => {
        if (typeof value !== 'string' || !value || path.isAbsolute(value)) throw new Error('Use paths relative to this run');
        const filename = path.resolve(run,value);
        if (!filename.startsWith(run + path.sep)) throw new Error('Package paths must stay inside this run');
        let current = run;
        for (const part of path.relative(run,filename).split(path.sep)) {
            current = path.join(current,part);
            if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('Package paths must not contain symlinks');
        }
        return filename;
    };
    const readJson = async value => {
        const filename = await localPath(value);
        if ((await fs.stat(filename)).size > 100000) throw new Error('Publication evidence is too large');
        return JSON.parse(await fs.readFile(filename,'utf8'));
    };
    const inventory = await readJson(input.inventory);
    const validation = await readJson(input.validation);
    if (inventory.executionId !== input.executionId || inventory.publicationPermitted !== true || !Array.isArray(inventory.files)) throw new Error('Inventory does not approve this execution');
    const root = await localPath(input.packageRoot);
    const files = inventory.files.map(({path: file,sha256,size}) => ({path:file,sha256,size}));
    for (const entry of files) {
        if (typeof entry.path !== 'string' || entry.path.startsWith('/') || /[\\\0]/.test(entry.path) || entry.path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid inventory path');
        const filename = await localPath(path.relative(run,path.join(root,entry.path)));
        const stat = await fs.stat(filename);
        if (!stat.isFile() || stat.size !== entry.size || stat.size > 50000000) throw new Error('Inventory size mismatch: ' + entry.path);
        if (crypto.createHash('sha256').update(await fs.readFile(filename)).digest('hex') !== entry.sha256) throw new Error('Inventory checksum mismatch: ' + entry.path);
    }
    await call('scriptahub_task_package_prepare',{executionId:input.executionId,catalogue:input.catalogue,branch:input.branch,...(inventory.baseCommit === null ? {} : {baseCommit:inventory.baseCommit}),files,validation});
    for (const entry of files) {
        const filename = await localPath(path.relative(run,path.join(root,entry.path)));
        const handle = await fs.open(filename,constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
            let offset = 0;
            while (offset < entry.size) {
                const buffer = Buffer.alloc(Math.min(65536,entry.size-offset));
                const {bytesRead} = await handle.read(buffer,0,buffer.length,offset);
                if (bytesRead !== buffer.length) throw new Error('Package changed during transfer');
                const result = await call('scriptahub_task_package_upload',{executionId:input.executionId,file:entry.path,offset,data:buffer.toString('base64')});
                if (result.nextOffset !== offset + bytesRead) throw new Error('Invalid package upload acknowledgement');
                offset += bytesRead;
            }
        } finally { await handle.close(); }
    }
    return call('scriptahub_task_publish',{executionId:input.executionId});
}

async function main() {
  let client;
  try {
    const operation = process.argv[2];
    if (process.argv.length !== 3 || (!operations[operation] && !['download', 'choose', 'publish', 'retry-publication', 'preflight', 'handoff', 'verify-package'].includes(operation))) throw new Error('Use preflight, claim, status, download, choose, handoff, verify-package, publish, retry-publication or finish');
    const chunks = [];
    let size = 0;
    for await (const chunk of process.stdin) {
        size += chunk.length;
        if (size > 65536) throw new Error('Task input is too large');
        chunks.push(chunk);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Provide a JSON object');
    if (['preflight','handoff','verify-package'].includes(operation)) {
        const result = operation === 'preflight' ? await preflight() : operation === 'handoff' ? await writeHandoff(input) : await verifyPackage(input);
        process.stdout.write(JSON.stringify(result) + '\n'); return;
    }
    if (operation === 'choose') {
        process.stdout.write(JSON.stringify(chooseRepository(input)) + '\n');
        return;
    }
    if (operation === 'claim') await requirePreflight();
    client = await loadClient();
    const call = async (tool, args) => unwrap(await client.callTool(tool, args, { timeoutMs: tool === 'scriptahub_task_publish' ? 600000 : 90000 }));
    const result = operation === 'download' ? await downloadDocument(call,input)
      : operation === 'publish' ? await publishPackage(call,input)
      : operation === 'retry-publication' ? await call('scriptahub_task_publish',{executionId:input.executionId})
      : await call(operations[operation],input);
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) {
    console.error(error.code === 'ENOENT' ? 'The RoboTeam Ploinky task runtime is unavailable' : error.message);
    process.exitCode = 1;
  } finally { await client?.close(); }
}

if (process.argv[1] && await fs.realpath(process.argv[1]) === await fs.realpath(fileURLToPath(import.meta.url))) await main();
