// Uses the browser's free Web Speech API - no external TTS service. If
// the browser doesn't support it, the button simply doesn't render, and
// the rest of the session works exactly the same without it.
export function SpeakButton({ text }: { text: string }) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;

  function speak() {
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch {
      // Pronunciation is a nice-to-have - never let it break the session.
    }
  }

  return (
    <button
      type="button"
      onClick={speak}
      aria-label={`Hear "${text}" pronounced`}
      className="inline-flex items-center justify-center h-9 w-9 rounded-full border border-slate-300 text-slate-500 hover:bg-slate-50 shrink-0"
    >
      🔊
    </button>
  );
}
