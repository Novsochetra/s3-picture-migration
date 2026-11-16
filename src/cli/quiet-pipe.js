// Piped into `head`, the pipe closes before the output ends: stop quietly. Only for output
// that is the whole job; a conversion must finish its uploads and report its exit code.
export function stopQuietlyWhenPipeCloses() {
  process.stdout.on('error', (error) => {
    if (error.code !== 'EPIPE') {
      throw error;
    }

    process.exit(0);
  });
}
