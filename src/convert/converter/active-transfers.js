// Pressing Ctrl+C twice aborts every transfer registered here while it runs.
export async function whileActive(state, abort, work) {
  const handle = { abort };

  state.active.add(handle);

  try {
    return await work();
  } finally {
    state.active.delete(handle);
  }
}
