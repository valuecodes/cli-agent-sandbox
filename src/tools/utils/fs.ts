import fs from "node:fs/promises";
import path from "node:path";

const PATH_TRAVERSAL = /(^|[\\/])\.\.([\\/]|$)/;

export const TMP_ROOT = path.resolve(process.cwd(), "tmp");

const isErrno = (
  error: unknown,
  code: string
): error is NodeJS.ErrnoException =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as NodeJS.ErrnoException).code === code;

const isPathInside = (root: string, target: string) => {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
};

const assertNoSymlinkComponents = async (
  root: string,
  target: string,
  options: { allowMissing?: boolean } = {}
) => {
  const allowMissing = options.allowMissing ?? false;
  const relative = path.relative(root, target);
  const segments = relative.split(path.sep).filter(Boolean);
  let current = root;

  // Walk existing path segments to prevent following symlinks during mkdir/write.
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) {
        throw new Error("Symlink paths are not allowed.");
      }
    } catch (error) {
      if (isErrno(error, "ENOENT")) {
        if (allowMissing) {
          return;
        }
        throw new Error("Path does not exist.");
      }
      throw error;
    }
  }
};

const ensureTmpRoot = async (options: { create: boolean }) => {
  if (options.create) {
    await fs.mkdir(TMP_ROOT, { recursive: true });
  }

  let tmpRootStat: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    tmpRootStat = await fs.lstat(TMP_ROOT);
  } catch (error) {
    if (isErrno(error, "ENOENT")) {
      throw new Error("tmp directory does not exist.");
    }
    throw error;
  }

  if (!tmpRootStat.isDirectory()) {
    throw new Error("tmp path is not a directory.");
  }
  if (tmpRootStat.isSymbolicLink()) {
    throw new Error("tmp directory must not be a symlink.");
  }
};

const resolveCandidatePath = (trimmed: string) => {
  const candidatePath = path.isAbsolute(trimmed)
    ? path.normalize(trimmed)
    : path.resolve(TMP_ROOT, trimmed);

  if (candidatePath === TMP_ROOT) {
    throw new Error("Path must point to a file within tmp.");
  }
  if (!isPathInside(TMP_ROOT, candidatePath)) {
    throw new Error("Path must be within the repo tmp directory.");
  }

  return candidatePath;
};

export const resolveTmpPathForWrite = async (userPath: string) => {
  const trimmed = userPath.trim();
  if (!trimmed) {
    throw new Error("Path cannot be empty.");
  }
  if (PATH_TRAVERSAL.test(trimmed)) {
    throw new Error("Path traversal is not allowed.");
  }

  await ensureTmpRoot({ create: true });
  const candidatePath = resolveCandidatePath(trimmed);

  await assertNoSymlinkComponents(TMP_ROOT, candidatePath, {
    allowMissing: true,
  });

  const parentDir = path.dirname(candidatePath);
  await fs.mkdir(parentDir, { recursive: true });
  await assertNoSymlinkComponents(TMP_ROOT, candidatePath, {
    allowMissing: true,
  });

  const tmpRootReal = await fs.realpath(TMP_ROOT);
  const parentReal = await fs.realpath(parentDir);
  if (!isPathInside(tmpRootReal, parentReal)) {
    throw new Error("Resolved path escapes tmp directory.");
  }

  return candidatePath;
};

export const resolveTmpPathForRead = async (userPath: string) => {
  const trimmed = userPath.trim();
  if (!trimmed) {
    throw new Error("Path cannot be empty.");
  }
  if (PATH_TRAVERSAL.test(trimmed)) {
    throw new Error("Path traversal is not allowed.");
  }

  await ensureTmpRoot({ create: false });
  const candidatePath = resolveCandidatePath(trimmed);

  await assertNoSymlinkComponents(TMP_ROOT, candidatePath);

  const tmpRootReal = await fs.realpath(TMP_ROOT);
  const parentReal = await fs.realpath(path.dirname(candidatePath));
  if (!isPathInside(tmpRootReal, parentReal)) {
    throw new Error("Resolved path escapes tmp directory.");
  }

  const fileStat = await fs.lstat(candidatePath);
  if (!fileStat.isFile()) {
    throw new Error("Path must point to a file.");
  }

  return candidatePath;
};

export const resolveTmpPathForAccess = async (userPath: string) => {
  const trimmed = userPath.trim();
  if (!trimmed) {
    throw new Error("Path cannot be empty.");
  }
  if (PATH_TRAVERSAL.test(trimmed)) {
    throw new Error("Path traversal is not allowed.");
  }

  await ensureTmpRoot({ create: false });
  const candidatePath = resolveCandidatePath(trimmed);

  await assertNoSymlinkComponents(TMP_ROOT, candidatePath, {
    allowMissing: true,
  });

  const tmpRootReal = await fs.realpath(TMP_ROOT);
  const parentDir = path.dirname(candidatePath);
  try {
    const parentReal = await fs.realpath(parentDir);
    if (!isPathInside(tmpRootReal, parentReal)) {
      throw new Error("Resolved path escapes tmp directory.");
    }
  } catch (error) {
    if (!isErrno(error, "ENOENT")) {
      throw error;
    }
  }

  return candidatePath;
};

export const resolveTmpPathForDelete = async (userPath: string) => {
  const trimmed = userPath.trim();
  if (!trimmed) {
    throw new Error("Path cannot be empty.");
  }
  if (PATH_TRAVERSAL.test(trimmed)) {
    throw new Error("Path traversal is not allowed.");
  }

  await ensureTmpRoot({ create: false });
  const candidatePath = resolveCandidatePath(trimmed);

  await assertNoSymlinkComponents(TMP_ROOT, candidatePath);

  const tmpRootReal = await fs.realpath(TMP_ROOT);
  const parentReal = await fs.realpath(path.dirname(candidatePath));
  if (!isPathInside(tmpRootReal, parentReal)) {
    throw new Error("Resolved path escapes tmp directory.");
  }

  const fileStat = await fs.lstat(candidatePath);
  if (!fileStat.isFile()) {
    throw new Error("Path must point to a file.");
  }

  return candidatePath;
};

export const resolveTmpPathForList = async (userPath?: string) => {
  const trimmed = (userPath ?? "").trim();

  if (trimmed && PATH_TRAVERSAL.test(trimmed)) {
    throw new Error("Path traversal is not allowed.");
  }

  await ensureTmpRoot({ create: false });

  if (!trimmed) {
    return TMP_ROOT;
  }

  const candidatePath = path.isAbsolute(trimmed)
    ? path.normalize(trimmed)
    : path.resolve(TMP_ROOT, trimmed);

  if (!isPathInside(TMP_ROOT, candidatePath)) {
    throw new Error("Path must be within the repo tmp directory.");
  }

  await assertNoSymlinkComponents(TMP_ROOT, candidatePath);

  const tmpRootReal = await fs.realpath(TMP_ROOT);
  const candidateReal = await fs.realpath(candidatePath);
  if (!isPathInside(tmpRootReal, candidateReal)) {
    throw new Error("Resolved path escapes tmp directory.");
  }

  const stat = await fs.lstat(candidatePath);
  if (!stat.isDirectory()) {
    throw new Error("Path must point to a directory.");
  }

  return candidatePath;
};
