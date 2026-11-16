import fs from 'node:fs';
import readline from 'node:readline';

export function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// Written beside the target and renamed over it, so a crash never leaves it half-written.
export function writeJsonAtomic(file, data) {
  const temporary = `${file}.tmp`;

  fs.writeFileSync(temporary, JSON.stringify(data, null, 2));
  fs.renameSync(temporary, file);
}

function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

// A crash can leave a truncated last line, which is skipped.
export async function* readJsonLines(file) {
  if (!fs.existsSync(file)) {
    return;
  }

  const lines = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });

  for await (const line of lines) {
    const entry = line.trim() ? parseLine(line) : null;

    if (entry) {
      yield entry;
    }
  }
}

export function endWithNewline(file) {
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    return;
  }

  const { size } = fs.statSync(file);
  const lastByte = Buffer.alloc(1);
  const fd = fs.openSync(file, 'r');

  fs.readSync(fd, lastByte, 0, 1, size - 1);
  fs.closeSync(fd);

  if (lastByte[0] !== 0x0a) {
    fs.appendFileSync(file, '\n');
  }
}
