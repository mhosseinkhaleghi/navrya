// Guards a create/save action that talks to the server and can be REFUSED (plan limit, validation, network).
// Framework-free so its behaviour is unit-testable; a dialog wires the two setters to its own state.
//
//   - While the action is in flight a second run() is ignored (returns undefined, never calls the action), so a
//     double click - or Voice submitting while the button is held - cannot create two records.
//   - A refusal is handed to setError() (so the dialog can explain it and stay open), the in-flight flag and the
//     submitting state are ALWAYS restored, and the rejection is re-thrown so a programmatic caller (the AI process
//     registry's submit) still sees the real outcome.
//   - isMounted() keeps a late result from touching state after the dialog was unmounted (navigation into the
//     created record unmounts the whole library).
export function createSubmitGuard({ setSubmitting, setError, isMounted = () => true }) {
  let inFlight = false;
  return {
    isBusy: () => inFlight,
    async run(action) {
      if (inFlight) return undefined;
      inFlight = true;
      setSubmitting(true);
      setError(null);
      try {
        return await action();
      } catch (error) {
        if (isMounted()) setError(error || new Error('SUBMIT_FAILED'));
        throw error;
      } finally {
        inFlight = false;
        if (isMounted()) setSubmitting(false);
      }
    }
  };
}
