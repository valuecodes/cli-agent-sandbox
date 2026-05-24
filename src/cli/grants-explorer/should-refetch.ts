/**
 * Pure decision function for whether to (re-)download the xlsx before
 * loading. Auto-downloads when the local file is missing; otherwise the
 * user must explicitly pass `--refetch` to force a refresh.
 *
 * Lives in its own module so main.test.ts can import it without triggering
 * main.ts's top-level CLI bootstrap.
 */
export const shouldRefetch = ({
  refetch,
  exists,
}: {
  refetch: boolean;
  exists: boolean;
}): boolean => refetch || !exists;
