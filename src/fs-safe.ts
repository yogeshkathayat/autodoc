import { promises as fs } from 'fs';
import path from 'path';

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err: any) {
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }
}

export async function safeReadFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

export async function safeWriteFile(
  filePath: string,
  content: string,
  options?: { overwrite?: boolean }
): Promise<{ written: boolean; existed: boolean }> {
  const overwrite = options?.overwrite ?? true;
  const exists = await fileExists(filePath);

  if (exists && !overwrite) {
    return { written: false, existed: true };
  }

  const dir = path.dirname(filePath);
  await ensureDir(dir);
  await fs.writeFile(filePath, content, 'utf-8');

  return { written: true, existed: exists };
}
