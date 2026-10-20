import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ULID_RE } from '../../lib/constants.js';
import { parseCommand, expectPositionals, checkChatId } from '../args.js';
import { resolveUrl } from '../config.js';
import { request, rawFetch, enc, expectObject, checkAsset, checkUlid, errorFromResponse, networkError } from '../api.js';
import { CliError, EXIT, invalidResponse, validationError } from '../errors.js';
import { printLine } from '../output.js';

const CMD = 'asset';

async function statOrNull(p) {
  try {
    return await fsp.stat(p);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function run(argv) {
  const { values, positionals } = parseCommand(CMD, argv);
  expectPositionals(CMD, positionals, 2, 2, ['<chatId>', '<assetId>']);
  const chatId = checkChatId(positionals[0]);
  const assetId = positionals[1];
  if (!ULID_RE.test(assetId)) throw validationError(`asset id ${JSON.stringify(assetId)} must be a ULID`);
  const base = resolveUrl(values, CMD);

  const meta = expectObject(
    await request(base, 'GET', `api/chats/${enc(chatId)}/assets/${enc(assetId)}`),
    'GET asset metadata',
  );
  const asset = checkAsset(meta.asset);
  if (asset.id !== assetId) throw invalidResponse(`server returned asset ${asset.id}, expected ${assetId}`);
  const messageId = checkUlid(meta.messageId, 'asset metadata messageId');
  if (typeof meta.available !== 'boolean') throw invalidResponse('asset metadata: "available" must be a boolean');
  if (!meta.available) {
    throw new CliError(EXIT.NOT_FOUND, 'asset_missing', `asset ${asset.id} (${asset.name}) is referenced but its file is not available on the server`);
  }

  let out = path.resolve(values.output ?? asset.name);
  let st = await statOrNull(out);
  if (st && st.isDirectory()) {
    out = path.join(out, asset.name);
    st = await statOrNull(out);
  }
  if (st && !values.force) {
    throw new CliError(EXIT.CONFLICT, 'file_exists', `${out} already exists (use --force to overwrite)`);
  }
  if (st && !st.isFile()) throw validationError(`${out} exists and is not a regular file`);

  const res = await rawFetch(base, `assets/${enc(chatId)}/${enc(asset.file)}`, { timeoutMs: 0 });
  if (!res.ok) throw await errorFromResponse(res, base);

  const part = `${out}.part`;
  let bytes = 0;
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      bytes += chunk.length;
      cb(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(res.body), counter, fs.createWriteStream(part, { flags: 'w' }));
  } catch (err) {
    await fsp.rm(part, { force: true });
    if (err && (err.code === 'EACCES' || err.code === 'ENOENT' || err.code === 'EISDIR' || err.code === 'ENOSPC')) {
      throw validationError(`cannot write ${part}: ${err.message}`);
    }
    throw networkError(base, err);
  }
  if (bytes !== asset.size) {
    await fsp.rm(part, { force: true });
    throw invalidResponse(`downloaded ${bytes} bytes for asset ${asset.id}, expected ${asset.size}`, EXIT.NETWORK);
  }
  await fsp.rename(part, out);

  const { id, file, name, mime, size } = asset;
  printLine({ asset: { id, file, name, mime, size }, messageId, path: out });
  return 0;
}
