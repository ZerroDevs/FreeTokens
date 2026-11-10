import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { errorMessage } from "../../lib/api";

export type Note = { kind: "ok" | "error"; text: string };

type Feedback = {
  saving: boolean;
  note: Note | null;
  /** Forgets the last answer, for a field the user is editing again. */
  clear: () => void;
  /** Reports a rejected input, where nothing was sent to save. */
  reject: (text: string) => void;
  /**
   * Runs a save and speaks for it: the text the task returns becomes the success note, a throw
   * becomes the error note. Every section shares the one `saving` flag, so a save in one place
   * still disables the rest while it is in flight.
   */
  run: (task: () => Promise<string | null>) => Promise<void>;
};

const Context = createContext<Feedback | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<Note | null>(null);

  const run = useCallback(async (task: () => Promise<string | null>) => {
    setSaving(true);
    setNote(null);
    try {
      const text = await task();
      if (text) setNote({ kind: "ok", text });
    } catch (error) {
      setNote({ kind: "error", text: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }, []);

  const value = useMemo<Feedback>(
    () => ({
      saving,
      note,
      clear: () => setNote(null),
      reject: (text: string) => setNote({ kind: "error", text }),
      run,
    }),
    [saving, note, run],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useFeedback(): Feedback {
  const value = useContext(Context);
  if (!value) throw new Error("useFeedback needs a FeedbackProvider");
  return value;
}
